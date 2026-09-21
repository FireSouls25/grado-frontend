import { writable } from 'svelte/store';

export type Theme = 'light' | 'dark' | 'auto';

const STORAGE_KEY = 'grado.theme';

function initial(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'auto') return saved;
  } catch {
    /* storage unavailable (private mode): fall through */
  }
  return 'auto';
}

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  const dark =
    theme === 'dark' ||
    (theme === 'auto' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? '#0e1322' : '#eef1f7');
}

function createTheme() {
  const { subscribe, set } = writable<Theme>(initial(), (setFn) => {
    apply(initial());
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      // Re-apply only in auto mode; the store value stays 'auto'.
      let current: Theme = 'auto';
      const unsub = subscribe((v) => (current = v));
      unsub();
      if (current === 'auto') apply('auto');
    };
    query.addEventListener('change', onChange);
    setFn(initial());
    return () => query.removeEventListener('change', onChange);
  });

  return {
    subscribe,
    set(value: Theme) {
      try {
        localStorage.setItem(STORAGE_KEY, value);
      } catch {
        /* ignore */
      }
      apply(value);
      set(value);
    }
  };
}

export const theme = createTheme();
