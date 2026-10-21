import { writable } from 'svelte/store';
import { clearToken, getToken, setToken } from '$lib/api/client';

/** Authenticated token. Empty means logged out; App gates routes on it. */
function createSession() {
  const { subscribe, set } = writable<string>(getToken());

  return {
    subscribe,
    login(token: string) {
      const trimmed = token.trim();
      if (!trimmed) return false;
      setToken(trimmed);
      set(trimmed);
      return true;
    },
    logout() {
      clearToken();
      set('');
    }
  };
}

export const session = createSession();
