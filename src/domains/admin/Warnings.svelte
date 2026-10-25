<script lang="ts">
  import { push } from 'svelte-spa-router';
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import AdminShell from './AdminShell.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ErrorState from '$lib/ui/ErrorState.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import { notify } from '$lib/ui/notice';
  import Dropdown from '$lib/ui/Dropdown.svelte';
  import WarningCorrectForm from './WarningCorrectForm.svelte';
  import WarningRevisionTrail from './WarningRevisionTrail.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { t } from '$lib/i18n';
  import { guarded, queryParam } from '$lib/nav';
  import { foldSearch } from '$lib/search';
  import {
    warningsRecent,
    groupsByYear,
    classReport,
    issueWarningBatch,
    studentWarnings,
    warningRevisions,
    type RecentWarning,
    type YearGroup,
    type WarningRevision
  } from './api';
  import type { Warning } from '$lib/api/types';

  const currentYear = new Date().getFullYear();
  let year = currentYear;

  type State = 'loading' | 'error' | 'ready';
  export let querystring: string = '';

  let state: State = 'loading';
  let loadError: unknown = null;
  let items: RecentWarning[] = [];
  let groups: YearGroup[] = [];

  let query = '';
  let gravity: '' | 'mild' | 'moderate' | 'severe' = '';
  let classLabel = '';
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
    const q = foldSearch(query.trim());
    if (!q) return true;
    return foldSearch([w.StudentName, w.ClassLabel, w.AuthorName, w.Title, w.Description].join(' ')).includes(
      q
    );
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
        guarded(() => warningsRecent(500, true)),
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

  // Grouped by salon: sections collapse in place, students alphabetical.
  $: salonGroups = (() => {
    const bySalon = new Map<string, Map<string, { id: string; name: string; items: RecentWarning[] }>>();
    for (const w of filtered) {
      const label = w.ClassLabel || $t.warnings.noSalon;
      let students = bySalon.get(label);
      if (!students) {
        students = new Map();
        bySalon.set(label, students);
      }
      const key = w.StudentID || w.StudentName;
      let row = students.get(key);
      if (!row) {
        row = { id: w.StudentID, name: w.StudentName || '—', items: [] };
        students.set(key, row);
      }
      row.items.push(w);
    }
    return [...bySalon.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'es'))
      .map(([label, students]) => ({
        label,
        total: [...students.values()].reduce((n, s) => n + s.items.length, 0),
        students: [...students.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'))
      }));
  })();

  let collapsed: Record<string, boolean> = {};

  function toggleGroup(label: string) {
    collapsed = { ...collapsed, [label]: !collapsed[label] };
  }

  // Student popup: full history with detail, modify and trail.
  let detailID: string | null = null;
  let detailName = '';
  let detailWarnings: Warning[] = [];
  let detailLoading = false;
  let editingID: string | null = null;
  let revsOpen: Record<string, boolean> = {};
  let revs: Record<string, WarningRevision[]> = {};
  let revsLoading: Record<string, boolean> = {};

  async function openStudent(id: string, name: string) {
    detailID = id;
    detailName = name;
    detailWarnings = [];
    editingID = null;
    revsOpen = {};
    revs = {};
    if (!id) return;
    detailLoading = true;
    try {
      detailWarnings = (await guarded(() => studentWarnings(id))) ?? [];
    } finally {
      detailLoading = false;
    }
  }

  function closeStudent() {
    detailID = null;
    detailName = '';
    detailWarnings = [];
    editingID = null;
  }

  function gravityName(g: string): string {
    return g === 'mild' ? $t.roster.warnGravityMild : g === 'moderate' ? $t.roster.warnGravityModerate : $t.roster.warnGravitySevere;
  }

  function gravityClass(g: string): string {
    return g === 'mild' ? 'leve' : g === 'moderate' ? 'medio' : 'grave';
  }

  function startEdit(w: Warning) {
    editingID = w.ID;
  }

  async function afterCorrection(updated: Warning) {
    detailWarnings = detailWarnings.map((w) => (w.ID === updated.ID ? { ...w, ...updated } : w));
    editingID = null;
    notify($t.warnings.updated);
    revs = { ...revs, [updated.ID]: (await guarded(() => warningRevisions(updated.ID))) ?? [] };
    await load();
  }

  async function toggleRevs(id: string) {
    revsOpen = { ...revsOpen, [id]: !revsOpen[id] };
    if (!revsOpen[id] || revs[id]) return;
    revsLoading = { ...revsLoading, [id]: true };
    try {
      revs = { ...revs, [id]: (await guarded(() => warningRevisions(id))) ?? [] };
    } finally {
      revsLoading = { ...revsLoading, [id]: false };
    }
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
      notify($t.warnings.saved);
      await load();
    } catch (err) {
      formError = err instanceof Error ? err.message : String(err);
    } finally {
      saving = false;
    }
  }

  load().then(async () => {
    const id = queryParam(querystring, 'estudiante');
    if (!id) return;
    const name = queryParam(querystring, 'nombre');
    await openStudent(id, name);
    // Llamado específico: abre su trail dentro de la ficha.
    const wid = queryParam(querystring, 'llamado');
    if (wid && !revsOpen[wid]) await toggleRevs(wid);
  });
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
      {#each salonGroups as group (group.label)}
        <section class="salon" aria-label={group.label}>
          <button type="button" class="shead" on:click={() => toggleGroup(group.label)} aria-expanded={!collapsed[group.label]}>
            <strong>{group.label}</strong>
            <span class="count" role="status">{$t.warnings.callsLabel(group.total)}</span>
            <span class="chev" aria-hidden="true">{collapsed[group.label] ? '▸' : '▾'}</span>
          </button>
          {#if !collapsed[group.label]}
            <ul class="students">
              {#each group.students as s (s.id || s.name)}
                <li>
                  <button type="button" class="stu" on:click={() => openStudent(s.id, s.name)}>
                    <span class="sname">{s.name}</span>
                    <span class="count" role="status">{$t.warnings.callsLabel(s.items.length)}</span>
                  </button>
                  {#if s.id}
                    <button type="button" class="mini" on:click={() => push(`/admin/estudiantes/${s.id}`)}>
                      {$t.warnings.openFile}
                    </button>
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
        </section>
      {/each}
    {/if}
  {/if}

  <Sheet open={detailID !== null} title={$t.warnings.detailTitle} onClose={closeStudent}>
    <div class="dhead">
      <strong>{detailName}</strong>
      {#if detailID}
        <button type="button" class="mini" on:click={() => { closeStudent(); push(`/admin/estudiantes/${detailID}`); }}>
          {$t.warnings.openFile}
        </button>
      {/if}
    </div>
    {#if detailLoading}
      <Skeleton rows={3} />
    {:else if detailWarnings.length === 0}
      <p class="muted">{$t.studentDetail.noWarningsBody}</p>
    {:else}
      <ul class="dwlist">
        {#each detailWarnings as w (w.ID)}
          <li class="dwarn">
            <div class="warn-head">
              <span class={`sev ${gravityClass(w.Gravity)}`}>{gravityName(w.Gravity)}</span>
              <strong class="wtitle">{w.Title}</strong>
            </div>
            {#if w.Description}<p class="wdesc">{w.Description}</p>{/if}
            <small class="wmeta">
              {#if w.AuthorName}{w.AuthorName} · {/if}{moment(w.HappenedAt)}
            </small>
            <div class="wrow">
              {#if editingID !== w.ID}
                <button type="button" class="mini" on:click={() => startEdit(w)}>
                  {$t.warnings.modifyAction}
                </button>
              {/if}
              <button type="button" class="mini" on:click={() => toggleRevs(w.ID)}>
                {revsOpen[w.ID] ? $t.warnings.hideRevisions : $t.warnings.showRevisions}
              </button>
            </div>
            {#if editingID === w.ID}
              <WarningCorrectForm
                warningId={w.ID}
                initialGravity={w.Gravity}
                initialTitle={w.Title}
                initialDescription={w.Description ?? ''}
                onClose={() => (editingID = null)}
                onSaved={afterCorrection}
              />
            {/if}
            {#if revsOpen[w.ID]}
              {#if revsLoading[w.ID]}
                <Skeleton rows={1} />
              {:else}
                <WarningRevisionTrail revisions={revs[w.ID] ?? []} personName={detailName} />
              {/if}
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </Sheet>

  <Sheet open={creating} title={$t.warnings.formTitle} onClose={() => (creating = false)}>
    <p class="muted">{$t.warnings.formNote}</p>
    <form class="form" on:submit|preventDefault={save}>
      <Dropdown
        label={$t.warnings.fClass}
        value={fGroupID}
        placeholder={$t.warnings.pickClass}
        options={groups.map((g) => ({ value: g.GroupID, label: g.ClassLabel }))}
        on:select={(e) => {
          fGroupID = String(e.detail);
          onGroupChange();
        }}
      />
      <div class="group" role="group" aria-label={$t.warnings.fStudents}>
        <span class="glabel">{$t.warnings.fStudents}</span>
        {#if rosterLoading}
          <p class="muted">…</p>
        {:else if roster.length === 0}
          <p class="muted">{$t.warnings.rosterEmpty}</p>
        {:else}
          <div class="picklist">
            {#each roster as s (s.StudentID)}
              {@const on = picked.includes(s.StudentID)}
              <button type="button" class="pick" class:on aria-pressed={on} on:click={() => togglePicked(s.StudentID)}>
                <span class="ckbox" aria-hidden="true">{#if on}✓{/if}</span>
                <span>{s.Names} {s.Surnames}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>
      <div class="row2">
        <Dropdown
          label={$t.warnings.fGravity}
          value={fGravity}
          options={[
            { value: 'mild', label: $t.roster.warnGravityMild },
            { value: 'moderate', label: $t.roster.warnGravityModerate },
            { value: 'severe', label: $t.roster.warnGravitySevere }
          ]}
          on:select={(e) => {
            const v = String(e.detail);
            fGravity = v === 'moderate' || v === 'severe' ? v : 'mild';
          }}
        />
        <label>
          <span>{$t.warnings.fWhen}</span>
          <input type="datetime-local" lang="es-CO" bind:value={fWhen} />
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
  .salon {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow);
    margin-top: 12px;
    overflow: hidden;
  }
  .shead {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    text-align: left;
  }
  .shead strong {
    flex: 1;
    font-size: 1.05rem;
  }
  .chev {
    color: var(--muted);
    font-size: 0.9rem;
  }
  .students {
    list-style: none;
    margin: 0;
    padding: 0 12px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .students li {
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 8px 8px 8px 14px;
  }
  .stu {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    text-align: left;
    min-height: 40px;
  }
  .sname {
    flex: 1;
    min-width: 0;
    font-weight: 700;
    overflow-wrap: break-word;
  }
  .dhead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }
  .dhead strong {
    font-size: 1.05rem;
  }
  .dwlist {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .dwarn {
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .warn-head {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .wtitle {
    font-weight: 700;
    font-size: 0.92rem;
    color: var(--ink);
    margin: 0;
  }
  .wdesc {
    color: var(--muted);
    font-size: 0.88rem;
    margin: 0;
  }
  .wmeta {
    color: var(--muted);
    font-size: 0.78rem;
  }
  .wrow {
    display: flex;
    align-items: center;
    gap: 12px;
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
  .form > label {
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
    padding: 12px 14px;
    min-height: 52px;
    width: 100%;
    font-weight: 400;
    font-size: 0.9rem;
    color: var(--ink);
  }
  .form textarea {
    min-height: 0;
    resize: vertical;
  }
  .form input:focus,
  .form textarea:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .glabel {
    font-size: 0.82rem;
    font-weight: 600;
  }
  .picklist {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 240px;
    overflow-y: auto;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 8px;
  }
  .pick {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 12px;
    width: 100%;
    text-align: left;
    min-height: 48px;
    padding: 8px 12px;
    border: 1px solid transparent;
    border-radius: 10px;
    font-size: 0.9rem;
    color: var(--ink);
  }
  .pick.on {
    background: var(--accent-soft);
    border-color: var(--accent);
    font-weight: 700;
  }
  .ckbox {
    flex: none;
    width: 22px;
    height: 22px;
    border-radius: 7px;
    border: 2px solid var(--line);
    background: var(--surface);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8rem;
    font-weight: 800;
    color: var(--accent);
  }
  .pick.on .ckbox {
    border-color: var(--accent);
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
