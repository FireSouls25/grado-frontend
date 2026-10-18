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
  import { teacherRollHistory, teacherRoll, teacherDayRevisions, type TeacherDayCard, type TeacherRollRow, type TeacherDayRevision } from './api';
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
  let showRevisions = false;
  let revisions: TeacherDayRevision[] = [];
  let revisionsLoading = false;

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
    showRevisions = false;
    if (expanded === day) {
      expanded = null;
      detailRows = [];
      revisions = [];
      return;
    }
    expanded = day;
    detailLoading = true;
    revisionsLoading = true;
    detailRows = [];
    revisions = [];
    try {
      const [rows, revs] = await Promise.all([
        guarded(() => teacherRoll(day)),
        guarded(() => teacherDayRevisions(day))
      ]);
      detailRows = rows ?? [];
      revisions = revs ?? [];
    } finally {
      detailLoading = false;
      revisionsLoading = false;
    }
  }

  function modify(day: string) {
    rollDate.set(day);
    push('/admin/docentes/lista');
  }

  function markClass(m: string): string {
    return m === 'absence' || m === 'absent'
      ? 'is-absent'
      : m === 'late'
        ? 'is-late'
        : m === 'evasion'
          ? 'is-evasion'
          : 'is-present';
  }

  function statusName(s: string): string {
    return s === 'absent' ? $t.troll.statusAbsent : s === 'late' ? $t.troll.statusLate : $t.troll.statusPresent;
  }

  function momentTs(value: string): string {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString('es-CO', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
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
                    <button type="button" class="mini" on:click={() => (showPresent = !showPresent)}>
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
                  <button type="button" class="link" on:click={() => (showRevisions = !showRevisions)}>
                    {showRevisions ? $t.troll.hideRevisions : `${$t.troll.showRevisions} (${revisions.length})`}
                  </button>
                  {#if showRevisions}
                    {#if revisionsLoading}
                      <Skeleton rows={2} />
                    {:else if revisions.length === 0}
                      <p class="muted">{$t.troll.revisionsEmpty}</p>
                    {:else}
                      <ul class="revs">
                        {#each revisions as r (r.TeacherID + r.RecordedAt + r.NewStatus)}
                          <li class="rev">
                            <span class="changerow">
                              <span class="person">{r.TeacherName}</span>
                              <span class="change">
                                {#if r.OldStatus}
                                  <span class={`mk ${markClass(r.OldStatus)}`}>{statusName(r.OldStatus)}</span>
                                  <span class="swap" aria-hidden="true">›</span>
                                {:else}
                                  <span class="first">{$t.troll.revisionFirst}</span>
                                {/if}
                                <span class={`mk solid ${markClass(r.NewStatus)}`}>{statusName(r.NewStatus)}</span>
                              </span>
                            </span>
                            {#if r.Note}<small class="revnote">{r.Note}</small>{/if}
                            <span class="meta">
                              <span class="box">{r.Author}</span>
                              <span class="box">{momentTs(r.RecordedAt)}</span>
                            </span>
                          </li>
                        {/each}
                      </ul>
                    {/if}
                  {/if}
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
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow);
  }
  .revs {
    list-style: none;
    margin: 0;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
  }
  .revs li.rev {
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 10px 12px;
  }
  .changerow {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .person {
    align-self: flex-start;
    background: var(--tint);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 3px 10px;
    font-size: 0.82rem;
    font-weight: 800;
  }
  .change {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 4px 12px 4px 4px;
  }
  .mk {
    border-radius: 999px;
    padding: 3px 12px;
    font-size: 0.75rem;
    font-weight: 800;
    border: 2px solid transparent;
  }
  .mk.is-present {
    color: var(--chip-green-ink);
    border-color: var(--chip-green-ink);
  }
  .mk.is-absent {
    color: var(--g-grave-ink);
    border-color: var(--g-grave-ink);
  }
  .mk.is-late {
    color: var(--chip-yellow-ink);
    border-color: var(--chip-yellow-ink);
  }
  .mk.is-evasion {
    color: var(--chip-purple-ink);
    border-color: var(--chip-purple-ink);
  }
  .mk.solid.is-present {
    background: var(--chip-green-bg);
    border-color: transparent;
  }
  .mk.solid.is-absent {
    background: var(--chip-pink-bg);
    border-color: transparent;
  }
  .mk.solid.is-late {
    background: var(--chip-yellow-bg);
    border-color: transparent;
  }
  .mk.solid.is-evasion {
    background: var(--chip-purple-bg);
    border-color: transparent;
  }
  .swap {
    flex: none;
    width: 22px;
    height: 22px;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.95rem;
    font-weight: 800;
  }
  .first {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--muted);
  }
  .revnote {
    color: var(--muted);
    font-size: 0.8rem;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .meta .box {
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 2px 10px;
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--ink-soft);
    font-variant-numeric: tabular-nums;
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
