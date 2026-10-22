import { writable } from 'svelte/store';

/** Throttle cooldown: after a 429 the submit stays disabled with a live
 *  countdown (backend window is one minute). One instance per form. */
export function createCooldown() {
  const { subscribe, set } = writable(0);
  let timer: ReturnType<typeof setInterval> | null = null;

  function stop() {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  return {
    subscribe,
    start(seconds: number) {
      stop();
      let left = seconds;
      set(left);
      timer = setInterval(() => {
        left -= 1;
        if (left <= 0) {
          stop();
          set(0);
        } else {
          set(left);
        }
      }, 1000);
    },
    stop() {
      stop();
      set(0);
    }
  };
}
