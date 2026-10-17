import { writable } from 'svelte/store';
import { auditRecent, listSubjects, subjectAssignments } from '../domains/admin/api';
import { daySchedule } from '../domains/teacher/api';
import { me } from '../domains/teacher/api';
import { guarded } from './nav';

// Centro de avisos P1 (sin backend): combina actividad de la bitácora
// (admin) con diffs de instantáneas propias (docente) y alertas
// derivadas al abrir. Todo nace de endpoints ya existentes; `lastSeen`
// vive en localStorage (un dispositivo). La fase P2 lo moverá a tabla
// con direccionamiento por destinatario.

export interface Notice {
  id: string;
  kind: 'activity' | 'alert';
  title: string;
  body: string;
  href: string | null;
  at: number;
}

const SEEN_KEY = 'grado.notifSeen';
const SNAP_KEY = 'grado.notifSnap';

function loadSeen(): number {
  try {
    return Number(localStorage.getItem(SEEN_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function saveSeen(value: number): void {
  try {
    localStorage.setItem(SEEN_KEY, String(value));
  } catch {
    /* ignore */
  }
}

function loadSnap(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SNAP_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

function saveSnap(snap: Record<string, string>): void {
  try {
    localStorage.setItem(SNAP_KEY, JSON.stringify(snap));
  } catch {
    /* ignore */
  }
}

/** "hace 5 min", "ayer", etc. para las filas del panel. */
export function timeAgo(at: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
  if (seconds < 60) return rtf.format(-seconds, 'second');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return rtf.format(-minutes, 'minute');
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return rtf.format(-hours, 'hour');
  const days = Math.floor(hours / 24);
  if (days < 7) return rtf.format(-days, 'day');
  return new Date(at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
}

export interface NoticeStrings {
  actionLabel: (action: string) => string;
  resourceLabel: (resource: string) => string;
  deniedSuffix: string;
  bareSubjectsTitle: string;
  scheduleChangedTitle: string;
  scheduleChangedBody: (count: number, day: string) => string;
  dayName: (weekday: number) => string;
}

interface EngineState {
  notices: Notice[];
  unread: number;
  loading: boolean;
}

function createEngine() {
  const { subscribe, set, update } = writable<EngineState>({ notices: [], unread: 0, loading: false });
  let timer: ReturnType<typeof setInterval> | null = null;

  function markSeen() {
    saveSeen(Date.now());
    update((s) => ({ ...s, unread: 0 }));
  }

  function pushNotices(items: Notice[]) {
    const seen = loadSeen();
    update((s) => {
      const known = new Map(s.notices.map((n) => [n.id, n]));
      for (const item of items) known.set(item.id, item);
      const notices = [...known.values()].sort((a, b) => b.at - a.at).slice(0, 50);
      return { notices, unread: notices.filter((n) => n.at > seen).length, loading: s.loading };
    });
  }

  async function refreshAdmin(strings: NoticeStrings) {
    const [entries, subjects] = await Promise.all([
      guarded(() => auditRecent(20)),
      guarded(() => listSubjects())
    ]);
    const items: Notice[] = [];
    const now = Date.now();
    for (const e of entries ?? []) {
      const denied = e.Status >= 400;
      items.push({
        id: `audit-${e.ID}`,
        kind: 'activity',
        title: strings.actionLabel(e.Action),
        body: `${strings.resourceLabel(e.Resource)}${denied ? strings.deniedSuffix : ''}`,
        href: '/admin/auditoria',
        at: new Date(e.HappenedAt).getTime() || now
      });
    }
    // Materias sin docente asignado: una pasada paralela barata.
    if (subjects && subjects.length > 0) {
      const timelines = await Promise.all(
        subjects.map(async (s) => ({
          subject: s,
          open: ((await guarded(() => subjectAssignments(s.ID))) ?? []).filter(
            (a) => !a.EndedAt || a.EndedAt.startsWith('0001')
          ).length
        }))
      );
      const bare = timelines.filter((t) => t.open === 0).map((t) => t.subject.Name);
      if (bare.length > 0) {
        items.push({
          id: 'alert-bare-subjects',
          kind: 'alert',
          title: strings.bareSubjectsTitle,
          body: bare.join(', '),
          href: '/admin/materias',
          at: now
        });
      }
    }
    pushNotices(items);
  }

  function snapKey(day: number): string {
    return `teacher-day-${day}`;
  }

  async function refreshTeacher(strings: NoticeStrings) {
    // La identidad del docente la resuelve el servidor (/me/schedule);
    // aquí solo se difiere contra la última instantánea vista.
    const days = [1, 2, 3, 4, 5];
    const settled = await Promise.all(days.map((d) => guarded(() => daySchedule(d))));
    const snap = loadSnap();
    const items: Notice[] = [];
    const now = Date.now();
    let changed = false;
    settled.forEach((classes, i) => {
      if (classes === null) return; // 401/403 ya navegaron; el resto reintenta luego
      const key = snapKey(days[i]);
      const sig = JSON.stringify(
        [...classes]
          .sort((a, b) => a.Start.localeCompare(b.Start))
          .map((c) => `${c.GroupID}|${c.SubjectID}|${c.Start}`)
      );
      if (snap[key] === undefined) {
        snap[key] = sig; // primera vez: línea base, sin aviso
        changed = true;
      } else if (snap[key] !== sig) {
        snap[key] = sig;
        changed = true;
        items.push({
          id: `teacher-diff-${days[i]}-${now}`,
          kind: 'activity',
          title: strings.scheduleChangedTitle,
          body: strings.scheduleChangedBody(classes.length, strings.dayName(days[i])),
          href: '/agenda',
          at: now
        });
      }
    });
    if (changed) saveSnap(snap);
    pushNotices(items);
  }

  let strings: NoticeStrings | null = null;

  async function refresh() {
    update((s) => ({ ...s, loading: true }));
    try {
      const profile = await guarded(() => me());
      if (!profile || !strings) return; // sin sesión: la campana no tiene nada que decir
      if (profile.roles.includes('admin')) await refreshAdmin(strings);
      else if (profile.roles.includes('teacher')) await refreshTeacher(strings);
    } catch {
      /* un refresh fallido no rompe la campana: reintenta en el ciclo */
    } finally {
      update((s) => ({ ...s, loading: false }));
    }
  }

  function start(s: NoticeStrings) {
    strings = s;
    void refresh();
    if (timer) clearInterval(timer);
    timer = setInterval(() => void refresh(), 2 * 60 * 1000);
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  return { subscribe, start, stop, refresh, markSeen };
}

export const notifications = createEngine();

/** Etiquetas de día Lun–Dom para el diff docente. */
export function weekdayName(weekday: number, short: readonly string[], weekend: readonly string[]): string {
  const all = [...short, ...weekend];
  return all[weekday === 0 ? 6 : weekday - 1] ?? '';
}
