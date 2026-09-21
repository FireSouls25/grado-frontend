<script lang="ts">
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { t } from '$lib/i18n';
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { paletteFor } from '$lib/ui/palette';
  import { teacherDetail, subjects, assignSubject, type TeacherDetail } from './api';
  import { isMissing } from '../teacher/api';
  import { ApiError } from '$lib/api/types';
  import { guarded } from '$lib/nav';

  export let params: { id?: string } = {};
  $: id = decodeURIComponent(params.id ?? '');

  let state: 'loading' | 'error' | 'ready' = 'loading';
  let detail: TeacherDetail | null = null;
  let assignOpen = false;
  let feedback = '';

  async function load() {
    state = 'loading';
    try {
      const data = await guarded(() => teacherDetail(id));
      if (data === null) return;
      detail = data;
      state = 'ready';
    } catch (err) {
      state = err instanceof ApiError && isMissing(err) ? 'ready' : 'error';
    }
  }

  onMount(load);

  async function assign(subjectID: string, subjectName: string) {
    feedback = '';
    try {
      await assignSubject(id, subjectID);
      if (detail) {
        detail = {
          ...detail,
          Subjects: [...detail.Subjects, { SubjectID: subjectID, SubjectName: subjectName, From: '' }]
        };
      }
      assignOpen = false;
    } catch (err) {
      feedback = err instanceof ApiError ? err.message : 'No se pudo asignar.';
    }
  }

  let catalog: { ID: string; Name: string }[] = [];
  async function openAssign() {
    feedback = '';
    try {
      catalog = await subjects();
    } catch {
      catalog = [];
    }
    assignOpen = true;
  }
</script>

<div class="page">
  <TopBar title={$t.admin.teacherDetailTitle} showBack onBack={() => push('/admin/docentes')}>
    <TopActions />
  </TopBar>

  {#if state === 'loading'}
    <Skeleton rows={4} />
  {:else if state === 'error' || !detail}
    <EmptyState
      icon="warn"
      title={$t.common.loadError}
      actionLabel={$t.common.retry}
      onAction={load}
    />
  {:else}
    <section class="card profile" aria-label={$t.admin.teacherDetailTitle}>
      <h2>{detail.Surnames} {detail.Names}</h2>
      <p>{detail.DocumentID}</p>
      {#if detail.Email}<p>{detail.Email}</p>{/if}
      {#if detail.Phone}<p>{detail.Phone}</p>{/if}
      {#if detail.HomeroomClassID}
        <span class="chip chip-sky">{$t.admin.directs(detail.HomeroomClassID)}</span>
      {/if}
      {#if !detail.Active}<span class="chip chip-pink">{$t.admin.inactive}</span>{/if}
    </section>

    <section class="card" aria-label={$t.admin.subjectsTitle}>
      <div class="row-head">
        <h2>{$t.admin.subjectsTitle}</h2>
        <button type="button" class="mini" on:click={openAssign}>{$t.admin.assignSubject}</button>
      </div>
      {#if detail.Subjects.length === 0}
        <p class="muted">{$t.admin.noSubjects}</p>
      {:else}
        <div class="chips">
          {#each detail.Subjects as s (s.SubjectID)}
            <span class={`chip chip-${paletteFor(s.SubjectID)}`}>{s.SubjectName}</span>
          {/each}
        </div>
      {/if}
    </section>

    <section class="card" aria-label={$t.admin.groupsTitle}>
      <h2>{$t.admin.groupsTitle}</h2>
      {#if detail.Groups.length === 0}
        <p class="muted">{$t.admin.noGroups}</p>
      {:else}
        <ul class="groups">
          {#each detail.Groups as g (g.GroupID + g.SubjectName)}
            <li>
              <strong>{g.ClassLabel}</strong>
              <span>{g.SubjectName}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}
</div>

<Sheet open={assignOpen} title={$t.admin.assignSubjectTitle} on:close={() => (assignOpen = false)}>
  {#if feedback}<p class="flash" role="alert">{feedback}</p>{/if}
  {#if catalog.length === 0}
    <p class="muted">{$t.admin.noCatalog}</p>
  {:else}
    <ul class="catalog">
      {#each catalog as s (s.ID)}
        <li>
          <button type="button" on:click={() => assign(s.ID, s.Name)}>
            <Icon name="book" /><span>{s.Name}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</Sheet>

<style>
  .card {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow);
    padding: 18px;
    margin-bottom: 12px;
    animation: rise 0.3s ease both;
  }
  .profile p {
    color: var(--muted);
    font-size: 0.92rem;
  }
  .profile h2 {
    margin-bottom: 2px;
  }
  .profile .chip {
    margin-top: 8px;
    margin-right: 6px;
  }
  .row-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  .mini {
    color: var(--accent);
    font-weight: 700;
    min-height: 44px;
    padding: 8px 12px;
  }
  .muted {
    color: var(--muted);
    font-size: 0.92rem;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .groups {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .groups li {
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 10px 14px;
  }
  .groups span {
    color: var(--muted);
    font-size: 0.9rem;
  }
  .catalog {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .catalog button {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 56px;
    padding: 12px 14px;
    border-radius: var(--radius-chip);
    background: var(--surface-2);
    border: 1px solid var(--line);
    font-weight: 600;
    text-align: left;
  }
  .catalog button:active {
    transform: scale(0.98);
  }
  .flash {
    background: var(--chip-pink-bg);
    color: var(--chip-pink-ink);
    font-weight: 600;
    font-size: 0.9rem;
    border-radius: var(--radius-chip);
    padding: 10px 14px;
    margin-bottom: 8px;
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
</style>
