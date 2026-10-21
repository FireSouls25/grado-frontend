import { writable } from 'svelte/store';
import { api } from '$lib/api/client';
import { ApiError } from '$lib/api/types';
import type { Me } from '$lib/api/types';

// Profile of the logged-in account: GET /v1/me plus the own teacher
// photo. Fetched on demand when the panel opens, never invented: an
// account without a linked teacher simply shows the account fields.

type ProfileState = 'idle' | 'loading' | 'error' | 'ready';

interface PhotoPayload {
  data: string;
  contentType: string;
}

function createProfile() {
  const { subscribe, update } = writable<{
    state: ProfileState;
    me: Me | null;
    photoUrl: string | null;
    error: unknown;
  }>({ state: 'idle', me: null, photoUrl: null, error: null });

  async function loadPhoto(): Promise<string | null> {
    try {
      const photo = await api.get<PhotoPayload>('/v1/me/photo');
      return `data:${photo.contentType};base64,${photo.data}`;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  }

  return {
    subscribe,

    /** Fetches the account profile (with photo). Safe to call on every
     *  panel open: an already-ready panel still refreshes so a photo
     *  change elsewhere shows up. */
    async refresh() {
      update((s) => ({ ...s, state: 'loading', error: null }));
      try {
        const me = await api.get<Me>('/v1/me');
        let photoUrl: string | null = null;
        try {
          photoUrl = await loadPhoto();
        } catch {
          photoUrl = null;
        }
        update(() => ({ state: 'ready', me, photoUrl, error: null }));
      } catch (err) {
        update((s) => ({ ...s, state: 'error', error: err }));
      }
    },

    /** Stores (or clears, when empty) the own photo: writes through to
     *  the linked teacher profile, or to the account row otherwise. */
    async savePhoto(dataUrl: string) {
      await api.put('/v1/me/photo', { data: dataUrl });
      update((s) => ({ ...s, photoUrl: dataUrl || null }));
    },

    /** Swaps the login password: the current one is verified first, so
     *  a stolen bearer cannot silently take over the account. */
    async changePassword(currentPassword: string, newPassword: string) {
      await api.put('/v1/me/password', { currentPassword, newPassword });
    }
  };
}

export const profile = createProfile();
