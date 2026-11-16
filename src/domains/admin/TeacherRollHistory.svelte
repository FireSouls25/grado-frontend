<script lang="ts">
  // Historial de la lista diaria de docentes en calendario: el mes abre
  // directo, cada día con su resumen (presentes, faltas, atrasos,
  // reemplazos) y los días de clase pasados sin lista marcados. Tocar un
  // día abre su detalle en una ventana emergente.
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { t } from '$lib/i18n';
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import AdminShell from './AdminShell.svelte';
  import ErrorState from '$lib/ui/ErrorState.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { guarded, goBack } from '$lib/nav';
  import { isoOf, monthCells, kindOf as kindIn, type DayKind } from '$lib/calendar';
  import {
    teacherRollHistory,
    teacherRoll,
    teacherDayRevisions,
    listYears,
    type TeacherDayCard,
    type TeacherRollRow,
    type TeacherDayRevision,
    type SchoolYear
  } from './api';
  import { rollDate } from './rollDate';

  let now = new Date();
  $: todayISO = isoOf(now);
  let month = new Date(now.getFullYear(), now.getMonth(), 1);
  $: cells = monthCells(month);
  $: monthLabel = month.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  $: isCurrent = month.getMonth() === now.getMonth() && month.getFullYear() === now.getFullYear();

  type State = 'loading' | 'error' | 'ready';
  let state: State = 'loading';
  let loadError: unknown = null;
  let byDay: Record<string, TeacherDayCard> = {};
  let years: SchoolYear[] = [];

  const kindOf = (iso: string): DayKind => kindIn(years, iso);
  function kindLabel(k: DayKind): string {
    if (k === 'holiday') return $t.studentAttendance.holiday;
    if (k === 'noclass') return $t.studentAttendance.noClass;
    if (k === 'vacation') return $t.studentAttendance.vacation;
    if (k === 'outside') return $t.studentAttendance.outside;
    return '';
  }
  const weekday = (d: Date) => d.getDay() >= 1 && d.getDay() <= 5;

  onMount(() => {
    void guarded(() => listYears())
      .then((ys) => (years = ys ?? []))
      .catch(() => {});
  });

  let loadedKey = '';
  $: if (`${cells[0].iso}|${cells[cells.length - 1].iso}` !== loadedKey) void load();
  async function load() {
    const from = cells[0].iso;
    const to = cells[cells.length - 1].iso;
    const key = `${from}|${to}`;
    loadedKey = key;
    state = 'loading';
    loadError = null;
    try {
      const list = (await guarded(() => teacherRollHistory(from, to))) ?? [];
      if (loadedKey !== key) return;
      byDay = Object.fromEntries(list.map((c) => [c.Day.slice(0, 10), c]));
      state = 'ready';
    } catch (err) {
      loadError = err;
      state = 'error';
    }
  }

  $: totals = (() => {
    const out = { present: 0, absent: 0, late: 0, missing: 0 };
    for (const c of cells) {
      if (!c.inMonth) continue;
      const card = byDay[c.iso];
      if (card) {
        out.present += card.Present;
        out.absent += card.Absent;
        out.late += card.Late;
      } else if (c.iso < todayISO && weekday(c.date) && kindOf(c.iso) === 'school') out.missing++;
    }
    return out;
  })();

  function shift(n: number) {
    month = new Date(month.getFullYear(), month.getMonth() + n, 1);
  }

  // --- Detalle del día en ventana emergente --------------------------------
  let openDay: string | null = null;
  let detailRows: TeacherRollRow[] = [];
  let detailLoading = false;
  let showPresent = false;
  let showRevisions = false;
  let revisions: TeacherDayRevision[] = [];

  $: absentLate = detailRows.filter((r) => r.Status === 'absent' || r.Status === 'late' || r.Status === 'replacement' || r.Status === 'permission');
  $: presentRows = detailRows.filter((r) => r.Status === 'present');

  async function open(day: string) {
    openDay = day;
    showPresent = false;
    showRevisions = false;
    detailRows = [];
    revisions = [];
    if (!byDay[day]) return;
    detailLoading = true;
    try {
      const [rows, revs] = await Promise.all([guarded(() => teacherRoll(day)), guarded(() => teacherDayRevisions(day))]);
      detailRows = rows ?? [];
      revisions = revs ?? [];
    } finally {
      detailLoading = false;
    }
  }

  function modify(day: string) {
    rollDate.set(day);
    push('/admin/docentes/lista');
  }

  function prettyDay(value: string): string {
    const d = new Date(`${value}T12:00:00`);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
  }
  function markClass(m: string): string {
    return m === 'absence' || m === 'absent'
      ? 'is-absent'
      : m === 'permission'
        ? 'is-permission'
        : m === 'late'
          ? 'is-late'
          : m === 'replacement'
            ? 'is-replacement'
            : m === 'evasion'
              ? 'is-evasion'
              : 'is-present';
  }
  function statusName(s: string): string {
    if (s === 'permission') return $t.troll.statusPermission;
    if (s === 'replacement') return $t.troll.statusReplacement;
    return s === 'absent' ? $t.troll.statusAbsent : s === 'late' ? $t.troll.statusLate : $t.troll.statusPresent;
  }
  function momentTs(value: string): string {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
</script>

<AdminShell active="docentes" year={month.getFullYear()}>
  <TopBar title={$t.troll.rollHistoryTitle} showBack onBack={() => goBack('/admin/docentes')}>
    <button type="button" class="btn btn-primary" on:click={() => push('/admin/docentes/lista')}>
      {$t.troll.rollAction}
    </button>
    <TopActions />
  </TopBar>

  <div class="sheet">
    <div class="bar">
      <div class="nav">
        <button type="button" class="btn btn-sm" aria-label={$t.sessionHistory.prev} on:click={() => shift(-1)}><Icon name="back" /></button>
        <strong class="navlabel">{monthLabel}</strong>
        <button type="button" class="btn btn-sm" aria-label={$t.sessionHistory.next} on:click={() => shift(1)}><Icon name="next" /></button>
        {#if !isCurrent}
          <button type="button" class="btn btn-sm" on:click={() => (month = new Date(now.getFullYear(), now.getMonth(), 1))}>{$t.sessionHistory.thisMonth}</button>
        {/if}
      </div>
      <div class="sums">
        <span class="pill ok">{totals.present} {$t.troll.rollPresentShort}</span>
        <span class="pill bad" class:zero={totals.absent === 0}>{totals.absent} {$t.troll.rollAbsentShort}</span>
        <span class="pill warn" class:zero={totals.late === 0}>{totals.late} {$t.troll.rollLateShort}</span>
        <span class="pill miss" class:zero={totals.missing === 0}><Icon name="warn" /> {$t.sessionHistory.missingCount(totals.missing)}</span>
      </div>
    </div>

    {#if state === 'error'}
      <ErrorState error={loadError} onRetry={load} />
    {:else}
      <div class="cal" role="grid" aria-label={monthLabel} class:busy={state === 'loading'}>
        <div class="calhead">{monthLabel}</div>
        {#each $t.studentAttendance.weekdaysShort as w}<span class="wd" role="columnheader">{w}</span>{/each}
        {#each cells as c (c.iso)}
          {@const card = byDay[c.iso]}
          {@const k = kindOf(c.iso)}
          {@const missing = !card && c.iso < todayISO && weekday(c.date) && k === 'school'}
          <button
            type="button"
            role="gridcell"
            class={`cell k-${k}`}
            class:outm={!c.inMonth}
            class:today={c.iso === todayISO}
            class:has={!!card}
            class:bad={!!card && card.Absent > 0}
            class:missing
            disabled={!card && !missing}
            on:click={() => open(c.iso)}
          >
            <span class="num">{c.date.getDate()}</span>
            {#if card}
              <span class="counts">
                <span class="c p" title={$t.troll.statusPresent}>{card.Present}</span>
                {#if card.Absent}<span class="c a" title={$t.troll.statusAbsent}>{card.Absent}</span>{/if}
                {#if card.Late}<span class="c l" title={$t.troll.statusLate}>{card.Late}</span>{/if}
                {#if card.Replacement}<span class="c r" title={$t.troll.statusReplacement}>{card.Replacement}</span>{/if}
              </span>
            {:else if missing}
              <span class="tagm">{$t.studentAttendance.uncalled}</span>
            {:else if k !== 'school' && c.inMonth && weekday(c.date)}
              <span class="kmini">{kindLabel(k)}</span>
            {/if}
          </button>
        {/each}
      </div>
      <div class="legend">
        <span><i class="dot p"></i>{$t.troll.statusPresent}</span>
        <span><i class="dot a"></i>{$t.troll.statusAbsent}</span>
        <span><i class="dot l"></i>{$t.troll.statusLate}</span>
        <span><i class="dot r"></i>{$t.troll.statusReplacement}</span>
        <span><i class="sw miss"></i>{$t.studentAttendance.uncalled}</span>
        <span><i class="sw off"></i>{$t.sessionHistory.legendOff}</span>
      </div>
      {#if state === 'loading'}<Skeleton rows={1} />{/if}
    {/if}
  </div>

  <Sheet open={!!openDay} wide title={openDay ? prettyDay(openDay) : ''} onClose={() => (openDay = null)}>
    {#if openDay}
      <div class="detail">
        {#if !byDay[openDay]}
          <p class="muted">{$t.troll.rollMissingDay}</p>
          <div class="btnrow">
            <button type="button" class="btn btn-primary btn-sm" on:click={() => openDay && modify(openDay)}>{$t.troll.rollTakeThatDay}</button>
          </div>
        {:else if detailLoading}
          <Skeleton rows={3} />
        {:else}
          <p class="muted">{$t.troll.countTeachers(byDay[openDay].Total)}</p>
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
            <button type="button" class="btn btn-sm" on:click={() => openDay && modify(openDay)}>{$t.troll.modifyAction}</button>
            <button type="button" class="btn btn-sm" on:click={() => (showRevisions = !showRevisions)}>
              {showRevisions ? $t.troll.hideRevisions : $t.troll.showRevisions}
            </button>
          </div>
          {#if showPresent && presentRows.length > 0}
            <ul class="names plain">
              {#each presentRows as r (r.TeacherID)}<li>{r.TeacherName}</li>{/each}
            </ul>
          {/if}
          {#if showRevisions}
            {#if revisions.length === 0}
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
  </Sheet>
</AdminShell>

<style>
  .bar {
    display: flex;
    align-items: center;
    gap: 10px 16px;
    flex-wrap: wrap;
  }
  .nav {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .nav :global(svg),
  .pill :global(svg) {
    width: 14px;
    height: 14px;
  }
  .navlabel {
    min-width: 150px;
    text-align: center;
    font-size: 0.92rem;
    text-transform: capitalize;
  }
  .sums {
    margin-left: auto;
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.76rem;
    font-weight: 700;
    border-radius: 999px;
    padding: 3px 10px;
    font-variant-numeric: tabular-nums;
  }
  .pill.ok {
    background: var(--chip-green-bg);
    color: var(--m-present);
  }
  .pill.bad {
    background: var(--g-grave-bg);
    color: var(--g-grave-ink);
  }
  .pill.warn {
    background: var(--chip-yellow-bg);
    color: var(--chip-yellow-ink);
  }
  .pill.miss {
    background: var(--g-grave-bg);
    color: var(--g-grave-ink);
  }
  .pill.zero {
    background: var(--surface-2);
    color: var(--muted);
  }
  .cal {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 4px;
    max-width: 980px;
    transition: opacity 0.15s;
  }
  .cal.busy {
    opacity: 0.6;
  }
  .calhead {
    grid-column: 1 / -1;
    font-weight: 700;
    font-size: 0.95rem;
    text-transform: capitalize;
    padding: 2px 2px 6px;
  }
  .wd {
    text-align: center;
    font-size: 0.68rem;
    font-weight: 700;
    color: var(--muted);
    text-transform: uppercase;
  }
  .cell {
    min-height: 64px;
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 4px 5px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
    background: var(--surface);
    text-align: left;
    min-width: 0;
    color: var(--ink);
  }
  .cell:disabled {
    cursor: default;
  }
  .cell:not(:disabled):hover {
    border-color: var(--ink-soft);
  }
  .cell.outm {
    opacity: 0.4;
  }
  .cell.today {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }
  .cell.has {
    background: var(--chip-green-bg);
  }
  .cell.has.bad {
    background: var(--surface);
    border-color: var(--g-grave-ink);
  }
  .cell.missing {
    background: var(--g-grave-bg);
    border-style: dashed;
  }
  .cell.k-vacation,
  .cell.k-outside,
  .cell.k-holiday,
  .cell.k-noclass {
    background: repeating-linear-gradient(135deg, var(--surface-2) 0 6px, var(--surface) 6px 12px);
  }
  .num {
    font-size: 0.76rem;
    font-weight: 700;
  }
  .counts {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
  }
  .c {
    font-size: 0.66rem;
    font-weight: 700;
    border-radius: 999px;
    padding: 0 6px;
    font-variant-numeric: tabular-nums;
  }
  .c.p {
    background: var(--surface);
    color: var(--m-present);
  }
  .c.a {
    background: var(--g-grave-bg);
    color: var(--g-grave-ink);
  }
  .c.l {
    background: var(--chip-yellow-bg);
    color: var(--chip-yellow-ink);
  }
  .c.r {
    background: var(--m-permission-bg);
    color: var(--m-permission);
  }
  .tagm {
    font-size: 0.62rem;
    font-weight: 700;
    color: var(--g-grave-ink);
    line-height: 1.1;
  }
  .kmini {
    font-size: 0.6rem;
    color: var(--muted);
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    font-size: 0.74rem;
    color: var(--muted);
  }
  .legend span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .dot.p {
    background: var(--m-present);
  }
  .dot.a {
    background: var(--m-absent);
  }
  .dot.l {
    background: var(--m-late);
  }
  .dot.r {
    background: var(--m-permission);
  }
  .sw {
    display: inline-block;
    width: 12px;
    height: 12px;
    border-radius: 3px;
    border: 1px solid var(--line);
  }
  .sw.miss {
    background: var(--g-grave-bg);
    border-style: dashed;
  }
  .sw.off {
    background: repeating-linear-gradient(135deg, var(--surface-2) 0 3px, var(--surface) 3px 6px);
  }
  .detail {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  @media (max-width: 520px) {
    .cell {
      min-height: 48px;
      padding: 3px;
    }
    .tagm,
    .kmini {
      display: none;
    }
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
  .mk.is-permission {
    color: var(--m-permission);
    border-color: var(--m-permission);
  }
  .mk.is-replacement {
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
  .mk.solid.is-permission {
    background: var(--m-permission-bg);
    border-color: transparent;
  }
  .mk.solid.is-replacement {
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
