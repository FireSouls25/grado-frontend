import { derived, writable } from 'svelte/store';
import { es, type Copy } from './es';

// Single locale today; swapping this import (or a loader) adds languages.
const catalogs = { es } as const;
export type Locale = keyof typeof catalogs;

export const locale = writable<Locale>('es');
export const t: import('svelte/store').Readable<Copy> = derived(
  locale,
  ($locale) => catalogs[$locale]
);
