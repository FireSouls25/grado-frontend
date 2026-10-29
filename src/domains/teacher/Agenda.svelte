<script lang="ts">
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { t } from '$lib/i18n';
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ErrorState from '$lib/ui/ErrorState.svelte';
  import TeacherShell from './TeacherShell.svelte';
  import WarningNewSheet from './WarningNewSheet.svelte';
  import AcademicAlertSheet from './AcademicAlertSheet.svelte';
  import { daySchedule, isMissing, type TeacherClass } from './api';
  import { loadRollcall } from './rollcall';
  import { guarded } from '$lib/nav';
  import { ApiError } from '$lib/api/types';
  import { profile } from '$lib/shell/profile';

  // El nombre de cabecera llega de la propia cuenta (GET /v1/me):
  // mientras carga se queda la copia neutra, sin datos inventados.
  $: profileTeacher = $profile.me?.teacher ?? null;
  $: headerName = profileTeacher ? `${profileTeacher.surnames} ${profileTeacher.names}` : '';

  interface AgendaItem extends TeacherClass {
    Room: string;
    Grade: string;
  }

  // Semana real (lunes a viernes) derivada de la fecha actual: el backend
  // es la única fuente de clases; sin ruta todavía cada día pinta vacío
  // honesto en vez de datos falsos.
  const monday = (() => {
    const d = new Date();
    const back = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - back);
    d.setHours(0, 0, 0, 0);
    return d;
  })();
  const weekDays = [0, 1, 2, 3, 4].map((i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });
  const jsWeekdays = [1, 2, 3, 4, 5];
  const todayIdx = (() => {
    const js = new Date().getDay();
    return js >= 1 && js <= 5 ? js - 1 : -1;
  })();

  let selectedDay = todayIdx === -1 ? 0 : todayIdx;
  let search = '';
  let searchEl: HTMLInputElement | null = null;
  let warnFor: { gid: string; label: string } | null = null;
  let warnGlobal = false;
  let alertGlobal = false;

  let loading = true;
  let loadError: unknown = null;
  let baseList: AgendaItem[] = [];
  let backendMissing = false;

  $: weekdayLabel = (d: Date) =>
    d.toLocaleDateString('es-CO', { weekday: 'short' }).replace('.', '');
  $: monthLabel = monday.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });

  async function load() {
    loading = true;
    loadError = null;
    try {
      const weekday = jsWeekdays[selectedDay];
      const classes = await guarded(() => daySchedule(weekday));
      if (classes === null) {
        loading = false;
        return;
      }
      backendMissing = false;
      // El salón no viene en el horario todavía: Room es opcional en
      // TeacherClass y la tarjeta lo omite mientras tanto.
      baseList = [...classes]
        .sort((a, b) => a.Start.localeCompare(b.Start))
        .map((c) => ({
          ...c,
          Room: c.Room ?? '',
          Grade: c.ClassLabel
        }));
    } catch (err) {
      if (err instanceof ApiError && isMissing(err)) {
        // Backend sin ruta todavía: vacío honesto, no error.
        backendMissing = true;
        baseList = [];
      } else {
        loadError = err;
      }
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    load();
    if ($profile.state === 'idle') void profile.refresh();
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        e.key === '/' &&
        target &&
        target.tagName !== 'INPUT' &&
        target.tagName !== 'TEXTAREA' &&
        !target.isContentEditable
      ) {
        e.preventDefault();
        searchEl?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function selectDay(i: number) {
    selectedDay = i;
    load();
  }

  function minutesOf(hhmm: string): number {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + (m || 0);
  }

  function statusOf(item: AgendaItem): 'done' | 'now' | 'next' {
    if (selectedDay !== todayIdx || todayIdx === -1) return 'next';
    const now = new Date().getHours() * 60 + new Date().getMinutes();
    if (now > minutesOf(item.End)) return 'done';
    if (now >= minutesOf(item.Start)) return 'now';
    return 'next';
  }

  $: q = search.trim().toLowerCase();
  $: visible = q
    ? baseList.filter((c) =>
        `${c.SubjectName} ${c.Grade} ${c.Room}`.toLowerCase().includes(q)
      )
    : baseList;

  $: doneCount = selectedDay === todayIdx ? baseList.filter((c) => statusOf(c) === 'done').length : 0;

  function openClass(item: AgendaItem) {
    push(`/clase/${encodeURIComponent(item.GroupID)}?materia=${encodeURIComponent(item.SubjectID)}`);
  }

  // Resumen local del llamado de hoy para una tarjeta (solo si el docente
  // guardó el llamado de ese salón en este dispositivo hoy).
  $: rollsOfToday =
    selectedDay === todayIdx && todayIdx !== -1
      ? new Map(visible.map((c) => [c.GroupID, loadRollcall(c.GroupID)]))
      : new Map<string, null>();
</script>

<TeacherShell active="agenda">
  <div class="agenda">
  <TopBar title={$t.agenda.title} subtitle={headerName || monthLabel}>
    <TopActions />
  </TopBar>

  <div class="filterbar">
    <label class="search">
      <Icon name="search" />
      <input
        type="search"
        placeholder={$t.agenda.searchPlaceholder}
        aria-label={$t.agenda.searchLabel}
        bind:value={search}
        bind:this={searchEl}
      />
      <kbd title={$t.agenda.searchLabel}>/</kbd>
    </label>
    <div class="stats">
      <span class="statpill num">{$t.agenda.todayValue(baseList.length)}</span>
      <span class="statpill num">{$t.agenda.registeredValue(doneCount, baseList.length)}</span>
    </div>
    <div class="quick-actions">
      <button type="button" class="btn btn-sm" on:click={() => (warnGlobal = true)}>
        <Icon name="warn" /> {$t.agenda.warnAction}
      </button>
      <button type="button" class="btn btn-sm" on:click={() => (alertGlobal = true)}>
        {$t.academicAlert.action}
      </button>
    </div>
  </div>

  <div class="sheet">
    <section class="week" aria-label={monthLabel}>
      <p class="month">{monthLabel}</p>
      <div class="days" role="tablist">
        {#each weekDays as d, i}
          <button
            type="button"
            role="tab"
            aria-selected={selectedDay === i}
            class="day"
            class:selected={selectedDay === i}
            class:today={i === todayIdx}
            on:click={() => selectDay(i)}
          >
            <small>{weekdayLabel(d)}</small>
            <strong>{d.getDate()}</strong>
          </button>
        {/each}
      </div>
    </section>

    <h2 class="list-title">{$t.agenda.listTitle}</h2>

    {#if loading}
      <Skeleton rows={4} />
    {:else if loadError}
      <ErrorState error={loadError} onRetry={load} />
    {:else if visible.length === 0}
      {#if search.trim()}
        <!-- Distinguir "no hay clases" de "tu filtro no encontró nada":
             si no, el docente cree que el día está vacío. -->
        <EmptyState icon="search" title={$t.agenda.noMatchTitle} body={$t.agenda.noMatchBody} />
      {:else}
        <EmptyState icon="calendar" title={$t.agenda.emptyTitle} body={backendMissing ? $t.schedule.emptyBody : $t.agenda.emptyBody} />
      {/if}
    {:else}
      <ol class="timeline">
        {#each visible as item (item.GroupID + item.Start)}
          {@const st = statusOf(item)}
          {@const rec = rollsOfToday.get(item.GroupID) ?? null}
          <li class={st}>
            <span class="rail" aria-hidden="true"><span class="pip"></span></span>
            <div class="tblock">
              <div>
                <strong>{item.Start} - {item.End}</strong>
                <span class="subj">{item.SubjectName}</span>
              </div>
              <div class="facts">
                <span class="factpill"><Icon name="list" /> {$t.agenda.gradeLabel(item.Grade)}</span>
                {#if item.Room}
                  <span class="factpill"><Icon name="pin" /> {$t.agenda.roomLabel(item.Room)}</span>
                {/if}
                {#if rec}
                  <span
                    class="factpill roll"
                    title={$t.agenda.rollTooltip}
                    aria-label={$t.agenda.rollCounts(rec.Present, rec.Absent, rec.Permission, rec.Late ?? 0, rec.Evasion ?? 0)}
                  >
                    <i class="dot p"></i>{rec.Present}
                    <i class="dot a"></i>{rec.Absent}
                    <i class="dot x"></i>{rec.Permission}
                    {#if (rec.Late ?? 0) > 0}<i class="dot l"></i>{rec.Late}{/if}
                    {#if (rec.Evasion ?? 0) > 0}<i class="dot v"></i>{rec.Evasion}{/if}
                    <small class="tag">{$t.agenda.rollLocalTag}</small>
                  </span>
                {/if}
              </div>
            </div>
            <span class={`st ${st}`}>
              {st === 'done' ? $t.agenda.stateDone : st === 'now' ? $t.agenda.stateNow : $t.agenda.stateNext}
            </span>
            <div class="rowbtns">
              <button type="button" class={st === 'now' ? 'btn btn-primary btn-sm' : 'btn btn-sm'} on:click={() => openClass(item)}>
                {$t.agenda.openList}
              </button>
              <button
                type="button"
                class="btn btn-sm btn-danger"
                on:click={() => (warnFor = { gid: item.GroupID, label: `${item.Grade} · ${item.SubjectName}` })}
              >
                {$t.agenda.warnAction}
              </button>
            </div>
          </li>
        {/each}
      </ol>
    {/if}
  </div>
  {#if warnFor}
    <WarningNewSheet
      open
      groupID={warnFor.gid}
      originLabel={warnFor.label}
      onClose={() => (warnFor = null)}
      onSaved={() => (warnFor = null)}
    />
  {/if}
  {#if warnGlobal}
    <WarningNewSheet
      open
      scope="all"
      originLabel={$t.agenda.allGroups}
      onClose={() => (warnGlobal = false)}
      onSaved={() => (warnGlobal = false)}
    />
  {/if}
  {#if alertGlobal}
    <AcademicAlertSheet
      open
      scope="all"
      originLabel={$t.agenda.allGroups}
      onClose={() => (alertGlobal = false)}
      onSaved={() => (alertGlobal = false)}
    />
  {/if}
</div>

</TeacherShell>

<style>
  .agenda {
    margin: 0 auto;
    max-width: 1440px;
    min-width: 0;
    color: var(--ink);
  }
  .filterbar {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    margin-bottom: 14px;
  }
  .search {
    display: flex;
    gap: 8px;
    align-items: center;
    background: var(--surface);
    border: 1px solid var(--control);
    border-radius: var(--radius-control);
    padding: 0 10px;
    color: var(--muted);
    min-height: var(--control-height);
    flex: 1 1 220px;
    max-width: 340px;
  }
  .search:focus-within {
    border-color: var(--accent);
  }
  .search :global(svg) {
    width: 16px;
    height: 16px;
    flex: none;
  }
  .search input {
    border: 0;
    background: none;
    outline: none;
    width: 100%;
    color: var(--ink);
    font-size: 0.84rem;
  }
  .search kbd {
    font-family: inherit;
    font-size: 0.72rem;
    color: var(--muted);
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: 1px 5px;
  }
  .stats {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .quick-actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    flex-basis: 100%;
  }
  .quick-actions .btn :global(svg) {
    width: 14px;
    height: 14px;
  }
  .statpill {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 6px 12px;
    font-size: 0.76rem;
    font-weight: 600;
    color: var(--ink-soft);
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    font-variant-numeric: tabular-nums;
  }
  .sheet {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-sheet);
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .week {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    padding: 12px;
  }
  .month {
    color: var(--muted);
    font-size: 0.76rem;
    font-weight: 600;
    margin-bottom: 8px;
    text-transform: capitalize;
  }
  .days {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 8px;
  }
  .day {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-control);
    padding: 8px 4px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    min-height: 58px;
    font-variant-numeric: tabular-nums;
  }
  .day:hover:not(.selected) {
    border-color: var(--control);
    background: var(--surface-2);
  }
  .day small {
    color: var(--muted);
    font-size: 0.72rem;
    font-weight: 500;
    text-transform: capitalize;
  }
  .day strong {
    font-size: 1.1rem;
    font-weight: 600;
  }
  .day.selected {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--bg);
  }
  .day.selected small {
    color: var(--bg);
    opacity: 0.7;
  }
  .day.today:not(.selected) {
    border-color: var(--accent);
  }
  .list-title {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--ink);
  }
  .timeline {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .timeline li {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr);
    gap: 4px 12px;
    padding: 13px 4px;
    border-top: 1px solid var(--line);
  }
  .timeline li:first-child {
    border-top: 0;
  }
  .rail {
    display: flex;
    justify-content: center;
    align-self: stretch;
    position: relative;
    grid-row: span 2;
  }
  .rail::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: var(--line);
  }
  .pip {
    width: 10px;
    height: 10px;
    border-radius: var(--radius-pill);
    background: var(--surface);
    border: 2px solid var(--muted);
    margin-top: 4px;
    z-index: 1;
  }
  li.done .pip {
    background: var(--ink);
    border-color: var(--ink);
  }
  li.now .pip {
    background: var(--accent);
    border-color: var(--accent);
  }
  .tblock {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  .tblock strong {
    font-size: 0.9rem;
    font-variant-numeric: tabular-nums;
  }
  .subj {
    font-weight: 600;
    font-size: 0.9rem;
    margin-left: 8px;
  }
  .facts {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 8px;
    color: var(--ink-soft);
    font-size: 0.74rem;
  }
  .factpill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 3px 10px;
    font-weight: 600;
  }
  .factpill :global(svg) {
    width: 14px;
    height: 14px;
  }
  .factpill.roll {
    font-variant-numeric: tabular-nums;
  }
  .factpill.roll i.dot {
    width: 8px;
    height: 8px;
    border-radius: var(--radius-pill);
    flex: none;
  }
  .factpill.roll i.dot.p {
    background: var(--m-present);
  }
  .factpill.roll i.dot.a {
    background: var(--m-absent);
  }
  .factpill.roll i.dot.x {
    background: var(--m-permission);
  }
  .factpill.roll i.dot.l {
    background: var(--m-late);
  }
  .factpill.roll i.dot.v {
    background: var(--m-evasion);
  }
  .factpill.roll small.tag {
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--muted);
    margin-left: 2px;
  }
  li.done {
    opacity: 0.65;
  }
  .st {
    grid-column: 2;
    justify-self: start;
    font-size: 0.72rem;
    font-weight: 600;
    border-radius: 999px;
    padding: 3px 10px;
    white-space: nowrap;
    background: var(--surface-2);
    border: 1px solid var(--line);
    color: var(--ink-soft);
  }
  .st.now {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--accent);
  }
  .st.done {
    opacity: 0.75;
  }
  .rowbtns {
    grid-column: 2;
    justify-self: start;
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  @media (min-width: 720px) {
    .sheet {
      padding: 20px;
    }
    .timeline li {
      grid-template-columns: 24px minmax(0, 1fr) auto auto;
      align-items: center;
    }
    .rail {
      grid-row: auto;
    }
    .st,
    .rowbtns {
      grid-column: auto;
    }
  }
</style>
