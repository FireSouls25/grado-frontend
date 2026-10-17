// Horario helpers shared by the board and the teacher ficha: school
// window, clock math and the same overlap rule the backend enforces
// (same weekday, intersecting [start, end); touching edges are fine).
// The server stays authoritative (409); this only pre-checks for instant
// feedback in the confirm step.

export const SCHOOL_START_MIN = 7 * 60;
export const SCHOOL_END_MIN = 14 * 60;
export const MIN_DURATION_MIN = 60;
export const STEP_MIN = 30;

export interface Slot {
  Weekday: number;
  Start: number;
  End: number;
}

export function overlaps(a: Slot, b: Slot): boolean {
  return a.Weekday === b.Weekday && a.Start < b.End && b.Start < a.End;
}

/** Minutes since midnight → "HH:MM" for <input type="time"> and labels. */
export function toClock(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** "HH:MM" → minutes since midnight, NaN when malformed. */
export function toMinutes(clock: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(clock.trim());
  if (!m) return NaN;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return NaN;
  return h * 60 + mm;
}

/** Short label "07:00–08:30" for chips and confirm sheets. */
export function rangeLabel(start: number, end: number): string {
  return `${toClock(start)}–${toClock(end)}`;
}

/** Clamp a duration so start+duration stays inside school hours. */
export function clampDuration(startMin: number, wantMin: number): number {
  const max = SCHOOL_END_MIN - startMin;
  return Math.max(MIN_DURATION_MIN, Math.min(wantMin, max));
}

/** Weekday numbers in display order (Mon–Sun) for selects and groupings. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
