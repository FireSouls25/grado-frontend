<script lang="ts">
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { t } from '$lib/i18n';
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import Tabs from '$lib/ui/Tabs.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import ClassCard from './ClassCard.svelte';
  import { daySchedule, isMissing, type TeacherClass } from './api';
  import { guarded } from '$lib/nav';
  import { ApiError } from '$lib/api/types';

  type State =
    | { kind: 'loading' }
    | { kind: 'error' }
    | { kind: 'empty' }
    | { kind: 'day'; title: string; weekend: boolean; classes: TeacherClass[] };

  let state: State = { kind: 'loading' };

  const weekday = new Date().getDay();
  const isWeekend = weekday === 0 || weekday === 6;

  function weekdayName(d: number): string {
    return new Date(2026, 0, 4 + d).toLocaleDateString('es-CO', { weekday: 'long' });
  }

  async function load() {
    state = { kind: 'loading' };
    try {
      const classes = await guarded(() => daySchedule(weekday));
      if (classes === null) return; // 401/403 already navigated away
      if (classes.length === 0) {
        state = { kind: 'empty' };
        return;
      }
      state = {
        kind: 'day',
        title: isWeekend ? $t.teacher.nextTitle : $t.teacher.todayTitle,
        weekend: isWeekend,
        classes: [...classes].sort((a, b) => a.Start.localeCompare(b.Start))
      };
    } catch (err) {
      // Missing route = backend phase pending: honest empty, not an error loop.
      state = { kind: err instanceof ApiError && isMissing(err) ? 'empty' : 'error' };
    }
  }

  onMount(load);

  function openClass(entry: TeacherClass) {
    push(`/clase/${encodeURIComponent(entry.GroupID)}?materia=${encodeURIComponent(entry.SubjectID)}`);
  }

  $: todayLabel = new Date().toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });
</script>

<div class="page">
  <TopBar title={$t.app.name}><TopActions /></TopBar>

  <div class="pagehead">
    <p class="eyebrow">{$t.teacher.eyebrow}</p>
    <h1 class="title">{$t.teacher.greeting}</h1>
    <p class="date">{todayLabel}</p>
  </div>

  <div class="sheet">
    {#if state.kind === 'loading'}
      <Skeleton rows={3} />
    {:else if state.kind === 'error'}
      <EmptyState
        icon="warn"
        title={$t.common.loadError}
        actionLabel={$t.common.retry}
        onAction={load}
      />
    {:else if state.kind === 'empty'}
      {#if isWeekend}
        <EmptyState icon="calendar" title={$t.teacher.weekendTitle} body={$t.teacher.weekendBody} />
      {/if}
      <EmptyState icon="book" title={$t.teacher.emptyTitle} body={$t.teacher.emptyBody} />
    {:else}
      <div class="section-head">
        <h2>{state.title}</h2>
        {#if state.weekend}
          <span class="salonpill">{weekdayName(weekday)}</span>
        {/if}
      </div>
      <div class="list">
        {#each state.classes as entry (entry.GroupID + entry.Start)}
          <ClassCard
            {entry}
            students=""
            studentsLabel={$t.teacher.openList}
            onOpen={() => openClass(entry)}
          />
        {/each}
      </div>
    {/if}
  </div>
</div>

<Tabs
  tabs={[
    { href: '/hoy', icon: 'list', label: $t.nav.today, active: true },
    { href: '/horario', icon: 'calendar', label: $t.nav.schedule, active: false }
  ]}
  onNavigate={(href) => push(href)}
/>

<style>
  .page {
    min-height: 100vh;
    min-height: 100svh;
    background: var(--bg);
    color: var(--ink);
    padding-bottom: 110px;
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
  }
  .date {
    color: var(--muted);
    font-size: 0.9rem;
    text-transform: capitalize;
    margin-top: 2px;
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
  .sheet :global(.card) {
    box-shadow: none;
  }
  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .section-head h2 {
    font-size: 0.95rem;
    font-weight: 550;
  }
  .salonpill {
    background: var(--tint);
    border-radius: var(--radius-pill);
    padding: 5px 12px;
    font-size: 0.74rem;
    font-weight: 600;
    color: var(--ink-soft);
    white-space: nowrap;
    text-transform: capitalize;
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  @media (min-width: 720px) {
    .title {
      font-size: 2.4rem;
    }
    .sheet {
      padding: 24px 26px 60px;
    }
  }
</style>
