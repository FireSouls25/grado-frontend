<script lang="ts">
  // Historial de llamadas a lista sin selectores: todos los salones
  // aparecen plegados con el resumen del mes (con lista, sin lista,
  // pendientes y faltas). Al abrir uno, debajo de su título, se ve su
  // calendario del mes (o su semana día por día) según el horario, con su
  // propia navegación. Tocar una llamada abre su detalle.
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n';
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import AdminShell from './AdminShell.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import SessionCorrectSheet from './SessionCorrectSheet.svelte';
  import SessionRevisionTrail from './SessionRevisionTrail.svelte';
  import { notify } from '$lib/ui/notice';
  import { guarded, queryParam, goBack } from '$lib/nav';
  import { mapSettled } from '$lib/async';
  import { rangeLabel } from '$lib/schedule';
  import { isoOf, dayOf, mondayOf, addDays, kindOf as kindIn, weekLabel, monthCells, type DayKind } from '$lib/calendar';
  import {
    groupsByYear,
    classSessionsHistory,
    sessionDetail,
    mergeTrail,
    scheduleEntries,
    listSubjects,
    listYears,
    teachers as listTeachers,
    type YearGroup,
    type ClassSessionCard,
    type SessionDetailData,
    type ScheduleEntry,
    type SchoolYear
  } from './api';

  export let querystring: string = '';

  type View = 'week' | 'month';
  type Cursor = { view: View; week: Date; month: Date };

  let now = new Date();
  $: todayISO = isoOf(now);
  $: nowMin = now.getHours() * 60 + now.getMinutes();

  // Mes de la página: alimenta el resumen de cada salón plegado.
  let pageMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthRange = (m: Date) => {
    const cells = monthCells(m);
    return { from: cells[0].iso, to: cells[cells.length - 1].iso };
  };
  const weekRange = (w: Date) => ({ from: isoOf(w), to: isoOf(addDays(w, 6)) });
  $: pageRange = monthRange(pageMonth);
  $: anchorYear = pageMonth.getFullYear();

  let groups: YearGroup[] = [];
  let groupsYear = 0;
  let years: SchoolYear[] = [];
  let subjectNames: Record<string, string> = {};
  let teacherNames: Record<string, string> = {};
  let schedule: Record<string, ScheduleEntry[]> = {};
  // Llamadas por salón y rango ("gid|from|to").
  let cache: Record<string, ClassSessionCard[]> = {};
  let loadingGroups = true;
  let loadingPage = false;
  let cursors: Record<string, Cursor> = {};
  let onlyMissing = false;

  const kindOf = (iso: string): DayKind => kindIn(years, iso);
  function kindLabel(k: DayKind): string {
    if (k === 'holiday') return $t.studentAttendance.holiday;
    if (k === 'noclass') return $t.studentAttendance.noClass;
    if (k === 'vacation') return $t.studentAttendance.vacation;
    if (k === 'outside') return $t.studentAttendance.outside;
    return '';
  }

  onMount(() => {
    const tick = setInterval(() => (now = new Date()), 60_000);
    void boot();
    return () => clearInterval(tick);
  });

  async function boot() {
    const [ys, subs, ts] = await Promise.all([
      guarded(() => listYears()).catch(() => []),
      guarded(() => listSubjects()).catch(() => []),
      guarded(() => listTeachers()).catch(() => [])
    ]);
    years = ys ?? [];
    subjectNames = Object.fromEntries((subs ?? []).map((s) => [s.ID, s.Name]));
    teacherNames = Object.fromEntries((ts ?? []).map((x) => [x.ID, `${x.Names} ${x.Surnames}`.trim()]));
    const sid = queryParam(querystring, 'sesion');
    if (sid) await openDeepSession(sid);
  }

  $: if (anchorYear !== groupsYear) void loadGroups(anchorYear);
  async function loadGroups(year: number) {
    groupsYear = year;
    loadingGroups = true;
    try {
      const list = (await guarded(() => groupsByYear(year))) ?? [];
      groups = [...list].sort((a, b) => a.Grade - b.Grade || a.GroupNo - b.GroupNo);
      const missing = groups.filter((g) => !schedule[g.GroupID]);
      const settled = await mapSettled(missing, 5, (g) => scheduleEntries({ classGroupID: g.GroupID }));
      const next = { ...schedule };
      settled.forEach((r, i) => (next[missing[i].GroupID] = r.status === 'fulfilled' ? r.value ?? [] : []));
      schedule = next;
    } catch {
      groups = [];
    } finally {
      loadingGroups = false;
    }
  }

  const keyOf = (gid: string, r: { from: string; to: string }) => `${gid}|${r.from}|${r.to}`;
  async function ensure(list: string[], r: { from: string; to: string }, force = false) {
    const need = list.filter((gid) => force || !cache[keyOf(gid, r)]);
    if (need.length === 0) return;
    const settled = await mapSettled(need, 5, (gid) => classSessionsHistory(gid, r.from, r.to));
    const next = { ...cache };
    settled.forEach((res, i) => (next[keyOf(need[i], r)] = res.status === 'fulfilled' ? res.value ?? [] : []));
    cache = next;
  }

  // Resumen del mes de la página para todos los salones.
  let pageKey = '';
  $: if (groups.length > 0 && `${pageRange.from}|${groups.length}` !== pageKey) void loadPage();
  async function loadPage() {
    const key = `${pageRange.from}|${groups.length}`;
    pageKey = key;
    loadingPage = true;
    await ensure(groups.map((g) => g.GroupID), pageRange);
    if (pageKey === key) loadingPage = false;
  }

  // --- Bloques del horario cruzados con las llamadas ----------------------
  type Block = { key: string; time: string; subject: string; teacher: string; card: ClassSessionCard | null; state: 'past' | 'now' | 'future' };
  type Day = { iso: string; date: Date; kind: DayKind; blocks: Block[] };

  function cardsFor(gid: string, date: Date, c: Record<string, ClassSessionCard[]>): ClassSessionCard[] {
    const iso = isoOf(date);
    for (const [k, list] of Object.entries(c)) {
      const [g, from, to] = k.split('|');
      if (g === gid && from <= iso && iso <= to) return list.filter((x) => x.Date.slice(0, 10) === iso);
    }
    return [];
  }

  // `_deps` solo fuerza a recalcular cuando cambian datos o reloj.
  function dayBlocks(gid: string, date: Date, _deps?: unknown[]): Day {
    const iso = isoOf(date);
    const entries = (schedule[gid] ?? []).filter((e) => e.Weekday === date.getDay()).sort((a, b) => a.Start - b.Start);
    const dayCards = cardsFor(gid, date, cache);
    const used = new Set<string>();
    const take = (e: ScheduleEntry, exact: boolean) =>
      dayCards.find((c) => !used.has(c.ID) && (exact ? c.SubjectID === e.SubjectID : !c.SubjectID)) ?? null;
    const blocks: Block[] = entries.map((e) => {
      const c = take(e, true);
      if (c) used.add(c.ID);
      return {
        key: e.ID,
        time: rangeLabel(e.Start, e.End),
        subject: subjectNames[e.SubjectID] ?? e.SubjectID,
        teacher: teacherNames[e.TeacherID] ?? '',
        card: c,
        state: iso < todayISO ? 'past' : iso > todayISO ? 'future' : nowMin >= e.End ? 'past' : nowMin >= e.Start ? 'now' : 'future'
      };
    });
    for (const b of blocks) {
      if (b.card) continue;
      const e = entries.find((x) => x.ID === b.key);
      const c = e ? take(e, false) : null;
      if (c) {
        used.add(c.ID);
        b.card = c;
      }
    }
    for (const c of dayCards.filter((x) => !used.has(x.ID))) {
      blocks.push({ key: c.ID, time: '', subject: c.Subject || $t.sessionHistory.homeroom, teacher: c.Teacher, card: c, state: 'past' });
    }
    return { iso, date, kind: kindOf(iso), blocks };
  }

  type Tally = { called: number; missing: number; pending: number; absent: number };
  function tally(gid: string, start: Date, days: number, _deps: unknown[]): Tally {
    const out: Tally = { called: 0, missing: 0, pending: 0, absent: 0 };
    for (let i = 0; i < days; i++) {
      const d = dayBlocks(gid, addDays(start, i));
      for (const b of d.blocks) {
        if (b.card) {
          out.called++;
          out.absent += b.card.Absent + b.card.Evasion;
        } else if (d.kind === 'school') {
          if (b.state === 'past') out.missing++;
          else out.pending++;
        }
      }
    }
    return out;
  }

  $: deps = [cache, schedule, years, todayISO, nowMin, subjectNames, teacherNames, cursors];
  $: pageDays = new Date(pageMonth.getFullYear(), pageMonth.getMonth() + 1, 0).getDate();
  $: tallies = Object.fromEntries(groups.map((g) => [g.GroupID, tally(g.GroupID, pageMonth, pageDays, deps)]));
  $: totals = Object.values(tallies).reduce(
    (acc, x) => ({ called: acc.called + x.called, missing: acc.missing + x.missing }),
    { called: 0, missing: 0 }
  );
  $: shownGroups = onlyMissing ? groups.filter((g) => (tallies[g.GroupID]?.missing ?? 0) > 0) : groups;
  $: pageLabel = pageMonth.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  $: pageIsCurrent = pageMonth.getMonth() === now.getMonth() && pageMonth.getFullYear() === now.getFullYear();

  // --- Cada salón con su propio cursor ------------------------------------
  function rangeOf(c: Cursor) {
    return c.view === 'week' ? weekRange(c.week) : monthRange(c.month);
  }
  async function toggleGroup(gid: string) {
    if (cursors[gid]) {
      const next = { ...cursors };
      delete next[gid];
      cursors = next;
      if (detailFor?.gid === gid) closeDetail();
      return;
    }
    const thisMonth = pageIsCurrent;
    cursors = {
      ...cursors,
      [gid]: { view: 'month', week: mondayOf(thisMonth ? now : pageMonth), month: new Date(pageMonth) }
    };
    await ensure([gid], rangeOf(cursors[gid]));
  }
  async function setCursor(gid: string, c: Cursor) {
    cursors = { ...cursors, [gid]: c };
    await ensure([gid], rangeOf(c));
  }
  function shift(gid: string, n: number) {
    const c = cursors[gid];
    if (!c) return;
    if (c.view === 'week') void setCursor(gid, { ...c, week: addDays(c.week, 7 * n) });
    else void setCursor(gid, { ...c, month: new Date(c.month.getFullYear(), c.month.getMonth() + n, 1) });
  }
  function setView(gid: string, view: View) {
    const c = cursors[gid];
    if (!c || c.view === view) return;
    if (view === 'month') {
      const mid = addDays(c.week, 3);
      void setCursor(gid, { ...c, view, month: new Date(mid.getFullYear(), mid.getMonth(), 1) });
    } else {
      const same = c.month.getMonth() === now.getMonth() && c.month.getFullYear() === now.getFullYear();
      void setCursor(gid, { ...c, view, week: mondayOf(same ? now : c.month) });
    }
  }
  function goCurrent(gid: string) {
    const c = cursors[gid];
    if (!c) return;
    void setCursor(gid, { ...c, week: mondayOf(now), month: new Date(now.getFullYear(), now.getMonth(), 1) });
  }
  function openWeekOf(gid: string, date: Date) {
    const c = cursors[gid];
    if (!c) return;
    void setCursor(gid, { ...c, view: 'week', week: mondayOf(date) });
  }
  function cursorLabel(c: Cursor): string {
    return c.view === 'week' ? weekLabel(c.week, 5) : c.month.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  }
  function cursorIsCurrent(c: Cursor): boolean {
    return c.view === 'week'
      ? isoOf(c.week) === isoOf(mondayOf(now))
      : c.month.getMonth() === now.getMonth() && c.month.getFullYear() === now.getFullYear();
  }
  function weekOf(gid: string, c: Cursor, _deps: unknown[]): Day[] {
    const sat = (schedule[gid] ?? []).some((e) => e.Weekday === 6);
    return Array.from({ length: sat ? 6 : 5 }, (_, i) => dayBlocks(gid, addDays(c.week, i)));
  }
  function cursorTally(gid: string, c: Cursor, _deps: unknown[]): Tally {
    if (c.view === 'week') return tally(gid, c.week, 7, _deps);
    const days = new Date(c.month.getFullYear(), c.month.getMonth() + 1, 0).getDate();
    return tally(gid, c.month, days, _deps);
  }

  // --- Detalle de una llamada ----------------------------------------------
  let detailFor: { gid: string; id: string } | null = null;
  let detail: SessionDetailData | null = null;
  let detailLoading = false;
  let showPresent = false;
  let showRevisions = false;

  function closeDetail() {
    detailFor = null;
    detail = null;
  }
  async function openDetail(gid: string, id: string) {
    showPresent = false;
    showRevisions = false;
    if (detailFor?.id === id) return closeDetail();
    detailFor = { gid, id };
    detail = null;
    detailLoading = true;
    try {
      detail = await guarded(() => sessionDetail(id));
    } finally {
      detailLoading = false;
    }
  }

  $: absentLate = (() => {
    if (!detail) return [];
    return detail.Session.Roster.filter((s) => {
      const m = detail?.Marks[s.StudentID] ?? '';
      return m === 'absence' || m === 'absence-permission' || m === 'evasion' || m === 'late';
    }).map((s) => ({ ...s, mark: detail?.Marks[s.StudentID] ?? '' }));
  })();
  $: presentRows = detail ? detail.Session.Roster.filter((s) => !(detail?.Marks[s.StudentID] ?? '')) : [];
  $: openedAt = detail && detail.Revisions.length > 0 ? detail.Revisions[0].ChangedAt : '';

  function markName(m: string): string {
    if (m === 'absence') return $t.roster.absentShort;
    if (m === 'absence-permission') return $t.roster.permission;
    if (m === 'late') return $t.admin.markLate;
    if (m === 'evasion') return $t.admin.markEvasion;
    return $t.admin.markPresent;
  }
  function momentTs(value: string): string {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  function prettyDay(value: string): string {
    const d = new Date(`${dayOf(value)}T12:00:00`);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  let correcting = false;
  async function afterCorrection() {
    correcting = false;
    notify($t.troll.shistory.corrected);
    const keep = detailFor;
    if (keep) {
      const c = cursors[keep.gid];
      if (c) await ensure([keep.gid], rangeOf(c), true);
      await ensure([keep.gid], pageRange, true);
      detailFor = null;
      await openDetail(keep.gid, keep.id);
    }
  }

  // Enlace directo (?sesion=<id>): abre su salón en la semana de la
  // llamada y despliega el detalle.
  async function openDeepSession(id: string) {
    try {
      const found = await guarded(() => sessionDetail(id));
      if (!found) return;
      const d = new Date(`${dayOf(found.Session.Date)}T12:00:00`);
      if (Number.isNaN(d.getTime())) return;
      pageMonth = new Date(d.getFullYear(), d.getMonth(), 1);
      const gid = found.Session.ClassGroupID ?? groups.find((g) => g.ClassLabel === found.Session.ClassLabel)?.GroupID ?? '';
      if (!gid) return;
      await setCursor(gid, { view: 'week', week: mondayOf(d), month: new Date(d.getFullYear(), d.getMonth(), 1) });
      detailFor = { gid, id };
      detail = found;
    } catch {
      /* el historial sigue usable sin el enlace */
    }
  }
</script>

<AdminShell active="estudiantes" year={anchorYear}>
  <TopBar title={$t.troll.shistory.title} showBack onBack={() => goBack('/admin/estudiantes')}><TopActions /></TopBar>

  <div class="bar">
    <div class="nav">
      <button type="button" class="btn btn-sm" aria-label={$t.sessionHistory.prev} on:click={() => (pageMonth = new Date(pageMonth.getFullYear(), pageMonth.getMonth() - 1, 1))}><Icon name="back" /></button>
      <strong class="navlabel">{pageLabel}</strong>
      <button type="button" class="btn btn-sm" aria-label={$t.sessionHistory.next} on:click={() => (pageMonth = new Date(pageMonth.getFullYear(), pageMonth.getMonth() + 1, 1))}><Icon name="next" /></button>
      {#if !pageIsCurrent}
        <button type="button" class="btn btn-sm" on:click={() => (pageMonth = new Date(now.getFullYear(), now.getMonth(), 1))}>{$t.sessionHistory.thisMonth}</button>
      {/if}
    </div>
    <div class="sums">
      <span class="sum ok"><strong>{totals.called}</strong> {$t.sessionHistory.calledLabel}</span>
      <span class="sum bad" class:zero={totals.missing === 0}><strong>{totals.missing}</strong> {$t.sessionHistory.missingShort}</span>
      <label class="only">
        <input type="checkbox" bind:checked={onlyMissing} />
        {$t.sessionHistory.onlyMissing}
      </label>
    </div>
  </div>

  <div class="sheet">
    {#if loadingGroups && groups.length === 0}
      <Skeleton rows={6} />
    {:else if groups.length === 0}
      <EmptyState icon="calendar" title={$t.sessionHistory.noGroupsTitle} body={$t.sessionHistory.noGroupsBody(anchorYear)} />
    {:else if shownGroups.length === 0}
      <EmptyState icon="calendar" title={$t.sessionHistory.allCalledTitle} body={$t.sessionHistory.allCalledBody} />
    {:else}
      <ul class="salons">
        {#each shownGroups as g (g.GroupID)}
          {@const c = cursors[g.GroupID]}
          {@const tl = c ? cursorTally(g.GroupID, c, deps) : tallies[g.GroupID]}
          <li class="salon" class:expanded={!!c}>
            <button type="button" class="shead" aria-expanded={!!c} on:click={() => toggleGroup(g.GroupID)}>
              <span class="chev" aria-hidden="true"><Icon name="next" /></span>
              <span class="slabel">{$t.sessionHistory.salon} {g.ClassLabel}</span>
              {#if typeof g.StudentCount === 'number'}<small class="scount">{$t.admin.spotGroupCount(g.StudentCount)}</small>{/if}
              <span class="ssum">
                {#if loadingPage && !c}
                  <small class="muted">…</small>
                {:else if tl}
                  <span class="pill ok"><Icon name="check" /> {$t.sessionHistory.calledCount(tl.called)}</span>
                  <span class="pill bad" class:zero={tl.missing === 0}><Icon name="warn" /> {$t.sessionHistory.missingCount(tl.missing)}</span>
                  {#if tl.pending > 0}<span class="pill"><Icon name="clock" /> {$t.sessionHistory.pendingCount(tl.pending)}</span>{/if}
                  {#if tl.absent > 0}<span class="pill abs">{$t.sessionHistory.absentCount(tl.absent)}</span>{/if}
                {/if}
              </span>
            </button>

            {#if c}
              <div class="sbody">
                <div class="sbar">
                  <div class="tabs" role="tablist" aria-label={`${$t.sessionHistory.salon} ${g.ClassLabel}`}>
                    <button type="button" role="tab" aria-selected={c.view === 'month'} class:on={c.view === 'month'} on:click={() => setView(g.GroupID, 'month')}>
                      <Icon name="calendar" /> {$t.sessionHistory.month}
                    </button>
                    <button type="button" role="tab" aria-selected={c.view === 'week'} class:on={c.view === 'week'} on:click={() => setView(g.GroupID, 'week')}>
                      <Icon name="list" /> {$t.sessionHistory.week}
                    </button>
                  </div>
                  <div class="nav">
                    <button type="button" class="btn btn-sm" aria-label={$t.sessionHistory.prev} on:click={() => shift(g.GroupID, -1)}><Icon name="back" /></button>
                    <strong class="navlabel">{cursorLabel(c)}</strong>
                    <button type="button" class="btn btn-sm" aria-label={$t.sessionHistory.next} on:click={() => shift(g.GroupID, 1)}><Icon name="next" /></button>
                    {#if !cursorIsCurrent(c)}
                      <button type="button" class="btn btn-sm" on:click={() => goCurrent(g.GroupID)}>{c.view === 'week' ? $t.studentAttendance.thisWeek : $t.sessionHistory.thisMonth}</button>
                    {/if}
                  </div>
                  <div class="legend">
                    <span><i class="sw full"></i>{$t.sessionHistory.legendFull}</span>
                    <span><i class="sw gap"></i>{$t.sessionHistory.legendMissing}</span>
                    <span><i class="sw pend"></i>{$t.studentAttendance.pending}</span>
                    <span><i class="sw off"></i>{$t.sessionHistory.legendOff}</span>
                  </div>
                </div>

                {#if c.view === 'week'}
                  {@const week = weekOf(g.GroupID, c, deps)}
                  <div class="days" style={`--cols:${week.length}`}>
                    {#each week as d (d.iso)}
                      <div class="day" class:today={d.iso === todayISO} class:off={d.kind !== 'school'}>
                        <div class="dayhead">
                          <strong>{d.date.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })}</strong>
                          {#if d.iso === todayISO}<span class="tag now">{$t.studentAttendance.today}</span>{/if}
                          {#if d.kind !== 'school'}<span class="tag">{kindLabel(d.kind)}</span>{/if}
                        </div>
                        {#if d.blocks.length === 0}
                          <p class="muted small">{d.kind === 'school' ? $t.sessionHistory.noBlocks : ''}</p>
                        {:else}
                          <ul class="blocks">
                            {#each d.blocks as b (b.key)}
                              {#if b.card}
                                {@const card = b.card}
                                <li>
                                  <button
                                    type="button"
                                    class="block called"
                                    class:sel={detailFor?.id === card.ID}
                                    aria-expanded={detailFor?.id === card.ID}
                                    on:click={() => openDetail(g.GroupID, card.ID)}
                                  >
                                    <span class="time">{b.time || '—'}</span>
                                    <span class="st ok"><Icon name="check" /> {$t.sessionHistory.called}</span>
                                    <strong class="subj">{b.subject}</strong>
                                    {#if card.Teacher || b.teacher}<small class="who">{card.Teacher || b.teacher}</small>{/if}
                                    <span class="counts">
                                      <span class="c p" title={$t.admin.markPresent}>{card.Present}</span>
                                      {#if card.Absent}<span class="c a" title={$t.roster.absentShort}>{card.Absent}</span>{/if}
                                      {#if card.Permission}<span class="c x" title={$t.roster.permission}>{card.Permission}</span>{/if}
                                      {#if card.Evasion}<span class="c v" title={$t.admin.markEvasion}>{card.Evasion}</span>{/if}
                                      {#if card.Late}<span class="c l" title={$t.admin.markLate}>{card.Late}</span>{/if}
                                    </span>
                                  </button>
                                </li>
                              {:else}
                                <li>
                                  <div class={`block ${d.kind !== 'school' ? 'offday' : b.state === 'past' ? 'missing' : b.state}`}>
                                    <span class="time">{b.time}</span>
                                    {#if d.kind !== 'school'}
                                      <span class="st">{kindLabel(d.kind)}</span>
                                    {:else if b.state === 'past'}
                                      <span class="st bad"><Icon name="warn" /> {$t.studentAttendance.uncalled}</span>
                                    {:else if b.state === 'now'}
                                      <span class="st now">{$t.studentAttendance.nowClass}</span>
                                    {:else}
                                      <span class="st">{$t.studentAttendance.pending}</span>
                                    {/if}
                                    <strong class="subj">{b.subject}</strong>
                                    {#if b.teacher}<small class="who">{b.teacher}</small>{/if}
                                  </div>
                                </li>
                              {/if}
                            {/each}
                          </ul>
                        {/if}
                      </div>
                    {/each}
                  </div>
                {:else}
                  <div class="cal" role="grid" aria-label={cursorLabel(c)}>
                    <div class="calhead">{cursorLabel(c)}</div>
                    {#each $t.studentAttendance.weekdaysShort as w}<span class="wd" role="columnheader">{w}</span>{/each}
                    {#each monthCells(c.month) as cell (cell.iso)}
                      {@const d = dayBlocks(g.GroupID, cell.date, deps)}
                      {@const total = d.blocks.length}
                      {@const done = d.blocks.filter((b) => b.card).length}
                      {@const miss = d.kind === 'school' ? d.blocks.filter((b) => !b.card && b.state === 'past').length : 0}
                      {@const pend = d.kind === 'school' ? d.blocks.filter((b) => !b.card && b.state !== 'past').length : 0}
                      <button
                        type="button"
                        role="gridcell"
                        class={`cell k-${d.kind}`}
                        class:outm={!cell.inMonth}
                        class:today={cell.iso === todayISO}
                        class:full={total > 0 && miss === 0 && pend === 0 && d.kind === 'school'}
                        class:gap={miss > 0}
                        class:pend={miss === 0 && pend > 0}
                        title={d.kind !== 'school' ? kindLabel(d.kind) : total ? $t.sessionHistory.cellTip(done, total, miss) : ''}
                        on:click={() => openWeekOf(g.GroupID, cell.date)}
                      >
                        <span class="num">{cell.date.getDate()}</span>
                        {#if d.kind !== 'school' && cell.inMonth}
                          <span class="kmini">{kindLabel(d.kind)}</span>
                        {:else if total > 0}
                          <span class="ratio">{done}/{total}</span>
                          {#if miss > 0}<span class="miss">{$t.sessionHistory.missingCount(miss)}</span>{/if}
                        {/if}
                      </button>
                    {/each}
                  </div>
                  <p class="muted small">{$t.sessionHistory.monthHint}</p>
                {/if}

              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <Sheet
    open={!!detailFor && !correcting}
    wide
    title={detail ? `${prettyDay(detail.Session.Date)} · ${detail.Session.ClassLabel}` : $t.troll.shistory.title}
    onClose={closeDetail}
  >
    <div class="detail">
                    {#if detailLoading || !detail}
                      <Skeleton rows={2} />
                    {:else}
                      {#if openedAt}<p class="muted small">{$t.troll.shistory.atLabel} {momentTs(openedAt)}</p>{/if}
                      {#if absentLate.length === 0}
                        <p class="muted">{$t.troll.allPresentNote}</p>
                      {:else}
                        <h3 class="sub">{$t.troll.absentOnes}</h3>
                        <ul class="names">
                          {#each absentLate as s (s.StudentID)}
                            <li>
                              <span class={`sev ${s.mark === 'late' ? 'medio' : s.mark === 'absence-permission' ? 'perm' : 'grave'}`}>{markName(s.mark)}</span>
                              <strong>{s.Names} {s.Surnames}</strong>
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
                        <button type="button" class="btn btn-sm" on:click={() => (correcting = true)}>{$t.troll.shistory.correctAction}</button>
                        <button type="button" class="btn btn-sm" on:click={() => (showRevisions = !showRevisions)}>
                          {showRevisions ? $t.troll.hideRevisions : $t.troll.showRevisions}
                        </button>
                      </div>
                      {#if showPresent}
                        <ul class="names plain">
                          {#each presentRows as s (s.StudentID)}<li>{s.Names} {s.Surnames}</li>{/each}
                        </ul>
                      {/if}
                      {#if showRevisions}<SessionRevisionTrail revisions={mergeTrail(detail)} />{/if}
                    {/if}
                  </div>
  </Sheet>

  <SessionCorrectSheet
    open={correcting}
    title={$t.troll.shistory.correctTitle}
    subtitle={detail ? `${prettyDay(detail.Session.Date)} · ${detail.Session.ClassLabel}` : ''}
    sessionId={detailFor?.id ?? ''}
    students={detail ? detail.Session.Roster.map((s) => ({ id: s.StudentID, name: `${s.Names} ${s.Surnames}`, current: detail?.Marks[s.StudentID] ?? '' })) : []}
    onClose={() => (correcting = false)}
    onSaved={afterCorrection}
  />
</AdminShell>

<style>
  .bar {
    position: sticky;
    top: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    gap: 10px 16px;
    flex-wrap: wrap;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-sheet);
    padding: 10px 14px;
    margin-bottom: 12px;
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
  .nav {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .navlabel {
    min-width: 150px;
    text-align: center;
    font-size: 0.92rem;
    text-transform: capitalize;
  }
  .tabs :global(svg),
  .nav :global(svg),
  .pill :global(svg),
  .st :global(svg) {
    width: 14px;
    height: 14px;
  }
  .sums {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    font-size: 0.8rem;
  }
  .sum {
    border-radius: 999px;
    padding: 3px 10px;
    border: 1px solid var(--line);
  }
  .sum.ok {
    background: var(--chip-green-bg);
    color: var(--m-present);
  }
  .sum.bad {
    background: var(--g-grave-bg);
    color: var(--g-grave-ink);
  }
  .sum.bad.zero {
    background: var(--surface-2);
    color: var(--muted);
  }
  .only {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--ink-soft);
    font-weight: 600;
  }
  .sheet {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-sheet);
    padding: 14px;
  }
  .muted {
    color: var(--muted);
    font-size: 0.85rem;
    margin: 0;
  }
  .small {
    font-size: 0.76rem;
  }
  .salons {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .salon {
    display: block;
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    background: var(--card);
    overflow: hidden;
  }
  .salon.expanded {
    border-color: var(--ink-soft);
  }
  .shead {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    padding: 12px 14px;
    text-align: left;
    color: var(--ink);
  }
  .shead:hover {
    background: var(--surface-2);
  }
  .slabel {
    font-weight: 700;
    font-size: 0.95rem;
  }
  .scount {
    color: var(--muted);
    font-size: 0.76rem;
  }
  .ssum {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-left: auto;
    justify-content: flex-end;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.74rem;
    font-weight: 700;
    border-radius: 999px;
    padding: 2px 9px;
    background: var(--surface-2);
    color: var(--muted);
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
  .pill.abs {
    background: var(--chip-yellow-bg);
    color: var(--chip-yellow-ink);
  }
  .chev {
    display: inline-flex;
    color: var(--muted);
    flex: none;
  }
  .chev :global(svg) {
    width: 16px;
    height: 16px;
    transition: transform var(--t-fast, 0.15s) var(--ease-out);
  }
  .salon.expanded .chev :global(svg) {
    transform: rotate(90deg);
  }
  .sbody {
    border-top: 1px solid var(--line);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    animation: sIn 0.16s var(--ease-out) both;
  }
  @keyframes sIn {
    from {
      opacity: 0;
      transform: translateY(-3px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  .days {
    display: grid;
    grid-template-columns: repeat(var(--cols, 5), minmax(170px, 1fr));
    gap: 8px;
    overflow-x: auto;
    scroll-snap-type: x proximity;
    padding-bottom: 4px;
  }
  .day {
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    padding: 8px;
    background: var(--surface);
    min-width: 0;
    scroll-snap-align: start;
  }
  .day.today {
    border-color: var(--accent);
    box-shadow: inset 0 3px 0 var(--accent);
  }
  .day.off {
    background: repeating-linear-gradient(135deg, var(--surface-2) 0 6px, var(--surface) 6px 12px);
  }
  .dayhead {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    padding-bottom: 6px;
    margin-bottom: 6px;
    border-bottom: 1px solid var(--line);
  }
  .dayhead strong {
    font-size: 0.82rem;
    text-transform: capitalize;
  }
  .tag {
    font-size: 0.66rem;
    font-weight: 700;
    border-radius: 999px;
    padding: 1px 7px;
    background: var(--surface-2);
    color: var(--muted);
    border: 1px solid var(--line);
  }
  .tag.now {
    background: var(--accent-soft);
    color: var(--accent);
    border-color: var(--accent);
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
    width: 100%;
    text-align: left;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    border: 1px solid var(--line);
    border-radius: var(--radius-control);
    padding: 6px 8px;
    color: var(--ink);
    background: var(--surface);
    min-width: 0;
  }
  .block.called:hover {
    border-color: var(--ink-soft);
  }
  .block.called.sel {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }
  .block.missing {
    background: var(--g-grave-bg);
    border-color: transparent;
  }
  .block.future {
    border-style: dashed;
  }
  .block.now {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .block.offday {
    opacity: 0.7;
  }
  .time {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .st {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 0.66rem;
    font-weight: 700;
    color: var(--muted);
    line-height: 1.2;
  }
  .st.ok {
    color: var(--m-present);
  }
  .st.bad {
    color: var(--g-grave-ink);
  }
  .st.now {
    color: var(--accent);
  }
  .subj {
    font-size: 0.82rem;
  }
  .who {
    font-size: 0.7rem;
    color: var(--muted);
  }
  .counts {
    display: flex;
    gap: 4px;
    margin-top: 2px;
  }
  .c {
    font-size: 0.68rem;
    font-weight: 700;
    border-radius: 999px;
    padding: 0 7px;
    font-variant-numeric: tabular-nums;
  }
  .c.p {
    background: var(--chip-green-bg);
    color: var(--m-present);
  }
  .c.a {
    background: var(--g-grave-bg);
    color: var(--g-grave-ink);
  }
  .c.x {
    background: var(--m-permission-bg);
    color: var(--m-permission);
  }
  .c.v {
    background: var(--chip-purple-bg);
    color: var(--chip-purple-ink);
  }
  .c.l {
    background: var(--chip-yellow-bg);
    color: var(--chip-yellow-ink);
  }
  /* Mes */
  .cal {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 4px;
    max-width: 920px;
  }
  .wd {
    text-align: center;
    font-size: 0.68rem;
    font-weight: 700;
    color: var(--muted);
    text-transform: uppercase;
  }
  .cell {
    min-height: 58px;
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 4px 5px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
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
  .cell.full {
    background: var(--chip-green-bg);
  }
  .cell.gap {
    background: var(--g-grave-bg);
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
  .ratio {
    font-size: 0.72rem;
    font-variant-numeric: tabular-nums;
    color: var(--ink-soft);
  }
  .miss {
    font-size: 0.62rem;
    font-weight: 700;
    color: var(--g-grave-ink);
    line-height: 1.1;
  }
  .kmini {
    font-size: 0.6rem;
    color: var(--muted);
  }
  .sbar {
    display: flex;
    align-items: center;
    gap: 8px 16px;
    flex-wrap: wrap;
  }
  .legend {
    display: flex;
    gap: 6px 12px;
    flex-wrap: wrap;
    font-size: 0.72rem;
    color: var(--muted);
    margin-left: auto;
  }
  .legend span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .sw {
    display: inline-block;
    width: 12px;
    height: 12px;
    border-radius: 3px;
    border: 1px solid var(--line);
  }
  .sw.full {
    background: var(--chip-green-bg);
  }
  .sw.gap {
    background: var(--g-grave-bg);
  }
  .sw.pend {
    background: var(--surface);
    border-style: dashed;
  }
  .sw.off {
    background: repeating-linear-gradient(135deg, var(--surface-2) 0 3px, var(--surface) 3px 6px);
  }
  .calhead {
    grid-column: 1 / -1;
    font-weight: 700;
    font-size: 0.95rem;
    text-transform: capitalize;
    padding: 2px 2px 6px;
  }
  .cell.pend {
    border-style: dashed;
  }
  .pill.bad.zero {
    background: var(--surface-2);
    color: var(--muted);
  }
  .scount {
    margin-right: 4px;
  }
  /* Detalle */
  .detail {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .sub {
    font-size: 0.8rem;
    color: var(--muted);
    margin: 0;
  }
  .names {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .names li {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.85rem;
  }
  .sev {
    font-size: 0.7rem;
    font-weight: 700;
    border-radius: 999px;
    padding: 1px 8px;
  }
  .sev.grave {
    background: var(--g-grave-bg);
    color: var(--g-grave-ink);
  }
  .sev.medio {
    background: var(--chip-yellow-bg);
    color: var(--chip-yellow-ink);
  }
  .sev.perm {
    background: var(--m-permission-bg);
    color: var(--m-permission);
  }
  .btnrow {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  @media (max-width: 520px) {
    .cell {
      min-height: 46px;
      padding: 3px;
    }
    .miss,
    .kmini {
      display: none;
    }
  }
</style>
