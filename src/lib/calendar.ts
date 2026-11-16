// Ayudantes de calendario escolar compartidos por la ficha del
// estudiante y el historial de llamadas: semanas que empiezan el lunes,
// días como "YYYY-MM-DD" locales y el tipo de día según el año escolar
// (festivo, sin clases, vacaciones entre períodos o fuera del año).
import { calendarDate } from './dates';

export type DayKind = 'school' | 'holiday' | 'noclass' | 'vacation' | 'outside';

export interface YearCalendar {
  StartDate: string;
  EndDate: string;
  Holidays?: string[];
  NoClassDays?: string[];
  PeriodRanges?: { Start: string; End: string }[];
}

const pad = (n: number) => String(n).padStart(2, '0');

export function isoOf(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Día calendario ("YYYY-MM-DD") de un ISO fecha u hora, sin desfase. */
export function dayOf(value: string): string {
  const d = calendarDate(value);
  return d ? isoOf(d) : '';
}

export function mondayOf(d: Date): Date {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const wd = m.getDay();
  m.setDate(m.getDate() - (wd === 0 ? 6 : wd - 1));
  return m;
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export function kindOf(years: YearCalendar[], iso: string): DayKind {
  const y = years.find((x) => dayOf(x.StartDate) <= iso && iso <= dayOf(x.EndDate));
  if (!y) return years.length === 0 ? 'school' : 'outside';
  if ((y.Holidays ?? []).some((h) => dayOf(h) === iso)) return 'holiday';
  if ((y.NoClassDays ?? []).some((h) => dayOf(h) === iso)) return 'noclass';
  const ranges = y.PeriodRanges ?? [];
  if (ranges.length > 0 && !ranges.some((r) => dayOf(r.Start) <= iso && iso <= dayOf(r.End))) return 'vacation';
  return 'school';
}

/** Rótulo de la semana: "23 – 27 nov 2026" o "29 sept – 3 oct 2026". */
export function weekLabel(start: Date, days: number): string {
  const end = addDays(start, days - 1);
  const f = (d: Date, withMonth: boolean) =>
    d.toLocaleDateString('es-CO', withMonth ? { day: 'numeric', month: 'short' } : { day: 'numeric' });
  return `${f(start, end.getMonth() !== start.getMonth())} – ${f(end, true)} ${end.getFullYear()}`;
}

/** Celdas de un mes en cuadrícula lunes a domingo (5 o 6 semanas). */
export function monthCells(first: Date): { date: Date; iso: string; inMonth: boolean }[] {
  const start = mondayOf(first);
  const out: { date: Date; iso: string; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i);
    if (i >= 35 && d.getMonth() !== first.getMonth()) break;
    out.push({ date: d, iso: isoOf(d), inMonth: d.getMonth() === first.getMonth() });
  }
  return out;
}
