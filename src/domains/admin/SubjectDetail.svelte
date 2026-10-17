<script lang="ts">
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { t } from '$lib/i18n';
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import AdminShell from './AdminShell.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ErrorState from '$lib/ui/ErrorState.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Toast from '$lib/ui/Toast.svelte';
  import Dropdown from '$lib/ui/Dropdown.svelte';
  import {
    subjectDetail,
    updateSubject,
    deleteSubject,
    subjectAssignments,
    assignSubject,
    endAssignment,
    removeAssignment,
    teachers,
    type Subject,
    type SubjectAssignment,
    type TeacherSummary
  } from './api';
  import { guarded } from '$lib/nav';
  import { isMissing } from '../teacher/api';
  import { ApiError } from '$lib/api/types';

  export let params: { id?: string } = {};
  $: subjectID = decodeURIComponent(params.id ?? '');

  const currentYear = new Date().getFullYear();
  const SWATCHES = ['#3B82F6', '#EF4444', '#22C55E', '#F59E0B', '#8B5CF6', '#EC4899', '#14B8C8', '#84CC16'];
  const ALL_GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

  let state: 'loading' | 'error' | 'ready' = 'loading';
  let loadError: unknown = null;
  let subject: Subject | null = null;
  let timeline: SubjectAssignment[] = [];
  let teacherList: TeacherSummary[] = [];

  let editing = false;
  let saving = false;
  let editError = '';
  let toast = '';
  let form = { Name: '', Code: '', Description: '', Grades: [] as number[], Color: SWATCHES[0] };

  let assigning = false;
  let assignTeacher = '';
  let assignStart = todayISO();
  let assignError = '';

  let ending: SubjectAssignment | null = null;
  let endDate = todayISO();
  let endError = '';

  let removing: SubjectAssignment | null = null;
  let deleting = false;
  let deleteError = '';
  let toggleError = '';
  let actionBusy = false;

  function todayISO(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function shortDate(value: string): string {
    if (!value || value.startsWith('0001')) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value.slice(0, 10);
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  async function load() {
    state = 'loading';
    loadError = null;
    try {
      const data = await guarded(() => subjectDetail(subjectID));
      if (data === null) return; // 401/403 ya navegaron
      subject = data;
      state = 'ready';
    } catch (err) {
      if (err instanceof ApiError && isMissing(err)) {
        subject = null;
        state = 'ready';
        return;
      }
      loadError = err;
      state = 'error';
      return;
    }
    void loadTimeline();
    void loadTeachers();
  }

  async function loadTimeline() {
    try {
      timeline = (await guarded(() => subjectAssignments(subjectID))) ?? [];
    } catch {
      timeline = [];
    }
  }

  async function loadTeachers() {
    try {
      teacherList = (await guarded(() => teachers())) ?? [];
    } catch {
      teacherList = [];
    }
  }

  onMount(load);

  $: teacherName = (id: string) => {
    const found = teacherList.find((x) => x.ID === id);
    return found ? `${found.Surnames} ${found.Names}`.trim() : id.slice(0, 8);
  };
  $: openAssignments = timeline.filter((a) => !a.EndedAt || a.EndedAt.startsWith('0001'));
  $: closedAssignments = timeline.filter((a) => a.EndedAt && !a.EndedAt.startsWith('0001'));

  function startEdit() {
    if (!subject) return;
    form = {
      Name: subject.Name,
      Code: subject.Code ?? '',
      Description: subject.Description ?? '',
      Grades: [...(subject.Grades ?? [])],
      Color: subject.Color || SWATCHES[0]
    };
    editError = '';
    editing = true;
  }

  function toggleGrade(g: number) {
    form.Grades = form.Grades.includes(g)
      ? form.Grades.filter((x) => x !== g)
      : [...form.Grades, g].sort((a, b) => a - b);
  }

  async function saveEdit() {
    if (!subject) return;
    editError = '';
    if (!form.Name.trim() || form.Grades.length === 0) {
      editError = $t.subject.required;
      return;
    }
    if (form.Color.trim() && !/^#[0-9a-fA-F]{6}$/.test(form.Color.trim())) {
      editError = $t.subject.required;
      return;
    }
    saving = true;
    try {
      subject = await updateSubject(subjectID, {
        Name: form.Name.trim(),
        Code: form.Code.trim(),
        Description: form.Description.trim(),
        Grades: [...form.Grades],
        Color: form.Color.trim(),
        Active: subject.Active
      });
      editing = false;
      toast = $t.subject.saved;
    } catch (err) {
      editError = err instanceof ApiError ? err.message : $t.common.loadError;
    } finally {
      saving = false;
    }
  }

  async function toggleActive() {
    if (!subject || actionBusy) return;
    actionBusy = true;
    toggleError = '';
    try {
      subject = await updateSubject(subjectID, {
        Name: subject.Name,
        Code: subject.Code ?? '',
        Description: subject.Description ?? '',
        Grades: [...(subject.Grades ?? [])],
        Color: subject.Color ?? '',
        Active: !subject.Active
      });
      toast = $t.subject.saved;
    } catch (err) {
      toggleError = err instanceof ApiError ? err.message : $t.common.loadError;
    } finally {
      actionBusy = false;
    }
  }

  async function confirmDelete() {
    if (!subject || actionBusy) return;
    actionBusy = true;
    deleteError = '';
    try {
      await deleteSubject(subjectID);
      push('/admin/materias');
    } catch (err) {
      deleteError = err instanceof ApiError ? err.message : $t.common.loadError;
    } finally {
      actionBusy = false;
    }
  }

  function openAssign() {
    assignTeacher = '';
    assignStart = todayISO();
    assignError = '';
    assigning = true;
  }

  async function saveAssign() {
    assignError = '';
    if (!subject || !assignTeacher || !assignStart) {
      assignError = $t.subject.required;
      return;
    }
    try {
      await assignSubject(subject.ID, assignTeacher, assignStart);
      assigning = false;
      void loadTimeline();
    } catch (err) {
      assignError = err instanceof ApiError ? err.message : $t.common.loadError;
    }
  }

  async function saveEnd() {
    if (!ending) return;
    endError = '';
    if (!endDate) {
      endError = $t.subject.required;
      return;
    }
    try {
      await endAssignment(ending.ID, endDate);
      ending = null;
      void loadTimeline();
    } catch (err) {
      endError = err instanceof ApiError ? err.message : $t.common.loadError;
    }
  }

  async function confirmRemove() {
    if (!removing) return;
    try {
      await removeAssignment(removing.ID);
      removing = null;
      void loadTimeline();
    } catch (err) {
      // El error vive en la hoja de confirmación: no hay otro lugar.
      endError = err instanceof ApiError ? err.message : $t.common.loadError;
    }
  }
</script>

<AdminShell active="materias" year={currentYear}>
  <TopBar title={$t.subject.title} showBack onBack={() => push('/admin/materias')}>
    <TopActions />
  </TopBar>

  <div class="pagehead">
    <p class="eyebrow">{$t.admin.consoleEyebrow}</p>
    <h1 class="title">{subject?.Name ?? $t.subject.title}</h1>
    {#if subject}
      <div class="toolbar">
        {#if toggleError}<p class="flash error" role="alert">{toggleError}</p>{/if}
        <button type="button" class="mini" on:click={startEdit}>{$t.subject.editAction}</button>
        <button type="button" class="mini" on:click={toggleActive} disabled={actionBusy}>
          {subject.Active ? $t.subject.retireAction : $t.subject.reactivateAction}
        </button>
        <button type="button" class="mini danger" on:click={() => { deleteError = ''; deleting = true; }}>
          {$t.subject.deleteAction}
        </button>
      </div>
    {/if}
  </div>

  <div class="sheet">
    {#if state === 'loading'}
      <Skeleton rows={6} />
    {:else if state === 'error'}
      <ErrorState error={loadError} onRetry={load} />
    {:else if !subject}
      <EmptyState icon="cap" title={$t.subject.emptyTitle} body={$t.subject.emptyBody} />
    {:else}
      <section class="card profile" aria-label={subject.Name}>
        <div class="idblock">
          <span class="dot" style={`background:${subject.Color || 'var(--muted)'}`} aria-hidden="true"></span>
          <div>
            <strong>{subject.Name}</strong>
            {#if subject.Code}<small>{subject.Code}</small>{/if}
          </div>
          {#if !subject.Active}<span class="retired">{$t.subject.retiredNote}</span>{/if}
        </div>
        {#if subject.Description}<p class="desc">{subject.Description}</p>{/if}
        <h2 class="sub">{$t.subject.gradesTitle}</h2>
        {#if (subject.Grades ?? []).length === 0}
          <p class="muted">{$t.common.noData}</p>
        {:else}
          <ul class="gradeboxes" aria-label={$t.subject.gradesTitle}>
            {#each subject.Grades ?? [] as g}
              <li>{g}</li>
            {/each}
          </ul>
        {/if}
      </section>

      <section class="card" aria-label={$t.subject.assignedTitle}>
        <div class="row-head">
          <h2>{$t.subject.assignedTitle}</h2>
          <button type="button" class="mini" on:click={openAssign}>{$t.subject.assignAction}</button>
        </div>
        {#if timeline.length === 0}
          <EmptyState icon="users" title={$t.subject.assignedEmptyTitle} body={$t.subject.assignedEmptyBody} />
        {:else}
          <ul class="tlist">
            {#each openAssignments as a (a.ID)}
              <li>
                <span class="pill write">{$t.subject.openLabel}</span>
                <div class="ttext">
                  <strong>{teacherName(a.TeacherID)}</strong>
                  <small>{$t.subject.sinceLabel(shortDate(a.StartedAt))}</small>
                </div>
                <button type="button" class="link" on:click={() => { endDate = todayISO(); endError = ''; ending = a; }}>
                  {$t.subject.endAction}
                </button>
              </li>
            {/each}
            {#each closedAssignments as a (a.ID)}
              <li class="closed">
                <span class="pill read">{$t.subject.endedLabel(shortDate(a.EndedAt))}</span>
                <div class="ttext">
                  <strong>{teacherName(a.TeacherID)}</strong>
                  <small>{$t.subject.sinceLabel(shortDate(a.StartedAt))}</small>
                </div>
                <button type="button" class="link danger" on:click={() => { endError = ''; removing = a; }}>
                  {$t.subject.removeAction}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {/if}
  </div>
<Toast message={toast} onClose={() => (toast = '')} />
</AdminShell>

<Sheet open={editing} title={$t.subject.editTitle} onClose={() => (editing = false)}>
  <form class="form" on:submit|preventDefault={saveEdit}>
    <label>{$t.subject.nameLabel}<input bind:value={form.Name} autocomplete="off" /></label>
    <div class="row2">
      <label>{$t.subject.codeLabel}<input bind:value={form.Code} autocomplete="off" /></label>
      <label>{$t.subject.colorCustomLabel}<input bind:value={form.Color} autocomplete="off" /></label>
    </div>
    <label>{$t.subject.descriptionLabel}<textarea bind:value={form.Description} rows="2"></textarea></label>
    <fieldset class="grades">
      <legend>{$t.subject.gradesLabel}</legend>
      <div class="gradegrid">
        {#each ALL_GRADES as g}
          <button
            type="button"
            class:active={form.Grades.includes(g)}
            aria-pressed={form.Grades.includes(g)}
            on:click={() => toggleGrade(g)}
          >
            {g}
          </button>
        {/each}
      </div>
    </fieldset>
    <div class="swatches">
      {#each SWATCHES as c}
        <button
          type="button"
          class:active={form.Color === c}
          aria-pressed={form.Color === c}
          aria-label={c}
          style={`background:${c}`}
          on:click={() => (form.Color = c)}
        ></button>
      {/each}
    </div>
    {#if editError}<p class="flash error" role="alert">{editError}</p>{/if}
    <div class="actions">
      <button class="ghost" type="button" on:click={() => (editing = false)}>{$t.common.cancel}</button>
      <button class="primary" type="submit" disabled={saving}>{saving ? '…' : $t.common.save}</button>
    </div>
  </form>
</Sheet>

<Sheet open={assigning} title={$t.subject.assignTitle} onClose={() => (assigning = false)}>
  <form class="form" on:submit|preventDefault={saveAssign}>
    <Dropdown
      label={$t.subject.teacherLabel}
      value={assignTeacher}
      searchable
      searchPlaceholder={$t.subject.teacherLabel}
      options={teacherList.map((teacher) => ({
        value: teacher.ID,
        label: `${teacher.Surnames} ${teacher.Names}`.trim()
      }))}
      on:select={(e) => (assignTeacher = e.detail)}
    />
    <label>{$t.subject.startLabel}<input type="date" lang="es-CO" bind:value={assignStart} /></label>
    {#if assignError}<p class="flash error" role="alert">{assignError}</p>{/if}
    <div class="actions">
      <button class="ghost" type="button" on:click={() => (assigning = false)}>{$t.common.cancel}</button>
      <button class="primary" type="submit">{$t.common.save}</button>
    </div>
  </form>
</Sheet>

<Sheet open={ending !== null} title={$t.subject.endTitle} onClose={() => (ending = null)}>
  <form class="form" on:submit|preventDefault={saveEnd}>
    <label>{$t.subject.startLabel}<input type="date" lang="es-CO" bind:value={endDate} /></label>
    {#if endError}<p class="flash error" role="alert">{endError}</p>{/if}
    <div class="actions">
      <button class="ghost" type="button" on:click={() => (ending = null)}>{$t.common.cancel}</button>
      <button class="primary" type="submit">{$t.common.save}</button>
    </div>
  </form>
</Sheet>

<Sheet open={removing !== null} title={$t.subject.removeTitle} onClose={() => (removing = null)}>
  <p class="muted">{$t.subject.removeBody}</p>
  {#if endError}<p class="flash error" role="alert">{endError}</p>{/if}
  <div class="actions">
    <button class="ghost" type="button" on:click={() => (removing = null)}>{$t.common.cancel}</button>
    <button class="primary danger" type="button" on:click={confirmRemove}>{$t.subject.removeAction}</button>
  </div>
</Sheet>

<Sheet open={deleting} title={$t.subject.deleteTitle} onClose={() => (deleting = false)}>
  {#if timeline.length > 0}
    <p class="muted">{$t.subject.deleteBlockedBody}</p>
    <div class="actions">
      <button class="ghost" type="button" on:click={() => (deleting = false)}>{$t.common.cancel}</button>
    </div>
  {:else}
    <p class="muted">{$t.subject.deleteBody(subject?.Name ?? '')}</p>
    {#if deleteError}<p class="flash error" role="alert">{deleteError}</p>{/if}
    <div class="actions">
      <button class="ghost" type="button" on:click={() => (deleting = false)}>{$t.common.cancel}</button>
      <button class="primary danger" type="button" on:click={confirmDelete} disabled={actionBusy}>
        {$t.subject.deleteAction}
      </button>
    </div>
  {/if}
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
  .title {
    font-size: 1.6rem;
    letter-spacing: -0.02em;
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
  .mini.danger {
    color: var(--g-grave-ink);
  }
  .mini:disabled {
    opacity: 0.6;
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
  }
  .idblock {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .dot {
    flex: none;
    width: 28px;
    height: 28px;
    border-radius: 999px;
    border: 1px solid var(--line);
  }
  .idblock strong {
    display: block;
    font-size: 1.2rem;
  }
  .idblock small {
    color: var(--muted);
    font-size: 0.85rem;
    font-weight: 600;
  }
  .retired {
    margin-left: auto;
    flex: none;
    background: var(--chip-pink-bg);
    color: var(--chip-pink-ink);
    border-radius: 999px;
    padding: 4px 12px;
    font-size: 0.75rem;
    font-weight: 700;
  }
  .desc {
    margin-top: 10px;
    font-size: 0.92rem;
  }
  .sub {
    font-size: 0.85rem;
    margin-top: 14px;
  }
  .gradeboxes {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(52px, 1fr));
    gap: 8px;
  }
  .gradeboxes li {
    min-height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    font-weight: 700;
    font-size: 1.05rem;
    font-variant-numeric: tabular-nums;
  }
  .muted {
    color: var(--muted);
    font-size: 0.92rem;
    margin-top: 4px;
  }
  .row-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  .tlist {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .tlist li {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--line);
  }
  .tlist li:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }
  .pill {
    flex: none;
    border-radius: 999px;
    padding: 2px 10px;
    font-size: 0.7rem;
    font-weight: 700;
  }
  .pill.read {
    background: var(--surface-2);
    color: var(--muted);
  }
  .pill.write {
    background: var(--chip-sky-bg);
    color: var(--chip-sky-ink);
  }
  .ttext {
    flex: 1;
    min-width: 0;
  }
  .ttext strong {
    display: block;
    font-size: 0.9rem;
  }
  .ttext small {
    color: var(--muted);
    font-size: 0.75rem;
  }
  .link {
    flex: none;
    color: var(--accent);
    font-weight: 700;
    font-size: 0.82rem;
    min-height: 44px;
    padding: 0 8px;
  }
  .link.danger {
    color: var(--g-grave-ink);
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
    font-size: 0.82rem;
    font-weight: 600;
  }
  .form input,
  .form textarea {
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 10px 12px;
    font-size: 0.92rem;
    width: 100%;
    font: inherit;
    color: var(--ink);
  }
  .row2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  fieldset.grades {
    border: 0;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  fieldset.grades legend {
    font-weight: 600;
    font-size: 0.82rem;
    padding: 0;
  }
  .gradegrid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 8px;
  }
  .gradegrid button {
    min-height: 44px;
    border-radius: var(--radius-chip);
    border: 1px solid var(--line);
    background: var(--surface-2);
    font-weight: 700;
    color: var(--muted);
  }
  .gradegrid button.active {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--bg);
  }
  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .swatches button {
    width: 40px;
    height: 40px;
    border-radius: 999px;
    border: 2px solid transparent;
  }
  .swatches button.active {
    border-color: var(--ink);
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
  .primary.danger {
    background: var(--g-grave-ink);
    color: #fff;
  }
  .primary:disabled {
    opacity: 0.6;
  }
</style>
