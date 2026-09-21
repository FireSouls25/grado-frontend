import { writable } from 'svelte/store';
import { clearSubject, getSubject, setSubject } from '$lib/api/client';

/** Authenticated subject id. Empty means logged out. */
function createSession() {
  const { subscribe, set } = writable<string>(getSubject());

  return {
    subscribe,
    login(id: string) {
      const trimmed = id.trim();
      if (!trimmed) return false;
      setSubject(trimmed);
      set(trimmed);
      return true;
    },
    logout() {
      clearSubject();
      set('');
    }
  };
}

export const session = createSession();
