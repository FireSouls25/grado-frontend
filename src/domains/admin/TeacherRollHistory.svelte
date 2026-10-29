<script lang="ts">
  import { push } from 'svelte-spa-router';
  import { t } from '$lib/i18n';
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import AdminShell from './AdminShell.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ErrorState from '$lib/ui/ErrorState.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { guarded, goBack } from '$lib/nav';
  import { teacherRollHistory, teacherRoll, teacherDayRevisions, type TeacherDayCard, type TeacherRollRow, type TeacherDayRevision } from './api';
  import { rollDate } from './rollDate';

  const currentYear = new Date().getFullYear();

  function todayLocal(): string {
    const d = new Date();
    const fmtTwo = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    return `${d.getFullYear()}-${fmtTwo(d.getMonth() + 1)}-${fmtTwo(d.getDate())}`;
  }

  function monthAgo(): string {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    const fmtTwo = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    return `${d.getFullYear()}-${fmtTwo(d.getMonth() + 1)}-${fmtTwo(d.getDate())}`;
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
  <TopBar title={$t.troll.rollHistoryTitle} showBack onBack={() => goBack('/admin/docentes')}>
    <button type="button" class="btn btn-primary" on:click={() => push('/admin/docentes/lista')}>
      {$t.troll.rollAction}
    </button>
    <TopActions />
  </TopBar>

  <div class="sheet">
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
                <span class="chip ok" title={$t.troll.statusPresent}>{card.Present}</span>
                <span class="chip bad" title={$t.troll.statusAbsent}>{card.Absent}</span>
                <span class="chip warn" title={$t.troll.statusLate}>{card.Late}</span>
              </span>
              <span class="chev" class:open={expanded === card.Day} aria-hidden="true"><Icon name="next" /></span>
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
                  <div class="btnrow">
                    {#if presentRows.length > 0}
                      <button type="button" class="btn btn-sm" on:click={() => (showPresent = !showPresent)}>
                        {showPresent ? $t.troll.hidePresent : `${$t.troll.showPresent} (${presentRows.length})`}
                      </button>
                    {/if}
                    <button type="button" class="btn btn-sm" on:click={() => modify(card.Day)}>
                      {$t.troll.modifyAction}
                    </button>
                    <button type="button" class="btn btn-sm" on:click={() => (showRevisions = !showRevisions)}>
                      {showRevisions ? $t.troll.hideRevisions : $t.troll.showRevisions}
                    </button>
                  </div>
                  {#if showPresent && presentRows.length > 0}
                    <ul class="names plain">
                      {#each presentRows as r (r.TeacherID)}
                        <li>{r.TeacherName}</li>
                      {/each}
                    </ul>
                  {/if}
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
  .sheet {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-sheet);
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .filters label {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: var(--fs-small);
    font-weight: 500;
    color: var(--muted);
  }
  .filters input {
    min-height: var(--control-height);
    border: 1px solid var(--control);
    border-radius: var(--radius-control);
    background: var(--surface);
    padding: 0 12px;
    font-weight: 500;
    font-size: 0.84rem;
    color: var(--ink);
  }
  .cards {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .cards .card {
    padding: 0;
    overflow: hidden;
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
  }
  .chead {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    text-align: left;
  }
  .chead:hover {
    background: var(--surface-2);
  }
  .cdate {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .cdate strong {
    font-size: 0.92rem;
    font-weight: 600;
    text-transform: capitalize;
  }
  .cdate small {
    color: var(--muted);
    font-size: 0.76rem;
    font-variant-numeric: tabular-nums;
  }
  .csum {
    display: flex;
    gap: 6px;
  }
  .chip {
    min-width: 30px;
    text-align: center;
    border-radius: 999px;
    padding: 3px 9px;
    font-size: 0.76rem;
    font-weight: 600;
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
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--muted);
  }
  .chev :global(svg) {
    width: 16px;
    height: 16px;
    transform: rotate(90deg);
    transition: transform var(--t-fast) var(--ease-out);
  }
  .chev.open :global(svg) {
    transform: rotate(-90deg);
  }
  .cbody {
    border-top: 1px solid var(--line);
    background: var(--surface);
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .btnrow {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .muted {
    color: var(--muted);
    font-size: 0.84rem;
  }
  .sub {
    font-size: 0.76rem;
    font-weight: 600;
    color: var(--muted);
    margin: 0;
  }
  .names {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .names li {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }
  .names.plain li {
    color: var(--muted);
    font-size: 0.84rem;
  }
  .sev {
    flex: none;
    border-radius: 999px;
    padding: 2px 9px;
    font-size: 0.72rem;
    font-weight: 600;
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
    font-size: 0.86rem;
  }
  .ntext small {
    color: var(--muted);
    font-size: 0.76rem;
  }
  .revs {
    list-style: none;
    margin: 0;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-control);
  }
  .revs li.rev {
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 10px 12px;
  }
  .changerow {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .person {
    background: var(--tint);
    border-radius: 6px;
    padding: 2px 8px;
    font-size: 0.78rem;
    font-weight: 600;
  }
  .change {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .mk {
    border-radius: 999px;
    padding: 2px 9px;
    font-size: 0.72rem;
    font-weight: 600;
    border: 1px solid transparent;
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
    color: var(--muted);
    font-size: 0.85rem;
  }
  .first {
    font-size: 0.74rem;
    font-weight: 500;
    color: var(--muted);
  }
  .revnote {
    color: var(--muted);
    font-size: 0.78rem;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .meta .box {
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: 5px;
    padding: 2px 8px;
    font-size: 0.72rem;
    color: var(--ink-soft);
    font-variant-numeric: tabular-nums;
  }
</style>
