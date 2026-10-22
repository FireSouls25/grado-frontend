import { writable } from 'svelte/store';
import { api } from '$lib/api/client';
import { clearRefresh, clearToken, getRefresh, getToken, setRefresh, setToken } from '$lib/api/client';
import { ApiError } from '$lib/api/types';

/** Set when a guarded call dies with 401 even after rotation: the login
 *  page shows an expiry notice once, then clears it. */
export const authNotice = writable<'' | 'expired'>('');

let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let inflight: Promise<boolean> | null = null;
let setSession: (v: string) => void = () => {};

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
    if (!rt) return false;
    try {
      const res = await api.post<{
        token: string;
        expiresAt: string;
        refreshToken: string;
        refreshExpiresAt: string;
      }>('/v1/refresh', { refreshToken: rt });
      if (!res.token) return false;
      setToken(res.token);
      setSession(res.token);
      if (res.refreshToken) setRefresh(res.refreshToken);
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
      set('');
    }
  };
}

export const session = createSession();
