<script lang="ts">
  // Asistencia del estudiante en un solo lugar: la semana con su horario
  // (qué clase es ahora, cuáles pasaron, cuáles faltan) cruzado con las
  // llamadas y los permisos previos, y un calendario de todo el año mes a
  // mes. Las acciones son las mismas de siempre: permiso, descargo,
  // modificar y ver cambios en clases con lista; permiso previo en clases
  // sin lista.
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';
  import { calendarDate } from '$lib/dates';
  import { isoOf, dayOf, mondayOf, kindOf as kindIn, type DayKind } from '$lib/calendar';
  import { rangeLabel } from '$lib/schedule';
  import { guarded } from '$lib/nav';
  import SessionRevisionTrail from './SessionRevisionTrail.svelte';
  import {
    scheduleEntries,
    listSubjects,
    listYears,
    type ScheduleEntry,
    type StudentReport,
    type StudentSessionEntry,
    type PriorPermit,
    type SchoolYear,
    type SessionRevisionRow
  } from './api';

  export let report: StudentReport;
  export let permits: PriorPermit[] = [];
  export let groupID = '';
  export let canDefense = false;
  export let canPermits = false;
  export let acting: string | null = null;
  export let studentName = '';
  export let trailFor: string | null = null;
  export let trailLoading = false;
  export let trailError: unknown = null;
  export let trailRows: SessionRevisionRow[] = [];
  export let onJustify: (sessionID: string, mark: string) => void = () => {};
  export let onDefense: (sessionID: string) => void = () => {};
  export let onModify: (sessionID: string, mark: string) => void = () => {};
  export let onTrail: (sessionID: string) => void = () => {};
  export let onPermit: (date: string, subjectID: string) => void = () => {};
  export let onRevoke: (p: PriorPermit) => void = () => {};

  type View = 'week' | 'calendar';
  let view: View = 'week';

  let entries: ScheduleEntry[] = [];
  let subjectNames: Record<string, string> = {};
  let years: SchoolYear[] = [];
  let loading = true;

  let now = new Date();
  $: todayISO = isoOf(now);
  $: nowMin = now.getHours() * 60 + now.getMinutes();
  let weekStart = mondayOf(new Date());
  let focusDay = '';

  onMount(() => {
    const tick = setInterval(() => (now = new Date()), 60_000);
    void load();
    return () => clearInterval(tick);
  });

  async function load() {
    loading = true;
    try {
      const [e, subs, ys] = await Promise.all([
        groupID ? guarded(() => scheduleEntries({ classGroupID: groupID })).catch(() => []) : Promise.resolve([]),
        guarded(() => listSubjects()).catch(() => []),
        guarded(() => listYears()).catch(() => [])
      ]);
      entries = e ?? [];
      subjectNames = Object.fromEntries((subs ?? []).map((s) => [s.ID, s.Name]));
      years = ys ?? [];
    } finally {
      loading = false;
    }
  }

  // --- Calendario escolar: festivos, días sin clase y vacaciones ----------
  const kindOf = (iso: string): DayKind => kindIn(years, iso);
  function kindLabel(k: DayKind): string {
    if (k === 'holiday') return $t.studentAttendance.holiday;
    if (k === 'noclass') return $t.studentAttendance.noClass;
    if (k === 'vacation') return $t.studentAttendance.vacation;
    if (k === 'outside') return $t.studentAttendance.outside;
    return '';
  }

  // --- Índices por día ------------------------------------------------
  $: sessionsByDay = (() => {
    const m = new Map<string, StudentSessionEntry[]>();
    for (const s of report.Sessions ?? []) {
      const k = dayOf(s.Date);
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return m;
  })();
  $: permitsByDay = (() => {
    const m = new Map<string, PriorPermit[]>();
    for (const p of permits) {
      const k = dayOf(p.Date);
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return m;
  })();

  // --- Semana -----------------------------------------------------------
  type Block = {
    key: string;
    entry: ScheduleEntry | null;
    subject: string;
    time: string;
    session: StudentSessionEntry | null;
    permit: PriorPermit | null;
    state: 'past' | 'now' | 'future';
  };
  type WeekDay = { iso: string; date: Date; kind: DayKind; blocks: Block[]; dayPermit: PriorPermit | null };

  $: hasSaturday = entries.some((e) => e.Weekday === 6);
  $: weekDays = buildWeek(weekStart, entries, sessionsByDay, permitsByDay, years, todayISO, nowMin, hasSaturday);

  function buildWeek(
    start: Date,
    list: ScheduleEntry[],
    sByDay: Map<string, StudentSessionEntry[]>,
    pByDay: Map<string, PriorPermit[]>,
    _years: SchoolYear[],
    today: string,
    minute: number,
    saturday: boolean
  ): WeekDay[] {
    const out: WeekDay[] = [];
    for (let i = 0; i < (saturday ? 6 : 5); i++) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const iso = isoOf(date);
      const dayEntries = list.filter((e) => e.Weekday === date.getDay()).sort((a, b) => a.Start - b.Start);
      const daySessions = [...(sByDay.get(iso) ?? [])];
      const dayPermits = pByDay.get(iso) ?? [];
      const used = new Set<string>();
      const match = (e: ScheduleEntry, exact: boolean) =>
        daySessions.find(
          (s) => !used.has(s.SessionID) && (!s.ClassGroupID || s.ClassGroupID === e.ClassGroupID) &&
            (exact ? s.SubjectID === e.SubjectID : !s.SubjectID)
        ) ?? null;
      const stateOf = (e: ScheduleEntry): Block['state'] =>
        iso < today ? 'past' : iso > today ? 'future' : minute >= e.End ? 'past' : minute >= e.Start ? 'now' : 'future';
      const blocks: Block[] = dayEntries.map((e) => {
        const s = match(e, true);
        if (s) used.add(s.SessionID);
        return {
          key: e.ID,
          entry: e,
          subject: subjectNames[e.SubjectID] ?? e.SubjectID,
          time: rangeLabel(e.Start, e.End),
          session: s,
          permit: dayPermits.find((p) => p.SubjectID === e.SubjectID) ?? null,
          state: stateOf(e)
        };
      });
      // Llamadas de dirección de grupo (sin materia) ocupan el primer
      // bloque sin lista; las que no encajan se muestran aparte.
      for (const b of blocks) {
        if (!b.session && b.entry) {
          const s = match(b.entry, false);
          if (s) {
            used.add(s.SessionID);
            b.session = s;
          }
        }
      }
      for (const s of daySessions.filter((x) => !used.has(x.SessionID))) {
        blocks.push({
          key: s.SessionID,
          entry: null,
          subject: (s.SubjectID && subjectNames[s.SubjectID]) || $t.studentAttendance.offSchedule,
          time: '',
          session: s,
          permit: null,
          state: 'past'
        });
      }
      out.push({
        iso,
        date,
        kind: kindOf(iso),
        blocks,
        dayPermit: dayPermits.find((p) => !p.SubjectID) ?? null
      });
    }
    return out;
  }

  $: weekLabel = (() => {
    const end = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + (hasSaturday ? 5 : 4));
    const f = (d: Date, withMonth: boolean) =>
      d.toLocaleDateString('es-CO', withMonth ? { day: 'numeric', month: 'short' } : { day: 'numeric' });
    const sameMonth = end.getMonth() === weekStart.getMonth();
    return `${f(weekStart, !sameMonth)} – ${f(end, true)} ${end.getFullYear()}`;
  })();
  $: isThisWeek = isoOf(weekStart) === isoOf(mondayOf(now));

  function shiftWeek(n: number) {
    weekStart = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7 * n);
    focusDay = '';
  }

  function markName(mark: string): string {
    if (mark === 'absence') return $t.roster.absentShort;
    if (mark === 'absence-permission') return $t.roster.permission;
    if (mark === 'evasion') return $t.studentSummary.markEvasion;
    if (mark === 'late') return $t.studentSummary.markLate;
    return $t.roster.present;
  }
  const isFault = (m: string) => m === 'absence' || m === 'absence-permission' || m === 'evasion';
  const defenseOf = (sid: string) => report.Defenses?.[sid] ?? '';

  // --- Calendario del año ----------------------------------------------
  let monthCursor = new Date(now.getFullYear(), now.getMonth(), 1);
  $: monthLabel = monthCursor.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  type Cell = { iso: string; day: number; inMonth: boolean; kind: DayKind; marks: string[]; permit: boolean };
  $: cells = buildMonth(monthCursor, sessionsByDay, permitsByDay, years);
  function buildMonth(
    first: Date,
    sByDay: Map<string, StudentSessionEntry[]>,
    pByDay: Map<string, PriorPermit[]>,
    _years: SchoolYear[]
  ): Cell[] {
    const start = mondayOf(first);
    const out: Cell[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      if (i >= 35 && d.getMonth() !== first.getMonth()) break;
      const iso = isoOf(d);
      out.push({
        iso,
        day: d.getDate(),
        inMonth: d.getMonth() === first.getMonth(),
        kind: kindOf(iso),
        marks: (sByDay.get(iso) ?? []).map((s) => s.Mark || 'present'),
        permit: (pByDay.get(iso) ?? []).length > 0
      });
    }
    return out;
  }
  const severity = ['absence', 'evasion', 'late', 'absence-permission', 'present'];
  const worst = (marks: string[]) => severity.find((m) => marks.includes(m)) ?? '';
  $: monthTotals = (() => {
    const tally: Record<string, number> = {};
    for (const c of cells) if (c.inMonth) for (const m of c.marks) tally[m] = (tally[m] ?? 0) + 1;
    return tally;
  })();
  function shiftMonth(n: number) {
    monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + n, 1);
  }
  function openDay(iso: string) {
    const d = calendarDate(iso);
    if (!d) return;
    weekStart = mondayOf(d);
    focusDay = iso;
    view = 'week';
  }
  function cellTitle(c: Cell): string {
    const parts: string[] = [];
    const k = kindLabel(c.kind);
    if (k) parts.push(k);
    const counts: Record<string, number> = {};
    for (const m of c.marks) counts[m] = (counts[m] ?? 0) + 1;
    for (const [m, n] of Object.entries(counts)) parts.push(`${markName(m === 'present' ? '' : m)}: ${n}`);
    if (c.permit) parts.push($t.studentAttendance.priorPermit);
    return parts.join(' · ');
  }
</script>

<div class="att">
  <div class="head">
    <div class="tabs" role="tablist" aria-label={$t.studentAttendance.title}>
      <button type="button" role="tab" aria-selected={view === 'week'} class:on={view === 'week'} on:click={() => (view = 'week')}>
        <Icon name="list" /> {$t.studentAttendance.weekTab}
      </button>
      <button type="button" role="tab" aria-selected={view === 'calendar'} class:on={view === 'calendar'} on:click={() => (view = 'calendar')}>
        <Icon name="calendar" /> {$t.studentAttendance.calendarTab}
      </button>
    </div>
  </div>

  {#if view === 'week'}
    <div class="nav">
      <button type="button" class="btn btn-sm" aria-label={$t.studentAttendance.prevWeek} on:click={() => shiftWeek(-1)}><Icon name="back" /></button>
      <strong class="navlabel">{weekLabel}</strong>
      <button type="button" class="btn btn-sm" aria-label={$t.studentAttendance.nextWeek} on:click={() => shiftWeek(1)}><Icon name="next" /></button>
      {#if !isThisWeek}
        <button type="button" class="btn btn-sm" on:click={() => { weekStart = mondayOf(now); focusDay = ''; }}>{$t.studentAttendance.thisWeek}</button>
      {/if}
    </div>

    {#if loading}
      <p class="muted">{$t.studentAttendance.loading}</p>
    {:else if !groupID}
      <p class="muted">{$t.studentAttendance.noGroup}</p>
    {:else}
      <div class="days" style={`--cols:${weekDays.length}`}>
        {#each weekDays as d (d.iso)}
          {@const uncalled = d.blocks.some((b) => b.entry && !b.session && !b.permit)}
          <div class="day" class:today={d.iso === todayISO} class:focus={d.iso === focusDay} class:off={d.kind !== 'school'}>
            <div class="dayhead">
              <strong>{d.date.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short' })}</strong>
              {#if d.iso === todayISO}<span class="tag now">{$t.studentAttendance.today}</span>{/if}
              {#if d.kind !== 'school'}<span class="tag">{kindLabel(d.kind)}</span>{/if}
              {#if d.dayPermit}
                <span class="tag permit" title={d.dayPermit.Reason}><Icon name="shield" /> {$t.studentAttendance.dayPermit}</span>
              {/if}
              <span class="spacer"></span>
              {#if canPermits && d.kind === 'school'}
                {#if d.dayPermit}
                  <button type="button" class="btn btn-sm" disabled={acting === d.dayPermit.ID} on:click={() => d.dayPermit && onRevoke(d.dayPermit)}>
                    {$t.studentSummary.priorPermitRevoke}
                  </button>
                {:else if uncalled}
                  <button type="button" class="btn btn-sm" on:click={() => onPermit(d.iso, '')}>
                    <Icon name="shield" /> {$t.studentAttendance.dayPermitAction}
                  </button>
                {/if}
              {/if}
            </div>
            {#if d.dayPermit}
              <p class="daynote">{$t.studentSummary.permissionWithReason(d.dayPermit.Reason)}{#if d.dayPermit.CreatedByName} · {$t.studentSummary.priorPermitBy(d.dayPermit.CreatedByName)}{/if}</p>
            {/if}
            {#if d.blocks.length === 0}
              <p class="muted small">{d.kind === 'school' ? $t.studentAttendance.noBlocks : kindLabel(d.kind)}</p>
            {:else}
              <ul class="blocks">
                {#each d.blocks as b (b.key)}
                  {@const s = b.session}
                  {@const covered = !s && (b.permit || d.dayPermit)}
                  <li class={`block ${b.state}`} class:called={!!s}>
                    <div class="btop">
                      <span class="time">{b.time || '—'}</span>
                      {#if s}
                        <span class={`mk ${s.Mark || 'present'}`}>{markName(s.Mark)}</span>
                      {:else if covered}
                        <span class="mk absence-permission"><Icon name="shield" /> {$t.studentAttendance.priorPermit}</span>
                      {:else if d.kind !== 'school'}
                        <span class="mk">{kindLabel(d.kind)}</span>
                      {:else if b.state === 'now'}
                        <span class="mk nowmk">{$t.studentAttendance.nowClass}</span>
                      {:else if b.state === 'future'}
                        <span class="mk">{$t.studentAttendance.pending}</span>
                      {:else}
                        <span class="mk uncalled">{$t.studentAttendance.uncalled}</span>
                      {/if}
                    </div>
                    <span class="subj">
                      <strong>{b.subject}</strong>
                      {#if s}
                        {#if s.Mark === 'absence-permission' && s.Note}<small class="note perm">{$t.studentSummary.permissionWithReason(s.Note)}</small>{/if}
                        {#if s.UniformOK === false}<small class="note warn">{$t.attendance.uniformFault}</small>{/if}
                        {#if defenseOf(s.SessionID)}<small class="note def">{$t.studentSummary.defenseWithReason(defenseOf(s.SessionID))}</small>{/if}
                      {:else if b.permit}
                        <small class="note perm">{$t.studentSummary.permissionWithReason(b.permit.Reason)}</small>
                      {/if}
                    </span>
                    <div class="bbtns">
                      {#if s}
                        {#if s.Mark === 'absence' || s.Mark === 'absence-permission'}
                          <button
                            type="button"
                            class={`btn btn-sm ${s.Mark === 'absence-permission' ? 'perm-on' : ''}`}
                            disabled={acting === s.SessionID + s.Mark}
                            on:click={() => onJustify(s.SessionID, s.Mark)}
                          >
                            {s.Mark === 'absence' ? $t.studentSummary.justifyAction : $t.studentSummary.unjustifiedAction}
                          </button>
                        {/if}
                        {#if canDefense && isFault(s.Mark)}
                          <button type="button" class="btn btn-sm" disabled={!!acting} on:click={() => onDefense(s.SessionID)}>
                            {$t.studentSummary.defenseAction}
                          </button>
                        {/if}
                        <button type="button" class="btn btn-sm" on:click={() => onModify(s.SessionID, s.Mark)}>
                          {$t.studentSummary.modifyAction}
                        </button>
                        <button type="button" class="btn btn-sm" on:click={() => onTrail(s.SessionID)}>
                          {trailFor === s.SessionID ? $t.studentSummary.hideChanges : $t.studentSummary.showChanges}
                        </button>
                      {:else if canPermits && d.kind === 'school' && b.entry}
                        {#if b.permit}
                          <button type="button" class="btn btn-sm" disabled={acting === b.permit.ID} on:click={() => b.permit && onRevoke(b.permit)}>
                            {$t.studentSummary.priorPermitRevoke}
                          </button>
                        {:else if !d.dayPermit}
                          <button type="button" class="btn btn-sm" on:click={() => b.entry && onPermit(d.iso, b.entry.SubjectID)}>
                            <Icon name="shield" /> {$t.studentSummary.priorPermitAction}
                          </button>
                        {/if}
                      {/if}
                    </div>
                    {#if s && trailFor === s.SessionID}
                      <div class="trail">
                        {#if trailLoading}
                          <p class="muted">{$t.common.retrying}</p>
                        {:else if trailError}
                          <p class="error" role="alert">{$t.common.loadError}</p>
                        {:else}
                          <SessionRevisionTrail revisions={trailRows} {studentName} />
                        {/if}
                      </div>
                    {/if}
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  {:else}
    <div class="nav">
      <button type="button" class="btn btn-sm" aria-label={$t.studentAttendance.prevMonth} on:click={() => shiftMonth(-1)}><Icon name="back" /></button>
      <strong class="navlabel month">{monthLabel}</strong>
      <button type="button" class="btn btn-sm" aria-label={$t.studentAttendance.nextMonth} on:click={() => shiftMonth(1)}><Icon name="next" /></button>
      <span class="totals">
        {#each severity as m}
          {#if monthTotals[m]}<span class="tot"><i class={`dot ${m}`}></i>{markName(m === 'present' ? '' : m)} {monthTotals[m]}</span>{/if}
        {/each}
      </span>
    </div>
    <div class="cal" role="grid" aria-label={monthLabel}>
      {#each $t.studentAttendance.weekdaysShort as w}
        <span class="wd" role="columnheader">{w}</span>
      {/each}
      {#each cells as c (c.iso)}
        {@const top = worst(c.marks)}
        <button
          type="button"
          role="gridcell"
          class={`cell k-${c.kind} ${top ? `w-${top}` : ''}`}
          class:outm={!c.inMonth}
          class:today={c.iso === todayISO}
          class:permit={c.permit && c.marks.length === 0}
          title={cellTitle(c)}
          on:click={() => openDay(c.iso)}
        >
          <span class="num">{c.day}</span>
          {#if c.marks.length > 0}
            <span class="dots">
              {#each c.marks.slice(0, 8) as m}<i class={`dot ${m}`}></i>{/each}
            </span>
          {:else if c.permit}
            <span class="pmini"><Icon name="shield" /></span>
          {:else if c.kind === 'holiday' || c.kind === 'noclass'}
            <span class="kmini">{kindLabel(c.kind)}</span>
          {/if}
        </button>
      {/each}
    </div>
    <div class="legend">
      {#each severity as m}<span><i class={`dot ${m}`}></i>{markName(m === 'present' ? '' : m)}</span>{/each}
      <span><Icon name="shield" /> {$t.studentAttendance.priorPermit}</span>
      <span><i class="sw vac"></i>{$t.studentAttendance.vacation}</span>
    </div>
    <p class="muted small">{$t.studentAttendance.calendarHint}</p>
  {/if}
</div>

<style>
  .att {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    flex-wrap: wrap;
  }
  .tabs {
    display: inline-flex;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-control);
    padding: 3px;
    gap: 3px;
  }
  .tabs button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--muted);
  }
  .tabs button.on {
    background: var(--surface);
    color: var(--ink);
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.08);
  }
  .tabs :global(svg) {
    width: 14px;
    height: 14px;
  }
  .nav {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .nav :global(svg) {
    width: 14px;
    height: 14px;
  }
  .navlabel {
    min-width: 150px;
    text-align: center;
    font-size: 0.9rem;
  }
  .navlabel.month {
    text-transform: capitalize;
  }
  .muted {
    color: var(--muted);
    font-size: 0.85rem;
    margin: 0;
  }
  .small {
    font-size: 0.78rem;
  }
  .error {
    color: var(--g-grave-ink);
    font-size: 0.8rem;
  }
  .days {
    display: grid;
    grid-template-columns: repeat(var(--cols, 5), minmax(190px, 1fr));
    gap: 8px;
    overflow-x: auto;
    scroll-snap-type: x proximity;
    padding-bottom: 4px;
  }
  .day {
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    padding: 10px;
    background: var(--surface);
    display: flex;
    flex-direction: column;
    min-width: 0;
    scroll-snap-align: start;
  }
  .day.today {
    border-color: var(--accent);
    box-shadow: inset 3px 0 0 var(--accent);
  }
  .day.focus {
    border-color: var(--ink-soft);
  }
  .day.off {
    background: var(--surface-2);
  }
  .dayhead {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    margin-bottom: 8px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--line);
  }
  .dayhead strong {
    font-size: 0.88rem;
    text-transform: capitalize;
  }
  .spacer {
    flex: 1;
  }
  .tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.7rem;
    font-weight: 700;
    border-radius: 999px;
    padding: 2px 8px;
    background: var(--surface-2);
    color: var(--muted);
    border: 1px solid var(--line);
  }
  .tag.now {
    background: var(--accent-soft);
    color: var(--accent);
    border-color: var(--accent);
  }
  .tag.permit {
    background: var(--m-permission-bg);
    color: var(--m-permission);
    border-color: var(--m-permission);
  }
  .tag :global(svg),
  .mk :global(svg),
  .pmini :global(svg),
  .legend :global(svg) {
    width: 12px;
    height: 12px;
  }
  .daynote {
    font-size: 0.78rem;
    color: var(--m-permission);
    font-weight: 600;
    margin: -2px 0 8px;
  }
  .blocks {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .block {
    border-radius: var(--radius-control);
    border: 1px solid var(--line);
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .block.future:not(.called) {
    border-style: dashed;
  }
  .block.now {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .btop {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    flex-wrap: wrap;
  }
  .time {
    font-size: 0.72rem;
    font-variant-numeric: tabular-nums;
    color: var(--muted);
    font-weight: 600;
  }
  .subj {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .subj strong {
    font-size: 0.86rem;
  }
  .note {
    font-size: 0.74rem;
  }
  .note.perm {
    color: var(--m-permission);
    font-weight: 600;
  }
  .note.warn {
    color: var(--g-grave-ink);
  }
  .note.def {
    color: var(--ink-soft);
  }
  .bbtns {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }
  .bbtns:empty {
    display: none;
  }
  .bbtns :global(.btn) {
    font-size: 0.72rem;
    padding: 3px 8px;
    min-height: 28px;
  }
  .bbtns :global(svg) {
    width: 13px;
    height: 13px;
  }
  .perm-on {
    border-color: var(--m-permission);
    color: var(--m-permission);
  }
  .trail {
    border-top: 1px dashed var(--line);
    padding-top: 6px;
  }
  .mk {
    flex: none;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.74rem;
    font-weight: 600;
    border-radius: 999px;
    padding: 3px 10px;
    background: var(--surface-2);
    color: var(--muted);
  }
  .mk.present {
    background: var(--chip-green-bg);
    color: var(--m-present);
  }
  .mk.absence {
    background: var(--chip-pink-bg);
    color: var(--g-grave-ink);
  }
  .mk.absence-permission {
    background: var(--m-permission-bg);
    color: var(--m-permission);
  }
  .mk.evasion {
    background: var(--chip-purple-bg);
    color: var(--chip-purple-ink);
  }
  .mk.late {
    background: var(--chip-yellow-bg);
    color: var(--chip-yellow-ink);
  }
  .mk.nowmk {
    background: var(--accent);
    color: var(--accent-ink);
  }
  .mk.uncalled {
    background: var(--g-grave-bg);
    color: var(--g-grave-ink);
  }
  @media (max-width: 640px) {
    .time {
      width: auto;
    }
    .bbtns,
    .trail {
      padding-left: 0;
    }
  }
  /* Calendario */
  .totals {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-left: auto;
    font-size: 0.76rem;
    color: var(--muted);
  }
  .tot {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .cal {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 4px;
  }
  .wd {
    text-align: center;
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--muted);
    text-transform: uppercase;
    padding-bottom: 2px;
  }
  .cell {
    min-height: 62px;
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 4px 5px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    background: var(--surface);
    text-align: left;
    min-width: 0;
  }
  .cell:hover {
    border-color: var(--ink-soft);
  }
  .cell.outm {
    opacity: 0.4;
  }
  .cell.today {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }
  .cell.k-vacation,
  .cell.k-outside {
    background: repeating-linear-gradient(135deg, var(--surface-2) 0 6px, var(--surface) 6px 12px);
  }
  .cell.k-holiday,
  .cell.k-noclass {
    background: var(--surface-2);
  }
  .cell.w-absence {
    background: var(--g-grave-bg);
  }
  .cell.w-evasion {
    background: var(--chip-purple-bg);
  }
  .cell.w-late {
    background: var(--chip-yellow-bg);
  }
  .cell.w-absence-permission,
  .cell.permit {
    background: var(--m-permission-bg);
  }
  .cell.w-present {
    background: var(--chip-green-bg);
  }
  .num {
    font-size: 0.78rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .dots {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
  }
  .dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--muted);
  }
  .dot.present {
    background: var(--m-present);
  }
  .dot.absence {
    background: var(--m-absent);
  }
  .dot.absence-permission {
    background: var(--m-permission);
  }
  .dot.evasion {
    background: var(--m-evasion);
  }
  .dot.late {
    background: var(--m-late);
  }
  .pmini {
    color: var(--m-permission);
  }
  .kmini {
    font-size: 0.62rem;
    color: var(--muted);
    line-height: 1.1;
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
  .sw.vac {
    display: inline-block;
    width: 12px;
    height: 12px;
    border-radius: 3px;
    border: 1px solid var(--line);
    background: repeating-linear-gradient(135deg, var(--surface-2) 0 3px, var(--surface) 3px 6px);
  }
  @media (max-width: 520px) {
    .cell {
      min-height: 46px;
      padding: 3px;
    }
    .kmini {
      display: none;
    }
  }
</style>
