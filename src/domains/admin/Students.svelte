<script lang="ts">
  import { push } from 'svelte-spa-router';
  import { t } from '$lib/i18n';
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import AdminTabs from './AdminTabs.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { groupsByYear, type YearGroup } from './api';
  import { isMissing } from '../teacher/api';
  import { ApiError } from '$lib/api/types';
  import { guarded } from '$lib/nav';

  const currentYear = new Date().getFullYear();
  let year = currentYear;
  let groups: YearGroup[] = [];
  let loaded = false;
  let failed = false;
  let picked: YearGroup | null = null;

  async function load() {
    failed = false;
    try {
      const data = await guarded(() => groupsByYear(year));
      if (data === null) return;
      groups = [...data].sort((a, b) => a.grade - b.grade || a.groupNo - b.groupNo);
      picked = null;
      loaded = true;
    } catch (err) {
      if (err instanceof ApiError && isMissing(err)) {
        groups = [];
        loaded = true;
      } else {
        failed = true;
      }
    }
  }

  function changeYear(delta: number) {
    year += delta;
    loaded = false;
    load();
  }

  import { onMount } from 'svelte';
  onMount(load);
</script>

<div class="page">
  <TopBar title={$t.admin.studentsTitle} showBack onBack={() => push('/admin')}><TopActions /></TopBar>

  <div class="yearbar">
    <button type="button" class="icon-btn" on:click={() => changeYear(-1)} aria-label={$t.a11y.prevYear}>
      <Icon name="back" />
    </button>
    <strong>{year}</strong>
    <button type="button" class="icon-btn" on:click={() => changeYear(1)} aria-label={$t.a11y.nextYear}>
      <Icon name="next" />
    </button>
  </div>

  {#if failed}
    <EmptyState
      icon="warn"
      title={$t.common.loadError}
      actionLabel={$t.common.retry}
      onAction={load}
    />
  {:else if !loaded}
    <EmptyState icon="list" title={$t.admin.loadingGroups} />
  {:else if groups.length === 0}
    <EmptyState
      icon="users"
      title={$t.admin.noGroupsYear(year)}
      body={$t.admin.noGroupsYearBody}
    />
  {:else}
    <div class="chips">
      {#each groups as g (g.groupID)}
        <button
          type="button"
          class="salon"
          class:selected={picked?.groupID === g.groupID}
          aria-pressed={picked?.groupID === g.groupID}
          on:click={() => (picked = picked?.groupID === g.groupID ? null : g)}
        >
          <strong>{g.classLabel}</strong>
          <span>{$t.admin.groupStudents(g.studentCount)}</span>
        </button>
      {/each}
    </div>
    {#if picked}
      <section class="card">
        <h2>
          {$t.admin.groupDetailTitle(picked.classLabel, picked.schoolYear)}
        </h2>
        <p>{$t.admin.rosterHint}</p>
      </section>
    {/if}
  {/if}
</div>

<AdminTabs active="estudiantes" />

<style>
  .yearbar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    margin-bottom: 12px;
  }
  .yearbar strong {
    font-size: 1.2rem;
    min-width: 72px;
    text-align: center;
  }
  .icon-btn {
    width: 44px;
    height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-pill);
    background: var(--surface);
    border: 1px solid var(--line);
    color: var(--muted);
  }
  .icon-btn:active {
    transform: scale(0.92);
  }
  .chips {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }
  @media (min-width: 900px) {
    .chips {
      grid-template-columns: repeat(3, 1fr);
    }
  }
  .salon {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    padding: 16px;
    min-height: 88px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    text-align: left;
    transition:
      border-color 0.15s ease,
      transform 0.1s ease;
    animation: rise 0.25s ease both;
  }
  .salon:active {
    transform: scale(0.97);
  }
  .salon.selected {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }
  .salon strong {
    font-size: 1.3rem;
  }
  .salon span {
    color: var(--muted);
    font-size: 0.85rem;
    font-weight: 600;
  }
  .card {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow);
    padding: 18px;
    margin-top: 12px;
  }
  .card p {
    color: var(--muted);
    font-size: 0.92rem;
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
</style>
