<script lang="ts">
  import { push } from 'svelte-spa-router';
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import AdminShell from './AdminShell.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ErrorState from '$lib/ui/ErrorState.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import Toast from '$lib/ui/Toast.svelte';
  import Dropdown from '$lib/ui/Dropdown.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { t } from '$lib/i18n';
  import { guarded } from '$lib/nav';
  import {
    warningsRecent,
    groupsByYear,
    classReport,
    issueWarningBatch,
    type RecentWarning,
    type YearGroup
  } from './api';

  const currentYear = new Date().getFullYear();
  let year = currentYear;

  type State = 'loading' | 'error' | 'ready';
  let state: State = 'loading';
  let loadError: unknown = null;
  let items: RecentWarning[] = [];
  let groups: YearGroup[] = [];

  let query = '';
  let gravity: '' | 'mild' | 'moderate' | 'severe' = '';
  let classLabel = '';

  let toast = '';
  let creating = false;
  let saving = false;
  let formError = '';

  // Create form.
  let fGroupID = '';
  let roster: { StudentID: string; Names: string; Surnames: string }[] = [];
  let rosterLoading = false;
  let picked: string[] = [];
  let fGravity: 'mild' | 'moderate' | 'severe' = 'mild';
  let fTitle = '';
  let fDesc = '';
  let fWhen = '';

  $: classLabels = [...new Set(items.map((w) => w.ClassLabel).filter(Boolean))].sort();
  $: filtered = items.filter((w) => {
    if (gravity && w.Gravity !== gravity) return false;
    if (classLabel && w.ClassLabel !== classLabel) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [w.StudentName, w.ClassLabel, w.AuthorName, w.Title, w.Description]
      .join(' ')
      .toLowerCase()
      .includes(q);
  });

  function moment(value: string): string {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function nowLocal(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  async function load() {
    state = 'loading';
    loadError = null;
    try {
      const [warns, gs] = await Promise.all([
        guarded(() => warningsRecent(100)),
        guarded(() => groupsByYear(year))
      ]);
      items = warns ?? [];
      groups = gs ?? [];
      if (classLabel && !classLabels.includes(classLabel)) classLabel = '';
      state = 'ready';
    } catch (err) {
      loadError = err;
      state = 'error';
    }
  }

  function openCreate() {
    creating = true;
    formError = '';
    saving = false;
    fGroupID = '';
    roster = [];
    picked = [];
    fGravity = 'mild';
    fTitle = '';
    fDesc = '';
    fWhen = nowLocal();
  }

  async function onGroupChange() {
    picked = [];
    roster = [];
    if (!fGroupID) return;
    rosterLoading = true;
    try {
      const rep = await guarded(() => classReport(fGroupID));
      roster = (rep?.Students ?? []).map((s) => ({
        StudentID: s.StudentID,
        Names: s.Names,
        Surnames: s.Surnames
      }));
    } finally {
      rosterLoading = false;
    }
  }

  function togglePicked(id: string) {
    picked = picked.includes(id) ? picked.filter((p) => p !== id) : [...picked, id];
  }

  $: gravityOptions = [
    { value: '', label: $t.warnings.any },
    { value: 'mild', label: $t.roster.warnGravityMild },
    { value: 'moderate', label: $t.roster.warnGravityModerate },
    { value: 'severe', label: $t.roster.warnGravitySevere }
  ];
  $: classOptions = [
    { value: '', label: $t.warnings.any },
    ...classLabels.map((l) => ({ value: l, label: l }))
  ];

  function selectGravity(e: CustomEvent<string>) {
    const v = e.detail;
    gravity = v === 'mild' || v === 'moderate' || v === 'severe' ? v : '';
  }

  function selectClass(e: CustomEvent<string>) {
    classLabel = e.detail;
  }

  async function save() {
    formError = '';
    if (!fGroupID) {
      formError = $t.warnings.needClass;
      return;
    }
    if (picked.length === 0) {
      formError = $t.warnings.needStudent;
      return;
    }
    if (!fTitle.trim()) {
      formError = $t.warnings.needTitle;
      return;
    }
    saving = true;
    try {
      await issueWarningBatch({
        classID: fGroupID,
        studentIDs: picked,
        gravity: fGravity,
        title: fTitle.trim(),
        description: fDesc.trim(),
        happenedAt: fWhen ? new Date(fWhen).toISOString() : undefined
      });
      creating = false;
      toast = $t.warnings.saved;
      await load();
    } catch (err) {
      formError = err instanceof Error ? err.message : String(err);
    } finally {
      saving = false;
    }
  }

  load();
</script>

<AdminShell active="llamados" {year}>
  <TopBar title={$t.warnings.title} showBack onBack={() => push('/admin')}><TopActions /></TopBar>

  <div class="pagehead">
    <p class="eyebrow">{$t.admin.consoleEyebrow}</p>
    <h1 class="title">{$t.warnings.title}</h1>
    <div class="toolbar">
      <button type="button" class="mini primary" on:click={openCreate}>
        {$t.warnings.newAction}
      </button>
    </div>
  </div>

  {#if state === 'loading'}
    <Skeleton rows={6} />
  {:else if state === 'error'}
    <ErrorState error={loadError} onRetry={load} />
  {:else}
    <div class="filters" role="group" aria-label={$t.warnings.title}>
      <label class="search">
        <Icon name="search" />
        <input
          type="search"
          placeholder={$t.warnings.search}
          aria-label={$t.warnings.search}
          bind:value={query}
        />
      </label>
      <Dropdown
        label={$t.warnings.filterGravity}
        value={gravity}
        options={gravityOptions}
        on:select={selectGravity}
      />
      <Dropdown
        label={$t.warnings.filterClass}
        value={classLabel}
        options={classOptions}
        on:select={selectClass}
      />
      <span class="count" role="status">{$t.warnings.count(filtered.length)}</span>
    </div>

    {#if filtered.length === 0}
      <EmptyState
        icon="warn"
        title={query || gravity || classLabel ? $t.warnings.noMatchTitle : $t.warnings.emptyTitle}
        body={query || gravity || classLabel ? $t.warnings.noMatchBody : $t.warnings.emptyBody}
      />
    {:else}
      <ul class="wlist">
        {#each filtered as w (w.ID)}
          <li class="warn">
            <div class="warn-head">
              <span class={`sev ${w.Gravity === 'mild' ? 'leve' : w.Gravity === 'moderate' ? 'medio' : 'grave'}`}>
                {w.Gravity === 'mild' ? $t.roster.warnGravityMild : w.Gravity === 'moderate' ? $t.roster.warnGravityModerate : $t.roster.warnGravitySevere}
              </span>
              <strong class="wname">{w.StudentName || '—'}</strong>
              {#if w.StudentID}
                <button type="button" class="mini" on:click={() => push(`/admin/estudiantes/${w.StudentID}`)}>
                  {$t.warnings.openFile}
                </button>
              {/if}
            </div>
            <p class="wtitle">{w.Title}</p>
            {#if w.Description}<p class="wdesc">{w.Description}</p>{/if}
            <div class="frames">
              {#if w.ClassLabel}
                <span class="frame"><small>{$t.warnings.filterClass}</small><strong>{w.ClassLabel}</strong></span>
              {/if}
              {#if w.AuthorName}
                <span class="frame"><small>{$t.warnings.metaAuthor}</small><strong>{w.AuthorName}</strong></span>
              {/if}
              {#if moment(w.HappenedAt)}
                <span class="frame"><small>{$t.warnings.fWhen}</small><strong>{moment(w.HappenedAt)}</strong></span>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}

  <Sheet open={creating} title={$t.warnings.formTitle} onClose={() => (creating = false)}>
    <p class="muted">{$t.warnings.formNote}</p>
    <form class="form" on:submit|preventDefault={save}>
      <label>
        <span>{$t.warnings.fClass}</span>
        <select bind:value={fGroupID} on:change={onGroupChange}>
          <option value="">—</option>
          {#each groups as g (g.GroupID)}
            <option value={g.GroupID}>{g.ClassLabel}</option>
          {/each}
        </select>
      </label>
      <fieldset>
        <legend>{$t.warnings.fStudents}</legend>
        {#if rosterLoading}
          <p class="muted">…</p>
        {:else if roster.length === 0}
          <p class="muted">{$t.warnings.rosterEmpty}</p>
        {:else}
          <div class="picklist">
            {#each roster as s (s.StudentID)}
              <label class="pick">
                <input type="checkbox" checked={picked.includes(s.StudentID)} on:change={() => togglePicked(s.StudentID)} />
                <span>{s.Names} {s.Surnames}</span>
              </label>
            {/each}
          </div>
        {/if}
      </fieldset>
      <div class="row2">
        <label>
          <span>{$t.warnings.fGravity}</span>
          <select bind:value={fGravity}>
            <option value="mild">{$t.roster.warnGravityMild}</option>
            <option value="moderate">{$t.roster.warnGravityModerate}</option>
            <option value="severe">{$t.roster.warnGravitySevere}</option>
          </select>
        </label>
        <label>
          <span>{$t.warnings.fWhen}</span>
          <input type="datetime-local" bind:value={fWhen} />
        </label>
      </div>
      <label>
        <span>{$t.warnings.fTitle}</span>
        <input type="text" placeholder={$t.warnings.fTitlePlaceholder} bind:value={fTitle} maxlength="120" />
      </label>
      <label>
        <span>{$t.warnings.fDesc}</span>
        <textarea rows="3" placeholder={$t.warnings.fDescPlaceholder} bind:value={fDesc}></textarea>
      </label>
      {#if formError}<p class="flash error" role="alert">{formError}</p>{/if}
      <div class="actions">
        <button type="button" class="mini" on:click={() => (creating = false)}>{$t.warnings.cancel}</button>
        <button type="submit" class="mini primary" disabled={saving}>
          {saving ? $t.warnings.saving : $t.warnings.save}
        </button>
      </div>
    </form>
  </Sheet>

  <Toast message={toast} onClose={() => (toast = '')} />
</AdminShell>

<style>
  .pagehead {
    margin-bottom: 20px;
  }
  .eyebrow {
    color: var(--muted);
    font-size: 0.85rem;
    margin-bottom: 2px;
  }
  .title {
    margin: 0;
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 8px;
    flex-wrap: wrap;
  }
  .muted {
    color: var(--muted);
    font-size: 0.85rem;
  }
  .mini {
    display: inline-flex;
    align-items: center;
    min-height: 40px;
    padding: 0 14px;
    border-radius: var(--radius-pill);
    background: var(--tint);
    font-weight: 700;
    font-size: 0.82rem;
  }
  .mini.primary {
    background: var(--accent);
    color: #fff;
  }
  .filters {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin: 12px 0 4px;
    align-items: end;
  }
  @media (min-width: 700px) {
    .filters {
      grid-template-columns: 2fr 1fr 1fr auto;
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
  .filters > label.search :global(svg) {
    flex: none;
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
  .wlist {
    list-style: none;
    margin: 12px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .warn {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 14px 16px;
  }
  .warn-head {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .wname {
    flex: 1;
    min-width: 0;
    font-size: 1.05rem;
    overflow-wrap: break-word;
  }
  .wtitle {
    font-weight: 700;
    font-size: 0.92rem;
    color: var(--ink);
    margin: 10px 0 0;
  }
  .wdesc {
    color: var(--muted);
    font-size: 0.88rem;
    margin: 4px 0 0;
  }
  .frames {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 8px;
    margin-top: 12px;
  }
  .frame {
    display: flex;
    flex-direction: column;
    gap: 2px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 8px 12px;
    min-width: 0;
  }
  .frame small {
    color: var(--muted);
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .frame strong {
    font-size: 0.88rem;
    overflow-wrap: break-word;
  }
  .sev {
    flex: none;
    border-radius: 999px;
    padding: 2px 10px;
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: capitalize;
  }
  .sev.leve {
    background: var(--chip-sky-bg);
    color: var(--chip-sky-ink);
  }
  .sev.medio {
    background: var(--chip-yellow-bg);
    color: var(--chip-yellow-ink);
  }
  .sev.grave {
    background: var(--chip-pink-bg);
    color: var(--chip-pink-ink);
  }
  .form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .form label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.82rem;
    font-weight: 600;
  }
  .form input,
  .form select,
  .form textarea {
    min-height: 40px;
    font-weight: 400;
  }
  .row2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  fieldset {
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 10px 12px;
    margin: 0;
  }
  legend {
    font-size: 0.82rem;
    font-weight: 600;
    padding: 0 6px;
  }
  .picklist {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 220px;
    overflow-y: auto;
  }
  .pick {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 10px;
    min-height: 40px;
    font-weight: 400;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }
  .flash {
    border-radius: var(--radius);
    padding: 10px 12px;
    font-size: 0.85rem;
    margin: 0;
  }
  .flash.error {
    background: var(--chip-pink-bg);
    color: var(--g-grave-ink);
  }
</style>
