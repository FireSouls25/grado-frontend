import { push } from 'svelte-spa-router';
import { api } from './api/client';
import type { Me } from './api/types';
import { ApiError } from './api/types';
import { readable } from 'svelte/store';
import { authNotice, refreshNow, session } from '../domains/auth/session';

/** Current hash path, reactive. Hash routing needs no server fallback. */
export const path = readable<string>(
  typeof window === 'undefined' ? '/' : window.location.hash.slice(1) || '/',
  (set) => {
    const onChange = () => set(window.location.hash.slice(1) || '/');
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }
);

/** Log de viaje: cada pantalla visitada se apila para que Atrás vuelva
a donde estuvo la persona, no a un padre fijo. El hashchange lo alimenta
solo (push, enlaces, adelante/atrás del sistema): goBack solo decide.
Entrar o salir del acceso reinicia el log para no volver al login. */
const AUTH_PATHS = ['/', '/login', '/recuperar'];
function isAuthPath(p: string): boolean {
  return AUTH_PATHS.includes(p) || p.startsWith('/recuperar/');
}

let trail: string[] = typeof window === 'undefined' ? ['/'] : [window.location.hash.slice(1) || '/'];
let suppressTrail = false;

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    const p = window.location.hash.slice(1) || '/';
    if (suppressTrail) {
      suppressTrail = false;
      return;
    }
    const prev = trail[trail.length - 1];
    if (prev === p) return;
    if (isAuthPath(p) || isAuthPath(prev)) {
      trail = [p];
      return;
    }
    // Atrás del sistema: recorta en vez de apilar el regreso.
    if (trail.length >= 2 && trail[trail.length - 2] === p) trail.pop();
    else trail.push(p);
  });
}

/** Atrás del log de viaje: vuelve a la pantalla anterior real; si se
aterrizó directo (sin anterior), usa el historial del sistema y en
último caso va al repliegue dado. */
export function goBack(fallback = '/') {
  if (trail.length >= 2) {
    trail.pop();
    const prev = trail[trail.length - 1];
    suppressTrail = true;
    push(prev);
    return;
  }
  if (typeof window !== 'undefined' && window.history.length > 1) {
    window.history.back();
    return;
  }
  push(fallback);
}

/** Frontend side of the backend denial contract: on 403 go back, else home. */
export async function backOrHome(): Promise<void> {
  if (window.history.length > 1) {
    window.history.back();
    return;
  }
  try {
    const me = await api.get<Me>('/v1/me');
    push(me.home || '/');
  } catch {
    push('/');
  }
}

/** Lee un query param del hash (?clave=valor). El router no siempre
 *  entrega `querystring` como prop, así que se lee del hash directamente:
 *  mismo patrón que ya usa Nuevo llamado para pre-seleccionar. */
export function queryParam(prop: string, key: string): string {
  try {
    const qs = prop || window.location.hash.split('?')[1] || '';
    return new URLSearchParams(qs).get(key) ?? '';
  } catch {
    return '';
  }
}

/** Run an API call: on 401 rotate once and retry; when the session is
 *  really dead (revoked, disabled, rotated elsewhere) sign out locally,
 *  flag the expiry notice and land on login. 403 keeps back-or-home. */
export async function guarded<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      try {
        if (await refreshNow()) return await fn();
      } catch {
        /* rotation failed: fall through to sign-out */
      }
      await session.logout();
      authNotice.set('expired');
      push('/login');
      return null;
    }
    if (err instanceof ApiError && err.status === 403) {
      await backOrHome();
      return null;
    }
    throw err;
  }
}
