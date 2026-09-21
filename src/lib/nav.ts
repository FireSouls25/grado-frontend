import { push } from 'svelte-spa-router';
import { api } from './api/client';
import type { Me } from './api/types';
import { ApiError } from './api/types';
import { readable } from 'svelte/store';

/** Current hash path, reactive. Hash routing needs no server fallback. */
export const path = readable<string>(
  typeof window === 'undefined' ? '/' : window.location.hash.slice(1) || '/',
  (set) => {
    const onChange = () => set(window.location.hash.slice(1) || '/');
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }
);

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

/** Run an API call, routing 401 to login and 403 to back-or-home. */
export async function guarded<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
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
