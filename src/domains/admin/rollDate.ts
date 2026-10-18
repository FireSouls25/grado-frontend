import { writable } from 'svelte/store';

function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Day the roll screen opens on. History sets it before navigating so
// "Modificar" lands on that day's list.
export const rollDate = writable(todayLocal());

export function resetRollDate() {
  rollDate.set(todayLocal());
}
