import { ApiError } from './types';

const BASE_URL = import.meta.env.VITE_API_URL as string;

const TOKEN_KEY = 'grado.token';
const REFRESH_KEY = 'grado.refresh';

// Requests give up after this long: the server may be unreachable, and a
// pending fetch would leave the page on its skeleton for good.
const REQUEST_TIMEOUT_MS = 15000;

/** Persisted login token (set at login, cleared at sign-out). Empty means
 *  logged out. The backend resolves identity and roles from it. */
export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setToken(token: string): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function clearToken(): void {
  setToken('');
}

/** Web vs app nativa. En la web el refresh token vive solo en la cookie
 *  HttpOnly (el backend ni lo devuelve en JSON), así que ningún script de
 *  la página puede leerlo. Tauri corre en otro sitio (tauri.localhost),
 *  donde esa cookie SameSite no viaja: ahí se guarda la copia local. */
export const cookieRefresh: boolean = (() => {
  if (typeof window === 'undefined') return false;
  const { protocol, hostname } = window.location;
  const tauri = '__TAURI_INTERNALS__' in window || protocol === 'tauri:' || hostname.endsWith('tauri.localhost');
  return !tauri;
})();

/** Rutas que leen o escriben la cookie de sesión. */
const COOKIE_PATHS = ['/v1/login', '/v1/refresh', '/v1/logout'];

/** Rotating refresh token for native clients. In the web it is empty:
 *  the HttpOnly cookie carries it. A copy left by an older web build is
 *  returned once so the first rotation migrates it to the cookie. */
export function getRefresh(): string {
  try {
    return localStorage.getItem(REFRESH_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setRefresh(token: string): void {
  try {
    if (token && !cookieRefresh) localStorage.setItem(REFRESH_KEY, token);
    else localStorage.removeItem(REFRESH_KEY);
  } catch {
    /* ignore */
  }
}

export function clearRefresh(): void {
  setRefresh('');
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  // A hung request is a failure too: without a deadline the skeleton spins
  // forever when the server is up but unreachable.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers,
      // La cookie de sesión solo viaja (y solo se acepta) en las rutas
      // de autenticación; el resto del API va con el bearer.
      credentials: cookieRefresh && COOKIE_PATHS.includes(path) ? 'include' : 'same-origin',
      signal: init.signal ?? controller.signal
    });
  } catch {
    throw new ApiError(0, {
      error: { code: 'http.err_network', message: 'Sin conexión con el servidor.' }
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let body: { error?: { code: string; message: string } } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      /* keep empty body */
    }
    throw new ApiError(res.status, body);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' })
};
