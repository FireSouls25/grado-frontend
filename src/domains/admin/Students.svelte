<script lang="ts">
  import { push } from 'svelte-spa-router';
  import { t } from '$lib/i18n';
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import AdminShell from './AdminShell.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ErrorState from '$lib/ui/ErrorState.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Dropdown from '$lib/ui/Dropdown.svelte';
  import { groupsByYear, createStudent, classReport, warningsRecent, teachers, type YearGroup, type ClassReport, type RecentWarning, type TeacherSummary } from './api';
  import { isMissing } from '../teacher/api';
  import { ApiError } from '$lib/api/types';
  import { guarded } from '$lib/nav';

  const currentYear = new Date().getFullYear();
  let year = currentYear;
  let groups: YearGroup[] = [];
  let loaded = false;
  let failed = false;
  let loadError: unknown = null;
  let picked: YearGroup | null = null;

  let creating = false;
  let saving = false;
  let feedback = '';
  let form = freshForm();
  let report: ClassReport | null = null;
  let reportLoading = false;
  let warns: RecentWarning[] = [];
  let teacherList: TeacherSummary[] = [];
  let reports: Record<string, ClassReport> = {};
  let q2 = '';
  let minAbs = '';
  let minLate = '';
  let fWarn: '' | 'yes' = '';

  function freshForm() {
    return {
      Names: '',
      Surnames: '',
      ClassID: '',
      DocumentID: '',
      Birthdate: '',
      CaregiverName: '',
      CaregiverPhone: ''
    };
  }

  async function load() {
    failed = false;
    loadError = null;
    try {
      const data = await guarded(() => groupsByYear(year));
      if (data === null) {
        groups = [];
        picked = null;
        loaded = true;
        return;
      }
      groups = [...data].sort((a, b) => a.Grade - b.Grade || a.GroupNo - b.GroupNo);
      picked = null;
      loaded = true;
      void loadTeachers();
      void loadReports();
      void loadWarns();
    } catch (err) {
      if (err instanceof ApiError && isMissing(err)) {
        groups = [];
        loaded = true;
      } else {
        loadError = err;
        failed = true;
      }
    }
  }

  async function loadTeachers() {
    try {
      teacherList = (await guarded(() => teachers())) ?? [];
    } catch {
      teacherList = [];
    }
  }

  async function loadReports() {
    const settled = await Promise.allSettled(groups.map((g) => classReport(g.GroupID)));
    const next: Record<string, ClassReport> = {};
    settled.forEach((result, i) => {
      if (result.status === 'fulfilled' && result.value) next[groups[i].GroupID] = result.value;
    });
    reports = next;
  }

  async function loadWarns() {
    try {
      warns = (await warningsRecent(100)) ?? [];
    } catch {
      warns = [];
    }
  }

  function directorOf(label: string): TeacherSummary | null {
    return teacherList.find((t) => t.HomeroomClassID === label) ?? null;
  }

  function changeYear(delta: number) {
    year += delta;
    loaded = false;
    load();
  }

  // Reporte real del salón elegido: lista pasada tal como la guardó el
  // docente. Si el backend aún no tiene sesiones, vacío honesto.
  async function pick(group: YearGroup | null) {
    picked = picked?.GroupID === group?.GroupID ? null : group;
    report = null;
    const current = picked;
    if (!current) return;
    report = reports[current.GroupID] ?? null;
    if (report) {
      reportLoading = false;
      return;
    }
    reportLoading = true;
    try {
      const data = await guarded(() => classReport(current.GroupID));
      report = data ?? null;
      if (report) reports = { ...reports, [current.GroupID]: report };
    } catch (err) {
      report = null;
    } finally {
      reportLoading = false;
    }
  }

  function rateOf(presences: number, sessions: number): number {
    return sessions > 0 ? Math.round((presences / sessions) * 100) : 0;
  }

  // Exportación a CSV: secretaría pide la lista en Excel, no una captura de
  // pantalla. Se arma en el cliente con lo que ya está en memoria (sin
  // endpoint nuevo) y se descarga como archivo.
  function csvCell(value: string | number): string {
    const raw = String(value ?? '');
    return /[";\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
  }

  function exportCsv() {
    if (visibleRoster.length === 0) return;
    const header = [
      $t.admin.colStudent,
      $t.admin.colSalon,
      $t.admin.colAbsences,
      $t.admin.colEvasions,
      $t.admin.colRate
    ];
    const rows = visibleRoster.map((s) =>
      [
        `${s.Surnames}, ${s.Names}`,
        s.group,
        s.Absences,
        s.Evasions,
        `${s.rate}%`
      ]
        .map(csvCell)
        .join(';')
    );
    const csv = [header.map(csvCell).join(';'), ...rows].join('\r\n');
    // BOM para que Excel reconozca UTF-8 y no rompa los acentos.
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const scope = picked ? picked.ClassLabel : 'todos';
    link.href = url;
    link.download = `asistencia-${scope}-${year}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    feedback = $t.admin.exported;
  }

  $: allRoster = groups.flatMap((g) =>
    (reports[g.GroupID]?.Students ?? []).map((s) => ({
      ...s,
      group: g.ClassLabel,
      rate: rateOf(s.Presences, s.Sessions),
      calls: warns.filter((w) => w.StudentID === s.StudentID).length
    }))
  );
  $: qn = q2.trim().toLowerCase();
  $: nAbs = Number(minAbs) || 0;
  $: nLate = Number(minLate) || 0;
  $: visibleRoster = allRoster
    .filter((s) => (picked ? s.group === picked.ClassLabel : true))
    .filter((s) => (qn ? `${s.Surnames} ${s.Names}`.toLowerCase().includes(qn) : true))
    .filter((s) => s.Absences >= nAbs && s.Lates >= nLate)
    .filter((s) => (fWarn === 'yes' ? s.calls > 0 : true))
    .sort((a, b) => a.rate - b.rate);
  $: hasAnyStudents = allRoster.length > 0;
  $: loadingReports = groups.length > 0 && Object.keys(reports).length === 0;

  async function save() {
    feedback = '';
    saving = true;
    try {
      await createStudent({
        Names: form.Names.trim(),
        Surnames: form.Surnames.trim(),
        ClassID: form.ClassID.trim(),
        DocumentID: form.DocumentID.trim(),
        Birthdate: form.Birthdate,
        Caregiver: { Names: form.CaregiverName.trim(), Phone: form.CaregiverPhone.trim() }
      });
      feedback = $t.admin.createdStudent;
      form = freshForm();
    } catch (err) {
      feedback = err instanceof ApiError ? err.message : $t.common.loadError;
    } finally {
      saving = false;
    }
  }

  import { onMount } from 'svelte';
  onMount(load);
</script>

<!-- El año se controla solo desde la barra de la página: el stepper de la
     lateral es redundante en escritorio y además no existe en móvil. -->
<AdminShell active="estudiantes" {year}>
  <TopBar title={$t.admin.studentsTitle} showBack onBack={() => push('/admin')}><TopActions /></TopBar>

  <div class="pagehead">
    <p class="eyebrow">{$t.admin.consoleEyebrow}</p>
    <div class="yearbar">
      <button type="button" class="icon-btn" on:click={() => changeYear(-1)} aria-label={$t.a11y.prevYear}>
        <Icon name="back" />
      </button>
      <strong>{year}</strong>
      <button type="button" class="icon-btn" on:click={() => changeYear(1)} aria-label={$t.a11y.nextYear}>
        <Icon name="next" />
      </button>
      <button type="button" class="new" on:click={() => { creating = true; feedback = ''; }}>
        {$t.admin.newStudent}
      </button>
    </div>
  </div>

  <div class="sheet">

  {#if failed}
    <ErrorState error={loadError} onRetry={load} />
  {:else if !loaded}
    <EmptyState icon="list" title={$t.admin.loadingGroups} />
  {:else if groups.length === 0}
    <EmptyState
      icon="users"
      title={$t.admin.noGroupsYear(year)}
      body={$t.admin.noGroupsYearBody}
    />
  {:else}
    <div class="filters" role="group" aria-label={$t.admin.reportTitle}>
      <label class="search">
        <Icon name="search" />
        <input type="search" placeholder={$t.admin.studentSearch} aria-label={$t.admin.studentSearch} bind:value={q2} />
      </label>
      <label>{$t.admin.minAbsences}<input type="number" min="0" inputmode="numeric" bind:value={minAbs} /></label>
      <label>{$t.admin.minLates}<input type="number" min="0" inputmode="numeric" bind:value={minLate} /></label>
      <Dropdown
        label={$t.admin.warnFilter}
        value={fWarn}
        options={[
          { value: '', label: $t.admin.warnAny },
          { value: 'yes', label: $t.admin.warnWith }
        ]}
        on:select={(e) => (fWarn = e.detail === 'yes' ? 'yes' : '')}
      />
      <span class="count" role="status">{$t.admin.rosterCount(visibleRoster.length)}</span>
    </div>
    {#if picked}
      <button type="button" class="back" on:click={() => (picked = null)}>‹ {$t.admin.backSalons}</button>
    {:else}
      <div class="salonlist" role="group" aria-label={$t.admin.studentsTitle}>
        {#each groups as g (g.GroupID)}
          {@const dir = directorOf(g.ClassLabel)}
          {@const known = g.GroupID in reports}
          <button
            type="button"
            class="salonrow"
            on:click={() => pick(g)}
          >
            <span class="who">
              <strong>{g.ClassLabel}</strong>
              <small>{dir ? `${dir.Surnames} ${dir.Names}`.trim() : $t.admin.noDirector}</small>
            </span>
            <span class="sub">{known ? $t.admin.groupStudents(reports[g.GroupID].Students.length) : '—'}</span>
            <span class="go" aria-hidden="true"><Icon name="next" /></span>
          </button>
        {/each}
      </div>
    {/if}
    <section class="card" aria-label={$t.admin.reportTitle}>
      <div class="card-head">
        <h2>{picked ? $t.admin.groupDetailTitle(picked.ClassLabel, picked.SchoolYear) : $t.admin.globalRoster}</h2>
        {#if visibleRoster.length > 0}
          <button type="button" class="mini" on:click={exportCsv}>
            <Icon name="list" /> {$t.admin.exportCsv}
          </button>
        {/if}
      </div>
      {#if loadingReports}
        <p class="muted">{$t.admin.loadingRoster}</p>
      {:else if picked && reportLoading}
        <p class="muted">{$t.admin.loadingGroups}</p>
      {:else if visibleRoster.length === 0}
        <EmptyState icon="list" title={hasAnyStudents ? $t.admin.rosterEmptySearch : $t.admin.reportEmpty} />
      {:else}
        {#if picked && report}<p class="muted">{$t.admin.reportSessions(report.Sessions)}</p>{/if}
        <ul class="ledger">
          {#each visibleRoster as s (s.StudentID + s.group)}
            <li>
              <button
                type="button"
                class="stu"
                on:click={() => push(`/admin/estudiantes/${encodeURIComponent(s.StudentID)}`)}
                aria-label={`${$t.studentDetail.title}: ${s.Surnames} ${s.Names}`}
              >
                <span class="who">
                  <strong>{s.Surnames} {s.Names}</strong>
                  <small>
                    {#if !picked}<span class="countchip">{s.group}</span>{/if}
                    <span class="countchip">{s.Absences} {$t.admin.colAbsences}</span>
                    <span class="countchip" class:alert={s.Evasions > 0}>{s.Evasions} {$t.admin.colEvasions}</span>
                    <span class="countchip" class:alert={s.Lates > 0}>{s.Lates} {$t.admin.markLate}</span>
                    {#if s.calls > 0}<span class="countchip warn">{$t.admin.callsCount(s.calls)}</span>{/if}
                  </small>
                </span>
                <span class="rateblock">
                  <strong class:low={s.rate < 85}>{s.rate}%</strong>
                  <span class="rbar"><span class:low={s.rate < 85} style={`width:${s.rate}%`}></span></span>
                </span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}
  </div>
</AdminShell>

<Sheet open={creating} title={$t.admin.newStudent} onClose={() => (creating = false)}>
  <form class="form" on:submit|preventDefault={save}>
    <div class="row2">
      <label>{$t.admin.formNames}<input bind:value={form.Names} autocomplete="off" /></label>
      <label>{$t.admin.formSurnames}<input bind:value={form.Surnames} autocomplete="off" /></label>
    </div>
    <div class="row2">
      <label>{$t.admin.formDocument}<input bind:value={form.DocumentID} placeholder={$t.admin.formDocumentPlaceholder} inputmode="numeric" pattern="[0-9]*" autocomplete="off" /></label>
      <label>{$t.admin.formClass}<input bind:value={form.ClassID} placeholder={$t.admin.formClassPlaceholder} autocomplete="off" /></label>
    </div>
    <label>{$t.admin.formBirthdate}<input type="date" bind:value={form.Birthdate} /></label>
    <div class="row2">
      <label>{$t.admin.formCaregiverName}<input bind:value={form.CaregiverName} autocomplete="off" /></label>
      <label>{$t.admin.formCaregiverPhone}<input bind:value={form.CaregiverPhone} inputmode="tel" autocomplete="off" /></label>
    </div>
    {#if feedback}<p class="flash" role="status">{feedback}</p>{/if}
    <button class="primary" type="submit" disabled={saving}>
      {saving ? '…' : $t.admin.formCreate}
    </button>
  </form>
</Sheet>

<style>
  .pagehead {
    margin-bottom: 12px;
  }
  .eyebrow {
    color: var(--muted);
    font-size: 0.85rem;
    margin-bottom: 8px;
  }
  .sheet {
    background: var(--surface);
    border: 1px solid var(--line);
    border-bottom: 0;
    border-radius: 24px 24px 0 0;
    padding: 16px 16px 130px;
  }
  @media (min-width: 700px) {
    .sheet {
      padding: 20px 20px 130px;
    }
  }
  .yearbar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
  }
  .yearbar strong {
    font-size: 1.2rem;
    min-width: 72px;
    text-align: center;
  }
  .icon-btn {
    width: 44px;
    height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-pill);
    background: var(--surface);
    border: 1px solid var(--line);
    color: var(--muted);
  }
  .icon-btn:active {
    transform: scale(0.92);
  }
  .new {
    margin-left: auto;
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 700;
    min-height: 44px;
    padding: 10px 18px;
    border-radius: var(--radius-pill);
    white-space: nowrap;
  }
  .new:active {
    transform: scale(0.97);
  }
  .form {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .form label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-weight: 600;
    font-size: 0.9rem;
  }
  .row2 {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
  }
  @media (min-width: 420px) {
    .row2 {
      grid-template-columns: 1fr 1fr;
    }
  }
  .form input {
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 12px 14px;
    min-height: 52px;
    width: 100%;
  }
  .form input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .flash {
    background: var(--chip-green-bg);
    color: var(--chip-green-ink);
    font-weight: 600;
    font-size: 0.9rem;
    border-radius: var(--radius-chip);
    padding: 10px 14px;
  }
  .primary {
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 700;
    min-height: 54px;
    border-radius: var(--radius-pill);
    margin-top: 4px;
  }
  .primary:disabled {
    opacity: 0.7;
  }
  .back {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    padding: 8px 16px 8px 12px;
    border-radius: var(--radius-pill);
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--ink);
    font-weight: 700;
    font-size: 0.84rem;
    margin-bottom: 10px;
  }
  .back:active {
    transform: scale(0.97);
  }
  .salonlist {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 18px 0 12px;
  }
  .salonrow {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    text-align: left;
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    padding: 14px 16px;
    min-height: 68px;
  }
  .salonrow:active {
    transform: scale(0.98);
  }
  .salonrow .who {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .salonrow strong {
    font-size: 1.2rem;
    font-variant-numeric: tabular-nums;
  }
  .salonrow small {
    color: var(--ink-soft);
    font-size: 0.8rem;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .salonrow .sub {
    color: var(--muted);
    font-size: 0.8rem;
    font-weight: 600;
    white-space: nowrap;
  }
  .go {
    flex: none;
    width: 40px;
    height: 40px;
    border-radius: var(--radius-pill);
    background: var(--surface-2);
    color: var(--muted);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .card {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow);
    padding: 18px;
    margin-top: 12px;
  }
  .card p {
    color: var(--muted);
    font-size: 0.92rem;
  }
  .filters {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin: 12px 0 4px;
    align-items: end;
  }
  @media (min-width: 700px) {
    .filters {
      grid-template-columns: 2fr 1fr 1fr 1fr auto;
    }
  }
  .filters > label.search {
    display: flex;
    flex-direction: row;
    gap: 8px;
    align-items: center;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 0 12px;
    min-height: 44px;
    color: var(--muted);
  }
  .filters > label.search input {
    border: 0;
    background: none;
    outline: none;
    width: 100%;
    flex: 1;
    min-width: 0;
    color: var(--ink);
  }
  .filters > label.search :global(svg) {
    flex: none;
  }
  .filters label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--muted);
  }
  .filters input:not([type='search']) {
    min-height: 44px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface-2);
    padding: 0 12px;
    font-weight: 600;
    font-size: 0.84rem;
    color: var(--ink);
    width: 100%;
  }
  .count {
    align-self: center;
    justify-self: end;
    background: var(--tint);
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 7px 16px;
    color: var(--ink-soft);
    font-size: 0.8rem;
    font-weight: 700;
    white-space: nowrap;
  }
  .ledger .who small {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 4px;
  }
  .countchip {
    background: var(--tint);
    border-radius: 999px;
    padding: 3px 10px;
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--ink-soft);
    white-space: nowrap;
  }
  .countchip.alert {
    background: var(--g-grave-bg);
    color: var(--g-grave-ink);
  }
  .countchip.warn {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .muted {
    color: var(--muted);
    font-size: 0.92rem;
    margin-top: 4px;
  }
  .card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 8px;
  }
  .card-head h2 {
    font-size: 1.05rem;
  }
  .mini {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 36px;
    padding: 0 14px;
    border-radius: var(--radius-pill);
    border: 1px solid var(--line);
    background: var(--surface);
    font-weight: 600;
    font-size: 0.8rem;
    color: var(--muted);
    white-space: nowrap;
  }
  .mini:hover {
    color: var(--ink);
  }
  .mini :global(svg) {
    width: 15px;
    height: 15px;
  }
  .ledger {
    list-style: none;
    margin: 12px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .ledger li {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    min-height: 56px;
  }
  /* La fila abre la ficha del estudiante: sin cruda que se note el toque. */
  .stu {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    text-align: left;
    padding: 10px 14px;
    border-radius: var(--radius-chip);
    transition:
      background-color 0.15s ease,
      transform 0.1s ease;
  }
  .stu:hover {
    background: var(--surface-2);
  }
  .stu:active {
    transform: scale(0.99);
  }
  .ledger .who {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .ledger .who strong {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ledger .who small {
    color: var(--muted);
    font-size: 0.78rem;
  }
  .rateblock {
    display: flex;
    flex-direction: column;
    gap: 3px;
    flex: none;
    min-width: 76px;
  }
  .rateblock strong {
    font-variant-numeric: tabular-nums;
    font-size: 0.92rem;
    text-align: right;
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
</style>
