<script lang="ts">
  import { push } from 'svelte-spa-router';
  import { t } from '$lib/i18n';
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import AdminShell from './AdminShell.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { groupsByYear, createStudent, classReport, type YearGroup, type ClassReport } from './api';
  import { isMissing } from '../teacher/api';
  import { ApiError } from '$lib/api/types';
  import { guarded } from '$lib/nav';

  const currentYear = new Date().getFullYear();
  let year = currentYear;
  let groups: YearGroup[] = [];
  let loaded = false;
  let failed = false;
  let picked: YearGroup | null = null;

  let creating = false;
  let saving = false;
  let feedback = '';
  let form = freshForm();
  let report: ClassReport | null = null;
  let reportLoading = false;

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
    try {
      const data = await guarded(() => groupsByYear(year));
      if (data === null) return;
      groups = [...data].sort((a, b) => a.Grade - b.Grade || a.GroupNo - b.GroupNo);
      picked = null;
      loaded = true;
    } catch (err) {
      if (err instanceof ApiError && isMissing(err)) {
        groups = [];
        loaded = true;
      } else {
        failed = true;
      }
    }
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
    reportLoading = true;
    try {
      const data = await guarded(() => classReport(current.GroupID));
      report = data ?? null;
    } catch (err) {
      report = null;
    } finally {
      reportLoading = false;
    }
  }

  function rateOf(presences: number, sessions: number): number {
    return sessions > 0 ? Math.round((presences / sessions) * 100) : 0;
  }

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

<AdminShell active="estudiantes" {year} onYear={changeYear}>
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
    <EmptyState
      icon="warn"
      title={$t.common.loadError}
      actionLabel={$t.common.retry}
      onAction={load}
    />
  {:else if !loaded}
    <EmptyState icon="list" title={$t.admin.loadingGroups} />
  {:else if groups.length === 0}
    <EmptyState
      icon="users"
      title={$t.admin.noGroupsYear(year)}
      body={$t.admin.noGroupsYearBody}
    />
  {:else}
    <div class="chips">
      {#each groups as g (g.GroupID)}
        <button
          type="button"
          class="salon"
          class:selected={picked?.GroupID === g.GroupID}
          aria-pressed={picked?.GroupID === g.GroupID}
          on:click={() => pick(g)}
        >
          <strong>{g.ClassLabel}</strong>
          <span>{$t.admin.groupStudents(g.StudentCount)}</span>
        </button>
      {/each}
    </div>
    {#if picked}
      <section class="card" aria-label={$t.admin.reportTitle}>
        <h2>
          {$t.admin.groupDetailTitle(picked.ClassLabel, picked.SchoolYear)}
        </h2>
        {#if reportLoading}
          <p class="muted">{$t.admin.loadingGroups}</p>
        {:else if !report || report.Students.length === 0}
          <p class="muted">{$t.admin.reportEmpty}</p>
        {:else}
          <p class="muted">{$t.admin.reportSessions(report.Sessions)}</p>
          <ul class="ledger">
            {#each [...report.Students].sort((a, b) => rateOf(a.Presences, a.Sessions) - rateOf(b.Presences, b.Sessions)) as s (s.StudentID)}
              {@const rate = rateOf(s.Presences, s.Sessions)}
              <li>
                <span class="who"><strong>{s.Surnames} {s.Names}</strong><small>{s.Absences} {$t.admin.colAbsences} · {s.Evasions} {$t.admin.colEvasions} · {s.Lates} {$t.admin.markLate}</small></span>
                <span class="rateblock">
                  <strong class:low={rate < 85}>{rate}%</strong>
                  <span class="rbar"><span class:low={rate < 85} style={`width:${rate}%`}></span></span>
                </span>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {/if}
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
  .chips {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }
  @media (min-width: 900px) {
    .chips {
      grid-template-columns: repeat(3, 1fr);
    }
  }
  .salon {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    padding: 16px;
    min-height: 88px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    text-align: left;
    transition:
      border-color 0.15s ease,
      transform 0.1s ease;
    animation: rise 0.25s ease both;
  }
  .salon:active {
    transform: scale(0.97);
  }
  .salon.selected {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }
  .salon strong {
    font-size: 1.3rem;
  }
  .salon span {
    color: var(--muted);
    font-size: 0.85rem;
    font-weight: 600;
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
  .muted {
    color: var(--muted);
    font-size: 0.92rem;
    margin-top: 4px;
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
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 10px 14px;
    min-height: 56px;
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
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
</style>
