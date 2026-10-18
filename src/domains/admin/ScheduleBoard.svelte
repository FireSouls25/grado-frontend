<script lang="ts">
  import { push } from 'svelte-spa-router';
  import { t } from '$lib/i18n';
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import AdminShell from './AdminShell.svelte';
  import ErrorState from '$lib/ui/ErrorState.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Dropdown from '$lib/ui/Dropdown.svelte';
  import { onMount } from 'svelte';
  import { groupsByYear, listSubjects, createSubject, updateSubject, deleteSubject, teachers, subjectAssignments, scheduleEntries } from './api';
  import type { YearGroup, Subject, TeacherSummary, ScheduleEntry } from './api';
  import Sheet from '$lib/ui/Sheet.svelte';
  import Toast from '$lib/ui/Toast.svelte';
  import ScheduleEntrySheet from './ScheduleEntrySheet.svelte';
  import { WEEK_ORDER, rangeLabel, toClock, SCHOOL_END_MIN, MIN_DURATION_MIN } from '$lib/schedule';
  import { guarded } from '$lib/nav';
  import { ApiError } from '$lib/api/types';
  import { isMissing } from '../teacher/api';

  const currentYear = new Date().getFullYear();
  // Salones con opciones reales del año + escritura libre con filtro:
  // combobox nativo (input + datalist), táctil y sin dependencias.
  let salon = '';
  let year = currentYear;
  let salonOptions: string[] = [];
  let groups: YearGroup[] = [];
  let optionsYear = 0;
  let loading = false;
  let loadError: unknown = null;
  let subjectsList: Subject[] = [];
  let teacherList: TeacherSummary[] = [];
  let entries: ScheduleEntry[] = [];
  let entriesError: unknown = null;
  let sheetOpen = false;
  let editingEntry: ScheduleEntry | null = null;
  let sheetDay: number | null = null;
  let sheetStart: number | null = null;
  let sheetSubject: string | null = null;

  // Catálogo dentro del horario: nombre + descripción + color.
  const COLOR_PRESETS = ['#7C3AED', '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#EC4899'];
  let subjectSheet: 'closed' | 'create' | 'edit' | 'delete' = 'closed';
  let subjectForm = { id: '', name: '', desc: '', color: '' };
  let savingSubject = false;
  let subjectError = '';
  let toast = '';

  function tint(color: string): string {
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) return '';
    return `background:${color}1A;border-color:${color}59`;
  }

  function openCreateSubject() {
    subjectForm = { id: '', name: '', desc: '', color: COLOR_PRESETS[0] };
    subjectError = '';
    subjectSheet = 'create';
  }

  function openEditSubject(s: Subject) {
    subjectForm = { id: s.ID, name: s.Name, desc: s.Description ?? '', color: s.Color ?? '' };
    subjectError = '';
    subjectSheet = 'edit';
  }

  function openDeleteSubject(s: Subject) {
    subjectForm = { id: s.ID, name: s.Name, desc: s.Description ?? '', color: s.Color ?? '' };
    subjectError = '';
    subjectSheet = 'delete';
  }

  async function refreshSubjects() {
    subjectsList = (await guarded(() => listSubjects())) ?? [];
  }

  async function saveSubject() {
    subjectError = '';
    if (!subjectForm.name.trim()) {
      subjectError = $t.schedule.subjectRequired;
      return;
    }
    if (subjectForm.color && !/^#[0-9a-fA-F]{6}$/.test(subjectForm.color)) {
      subjectError = $t.subject.colorCustomLabel;
      return;
    }
    savingSubject = true;
    try {
      if (subjectSheet === 'edit') {
        const current = subjectsList.find((s) => s.ID === subjectForm.id);
        await updateSubject(subjectForm.id, {
          Name: subjectForm.name.trim(),
          Code: current?.Code ?? '',
          Description: subjectForm.desc.trim(),
          Grades: current?.Grades ?? [],
          Color: subjectForm.color,
          Active: current?.Active ?? true
        });
        toast = $t.subject.saved;
      } else {
        await createSubject({
          Name: subjectForm.name.trim(),
          Code: '',
          Description: subjectForm.desc.trim(),
          Grades: [],
          Color: subjectForm.color
        });
        toast = $t.subject.created;
      }
      subjectSheet = 'closed';
      await refreshSubjects();
    } catch (err) {
      subjectError = err instanceof Error ? err.message : String(err);
    } finally {
      savingSubject = false;
    }
  }

  async function confirmDeleteSubject() {
    subjectError = '';
    savingSubject = true;
    try {
      await deleteSubject(subjectForm.id);
      subjectSheet = 'closed';
      toast = $t.subject.deleted;
      await refreshSubjects();
    } catch (err) {
      subjectError = err instanceof Error ? err.message : String(err);
    } finally {
      savingSubject = false;
    }
  }
  const yearOptions = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];

  $: pickedGroup = groups.find((g) => g.ClassLabel === salon) ?? null;
  $: if (pickedGroup) void loadEntries(pickedGroup.GroupID);
  $: if (!pickedGroup) {
    entries = [];
    entriesError = null;
  }

  async function loadEntries(groupID: string) {
    entriesError = null;
    try {
      entries = (await guarded(() => scheduleEntries({ classGroupID: groupID }))) ?? [];
    } catch (err) {
      entries = [];
      entriesError = err;
    }
  }

  async function fetchAssigned(subjectID: string): Promise<string[]> {
    // UUID ajeno al catálogo: nada que buscar, sin ruido 400 en consola.
    if (!/^[0-9a-fA-F-]{36}$/.test(subjectID)) return [];
    const timeline = (await guarded(() => subjectAssignments(subjectID))) ?? [];
    return timeline.filter((a) => !a.EndedAt || a.EndedAt.startsWith('0001')).map((a) => a.TeacherID);
  }

  async function fetchTeacherEntries(teacherID: string): Promise<ScheduleEntry[]> {
    return (await guarded(() => scheduleEntries({ teacherID }))) ?? [];
  }

  function openAdd(day: number | null = null, startMin: number | null = null, subjectID: string | null = null) {
    editingEntry = null;
    sheetDay = day;
    // La última media hora no cabe en 1 h: arranca una hora antes del cierre.
    sheetStart =
      startMin !== null && startMin + MIN_DURATION_MIN > SCHOOL_END_MIN
        ? SCHOOL_END_MIN - MIN_DURATION_MIN
        : startMin;
    sheetSubject = subjectID;
    sheetOpen = true;
  }

  function onDropSubject(e: DragEvent, day: number, startMin: number) {
    e.preventDefault();
    dropTarget = null;
    const subjectID = e.dataTransfer?.getData('text/subject-id') ?? '';
    if (!subjectID) return;
    openAdd(day, startMin, subjectID);
  }

  function onDragOverCell(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  }

  // La parrilla reacciona mientras arrastras: la celda bajo el cursor
  // se enciende para mostrar dónde encajará el bloque (día + inicio).
  let dropTarget: { day: number; start: number } | null = null;

  function onDragEnterCell(day: number, start: number) {
    dropTarget = { day, start };
  }

  function openEdit(e: ScheduleEntry) {
    editingEntry = e;
    sheetDay = null;
    sheetOpen = true;
  }

  async function onSaved() {
    sheetOpen = false;
    editingEntry = null;
    sheetSubject = null;
    if (pickedGroup) await loadEntries(pickedGroup.GroupID);
  }

  $: boardDays = [...$t.admin.scheduleWeekdays, ...$t.admin.scheduleWeekend];
  $: dayLabel = (w: number) => boardDays[w === 0 ? 6 : w - 1] ?? '';
  $: dayCol = (w: number) => WEEK_ORDER.indexOf(w) + 2;
  // Media-horas 07:00–14:00: la fila n empieza en 420+n*30.
  $: halfRows = Array.from({ length: 14 }, (_, i) => i);
  $: hours = [7, 8, 9, 10, 11, 12, 13];
  $: hourLabel = (h: number) => (h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`);
  $: rowOf = (min: number) => Math.round((min - 420) / 30) + 2;
  $: subjectOf = (id: string) => subjectsList.find((s) => s.ID === id);
  $: teacherName = (id: string) => {
    const found = teacherList.find((x) => x.ID === id);
    return found ? `${found.Surnames} ${found.Names}`.trim() : id.slice(0, 8);
  };

  async function loadGroups() {
    if (year === optionsYear) return;
    // Captura el año pedido: si el usuario cambia de año mientras el fetch
    // sigue en vuelo, la respuesta vieja se descarta y no pisa las opciones.
    const requested = year;
    loading = true;
    loadError = null;
    try {
      // guarded: 401 va a login y 403 a atras/home, igual que las demas
      // pantallas; un 404 sigue siendo lista vacia honesta.
      const data = await guarded(() => groupsByYear(requested));
      if (requested !== year) return;
      if (data === null) {
        salonOptions = [];
        groups = [];
        return;
      }
      salonOptions = data
        .map((g) => g.ClassLabel)
        .sort((a, b) => a.localeCompare(b, 'es'));
      groups = [...data].sort((a, b) => a.ClassLabel.localeCompare(b.ClassLabel, 'es'));
      if (!salon && salonOptions.length > 0) salon = salonOptions[0];
      // Solo se marca como cargado tras éxito: en error optionsYear queda
      // sin tocar para que el reintento no haga early-return.
      optionsYear = requested;
    } catch (err) {
      if (requested !== year) return;
      // Un 404 es lista vacía honesta; el resto se muestra con reintento.
      salonOptions = [];
      groups = [];
      if (!(err instanceof ApiError && isMissing(err))) loadError = err;
    } finally {
      if (requested === year) loading = false;
    }
  }

  function onSalonSelect(next: string) {
    salon = next;
  }

  function onYearSelect(next: string) {
    year = Number(next) || currentYear;
    void loadGroups();
  }

  async function loadCatalogs() {
    try {
      const [subs, teachersData] = await Promise.all([
        guarded(() => listSubjects()),
        guarded(() => teachers())
      ]);
      subjectsList = subs ?? [];
      teacherList = teachersData ?? [];
    } catch {
      subjectsList = [];
      teacherList = [];
    }
  }

  onMount(loadGroups);
  onMount(loadCatalogs);
</script>

<AdminShell active="horario" {year}>
  <TopBar title={$t.admin.scheduleTitle} showBack onBack={() => push('/admin')}><TopActions /></TopBar>

  <div class="pagehead">
    <p class="eyebrow">{$t.admin.consoleEyebrow}</p>
  </div>

  <div class="sheet">
  {#if loadError}
    <ErrorState error={loadError} onRetry={loadGroups} />
  {:else}
  <div class="pickers">
    <div class="pick">
      <Dropdown
        label={$t.admin.scheduleGroupLabel}
        value={salon}
        placeholder={$t.admin.scheduleGroupPlaceholder}
        searchable
        searchPlaceholder={$t.admin.scheduleGroupPlaceholder}
        options={salonOptions.map((option) => ({ value: option, label: option }))}
        on:select={(e) => onSalonSelect(e.detail)}
      />
    </div>
    <div class="pick">
      <Dropdown
        label={$t.admin.scheduleYearLabel}
        value={String(year)}
        options={yearOptions.map((option) => ({ value: String(option), label: String(option) }))}
        on:select={(e) => onYearSelect(e.detail)}
      />
    </div>
  </div>

  {#if !pickedGroup}
    <div class="overlay static">
      <Icon name="calendar" />
      <p>{$t.admin.scheduleEmpty} {$t.admin.scheduleEditHint}</p>
    </div>
  {:else}
    <div class="weekhead">
      <button type="button" class="add" on:click={() => openAdd()}>
        <Icon name="plus" /> {$t.admin.entryAdd}
      </button>
    </div>
    {#if entriesError}
      <ErrorState error={entriesError} onRetry={() => pickedGroup && loadEntries(pickedGroup.GroupID)} />
    {:else}
      <div class="gridwrap">
        <div class="grid" role="grid" tabindex={-1} aria-label={`${$t.admin.scheduleTitle} ${pickedGroup.ClassLabel} ${year}`} on:dragleave={() => (dropTarget = null)}>
          <div class="corner" aria-hidden="true"></div>
          {#each WEEK_ORDER as w}
            <div class="day" role="columnheader">{dayLabel(w)}</div>
          {/each}
          {#each hours as h}
            <div class="hour" style={`grid-row: ${(h - 7) * 2 + 2} / span 2`}>{hourLabel(h)}</div>
          {/each}
          {#each WEEK_ORDER as w}
            {#each halfRows as s}
              <button
                type="button"
                class="cell"
                class:droptarget={dropTarget?.day === w && dropTarget?.start === 420 + s * 30}
                style={`grid-column: ${dayCol(w)}; grid-row: ${s + 2};`}
                aria-label={`${dayLabel(w)} ${toClock(420 + s * 30)}`}
                on:click={() => openAdd(w, 420 + s * 30)}
                on:dragover={onDragOverCell}
                on:dragenter={() => onDragEnterCell(w, 420 + s * 30)}
                on:drop={(e) => onDropSubject(e, w, 420 + s * 30)}
              ></button>
            {/each}
          {/each}
          {#each entries as e (e.ID)}
            {@const subj = subjectOf(e.SubjectID)}
            <button
              type="button"
              class="block"
              style={`grid-column: ${dayCol(e.Weekday)}; grid-row: ${rowOf(e.Start)} / span ${Math.max(1, Math.round((e.End - e.Start) / 30))}; --block: ${subj?.Color || 'var(--muted)'};`}
              aria-label={`${subj?.Name ?? $t.common.noData} ${teacherName(e.TeacherID)} ${dayLabel(e.Weekday)} ${rangeLabel(e.Start, e.End)}`}
              on:click={() => openEdit(e)}
            >
              <strong>{subj?.Name ?? '—'}</strong>
              <small>{rangeLabel(e.Start, e.End)}</small>
              <small class="t">{teacherName(e.TeacherID)}</small>
            </button>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
  {/if}
  </div>

  <ScheduleEntrySheet
    open={sheetOpen}
    entry={editingEntry}
    groups={groups}
    subjects={subjectsList}
    teachers={teacherList}
    presetGroupID={pickedGroup?.GroupID ?? ''}
    presetSubjectID={sheetSubject ?? ''}
    presetWeekday={sheetDay}
    presetStartMin={sheetStart}
    contextEntries={entries}
    {fetchAssigned}
    {fetchTeacherEntries}
    onSaved={onSaved}
    onClose={() => (sheetOpen = false)}
  />

  <section class="subjects" aria-label={$t.subject.title}>
    <div class="subhead">
      <h2>{$t.subject.title}</h2>
      <span class="count" role="status">{$t.subject.countLabel(subjectsList.length)}</span>
      <button type="button" class="add small" on:click={openCreateSubject}>
        <Icon name="plus" /> {$t.subject.newAction}
      </button>
    </div>
    <p class="muted">{$t.schedule.subjectsHint}</p>
    {#if subjectsList.length === 0}
      <p class="muted">{$t.subject.emptyTitle}</p>
    {:else}
      <ul class="sublist">
        {#each subjectsList as s (s.ID)}
          <li
            class="sub"
            style={tint(s.Color ?? '')}
            draggable="true"
            on:dragstart={(e) => e.dataTransfer?.setData('text/subject-id', s.ID)}
            title={s.Description || s.Name}
          >
            <span class="subtext">
              <button type="button" class="subname" on:click={() => openEditSubject(s)} title={$t.subject.editTitle}>
                {s.Name}
              </button>
              {#if s.Description}<small>{s.Description}</small>{/if}
            </span>
            <button
              type="button"
              class="rm"
              aria-label={`${$t.subject.deleteAction}: ${s.Name}`}
              on:click={() => openDeleteSubject(s)}
            >
              ×
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <Sheet open={subjectSheet === 'create' || subjectSheet === 'edit'} title={subjectSheet === 'edit' ? $t.subject.editTitle : $t.subject.createTitle} onClose={() => (subjectSheet = 'closed')}>
    <form class="form" on:submit|preventDefault={saveSubject}>
      <label>
        <span>{$t.subject.nameLabel}</span>
        <input type="text" placeholder={$t.subject.namePlaceholder} bind:value={subjectForm.name} maxlength="80" />
      </label>
      <label>
        <span>{$t.subject.descriptionLabel}</span>
        <input type="text" placeholder={$t.subject.descriptionPlaceholder} bind:value={subjectForm.desc} maxlength="200" />
      </label>
      <span class="flabel">{$t.subject.colorLabel}</span>
      <div class="swatches" role="radiogroup" aria-label={$t.subject.colorLabel}>
        {#each COLOR_PRESETS as c (c)}
          <button
            type="button"
            class="sw"
            class:on={subjectForm.color === c}
            style={`background:${c}`}
            aria-label={c}
            aria-pressed={subjectForm.color === c}
            on:click={() => (subjectForm.color = c)}
          ></button>
        {/each}
        <label
          class="sw custom"
          class:on={subjectForm.color !== '' && !COLOR_PRESETS.includes(subjectForm.color)}
          style={subjectForm.color !== '' && !COLOR_PRESETS.includes(subjectForm.color) ? `background:${subjectForm.color}` : ''}
          title={$t.subject.colorCustomLabel}
        >
          <input
            type="color"
            aria-label={$t.subject.colorCustomLabel}
            value={/^#[0-9a-fA-F]{6}$/.test(subjectForm.color) ? subjectForm.color : '#7C3AED'}
            on:input={(e) => (subjectForm.color = (e.currentTarget as HTMLInputElement).value)}
          />
        </label>
      </div>
      <small class="muted">{$t.subject.colorCustomHint}</small>
      {#if subjectError}<p class="flash error" role="alert">{subjectError}</p>{/if}
      <div class="actions">
        <button type="button" class="mini" on:click={() => (subjectSheet = 'closed')}>{$t.common.cancel}</button>
        <button type="submit" class="mini primary" disabled={savingSubject}>
          {savingSubject ? $t.troll.saving : $t.common.save}
        </button>
      </div>
    </form>
  </Sheet>

  <Sheet open={subjectSheet === 'delete'} title={$t.subject.deleteTitle} onClose={() => (subjectSheet = 'closed')}>
    <p class="muted">{$t.subject.deleteBody(subjectForm.name)}</p>
    {#if subjectError}<p class="flash error" role="alert">{subjectError}</p>{/if}
    <div class="actions">
      <button type="button" class="mini" on:click={() => (subjectSheet = 'closed')}>{$t.common.cancel}</button>
      <button type="button" class="mini danger" disabled={savingSubject} on:click={confirmDeleteSubject}>
        {savingSubject ? $t.troll.saving : $t.subject.deleteAction}
      </button>
    </div>
  </Sheet>

  <Toast message={toast} onClose={() => (toast = '')} />
</AdminShell>

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
  .pickers {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 12px;
  }
  .pick {
    flex: 1 1 160px;
    max-width: 240px;
    min-width: 150px;
  }
  .weekhead {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
    margin-bottom: 8px;
  }
  .add {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    padding: 0 20px;
    border-radius: var(--radius-pill);
    background: var(--accent);
    color: #fff;
    font-weight: 800;
    font-size: 0.88rem;
    box-shadow: var(--shadow);
  }
  .add :global(svg) {
    width: 16px;
    height: 16px;
  }
  .add.small {
    min-height: 40px;
    padding: 0 16px;
    font-size: 0.82rem;
  }
  .count {
    background: var(--tint);
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 7px 16px;
    color: var(--ink-soft);
    font-size: 0.8rem;
    font-weight: 700;
    white-space: nowrap;
  }
  .muted {
    color: var(--muted);
    font-size: 0.85rem;
  }
  .subjects {
    margin-top: 20px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    padding: 16px;
  }
  .subhead {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .subhead h2 {
    font-size: 1.05rem;
    margin: 0;
    flex: 1;
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
    font-size: 0.85rem;
    font-weight: 600;
  }
  .form input[type='text'] {
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 10px 12px;
    min-height: 48px;
    font-size: 0.9rem;
    color: var(--ink);
  }
  .form input[type='text']:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .flabel {
    font-size: 0.85rem;
    font-weight: 600;
  }
  .swatches {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .sw {
    width: 36px;
    height: 36px;
    border-radius: 999px;
    border: 2px solid transparent;
  }
  .sw.on {
    border-color: var(--ink);
  }
  .sw.custom {
    position: relative;
    overflow: hidden;
    background: conic-gradient(#ef4444, #f59e0b, #10b981, #3b82f6, #8b5cf6, #ec4899, #ef4444);
    cursor: pointer;
  }
  .sw.custom input[type='color'] {
    position: absolute;
    inset: -8px;
    width: auto;
    height: auto;
    opacity: 0;
    cursor: pointer;
    border: none;
    padding: 0;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }
  .mini.danger {
    background: var(--g-grave-ink);
    border-color: transparent;
    color: #fff;
  }
  .flash.error {
    border-radius: var(--radius);
    padding: 10px 12px;
    font-size: 0.85rem;
    margin: 0;
    background: var(--chip-pink-bg);
    color: var(--g-grave-ink);
    font-weight: 600;
  }
  .sublist {
    list-style: none;
    margin: 12px 0 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 8px;
  }
  .sub {
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 10px 12px;
    cursor: grab;
  }
  .sub:active {
    cursor: grabbing;
  }
  .subtext {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .subname {
    font-size: 0.9rem;
    font-weight: 700;
    text-align: left;
    padding: 0;
    color: var(--ink);
  }
  .subtext small {
    color: var(--muted);
    font-size: 0.75rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rm {
    flex: none;
    width: 32px;
    height: 32px;
    border-radius: 999px;
    color: var(--muted);
    font-size: 1.1rem;
    font-weight: 700;
  }
  .rm:hover {
    color: var(--g-grave-ink);
    background: var(--chip-pink-bg);
  }
  .mini {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 36px;
    padding: 0 14px;
    border-radius: var(--radius-pill);
    border: 1px solid var(--line);
    background: var(--surface);
    font-weight: 600;
    font-size: 0.8rem;
    color: var(--muted);
    white-space: nowrap;
  }
  .mini:hover {
    color: var(--ink);
  }
  .mini.primary {
    background: var(--accent);
    border-color: transparent;
    color: #fff;
  }
  .mini.primary:hover {
    color: #fff;
  }
  .mini :global(svg) {
    width: 15px;
    height: 15px;
  }
  .gridwrap {
    overflow-x: auto;
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    background: var(--card);
    box-shadow: var(--shadow);
  }
  .grid {
    display: grid;
    grid-template-columns: 56px repeat(7, minmax(104px, 1fr));
    grid-template-rows: auto repeat(14, 28px);
    column-gap: 10px;
    row-gap: 6px;
    padding: 12px;
    min-width: 680px;
  }
  .grid:focus {
    outline: none;
  }
  .corner {
    grid-column: 1;
    grid-row: 1;
  }
  .day {
    text-align: center;
    font-weight: 700;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
    padding: 4px 0 8px;
    margin-bottom: 2px;
    border-bottom: 2px solid var(--line);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .hour {
    grid-column: 1;
    color: var(--muted);
    font-size: 0.72rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    display: flex;
    align-items: flex-start;
    justify-content: flex-end;
    padding: 2px 6px 0 0;
  }
  .cell {
    border-radius: 8px;
    background: var(--surface-2);
    border: 1px dashed var(--line);
    min-height: 0;
  }
  .cell:hover {
    border-color: var(--grid);
    background: var(--tint);
  }
  .cell.droptarget {
    background: var(--accent-soft);
    border: 2px solid var(--accent);
  }
  .block {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 1px;
    text-align: left;
    min-height: 0;
    overflow: hidden;
    padding: 4px 8px 4px 10px;
    border-radius: 10px;
    border: 1px solid var(--line);
    border-left: 5px solid var(--block);
    background: color-mix(in srgb, var(--block) 16%, var(--card));
  }
  .block:active {
    transform: scale(0.99);
  }
  .block strong {
    font-size: 0.8rem;
    line-height: 1.1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
  .block small {
    font-size: 0.68rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .block small.t {
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
  .overlay.static {
    position: static;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    text-align: center;
    background: var(--surface-2);
    border-radius: var(--radius-chip);
    padding: 24px;
    color: var(--muted);
  }
  .overlay.static p {
    max-width: 38ch;
    font-size: 0.92rem;
    font-weight: 600;
  }
  .overlay.static :global(svg) {
    width: 28px;
    height: 28px;
    color: var(--accent);
  }
</style>
