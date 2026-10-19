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
  import Sheet from '$lib/ui/Sheet.svelte';
  import { notify } from '$lib/ui/notice';
  import { guarded } from '$lib/nav';
  import {
    groupsByYear,
    classSessionsHistory,
    sessionDetail,
    recordSessionMark,
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
    return m === 'absence' ? $t.admin.markAbsence : m === 'late' ? $t.admin.markLate : m === 'evasion' ? $t.admin.markEvasion : $t.admin.markPresent;
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

  let groupID = '';
  let groups: YearGroup[] = [];

  // Corregir marcas con el mismo lenguaje de la lista docente: una
  // fila por estudiante con segmentado; un solo motivo junto a Guardar
  // que acompaña a las marcas no presentes del lote.
  let correcting = false;
  let correctingId = '';
  let corrSel: Record<string, '' | 'absence' | 'evasion' | 'late'> = {};
  let correctNote = '';
  let savingCorrection = false;
  let correctionError = '';

  function openCorrect(sessionID: string) {
    correctingId = sessionID;
    corrSel = {};
    correctNote = '';
    correctionError = '';
    correcting = true;
  }

  function corrSet(studentID: string, mark: '' | 'absence' | 'evasion' | 'late') {
    corrSel = { ...corrSel, [studentID]: mark };
  }

  async function saveCorrection() {
    correctionError = '';
    const changed = Object.entries(corrSel);
    if (changed.length === 0) {
      correctionError = $t.troll.shistory.pickStudent;
      return;
    }
    savingCorrection = true;
    try {
      for (const [studentID, mark] of changed) {
        await recordSessionMark(correctingId, studentID, mark, mark === '' ? '' : correctNote.trim());
      }
      correcting = false;
      notify($t.troll.shistory.corrected);
      const id = expanded;
      expanded = null;
      detail = null;
      await load();
      if (id) await toggle(id);
    } catch (err) {
      correctionError = err instanceof Error ? err.message : String(err);
    } finally {
      savingCorrection = false;
    }
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
      return m === 'absence' || m === 'evasion' || m === 'late';
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

  loadGroups();
  load();
</script>

<AdminShell active="estudiantes" {year}>
  <TopBar title={$t.troll.shistory.title} showBack onBack={() => push('/admin/estudiantes')}><TopActions /></TopBar>

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
                  {#if presentRows.length > 0}
                    <button type="button" class="mini" on:click={() => (showPresent = !showPresent)}>
                      {showPresent ? $t.troll.hidePresent : `${$t.troll.showPresent} (${presentRows.length})`}
                    </button>
                    {#if showPresent}
                      <ul class="names plain">
                        {#each presentRows as s (s.StudentID)}
                          <li>{s.Names} {s.Surnames}</li>
                        {/each}
                      </ul>
                    {/if}
                  {/if}
                  <button type="button" class="mini" on:click={() => openCorrect(card.ID)}>
                    {$t.troll.shistory.correctAction}
                  </button>
                  <button type="button" class="mini" on:click={() => (showRevisions = !showRevisions)}>
                    {showRevisions ? $t.troll.hideRevisions : `${$t.troll.showRevisions} (${detail.Revisions.length})`}
                  </button>
                  {#if showRevisions}
                    {#if detail.Revisions.length === 0}
                      <p class="muted">{$t.troll.shistory.revisionsEmpty}</p>
                    {:else}
                      <ul class="revs">
                        {#each detail.Revisions as r (r.Student + r.ChangedAt + r.To)}
                          <li class="rev">
                            <span class="changerow">
                              <span class="person">{r.Student}</span>
                              <span class="change">
                                {#if r.From}
                                  <span class={`mk ${markClass(r.From)}`}>{markName(r.From)}</span>
                                  <span class="swap" aria-hidden="true">›</span>
                                {:else}
                                  <span class="first">{$t.admin.markPresent}</span>
                                {/if}
                                <span class={`mk solid ${markClass(r.To)}`}>{markName(r.To)}</span>
                              </span>
                            </span>
                            {#if r.Note}<small class="revnote">{r.Note}</small>{/if}
                            <span class="meta">
                              <span class="box">{r.Author}</span>
                              <span class="box">{momentTs(r.ChangedAt)}</span>
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

  <Sheet open={correcting} title={$t.troll.shistory.correctTitle} onClose={() => (correcting = false)}>
    {#if detail}
      <p class="muted">{prettyDay(detail.Session.Date)} · {detail.Session.ClassLabel}</p>
      <ul class="roll">
        {#each detail.Session.Roster as s (s.StudentID)}
          <li>
            <span class="who">
              <span class="avatar" aria-hidden="true">
                {`${s.Names} ${s.Surnames}`.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
              </span>
              <span class="name">{s.Names} {s.Surnames}</span>
            </span>
            <span class="seg" role="group" aria-label={`${s.Names} ${s.Surnames}`}>
              <button type="button" class:present={(corrSel[s.StudentID] ?? detail.Marks[s.StudentID] ?? '') === ''} aria-pressed={(corrSel[s.StudentID] ?? detail.Marks[s.StudentID] ?? '') === ''} on:click={() => corrSet(s.StudentID, '')}>
                {$t.admin.markPresent}
              </button>
              <button type="button" class:absent={(corrSel[s.StudentID] ?? detail.Marks[s.StudentID] ?? '') === 'absence'} aria-pressed={(corrSel[s.StudentID] ?? detail.Marks[s.StudentID] ?? '') === 'absence'} on:click={() => corrSet(s.StudentID, 'absence')}>
                {$t.admin.markAbsence}
              </button>
              <button type="button" class:evasion={(corrSel[s.StudentID] ?? detail.Marks[s.StudentID] ?? '') === 'evasion'} aria-pressed={(corrSel[s.StudentID] ?? detail.Marks[s.StudentID] ?? '') === 'evasion'} on:click={() => corrSet(s.StudentID, 'evasion')}>
                {$t.admin.markEvasion}
              </button>
              <button type="button" class:late={(corrSel[s.StudentID] ?? detail.Marks[s.StudentID] ?? '') === 'late'} aria-pressed={(corrSel[s.StudentID] ?? detail.Marks[s.StudentID] ?? '') === 'late'} on:click={() => corrSet(s.StudentID, 'late')}>
                {$t.admin.markLate}
              </button>
            </span>
          </li>
        {/each}
      </ul>
      {#if correctionError}<p class="flash error" role="alert">{correctionError}</p>{/if}
      <div class="actions">
        <input
          class="motivo"
          type="text"
          placeholder={$t.troll.shistory.correctNotePlaceholder}
          aria-label={$t.troll.shistory.correctNoteLabel}
          bind:value={correctNote}
          maxlength="140"
        />
        <button type="button" class="mini" on:click={() => (correcting = false)}>{$t.common.cancel}</button>
        <button type="button" class="mini primary" disabled={savingCorrection} on:click={saveCorrection}>
          {savingCorrection ? $t.troll.saving : $t.common.save}
        </button>
      </div>
    {/if}
  </Sheet>
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
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }
  .motivo {
    flex: 1;
    min-width: 180px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 10px 12px;
    min-height: 48px;
    font-size: 0.88rem;
    color: var(--ink);
  }
  .flash.error {
    border-radius: var(--radius);
    padding: 10px 12px;
    font-size: 0.85rem;
    margin: 0;
    background: var(--chip-pink-bg);
    color: var(--g-grave-ink);
    font-weight: 600;
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
  .roll {
    list-style: none;
    margin: 0 0 12px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 50vh;
    overflow-y: auto;
  }
  .roll li {
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 10px 12px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
  }
  .roll .who {
    flex: 1;
    min-width: 150px;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .roll .avatar {
    flex: none;
    width: 36px;
    height: 36px;
    border-radius: var(--radius-pill);
    background: var(--accent-soft);
    color: var(--accent);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    font-size: 0.78rem;
  }
  .roll .name {
    font-weight: 700;
    font-size: 0.88rem;
  }
  .seg {
    display: flex;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-pill);
    padding: 3px;
    gap: 2px;
    flex-wrap: wrap;
  }
  .seg button {
    min-height: 34px;
    padding: 0 10px;
    border-radius: var(--radius-pill);
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--muted);
  }
  .seg button.present {
    background: var(--chip-green-bg);
    color: var(--chip-green-ink);
  }
  .seg button.absent {
    background: var(--chip-pink-bg);
    color: var(--g-grave-ink);
  }
  .seg button.evasion {
    background: var(--chip-purple-bg);
    color: var(--chip-purple-ink);
  }
  .seg button.late {
    background: var(--chip-yellow-bg);
    color: var(--chip-yellow-ink);
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
    padding: 3px 12px;
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--ink-soft);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .meta .box:first-child {
    background: var(--accent-soft);
    border-color: transparent;
    color: var(--accent);
  }
  .revs li.rev {
    gap: 10px;
    padding: 12px 14px;
  }
</style>
