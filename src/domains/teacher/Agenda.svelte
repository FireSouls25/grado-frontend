<script lang="ts">
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { t } from '$lib/i18n';
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import { daySchedule, isMissing, type TeacherClass } from './api';
  import { guarded } from '$lib/nav';
  import { ApiError } from '$lib/api/types';

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
  let loading = true;
  let loadError = false;
  let baseList: AgendaItem[] = [];
  let backendMissing = false;

  $: weekdayLabel = (d: Date) =>
    d.toLocaleDateString('es-CO', { weekday: 'short' }).replace('.', '');
  $: monthLabel = monday.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });

  async function load() {
    loading = true;
    loadError = false;
    try {
      const weekday = jsWeekdays[selectedDay];
      const classes = await guarded(() => daySchedule(weekday));
      if (classes === null) {
        loading = false;
        return;
      }
      backendMissing = false;
      // El salón no viene en el horario: no se inventa. El endpoint
      // futuro traerá `Room`; mientras tanto la tarjeta lo omite.
      baseList = [...classes]
        .sort((a, b) => a.Start.localeCompare(b.Start))
        .map((c) => ({
          ...c,
          Room: (c as { Room?: string }).Room ?? '',
          Grade: c.ClassLabel
        }));
    } catch (err) {
      if (err instanceof ApiError && isMissing(err)) {
        // Backend sin ruta todavía: vacío honesto, no error.
        backendMissing = true;
        baseList = [];
      } else {
        loadError = true;
      }
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    load();
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
</script>

<div class="agenda">
  <TopBar title={$t.app.name}><TopActions /></TopBar>

  <div class="pagehead">
    <p class="eyebrow">{$t.agenda.eyebrow}</p>
    <h1 class="title">{$t.agenda.title}</h1>
    <div class="controlbar">
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
        <span class="statpill">{$t.agenda.todayValue(baseList.length)}</span>
        <span class="statpill">{$t.agenda.registeredValue(doneCount, baseList.length)}</span>
      </div>
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
      <EmptyState icon="warn" title={$t.common.loadError} actionLabel={$t.common.retry} onAction={load} />
    {:else if visible.length === 0}
      <EmptyState icon="calendar" title={$t.agenda.emptyTitle} body={backendMissing ? $t.schedule.emptyBody : $t.agenda.emptyBody} />
    {:else}
      <ol class="timeline">
        {#each visible as item (item.GroupID + item.Start)}
          {@const st = statusOf(item)}
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
              </div>
            </div>
            <span class={`st ${st}`}>
              {st === 'done' ? $t.agenda.stateDone : st === 'now' ? $t.agenda.stateNow : $t.agenda.stateNext}
            </span>
            <button type="button" class="open" on:click={() => openClass(item)}>
              {$t.agenda.openList}
            </button>
          </li>
        {/each}
      </ol>
    {/if}
  </div>
</div>

<style>
  .agenda {
    min-height: 100vh;
    min-height: 100svh;
    background: var(--bg);
    color: var(--ink);
    /* Estas páginas ya no montan la barra inferior: sin reserva muerta. */
    padding-bottom: calc(28px + env(safe-area-inset-bottom));
  }
  .pagehead {
    margin-bottom: 12px;
  }
  .eyebrow {
    color: var(--muted);
    font-size: 0.85rem;
    margin-bottom: 2px;
  }
  .title {
    font-size: 2rem;
    letter-spacing: -0.03em;
    font-weight: 550;
    line-height: 1.05;
    margin-bottom: 12px;
    font-variant-numeric: tabular-nums;
  }
  .controlbar {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  .search {
    flex: 1;
    min-width: 200px;
    display: flex;
    gap: 8px;
    align-items: center;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 9px 12px;
    color: var(--muted);
    min-height: 44px;
  }
  .search input {
    border: 0;
    background: none;
    outline: none;
    width: 100%;
    color: var(--ink);
    font-size: 0.85rem;
  }
  .search kbd {
    font-family: inherit;
    font-size: 0.7rem;
    color: var(--muted);
    background: var(--tint);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 1px 6px;
  }
  .stats {
    display: flex;
    gap: 8px;
  }
  .statpill {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-pill);
    padding: 9px 14px;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--ink-soft);
    white-space: nowrap;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    font-variant-numeric: tabular-nums;
  }
  .sheet {
    background: var(--surface);
    border: 1px solid var(--line);
    border-bottom: 0;
    border-radius: 24px 24px 0 0;
    padding: 20px 18px 40px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .week {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    padding: 14px 14px 16px;
  }
  .month {
    color: var(--muted);
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    margin-bottom: 10px;
  }
  .days {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 8px;
  }
  .day {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 10px 4px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    min-height: 64px;
    font-variant-numeric: tabular-nums;
  }
  .day small {
    color: var(--muted);
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: capitalize;
  }
  .day strong {
    font-size: 1.2rem;
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
    border-color: var(--ink-soft);
  }
  .list-title {
    font-size: 0.84rem;
    font-weight: 500;
    color: var(--ink-soft);
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
    box-shadow: 0 0 0 4px var(--accent-soft);
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
    background: var(--tint);
    border-radius: var(--radius-pill);
    padding: 4px 11px;
    font-weight: 600;
  }
  .factpill :global(svg) {
    width: 15px;
    height: 15px;
  }
  li.done {
    opacity: 0.65;
  }
  .st {
    grid-column: 2;
    justify-self: start;
    font-size: 0.68rem;
    font-weight: 600;
    border-radius: var(--radius-pill);
    padding: 5px 12px;
    white-space: nowrap;
    background: var(--tint);
    color: var(--ink-soft);
  }
  .st.now {
    background: var(--ink);
    color: var(--bg);
  }
  .open {
    grid-column: 2;
    justify-self: start;
    border-radius: var(--radius-chip);
    padding: 9px 18px;
    border: 1px solid var(--line);
    background: var(--surface);
    font-weight: 700;
    font-size: 0.85rem;
    min-height: 44px;
  }
  li.now .open {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-ink);
  }
  @media (min-width: 720px) {
    .title {
      font-size: 2.4rem;
    }
    .sheet {
      padding: 24px 26px 60px;
    }
    .timeline li {
      grid-template-columns: 24px minmax(0, 1fr) auto auto;
      align-items: center;
    }
    .rail {
      grid-row: auto;
    }
    .st,
    .open {
      grid-column: auto;
    }
  }
</style>
