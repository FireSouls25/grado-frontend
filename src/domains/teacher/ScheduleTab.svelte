<script lang="ts">
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { t } from '$lib/i18n';
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import TeacherShell from './TeacherShell.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ErrorState from '$lib/ui/ErrorState.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import { daySchedule, isMissing, type TeacherClass } from './api';
  import { guarded } from '$lib/nav';
  import { ApiError } from '$lib/api/types';

  interface DayBlock {
    weekday: number;
    label: string;
    classes: TeacherClass[];
  }

  const monday = (() => {
    const d = new Date();
    const back = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - back);
    d.setHours(0, 0, 0, 0);
    return d;
  })();
  const weekdays = [1, 2, 3, 4, 5];

  let state: 'loading' | 'error' | 'empty' | 'ready' = 'loading';
  let loadError: unknown = null;
  let days: DayBlock[] = [];

  function dayLabel(weekday: number): string {
    const d = new Date(monday);
    d.setDate(d.getDate() + (weekday - 1));
    const name = d.toLocaleDateString('es-CO', { weekday: 'long' });
    const num = d.getDate();
    return `${name} ${num}`;
  }

  async function load() {
    state = 'loading';
    loadError = null;
    try {
      const settled = await Promise.all(
        weekdays.map(async (weekday) => {
          try {
            const classes = await guarded(() => daySchedule(weekday));
            if (classes === null) return { weekday, classes: [] as TeacherClass[], auth: true };
            return {
              weekday,
              classes: [...classes].sort((a, b) => a.Start.localeCompare(b.Start)),
              auth: false
            };
          } catch (err) {
            if (err instanceof ApiError && isMissing(err)) {
              // Día sin ruta en el backend: vacío honesto para ese día.
              return { weekday, classes: [] as TeacherClass[], auth: false };
            }
            throw err;
          }
        })
      );
      if (settled.some((d) => d.auth)) return; // 401/403 already navigated away
      days = settled.map((d) => ({ weekday: d.weekday, label: dayLabel(d.weekday), classes: d.classes }));
      state = days.some((d) => d.classes.length > 0) ? 'ready' : 'empty';
    } catch (err) {
      loadError = err;
      state = 'error';
    }
  }

  onMount(load);

  function openClass(entry: TeacherClass) {
    push(`/clase/${encodeURIComponent(entry.GroupID)}?materia=${encodeURIComponent(entry.SubjectID)}`);
  }
</script>

<TeacherShell active="horario">
  <div class="page">
  <TopBar title={$t.schedule.title}><TopActions /></TopBar>

  <div class="pagehead">
    <p class="eyebrow">{$t.schedule.eyebrow}</p>
    <h1 class="title">{$t.schedule.title}</h1>
  </div>

  <div class="sheet">
    {#if state === 'loading'}
      <Skeleton rows={5} />
    {:else if state === 'error'}
      <ErrorState error={loadError} onRetry={load} />
    {:else if state === 'empty'}
      <EmptyState
        icon="calendar"
        title={$t.schedule.emptyTitle}
        body={$t.schedule.emptyBody}
      />
    {:else}
      {#each days as day (day.weekday)}
        {#if day.classes.length > 0}
          <section class="dayblock" aria-label={day.label}>
            <h2 class="daylabel">{day.label}</h2>
            <ol class="timeline">
              {#each day.classes as entry (entry.GroupID + entry.Start)}
                <li>
                  <span class="rail" aria-hidden="true"><span class="pip"></span></span>
                  <div class="tblock">
                    <div>
                      <strong>{entry.Start} - {entry.End}</strong>
                      <span class="subj">{entry.SubjectName}</span>
                    </div>
                    <div class="facts">
                      <span class="factpill"><Icon name="list" /> {entry.ClassLabel}</span>
                    </div>
                  </div>
                  <button type="button" class="open" on:click={() => openClass(entry)}>
                    {$t.schedule.openList}
                  </button>
                </li>
              {/each}
            </ol>
          </section>
        {/if}
      {/each}
    {/if}
  </div>
</div>

</TeacherShell>

<style>
  .page {
    margin: 0 auto;
    max-width: 1400px;
    min-width: 0;
    color: var(--ink);
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
    gap: 16px;
  }
  .dayblock {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    padding: 16px 16px 8px;
  }
  .daylabel {
    font-size: 0.84rem;
    font-weight: 550;
    color: var(--ink-soft);
    text-transform: capitalize;
    margin-bottom: 4px;
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
  @media (min-width: 720px) {
    .title {
      font-size: 2.4rem;
    }
    .sheet {
      padding: 24px 26px 60px;
    }
    .timeline li {
      grid-template-columns: 24px minmax(0, 1fr) auto;
      align-items: center;
    }
    .rail {
      grid-row: auto;
    }
    .open {
      grid-column: auto;
    }
  }
</style>
