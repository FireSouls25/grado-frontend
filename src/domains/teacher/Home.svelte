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

  <div class="hero">
    <h1>{$t.teacher.greeting}</h1>
    <p class="date">{todayLabel}</p>
  </div>

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
        <span class="chip chip-sky">{weekdayName(weekday)}</span>
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

<Tabs
  tabs={[
    { href: '/hoy', icon: 'list', label: $t.nav.today, active: true },
    { href: '/horario', icon: 'calendar', label: $t.nav.schedule, active: false }
  ]}
  onNavigate={(href) => push(href)}
/>

<style>
  .hero {
    padding: 6px 4px 16px;
  }
  .hero .date {
    color: var(--muted);
    text-transform: capitalize;
  }
  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 4px 12px;
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .list > :global(*) {
    animation-delay: calc(var(--i, 0) * 0.05s);
  }
</style>
