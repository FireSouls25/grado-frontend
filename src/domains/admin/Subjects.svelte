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
  import Dropdown from '$lib/ui/Dropdown.svelte';
  import { listSubjects, createSubject, type Subject } from './api';
  import { guarded } from '$lib/nav';
  import { ApiError } from '$lib/api/types';

  const currentYear = new Date().getFullYear();

  const SWATCHES = ['#3B82F6', '#EF4444', '#22C55E', '#F59E0B', '#8B5CF6', '#EC4899', '#14B8C8', '#84CC16'];
  const ALL_GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

  let state: 'loading' | 'error' | 'ready' = 'loading';
  let loadError: unknown = null;
  let list: Subject[] = [];
  let q = '';
  let fGrade = '';

  let creating = false;
  let saving = false;
  let formError = '';
  let form = freshForm();

  function freshForm() {
    return { Name: '', Code: '', Description: '', Grades: [] as number[], Color: SWATCHES[0] };
  }

  async function load() {
    state = 'loading';
    loadError = null;
    try {
      list = (await guarded(() => listSubjects())) ?? [];
      state = 'ready';
    } catch (err) {
      loadError = err;
      state = 'error';
    }
  }

  onMount(load);

  function openCreate() {
    form = freshForm();
    formError = '';
    creating = true;
  }

  function toggleGrade(g: number) {
    form.Grades = form.Grades.includes(g)
      ? form.Grades.filter((x) => x !== g)
      : [...form.Grades, g].sort((a, b) => a - b);
  }

  async function save() {
    formError = '';
    if (!form.Name.trim() || form.Grades.length === 0) {
      formError = $t.subject.required;
      return;
    }
    if (form.Color.trim() && !/^#[0-9a-fA-F]{6}$/.test(form.Color.trim())) {
      formError = $t.subject.required;
      return;
    }
    saving = true;
    try {
      const created = await createSubject({
        Name: form.Name.trim(),
        Code: form.Code.trim(),
        Description: form.Description.trim(),
        Grades: [...form.Grades],
        Color: form.Color.trim()
      });
      creating = false;
      push(`/admin/materias/${encodeURIComponent(created.ID)}`);
    } catch (err) {
      formError = err instanceof ApiError ? err.message : $t.common.loadError;
    } finally {
      saving = false;
    }
  }

  $: qn = q.trim().toLowerCase();
  $: visible = list
    .filter((s) => (qn ? `${s.Name} ${s.Code}`.toLowerCase().includes(qn) : true))
    .filter((s) => (fGrade ? s.Grades.includes(Number(fGrade)) : true));
</script>

<AdminShell active="materias" year={currentYear}>
  <TopBar title={$t.subject.title} showBack onBack={() => push('/admin')}>
    <TopActions />
  </TopBar>

  <div class="pagehead">
    <p class="eyebrow">{$t.admin.consoleEyebrow}</p>
    <div class="toolbar">
      <button type="button" class="new" on:click={openCreate}>
        {$t.subject.newAction}
      </button>
    </div>
  </div>

  <div class="sheet">
    {#if state === 'loading'}
      <Skeleton rows={5} />
    {:else if state === 'error'}
      <ErrorState error={loadError} onRetry={load} />
    {:else if list.length === 0}
      <EmptyState icon="cap" title={$t.subject.emptyTitle} body={$t.subject.emptyBody} />
    {:else}
      <div class="filters" role="group" aria-label={$t.subject.title}>
        <label class="search">
          <Icon name="search" />
          <input
            type="search"
            placeholder={$t.subject.searchPlaceholder}
            aria-label={$t.subject.searchPlaceholder}
            bind:value={q}
          />
        </label>
        <Dropdown
          label={$t.subject.gradeFilterLabel}
          value={fGrade}
          options={[
            { value: '', label: $t.subject.gradeFilterAll },
            ...ALL_GRADES.map((g) => ({ value: String(g), label: $t.subject.gradeLabel(g) }))
          ]}
          on:select={(e) => (fGrade = e.detail)}
        />
        <span class="count" role="status">{$t.subject.countLabel(visible.length)}</span>
      </div>
      {#if visible.length === 0}
        <EmptyState icon="search" title={$t.subject.noMatchTitle} body={$t.subject.noMatchBody} />
      {:else}
        <ul class="rows">
          {#each visible as s (s.ID)}
            <li>
              <button
                type="button"
                class="row"
                on:click={() => push(`/admin/materias/${encodeURIComponent(s.ID)}`)}
                aria-label={`${$t.subject.title}: ${s.Name}`}
              >
                <span class="dot" style={`background:${s.Color || 'var(--muted)'}`} aria-hidden="true"></span>
                <span class="who">
                  <strong>{s.Name}</strong>
                  <small>
                    {#if s.Code}<span class="codechip">{s.Code}</span>{/if}
                    <span>{$t.subject.gradesSummary(s.Grades ?? [])}</span>
                    {#if !s.Active}<span class="retired">{$t.teacherDetail.retired}</span>{/if}
                  </small>
                </span>
                <span class="go" aria-hidden="true"><Icon name="next" /></span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
  </div>
</AdminShell>

<Sheet open={creating} title={$t.subject.createTitle} onClose={() => (creating = false)}>
  <form class="form" on:submit|preventDefault={save}>
    <label>{$t.subject.nameLabel}<input bind:value={form.Name} autocomplete="off" placeholder={$t.subject.namePlaceholder} /></label>
    <label>{$t.subject.codeLabel}<input bind:value={form.Code} autocomplete="off" placeholder={$t.subject.codePlaceholder} /></label>
    <label>{$t.subject.descriptionLabel}<textarea bind:value={form.Description} rows="2" placeholder={$t.subject.descriptionPlaceholder}></textarea></label>
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
      <p class="hint">{$t.subject.gradesHint}</p>
    </fieldset>
    <fieldset class="colors">
      <legend>{$t.subject.colorLabel}</legend>
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
        <input
          class="custom"
          bind:value={form.Color}
          placeholder={$t.subject.colorCustomLabel}
          inputmode="text"
          autocomplete="off"
          aria-label={$t.subject.colorCustomLabel}
        />
      </div>
    </fieldset>
    {#if formError}<p class="flash error" role="alert">{formError}</p>{/if}
    <div class="actions">
      <button class="ghost" type="button" on:click={() => (creating = false)}>{$t.common.cancel}</button>
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
    margin-bottom: 8px;
  }
  .toolbar {
    display: flex;
    justify-content: flex-end;
  }
  .new {
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 700;
    min-height: 44px;
    padding: 10px 18px;
    border-radius: var(--radius-pill);
    white-space: nowrap;
  }
  .new:active {
    transform: scale(0.97);
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
  .filters {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin: 4px 0 12px;
    align-items: end;
  }
  @media (min-width: 700px) {
    .filters {
      grid-template-columns: 2fr 1fr auto;
    }
  }
  .filters > label.search {
    display: flex;
    flex-direction: row;
    gap: 8px;
    align-items: center;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 0 12px;
    min-height: 44px;
    color: var(--muted);
  }
  .filters > label.search input {
    border: 0;
    background: none;
    outline: none;
    width: 100%;
    flex: 1;
    min-width: 0;
    color: var(--ink);
  }
  .count {
    align-self: center;
    justify-self: end;
    background: var(--tint);
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 7px 16px;
    color: var(--ink-soft);
    font-size: 0.8rem;
    font-weight: 700;
    white-space: nowrap;
  }
  .rows {
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
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    padding: 14px 16px;
    min-height: 68px;
  }
  .row:active {
    transform: scale(0.98);
  }
  .dot {
    flex: none;
    width: 16px;
    height: 16px;
    border-radius: 999px;
    border: 1px solid var(--line);
  }
  .row .who {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .row strong {
    font-size: 1.1rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .row small {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    color: var(--muted);
    font-size: 0.78rem;
    font-weight: 600;
    margin-top: 2px;
  }
  .codechip {
    background: var(--tint);
    border-radius: 999px;
    padding: 2px 10px;
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--ink-soft);
  }
  .retired {
    background: var(--chip-pink-bg);
    color: var(--chip-pink-ink);
    border-radius: 999px;
    padding: 2px 10px;
    font-size: 0.72rem;
    font-weight: 700;
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
  .form input,
  .form textarea {
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 12px 14px;
    min-height: 52px;
    width: 100%;
    font: inherit;
    color: var(--ink);
  }
  .form textarea {
    min-height: 0;
    resize: vertical;
  }
  fieldset {
    border: 0;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  legend {
    font-weight: 600;
    font-size: 0.9rem;
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
  .hint {
    color: var(--muted);
    font-size: 0.78rem;
  }
  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
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
  .swatches .custom {
    flex: 1;
    min-width: 130px;
    min-height: 44px;
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    background: var(--surface-2);
    padding: 0 12px;
    font-weight: 600;
    color: var(--ink);
  }
  .flash.error {
    background: var(--chip-pink-bg);
    color: var(--chip-pink-ink);
    font-weight: 600;
    font-size: 0.9rem;
    border-radius: var(--radius-chip);
    padding: 10px 14px;
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
</style>
