<script lang="ts">
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { t } from '$lib/i18n';
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import AdminShell from './AdminShell.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ErrorState from '$lib/ui/ErrorState.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import Chart from '$lib/ui/Chart.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { cssVar } from '$lib/ui/cssvar';
  import { theme, type Theme } from '$lib/theme/theme';
  import { ApiError } from '$lib/api/types';
  import { guarded } from '$lib/nav';
  import { profile } from '$lib/shell/profile';
  import { canManageUsers } from '$lib/access';
  import { mapSettled } from '$lib/async';
  import { isMissing } from '../teacher/api';
  import {
    teachers,
    groupsByYear,
    classReport,
    dashboardSummary,
    warningsRecent,
    listAcademicAlerts,
    reviewAcademicAlert,
    studentProfile,
    teacherHistory,
    scheduleEntries,
    listSubjects,
    subjectAssignments,
    statisticsOverview,
    type TeacherSummary,
    type YearGroup,
    type RecentWarning,
    type AcademicAlert,
    type DashboardSummary,
    type YearOverview
  } from './api';
  import { notify } from '$lib/ui/notice';
  import Dropdown from '$lib/ui/Dropdown.svelte';
  import { exportYearWorkbook, type PeriodExport } from './excel';
  $: roles = $profile.me?.roles ?? [];

  type Sev = 'leve' | 'medio' | 'grave';

  interface RiskRow {
    id: string;
    name: string;
    presences: number;
    absences: number;
    excused: number;
    evasions: number;
    lates: number;
    sessions: number;
    rate: number;
  }

  interface Task {
    id: string;
    sev: Sev;
    title: string;
    meta: string;
    href: string | null;
    actionLabel: string | null;
    call: string | null;
    reviewId: string | null;
    done: boolean;
  }

  const RATE_FLOOR = 85;
  const RATE_MIN_DAYS = 4;

  const currentYear = new Date().getFullYear();
  let year = currentYear;

  let state: 'loading' | 'error' | 'ready' = 'loading';
  let loadError: unknown = null;
  let teacherList: TeacherSummary[] = [];
  let teachersKnown = false;
  let groups: YearGroup[] = [];
  let groupsKnown = false;
  let totals = { presences: 0, absences: 0, excused: 0, evasions: 0, lates: 0, sessions: 0 };
  let reportsKnown = false;
  let reportCount = 0;
  let salonRates: { label: string; rate: number }[] = [];
  let salonTotals: {
    gid: string;
    label: string;
    presences: number;
    absences: number;
    excused: number;
    evasions: number;
    lates: number;
    sessions: number;
  }[] = [];
  let donutScope = '';
  let period = 0;
  let overview: YearOverview | null = null;
  let overviewKnown = false;
  let weekTotals = { presences: 0, absences: 0, excused: 0, evasions: 0, lates: 0 };
  let weekKnown = false;
  let teacherMonth = { present: 0, absent: 0, late: 0, known: false };
  let unassignedTeachers: { id: string; name: string }[] = [];
  let bareSubjectNames: string[] = [];
  let salonsNoDirector: { gid: string; label: string }[] = [];
  let guardianPhones: Record<string, string> = {};
  let openAlerts: AcademicAlert[] = [];
  let todayClasses: {
    gid: string;
    label: string;
    subject: string;
    teacher: string;
    start: number;
    end: number;
  }[] = [];
  let todayKnown = false;
  let todayCatalog: { ID: string; Name: string }[] = [];
  let risk: RiskRow[] = [];
  let warnings: RecentWarning[] = [];
  let summary: DashboardSummary | null = null;

  let search = '';
  let searchEl: HTMLInputElement | null = null;
  let tasks: Task[] = [];

  const initials = (name: string) =>
    name
      .split(/[,\s]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();

  function weekdayOf(date: Date): number {
    return (date.getDay() + 6) % 7;
  }

  $: todayIndex = weekdayOf(new Date());
  $: consoleTitle = (() => {
    const s = new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  })();

  async function load() {
    state = 'loading';
    loadError = null;
    try {
      const [teacherData, groupData] = await Promise.all([
        guarded(() => teachers()),
        guarded(() => groupsByYear(year))
      ]);
      if (teacherData === null || groupData === null) {
        teacherList = [];
        teachersKnown = true;
        groups = [];
        groupsKnown = true;
        await loadReports();
        state = 'ready';
        return;
      }
      teacherList = [...teacherData];
      teachersKnown = true;
      try {
        groups = [...groupData].sort((a, b) => a.Grade - b.Grade || a.GroupNo - b.GroupNo);
        groupsKnown = true;
      } catch (err) {
        if (err instanceof ApiError && isMissing(err)) {
          groups = [];
          groupsKnown = true;
        } else {
          throw err;
        }
      }
      await loadReports();
      state = 'ready';
    } catch (err) {
      if (err instanceof ApiError && isMissing(err)) {
        teacherList = [];
        teachersKnown = true;
        groups = [];
        groupsKnown = true;
        await loadReports();
        state = 'ready';
        return;
      }
      loadError = err;
      state = 'error';
    }
  }

  async function loadReports() {
    totals = { presences: 0, absences: 0, excused: 0, evasions: 0, lates: 0, sessions: 0 };
    salonRates = [];
    salonTotals = [];
    donutScope = '';
    overview = null;
    overviewKnown = false;
    weekKnown = false;
    risk = [];
    reportCount = 0;
    reportsKnown = false;
    const byStudent = new Map<
      string,
      { names: string; surnames: string; presences: number; absences: number; excused: number; evasions: number; lates: number; sessions: number }
    >();
    const labelOf = new Map(groups.map((g) => [g.GroupID, g.ClassLabel]));
    const settled = await mapSettled(groups, 5, (g) => classReport(g.GroupID));
    settled.forEach((result) => {
      if (result.status !== 'fulfilled') return;
      const report = result.value;
      if (!report) return;
      reportCount += 1;
      salonTotals.push({
        gid: report.ClassGroupID,
        label: labelOf.get(report.ClassGroupID) ?? '',
        presences: report.Totals.Presences,
        absences: report.Totals.Absences,
        excused: report.Totals.Excused,
        evasions: report.Totals.Evasions,
        lates: report.Totals.Lates,
        sessions: report.Sessions
      });
      totals.sessions += report.Sessions;
      totals.presences += report.Totals.Presences;
      totals.absences += report.Totals.Absences;
      totals.excused += report.Totals.Excused;
      totals.evasions += report.Totals.Evasions;
      totals.lates += report.Totals.Lates;
      const label = labelOf.get(report.ClassGroupID) ?? '';
      const sessions = report.Students.length > 0 ? report.Sessions : 0;
      if (label && sessions > 0) {
        const presences = report.Students.reduce((n, s) => n + s.Presences, 0);
        const calls = report.Students.reduce((n, s) => n + s.Sessions, 0);
        salonRates.push({
          label,
          rate: calls > 0 ? Math.round((presences / calls) * 100) : 0
        });
      }
      for (const s of report.Students) {
        const prev = byStudent.get(s.StudentID) ?? {
          names: s.Names,
          surnames: s.Surnames,
          presences: 0,
          absences: 0,
          excused: 0,
          evasions: 0,
          lates: 0,
          sessions: 0
        };
        prev.presences += s.Presences;
        prev.absences += s.Absences;
        prev.excused += s.Excused;
        prev.evasions += s.Evasions;
        prev.lates += s.Lates;
        prev.sessions += s.Sessions;
        byStudent.set(s.StudentID, prev);
      }
    });
    reportsKnown = true;
    salonRates.sort((a, b) => a.rate - b.rate);
    salonTotals = [...salonTotals];
    salonRates = [...salonRates];
    totals = { ...totals };
    risk = [...byStudent.entries()]
      .map(([id, s]) => ({
        id,
        name: `${s.surnames}, ${s.names}`.trim().replace(/^,/, '').trim() || id,
        presences: s.presences,
        absences: s.absences,
        excused: s.excused,
        evasions: s.evasions,
        lates: s.lates,
        sessions: s.sessions,
        rate: s.sessions > 0 ? Math.round((s.presences / s.sessions) * 100) : 0
      }))
      .filter((r) => r.sessions > 0 && ((r.sessions >= RATE_MIN_DAYS && r.rate < RATE_FLOOR) || r.absences + r.evasions >= 3))
      .sort((a, b) => a.rate - b.rate);
    await loadSecondary();
    await loadTeacherExtras();
    await loadToday();
    buildTasks();
  }

  const clock = (n: number) => {
    const mins = n % 60;
    return `${Math.floor(n / 60)}:${mins < 10 ? '0' + mins : mins}`;
  };

  async function loadToday() {
    todayClasses = [];
    todayKnown = false;
    try {
      const wd = ((new Date().getDay() + 6) % 7) + 1;
      const [entries, subs] = await Promise.all([
        guarded(() => scheduleEntries({ weekday: wd })),
        guarded(() => listSubjects())
      ]);
      todayCatalog = subs ?? [];
      const labelOf = new Map(groups.map((g) => [g.GroupID, g.ClassLabel]));
      const nameOf = new Map(teacherList.map((x) => [x.ID, `${x.Surnames} ${x.Names}`.trim()]));
      const subName = new Map(todayCatalog.map((s) => [s.ID, s.Name]));
      todayClasses = (entries ?? [])
        .slice()
        .sort((a, b) => a.Start - b.Start)
        .map((e) => ({
          gid: e.ClassGroupID,
          label: labelOf.get(e.ClassGroupID) ?? e.ClassGroupID.slice(0, 8),
          subject: subName.get(e.SubjectID) ?? '',
          teacher: nameOf.get(e.TeacherID) ?? '',
          start: e.Start,
          end: e.End
        }));
    } catch {
      todayClasses = [];
    } finally {
      todayKnown = true;
    }
  }

  async function reviewAlert(id: string) {
    try {
      await reviewAcademicAlert(id);
      tasks = tasks.filter((x) => x.id !== `alerta-${id}`);
      openAlerts = openAlerts.filter((a) => a.ID !== id);
      notify($t.academicAlert.reviewedOk);
    } catch (err) {
      notify(err instanceof ApiError ? err.message : $t.common.loadError);
    }
  }

  async function loadTeacherExtras() {
    teacherMonth = { present: 0, absent: 0, late: 0, known: false };
    unassignedTeachers = [];
    bareSubjectNames = [];
    guardianPhones = {};
    const directed = new Set(teacherList.map((x) => x.HomeroomClassID).filter(Boolean));
    salonsNoDirector = groups
      .filter((g) => !directed.has(g.ClassLabel))
      .map((g) => ({ gid: g.GroupID, label: g.ClassLabel }));
    const now = new Date();
    const fmtTwo = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    const from = `${now.getFullYear()}-${fmtTwo(now.getMonth() + 1)}-01`;
    const to = `${now.getFullYear()}-${fmtTwo(now.getMonth() + 1)}-${fmtTwo(now.getDate())}`;
    const [hist, sched] = await Promise.all([
      mapSettled(teacherList, 4, (x) => teacherHistory(x.ID, from, to)),
      mapSettled(teacherList, 4, (x) => scheduleEntries({ teacherID: x.ID }))
    ]);
    const present = { n: 0 };
    const absent = { n: 0 };
    const late = { n: 0 };
    hist.forEach((result) => {
      if (result.status !== 'fulfilled' || !result.value?.Summary) return;
      present.n += result.value.Summary.Present;
      absent.n += result.value.Summary.Absent;
      late.n += result.value.Summary.Late;
    });
    teacherMonth = { present: present.n, absent: absent.n, late: late.n, known: teacherList.length > 0 };
    sched.forEach((result, i) => {
      if (result.status !== 'fulfilled') return;
      if ((result.value ?? []).length === 0) {
        const x = teacherList[i];
        if (x && x.Active) unassignedTeachers.push({ id: x.ID, name: `${x.Surnames} ${x.Names}`.trim() });
      }
    });
    unassignedTeachers = [...unassignedTeachers];
    try {
      const subs = (await guarded(() => listSubjects())) ?? [];
      const settled = await mapSettled(subs, 4, (s) => subjectAssignments(s.ID));
      settled.forEach((result, i) => {
        if (result.status !== 'fulfilled') return;
        const open = (result.value ?? []).filter((a) => !a.EndedAt || a.EndedAt.startsWith('0001')).length;
        if (open === 0 && subs[i]) bareSubjectNames.push(subs[i].Name);
      });
    } catch {
      bareSubjectNames = [];
    }
    try {
      const settled = await mapSettled(risk.slice(0, 5), 4, (r) => studentProfile(r.id));
      const phones: Record<string, string> = {};
      settled.forEach((result, i) => {
        if (result.status !== 'fulfilled' || !result.value) return;
        const p = result.value;
        const phone = p.Caregiver?.Phone || p.Mother?.Phone || p.Father?.Phone || '';
        if (phone && risk[i]) phones[risk[i].id] = phone;
      });
      guardianPhones = phones;
    } catch {
      guardianPhones = {};
    }
    try {
      openAlerts = (await guarded(() => listAcademicAlerts())) ?? [];
    } catch {
      openAlerts = [];
    }
  }

  async function loadSecondary() {
    try {
      const data = await dashboardSummary(year);
      summary = data ?? null;
      if (summary) {
        const m = summary.MarksLast7d;
        weekTotals = {
          presences: m.Presences,
          absences: m.Absences,
          excused: m.Excused,
          evasions: m.Evasions,
          lates: m.Lates
        };
        weekKnown = m.Presences + m.Absences + m.Excused + m.Evasions + m.Lates > 0;
      }
    } catch {
      summary = null;
    }
    try {
      warnings = (await warningsRecent(20)) ?? [];
    } catch {
      warnings = [];
    }
    await loadOverview();
  }

  $: periodOptions = [
    { value: '0', label: $t.admin.periodAll },
    ...(overview?.Periods ?? []).map((x) => ({
      value: String(x.N),
      label: $t.admin.periodOption(x.N, shortDay(x.Start), shortDay(x.End))
    }))
  ];

  function shortDay(iso: string): string {
    const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
  }

  function dayChip(iso: string): string {
    const d = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(d.getTime())) return iso;
    const s = d.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' });
    return s.replace(/\.\s*/g, ' ').trim();
  }

  $: periodCaps = (() => {
    if (period === 0) return $t.admin.periodAll;
    const x = overview?.Periods.find((p) => p.N === period);
    return x ? `${shortDay(x.Start)} – ${shortDay(x.End)}` : `${$t.admin.periodWord} ${period}`;
  })();

  async function changePeriod(n: number) {
    if (!Number.isInteger(n) || n < 0) return;
    period = n;
    donutScope = '';
    await loadOverview();
  }

  let exporting = false;

  async function exportYear() {
    if (exporting) return;
    exporting = true;
    try {
      const all = await guarded(() => statisticsOverview(year, 0));
      if (!all) return;
      const periods: PeriodExport[] = [];
      for (const x of all.Periods) {
        const one = await guarded(() => statisticsOverview(year, x.N));
        if (!one) continue;
        periods.push({
          n: x.N,
          start: shortDay(x.Start),
          end: shortDay(x.End),
          days: one.Days.length,
          marks: one.Marks,
          warnings: one.Warnings,
          salons: one.Salons
        });
      }
      if (periods.length === 0) {
        periods.push({
          n: 0,
          start: '',
          end: '',
          days: all.Days.length,
          marks: all.Marks,
          warnings: all.Warnings,
          salons: all.Salons
        });
      }
      await exportYearWorkbook(`grado-ano-${year}.xlsx`, year, periods, {
        summaryTitle: $t.admin.exportYearTitle(year),
        yearLabel: $t.admin.yearLabel,
        periodLabel: $t.admin.periodWord,
        rangeLabel: $t.admin.exportRange,
        daysLabel: $t.admin.daysCalled,
        attendanceLabel: $t.admin.exportAttendance,
        warningsLabel: $t.admin.warningsTitle,
        mildLabel: $t.roster.warnGravityMild,
        moderateLabel: $t.roster.warnGravityModerate,
        severeLabel: $t.roster.warnGravitySevere,
        salonLabel: $t.admin.exportSalon,
        totalLabel: $t.admin.exportTotal
      });
      notify($t.admin.exportedOk);
    } finally {
      exporting = false;
    }
  }

  async function loadOverview() {
    overviewKnown = false;
    try {
      overview = (await guarded(() => statisticsOverview(year, period))) ?? null;
    } catch {
      overview = null;
    } finally {
      overviewKnown = true;
      donutScope = '';
    }
  }

  function buildTasks() {
    const next: Task[] = [];
    for (const row of risk.slice(0, 5)) {
      const grave = row.rate < 75 || row.evasions >= 2;
      next.push({
        id: `riesgo-${row.id}`,
        sev: grave ? 'grave' : 'medio',
        title: `${$t.admin.reviewAction}: ${row.name}`,
        meta: `${row.rate}% · ${row.absences} ${$t.admin.colAbsences} · ${row.evasions} ${$t.admin.colEvasions}`,
        href: `/admin/estudiantes/${encodeURIComponent(row.id)}/resumen`,
        actionLabel: $t.admin.openSummary,
        call: guardianPhones[row.id] ?? null,
        reviewId: null,
        done: false
      });
    }
    for (const teacher of teacherList.filter((x) => !x.Active)) {
      next.push({
        id: `inactivo-${teacher.ID}`,
        sev: 'medio',
        title: `${teacher.Surnames} ${teacher.Names}`.trim(),
        meta: $t.admin.inactive,
        href: `/admin/docentes/${encodeURIComponent(teacher.ID)}`,
        actionLabel: $t.admin.reviewAction,
        call: null,
        reviewId: null,
        done: false
      });
    }
    const staffManage = canManageUsers(roles);
    for (const g of salonsNoDirector) {
      next.push({
        id: `nodir-${g.gid}`,
        sev: 'medio',
        title: $t.admin.noDirectorTask(g.label),
        meta: $t.admin.noDirectorMeta,
        href: staffManage ? '/admin/docentes' : null,
        actionLabel: staffManage ? $t.admin.assignDirectionLine : null,
        call: null,
        reviewId: null,
        done: false
      });
    }
    for (const x of unassignedTeachers) {
      next.push({
        id: `sinasig-${x.id}`,
        sev: 'leve',
        title: $t.admin.unassignedTeacherTask(x.name),
        meta: $t.admin.unassignedTeacherMeta,
        href: '/admin/horario',
        actionLabel: $t.admin.goSchedule,
        call: null,
        reviewId: null,
        done: false
      });
    }
    for (const name of bareSubjectNames) {
      next.push({
        id: `sinmat-${name}`,
        sev: 'medio',
        title: $t.admin.bareSubjectTask(name),
        meta: $t.admin.bareSubjectMeta,
        href: '/admin/horario',
        actionLabel: $t.admin.goSchedule,
        call: null,
        reviewId: null,
        done: false
      });
    }
    const staffReview = canManageUsers($profile.me?.roles ?? []);
    for (const a of openAlerts) {
      next.push({
        id: `alerta-${a.ID}`,
        sev: 'grave',
        title: `${$t.academicAlert.title}: ${a.StudentName || a.StudentID.slice(0, 8)}`,
        meta: a.Reason,
        href: `/admin/estudiantes/${encodeURIComponent(a.StudentID)}/resumen`,
        actionLabel: staffReview ? null : $t.admin.openSummary,
        call: null,
        reviewId: staffReview ? a.ID : null,
        done: false
      });
    }
    tasks = next;
  }

  function changeYear(delta: number) {
    year += delta;
    load();
  }

  function scrollToLedger() {
    document.getElementById('riesgo')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  onMount(() => {
    load();
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        e.key === '/' &&
        target &&
        target.tagName !== 'INPUT' &&
        target.tagName !== 'TEXTAREA' &&
        !target.isContentEditable
      ) {
        e.preventDefault();
        searchEl?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  $: q = search.trim().toLowerCase();
  $: visibleRisk = risk.filter((r) => (q ? r.name.toLowerCase().includes(q) : true));
  $: openTasks = tasks.filter((t) => !t.done).length;

  $: scopeOptions = [
    { value: '', label: $t.admin.donutGlobal },
    ...(overview?.Salons ?? []).map((s) => ({ value: s.Label, label: s.Label }))
  ];
  $: scopedTotals = (() => {
    const marks = overview?.Marks;
    if (!donutScope) {
      return marks
        ? { presences: marks.Presences, absences: marks.Absences, excused: marks.Excused, evasions: marks.Evasions, lates: marks.Lates }
        : { presences: 0, absences: 0, excused: 0, evasions: 0, lates: 0 };
    }
    const s = overview?.Salons.find((x) => x.Label === donutScope);
    return s
      ? { presences: s.Presences, absences: s.Absences, excused: s.Excused, evasions: s.Evasions, lates: s.Lates }
      : { presences: 0, absences: 0, excused: 0, evasions: 0, lates: 0 };
  })();
  $: donutTotals = scopedTotals;
  $: marksTotal = donutTotals.presences + donutTotals.absences + donutTotals.excused + donutTotals.evasions + donutTotals.lates;
  $: hasDonut = marksTotal > 0;
  $: donutRate = hasDonut ? Math.round((donutTotals.presences / marksTotal) * 100) : 0;

  $: overviewWarnings = overview?.Warnings;
  $: gravityCounts = overviewWarnings
    ? [overviewWarnings.Mild, overviewWarnings.Moderate, overviewWarnings.Severe]
    : summary
      ? [summary.WarningsLast7d.Mild, summary.WarningsLast7d.Moderate, summary.WarningsLast7d.Severe]
      : [
          warnings.filter((w) => w.Gravity === 'mild').length,
          warnings.filter((w) => w.Gravity === 'moderate').length,
          warnings.filter((w) => w.Gravity === 'severe').length
        ];
  $: warningsKnown = overviewKnown ? true : summary ? true : warnings.length > 0;
  $: totalWarnings = gravityCounts[0] + gravityCounts[1] + gravityCounts[2];
  $: hasGravity = totalWarnings > 0;

  $: donut = makeDonut($theme, donutTotals, hasDonut);
  $: gravityBars = makeGravityBars($theme, gravityCounts, hasGravity);
  $: overviewRates = (overview?.Salons ?? []).map((s) => ({ label: s.Label, rate: s.Rate }));
  $: salonBars = makeSalonBars($theme, overviewKnown ? overviewRates : salonRates);
  $: hasSalonRates = (overviewKnown ? overviewRates : salonRates).length > 0;

  function makeDonut(
    _theme: Theme,
    marks: { presences: number; absences: number; excused: number; evasions: number; lates: number },
    has: boolean
  ) {
    return {
      series: [
        {
          type: 'pie',
          radius: ['60%', '80%'],
          label: { show: false },
          data: has
            ? [
                { value: marks.presences, name: $t.admin.markPresent, itemStyle: { color: cssVar('--m-present', '#1e7b4f') } },
                { value: marks.absences, name: $t.admin.markAbsence, itemStyle: { color: cssVar('--m-absent', '#b83a2a') } },
                { value: marks.excused, name: $t.admin.markPermission, itemStyle: { color: cssVar('--m-permission', '#1b6c80') } },
                { value: marks.evasions, name: $t.admin.markEvasion, itemStyle: { color: cssVar('--m-evasion', '#733952') } },
                { value: marks.lates, name: $t.admin.markLate, itemStyle: { color: cssVar('--m-late', '#a86f0c') } }
              ]
            : []
        }
      ]
    };
  }

  function makeGravityBars(_theme: Theme, counts: number[], has: boolean) {
    return {
      grid: { top: 16, right: 12, bottom: 28, left: 36 },
      xAxis: {
        type: 'category',
        data: [$t.roster.warnGravityMild, $t.roster.warnGravityModerate, $t.roster.warnGravitySevere]
      },
      yAxis: { type: 'value', minInterval: 1 },
      series: [
        {
          type: 'bar',
          barMaxWidth: 42,
          data: has
            ? [
                { value: counts[0], itemStyle: { color: cssVar('--g-leve-ink', '#115373') } },
                { value: counts[1], itemStyle: { color: cssVar('--g-medio-ink', '#7c4d08') } },
                { value: counts[2], itemStyle: { color: cssVar('--g-grave-ink', '#9e1c22') } }
              ]
            : [],
          itemStyle: { borderRadius: [4, 4, 0, 0] }
        }
      ]
    };
  }

  function makeSalonBars(_theme: Theme, rates: { label: string; rate: number }[]) {
    return {
      grid: { top: 16, right: 12, bottom: 28, left: 36 },
      xAxis: { type: 'category', data: rates.map((s) => s.label) },
      yAxis: { type: 'value', max: 100 },
      series: [
        {
          type: 'bar',
          barMaxWidth: 36,
          data: rates.map((s) => ({
            value: s.rate,
            itemStyle: {
              color:
                s.rate < RATE_FLOOR
                  ? cssVar('--g-grave-ink', '#9e1c22')
                  : cssVar('--accent', '#1b6c80')
            }
          })),
          itemStyle: { borderRadius: [4, 4, 0, 0] }
        }
      ]
    };
  }

  $: statTeachers = summary?.Totals.Teachers ?? (teachersKnown ? teacherList.length : null);
  $: statStudents = summary?.Totals.Students ?? null;
  $: statGroups = summary?.Totals.Groups ?? (groupsKnown ? (groups.length > 0 ? groups.length : null) : null);
</script>

<AdminShell active="resumen" {year} onYear={changeYear}>
  <main class="main">
    <TopBar title={$t.admin.viewOverview} subtitle={consoleTitle}>
      <TopActions />
    </TopBar>

    <div class="controlbar">
      <label class="search">
        <Icon name="search" />
        <input
          type="search"
          placeholder={$t.admin.consoleSearch}
          aria-label={$t.admin.consoleSearchLabel}
          bind:value={search}
          bind:this={searchEl}
        />
        <kbd title={$t.admin.consoleSearchLabel}>/</kbd>
      </label>
      <div class="period-drop">
        <Dropdown
          label={$t.admin.periodScopeLabel}
          hideLabel
          value={String(period)}
          options={periodOptions}
          on:select={(e) => changePeriod(Number(e.detail))}
        />
      </div>
      <button type="button" class="btn btn-primary" disabled={exporting} on:click={exportYear}>
        {exporting ? $t.common.retrying : $t.admin.exportYear}
      </button>
    </div>

    <div class="content">
      <div class="feed">
        <div class="sheet">
          {#if state === 'loading'}
            <Skeleton rows={6} />
          {:else if state === 'error'}
            <ErrorState error={loadError} onRetry={load} />
          {:else}
            <section class="kpi-strip" aria-label={$t.admin.viewOverview}>
              <div class="kpi-cell">
                <span class="kpi-label">{$t.admin.attRisk}</span>
                <strong class="kpi-val" class:alert={reportsKnown && risk.length > 0}>
                  {reportsKnown ? risk.length : '—'}
                </strong>
                <div class="kpi-foot">
                  <span>{$t.admin.attRiskDetail}</span>
                  {#if risk.length > 0}
                    <button type="button" class="kpi-link" on:click={scrollToLedger}>{$t.admin.attActionList}</button>
                  {/if}
                </div>
              </div>

              <div class="kpi-cell">
                <span class="kpi-label">{$t.admin.attListed}</span>
                <strong class="kpi-val">
                  {reportsKnown ? reportCount : '—'}{#if statGroups !== null}<small>/{statGroups}</small>{/if}
                </strong>
                <div class="kpi-foot">
                  <span>{$t.admin.attListedDetail}</span>
                  <button type="button" class="kpi-link" on:click={() => push('/admin/estudiantes')}>{$t.nav.students}</button>
                </div>
              </div>

              <div class="kpi-cell">
                <span class="kpi-label">{$t.admin.statsStudents}</span>
                <strong class="kpi-val">{statStudents ?? '—'}</strong>
                <div class="kpi-foot">
                  <span>{groupsKnown ? $t.admin.salonsCount(groups.length) : $t.admin.attNoData}</span>
                </div>
              </div>

              <div class="kpi-cell">
                <span class="kpi-label">{$t.admin.statsTeachers}</span>
                <strong class="kpi-val">{statTeachers ?? '—'}</strong>
                <div class="kpi-foot">
                  <span>{$t.admin.teachersActive}: {teachersKnown ? teacherList.filter((x) => x.Active).length : '—'}</span>
                  <button type="button" class="kpi-link" on:click={() => push('/admin/docentes')}>{$t.nav.teachers}</button>
                </div>
              </div>

              <div class="kpi-cell">
                <span class="kpi-label">{$t.admin.warningsTitle}</span>
                <strong class="kpi-val" class:alert={warningsKnown && gravityCounts[2] > 0}>
                  {warningsKnown ? totalWarnings : '—'}
                </strong>
                <div class="kpi-foot">
                  <span>{warningsKnown ? $t.admin.warningsBreakdown(gravityCounts[2], gravityCounts[1], gravityCounts[0]) : $t.admin.attNoData}</span>
                  <button type="button" class="kpi-link" on:click={() => push('/admin/llamados')}>{$t.admin.navWarnings}</button>
                </div>
              </div>
            </section>

            <div class="gfx">
              <section class="panel">
                <div class="panel-head">
                  <h2>{$t.admin.attendanceTitle}</h2>
                  <div class="scope-drop">
                    <Dropdown
                      label={$t.admin.donutScopeLabel}
                      hideLabel
                      value={donutScope}
                      options={scopeOptions}
                      on:select={(e) => (donutScope = String(e.detail))}
                    />
                  </div>
                </div>
                <div class="donut-wrap">
                  <Chart option={donut} empty={!hasDonut} emptyLabel={hasDonut ? $t.admin.attendanceTitle : ''} height={200} />
                  {#if hasDonut}<span class="donut-center">{donutRate}%</span>{/if}
                </div>
                <div class="legend pills">
                  <span><i class="sw k-present"></i>{$t.admin.markPresent} <strong>{donutTotals.presences}</strong></span>
                  <span><i class="sw k-absent"></i>{$t.admin.markAbsence} <strong>{donutTotals.absences}</strong></span>
                  <span><i class="sw k-permission"></i>{$t.admin.markPermission} <strong>{donutTotals.excused}</strong></span>
                  <span><i class="sw k-evasion"></i>{$t.admin.markEvasion} <strong>{donutTotals.evasions}</strong></span>
                  <span><i class="sw k-late"></i>{$t.admin.markLate} <strong>{donutTotals.lates}</strong></span>
                </div>
              </section>

              <section class="panel">
                <div class="panel-head">
                  <h2>{$t.admin.warningsTitle}</h2>
                  <button type="button" class="btn btn-sm" on:click={() => push('/admin/llamados')}>
                    {$t.admin.attActionList}
                  </button>
                </div>
                <Chart option={gravityBars} empty={!hasGravity} emptyLabel={hasGravity ? $t.admin.warningsTitle : ''} height={200} />
                <div class="legend pills">
                  <span><i class="sw k-grave"></i>{$t.roster.warnGravitySevere} <strong>{gravityCounts[2]}</strong></span>
                  <span><i class="sw k-medio"></i>{$t.roster.warnGravityModerate} <strong>{gravityCounts[1]}</strong></span>
                  <span><i class="sw k-leve"></i>{$t.roster.warnGravityMild} <strong>{gravityCounts[0]}</strong></span>
                </div>
              </section>
            </div>

            <div class="pair-grid">
              <section class="panel">
                <div class="panel-head">
                  <h2>{$t.admin.salonRateTitle}</h2>
                  <span class="caps">{$t.admin.salonRateCaption}</span>
                </div>
                <Chart option={salonBars} empty={!hasSalonRates} emptyLabel={hasSalonRates ? $t.admin.salonRateTitle : ''} height={200} />
                {#if hasSalonRates}
                  <p class="insight">
                    <Icon name="pin" />
                    <span>{$t.admin.salonBelow((overviewKnown ? overviewRates : salonRates).filter((s) => s.rate < RATE_FLOOR).length)}</span>
                  </p>
                {/if}
              </section>

              <section class="panel">
                <div class="panel-head">
                  <h2>{$t.admin.daysCalledTitle(overview?.Days.length ?? 0)}</h2>
                  <span class="caps">{periodCaps}</span>
                </div>
                {#if !overviewKnown}
                  <Skeleton rows={2} />
                {:else if !overview || overview.Days.length === 0}
                  <p class="muted-note">{$t.admin.daysCalledEmpty}</p>
                {:else}
                  <p class="muted-note">{$t.admin.daysCalledBasis(overview.Marks.StudentDays)}</p>
                  <div class="daychips">
                    {#each overview.Days as d (d)}
                      <span class="daychip">{dayChip(d)}</span>
                    {/each}
                  </div>
                {/if}
              </section>
            </div>

            <section class="panel" id="riesgo">
              <div class="panel-head">
                <h2>{$t.admin.riskTitle}</h2>
                <span class="count">{$t.admin.riskCount(visibleRisk.length)}</span>
              </div>
              {#if visibleRisk.length === 0}
                <EmptyState
                  icon="users"
                  title={q ? $t.admin.riskNoMatch : $t.admin.riskEmpty}
                  body={$t.admin.attNoData}
                />
              {:else}
                <div class="table-wrap">
                  <div class="prow-head" aria-hidden="true">
                    <span>#</span>
                    <span>{$t.admin.colStudent}</span>
                    <span class="num-col">{$t.admin.colAbsences}</span>
                    <span class="num-col">{$t.admin.colEvasions}</span>
                    <span class="num-col">{$t.admin.colRate}</span>
                    <span class="act-col">{$t.a11y.actions}</span>
                  </div>
                  <ul class="prows">
                    {#each visibleRisk as row, i (row.id)}
                      <li class="prow">
                        <span class="rank">{i + 1}</span>
                        <div class="who-cell">
                          <span class="avatar" aria-hidden="true">{initials(row.name)}</span>
                          <span class="who">
                            <strong>{row.name}</strong>
                            <small>
                              {$t.admin.riskDays(row.sessions)}{row.excused > 0 ? ` · ${row.excused} ${$t.admin.colPermissionLong.toLowerCase()}` : ''}{row.lates > 0 ? ` · ${row.lates} ${$t.admin.colLatesLong.toLowerCase()}` : ''}
                            </small>
                          </span>
                        </div>
                        <span class="num-cell">{row.absences}</span>
                        <span class="num-cell" class:alert={row.evasions > 0}>{row.evasions}</span>
                        <div class="rateblock">
                          <div class="rate-top">
                            <strong class:low={row.rate < RATE_FLOOR}>{row.rate}%</strong>
                            <small>
                              {row.rate - RATE_FLOOR >= 0
                                ? $t.admin.rateAbove(row.rate - RATE_FLOOR)
                                : $t.admin.rateBelow(row.rate - RATE_FLOOR)}
                            </small>
                          </div>
                          <span class="rbar stack" role="img" aria-label={`${row.presences} ${$t.admin.markPresent} · ${row.absences} ${$t.admin.markAbsence} · ${row.lates} ${$t.admin.markLate}`}>
                            {#if row.presences > 0}<span class="sg-present" style={`width:${(row.presences / row.sessions) * 100}%`}></span>{/if}
                            {#if row.excused > 0}<span class="sg-permission" style={`width:${(row.excused / row.sessions) * 100}%`}></span>{/if}
                            {#if row.lates > 0}<span class="sg-late" style={`width:${(row.lates / row.sessions) * 100}%`}></span>{/if}
                            {#if row.absences > 0}<span class="sg-absent" style={`width:${(row.absences / row.sessions) * 100}%`}></span>{/if}
                            {#if row.evasions > 0}<span class="sg-evasion" style={`width:${(row.evasions / row.sessions) * 100}%`}></span>{/if}
                          </span>
                        </div>
                        <div class="row-actions">
                          {#if guardianPhones[row.id]}
                            <a class="btn btn-sm btn-primary" href={`tel:${guardianPhones[row.id]}`}>{$t.admin.callAction}</a>
                          {/if}
                          <button type="button" class="btn btn-sm" on:click={() => push(`/admin/estudiantes/${encodeURIComponent(row.id)}/resumen`)}>
                            {$t.admin.openSummary}
                          </button>
                          <button type="button" class="btn btn-sm" on:click={() => push(`/admin/estudiantes/${encodeURIComponent(row.id)}`)}>
                            {$t.admin.openFile}
                          </button>
                        </div>
                      </li>
                    {/each}
                  </ul>
                </div>
              {/if}
            </section>

            <div class="pair-grid">
              <section class="panel">
                <div class="panel-head">
                  <h2>{$t.admin.teachersPanelTitle}</h2>
                  <button type="button" class="btn btn-sm" on:click={() => push('/admin/docentes')}>
                    {$t.admin.attActionList}
                  </button>
                </div>
                {#if !teachersKnown}
                  <Skeleton rows={2} />
                {:else if teacherList.length === 0}
                  <EmptyState icon="users" title={$t.admin.teachersPanelTitle} body={$t.admin.teachersEmpty} />
                {:else}
                  {@const active = teacherList.filter((x) => x.Active).length}
                  {@const directors = teacherList.filter((x) => x.Active && x.HomeroomClassID).length}
                  <div class="mini-kpis" aria-label={$t.admin.teachersPanelTitle}>
                    <div><small>{$t.admin.teachersActive}</small><strong>{active}</strong></div>
                    <div><small>{$t.admin.teachersInactive}</small><strong>{teacherList.length - active}</strong></div>
                    <div><small>{$t.admin.teachersDirectors}</small><strong>{directors}</strong></div>
                    <div><small>{$t.admin.teachersUnassigned}</small><strong>{unassignedTeachers.length}</strong></div>
                  </div>
                  {#if teacherMonth.known && teacherMonth.present + teacherMonth.absent + teacherMonth.late > 0}
                    <div class="mini-kpis three">
                      <div><small>{$t.admin.markPresent}</small><strong>{teacherMonth.present}</strong></div>
                      <div><small>{$t.admin.markAbsence}</small><strong>{teacherMonth.absent}</strong></div>
                      <div><small>{$t.admin.markLate}</small><strong>{teacherMonth.late}</strong></div>
                    </div>
                    <p class="muted-note">{$t.admin.teachersMonth}</p>
                  {/if}
                  {#if unassignedTeachers.length > 0}
                    <ul class="trows">
                      {#each unassignedTeachers.slice(0, 4) as x (x.id)}
                        <li>
                          <button type="button" on:click={() => push(`/admin/docentes/${encodeURIComponent(x.id)}`)}>
                            <span class="avatar" aria-hidden="true">{initials(x.name)}</span>
                            <span class="who">
                              <strong>{x.name}</strong>
                              <small>{$t.admin.unassignedTeacherMeta}</small>
                            </span>
                            <Icon name="next" />
                          </button>
                        </li>
                      {/each}
                    </ul>
                  {/if}
                {/if}
              </section>

              <section class="panel">
                <div class="panel-head">
                  <h2>{$t.admin.todayTitle}</h2>
                  <button type="button" class="btn btn-sm" on:click={() => push('/admin/horario')}>
                    {$t.admin.seeWeek}
                  </button>
                </div>
                <div class="weekstrip" aria-label={$t.admin.todayTitle}>
                  {#each $t.admin.scheduleWeekdays as day, di}
                    <span class:today={di === todayIndex}><small>{day}</small></span>
                  {/each}
                </div>
                {#if !todayKnown}
                  <Skeleton rows={2} />
                {:else if todayClasses.length === 0}
                  <p class="muted-note">{$t.admin.todayNone}</p>
                {:else}
                  <ul class="todaylist">
                    {#each todayClasses.slice(0, 6) as c (c.gid + c.start)}
                      <li>
                        <button
                          type="button"
                          on:click={() => push(`/admin/estudiantes?salon=${encodeURIComponent(c.gid)}`)}
                        >
                          <span class="hh">{clock(c.start)}–{clock(c.end)}</span>
                          <span class="wt">
                            <strong>{c.label}{c.subject ? ` · ${c.subject}` : ''}</strong>
                            {#if c.teacher}<small>{c.teacher}</small>{/if}
                          </span>
                          <Icon name="next" />
                        </button>
                      </li>
                    {/each}
                  </ul>
                {/if}
              </section>
            </div>
          {/if}
        </div>
      </div>

      <aside class="railp" aria-label={$t.admin.pendingTitle}>
        <div class="rail-head">
          <h2>{$t.admin.pendingTitle}</h2>
          <span class="pill">{$t.admin.pendingOpen(openTasks)}</span>
        </div>
        {#if tasks.length === 0}
          <p class="fine">{$t.admin.pendingEmpty}</p>
        {:else}
          <ul class="todos">
            {#each tasks as task (task.id)}
              <li class:done={task.done}>
                <button
                  type="button"
                  class="box"
                  role="checkbox"
                  aria-checked={task.done}
                  aria-label={task.title}
                  on:click={() => (task.done = !task.done)}
                >
                  {#if task.done}<Icon name="check" />{/if}
                </button>
                <div class="todo-main">
                  <div class="todo-top">
                    <span class={`sev ${task.sev}`}><i></i>{task.sev}</span>
                    <div class="todo-t"><strong>{task.title}</strong><small>{task.meta}</small></div>
                  </div>
                  {#if !task.done && (task.call || (task.href && task.actionLabel) || task.reviewId)}
                    <div class="tacts">
                      {#if task.call}
                        <a class="btn btn-sm btn-primary" href={`tel:${task.call}`}>{$t.admin.callAction}</a>
                      {/if}
                      {#if task.href && task.actionLabel}
                        <button type="button" class="btn btn-sm" on:click={() => task.href && push(task.href)}>{task.actionLabel}</button>
                      {/if}
                      {#if task.reviewId}
                        <button type="button" class="btn btn-sm" on:click={() => task.reviewId && reviewAlert(task.reviewId)}>{$t.academicAlert.reviewAction}</button>
                      {/if}
                    </div>
                  {/if}
                </div>
              </li>
            {/each}
          </ul>
          <p class="fine">{$t.admin.pendingHint}</p>
        {/if}
      </aside>
    </div>
  </main>
</AdminShell>

<style>
  .main {
    margin: 0 auto;
    max-width: 1440px;
    min-width: 0;
  }
  .controlbar {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    margin-bottom: 14px;
  }
  .search {
    display: flex;
    gap: 8px;
    align-items: center;
    background: var(--surface);
    border: 1px solid var(--control);
    border-radius: var(--radius-control);
    padding: 0 10px;
    color: var(--muted);
    min-height: var(--control-height);
    flex: 1 1 220px;
    max-width: 340px;
  }
  .search:focus-within {
    border-color: var(--accent);
  }
  .search :global(svg) {
    width: 16px;
    height: 16px;
    flex: none;
  }
  .search input {
    border: 0;
    background: none;
    outline: none;
    width: 100%;
    color: var(--ink);
    font-size: 0.84rem;
  }
  kbd {
    font-family: inherit;
    font-size: 0.72rem;
    color: var(--muted);
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: 1px 5px;
  }
  .period-drop {
    min-width: 180px;
  }
  .scope-drop {
    min-width: 140px;
  }
  .content {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
    align-items: start;
  }
  .feed {
    min-width: 0;
  }
  .sheet {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-sheet);
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  /* Divided KPI strip: 5 equal cells in one flat container */
  .kpi-strip {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    overflow: hidden;
  }
  .kpi-cell {
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .kpi-cell + .kpi-cell {
    border-left: 1px solid var(--line);
  }
  .kpi-label {
    color: var(--muted);
    font-size: 0.78rem;
    font-weight: 500;
  }
  .kpi-val {
    font-size: var(--fs-kpi);
    font-weight: 600;
    line-height: 1.15;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }
  .kpi-val small {
    font-size: 0.55em;
    color: var(--muted);
    font-weight: 400;
    margin-left: 2px;
  }
  .kpi-val.alert {
    color: var(--g-grave-ink);
  }
  .kpi-foot {
    margin-top: auto;
    padding-top: 4px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    color: var(--muted);
    font-size: 0.74rem;
  }
  .kpi-foot span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .kpi-link {
    color: var(--accent);
    font-weight: 600;
    font-size: 0.75rem;
    white-space: nowrap;
    flex: none;
  }
  .kpi-link:hover {
    text-decoration: underline;
  }
  @media (max-width: 960px) {
    .kpi-strip {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .kpi-cell + .kpi-cell {
      border-left: 0;
    }
    .kpi-cell:nth-child(2n) {
      border-left: 1px solid var(--line);
    }
    .kpi-cell:nth-child(n + 3) {
      border-top: 1px solid var(--line);
    }
    .kpi-cell:last-child:nth-child(odd) {
      grid-column: 1 / -1;
    }
  }
  .gfx {
    display: grid;
    grid-template-columns: 1fr;
    gap: 16px;
  }
  .pair-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 16px;
    align-items: start;
  }
  .panel {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    padding: 18px;
    min-width: 0;
  }
  .panel-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
  }
  .panel-head h2 {
    font-size: 0.95rem;
    font-weight: 600;
  }
  .caps,
  .count {
    color: var(--muted);
    font-size: 0.76rem;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }
  .muted-note {
    color: var(--muted);
    font-size: 0.8rem;
    margin: 4px 0 8px;
  }
  .daychips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
    max-height: 156px;
    overflow-y: auto;
  }
  .daychip {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-control);
    padding: 4px 10px;
    font-size: 0.78rem;
    font-weight: 500;
    text-transform: capitalize;
    font-variant-numeric: tabular-nums;
  }
  .donut-wrap {
    position: relative;
  }
  .donut-center {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.4rem;
    font-weight: 600;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
    pointer-events: none;
  }
  .legend.pills {
    margin-top: 12px;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .legend.pills span {
    border: 1px solid var(--line);
    border-radius: var(--radius-control);
    padding: 4px 10px;
    background: var(--surface);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.76rem;
    color: var(--ink-soft);
    font-variant-numeric: tabular-nums;
  }
  .legend.pills strong {
    color: var(--ink);
    font-weight: 600;
  }
  .sw {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    display: inline-block;
  }
  .sw.k-present {
    background: var(--m-present);
  }
  .sw.k-absent {
    background: var(--m-absent);
  }
  .sw.k-permission {
    background: var(--m-permission);
  }
  .sw.k-evasion {
    background: var(--m-evasion);
  }
  .sw.k-late {
    background: var(--m-late);
  }
  .sw.k-grave {
    background: var(--g-grave-ink);
  }
  .sw.k-medio {
    background: var(--g-medio-ink);
  }
  .sw.k-leve {
    background: var(--g-leve-ink);
  }
  .insight {
    display: flex;
    gap: 8px;
    align-items: center;
    color: var(--ink-soft);
    font-size: 0.78rem;
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px solid var(--line);
  }
  .insight :global(svg) {
    width: 15px;
    height: 15px;
    color: var(--muted);
    flex: none;
  }
  /* Risk table */
  .table-wrap {
    overflow-x: auto;
  }
  .prow-head {
    display: none;
  }
  .prows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }
  .prow {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr);
    gap: 10px 12px;
    align-items: center;
    padding: 12px 0;
    border-top: 1px solid var(--line);
  }
  .prow:first-child {
    border-top: 0;
  }
  .rank {
    color: var(--muted);
    font-size: 0.78rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .who-cell {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .avatar {
    flex: none;
    width: 32px;
    height: 32px;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 0.72rem;
  }
  .who {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .who strong {
    font-size: 0.86rem;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .who small {
    color: var(--muted);
    font-size: 0.75rem;
  }
  .num-cell {
    display: none;
    text-align: right;
    font-weight: 600;
    font-size: 0.88rem;
    font-variant-numeric: tabular-nums;
    color: var(--ink-soft);
  }
  .num-cell.alert {
    color: var(--g-grave-ink);
  }
  .rateblock {
    grid-column: 2;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .rate-top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }
  .rateblock strong {
    font-variant-numeric: tabular-nums;
    font-size: 0.88rem;
  }
  .rateblock strong.low {
    color: var(--g-grave-ink);
  }
  .rateblock small {
    color: var(--muted);
    font-size: 0.72rem;
    font-variant-numeric: tabular-nums;
  }
  .rbar {
    height: 5px;
    border-radius: 999px;
    background: var(--tint);
    overflow: hidden;
  }
  .rbar.stack {
    display: flex;
  }
  .rbar.stack span {
    display: block;
    height: 100%;
    min-width: 2px;
  }
  .rbar .sg-present {
    background: var(--m-present);
  }
  .rbar .sg-permission {
    background: var(--m-permission);
  }
  .rbar .sg-late {
    background: var(--m-late);
  }
  .rbar .sg-absent {
    background: var(--m-absent);
  }
  .rbar .sg-evasion {
    background: var(--m-evasion);
  }
  .row-actions {
    grid-column: 2;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    justify-content: flex-end;
  }
  /* Teachers & Today panels */
  .mini-kpis {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-control);
    margin-bottom: 10px;
  }
  .mini-kpis.three {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .mini-kpis > div {
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .mini-kpis > div + div {
    border-left: 1px solid var(--line);
  }
  .mini-kpis small {
    color: var(--muted);
    font-size: 0.72rem;
  }
  .mini-kpis strong {
    font-size: 1.15rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .trows,
  .todaylist {
    list-style: none;
    margin: 10px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }
  .trows li + li,
  .todaylist li + li {
    border-top: 1px solid var(--line);
  }
  .trows button,
  .todaylist button {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    text-align: left;
    padding: 10px 6px;
    border-radius: 6px;
  }
  .trows button:hover,
  .todaylist button:hover {
    background: var(--surface);
  }
  .trows button :global(svg),
  .todaylist button :global(svg) {
    width: 16px;
    height: 16px;
    color: var(--muted);
    flex: none;
  }
  .todaylist .hh {
    flex: none;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 3px 8px;
    font-size: 0.75rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .todaylist .wt {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .todaylist .wt strong {
    font-size: 0.85rem;
    font-weight: 600;
  }
  .todaylist .wt small {
    color: var(--muted);
    font-size: 0.75rem;
  }
  .weekstrip {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 6px;
    margin-bottom: 10px;
  }
  .weekstrip span {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 6px 8px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .weekstrip small {
    color: var(--muted);
    font-size: 0.74rem;
    font-weight: 500;
  }
  .weekstrip span.today {
    background: var(--accent-soft);
    border-color: var(--accent);
  }
  .weekstrip span.today small {
    color: var(--accent);
    font-weight: 600;
  }
  /* Side rail: Pendientes */
  .railp {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-sheet);
    padding: 18px;
    align-self: start;
  }
  .rail-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }
  .rail-head h2 {
    font-size: 0.95rem;
    font-weight: 600;
  }
  .pill {
    background: var(--tint);
    color: var(--ink-soft);
    font-size: 0.74rem;
    font-weight: 600;
    border-radius: 999px;
    padding: 3px 10px;
    font-variant-numeric: tabular-nums;
  }
  .todos {
    list-style: none;
    margin: 4px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }
  .todos li {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 10px 0;
    border-top: 1px solid var(--line);
  }
  .todos li:first-child {
    border-top: 0;
  }
  .box {
    flex: none;
    width: 28px;
    height: 28px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--bg);
    position: relative;
  }
  .box::before {
    content: '';
    width: 18px;
    height: 18px;
    border-radius: 5px;
    border: 1.5px solid var(--control);
    background: var(--surface);
    position: absolute;
  }
  .box :global(svg) {
    position: relative;
    width: 13px;
    height: 13px;
  }
  li.done .box::before {
    background: var(--ink);
    border-color: var(--ink);
  }
  .todo-main {
    flex: 1;
    min-width: 0;
  }
  .todo-top {
    display: flex;
    gap: 8px;
    align-items: flex-start;
  }
  .sev {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: capitalize;
    border-radius: 999px;
    padding: 2px 8px;
    white-space: nowrap;
    flex: none;
  }
  .sev.leve {
    background: var(--g-leve-bg);
    color: var(--g-leve-ink);
  }
  .sev.medio {
    background: var(--g-medio-bg);
    color: var(--g-medio-ink);
  }
  .sev.grave {
    background: var(--g-grave-bg);
    color: var(--g-grave-ink);
  }
  .sev i {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: currentColor;
  }
  .todo-t {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .todo-t strong {
    font-size: 0.82rem;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .todo-t small {
    color: var(--muted);
    font-size: 0.74rem;
    overflow-wrap: anywhere;
  }
  li.done .todo-t strong {
    text-decoration: line-through;
    color: var(--muted);
  }
  .tacts {
    display: flex;
    gap: 6px;
    margin-top: 8px;
    flex-wrap: wrap;
  }
  .fine {
    color: var(--muted);
    font-size: 0.74rem;
    margin-top: 10px;
  }
  @media (min-width: 760px) {
    .gfx {
      grid-template-columns: 1.3fr 1fr;
    }
    .pair-grid {
      grid-template-columns: 1fr 1fr;
    }
    .prow-head {
      display: grid;
      grid-template-columns: 28px minmax(0, 1.5fr) 72px 72px 140px auto;
      gap: 12px;
      padding: 0 4px 8px;
      border-bottom: 1px solid var(--line);
      color: var(--muted);
      font-size: 0.75rem;
      font-weight: 500;
    }
    .prow-head .num-col {
      text-align: right;
    }
    .prow-head .act-col {
      text-align: right;
    }
    .prow {
      grid-template-columns: 28px minmax(0, 1.5fr) 72px 72px 140px auto;
      padding: 10px 4px;
    }
    .num-cell {
      display: block;
    }
    .rateblock,
    .row-actions {
      grid-column: auto;
    }
  }
  @media (min-width: 1200px) {
    .content {
      grid-template-columns: minmax(0, 1fr) 340px;
    }
    .railp {
      position: sticky;
      top: 16px;
      max-height: calc(100vh - 32px);
      overflow-y: auto;
    }
  }
</style>
