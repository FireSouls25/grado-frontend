<script lang="ts">
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { t } from '$lib/i18n';
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import AdminTabs from './AdminTabs.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { teachers, createTeacher, grantRole, type TeacherSummary } from './api';
  import { isMissing } from '../teacher/api';
  import { ApiError } from '$lib/api/types';
  import { guarded } from '$lib/nav';
  import Sheet from '$lib/ui/Sheet.svelte';

  let state: 'loading' | 'error' | 'ready' = 'loading';
  let list: TeacherSummary[] = [];

  let creating = false;
  let saving = false;
  let feedback = '';
  let form = freshForm();

  function freshForm() {
    return {
      Names: '',
      Surnames: '',
      DocumentID: '',
      Phone: '',
      Email: '',
      AccessID: ''
    };
  }

  async function load() {
    state = 'loading';
    try {
      const data = await guarded(() => teachers());
      if (data === null) return;
      list = [...data].sort((a, b) =>
        `${a.Surnames} ${a.Names}`.toLowerCase() < `${b.Surnames} ${b.Names}`.toLowerCase() ? -1 : 1
      );
      state = 'ready';
    } catch (err) {
      state = err instanceof ApiError && isMissing(err) ? 'ready' : 'error';
    }
  }

  onMount(load);

  async function save() {
    feedback = '';
    saving = true;
    try {
      await createTeacher({
        Names: form.Names.trim(),
        Surnames: form.Surnames.trim(),
        DocumentID: form.DocumentID.trim(),
        Phone: form.Phone.trim(),
        Email: form.Email.trim()
      });
      let extra = '';
      if (form.AccessID.trim()) {
        await grantRole(form.AccessID.trim(), 'teacher');
        extra = ' ' + $t.admin.roleGranted;
      }
      feedback = $t.admin.createdTeacher + extra;
      form = freshForm();
      await load();
    } catch (err) {
      feedback = err instanceof ApiError ? err.message : $t.common.loadError;
    } finally {
      saving = false;
    }
  }
</script>

<div class="page">
  <TopBar title={$t.admin.teachersTitle} showBack onBack={() => push('/admin')}><TopActions /></TopBar>

  <div class="toolbar">
    <button type="button" class="new" on:click={() => { creating = true; feedback = ''; }}>
      {$t.admin.newTeacher}
    </button>
  </div>

  {#if state === 'loading'}
    <Skeleton rows={4} />
  {:else if state === 'error'}
    <EmptyState
      icon="warn"
      title={$t.common.loadError}
      actionLabel={$t.common.retry}
      onAction={load}
    />
  {:else if list.length === 0}
    <EmptyState
      icon="users"
      title={$t.admin.noTeachersTitle}
      body={$t.admin.noTeachersBody}
    />
  {:else}
    <ul class="roster">
      {#each list as teacher (teacher.ID)}
        <li>
          <button
            type="button"
            class="row"
            on:click={() => push(`/admin/docentes/${encodeURIComponent(teacher.ID)}`)}
          >
            <span class="who">
              <span class="name">{teacher.Surnames} {teacher.Names}</span>
              <span class="sub">
                {teacher.DocumentID}
                {#if teacher.HomeroomClassID}· {$t.admin.directs(teacher.HomeroomClassID)}{/if}
                {#if !teacher.Active}· {$t.admin.inactive}{/if}
              </span>
            </span>
            <span class="go" aria-hidden="true"><Icon name="next" /></span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<AdminTabs active="docentes" />

<Sheet open={creating} title={$t.admin.newTeacher} on:close={() => (creating = false)}>
  <form class="form" on:submit|preventDefault={save}>
    <div class="row2">
      <label>{$t.admin.formNames}<input bind:value={form.Names} autocomplete="off" /></label>
      <label>{$t.admin.formSurnames}<input bind:value={form.Surnames} autocomplete="off" /></label>
    </div>
    <div class="row2">
      <label>{$t.admin.formDocument}<input bind:value={form.DocumentID} placeholder={$t.admin.formDocumentPlaceholder} autocomplete="off" /></label>
      <label>{$t.admin.formPhone}<input bind:value={form.Phone} inputmode="tel" autocomplete="off" /></label>
    </div>
    <label>{$t.admin.formEmail}<input bind:value={form.Email} inputmode="email" autocomplete="off" /></label>
    <label>{$t.admin.formAccessID}<input bind:value={form.AccessID} placeholder="bbbbbbbb-…" autocomplete="off" /></label>
    <p class="hint">{$t.admin.formAccessHint}</p>
    {#if feedback}<p class="flash" role="status">{feedback}</p>{/if}
    <button class="primary" type="submit" disabled={saving}>
      {saving ? '…' : $t.admin.formCreate}
    </button>
  </form>
</Sheet>

<style>
  .toolbar {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 12px;
  }
  .new {
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 700;
    min-height: 48px;
    padding: 10px 22px;
    border-radius: var(--radius-pill);
  }
  .new:active {
    transform: scale(0.97);
  }
  .form {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .form label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-weight: 600;
    font-size: 0.9rem;
  }
  .row2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .form input {
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 12px 14px;
    min-height: 52px;
    width: 100%;
  }
  .form input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .hint {
    color: var(--muted);
    font-size: 0.85rem;
  }
  .flash {
    background: var(--chip-green-bg);
    color: var(--chip-green-ink);
    font-weight: 600;
    font-size: 0.9rem;
    border-radius: var(--radius-chip);
    padding: 10px 14px;
  }
  .primary {
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 700;
    min-height: 54px;
    border-radius: var(--radius-pill);
    margin-top: 4px;
  }
  .primary:disabled {
    opacity: 0.7;
  }
  .roster {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    text-align: left;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    padding: 14px 16px;
    min-height: 68px;
    transition: transform 0.1s ease;
    animation: rise 0.25s ease both;
  }
  .row:active {
    transform: scale(0.98);
  }
  .who {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .name {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sub {
    color: var(--muted);
    font-size: 0.85rem;
  }
  .go {
    flex: none;
    width: 40px;
    height: 40px;
    border-radius: var(--radius-pill);
    background: var(--surface-2);
    color: var(--muted);
    display: flex;
    align-items: center;
    justify-content: center;
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
