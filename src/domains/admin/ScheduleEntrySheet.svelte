<script lang="ts">
  import { t } from '$lib/i18n';
  import Sheet from '$lib/ui/Sheet.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Dropdown from '$lib/ui/Dropdown.svelte';
  import {
    createEntry,
    updateEntry,
    deleteEntry,
    type ScheduleEntry,
    type YearGroup,
    type Subject,
    type TeacherSummary
  } from './api';
  import {
    SCHOOL_START_MIN,
    SCHOOL_END_MIN,
    MIN_DURATION_MIN,
    STEP_MIN,
    WEEK_ORDER,
    overlaps,
    toClock,
    toMinutes,
    rangeLabel,
    clampDuration
  } from '$lib/schedule';
  import { ApiError } from '$lib/api/types';

  // Editor único del horario: lo abren el tablero (por salón) y la ficha
  // del docente (por profesor). Una sola vía de edición = ambas vistas
  // siempre coinciden. El servidor es autoridad (409); aquí solo
  // pre-chequeo instantáneo + confirmación explícita.
  export let open: boolean;
  export let entry: ScheduleEntry | null = null;
  export let groups: YearGroup[] = [];
  export let subjects: Subject[] = [];
  export let teachers: TeacherSummary[] = [];
  export let presetGroupID = '';
  export let presetTeacherID = '';
  export let presetSubjectID = '';
  export let presetWeekday: number | null = null;
  export let presetStartMin: number | null = null;
  export let contextEntries: ScheduleEntry[] = [];
  export let fetchAssigned: (subjectID: string) => Promise<string[]> = async () => [];
  export let fetchTeacherEntries: (teacherID: string) => Promise<ScheduleEntry[]> = async () => [];
  export let onSaved: () => void = () => {};
  export let onClose: () => void = () => {};
  // Vista previa en vivo para el fantasma del tablero: materia, día,
  // inicio y duración actuales del formulario.
  export let onPreview:
    | ((p: { subjectID: string; weekday: number; startMin: number; durationMin: number }) => void)
    | null = null;

  $: if (open && onPreview && startValid) {
    onPreview({ subjectID, weekday, startMin, durationMin });
  }

  let phase: 'edit' | 'confirm' | 'delete' = 'edit';
  // Estado inicial en la declaración: la instancia se remonta en cada
  // apertura, así el primer render ya trae los presets finales y ningún
  // reactivo corre jamás con valores por defecto.
  let groupID = entry?.ClassGroupID ?? presetGroupID;
  let subjectID = entry?.SubjectID ?? presetSubjectID;
  let teacherID = entry?.TeacherID ?? presetTeacherID;
  let weekday = entry?.Weekday ?? presetWeekday ?? 1;
  let start = toClock(entry?.Start ?? presetStartMin ?? SCHOOL_START_MIN);
  let durationMin = clampDuration(
    toMinutes(start) || SCHOOL_START_MIN,
    entry ? entry.End - entry.Start : MIN_DURATION_MIN
  );
  let error = '';
  let saving = false;
  let assignedCache: Record<string, string[]> = {};
  let assignedIDs: string[] = [];
  let teacherEntries: ScheduleEntry[] = [];
  void loadAssigned();

  $: editingId = entry?.ID ?? null;
  $: groupLocked = !entry && presetGroupID !== '' && groups.some((g) => g.GroupID === presetGroupID);

  async function loadAssigned() {
    if (!subjectID) {
      assignedIDs = [];
      return;
    }
    if (assignedCache[subjectID]) {
      assignedIDs = assignedCache[subjectID];
      return;
    }
    const want = subjectID;
    try {
      const ids = await fetchAssigned(want);
      assignedCache[want] = ids;
      if (subjectID === want) assignedIDs = ids;
    } catch {
      if (subjectID === want) assignedIDs = [];
    }
  }

  $: if (subjectID !== undefined) void loadAssigned();
  $: if (teacherID !== undefined) void loadTeacherEntries();

  async function loadTeacherEntries() {
    // La otra mitad del pre-chequeo: el docente puede chocar en otro
    // salón, fuera de las entries del contexto. El servidor decide (409).
    if (!teacherID) {
      teacherEntries = [];
      return;
    }
    const want = teacherID;
    try {
      const list = await fetchTeacherEntries(want);
      if (teacherID === want) teacherEntries = list;
    } catch {
      if (teacherID === want) teacherEntries = [];
    }
  }

  $: startMin = toMinutes(start);
  $: startValid = Number.isFinite(startMin) && startMin >= SCHOOL_START_MIN && startMin < SCHOOL_END_MIN;
  $: endMin = startValid ? startMin + durationMin : NaN;
  $: formValid =
    groupID !== '' &&
    subjectID !== '' &&
    teacherID !== '' &&
    startValid &&
    durationMin >= MIN_DURATION_MIN &&
    endMin <= SCHOOL_END_MIN;

  $: slot = { Weekday: weekday, Start: startValid ? startMin : 0, End: startValid ? startMin + durationMin : 0 };
  $: allContext = (() => {
    const map = new Map<string, ScheduleEntry>();
    for (const e of [...contextEntries, ...teacherEntries]) {
      if (!map.has(e.ID)) map.set(e.ID, e);
    }
    return [...map.values()];
  })();
  $: collisions = formValid
    ? allContext.filter((e) => e.ID !== editingId && overlaps(slot, e))
    : [];
  $: teacherClashes = collisions.filter((e) => e.TeacherID === teacherID);
  $: groupClashes = collisions.filter((e) => e.ClassGroupID === groupID);
  $: unassigned = subjectID !== '' && teacherID !== '' && !assignedIDs.includes(teacherID);

  $: groupLabel = (id: string) => groups.find((g) => g.GroupID === id)?.ClassLabel ?? id.slice(0, 8);
  $: dayLabel = (w: number) => dayNames[w === 0 ? 6 : w - 1] ?? '';
  $: dayNames = [...$t.admin.scheduleWeekdays, ...$t.admin.scheduleWeekend];
  $: subjectOf = (id: string) => subjects.find((s) => s.ID === id);
  $: teacherName = (id: string) => {
    const found = teachers.find((x) => x.ID === id);
    return found ? `${found.Surnames} ${found.Names}`.trim() : id.slice(0, 8);
  };

  function bumpDuration(delta: number) {
    const base = Number.isFinite(startMin) ? startMin : SCHOOL_START_MIN;
    durationMin = clampDuration(base, durationMin + delta);
  }

  function askConfirm() {
    error = '';
    if (!formValid) {
      error = $t.admin.entryInvalid;
      return;
    }
    phase = 'confirm';
  }

  async function save() {
    saving = true;
    error = '';
    const input = {
      classGroupID: groupID,
      teacherID,
      subjectID,
      weekday,
      start: toClock(startMin),
      end: toClock(endMin)
    };
    try {
      if (editingId) await updateEntry(editingId, input);
      else await createEntry(input);
      onSaved();
    } catch (err) {
      error = err instanceof ApiError ? err.message : $t.common.loadError;
      phase = 'edit';
    } finally {
      saving = false;
    }
  }

  async function remove() {
    if (!editingId || saving) return;
    saving = true;
    error = '';
    try {
      await deleteEntry(editingId);
      onSaved();
    } catch (err) {
      error = err instanceof ApiError ? err.message : $t.common.loadError;
      phase = 'edit';
    } finally {
      saving = false;
    }
  }
</script>

<Sheet
  open={open}
  title={entry ? $t.admin.entryEditTitle : $t.admin.entryAddTitle}
  onClose={() => {
    phase = 'edit';
    onClose();
  }}
>
  {#if phase === 'delete'}
    <p class="muted">{$t.admin.deleteEntryBody}</p>
    {#if error}<p class="flash error" role="alert">{error}</p>{/if}
    <div class="actions">
      <button class="ghost" type="button" on:click={() => (phase = 'edit')}>{$t.common.cancel}</button>
      <button class="primary danger" type="button" on:click={remove} disabled={saving}>
        {$t.admin.deleteEntry}
      </button>
    </div>
  {:else if phase === 'confirm'}
    <ul class="summary">
      <li><strong>{subjectOf(subjectID)?.Name}</strong> <span class="dot" style={`background:${subjectOf(subjectID)?.Color || 'var(--muted)'}`}></span></li>
      <li>{teacherName(teacherID)} · {groupLabel(groupID)}</li>
      <li>{dayLabel(weekday)} · {rangeLabel(startMin, endMin)}</li>
    </ul>
    {#if teacherClashes.length > 0 || groupClashes.length > 0}
      <div class="warns" role="alert">
        <p class="warn-title">{$t.admin.conflictTitle}</p>
        {#each teacherClashes as c (c.ID)}
          <p>{$t.admin.conflictTeacher}: {subjectOf(c.SubjectID)?.Name} · {groupLabel(c.ClassGroupID)} · {dayLabel(c.Weekday)} {rangeLabel(c.Start, c.End)}</p>
        {/each}
        {#each groupClashes as c (c.ID)}
          <p>{$t.admin.conflictGroup}: {subjectOf(c.SubjectID)?.Name} · {teacherName(c.TeacherID)} · {dayLabel(c.Weekday)} {rangeLabel(c.Start, c.End)}</p>
        {/each}
      </div>
    {/if}
    {#if error}<p class="flash error" role="alert">{error}</p>{/if}
    <div class="actions">
      <button class="ghost" type="button" on:click={() => (phase = 'edit')}>{$t.admin.backToEdit}</button>
      <button class="primary" type="button" on:click={save} disabled={saving}>
        {saving ? $t.common.retrying : $t.admin.confirmAction}
      </button>
    </div>
  {:else}
    <div class="form">
      {#if groupLocked}
        <div class="locked">
          <span class="cap">{$t.admin.entryGroup}</span>
          <span class="lockval">{groupLabel(groupID)}</span>
        </div>
      {:else}
        <Dropdown
          label={$t.admin.entryGroup}
          value={groupID}
          options={[{ value: '', label: '—' }, ...groups.map((g) => ({ value: g.GroupID, label: g.ClassLabel }))]}
        on:select={(e) => (groupID = e.detail)}
      />
      {/if}
      <Dropdown
        label={$t.admin.entrySubject}
        value={subjectID}
        options={[{ value: '', label: '—' }, ...subjects
          .filter((s) => s.Active)
          .map((s) => ({ value: s.ID, label: s.Name }))]}
        on:select={(e) => (subjectID = e.detail)}
      />
      <Dropdown
        label={$t.admin.entryTeacher}
        value={teacherID}
        searchable
        searchPlaceholder={$t.admin.entryTeacher}
        options={[{ value: '', label: '—' }, ...teachers.map((teacher) => ({
          value: teacher.ID,
          label: `${teacher.Surnames} ${teacher.Names}`.trim()
        }))]}
        on:select={(e) => (teacherID = e.detail)}
      />
      {#if unassigned}
        <p class="hint">{$t.admin.unassignedWarn}</p>
      {/if}
      <div class="row2">
        <Dropdown
          label={$t.admin.entryDay}
          value={String(weekday)}
          options={WEEK_ORDER.map((w) => ({ value: String(w), label: dayLabel(w) }))}
          on:select={(e) => (weekday = Number(e.detail))}
        />
        <label>
          {$t.admin.entryStart}
          <input
            type="time"
            bind:value={start}
            min={toClock(SCHOOL_START_MIN)}
            max={toClock(SCHOOL_END_MIN)}
            step={STEP_MIN * 60}
          />
        </label>
      </div>
      <div class="dur">
        <span>{$t.admin.entryDuration}</span>
        <div class="stepper">
          <button type="button" aria-label="−30 min" on:click={() => bumpDuration(-STEP_MIN)}>−</button>
          <strong>{$t.admin.durationLabel(durationMin)}</strong>
          <button type="button" aria-label="+30 min" on:click={() => bumpDuration(STEP_MIN)}>+</button>
        </div>
        {#if startValid}<small class="hint">{$t.admin.entryEnd(toClock(endMin))}</small>{/if}
      </div>
      {#if error}<p class="flash error" role="alert">{error}</p>{/if}
      <div class="actions">
        {#if entry}
          <button type="button" class="ghost danger" on:click={() => { error = ''; phase = 'delete'; }}>
            {$t.admin.deleteEntry}
          </button>
        {/if}
        <span class="sp"></span>
        <button class="primary" type="button" on:click={askConfirm}>{$t.common.save}</button>
      </div>
    </div>
  {/if}
</Sheet>

<style>
  .muted {
    color: var(--muted);
    font-size: 0.9rem;
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
  .form input {
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 10px 12px;
    font-size: 0.92rem;
    width: 100%;
    font: inherit;
    color: var(--ink);
    min-height: 48px;
  }
  .row2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .dur {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 0.82rem;
    font-weight: 600;
  }
  .stepper {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .stepper button {
    width: 46px;
    height: 46px;
    border-radius: var(--radius-pill);
    border: 1px solid var(--line);
    background: var(--surface-2);
    font-size: 1.2rem;
    font-weight: 700;
    color: var(--ink);
  }
  .stepper button:active {
    transform: scale(0.94);
  }
  .stepper strong {
    min-width: 90px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .hint {
    color: var(--muted);
    font-size: 0.78rem;
    font-weight: 500;
  }
  .locked {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .locked .cap {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--muted);
  }
  .lockval {
    min-height: 48px;
    display: flex;
    align-items: center;
    padding: 0 14px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    font-weight: 700;
    font-size: 0.92rem;
  }
  .summary {
    list-style: none;
    margin: 0 0 12px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 0.95rem;
  }
  .summary li:first-child {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 1.05rem;
  }
  .dot {
    width: 14px;
    height: 14px;
    border-radius: 999px;
    border: 1px solid var(--line);
    display: inline-block;
  }
  .warns {
    background: var(--chip-pink-bg);
    color: var(--chip-pink-ink);
    border-radius: var(--radius-chip);
    padding: 10px 14px;
    font-size: 0.85rem;
    margin-bottom: 10px;
  }
  .warn-title {
    font-weight: 700;
    margin-bottom: 4px;
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
    align-items: center;
    gap: 10px;
    margin-top: 6px;
  }
  .sp {
    flex: 1;
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
  .ghost.danger {
    color: var(--g-grave-ink);
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
