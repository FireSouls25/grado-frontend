import { writable } from 'svelte/store';

// Aviso global de éxito: cualquier pantalla llama notify() y el aviso
// aparece donde el shell lo hospede, se va solo y trae X para adelantarlo.
// Solo éxitos: los errores se quedan fijos junto a su formulario.
export const notice = writable('');

let timer: ReturnType<typeof setTimeout> | null = null;

export function notify(message: string, durationMs = 4000) {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  notice.set(message);
  if (message) {
    timer = setTimeout(() => {
      notice.set('');
      timer = null;
    }, durationMs);
  }
}

export function dismissNotice() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  notice.set('');
}
