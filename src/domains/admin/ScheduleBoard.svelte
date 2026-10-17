<script lang="ts">
  import { push } from 'svelte-spa-router';
  import { t } from '$lib/i18n';
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import AdminShell from './AdminShell.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ErrorState from '$lib/ui/ErrorState.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Dropdown from '$lib/ui/Dropdown.svelte';
  import { onMount } from 'svelte';
  import { groupsByYear, listSubjects, teachers, subjectAssignments, scheduleEntries } from './api';
  import type { YearGroup, Subject, TeacherSummary, ScheduleEntry } from './api';
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
    const timeline = (await guarded(() => subjectAssignments(subjectID))) ?? [];
    return timeline.filter((a) => !a.EndedAt || a.EndedAt.startsWith('0001')).map((a) => a.TeacherID);
  }

  async function fetchTeacherEntries(teacherID: string): Promise<ScheduleEntry[]> {
    return (await guarded(() => scheduleEntries({ teacherID }))) ?? [];
  }

  function openAdd(day: number | null = null, startMin: number | null = null) {
    editingEntry = null;
    sheetDay = day;
    // La última media hora no cabe en 1 h: arranca una hora antes del cierre.
    sheetStart =
      startMin !== null && startMin + MIN_DURATION_MIN > SCHOOL_END_MIN
        ? SCHOOL_END_MIN - MIN_DURATION_MIN
        : startMin;
    sheetOpen = true;
  }

  function openEdit(e: ScheduleEntry) {
    editingEntry = e;
    sheetDay = null;
    sheetOpen = true;
  }

  async function onSaved() {
    sheetOpen = false;
    editingEntry = null;
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
    <Dropdown
      label={$t.admin.scheduleGroupLabel}
      value={salon}
      placeholder={$t.admin.scheduleGroupPlaceholder}
      searchable
      searchPlaceholder={$t.admin.scheduleGroupPlaceholder}
      options={salonOptions.map((option) => ({ value: option, label: option }))}
      on:select={(e) => onSalonSelect(e.detail)}
    />
    <Dropdown
      label={$t.admin.scheduleYearLabel}
      value={String(year)}
      options={yearOptions.map((option) => ({ value: String(option), label: String(option) }))}
      on:select={(e) => onYearSelect(e.detail)}
    />
  </div>

  {#if !pickedGroup}
    <div class="overlay static">
      <Icon name="calendar" />
      <p>{$t.admin.scheduleEmpty} {$t.admin.scheduleEditHint}</p>
    </div>
  {:else}
    <div class="weekhead">
      <h2>{pickedGroup.ClassLabel} · {year}</h2>
      <button type="button" class="mini" on:click={() => openAdd()}>
        <Icon name="check" /> {$t.admin.entryAdd}
      </button>
    </div>
    {#if entriesError}
      <ErrorState error={entriesError} onRetry={() => pickedGroup && loadEntries(pickedGroup.GroupID)} />
    {:else}
      <div class="gridwrap">
        <div class="grid" role="grid" aria-label={`${$t.admin.scheduleTitle} ${pickedGroup.ClassLabel} ${year}`}>
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
                style={`grid-column: ${dayCol(w)}; grid-row: ${s + 2};`}
                aria-label={`${dayLabel(w)} ${toClock(420 + s * 30)}`}
                on:click={() => openAdd(w, 420 + s * 30)}
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
    presetWeekday={sheetDay}
    presetStartMin={sheetStart}
    contextEntries={entries}
    {fetchAssigned}
    {fetchTeacherEntries}
    onSaved={onSaved}
    onClose={() => (sheetOpen = false)}
  />

  <EmptyState
    icon="book"
    title={$t.admin.scheduleManualTitle}
    body={$t.admin.scheduleManualBody}
  />

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
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 12px;
  }
  .weekhead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 8px;
  }
  .weekhead h2 {
    font-size: 1.05rem;
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
    grid-template-rows: auto repeat(14, 32px);
    gap: 4px;
    padding: 12px;
    min-width: 680px;
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
    padding: 4px 0;
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
    border: 1px dashed transparent;
    min-height: 0;
  }
  .cell:hover {
    border-color: var(--line);
    background: var(--tint);
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
