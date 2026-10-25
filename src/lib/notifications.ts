import { writable } from 'svelte/store';
import {
  auditRecent,
  dashboardSummary,
  listSubjects,
  subjectAssignments
} from '../domains/admin/api';
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
  /** Huella del contenido: si no cambia, un aviso descartado no revive. */
  sig: string;
}

const DISMISS_KEY = 'grado.notifDismissed';
const SNAP_KEY = 'grado.notifSnap';

function loadDismissed(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(DISMISS_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

function saveDismissed(dismissed: Record<string, string>): void {
  try {
    const keys = Object.keys(dismissed).slice(-100);
    const trimmed: Record<string, string> = {};
    for (const k of keys) trimmed[k] = dismissed[k];
    localStorage.setItem(DISMISS_KEY, JSON.stringify(trimmed));
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
  riskTitle: (name: string) => string;
  riskBody: (missed: number, sessions: number, pct: number) => string;
  deniedTitle: string;
  deniedBody: (action: string, resource: string, status: number) => string;
  bareSubjectsTitle: string;
  bareSubjectsBody: (count: number, names: string) => string;
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
    update((s) => {
      const dismissed = loadDismissed();
      for (const n of s.notices) dismissed[n.id] = n.sig;
      saveDismissed(dismissed);
      return { notices: [], unread: 0, loading: s.loading };
    });
  }

  function pushNotices(items: Notice[]) {
    const dismissed = loadDismissed();
    update((s) => {
      const known = new Map(s.notices.map((n) => [n.id, n]));
      for (const item of items) {
        // Un aviso descartado solo revive si su contenido cambio
        // (misma alerta, situacion nueva) o si es un evento nuevo.
        if (dismissed[item.id] === item.sig) continue;
        delete dismissed[item.id];
        const prev = known.get(item.id);
        known.set(item.id, prev && prev.sig === item.sig ? { ...item, at: prev.at } : item);
      }
      saveDismissed(dismissed);
      const notices = [...known.values()].sort((a, b) => b.at - a.at).slice(0, 50);
      return { notices, unread: notices.length, loading: s.loading };
    });
  }

  // Solo lo que requiere atención directa: cambios denegados (sin
  // permiso o periodo cerrado), estudiantes en faltas críticas y
  // materias sin docente. La actividad rutinaria (actualizaciones
  // exitosas) vive en la bitácora, no en la campana.
  async function refreshAdmin(strings: NoticeStrings) {
    const year = new Date().getFullYear();
    const [entries, subjects, summary] = await Promise.all([
      guarded(() => auditRecent(20)),
      guarded(() => listSubjects()),
      guarded(() => dashboardSummary(year))
    ]);
    const items: Notice[] = [];
    const now = Date.now();
    for (const e of entries ?? []) {
      if (e.Status < 400) continue;
      items.push({
        id: `audit-${e.ID}`,
        kind: 'alert',
        title: strings.deniedTitle,
        body: strings.deniedBody(
          strings.actionLabel(e.Action),
          strings.resourceLabel(e.Resource),
          e.Status
        ),
        href: null,
        at: new Date(e.HappenedAt).getTime() || now,
        sig: String(e.ID)
      });
    }
    for (const r of summary?.TopRisk ?? []) {
      if (r.Sessions < 5) continue;
      const missed = r.Sessions - r.Presences;
      if (missed < 0 || missed / r.Sessions < 0.15) continue;
      const pct = Math.round((r.Presences / r.Sessions) * 100);
      const name = `${r.Surnames} ${r.Names}`.trim();
      items.push({
        id: `risk-${r.StudentID}`,
        kind: 'alert',
        title: strings.riskTitle(name),
        body: strings.riskBody(missed, r.Sessions, pct),
        href: `/admin/estudiantes/${encodeURIComponent(r.StudentID)}/resumen`,
        at: now,
        sig: `${r.Sessions}-${r.Presences}`
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
          body: strings.bareSubjectsBody(bare.length, bare.join(', ')),
          href: '/admin/horario',
          at: now,
          sig: bare.join('|')
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
          at: now,
          sig
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
      if (profile.roles.includes('admin') || profile.roles.includes('secretary')) await refreshAdmin(strings);
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
