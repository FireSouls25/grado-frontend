import { ApiError } from './types';

const BASE_URL = import.meta.env.VITE_API_URL as string;
const DEV_SUBJECT = import.meta.env.VITE_DEV_SUBJECT_ID as string | undefined;

const SUBJECT_KEY = 'grado.subject';

// Requests give up after this long: the server may be unreachable, and a
// pending fetch would leave the page on its skeleton for good.
const REQUEST_TIMEOUT_MS = 15000;

/** Persisted session subject id (set at login, cleared at sign-out). */
export function getSubject(): string {
  try {
    return localStorage.getItem(SUBJECT_KEY) ?? DEV_SUBJECT ?? '';
  } catch {
    return DEV_SUBJECT ?? '';
  }
}

export function setSubject(id: string): void {
  try {
    if (id) localStorage.setItem(SUBJECT_KEY, id);
    else localStorage.removeItem(SUBJECT_KEY);
  } catch {
    /* ignore */
  }
}

export function clearSubject(): void {
  setSubject('');
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  const subject = getSubject();
  if (subject) headers.set('X-Subject-ID', subject);

  // A hung request is a failure too: without a deadline the skeleton spins
  // forever when the server is up but unreachable.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers,
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
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) })
};
