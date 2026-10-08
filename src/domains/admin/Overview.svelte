<script lang="ts">
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { t } from '$lib/i18n';
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import AdminTabs from './AdminTabs.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import Chart from '$lib/ui/Chart.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { cssVar } from '$lib/ui/cssvar';
  import { theme, type Theme } from '$lib/theme/theme';
  import { ApiError } from '$lib/api/types';
  import { guarded } from '$lib/nav';
  import { isMissing } from '../teacher/api';
  import {
    teachers,
    groupsByYear,
    classReport,
    dashboardSummary,
    warningsRecent,
    incidentsRecent,
    type TeacherSummary,
    type YearGroup,
    type RecentWarning,
    type RecentIncident
  } from './api';

  // Consola del administrador (identidad docs/diseno.md, referencia
  // proto/ConsolaAdmin.svelte): encabezado en crema sobre lámina blanca,
  // rail de Pendientes y tabs segmentados. Solo datos de endpoints reales;
  // lo que aún da 404 pinta vacío honesto, nunca datos falsos.

  type View = 'resumen' | 'salones' | 'historial';
  type Sev = 'leve' | 'medio' | 'grave';

  interface RiskRow {
    id: string;
    name: string;
    salon: string;
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
    action: 'go' | 'soon';
    href: string;
    done: boolean;
  }

  const RATE_FLOOR = 85;

  const currentYear = new Date().getFullYear();
  let year = currentYear;
  let view: View = 'resumen';

  let state: 'loading' | 'error' | 'ready' = 'loading';
  let teacherList: TeacherSummary[] = [];
  let teachersKnown = false;
  let groups: YearGroup[] = [];
  let groupsKnown = false;
  let totals = { presences: 0, absences: 0, evasions: 0, lates: 0, sessions: 0 };
  let reportsKnown = false;
  let reportCount = 0;
  let salonRates: { label: string; rate: number }[] = [];
  let risk: RiskRow[] = [];
  let warnings: RecentWarning[] = [];
  let incidents: RecentIncident[] = [];
  let summary: { students?: number; teachers?: number; groups?: number; warningsWeek?: number } | null = null;

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
    const s = new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  })();

  async function load() {
    state = 'loading';
    try {
      const [teacherData, groupData] = await Promise.all([
        guarded(() => teachers()),
        guarded(() => groupsByYear(year))
      ]);
      if (teacherData === null || groupData === null) return;
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
      state = 'error';
    }
  }

  async function loadReports() {
    totals = { presences: 0, absences: 0, evasions: 0, lates: 0, sessions: 0 };
    salonRates = [];
    risk = [];
    reportCount = 0;
    reportsKnown = false;
    // Sin /v1/classes en el backend, los salones con lista se descubren
    // por la dirección de grupo real de cada docente: solo esos reportes
    // existen, el resto es vacío honesto.
    const homerooms = [...new Set(teacherList.map((t) => t.HomeroomClassID).filter(Boolean))];
    const byStudent = new Map<
      string,
      { names: string; surnames: string; presences: number; absences: number; evasions: number; lates: number; sessions: number }
    >();
    const labelOf = new Map(groups.map((g) => [g.GroupID, g.ClassLabel]));
    for (const groupID of homerooms) {
      try {
        const report = await classReport(groupID);
        if (!report) continue;
        reportCount += 1;
        totals.sessions += report.Sessions;
        totals.presences += report.Totals.Presences;
        totals.absences += report.Totals.Absences;
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
            evasions: 0,
            lates: 0,
            sessions: 0
          };
          prev.presences += s.Presences;
          prev.absences += s.Absences;
          prev.evasions += s.Evasions;
          prev.lates += s.Lates;
          prev.sessions += s.Sessions;
          byStudent.set(s.StudentID, prev);
        }
      } catch {
        // Un reporte ausente es vacío honesto: se omite y la consola
        // sigue con los reportes que sí existen.
        continue;
      }
    }
    reportsKnown = true;
    salonRates.sort((a, b) => a.rate - b.rate);
    risk = [...byStudent.entries()]
      .map(([id, s]) => ({
        id,
        name: `${s.surnames}, ${s.names}`.trim().replace(/^,/, '').trim() || id,
        salon: '',
        absences: s.absences,
        evasions: s.evasions,
        lates: s.lates,
        sessions: s.sessions,
        rate: s.sessions > 0 ? Math.round((s.presences / s.sessions) * 100) : 0
      }))
      .filter((r) => r.sessions > 0 && (r.rate < RATE_FLOOR || r.absences + r.evasions >= 3))
      .sort((a, b) => a.rate - b.rate);
    await loadSecondary();
    buildTasks();
  }

  async function loadSecondary() {
    try {
      const data = await dashboardSummary();
      summary = data ?? null;
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
    for (const teacher of teacherList.filter((t) => !t.Active)) {
      next.push({
        id: `inactivo-${teacher.ID}`,
        sev: 'medio',
        title: `${teacher.Surnames} ${teacher.Names}`.trim(),
        meta: $t.admin.inactive,
        action: 'go',
        href: `/admin/docentes/${encodeURIComponent(teacher.ID)}`,
        done: false
      });
    }
    for (const row of risk.slice(0, 5)) {
      next.push({
        id: `riesgo-${row.id}`,
        sev: row.rate < 75 || row.evasions >= 2 ? 'grave' : 'medio',
        title: `${$t.admin.reviewAction}: ${row.name}`,
        meta: `${row.rate}% · ${row.absences} ${$t.admin.colAbsences} · ${row.evasions} ${$t.admin.colEvasions}`,
        action: 'soon',
        href: '',
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
  $: visibleRisk = risk.filter((r) => (q ? `${r.name} ${r.salon}`.toLowerCase().includes(q) : true));
  $: openTasks = tasks.filter((t) => !t.done).length;

  $: marksTotal = totals.presences + totals.absences + totals.evasions + totals.lates;
  $: hasDonut = marksTotal > 0;
  $: donutRate = hasDonut ? Math.round((totals.presences / marksTotal) * 100) : 0;

  $: graveCount = warnings.filter((w) => w.Gravity === 'severe').length;
  $: warningsKnown = warnings.length > 0;
  $: gravityCounts = [
    warnings.filter((w) => w.Gravity === 'mild').length,
    warnings.filter((w) => w.Gravity === 'moderate').length,
    warnings.filter((w) => w.Gravity === 'severe').length
  ];
  $: hasGravity = warnings.length > 0;
  $: hasSalonRates = salonRates.length > 0;

  $: donut = makeDonut($theme);
  $: gravityBars = makeGravityBars($theme);
  $: salonBars = makeSalonBars($theme);

  function makeDonut(_theme: Theme) {
    return {
      series: [
        {
          type: 'pie',
          radius: ['58%', '80%'],
          label: { show: false },
          data: hasDonut
            ? [
                { value: totals.presences, name: $t.admin.markPresent, itemStyle: { color: cssVar('--m-present', '#222') } },
                { value: totals.absences, name: $t.admin.markAbsence, itemStyle: { color: cssVar('--m-absent', '#bbb') } },
                { value: totals.evasions, name: $t.admin.markEvasion, itemStyle: { color: cssVar('--m-evasion', '#999') } },
                { value: totals.lates, name: $t.admin.markLate, itemStyle: { color: cssVar('--m-late', '#777') } }
              ]
            : []
        }
      ]
    };
  }

  function makeGravityBars(_theme: Theme) {
    return {
      xAxis: {
        type: 'category',
        data: [$t.roster.warnGravityMild, $t.roster.warnGravityModerate, $t.roster.warnGravitySevere]
      },
      yAxis: { type: 'value' },
      series: [
        {
          type: 'bar',
          data: [
            { value: gravityCounts[0], itemStyle: { color: cssVar('--g-leve-ink', '#2a7ab5') } },
            { value: gravityCounts[1], itemStyle: { color: cssVar('--g-medio-ink', '#8a6d00') } },
            { value: gravityCounts[2], itemStyle: { color: cssVar('--g-grave-ink', '#c0392b') } }
          ],
          itemStyle: { borderRadius: [8, 8, 0, 0] }
        }
      ]
    };
  }

  function makeSalonBars(_theme: Theme) {
    return {
      xAxis: { type: 'category', data: salonRates.map((s) => s.label) },
      yAxis: { type: 'value', max: 100 },
      series: [
        {
          type: 'bar',
          data: salonRates.map((s) => ({
            value: s.rate,
            itemStyle: {
              color:
                s.rate < RATE_FLOOR
                  ? cssVar('--g-grave-ink', '#c0392b')
                  : cssVar('--ink', '#222')
            }
          })),
          itemStyle: { borderRadius: [8, 8, 0, 0] }
        }
      ]
    };
  }

  $: statTeachers = summary?.teachers ?? (teachersKnown ? teacherList.length : null);
  $: statStudents = summary?.students ?? null;
  $: statGroups = summary?.groups ?? (groupsKnown ? (groups.length > 0 ? groups.length : null) : null);
  $: statWarnings = summary?.warningsWeek ?? (warningsKnown ? graveCount : null);
</script>

<div class="console">
  <aside class="side" aria-label={$t.admin.consoleEyebrow}>
    <div class="usercard">
      <span class="logo">SB</span>
      <span class="u-t"><strong>{$t.admin.schoolName}</strong><small>{$t.admin.schoolSite} · {year}</small></span>
    </div>
    <label class="sidesearch">
      <Icon name="search" />
      <input type="search" placeholder={$t.admin.consoleSearch} aria-label={$t.admin.consoleSearchLabel} bind:value={search} />
      <kbd title={$t.admin.consoleSearchLabel}>/</kbd>
    </label>
    <nav class="vnav" aria-label={$t.admin.manageTitle}>
      <p class="nav-cap">{$t.admin.manageTitle}</p>
      <button type="button" class:active={view === 'resumen'} on:click={() => (view = 'resumen')}>
        <Icon name="book" /> {$t.admin.viewOverview}
      </button>
      <button type="button" on:click={() => push('/admin/docentes')}><Icon name="users" /> {$t.nav.teachers}</button>
      <button type="button" on:click={() => push('/admin/estudiantes')}><Icon name="list" /> {$t.nav.students}</button>
      <button type="button" on:click={() => push('/admin/horario')}><Icon name="calendar" /> {$t.nav.schedule}</button>
      <button type="button" class="is-soon" disabled aria-disabled="true">
        <Icon name="warn" /> {$t.admin.navWarnings} <em>{$t.admin.soon}</em>
      </button>
    </nav>
    <div class="yearbox">
      <small>{$t.admin.yearLabel}</small>
      <div class="stepper">
        <button type="button" on:click={() => changeYear(-1)} aria-label={$t.a11y.prevYear}>‹</button>
        <strong>{year}</strong>
        <button type="button" on:click={() => changeYear(1)} aria-label={$t.a11y.nextYear}>›</button>
      </div>
    </div>
  </aside>

  <div class="body">
    <TopBar title={$t.admin.overviewTitle}><TopActions /></TopBar>
    <main class="main">
      <div class="pagehead">
        <p class="eyebrow">{$t.admin.consoleEyebrow}</p>
        <h1 class="title">{consoleTitle}</h1>
        <div class="controlbar">
          <div class="tabs" role="tablist" aria-label={$t.admin.consoleEyebrow}>
            <button type="button" role="tab" aria-selected={view === 'resumen'} class:on={view === 'resumen'} on:click={() => (view = 'resumen')}>
              {$t.admin.viewOverview}
            </button>
            <button type="button" role="tab" aria-selected={view === 'salones'} class:on={view === 'salones'} on:click={() => (view = 'salones')}>
              {$t.admin.viewSalons}
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
              <EmptyState icon="warn" title={$t.common.loadError} actionLabel={$t.common.retry} onAction={load} />
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
                      <button type="button" class="mini-act" on:click={() => (view = 'salones')}>{$t.admin.attActionList}</button>
                    {:else}
                      <span class="soon">{$t.admin.soon}</span>
                    {/if}
                  </div>
                </div>
                <div class="stat">
                  <div class="stat-in">
                    <small>{$t.admin.warningsTitle}</small>
                    <strong>{warningsKnown ? graveCount : '—'}</strong>
                    <span>{$t.admin.attNoData}</span>
                  </div>
                  <div class="stat-ft">
                    <span class="ibadge"><Icon name="warn" /></span>
                    <span>{$t.admin.callSoonNote}</span>
                    <span class="soon">{$t.admin.soon}</span>
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
                  <div class="panel-head"><h2>{$t.admin.attendanceTitle}</h2></div>
                  <div class="donut-wrap">
                    <Chart option={donut} empty={!hasDonut} emptyLabel={hasDonut ? $t.admin.attendanceTitle : ''} height={220} />
                    {#if hasDonut}<span class="donut-center">{donutRate}%</span>{/if}
                  </div>
                  <div class="legend pills">
                    <span><i class="sw k-present"></i>{$t.admin.markPresent}</span>
                    <span><i class="sw k-absent"></i>{$t.admin.markAbsence}</span>
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
                      <span>Nº</span><span class="widespan">{$t.admin.colStudent}</span><span>{$t.admin.colSalon}</span><span>{$t.admin.colAbsences}</span><span>{$t.admin.colEvasions}</span><span>{$t.admin.colRate}</span>
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
                          {#if row.salon}<span class="salonpill">{row.salon}</span>{/if}
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
                            <span class="soon">{$t.admin.openFile} · {$t.admin.soon}</span>
                            <span class="soon">{$t.admin.callAction} · {$t.admin.soon}</span>
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
            {:else if view === 'salones'}
              <p class="cat-kicker">{$t.admin.viewSalons}</p>
              <div class="panel">
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
              <div class="panel">
                <div class="panel-head">
                  <h2>{$t.admin.viewSalons}</h2>
                  <span class="count">{$t.admin.salonsCount(groups.length)}</span>
                </div>
                {#if groups.length === 0}
                  <EmptyState
                    icon="users"
                    title={$t.admin.noGroupsYear(year)}
                    body={$t.admin.noGroupsYearBody}
                  />
                {:else}
                  <ul class="salons">
                    {#each groups as group (group.GroupID)}
                      <li>
                        <strong>{group.ClassLabel}</strong>
                        <span>{$t.admin.groupStudents(group.StudentCount)}</span>
                      </li>
                    {/each}
                  </ul>
                {/if}
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
                  {#if !task.done}
                    {#if task.action === 'go'}
                      <button type="button" class="go" on:click={() => push(task.href)}>{$t.admin.reviewAction}</button>
                    {:else}
                      <span class="soon">{$t.admin.soon}</span>
                    {/if}
                  {/if}
                </li>
              {/each}
            </ul>
            <p class="fine">{$t.admin.pendingHint}</p>
          {/if}
        </aside>
      </div>
    </main>
  </div>
</div>

<AdminTabs active="resumen" />

<style>
  .console {
    min-height: 100vh;
    min-height: 100svh;
    background: var(--bg);
    color: var(--ink);
  }
  .side {
    display: none;
  }
  .body {
    min-width: 0;
    padding: 0 16px calc(96px + env(safe-area-inset-bottom));
  }
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
  .search,
  .sidesearch {
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
    flex: 1;
  }
  .search input,
  .sidesearch input {
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
  .detail-box .soon {
    margin-left: 0;
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
  .prow .salonpill,
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
  .salons,
  .history {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .salons li,
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
  .salons span {
    margin-left: auto;
    color: var(--muted);
    font-size: 0.85rem;
    font-weight: 600;
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
      justify-content: space-between;
      align-items: center;
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
  @media (min-width: 1020px) {
    .console {
      display: grid;
      grid-template-columns: 272px minmax(0, 1fr);
    }
    .side {
      display: flex;
      background: var(--bg);
      padding: 18px 14px;
      flex-direction: column;
      gap: 14px;
      position: sticky;
      top: 0;
      height: 100vh;
      height: 100svh;
    }
    .usercard {
      display: flex;
      gap: 10px;
      align-items: center;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 10px 12px;
      box-shadow: var(--shadow);
    }
    .logo {
      width: 36px;
      height: 36px;
      flex: none;
      background: var(--ink);
      color: var(--bg);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 0.72rem;
    }
    .u-t {
      display: flex;
      flex-direction: column;
      line-height: 1.25;
      min-width: 0;
    }
    .u-t strong {
      font-size: 0.82rem;
      white-space: nowrap;
    }
    .u-t small {
      color: var(--muted);
      font-size: 0.7rem;
    }
    .sidesearch {
      background: var(--tint);
      border-color: transparent;
      box-shadow: none;
      flex: none;
    }
    .vnav {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .nav-cap {
      color: var(--ink-soft);
      font-size: 0.78rem;
      font-weight: 500;
      padding: 0 12px 6px;
    }
    .vnav button {
      display: flex;
      gap: 10px;
      align-items: center;
      padding: 9px 12px;
      min-height: 44px;
      border-radius: 10px;
      color: var(--ink-soft);
      font-weight: 500;
      font-size: 0.86rem;
      border: 1px solid transparent;
      text-align: left;
    }
    .vnav button.active {
      background: var(--surface);
      border-color: var(--line);
      color: var(--ink);
      box-shadow: var(--shadow);
    }
    .vnav button.is-soon {
      opacity: 0.7;
    }
    .vnav em {
      margin-left: auto;
      font-style: normal;
      font-size: 0.7rem;
      background: var(--tint);
      border-radius: 999px;
      padding: 1px 8px;
      color: var(--muted);
    }
    .yearbox {
      border-top: 1px solid var(--line);
      padding: 14px 4px 0;
    }
    .yearbox small {
      color: var(--muted);
      font-weight: 600;
      font-size: 0.7rem;
    }
    .stepper {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-top: 6px;
    }
    .stepper strong {
      font-size: 1.3rem;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
    .stepper button {
      width: 44px;
      height: 44px;
      border-radius: 999px;
      border: 1px solid var(--line);
      background: var(--surface-2);
      font-size: 1.2rem;
      line-height: 1;
    }
    .body {
      padding: 26px 28px calc(96px + env(safe-area-inset-bottom));
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
