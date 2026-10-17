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
  import { WEEK_ORDER, rangeLabel } from '$lib/schedule';
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

  function openAdd(day: number | null = null) {
    editingEntry = null;
    sheetDay = day;
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
  $: entriesByDay = (w: number) =>
    entries
      .filter((e) => e.Weekday === w)
      .sort((a, b) => a.Start - b.Start || a.End - b.End);
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
    {:else if entries.length === 0}
      <EmptyState icon="calendar" title={$t.admin.boardEmptyTitle} body={$t.admin.boardEmptyBody} />
    {:else}
      <div class="week">
        {#each WEEK_ORDER as w}
          {@const dayEntries = entriesByDay(w)}
          {#if dayEntries.length > 0}
            <section class="daycol" aria-label={dayLabel(w)}>
              <h3>{dayLabel(w)}</h3>
              <ul>
                {#each dayEntries as e (e.ID)}
                  <li>
                    <button type="button" class="slot" on:click={() => openEdit(e)}>
                      <span class="dot" style={`background:${subjectOf(e.SubjectID)?.Color || 'var(--muted)'}`}></span>
                      <span class="slotmain">
                        <strong>{subjectOf(e.SubjectID)?.Name ?? $t.common.noData}</strong>
                        <small>{teacherName(e.TeacherID)}</small>
                      </span>
                      <span class="time">{rangeLabel(e.Start, e.End)}</span>
                    </button>
                  </li>
                {/each}
              </ul>
            </section>
          {/if}
        {/each}
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
  .week {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .daycol h3 {
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
    margin-bottom: 6px;
  }
  .daycol ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .slot {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    text-align: left;
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 10px 14px;
    min-height: 56px;
  }
  .slot:active {
    transform: scale(0.99);
  }
  .dot {
    flex: none;
    width: 14px;
    height: 14px;
    border-radius: 999px;
    border: 1px solid var(--line);
  }
  .slotmain {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .slotmain strong {
    font-size: 0.9rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .slotmain small {
    color: var(--muted);
    font-size: 0.76rem;
  }
  .time {
    flex: none;
    font-size: 0.8rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--ink-soft);
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
