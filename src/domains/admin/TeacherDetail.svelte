<script lang="ts">
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { t } from '$lib/i18n';
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ErrorState from '$lib/ui/ErrorState.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import AdminShell from './AdminShell.svelte';
  import { paletteFor } from '$lib/ui/palette';
  import { teacherDetail, subjects, assignSubject, updateTeacher, type TeacherDetail } from './api';
  import { isMissing } from '../teacher/api';
  import { ApiError } from '$lib/api/types';
  import { guarded } from '$lib/nav';

  export let params: { id?: string } = {};
  $: id = decodeURIComponent(params.id ?? '');

  let state: 'loading' | 'error' | 'ready' = 'loading';
  let detail: TeacherDetail | null = null;
  let loadError: unknown = null;
  const currentYear = new Date().getFullYear();
  let assignOpen = false;
  let feedback = '';

  async function load() {
    state = 'loading';
    loadError = null;
    try {
      const data = await guarded(() => teacherDetail(id));
      if (data === null) {
        state = 'error';
        return;
      }
      // Subjects/Groups come from pending endpoints (/v1/subjects,
      // /v1/assignments): the backend profile has neither yet. Default
      // to honest empties instead of crashing on undefined.length.
      detail = { ...data, Subjects: data.Subjects ?? [], Groups: data.Groups ?? [] };
      state = 'ready';
    } catch (err) {
      loadError = err;
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
      feedback = err instanceof ApiError ? err.message : $t.admin.assignFailed;
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

  // Edición del perfil: el backend aplica solo los campos enviados, así que
  // aquí se manda exactamente lo que el docente cambió.
  let editing = false;
  let saving = false;
  let editError = '';
  let editFeedback = '';
  let form = { Names: '', Surnames: '', DocumentID: '', Phone: '', Email: '' };

  function startEdit() {
    if (!detail) return;
    form = {
      Names: detail.Names,
      Surnames: detail.Surnames,
      DocumentID: detail.DocumentID,
      Phone: detail.Phone ?? '',
      Email: detail.Email ?? ''
    };
    editError = '';
    editFeedback = '';
    editing = true;
  }

  async function saveEdit() {
    if (!detail) return;
    editFeedback = '';
    editError = '';
    if (!form.Names.trim() || !form.Surnames.trim() || !form.DocumentID.trim()) {
      editError = $t.admin.formRequired;
      return;
    }
    if (form.Email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.Email.trim())) {
      editError = $t.admin.formEmailInvalid;
      return;
    }
    saving = true;
    try {
      detail = { ...detail, ...form };
      await updateTeacher(id, form);
      editing = false;
      editFeedback = $t.teacherDetail.saved;
    } catch (err) {
      editError = err instanceof ApiError ? err.message : $t.common.loadError;
    } finally {
      saving = false;
    }
  }

  // Retirar es reversible y conserva el historial: por eso "desactivar" y
  // no "eliminar" (el backend no borra docentes).
  async function toggleActive() {
    if (!detail) return;
    const next = !detail.Active;
    editFeedback = '';
    try {
      const updated = await updateTeacher(id, { Active: next });
      detail = { ...detail, Active: updated.Active };
      editFeedback = next ? $t.teacherDetail.reactivated : $t.teacherDetail.retired;
    } catch (err) {
      editFeedback = err instanceof ApiError ? err.message : $t.common.loadError;
    }
  }
</script>

<AdminShell active="docentes" year={currentYear}>
  <TopBar title={$t.admin.teacherDetailTitle} showBack onBack={() => push('/admin/docentes')}>
    <TopActions />
  </TopBar>

  <div class="pagehead">
    <p class="eyebrow">{$t.admin.consoleEyebrow}</p>
    {#if detail}
      <div class="toolbar">
        {#if editFeedback}<p class="flash" role="status">{editFeedback}</p>{/if}
        <button type="button" class="mini" on:click={startEdit}>{$t.teacherDetail.editAction}</button>
        <button type="button" class="mini" on:click={toggleActive}>
          {detail.Active ? $t.teacherDetail.retireAction : $t.teacherDetail.reactivateAction}
        </button>
      </div>
    {/if}
  </div>

  <div class="sheet">
  {#if state === 'loading'}
    <Skeleton rows={4} />
  {:else if state === 'error' || !detail}
    <ErrorState error={loadError} onRetry={load} />
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
</AdminShell>

<Sheet open={assignOpen} title={$t.admin.assignSubjectTitle} onClose={() => (assignOpen = false)}>
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

<Sheet open={editing} title={$t.teacherDetail.editTitle} onClose={() => (editing = false)}>
  <form class="form" on:submit|preventDefault={saveEdit}>
    <div class="row2">
      <label>{$t.admin.formSurnames}<input bind:value={form.Surnames} autocomplete="off" /></label>
      <label>{$t.admin.formNames}<input bind:value={form.Names} autocomplete="off" /></label>
    </div>
    <div class="row2">
      <label>{$t.admin.formDocument}<input bind:value={form.DocumentID} inputmode="numeric" autocomplete="off" /></label>
      <label>{$t.admin.formPhone}<input bind:value={form.Phone} inputmode="tel" autocomplete="off" /></label>
    </div>
    <label>{$t.admin.formEmail}<input bind:value={form.Email} inputmode="email" autocomplete="off" /></label>
    {#if editError}<p class="flash error" role="alert">{editError}</p>{/if}
    <div class="actions">
      <button class="ghost" type="button" on:click={() => (editing = false)}>{$t.common.cancel}</button>
      <button class="primary" type="submit" disabled={saving}>{saving ? '…' : $t.common.save}</button>
    </div>
  </form>
</Sheet>

<style>
  .pagehead {
    margin-bottom: 12px;
  }
  .eyebrow {
    color: var(--muted);
    font-size: 0.85rem;
    margin-bottom: 2px;
  }
  .sheet {
    background: var(--surface);
    border: 1px solid var(--line);
    border-bottom: 0;
    border-radius: 24px 24px 0 0;
    padding: 16px 16px 130px;
  }
  @media (min-width: 700px) {
    .sheet {
      padding: 20px 20px 130px;
    }
  }
  .card {
    background: var(--card);
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
  .toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 8px;
    flex-wrap: wrap;
  }
  .mini {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 40px;
    padding: 0 16px;
    border-radius: var(--radius-pill);
    border: 1px solid var(--line);
    background: var(--surface);
    font-weight: 600;
    font-size: 0.85rem;
  }
  .flash {
    background: var(--chip-green-bg);
    color: var(--chip-green-ink);
    font-weight: 600;
    font-size: 0.85rem;
    border-radius: var(--radius-chip);
    padding: 8px 12px;
  }
  .flash.error {
    background: var(--chip-pink-bg);
    color: var(--chip-pink-ink);
  }
  .form {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .row2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .form label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.82rem;
    font-weight: 600;
  }
  .form input {
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 10px 12px;
    font-size: 0.92rem;
    width: 100%;
  }
  .form input:focus {
    outline: 2px solid var(--accent);
    outline-offset: 0;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 6px;
  }
  .ghost,
  .primary {
    min-height: 46px;
    border-radius: var(--radius-pill);
    font-weight: 700;
    font-size: 0.88rem;
    padding: 10px 22px;
  }
  .ghost {
    background: var(--surface);
    border: 1px solid var(--line);
  }
  .primary {
    background: var(--accent);
    color: var(--accent-ink);
  }
  .primary:disabled {
    opacity: 0.6;
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
