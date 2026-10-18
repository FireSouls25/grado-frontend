<script lang="ts">
  import { push } from 'svelte-spa-router';
  import { t } from '$lib/i18n';
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import AdminShell from './AdminShell.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ErrorState from '$lib/ui/ErrorState.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import { guarded } from '$lib/nav';
  import { teacherRollHistory, teacherRoll, type TeacherDayCard, type TeacherRollRow } from './api';
  import { rollDate } from './rollDate';

  const currentYear = new Date().getFullYear();

  function todayLocal(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function monthAgo(): string {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function prettyDay(value: string): string {
    const d = new Date(`${value}T12:00:00`);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  let from = monthAgo();
  let to = todayLocal();

  type State = 'loading' | 'error' | 'ready';
  let state: State = 'loading';
  let loadError: unknown = null;
  let cards: TeacherDayCard[] = [];

  let expanded: string | null = null;
  let detailRows: TeacherRollRow[] = [];
  let detailLoading = false;
  let showPresent = false;

  $: expandedCard = cards.find((c) => c.Day === expanded) ?? null;
  $: absentLate = detailRows.filter((r) => r.Status === 'absent' || r.Status === 'late');
  $: presentRows = detailRows.filter((r) => r.Status === 'present');

  async function load() {
    state = 'loading';
    loadError = null;
    expanded = null;
    detailRows = [];
    try {
      cards = (await guarded(() => teacherRollHistory(from, to))) ?? [];
      state = 'ready';
    } catch (err) {
      loadError = err;
      state = 'error';
    }
  }

  async function toggle(day: string) {
    showPresent = false;
    if (expanded === day) {
      expanded = null;
      detailRows = [];
      return;
    }
    expanded = day;
    detailLoading = true;
    detailRows = [];
    try {
      detailRows = (await guarded(() => teacherRoll(day))) ?? [];
    } finally {
      detailLoading = false;
    }
  }

  function modify(day: string) {
    rollDate.set(day);
    push('/admin/docentes/lista');
  }

  function statusName(s: string): string {
    return s === 'absent' ? $t.troll.statusAbsent : s === 'late' ? $t.troll.statusLate : $t.troll.statusPresent;
  }

  load();
</script>

<AdminShell active="docentes" year={currentYear}>
  <TopBar title={$t.troll.rollHistoryTitle} showBack onBack={() => push('/admin/docentes')}><TopActions /></TopBar>

  <div class="pagehead">
    <p class="eyebrow">{$t.admin.consoleEyebrow}</p>
    <h1 class="title">{$t.troll.rollHistoryTitle}</h1>
    <div class="filters">
      <label>
        <span>{$t.troll.historySearchFrom}</span>
        <input type="date" lang="es-CO" bind:value={from} max={to} on:change={load} />
      </label>
      <label>
        <span>{$t.troll.historySearchTo}</span>
        <input type="date" lang="es-CO" bind:value={to} min={from} max={todayLocal()} on:change={load} />
      </label>
    </div>
  </div>

  <div class="sheet">
    {#if state === 'loading'}
      <Skeleton rows={4} />
    {:else if state === 'error'}
      <ErrorState error={loadError} onRetry={load} />
    {:else if cards.length === 0}
      <EmptyState icon="calendar" title={$t.troll.rollHistoryTitle} body={$t.troll.rollHistoryEmpty} />
    {:else}
      <ul class="cards">
        {#each cards as card (card.Day)}
          <li class="card">
            <button type="button" class="chead" on:click={() => toggle(card.Day)} aria-expanded={expanded === card.Day}>
              <span class="cdate">
                <strong>{prettyDay(card.Day)}</strong>
                <small>{$t.troll.countTeachers(card.Total)}</small>
              </span>
              <span class="csum">
                <span class="chip ok">{card.Present}</span>
                <span class="chip bad">{card.Absent}</span>
                <span class="chip warn">{card.Late}</span>
              </span>
              <span class="chev" aria-hidden="true">{expanded === card.Day ? '▾' : '▸'}</span>
            </button>
            {#if expanded === card.Day}
              <div class="cbody">
                {#if detailLoading}
                  <Skeleton rows={2} />
                {:else}
                  {#if absentLate.length === 0}
                    <p class="muted">{$t.troll.allPresentNote}</p>
                  {:else}
                    <h3 class="sub">{$t.troll.absentOnes}</h3>
                    <ul class="names">
                      {#each absentLate as r (r.TeacherID)}
                        <li>
                          <span class={`sev ${r.Status === 'absent' ? 'grave' : 'medio'}`}>{statusName(r.Status)}</span>
                          <span class="ntext">
                            <strong>{r.TeacherName}</strong>
                            {#if r.Note}<small>{r.Note}</small>{/if}
                          </span>
                        </li>
                      {/each}
                    </ul>
                  {/if}
                  {#if presentRows.length > 0}
                    <button type="button" class="link" on:click={() => (showPresent = !showPresent)}>
                      {showPresent ? $t.troll.hidePresent : `${$t.troll.showPresent} (${presentRows.length})`}
                    </button>
                    {#if showPresent}
                      <ul class="names plain">
                        {#each presentRows as r (r.TeacherID)}
                          <li>{r.TeacherName}</li>
                        {/each}
                      </ul>
                    {/if}
                  {/if}
                  <button type="button" class="mini" on:click={() => modify(card.Day)}>
                    {$t.troll.modifyAction}
                  </button>
                {/if}
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</AdminShell>

<style>
  .pagehead {
    margin-bottom: 12px;
  }
  .eyebrow {
    color: var(--muted);
    font-size: 0.85rem;
    margin-bottom: 2px;
  }
  .title {
    margin: 0;
  }
  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 10px;
  }
  .filters label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--muted);
  }
  .filters input {
    min-height: 44px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface-2);
    padding: 0 12px;
    font-weight: 600;
    font-size: 0.85rem;
    color: var(--ink);
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
  .cards {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .cards .card {
    padding: 0;
    overflow: hidden;
  }
  .chead {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    text-align: left;
  }
  .cdate {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .cdate strong {
    font-size: 1rem;
    text-transform: capitalize;
  }
  .cdate small {
    color: var(--muted);
    font-size: 0.78rem;
    font-weight: 600;
  }
  .csum {
    display: flex;
    gap: 6px;
  }
  .chip {
    min-width: 34px;
    text-align: center;
    border-radius: 999px;
    padding: 4px 10px;
    font-size: 0.8rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .chip.ok {
    background: var(--chip-green-bg);
    color: var(--chip-green-ink);
  }
  .chip.bad {
    background: var(--chip-pink-bg);
    color: var(--g-grave-ink);
  }
  .chip.warn {
    background: var(--chip-yellow-bg);
    color: var(--chip-yellow-ink);
  }
  .chev {
    color: var(--muted);
    font-size: 0.9rem;
  }
  .cbody {
    border-top: 1px solid var(--line);
    padding: 12px 16px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .muted {
    color: var(--muted);
    font-size: 0.85rem;
  }
  .sub {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
    margin: 0;
  }
  .names {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .names li {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }
  .names.plain li {
    color: var(--muted);
    font-size: 0.88rem;
  }
  .sev {
    flex: none;
    border-radius: 999px;
    padding: 2px 10px;
    font-size: 0.7rem;
    font-weight: 700;
  }
  .sev.medio {
    background: var(--chip-yellow-bg);
    color: var(--chip-yellow-ink);
  }
  .sev.grave {
    background: var(--chip-pink-bg);
    color: var(--g-grave-ink);
  }
  .ntext {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .ntext strong {
    font-size: 0.92rem;
  }
  .ntext small {
    color: var(--muted);
    font-size: 0.78rem;
  }
  .link {
    align-self: flex-start;
    color: var(--accent);
    font-weight: 700;
    font-size: 0.82rem;
    min-height: 36px;
    padding: 4px 0;
  }
  .mini {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    min-height: 40px;
    padding: 0 16px;
    border-radius: var(--radius-pill);
    background: var(--tint);
    font-weight: 700;
    font-size: 0.82rem;
  }
</style>
