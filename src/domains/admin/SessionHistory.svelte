<script lang="ts">
  import { push } from 'svelte-spa-router';
  import { t } from '$lib/i18n';
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import AdminShell from './AdminShell.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ErrorState from '$lib/ui/ErrorState.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import Dropdown from '$lib/ui/Dropdown.svelte';
  import SessionCorrectSheet from './SessionCorrectSheet.svelte';
  import SessionRevisionTrail from './SessionRevisionTrail.svelte';
  import { notify } from '$lib/ui/notice';
  import { guarded, queryParam, goBack } from '$lib/nav';
  import {
    groupsByYear,
    classSessionsHistory,
    sessionDetail,
    type YearGroup,
    type ClassSessionCard,
    type SessionDetailData
  } from './api';

  const currentYear = new Date().getFullYear();
  let year = currentYear;

  function prettyDay(value: string): string {
    const d = new Date(`${value.slice(0, 10)}T12:00:00`);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
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

  function markName(m: string): string {
    if (m === 'absence') return $t.admin.markAbsence;
    if (m === 'absence-permission') return $t.admin.markPermission;
    if (m === 'late') return $t.admin.markLate;
    if (m === 'evasion') return $t.admin.markEvasion;
    return $t.admin.markPresent;
  }

  export let querystring: string = '';

  let groupID = '';
  let groups: YearGroup[] = [];
  let deepSession: string | null = null;

  // Apertura directa de una llamada (?sesion=<id>): resuelve su salón
  // por etiqueta, selecciona el filtro y expande el detalle, de modo que
  // la pantalla es la misma que navegando el historial a mano.
  async function openDeepSession(id: string) {
    try {
      const found = await guarded(() => sessionDetail(id));
      if (!found) return;
      const match = groups.find((g) => g.ClassLabel === found.Session.ClassLabel);
      if (!match) {
        detail = found;
        expanded = id;
        state = 'ready';
        return;
      }
      groupID = match.GroupID;
      await load();
      await toggle(id);
    } catch {
      state = 'ready';
    }
  }

  // La corrección vive en SessionCorrectSheet (misma pantalla y mismo
  // guardado que usa el resumen del estudiante).
  let correcting = false;
  let correctingId = '';

  function openCorrect(sessionID: string) {
    correctingId = sessionID;
    correcting = true;
  }

  async function afterCorrection() {
    correcting = false;
    notify($t.troll.shistory.corrected);
    const id = expanded;
    expanded = null;
    detail = null;
    await load();
    if (id) await toggle(id);
  }

  const MONTH_NAMES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  const MONTH_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  let months: number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

  $: yearOptions = (() => {
    const y = new Date().getFullYear();
    const out: { value: string; label: string }[] = [];
    for (let k = y - 5; k <= y + 1; k++) out.push({ value: String(k), label: String(k) });
    return out;
  })();

  function yearRange(): { from: string; to: string } {
    return { from: `${year}-01-01`, to: `${year}-12-31` };
  }

  function cardMonth(day: string): number {
    return Number(day.slice(5, 7)) - 1;
  }

  $: visibleCards = cards.filter((c) => months.includes(cardMonth(c.Date)));

  function toggleMonth(m: number) {
    months = months.includes(m) ? months.filter((x) => x !== m) : [...months, m];
    if (months.length === 0) months = [m];
  }

  function selectYear(e: CustomEvent<string>) {
    year = Number(e.detail) || currentYear;
    void loadGroups();
    void load();
  }

  type State = 'loading' | 'error' | 'ready';
  let state: State = 'loading';
  let loadError: unknown = null;
  let cards: ClassSessionCard[] = [];

  let expanded: string | null = null;
  let detail: SessionDetailData | null = null;
  let detailLoading = false;
  let showPresent = false;
  let showRevisions = false;

  $: absentLate = (() => {
    if (!detail) return [];
    return detail.Session.Roster.filter((s) => {
      const m = detail?.Marks[s.StudentID] ?? '';
      return m === 'absence' || m === 'absence-permission' || m === 'evasion' || m === 'late';
    }).map((s) => ({ ...s, mark: detail?.Marks[s.StudentID] ?? '' }));
  })();
  $: presentRows = (() => {
    if (!detail) return [];
    return detail.Session.Roster.filter((s) => !(detail?.Marks[s.StudentID] ?? ''));
  })();
  $: openedAt = detail && detail.Revisions.length > 0 ? detail.Revisions[0].ChangedAt : '';

  async function loadGroups() {
    try {
      groups = (await guarded(() => groupsByYear(year))) ?? [];
    } catch {
      groups = [];
    }
  }

  async function load() {
    if (!groupID) {
      cards = [];
      state = 'ready';
      return;
    }
    state = 'loading';
    loadError = null;
    expanded = null;
    detail = null;
    try {
      const r = yearRange();
      cards = (await guarded(() => classSessionsHistory(groupID, r.from, r.to))) ?? [];
      state = 'ready';
    } catch (err) {
      loadError = err;
      state = 'error';
    }
  }

  function selectGroup(e: CustomEvent<string>) {
    groupID = e.detail;
    void load();
  }

  async function toggle(id: string) {
    showPresent = false;
    showRevisions = false;
    if (expanded === id) {
      expanded = null;
      detail = null;
      return;
    }
    expanded = id;
    detailLoading = true;
    detail = null;
    try {
      detail = await guarded(() => sessionDetail(id));
    } finally {
      detailLoading = false;
    }
  }

  (async () => {
    await loadGroups();
    const m = queryParam(querystring, 'sesion');
    const sid = m;
    if (sid) {
      deepSession = sid;
      state = 'loading';
      await openDeepSession(sid);
      return;
    }
    await load();
  })();
</script>

<AdminShell active="estudiantes" {year}>
  <TopBar title={$t.troll.shistory.title} showBack onBack={() => goBack('/admin/estudiantes')}><TopActions /></TopBar>

  <div class="pagehead">
    <p class="eyebrow">{$t.admin.consoleEyebrow}</p>
    <h1 class="title">{$t.troll.shistory.title}</h1>
    <div class="filters">
      <Dropdown
        label={$t.troll.shistory.salonLabel}
        value={groupID}
        placeholder={$t.troll.shistory.pickSalon}
        options={groups.map((g) => ({ value: g.GroupID, label: g.ClassLabel }))} 
        on:select={selectGroup}
      />
      <Dropdown
        label={$t.troll.shistory.yearLabel}
        value={String(year)}
        options={yearOptions}
        on:select={selectYear}
      />
    </div>
    <div class="months" role="group" aria-label={$t.troll.shistory.monthsLabel}>
      <span class="cap">{$t.troll.shistory.monthTitle}</span>
      <div class="mrow">
        {#each MONTH_SHORT as label, i}
          <button
            type="button"
            class="mchip"
            class:on={months.includes(i)}
            aria-pressed={months.includes(i)}
            on:click={() => toggleMonth(i)}
          >
            {label}
          </button>
        {/each}
      </div>
    </div>
  </div>

  <div class="sheet">
    {#if state === 'loading'}
      <Skeleton rows={4} />
    {:else if state === 'error'}
      <ErrorState error={loadError} onRetry={load} />
    {:else if !groupID}
      <EmptyState icon="calendar" title={$t.troll.shistory.noSalonTitle} body={$t.troll.shistory.noSalonBody} />
    {:else if visibleCards.length === 0}
      <EmptyState icon="calendar" title={$t.troll.shistory.emptyTitle} body={$t.troll.shistory.emptyBody} />
    {:else}
      <p class="muted">{$t.troll.shistory.countCalls(visibleCards.length)}</p>
      <ul class="cards">
        {#each visibleCards as card (card.ID)}
          <li class="card">
            <button type="button" class="chead" on:click={() => toggle(card.ID)} aria-expanded={expanded === card.ID}>
              <span class="cdate">
                <strong>{prettyDay(card.Date)}</strong>
                <small>
                  {[card.ClassLabel, card.Subject, $t.troll.shistory.periodLabel(card.Period)].filter(Boolean).join(' · ')}
                </small>
                {#if card.Teacher}
                  <small>{$t.troll.shistory.byLabel} {card.Teacher}</small>
                {/if}
              </span>
              <span class="csum">
                <span class="chip ok">{card.Present}</span>
                <span class="chip bad">{card.Absent}</span>
                <span class="chip eva">{card.Evasion}</span>
                <span class="chip warn">{card.Late}</span>
              </span>
              <span class="chev" aria-hidden="true">{expanded === card.ID ? '▾' : '▸'}</span>
            </button>
            {#if expanded === card.ID}
              <div class="cbody">
                {#if detailLoading || !detail}
                  <Skeleton rows={2} />
                {:else}
                  {#if openedAt}
                    <p class="muted">{$t.troll.shistory.atLabel} {momentTs(openedAt)}</p>
                  {/if}
                  {#if absentLate.length === 0}
                    <p class="muted">{$t.troll.allPresentNote}</p>
                  {:else}
                    <h3 class="sub">{$t.troll.absentOnes}</h3>
                    <ul class="names">
                      {#each absentLate as s (s.StudentID)}
                        <li>
                          <span class={`sev ${s.mark === 'late' ? 'medio' : 'grave'}`}>{markName(s.mark)}</span>
                          <span class="ntext">
                            <strong>{s.Names} {s.Surnames}</strong>
                          </span>
                        </li>
                      {/each}
                    </ul>
                  {/if}
                  <div class="btnrow">
                    {#if presentRows.length > 0}
                      <button type="button" class="mini" on:click={() => (showPresent = !showPresent)}>
                        {showPresent ? $t.troll.hidePresent : `${$t.troll.showPresent} (${presentRows.length})`}
                      </button>
                    {/if}
                    <button type="button" class="mini" on:click={() => openCorrect(card.ID)}>
                      {$t.troll.shistory.correctAction}
                    </button>
                    <button type="button" class="mini" on:click={() => (showRevisions = !showRevisions)}>
                      {showRevisions ? $t.troll.hideRevisions : $t.troll.showRevisions}
                    </button>
                  </div>
                  {#if showPresent && presentRows.length > 0}
                    <ul class="names plain">
                      {#each presentRows as s (s.StudentID)}
                        <li>{s.Names} {s.Surnames}</li>
                      {/each}
                    </ul>
                  {/if}
                  {#if showRevisions}
                    <SessionRevisionTrail revisions={detail.Revisions} />
                  {/if}
                {/if}
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <SessionCorrectSheet
    open={correcting}
    title={$t.troll.shistory.correctTitle}
    subtitle={detail ? `${prettyDay(detail.Session.Date)} · ${detail.Session.ClassLabel}` : ''}
    sessionId={correctingId}
    students={detail ? detail.Session.Roster.map((s) => ({ id: s.StudentID, name: `${s.Names} ${s.Surnames}`, current: detail?.Marks[s.StudentID] ?? '' })) : []}
    onClose={() => (correcting = false)}
    onSaved={afterCorrection}
  />
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
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: 10px;
    align-items: end;
  }
  @media (min-width: 700px) {
    .filters {
      grid-template-columns: 2fr 1fr;
    }
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
  .muted {
    color: var(--muted);
    font-size: 0.85rem;
  }
  .cards {
    list-style: none;
    margin: 12px 0 0;
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
  .chead {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 18px 20px;
    text-align: left;
  }
  .cdate {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .cdate strong {
    font-size: 1.25rem;
    text-transform: capitalize;
  }
  .cdate small {
    color: var(--muted);
    font-size: 0.85rem;
    font-weight: 600;
  }
  .csum {
    display: flex;
    gap: 6px;
  }
  .chip {
    min-width: 40px;
    text-align: center;
    border-radius: 999px;
    padding: 6px 12px;
    font-size: 0.9rem;
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
  .chip.eva {
    background: var(--chip-purple-bg);
    color: var(--chip-purple-ink);
  }
  .months {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 10px;
    grid-column: 1 / -1;
  }
  .months .cap {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--muted);
  }
  .mrow {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .mchip {
    min-height: 44px;
    padding: 0 14px;
    border-radius: 10px;
    border: 1px solid var(--line);
    background: var(--surface);
    font-size: 0.84rem;
    font-weight: 600;
    color: var(--ink);
  }
  .mchip.on {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--accent);
    font-weight: 800;
  }
  .chev {
    color: var(--muted);
    font-size: 0.9rem;
  }
  .cbody {
    border-top: 1px solid var(--line);
    padding: 16px 20px 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .btnrow {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
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
    font-size: 1rem;
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
    gap: 6px;
    min-height: 40px;
    padding: 0 18px;
    border-radius: var(--radius-pill);
    background: var(--tint);
    border: 1px solid var(--line);
    font-weight: 800;
    font-size: 0.82rem;
    color: var(--ink);
  }
  .mini.primary {
    background: var(--accent);
    border-color: transparent;
    color: #fff;
  }
</style>
