// Guardia de rutas: decide ANTES de crear la página si la persona puede
// entrar. Así una pantalla de admin no llega ni a montarse para un
// docente (no hay parpadeo ni peticiones). La API sigue siendo la que
// autoriza de verdad; esto es la cara visible del mismo contrato.
//
// Reglas:
//   - Sin sesión → login, recordando a dónde quería ir (?next=).
//   - Con sesión y sin permiso → su propio inicio, con un aviso.
//   - Un salón que no es suyo lo resuelve la página (403 del API →
//     vuelve a su agenda), porque solo el backend sabe qué salones dicta.
import { get } from 'svelte/store';
import { profile } from '$lib/shell/profile';
import { session } from '../domains/auth/session';
import type { Me } from '$lib/api/types';

export type Area = 'public' | 'any' | 'admin' | 'teacher' | 'student';

const PUBLIC = ['/', '/login', '/recuperar'];

/** Área de una ruta (hash sin el `#`, con o sin query). */
export function areaOf(path: string): Area {
  const p = path.split('?')[0] || '/';
  if (PUBLIC.includes(p) || p.startsWith('/recuperar/')) return 'public';
  if (p === '/admin' || p.startsWith('/admin/')) return 'admin';
  if (p === '/estudiante') return 'student';
  if (['/ajustes', '/ayuda', '/perfil'].includes(p)) return 'any';
  return 'teacher';
}

const hasRole = (me: Me, ...names: string[]) => names.some((n) => me.roles?.includes(n));

/** Quién entra a cada área. Directivos pueden abrir un salón (la API se
 *  lo permite); un docente nunca entra a la consola de admin. */
export function canEnter(area: Area, me: Me | null): boolean {
  if (area === 'public') return true;
  if (!me) return false;
  switch (area) {
    case 'any':
      return true;
    case 'admin':
      return hasRole(me, 'admin', 'owner', 'secretary');
    case 'teacher':
      return hasRole(me, 'teacher', 'admin', 'owner');
    case 'student':
      return hasRole(me, 'student');
  }
}

/** Perfil actual, esperando la carga en curso si la hay. */
export async function currentMe(): Promise<Me | null> {
  if (!get(session)) return null;
  const p = get(profile);
  if (p.state === 'ready' && p.me) return p.me;
  if (p.state !== 'loading') await profile.refresh();
  else
    await new Promise<void>((resolve) => {
      const stop = profile.subscribe((s) => {
        if (s.state !== 'loading') {
          queueMicrotask(() => stop());
          resolve();
        }
      });
    });
  return get(profile).me;
}

/** Condición para `wrap({ conditions })` del router. */
export function guard(area: Area) {
  return async (): Promise<boolean> => canEnter(area, await currentMe());
}

/** `next` seguro para volver tras el login: solo rutas internas. */
export function safeNext(raw: string): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '';
  return areaOf(raw) === 'public' ? '' : raw;
}
