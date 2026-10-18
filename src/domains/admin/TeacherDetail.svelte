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
  import AdminShell from './AdminShell.svelte';
  import { paletteFor } from '$lib/ui/palette';
  import {
    teacherDetail,
    subjects,
    subjectAssignments,
    teacherHistory,
    teachers,
    scheduleEntries,
    groupsByYear,
    updateTeacher,
    type TeacherDetail,
    type Subject,
    type SubjectAssignment,
    type ScheduleEntry,
    type TeacherSummary,
    type YearGroup,
    type TeacherHistory,
  } from './api';
  import ScheduleEntrySheet from './ScheduleEntrySheet.svelte';
  import { WEEK_ORDER, rangeLabel } from '$lib/schedule';
  import { isMissing } from '../teacher/api';
  import { ApiError } from '$lib/api/types';
  import { guarded } from '$lib/nav';

  export let params: { id?: string } = {};
  $: id = decodeURIComponent(params.id ?? '');

  let state: 'loading' | 'error' | 'ready' = 'loading';
  let detail: TeacherDetail | null = null;
  let loadError: unknown = null;
  const currentYear = new Date().getFullYear();

  // Attendance record: month grid with summary counts.
  let hist: TeacherHistory | null = null;
  let monthCursor = monthStart(new Date());

  function monthStart(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }
  function monthLabel(d: Date): string {
    return d.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  }
  function shiftMonth(delta: number) {
    monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + delta, 1);
    void loadHistory();
  }
  function monthRange(d: Date): { from: string; to: string } {
    const pad = (n: number) => String(n).padStart(2, '0');
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return {
      from: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`,
      to: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`
    };
  }

  $: histByDay = new Map((hist?.Marks ?? []).map((m) => [m.Day.slice(0, 10), m]));
  $: monthCells = (() => {
    const y = monthCursor.getFullYear();
    const m = monthCursor.getMonth();
    // es-CO weeks start Monday.
    const lead = (new Date(y, m, 1).getDay() + 6) % 7;
    const days = new Date(y, m + 1, 0).getDate();
    return { lead, days };
  })();

  async function loadHistory() {
    try {
      const r = monthRange(monthCursor);
      hist = await guarded(() => teacherHistory(id, r.from, r.to));
    } catch {
      hist = null;
    }
  }

  async function load() {
    state = 'loading';
    loadError = null;
    try {
      const data = await guarded(() => teacherDetail(id));
      if (data === null) {
        state = 'error';
        return;
      }
      // Subjects/Groups come from their own endpoints (/v1/subjects,
      // /v1/teachers/{id}/assignments): the backend profile carries
      // neither, so both load independently below.
      detail = { ...data, Subjects: data.Subjects ?? [], Groups: data.Groups ?? [] };
      state = 'ready';
    } catch (err) {
      loadError = err;
      state = err instanceof ApiError && isMissing(err) ? 'ready' : 'error';
      return;
    }
    // Las clases del horario no bloquean la ficha: si fallan,
    // las tarjetas pintan vacío honesto.
    void loadClasses();
    void loadHistory();
  }

  let teacherEntries: ScheduleEntry[] = [];
  let groupsAll: YearGroup[] = [];
  let sheetTeachers: TeacherSummary[] = [];
  let classSheetOpen = false;
  let editingEntry: ScheduleEntry | null = null;

  async function loadClasses() {
    try {
      const [entries, fetchedGroups, fetchedTeachers, subs] = await Promise.all([
        guarded(() => scheduleEntries({ teacherID: id })),
        guarded(() => groupsByYear(currentYear)),
        guarded(() => teachers()),
        guarded(() => subjects())
      ]);
      teacherEntries = (entries ?? []).sort(
        (a, b) => a.Weekday - b.Weekday || a.Start - b.Start
      );
      groupsAll = fetchedGroups ?? [];
      sheetTeachers = fetchedTeachers ?? [];
      catalog = subs ?? catalog;
    } catch {
      teacherEntries = [];
    }
  }

  async function fetchAssigned(subjectID: string): Promise<string[]> {
    try {
      const timeline = await subjectAssignments(subjectID);
      return timeline.filter((a) => !a.EndedAt || a.EndedAt.startsWith('0001')).map((a) => a.TeacherID);
    } catch {
      return [];
    }
  }

  async function fetchTeacherEntries(): Promise<ScheduleEntry[]> {
    return teacherEntries;
  }

  $: classDayNames = [...$t.admin.scheduleWeekdays, ...$t.admin.scheduleWeekend];
  $: classDayLabel = (w: number) => classDayNames[w === 0 ? 6 : w - 1] ?? '';
  $: classGroupLabel = (gid: string) =>
    groupsAll.find((g) => g.GroupID === gid)?.ClassLabel ?? gid.slice(0, 8);
  $: subjectMeta = (sid: string) => {
    const s = catalog.find((x) => x.ID === sid);
    return { name: s?.Name ?? sid.slice(0, 8), color: s?.Color || 'var(--muted)' };
  };

  $: derivedSubjects = (() => {
    const seen = new Map<string, { id: string; name: string; color: string }>();
    for (const e of teacherEntries) {
      if (!seen.has(e.SubjectID)) {
        const meta = subjectMeta(e.SubjectID);
        seen.set(e.SubjectID, { id: e.SubjectID, name: meta.name, color: meta.color });
      }
    }
    return [...seen.values()];
  })();

  function tint(color: string): string {
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) return '';
    return `background:${color}1A;border-color:${color}59`;
  }
  $: derivedGroups = (() => {
    const seen = new Map<string, string>();
    for (const e of teacherEntries) {
      if (!seen.has(e.ClassGroupID)) seen.set(e.ClassGroupID, classGroupLabel(e.ClassGroupID));
    }
    return [...seen.entries()].map(([id, label]) => ({ id, label }));
  })();

  let catalog: Subject[] = [];

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
    if (!detail || saving) return;
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
      // Sin optimismo: la ficha solo cambia con lo que el servidor confirma.
      // Si falla, detail queda intacto y el error se muestra en el formulario.
      const updated = await updateTeacher(id, form);
      detail = {
        ...detail,
        ...updated,
        Subjects: updated.Subjects ?? detail.Subjects,
        Groups: updated.Groups ?? detail.Groups
      };
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
  let toggling = false;
  async function toggleActive() {
    if (!detail || toggling) return;
    const next = !detail.Active;
    editFeedback = '';
    toggling = true;
    try {
      const updated = await updateTeacher(id, { Active: next });
      detail = { ...detail, Active: updated.Active };
      editFeedback = next ? $t.teacherDetail.reactivated : $t.teacherDetail.retired;
    } catch (err) {
      editFeedback = err instanceof ApiError ? err.message : $t.common.loadError;
    } finally {
      toggling = false;
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
        <button type="button" class="mini" on:click={toggleActive} disabled={toggling}>
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

    <section class="card" aria-label={$t.troll.historyTitle}>
      <div class="row-head">
        <h2>{$t.troll.historyTitle}</h2>
        <div class="stepper">
          <button type="button" class="mini" on:click={() => shiftMonth(-1)} aria-label="Mes anterior">‹</button>
          <strong>{monthLabel(monthCursor)}</strong>
          <button type="button" class="mini" on:click={() => shiftMonth(1)} aria-label="Mes siguiente">›</button>
        </div>
      </div>
      {#if hist}
        <div class="kpis">
          <div class="kpi"><small>{$t.troll.presentCount}</small><strong>{hist.Summary.Present}</strong></div>
          <div class="kpi"><small>{$t.troll.absentCount}</small><strong>{hist.Summary.Absent}</strong></div>
          <div class="kpi"><small>{$t.troll.lateCount}</small><strong>{hist.Summary.Late}</strong></div>
        </div>
        {#if hist.Marks.length === 0}
          <p class="muted">{$t.troll.historyEmpty}</p>
        {:else}
          <div class="cal" role="grid" aria-label={monthLabel(monthCursor)}>
            {#each ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'] as wd}
              <span class="wd">{wd}</span>
            {/each}
            {#each Array(monthCells.lead) as _}
              <span class="pad"></span>
            {/each}
            {#each Array(monthCells.days) as _, i}
              {@const key = `${monthCursor.getFullYear()}-${String(monthCursor.getMonth() + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`}
              {@const mark = histByDay.get(key)}
              <span
                class="day"
                class:present={mark?.Status === 'present'}
                class:absent={mark?.Status === 'absent'}
                class:late={mark?.Status === 'late'}
                title={mark ? `${key}${mark.Note ? ` — ${mark.Note}` : ''}` : `${key} · ${$t.troll.legendNone}`}
              >
                {i + 1}
              </span>
            {/each}
          </div>
          <div class="legend">
            <span class="lg present">{$t.troll.legendPresent}</span>
            <span class="lg absent">{$t.troll.legendAbsent}</span>
            <span class="lg late">{$t.troll.legendLate}</span>
            <span class="lg">{$t.troll.legendNone}</span>
          </div>
        {/if}
      {:else}
        <p class="muted">{$t.troll.historyEmpty}</p>
      {/if}
    </section>

    <section class="card" aria-label={$t.admin.subjectsTitle}>
      <div class="row-head">
        <h2>{$t.admin.subjectsTitle}</h2>
      </div>
      {#if derivedSubjects.length === 0}
        <p class="muted">{$t.admin.noSubjects}</p>
      {:else}
        <div class="chips">
          {#each derivedSubjects as s (s.id)}
            <span class={`chip chip-${paletteFor(s.id)}`} style={tint(s.color)}>{s.name}</span>
          {/each}
        </div>
      {/if}
      <p class="muted">{$t.admin.subjectsFromSchedule}</p>
    </section>

    <section class="card" aria-label={$t.admin.groupsTitle}>
      <h2>{$t.admin.groupsTitle}</h2>
      {#if derivedGroups.length === 0}
        <p class="muted">{$t.admin.noGroups}</p>
      {:else}
        <ul class="groups">
          {#each derivedGroups as g (g.id)}
            <li>
              <strong>{g.label}</strong>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="card" aria-label={$t.admin.teacherClassesTitle}>
      <div class="row-head">
        <h2>{$t.admin.teacherClassesTitle}</h2>
        <button
          type="button"
          class="mini"
          on:click={() => {
            editingEntry = null;
            classSheetOpen = true;
          }}
        >
          {$t.admin.entryAdd}
        </button>
      </div>
      {#if teacherEntries.length === 0}
        <EmptyState icon="calendar" title={$t.admin.noClassesTitle} body={$t.admin.noClassesBody} />
      {:else}
        <ul class="classes">
          {#each teacherEntries as e (e.ID)}
            <li>
              <button
                type="button"
                class="cls"
                on:click={() => {
                  editingEntry = e;
                  classSheetOpen = true;
                }}
              >
                <span class="dot" style={`background:${subjectMeta(e.SubjectID).color}`}></span>
                <span class="clsmain">
                  <strong>{subjectMeta(e.SubjectID).name}</strong>
                  <small>{classGroupLabel(e.ClassGroupID)} · {classDayLabel(e.Weekday)}</small>
                </span>
                <span class="time">{rangeLabel(e.Start, e.End)}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}
  </div>
</AdminShell>

<!-- Mismo editor que el tablero: una sola vía para que ambas vistas coincidan. -->
<ScheduleEntrySheet
  open={classSheetOpen}
  entry={editingEntry}
  groups={groupsAll}
  subjects={catalog}
  teachers={sheetTeachers}
  presetTeacherID={id}
  contextEntries={teacherEntries}
  {fetchAssigned}
  {fetchTeacherEntries}
  onSaved={() => {
    classSheetOpen = false;
    editingEntry = null;
    void loadClasses();
  }}
  onClose={() => (classSheetOpen = false)}
/>

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
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 8px;
  }
  .stepper {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .stepper strong {
    min-width: 130px;
    text-align: center;
    text-transform: capitalize;
    font-size: 0.9rem;
  }
  .kpis {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin: 8px 0 12px;
  }
  .kpi {
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
  }
  .kpi small {
    color: var(--muted);
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .kpi strong {
    font-size: 1.3rem;
    font-variant-numeric: tabular-nums;
  }
  .cal {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 4px;
    max-width: 560px;
  }
  .wd {
    text-align: center;
    color: var(--muted);
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
  }
  .day {
    aspect-ratio: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    border: 1px solid var(--line);
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--muted);
    background: var(--surface-2);
  }
  .day.present {
    background: var(--chip-green-bg);
    border-color: transparent;
    color: var(--chip-green-ink);
    font-weight: 800;
  }
  .day.absent {
    background: var(--chip-pink-bg);
    border-color: transparent;
    color: var(--g-grave-ink);
    font-weight: 800;
  }
  .day.late {
    background: var(--chip-yellow-bg);
    border-color: transparent;
    color: var(--chip-yellow-ink);
    font-weight: 800;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 14px;
    margin-top: 10px;
    color: var(--muted);
    font-size: 0.75rem;
  }
  .lg::before {
    content: '';
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 3px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    margin-right: 5px;
  }
  .lg.present::before {
    background: var(--chip-green-bg);
    border-color: transparent;
  }
  .lg.absent::before {
    background: var(--chip-pink-bg);
    border-color: transparent;
  }
  .lg.late::before {
    background: var(--chip-yellow-bg);
    border-color: transparent;
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
  .classes {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .cls {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    text-align: left;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 10px 14px;
    min-height: 56px;
  }
  .cls:active {
    transform: scale(0.99);
  }
  .dot {
    flex: none;
    width: 14px;
    height: 14px;
    border-radius: 999px;
    border: 1px solid var(--line);
  }
  .clsmain {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .clsmain strong {
    font-size: 0.9rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .clsmain small {
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
