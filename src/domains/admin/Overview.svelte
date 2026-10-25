<script lang="ts">
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { t } from '$lib/i18n';
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
  import { mapSettled } from '$lib/async';
  import { isMissing } from '../teacher/api';
  import {
    teachers,
    groupsByYear,
    classReport,
    dashboardSummary,
    warningsRecent,
    incidentsRecent,
    studentProfile,
    teacherHistory,
    scheduleEntries,
    listSubjects,
    subjectAssignments,
    type TeacherSummary,
    type YearGroup,
    type RecentWarning,
    type RecentIncident,
    type DashboardSummary
  } from './api';
  import Dropdown from '$lib/ui/Dropdown.svelte';

  // Consola del administrador (identidad docs/diseno.md, referencia
  // proto/ConsolaAdmin.svelte): encabezado en crema sobre lámina blanca,
  // rail de Pendientes y tabs segmentados. Solo datos de endpoints reales;
  // lo que aún da 404 pinta vacío honesto, nunca datos falsos.

  type View = 'resumen' | 'historial';
  type Sev = 'leve' | 'medio' | 'grave';

  interface RiskRow {
    id: string;
    name: string;
    absences: number;
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
    /** Ir directo a la pantalla que lo configura; null = sin destino. */
    href: string | null;
    actionLabel: string | null;
    /** Teléfono para llamar (tel:); null = sin llamada. */
    call: string | null;
    done: boolean;
  }

  const RATE_FLOOR = 85;

  const currentYear = new Date().getFullYear();
  let year = currentYear;
  let view: View = 'resumen';

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
  let weekTotals = { presences: 0, absences: 0, excused: 0, evasions: 0, lates: 0 };
  let weekKnown = false;
  let teacherMonth = { present: 0, absent: 0, late: 0, known: false };
  let unassignedTeachers: { id: string; name: string }[] = [];
  let bareSubjectNames: string[] = [];
  let salonsNoDirector: { gid: string; label: string }[] = [];
  let guardianPhones: Record<string, string> = {};
  let risk: RiskRow[] = [];
  let warnings: RecentWarning[] = [];
  let incidents: RecentIncident[] = [];
  let summary: DashboardSummary | null = null;

  let search = '';
  let searchEl: HTMLInputElement | null = null;
  let selectedStudent: string | null = null;
  let tasks: Task[] = [];

  const gravityToSev = (gravity: RecentWarning['Gravity']): Sev =>
    gravity === 'severe' ? 'grave' : gravity === 'moderate' ? 'medio' : 'leve';

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
        // Sin identidad o sin permiso la guarda navega; si seguimos aquí,
        // pinta vacío honesto en vez de cargar para siempre.
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
    weekKnown = false;
    risk = [];
    reportCount = 0;
    reportsKnown = false;
    // Los salones vienen del endpoint real (/v1/classes?year): cada grupo
    // aporta su reporte por ID. Sin grupos no hay reportes que sumar.
    const byStudent = new Map<
      string,
      { names: string; surnames: string; presences: number; absences: number; excused: number; evasions: number; lates: number; sessions: number }
    >();
    const labelOf = new Map(groups.map((g) => [g.GroupID, g.ClassLabel]));
    // En paralelo con tope: un salon sin reporte es vacio honesto y no
    // frena a los demas. En serie eran N viajes encadenados por cada carga;
    // sin tope serían N viajes a la vez contra el servidor.
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
    risk = [...byStudent.entries()]
      .map(([id, s]) => ({
        id,
        name: `${s.surnames}, ${s.names}`.trim().replace(/^,/, '').trim() || id,
        absences: s.absences,
        evasions: s.evasions,
        lates: s.lates,
        sessions: s.sessions,
        rate: s.sessions > 0 ? Math.round((s.presences / s.sessions) * 100) : 0
      }))
      .filter((r) => r.sessions > 0 && (r.rate < RATE_FLOOR || r.absences + r.evasions >= 3))
      .sort((a, b) => a.rate - b.rate);
    await loadSecondary();
    await loadTeacherExtras();
    buildTasks();
  }

  // Estadística docente y pendientes configurables: todo de endpoints
  // reales (asistencia mensual por docente, horario por docente, catálogo
  // de materias con asignaciones y ficha del estudiante para el teléfono
  // del acudiente). En paralelo con tope; lo que falle pinta vacío.
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
    const pad = (n: number) => String(n).padStart(2, '0');
    const from = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
    const to = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
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
    try {
      incidents = (await incidentsRecent(20)) ?? [];
    } catch {
      incidents = [];
    }
  }

  function buildTasks() {
    const next: Task[] = [];
    // Riesgo de asistencia: llamar al acudiente y abrir el resumen.
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
        done: false
      });
    }
    for (const g of salonsNoDirector) {
      next.push({
        id: `nodir-${g.gid}`,
        sev: 'medio',
        title: $t.admin.noDirectorTask(g.label),
        meta: $t.admin.noDirectorMeta,
        href: '/admin/docentes',
        actionLabel: $t.admin.assignDirectionLine,
        call: null,
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
    ...salonTotals.map((s) => ({ value: s.gid, label: s.label }))
  ];
  $: scopedTotals = (() => {
    if (!donutScope) {
      return salonTotals.reduce(
        (acc, s) => ({
          presences: acc.presences + s.presences,
          absences: acc.absences + s.absences,
          excused: acc.excused + s.excused,
          evasions: acc.evasions + s.evasions,
          lates: acc.lates + s.lates
        }),
        { presences: 0, absences: 0, excused: 0, evasions: 0, lates: 0 }
      );
    }
    const s = salonTotals.find((x) => x.gid === donutScope);
    return s
      ? { presences: s.presences, absences: s.absences, excused: s.excused, evasions: s.evasions, lates: s.lates }
      : { presences: 0, absences: 0, excused: 0, evasions: 0, lates: 0 };
  })();
  $: scopedZero =
    scopedTotals.presences + scopedTotals.absences + scopedTotals.excused + scopedTotals.evasions + scopedTotals.lates === 0;
  // Sin llamadas por salón todavía, el global recurre a los últimos 7
  // días para no pintar vacío teniendo datos reales.
  $: useWeekFallback = donutScope === '' && scopedZero && weekKnown;
  $: donutTotals = useWeekFallback ? weekTotals : scopedTotals;
  $: marksTotal = donutTotals.presences + donutTotals.absences + donutTotals.excused + donutTotals.evasions + donutTotals.lates;
  $: hasDonut = marksTotal > 0;
  $: donutRate = hasDonut ? Math.round((donutTotals.presences / marksTotal) * 100) : 0;

  $: warningsWeek = summary
    ? summary.WarningsLast7d.Mild + summary.WarningsLast7d.Moderate + summary.WarningsLast7d.Severe
    : null;
  $: graveCount = summary
    ? summary.WarningsLast7d.Severe
    : warnings.filter((w) => w.Gravity === 'severe').length;
  $: warningsKnown = summary ? true : warnings.length > 0;
  $: gravityCounts = summary
    ? [summary.WarningsLast7d.Mild, summary.WarningsLast7d.Moderate, summary.WarningsLast7d.Severe]
    : [
        warnings.filter((w) => w.Gravity === 'mild').length,
        warnings.filter((w) => w.Gravity === 'moderate').length,
        warnings.filter((w) => w.Gravity === 'severe').length
      ];
  $: hasGravity = summary
    ? summary.WarningsLast7d.Mild + summary.WarningsLast7d.Moderate + summary.WarningsLast7d.Severe > 0
    : warnings.length > 0;
  $: hasSalonRates = salonRates.length > 0;

  $: donut = makeDonut($theme, donutTotals, hasDonut);
  $: gravityBars = makeGravityBars($theme, gravityCounts, hasGravity);
  $: salonBars = makeSalonBars($theme, salonRates);

  function makeDonut(
    _theme: Theme,
    marks: { presences: number; absences: number; excused: number; evasions: number; lates: number },
    has: boolean
  ) {
    return {
      series: [
        {
          type: 'pie',
          radius: ['58%', '80%'],
          label: { show: false },
          data: has
            ? [
                { value: marks.presences, name: $t.admin.markPresent, itemStyle: { color: cssVar('--m-present', '#4e8a3c') } },
                { value: marks.absences, name: $t.admin.markAbsence, itemStyle: { color: cssVar('--m-absent', '#b26a35') } },
                { value: marks.excused, name: $t.admin.markPermission, itemStyle: { color: cssVar('--m-permission', '#4c8757') } },
                { value: marks.evasions, name: $t.admin.markEvasion, itemStyle: { color: cssVar('--m-evasion', '#8377a8') } },
                { value: marks.lates, name: $t.admin.markLate, itemStyle: { color: cssVar('--m-late', '#5b93b5') } }
              ]
            : []
        }
      ]
    };
  }

  function makeGravityBars(_theme: Theme, counts: number[], has: boolean) {
    return {
      xAxis: {
        type: 'category',
        data: [$t.roster.warnGravityMild, $t.roster.warnGravityModerate, $t.roster.warnGravitySevere]
      },
      yAxis: { type: 'value' },
      series: [
        {
          type: 'bar',
          data: has
            ? [
                { value: counts[0], itemStyle: { color: cssVar('--g-leve-ink', '#1f8fc4') } },
                { value: counts[1], itemStyle: { color: cssVar('--g-medio-ink', '#93700f') } },
                { value: counts[2], itemStyle: { color: cssVar('--g-grave-ink', '#cf4444') } }
              ]
            : [],
          itemStyle: { borderRadius: [8, 8, 0, 0] }
        }
      ]
    };
  }

  function makeSalonBars(_theme: Theme, rates: { label: string; rate: number }[]) {
    return {
      xAxis: { type: 'category', data: rates.map((s) => s.label) },
      yAxis: { type: 'value', max: 100 },
      series: [
        {
          type: 'bar',
          data: rates.map((s) => ({
            value: s.rate,
            itemStyle: {
              color:
                s.rate < RATE_FLOOR
                  ? cssVar('--g-grave-ink', '#cf4444')
                  : cssVar('--ink', '#201d18')
            }
          })),
          itemStyle: { borderRadius: [8, 8, 0, 0] }
        }
      ]
    };
  }

  $: statTeachers = summary?.Totals.Teachers ?? (teachersKnown ? teacherList.length : null);
  $: statStudents = summary?.Totals.Students ?? null;
  $: statGroups = summary?.Totals.Groups ?? (groupsKnown ? (groups.length > 0 ? groups.length : null) : null);
  $: statWarnings = warningsWeek ?? (warningsKnown ? graveCount : null);
</script>

<AdminShell active="resumen" {year} onYear={changeYear}>
    <main class="main">
      <div class="pagehead">
        <div class="titlebar">
          <h1 class="title">{consoleTitle}</h1>
          <div class="topactions"><TopActions /></div>
        </div>
        <div class="controlbar">
          <div class="tabs" role="tablist" aria-label={$t.admin.consoleEyebrow}>
            <button type="button" role="tab" aria-selected={view === 'resumen'} class:on={view === 'resumen'} on:click={() => (view = 'resumen')}>
              {$t.admin.viewOverview}
            </button>
            <button type="button" role="tab" aria-selected={view === 'historial'} class:on={view === 'historial'} on:click={() => (view = 'historial')}>
              {$t.admin.viewHistory}
            </button>
          </div>
          <div class="controls">
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
          </div>
        </div>
      </div>

      <div class="content">
        <div class="feed">
          <div class="sheet">
            {#if state === 'loading'}
              <Skeleton rows={6} />
            {:else if state === 'error'}
              <ErrorState error={loadError} onRetry={load} />
            {:else if view === 'resumen'}
              <p class="cat-kicker">{$t.admin.consoleEyebrow}</p>
              <div class="alerts">
                <div class="stat">
                  <div class="stat-in">
                    <small>{$t.admin.attRisk}</small>
                    <strong>{reportsKnown ? risk.length : '—'}</strong>
                    <span>{$t.admin.attRiskDetail}</span>
                  </div>
                  <div class="stat-ft">
                    <span class="ibadge"><Icon name="warn" /></span>
                    <span>{RATE_FLOOR}%</span>
                    {#if risk.length > 0}
                      <button type="button" class="mini-act" on:click={scrollToLedger}>{$t.admin.attActionList}</button>
                    {:else}
                      <span class="soon">{$t.admin.soon}</span>
                    {/if}
                  </div>
                </div>
                <div class="stat">
                  <div class="stat-in">
                    <small>{$t.admin.attListed}</small>
                    <strong>{reportsKnown ? reportCount : '—'}</strong>
                    <span>{$t.admin.attListedDetail}</span>
                  </div>
                  <div class="stat-ft">
                    <span class="ibadge"><Icon name="calendar" /></span>
                    <span>{groupsKnown ? $t.admin.salonsCount(groups.length) : $t.admin.attNoData}</span>
                    {#if reportCount > 0}
                      <button type="button" class="mini-act" on:click={() => push('/admin/estudiantes')}>{$t.admin.attActionList}</button>
                    {:else}
                      <span class="soon">{$t.admin.soon}</span>
                    {/if}
                  </div>
                </div>
                <div class="stat">
                  <div class="stat-in">
                    <small>{$t.admin.warningsTitle}</small>
                    <strong>{warningsKnown ? gravityCounts[0] + gravityCounts[1] + gravityCounts[2] : '—'}</strong>
                    <span>{warningsKnown ? $t.admin.warningsBreakdown(gravityCounts[2], gravityCounts[1], gravityCounts[0]) : $t.admin.attNoData}</span>
                  </div>
                  <div class="stat-ft">
                    <span class="ibadge"><Icon name="warn" /></span>
                    <span>{statWarnings ?? '—'}</span>
                    {#if warningsKnown && gravityCounts[0] + gravityCounts[1] + gravityCounts[2] > 0}
                      <button type="button" class="mini-act" on:click={() => push('/admin/llamados')}>{$t.admin.attActionList}</button>
                    {:else}
                      <span class="soon">{$t.admin.soon}</span>
                    {/if}
                  </div>
                </div>
              </div>

              <div class="kpis" aria-label={$t.admin.consoleEyebrow}>
                <div class="kpi"><small>{$t.admin.statsStudents}</small><strong>{statStudents ?? '—'}</strong></div>
                <div class="kpi"><small>{$t.admin.statsTeachers}</small><strong>{statTeachers ?? '—'}</strong></div>
                <div class="kpi"><small>{$t.admin.statsGroups}</small><strong>{statGroups ?? '—'}</strong></div>
                <div class="kpi"><small>{$t.admin.statsWarnings}</small><strong>{statWarnings ?? '—'}</strong></div>
              </div>

              <p class="cat-kicker">{$t.admin.attendanceTitle}</p>
              <div class="gfx">
                <div class="panel">
                  <div class="panel-head">
                    <h2>{$t.admin.attendanceTitle}</h2>
                    <Dropdown
                      label={$t.admin.donutScopeLabel}
                      value={donutScope}
                      options={scopeOptions}
                      on:select={(e) => (donutScope = String(e.detail))}
                    />
                  </div>
                  {#if useWeekFallback}
                    <p class="muted-note">{$t.admin.donutWeekNote}</p>
                  {/if}
                  <div class="donut-wrap">
                    <Chart option={donut} empty={!hasDonut} emptyLabel={hasDonut ? $t.admin.attendanceTitle : ''} height={220} />
                    {#if hasDonut}<span class="donut-center">{donutRate}%</span>{/if}
                  </div>
                  <div class="legend pills">
                    <span><i class="sw k-present"></i>{$t.admin.markPresent}</span>
                    <span><i class="sw k-absent"></i>{$t.admin.markAbsence}</span>
                    <span><i class="sw k-permission"></i>{$t.admin.markPermission}</span>
                    <span><i class="sw k-evasion"></i>{$t.admin.markEvasion}</span>
                    <span><i class="sw k-late"></i>{$t.admin.markLate}</span>
                  </div>
                </div>
                <div class="panel">
                  <div class="panel-head"><h2>{$t.admin.warningsTitle}</h2></div>
                  <Chart option={gravityBars} empty={!hasGravity} emptyLabel={hasGravity ? $t.admin.warningsTitle : ''} height={220} />
                  <div class="legend pills">
                    <span><i class="sw k-grave"></i>{$t.roster.warnGravitySevere}</span>
                    <span><i class="sw k-medio"></i>{$t.roster.warnGravityModerate}</span>
                    <span><i class="sw k-leve"></i>{$t.roster.warnGravityMild}</span>
                  </div>
                </div>
              </div>

              <div class="panel ratepanel">
                <div class="panel-head">
                  <h2>{$t.admin.salonRateTitle}</h2>
                  <span class="caps">{$t.admin.salonRateCaption}</span>
                </div>
                <Chart option={salonBars} empty={!hasSalonRates} emptyLabel={hasSalonRates ? $t.admin.salonRateTitle : ''} height={220} />
                {#if hasSalonRates}
                  <p class="insight">
                    <span class="ibadge"><Icon name="pin" /></span>
                    {$t.admin.salonBelow(salonRates.filter((s) => s.rate < RATE_FLOOR).length)}
                  </p>
                {/if}
              </div>

              <p class="cat-kicker">{$t.admin.teachersPanelTitle}</p>
              <div class="panel">
                <div class="panel-head">
                  <h2>{$t.admin.teachersPanelTitle}</h2>
                  <button type="button" class="mini-act" on:click={() => push('/admin/docentes')}>{$t.admin.attActionList}</button>
                </div>
                {#if !teachersKnown}
                  <Skeleton rows={2} />
                {:else if teacherList.length === 0}
                  <EmptyState icon="users" title={$t.admin.teachersPanelTitle} body={$t.admin.teachersEmpty} />
                {:else}
                  {@const active = teacherList.filter((x) => x.Active).length}
                  {@const directors = teacherList.filter((x) => x.Active && x.HomeroomClassID).length}
                  <div class="kpis slim" aria-label={$t.admin.teachersPanelTitle}>
                    <div class="kpi"><small>{$t.admin.teachersActive}</small><strong>{active}</strong></div>
                    <div class="kpi"><small>{$t.admin.teachersInactive}</small><strong>{teacherList.length - active}</strong></div>
                    <div class="kpi"><small>{$t.admin.teachersDirectors}</small><strong>{directors}</strong></div>
                    <div class="kpi"><small>{$t.admin.teachersUnassigned}</small><strong>{unassignedTeachers.length}</strong></div>
                  </div>
                  {#if teacherMonth.known && teacherMonth.present + teacherMonth.absent + teacherMonth.late > 0}
                    <div class="kpis slim">
                      <div class="kpi"><small>{$t.admin.markPresent}</small><strong>{teacherMonth.present}</strong></div>
                      <div class="kpi"><small>{$t.admin.markAbsence}</small><strong>{teacherMonth.absent}</strong></div>
                      <div class="kpi"><small>{$t.admin.markLate}</small><strong>{teacherMonth.late}</strong></div>
                    </div>
                    <p class="muted-note">{$t.admin.teachersMonth}</p>
                  {/if}
                  {#if unassignedTeachers.length > 0}
                    <ul class="prows simple">
                      {#each unassignedTeachers.slice(0, 5) as x (x.id)}
                        <li>
                          <button type="button" class="prow link" on:click={() => push(`/admin/docentes/${encodeURIComponent(x.id)}`)}>
                            <span class="avatar" aria-hidden="true">{initials(x.name)}</span>
                            <span class="who"><strong>{x.name}</strong></span>
                            <span class="countchip">{$t.admin.unassignedTeacherMeta}</span>
                            <span class="go" aria-hidden="true"><Icon name="next" /></span>
                          </button>
                        </li>
                      {/each}
                    </ul>
                  {/if}
                {/if}
              </div>

              <p class="cat-kicker" id="riesgo">{$t.admin.riskTitle}</p>
              <div class="panel">
                <div class="panel-head">
                  <span class="count">{$t.admin.riskCount(visibleRisk.length)}</span>
                </div>
                {#if visibleRisk.length === 0}
                  <EmptyState
                    icon="users"
                    title={q ? $t.admin.riskNoMatch : $t.admin.riskEmpty}
                    body={$t.admin.attNoData}
                  />
                {:else}
                  <ul class="prow-head" aria-hidden="true">
                    <li>
                      <span>Nº</span><span class="widespan">{$t.admin.colStudent}</span><span>{$t.admin.colAbsences}</span><span>{$t.admin.colEvasions}</span><span>{$t.admin.colRate}</span>
                    </li>
                  </ul>
                  <ul class="prows">
                    {#each visibleRisk as row, i (row.id)}
                      <li>
                        <button
                          type="button"
                          class="prow"
                          class:on={selectedStudent === row.id}
                          on:click={() => (selectedStudent = selectedStudent === row.id ? null : row.id)}
                          aria-expanded={selectedStudent === row.id}
                        >
                          <span class="rank">{String(i + 1).padStart(2, '0')}</span>
                          <span class="avatar" aria-hidden="true">{initials(row.name)}</span>
                          <span class="who"><strong>{row.name}</strong></span>
                          <span class="countchip">{row.absences} {$t.admin.colAbsences}</span>
                          <span class="countchip" class:alert={row.evasions > 0}>{row.evasions} {$t.admin.colEvasions}</span>
                          <span class="rateblock">
                            <strong class:low={row.rate < RATE_FLOOR}>{row.rate}%</strong>
                            <span class="rbar"><span class:low={row.rate < RATE_FLOOR} style={`width:${row.rate}%`}></span></span>
                            <small>
                              {row.rate - RATE_FLOOR >= 0
                                ? $t.admin.rateAbove(row.rate - RATE_FLOOR)
                                : $t.admin.rateBelow(row.rate - RATE_FLOOR)}
                            </small>
                          </span>
                        </button>
                        {#if selectedStudent === row.id}
                          <div class="detail-box">
                            <span><strong>{row.name}</strong> · {row.rate}% · {year}</span>
                            <span class="sp"></span>
                            <button type="button" class="mini-act" on:click={() => push(`/admin/estudiantes/${encodeURIComponent(row.id)}/resumen`)}>
                              {$t.admin.openSummary}
                            </button>
                            <button type="button" class="mini-act" on:click={() => push(`/admin/estudiantes/${encodeURIComponent(row.id)}`)}>
                              {$t.admin.openFile}
                            </button>
                            {#if guardianPhones[row.id]}
                              <a class="mini-act call" href={`tel:${guardianPhones[row.id]}`}>{$t.admin.callAction}</a>
                            {/if}
                          </div>
                        {/if}
                      </li>
                    {/each}
                  </ul>
                {/if}
              </div>

              <p class="cat-kicker">{$t.admin.todayTitle}</p>
              <div class="panel">
                <div class="weekstrip" aria-label={$t.admin.todayTitle}>
                  {#each $t.admin.scheduleWeekdays as day, di}
                    <span class:today={di === todayIndex}><small>{day}</small></span>
                  {/each}
                </div>
                <EmptyState icon="calendar" title={$t.admin.todayTitle} body={$t.admin.todayEmpty} />
              </div>
            {:else}
              <p class="cat-kicker">{$t.admin.viewHistory}</p>
              <div class="panel">
                <div class="panel-head"><h2>{$t.admin.historyWarnings}</h2></div>
                {#if warnings.length === 0}
                  <EmptyState icon="warn" title={$t.admin.historyWarnings} body={$t.admin.historyEmpty} />
                {:else}
                  <ul class="history">
                    {#each warnings as warning (warning.ID)}
                      <li>
                        <span class={`sev ${gravityToSev(warning.Gravity)}`}><i></i>{gravityToSev(warning.Gravity)}</span>
                        <div class="todo-t"><strong>{warning.Title}</strong><small>{warning.HappenedAt}</small></div>
                      </li>
                    {/each}
                  </ul>
                {/if}
              </div>
              <div class="panel">
                <div class="panel-head"><h2>{$t.admin.historyIncidents}</h2></div>
                {#if incidents.length === 0}
                  <EmptyState icon="list" title={$t.admin.historyIncidents} body={$t.admin.historyEmpty} />
                {:else}
                  <ul class="history">
                    {#each incidents as incident (incident.ID)}
                      <li>
                        <div class="todo-t"><strong>{incident.Title}</strong><small>{incident.HappenedAt}</small></div>
                        <span class="soon">{$t.admin.soon}</span>
                      </li>
                    {/each}
                  </ul>
                {/if}
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
                  <span class={`sev ${task.sev}`}><i></i>{task.sev}</span>
                  <div class="todo-t"><strong>{task.title}</strong><small>{task.meta}</small></div>
                  {#if !task.done && (task.call || (task.href && task.actionLabel))}
                    <div class="tacts">
                      {#if task.call}
                        <a class="go call" href={`tel:${task.call}`}>{$t.admin.callAction}</a>
                      {/if}
                      {#if task.href && task.actionLabel}
                        <button type="button" class="go" on:click={() => task.href && push(task.href)}>{task.actionLabel}</button>
                      {/if}
                    </div>
                  {/if}
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
    max-width: 1400px;
    min-width: 0;
  }
  .eyebrow {
    color: var(--muted);
    font-size: 0.85rem;
    margin-bottom: 2px;
  }
  .title {
    font-size: 2rem;
    letter-spacing: -0.03em;
    font-weight: 550;
    line-height: 1.05;
    margin-bottom: 12px;
    font-variant-numeric: tabular-nums;
  }
  .titlebar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
  }
  .topactions {
    flex: none;
    display: flex;
  }
  .controlbar {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: stretch;
    margin-bottom: 12px;
  }
  .tabs {
    display: inline-flex;
    gap: 2px;
    background: var(--tint);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 3px;
    align-self: flex-start;
  }
  .tabs button {
    padding: 8px 20px;
    min-height: 44px;
    color: var(--muted);
    font-size: 0.84rem;
    font-weight: 600;
    border-radius: 9px;
  }
  .tabs button.on {
    background: var(--surface);
    color: var(--ink);
    box-shadow: var(--shadow);
  }
  .controls {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .search {
    display: flex;
    gap: 8px;
    align-items: center;
    background: var(--surface);
    border: 1px solid var(--line);
    box-shadow: var(--shadow);
    border-radius: 10px;
    padding: 9px 12px;
    color: var(--muted);
    min-height: 44px;
    min-width: 200px;
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
    font-size: 0.7rem;
    color: var(--muted);
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 1px 6px;
  }
  .content {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 20px;
    align-items: start;
  }
  .feed {
    min-width: 0;
  }
  .sheet {
    background: var(--surface);
    border: 1px solid var(--line);
    border-bottom: 0;
    border-radius: 24px 24px 0 0;
    padding: 20px 16px 130px;
    margin-top: 4px;
  }
  .cat-kicker {
    color: var(--ink-soft);
    font-size: 0.84rem;
    font-weight: 500;
    margin: 22px 0 10px;
  }
  .cat-kicker:first-child {
    margin-top: 0;
  }
  .alerts {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
  }
  .stat {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 16px;
    overflow: hidden;
  }
  .stat-in {
    padding: 16px 18px 14px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .stat-in small {
    color: var(--muted);
    font-size: 0.74rem;
  }
  .stat-in strong {
    font-size: 1.6rem;
    font-weight: 550;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }
  .stat-in span {
    color: var(--muted);
    font-size: 0.78rem;
  }
  .stat-ft {
    display: flex;
    gap: 8px;
    align-items: center;
    border-top: 1px solid var(--line);
    padding: 10px 18px;
    color: var(--ink-soft);
    font-size: 0.76rem;
  }
  .mini-act {
    margin-left: auto;
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 700;
    font-size: 0.74rem;
    border-radius: 999px;
    padding: 7px 14px;
    min-height: 44px;
    white-space: nowrap;
  }
  .soon {
    margin-left: auto;
    background: var(--tint);
    color: var(--muted);
    font-weight: 700;
    font-size: 0.72rem;
    border-radius: 999px;
    padding: 8px 14px;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    white-space: nowrap;
    flex: none;
  }
  .mini-act.call {
    display: inline-flex;
    align-items: center;
    text-decoration: none;
  }
  .muted-note {
    color: var(--muted);
    font-size: 0.8rem;
    margin: 4px 0 8px;
  }
  .kpis.slim {
    grid-template-columns: repeat(4, 1fr);
  }
  @media (max-width: 700px) {
    .kpis.slim {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  .prows.simple {
    margin-top: 10px;
  }
  .prow.link {
    cursor: pointer;
  }
  .tacts {
    display: flex;
    gap: 8px;
    margin-top: 8px;
    flex-wrap: wrap;
  }
  .go.call {
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    background: var(--accent);
    border-color: transparent;
    color: #fff;
  }
  .kpis {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
    margin-top: 10px;
  }
  .kpi {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .kpi small {
    color: var(--muted);
    font-size: 0.74rem;
  }
  .kpi strong {
    font-size: 1.5rem;
    font-weight: 550;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }
  .gfx {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
    margin-bottom: 18px;
  }
  .ratepanel {
    margin-top: 8px;
  }
  .panel {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 20px 18px;
    min-width: 0;
  }
  .panel-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 10px;
    margin-bottom: 14px;
  }
  .panel-head h2 {
    font-size: 0.95rem;
    font-weight: 550;
  }
  .caps {
    color: var(--muted);
    font-size: 0.76rem;
  }
  .count {
    color: var(--muted);
    font-size: 0.78rem;
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
    font-size: 1.5rem;
    font-weight: 550;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
    pointer-events: none;
  }
  .legend {
    display: flex;
    gap: 14px;
    margin-top: 10px;
    color: var(--muted);
    font-size: 0.76rem;
  }
  .legend.pills {
    margin-top: 14px;
    flex-wrap: wrap;
    gap: 8px;
  }
  .legend.pills span {
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 4px 12px 4px 8px;
    background: var(--surface);
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .sw {
    width: 9px;
    height: 9px;
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
    align-items: flex-start;
    color: var(--ink-soft);
    font-size: 0.78rem;
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid var(--line);
  }
  .ibadge {
    width: 26px;
    height: 26px;
    border-radius: 8px;
    background: var(--tint);
    color: var(--ink-soft);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
  }
  .ibadge :global(svg) {
    width: 15px;
    height: 15px;
  }
  .prow-head {
    list-style: none;
    margin: 0 0 4px;
    padding: 0;
    display: none;
  }
  .prows {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .prow {
    width: 100%;
    display: grid;
    grid-template-columns: 30px 36px minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
    text-align: left;
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 10px 12px;
    margin-bottom: 8px;
    background: var(--surface);
    min-height: 68px;
  }
  .prow.on {
    border-color: var(--ink);
  }
  .prow .countchip {
    display: none;
  }
  .rank {
    background: var(--accent-soft);
    color: var(--accent);
    border-radius: 8px;
    font-size: 0.7rem;
    font-weight: 700;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-variant-numeric: tabular-nums;
  }
  .prow .avatar {
    width: 36px;
    height: 36px;
    border-radius: 999px;
    border: 1px solid var(--ink);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 0.7rem;
  }
  .who {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .who strong {
    font-size: 0.86rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .salonpill,
  .countchip {
    background: var(--tint);
    border-radius: 999px;
    padding: 5px 12px;
    font-size: 0.74rem;
    font-weight: 600;
    color: var(--ink-soft);
    white-space: nowrap;
  }
  .countchip.alert {
    background: var(--g-grave-bg);
    color: var(--g-grave-ink);
  }
  .rateblock {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .rateblock strong {
    font-variant-numeric: tabular-nums;
    font-size: 0.92rem;
  }
  .rateblock strong.low {
    color: var(--g-grave-ink);
  }
  .rbar {
    height: 5px;
    border-radius: 999px;
    background: var(--tint);
    overflow: hidden;
  }
  .rbar span {
    display: block;
    height: 100%;
    background: var(--ink);
    border-radius: 999px;
  }
  .rbar span.low {
    background: var(--g-grave-ink);
  }
  .rateblock small {
    color: var(--muted);
    font-size: 0.68rem;
    white-space: nowrap;
  }
  .detail-box {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 10px 14px;
    font-size: 0.8rem;
    margin: -2px 0 8px;
  }
  .detail-box .sp {
    flex: 1;
  }
  .weekstrip {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-bottom: 12px;
    flex-wrap: wrap;
  }
  .weekstrip span {
    background: var(--tint);
    border: 1px solid transparent;
    border-radius: 10px;
    padding: 7px 12px;
    display: flex;
    align-items: center;
    min-height: 44px;
  }
  .weekstrip small {
    color: var(--muted);
    font-size: 0.68rem;
  }
  .weekstrip span.today {
    background: var(--ink);
  }
  .weekstrip span.today small {
    color: var(--bg);
  }
  .history {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .history li {
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 12px 14px;
    min-height: 56px;
  }
  .sev {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: capitalize;
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 5px 12px 5px 8px;
    background: var(--surface);
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
    width: 8px;
    height: 8px;
    border-radius: 999px;
  }
  .sev.leve i {
    background: var(--g-leve-ink);
  }
  .sev.medio i {
    background: var(--g-medio-ink);
  }
  .sev.grave i {
    background: var(--g-grave-ink);
  }
  .railp {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 16px;
    box-shadow: var(--shadow);
    padding: 20px;
    align-self: start;
  }
  .rail-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }
  .rail-head h2 {
    font-size: 0.95rem;
    font-weight: 550;
  }
  .pill {
    background: var(--tint);
    color: var(--ink-soft);
    font-size: 0.72rem;
    font-weight: 600;
    border-radius: 999px;
    padding: 4px 11px;
  }
  .todos {
    list-style: none;
    margin: 6px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }
  .todos li {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 11px 0;
    border-top: 1px solid var(--line);
  }
  .todos li:first-child {
    border-top: 0;
  }
  .box {
    flex: none;
    width: 44px;
    height: 44px;
    border-radius: 999px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--bg);
    position: relative;
  }
  .box::before {
    content: '';
    width: 21px;
    height: 21px;
    border-radius: 999px;
    border: 1.5px solid var(--muted);
    background: var(--surface);
    position: absolute;
  }
  .box :global(svg) {
    position: relative;
    width: 15px;
    height: 15px;
  }
  li.done .box::before {
    background: var(--ink);
    border-color: var(--ink);
  }
  .todo-t {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .todo-t strong {
    font-size: 0.8rem;
    font-weight: 550;
  }
  .todo-t small {
    color: var(--muted);
    font-size: 0.72rem;
  }
  li.done .todo-t strong {
    text-decoration: line-through;
    color: var(--muted);
  }
  .todos .sev {
    margin-top: 10px;
  }
  .todos .soon {
    margin-top: 2px;
  }
  .go {
    flex: none;
    background: var(--surface-2);
    border: 1px solid var(--line);
    color: var(--ink);
    font-weight: 700;
    font-size: 0.76rem;
    white-space: nowrap;
    border-radius: 9px;
    padding: 8px 14px;
    min-height: 44px;
  }
  .fine {
    color: var(--muted);
    font-size: 0.72rem;
    margin-top: 10px;
  }
  @media (min-width: 700px) {
    .alerts {
      grid-template-columns: repeat(3, 1fr);
    }
    .gfx {
      grid-template-columns: 1.5fr 1fr;
    }
    .kpis {
      grid-template-columns: repeat(4, 1fr);
    }
    .sheet {
      padding: 24px 26px 130px;
    }
    .title {
      font-size: 2.6rem;
    }
    .controlbar {
      flex-direction: row;
      justify-content: flex-start;
      align-items: center;
      gap: 12px;
    }
    .search {
      min-width: 230px;
      flex: none;
    }
  }
  @media (min-width: 760px) {
    .prow-head {
      display: block;
      list-style: none;
      margin: 0 0 4px;
      padding: 0;
    }
    .prow-head li {
      display: grid;
      grid-template-columns: 34px 40px minmax(0, 1fr) 92px 92px 132px;
      gap: 10px;
      padding: 0 12px;
      color: var(--muted);
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .prow-head li .widespan {
      grid-column: span 2;
    }
    .prow {
      grid-template-columns: 34px 40px minmax(0, 1fr) 92px 92px 132px;
    }
    .prow .countchip {
      display: inline-flex;
    }
  }
  @media (min-width: 1220px) {
    .content {
      grid-template-columns: minmax(0, 1fr) 360px;
    }
    .railp {
      position: sticky;
      top: 16px;
      max-height: calc(100vh - 32px);
      overflow-y: auto;
    }
  }
</style>
