import { writable } from 'svelte/store';
import { api } from '$lib/api/client';
import { clearRefresh, clearToken, cookieRefresh, getRefresh, getToken, setRefresh, setToken } from '$lib/api/client';
import { ApiError } from '$lib/api/types';
import { profile } from '$lib/shell/profile';

/** Set when a guarded call dies with 401 even after rotation. The login
 *  page shows a notice once, then clears it. 'maintenance' means the
 *  backend build changed since login: the logout came from a deploy. */
export const authNotice = writable<'' | 'expired' | 'maintenance' | 'passwordChanged'>('');

/** Drives the global "session expired" popup: set alongside authNotice,
 *  cleared when the user heads back to login. */
export const sessionExpired = writable(false);

let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let inflight: Promise<boolean> | null = null;
let setSession: (v: string) => void = () => {};

const BUILD_KEY = 'grado.build';

/** Build marker seen at the last login: compared with /healthz when
 *  the session dies to tell a maintenance rotation apart from a
 *  plain expiry. Captured only at login, never refreshed, so a
 *  deploy in between still shows up as a difference. */
export function seenBuild(): string {
  try {
    return localStorage.getItem(BUILD_KEY) ?? '';
  } catch {
    return '';
  }
}

function noteBuild(version: string): void {
  try {
    if (version) localStorage.setItem(BUILD_KEY, version);
  } catch {
    /* ignore */
  }
}

/** Records the running backend build after a successful login.
 *  Best effort: a failed sync simply keeps no marker (plain expiry). */
export async function syncBuild(): Promise<void> {
  try {
    const res = await api.get<{ version?: string }>('/healthz');
    if (res?.version) noteBuild(res.version);
  } catch {
    /* offline or booting: no marker */
  }
}

/** Decides which notice fits a dead session: when the backend build
 *  changed since login, the logout came from a maintenance rotation. */
export async function expiryNotice(): Promise<'expired' | 'maintenance'> {
  const before = seenBuild();
  if (!before) return 'expired';
  try {
    const res = await api.get<{ version?: string }>('/healthz');
    if (res?.version && res.version !== before) return 'maintenance';
  } catch {
    /* unreachable backend reads as plain expiry */
  }
  return 'expired';
}

function clearTimer(): void {
  if (refreshTimer !== null) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

/** Proactive rotation at ~80% of the access lifetime; the reactive
 *  401 path in guarded() is the backstop (closed tabs, throttled timers). */
function scheduleProactive(expiresAt?: string): void {
  clearTimer();
  if (!expiresAt) return;
  const ms = Date.parse(expiresAt) - Date.now();
  if (!Number.isFinite(ms) || ms <= 1000) return;
  refreshTimer = setTimeout(() => {
    void refreshNow();
  }, ms * 0.8);
}

/** Rotates the pair once; concurrent callers share the single flight.
 *  Auth failures (revoked/version/disabled) clear both tokens so the
 *  next step is a fresh login; network failures keep them for retry. */
export async function refreshNow(): Promise<boolean> {
  if (inflight) return inflight;
  inflight = (async () => {
    const rt = getRefresh();
    // En la web la cookie HttpOnly lleva el token: se rota sin copia local.
    if (!rt && !cookieRefresh) return false;
    try {
      const res = await api.post<{
        token: string;
        expiresAt: string;
        refreshToken?: string;
        refreshExpiresAt: string;
      }>('/v1/refresh', rt ? { refreshToken: rt } : {});
      if (!res.token) return false;
      setToken(res.token);
      setSession(res.token);
      if (res.refreshToken) setRefresh(res.refreshToken);
      else clearRefresh();
      scheduleProactive(res.expiresAt);
      return true;
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        clearToken();
        clearRefresh();
        setSession('');
      }
      return false;
    }
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

/** Authenticated access token. Empty means logged out; App gates on it. */
function createSession() {
  const { subscribe, set } = writable<string>(getToken());
  setSession = set;

  // A persisted access token without expiry metadata cannot schedule
  // proactive rotation; the reactive 401 path covers it.
  return {
    subscribe,
    login(access: string, refresh?: string, expiresAt?: string) {
      const trimmed = access.trim();
      if (!trimmed) return false;
      setToken(trimmed);
      set(trimmed);
      if (refresh && refresh.trim()) setRefresh(refresh.trim());
      else clearRefresh();
      authNotice.set('');
      // La ficha es de la sesión anterior hasta probar lo contrario:
      // se olvida aquí y los shells la recargan al montar.
      profile.reset();
      scheduleProactive(expiresAt);
      return true;
    },
    /** Server-side logout (best effort: offline still signs out locally)
     *  then local cleanup. */
    async logout() {
      const rt = getRefresh();
      try {
        await api.post('/v1/logout', rt ? { refreshToken: rt } : {});
      } catch {
        /* ignore: local sign-out wins */
      }
      clearTimer();
      clearToken();
      clearRefresh();
      forgetUserData();
      set('');
      profile.reset();
    }
  };
}

/** Claves locales que pertenecen a quien inició sesión. En un equipo
 *  compartido del colegio, el siguiente usuario no debe heredarlas. El
 *  tema y el borrador de usuario del login son del dispositivo y se quedan. */
const USER_KEYS = ['grado.rollcalls.v1', 'grado.notifDismissed', 'grado.notifSnap'];
const USER_PREFIXES = ['grado.distrib.'];

function forgetUserData(): void {
  try {
    for (const k of USER_KEYS) localStorage.removeItem(k);
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && USER_PREFIXES.some((p) => k.startsWith(p))) localStorage.removeItem(k);
    }
  } catch {
    /* almacenamiento bloqueado: no hay nada que borrar */
  }
}

export const session = createSession();
