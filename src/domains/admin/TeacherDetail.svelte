<script lang="ts">
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { t } from '$lib/i18n';
  import { notify } from '$lib/ui/notice';
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import ErrorState from '$lib/ui/ErrorState.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import Dropdown from '$lib/ui/Dropdown.svelte';
  import AdminShell from './AdminShell.svelte';
  import { paletteFor } from '$lib/ui/palette';
  import {
    teacherDetail,
    subjects,
    subjectAssignments,
    teacherHistory,
    teacherPhoto,
    uploadTeacherPhoto,
    teacherSessionsTaken,
    teacherWarningsMade,
    teacherAccount,
    setUserActive,
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
    type TeacherSessionRow,
    type RecentWarning,
    type TeacherAccount,
  } from './api';
  import { isMissing } from '../teacher/api';
  import { ApiError } from '$lib/api/types';
  import { guarded, goBack } from '$lib/nav';

  export let params: { id?: string } = {};
  $: id = decodeURIComponent(params.id ?? '');

  let state: 'loading' | 'error' | 'ready' = 'loading';
  let detail: TeacherDetail | null = null;
  let loadError: unknown = null;
  const currentYear = new Date().getFullYear();

  // Attendance record: month grid with summary counts.
  // Photo mirrors the student file: data URL or initials.
  let photoUrl: string | null = null;
  let photoError = '';
  let photoInput: HTMLInputElement | null = null;

  async function loadPhoto() {
    photoUrl = null;
    try {
      const photo = await guarded(() => teacherPhoto(id));
      if (photo) photoUrl = `data:${photo.contentType};base64,${photo.data}`;
    } catch {
      photoUrl = null;
    }
  }

  async function onPhotoPicked(e: Event) {
    photoError = '';
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (photoInput) photoInput.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      photoError = $t.studentDetail.photoTooLarge;
      return;
    }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      await uploadTeacherPhoto(id, dataUrl);
      photoUrl = dataUrl;
    } catch (err) {
      photoError = err instanceof ApiError ? err.message : $t.common.loadError;
    }
  }

  async function removePhoto() {
    photoError = '';
    try {
      await uploadTeacherPhoto(id, '');
      photoUrl = null;
    } catch (err) {
      photoError = err instanceof ApiError ? err.message : $t.common.loadError;
    }
  }
  let hist: TeacherHistory | null = null;
  let monthCursor = monthStart(new Date());

  function monthStart(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }
  function monthLabel(d: Date): string {
    return d.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  }
  const MONTH_NAMES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  $: monthOptions = MONTH_NAMES.map((label, i) => ({ value: String(i), label }));
  $: yearOptions = (() => {
    const y = new Date().getFullYear();
    const out: { value: string; label: string }[] = [];
    for (let k = y - 5; k <= y + 1; k++) out.push({ value: String(k), label: String(k) });
    return out;
  })();

  function setMonth(m: number) {
    if (!Number.isInteger(m) || m < 0 || m > 11) return;
    monthCursor = new Date(monthCursor.getFullYear(), m, 1);
    void loadHistory();
  }

  function setYear(y: number) {
    if (!Number.isInteger(y)) return;
    monthCursor = new Date(y, monthCursor.getMonth(), 1);
    void loadHistory();
  }

  // Activity made by the teacher: roll calls taken + llamados issued.
  let sessionsMade: TeacherSessionRow[] = [];
  let warningsMade: RecentWarning[] = [];

  async function loadActivity() {
    try {
      const [s, w] = await Promise.all([
        guarded(() => teacherSessionsTaken(id)),
        guarded(() => teacherWarningsMade(id))
      ]);
      sessionsMade = s ?? [];
      warningsMade = w ?? [];
    } catch {
      sessionsMade = [];
      warningsMade = [];
    }
  }

  function ageOf(value: string): number | null {
    if (!value || value.startsWith('0001')) return null;
    const born = new Date(value);
    if (Number.isNaN(born.getTime())) return null;
    const now = new Date();
    let years = now.getFullYear() - born.getFullYear();
    const before =
      now.getMonth() < born.getMonth() ||
      (now.getMonth() === born.getMonth() && now.getDate() < born.getDate());
    if (before) years -= 1;
    return years >= 0 && years < 130 ? years : null;
  }

  function longDate(value: string): string {
    if (!value || value.startsWith('0001')) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  $: teacherAge = detail ? ageOf(detail.Birthdate) : null;

  $: groupsWithSubjects = (() => {
    const byGroup = new Map<string, { gid: string; label: string; subjects: { id: string; name: string }[] }>();
    for (const e of teacherEntries) {
      let g = byGroup.get(e.ClassGroupID);
      if (!g) {
        g = { gid: e.ClassGroupID, label: classGroupLabel(e.ClassGroupID), subjects: [] };
        byGroup.set(e.ClassGroupID, g);
      }
      if (!g.subjects.some((s) => s.id === e.SubjectID)) {
        g.subjects.push({ id: e.SubjectID, name: subjectMeta(e.SubjectID).name });
      }
    }
    return [...byGroup.values()];
  })();

  function momentTs(value: string): string {
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

  function shortDay(value: string): string {
    const d = new Date(`${value.slice(0, 10)}T12:00:00`);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
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

  onMount(load);

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
    void loadPhoto();
    void loadActivity();
    void loadAccount();
  }

  // Login behind the profile: null means no account yet (honest 404).
  let account: TeacherAccount | null = null;
  let accountBusy = false;
  let accountError = '';
  let confirmBlock = false;

  async function loadAccount() {
    account = null;
    confirmBlock = false;
    try {
      account = await guarded(() => teacherAccount(id));
    } catch {
      account = null;
    }
  }

  async function toggleAccount() {
    if (!account || accountBusy) return;
    if (account.Active && !confirmBlock) {
      confirmBlock = true;
      return;
    }
    confirmBlock = false;
    accountBusy = true;
    accountError = '';
    try {
      const updated = await guarded(() => setUserActive(account!.ID, !account!.Active));
      if (!updated) return;
      await loadAccount();
      const blocked = account !== null && !account.Active;
      notify(blocked ? $t.admin.accountBlockedOk : $t.admin.accountUnblockedOk);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      accountError = err instanceof ApiError ? err.message : $t.common.loadError;
    } finally {
      accountBusy = false;
    }
  }

  let teacherEntries: ScheduleEntry[] = [];
  let groupsAll: YearGroup[] = [];

  async function loadClasses() {
    try {
      const [entries, fetchedGroups, subs] = await Promise.all([
        guarded(() => scheduleEntries({ teacherID: id })),
        guarded(() => groupsByYear(currentYear)),
        guarded(() => subjects())
      ]);
      teacherEntries = (entries ?? []).sort(
        (a, b) => a.Weekday - b.Weekday || a.Start - b.Start
      );
      groupsAll = fetchedGroups ?? [];
      catalog = subs ?? catalog;
    } catch {
      teacherEntries = [];
    }
  }

  $: classDayNames = [...$t.admin.scheduleWeekdays, ...$t.admin.scheduleWeekend];
  $: classDayLabel = (w: number) => classDayNames[w === 0 ? 6 : w - 1] ?? '';
  $: classGroupLabel = (gid: string) =>
    groupsAll.find((g) => g.GroupID === gid)?.ClassLabel ?? gid.slice(0, 8);
  $: subjectMeta = (sid: string) => {
    const s = catalog.find((x) => x.ID === sid);
    return { name: s?.Name ?? sid.slice(0, 8), color: s?.Color || 'var(--muted)' };
  };

  let catalog: Subject[] = [];

  $: homeroomOptions = [
    { value: '', label: $t.admin.directionNone },
    ...groupsAll.map((g) => ({ value: g.ClassLabel, label: g.ClassLabel }))
  ];

  // Edición del perfil: el backend aplica solo los campos enviados, así que
  // aquí se manda exactamente lo que el docente cambió.
  let editing = false;
  let saving = false;
  let editError = '';
  let editFeedback = '';
  let form = { Names: '', Surnames: '', DocumentID: '', Phone: '', Email: '', Sex: '', Homeroom: '' };

  function startEdit() {
    if (!detail) return;
    form = {
      Names: detail.Names,
      Surnames: detail.Surnames,
      DocumentID: detail.DocumentID,
      Phone: detail.Phone ?? '',
      Email: detail.Email ?? '',
      Sex: detail.Sex ?? '',
      Homeroom: detail.HomeroomClassID ?? ''
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
      const { Homeroom, ...rest } = form;
      const updated = await updateTeacher(id, { ...rest, HomeroomClassID: Homeroom });
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
  <TopBar title={$t.admin.teacherDetailTitle} showBack onBack={() => goBack('/admin/docentes')}>
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
    <div class="grid">
      <aside>
        <section class="card profile" aria-label={$t.admin.teacherDetailTitle}>
          <div class="idblock">
            <div class="photocol">
              {#if photoUrl}
                <img class="photo" src={photoUrl} alt={`${detail.Surnames} ${detail.Names}`} />
              {:else}
                <span class="avatar big" aria-hidden="true">
                  {`${detail.Surnames} ${detail.Names}`.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
                </span>
              {/if}
              <button type="button" class="link" on:click={() => photoInput?.click()}>
                {$t.troll.photoChange}
              </button>
              {#if photoUrl}
                <button type="button" class="link danger" on:click={removePhoto}>
                  {$t.troll.photoRemove}
                </button>
              {/if}
              <input
                bind:this={photoInput}
                type="file"
                accept="image/*"
                hidden
                aria-hidden="true"
                tabindex="-1"
                on:change={onPhotoPicked}
              />
            </div>
            <div>
              <h2>{detail.Surnames} {detail.Names}</h2>
              <p>{detail.DocumentID || $t.common.noData}</p>
            </div>
          </div>
          {#if photoError}<p class="flash error" role="alert">{photoError}</p>{/if}
          <h3 class="sub">{$t.troll.filePersonalTitle}</h3>
          <dl class="facts">
            {#if longDate(detail.Birthdate)}
              <div>
                <dt>{$t.troll.fileBirthLabel}</dt>
                <dd>{longDate(detail.Birthdate)}{teacherAge !== null ? ` · ${$t.troll.fileAgeLabel(teacherAge)}` : ''}</dd>
              </div>
            {/if}
            {#if detail.Birthplace}
              <div>
                <dt>{$t.studentDetail.birthplaceLabel}</dt>
                <dd>{detail.Birthplace}</dd>
              </div>
            {/if}
          </dl>
          <h3 class="sub">{$t.troll.fileContactTitle}</h3>
          <dl class="facts">
            {#if detail.Phone}
              <div>
                <dt>{$t.admin.formPhone}</dt>
                <dd>{detail.Phone}</dd>
              </div>
            {/if}
            {#if detail.Address}
              <div>
                <dt>{$t.studentDetail.addressLabel}</dt>
                <dd>{detail.Address}</dd>
              </div>
            {/if}
            {#if detail.Email}
              <div>
                <dt>{$t.admin.formEmail}</dt>
                <dd>{detail.Email}</dd>
              </div>
            {/if}
            {#if detail.Sex === 'female' || detail.Sex === 'male'}
              <div>
                <dt>{$t.admin.formSex}</dt>
                <dd>{detail.Sex === 'female' ? $t.admin.formSexFemale : $t.admin.formSexMale}</dd>
              </div>
            {/if}
          </dl>
          {#if detail.MedicalConditions}
            <h3 class="sub">{$t.troll.fileHealthTitle}</h3>
            <p class="muted">{detail.MedicalConditions}</p>
          {/if}
          <div class="statusrow">
            {#if detail.HomeroomClassID}
              <span class="chip chip-sky">{$t.admin.directs(detail.HomeroomClassID)}</span>
            {/if}
            {#if !detail.Active}<span class="chip chip-pink">{$t.admin.inactive}</span>{/if}
            <button type="button" class="linklike" on:click={startEdit}>
              {detail.HomeroomClassID ? $t.admin.modifyDirection : $t.admin.assignDirectionLine}
            </button>
          </div>
        </section>
        <section class="card" aria-label={$t.admin.accountTitle}>
          <div class="row-head">
            <h2>{$t.admin.accountTitle}</h2>
          </div>
          {#if account}
            <dl class="arows">
              <div>
                <dt>{$t.admin.formUsername}</dt>
                <dd>{account.Username}</dd>
              </div>
              {#if account.Email}
                <div>
                  <dt>{$t.admin.formEmail}</dt>
                  <dd>{account.Email}</dd>
                </div>
              {/if}
            </dl>
            {#if accountError}<p class="flash error" role="alert">{accountError}</p>{/if}
            <div class="statusrow">
              {#if account.Active}
                <span class="chip chip-green">{$t.admin.accountActive}</span>
              {:else}
                <span class="chip chip-pink">{$t.admin.accountBlocked}</span>
              {/if}
            </div>
            {#if confirmBlock}
              <p class="muted">{$t.admin.confirmBlockAccess(account.Username)}</p>
            {/if}
            <div class="toolbar">
              <button type="button" class="mini" on:click={toggleAccount} disabled={accountBusy}>
                {#if accountBusy}
                  …
                {:else if account.Active}
                  {confirmBlock ? $t.admin.confirmBlock : $t.admin.blockAccess}
                {:else}
                  {$t.admin.unblockAccess}
                {/if}
              </button>
              {#if confirmBlock}
                <button type="button" class="mini" on:click={() => (confirmBlock = false)}>
                  {$t.common.cancel}
                </button>
              {/if}
            </div>
          {:else}
            <p class="muted">{$t.admin.accountNone}</p>
          {/if}
        </section>
      </aside>
      <div class="main">

    <section class="card" aria-label={$t.troll.historyTitle}>
      <div class="row-head">
        <h2>{$t.troll.historyTitle}</h2>
        <div class="monthpick">
          <Dropdown
            label={$t.troll.monthLabel}
            value={String(monthCursor.getMonth())}
            options={monthOptions}
            on:select={(e) => setMonth(Number(e.detail))}
          />
          <Dropdown
            label={$t.troll.yearLabel}
            value={String(monthCursor.getFullYear())}
            options={yearOptions}
            on:select={(e) => setYear(Number(e.detail))}
          />
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

    <section class="card" aria-label={$t.troll.fileSubjectsGroupsTitle}>
      <h2>{$t.troll.fileSubjectsGroupsTitle}</h2>
      {#if groupsWithSubjects.length === 0}
        <p class="muted">{$t.troll.fileSubjectsGroupsEmpty}</p>
      {:else}
        <ul class="sgroups">
          {#each groupsWithSubjects as g (g.label)}
            <li>
              <button
                type="button"
                class="grow"
                on:click={() => push(`/admin/estudiantes?salon=${encodeURIComponent(g.gid)}`)}
              >
                <strong>{g.label}</strong>
                <span class="chips">
                  {#each g.subjects as s (s.id)}
                    <span class={`chip chip-${paletteFor(s.id)}`}>{s.name}</span>
                  {/each}
                </span>
                <span class="go" aria-hidden="true"><Icon name="next" /></span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
      <p class="muted">{$t.admin.subjectsFromSchedule}</p>
    </section>
    <section class="card" aria-label={$t.troll.fileSessionsTitle}>
      <div class="row-head">
        <h2>{$t.troll.fileSessionsTitle}</h2>
        <span class="count" role="status">{$t.troll.fileSessionsCount(sessionsMade.length)}</span>
      </div>
      {#if sessionsMade.length === 0}
        <p class="muted">{$t.troll.fileSessionsEmpty}</p>
      {:else}
        <ul class="takes">
          {#each sessionsMade as s (s.ID)}
            <li>
              <button
                type="button"
                class="grow"
                on:click={() => push(`/admin/estudiantes/historial?sesion=${encodeURIComponent(s.ID)}`)}
              >
                <span class="rday">{shortDay(s.Date)}</span>
                <span class="rtext">
                  <strong>{s.ClassLabel}{s.Subject ? ` · ${s.Subject}` : ''}</strong>
                  <small>
                    {$t.troll.takeSummary(s.Students, s.Absences)}
                  </small>
                </span>
                <span class="go" aria-hidden="true"><Icon name="next" /></span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="card" aria-label={$t.troll.fileWarningsMadeTitle}>
      <div class="row-head">
        <h2>{$t.troll.fileWarningsMadeTitle}</h2>
        <span class="count" role="status">{$t.troll.fileWarningsMadeCount(warningsMade.length)}</span>
      </div>
      {#if warningsMade.length === 0}
        <p class="muted">{$t.troll.fileWarningsMadeEmpty}</p>
      {:else}
        <ul class="takes">
          {#each warningsMade as w (w.ID)}
            <li>
              <button
                type="button"
                class="grow"
                on:click={() => push(`/admin/llamados?estudiante=${encodeURIComponent(w.StudentID)}&nombre=${encodeURIComponent(w.StudentName)}&llamado=${encodeURIComponent(w.ID)}`)}
              >
                <span class={`sev ${w.Gravity === 'mild' ? 'leve' : w.Gravity === 'moderate' ? 'medio' : 'grave'}`}>
                  {w.Gravity === 'mild' ? $t.roster.warnGravityMild : w.Gravity === 'moderate' ? $t.roster.warnGravityModerate : $t.roster.warnGravitySevere}
                </span>
                <span class="rtext">
                  <strong>{w.StudentName} — {w.Title}</strong>
                  <small>{w.ClassLabel} · {momentTs(w.HappenedAt)}</small>
                </span>
                <span class="go" aria-hidden="true"><Icon name="next" /></span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>



      </div>
    </div>
  {/if}
  </div>
</AdminShell>

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
    <div class="row2">
      <label>{$t.admin.formEmail}<input bind:value={form.Email} inputmode="email" autocomplete="off" /></label>
      <label
        >{$t.admin.formSex}
        <select bind:value={form.Sex}>
          <option value="">{$t.admin.formSexNone}</option>
          <option value="female">{$t.admin.formSexFemale}</option>
          <option value="male">{$t.admin.formSexMale}</option>
        </select></label
      >
      <label>
        <span>{$t.admin.directionGroupLabel}</span>
        <Dropdown
          label={$t.admin.directionGroupLabel}
          value={form.Homeroom}
          options={homeroomOptions}
          on:select={(e) => (form.Homeroom = String(e.detail))}
        />
      </label>
    </div>
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
  .idblock {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 8px;
  }
  .photocol {
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }
  .photo {
    width: 88px;
    height: 88px;
    border-radius: 28px;
    object-fit: cover;
    border: 1px solid var(--line);
  }
  .avatar.big {
    width: 88px;
    height: 88px;
    font-size: 1.9rem;
    border-radius: 28px;
    background: var(--accent-soft);
    color: var(--accent);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
  }
  .link {
    color: var(--accent);
    font-weight: 700;
    font-size: 0.82rem;
    min-height: 36px;
    padding: 4px 0;
    text-align: left;
  }
  .link.danger {
    color: var(--g-grave-ink);
  }
  .flash.error {
    background: var(--chip-pink-bg);
    color: var(--g-grave-ink);
    font-weight: 600;
    font-size: 0.9rem;
    border-radius: var(--radius-chip);
    padding: 10px 14px;
    margin-bottom: 8px;
  }
  .rday {
    flex: none;
    background: var(--tint);
    border-radius: 999px;
    padding: 3px 10px;
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--ink-soft);
    font-variant-numeric: tabular-nums;
  }
  .rtext {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .rtext strong {
    font-size: 0.88rem;
  }
  .rtext small {
    color: var(--muted);
    font-size: 0.78rem;
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
  .form select {
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 10px 12px;
    font-size: 0.92rem;
    width: 100%;
    color: var(--ink);
    font: inherit;
  }
  .form input:focus,
  .form select:focus {
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
  .monthpick {
    display: flex;
    gap: 8px;
    align-items: end;
  }
  .monthpick > :global(*) {
    min-width: 130px;
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
  .sgroups {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .sgroups li {
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
  }
  .grow {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    text-align: left;
    background: none;
    border: 0;
    padding: 10px 14px;
    font: inherit;
    color: inherit;
    cursor: pointer;
    flex-wrap: wrap;
  }
  .takes .grow {
    padding: 0 0 8px;
    flex-wrap: nowrap;
  }
  .takes li:last-child .grow {
    padding-bottom: 0;
  }
  .sgroups .grow > strong {
    min-width: 52px;
    font-variant-numeric: tabular-nums;
  }
  .go {
    flex: none;
    width: 32px;
    height: 32px;
    border-radius: 999px;
    background: var(--surface-2);
    color: var(--muted);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-left: auto;
  }
  .sgroups .chips {
    flex: 1;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .takes {
    list-style: none;
    margin: 12px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .takes li {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--line);
  }
  .takes li:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }
  .sev {
    flex: none;
    border-radius: 999px;
    padding: 2px 10px;
    font-size: 0.7rem;
    font-weight: 700;
  }
  .sev.medio {
    background: var(--chip-yellow-bg);
    color: var(--chip-yellow-ink);
  }
  .sev.grave {
    background: var(--chip-pink-bg);
    color: var(--g-grave-ink);
  }
  .sev.leve {
    background: var(--chip-sky-bg);
    color: var(--chip-sky-ink);
  }
  .count {
    background: var(--tint);
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 5px 14px;
    color: var(--ink-soft);
    font-size: 0.78rem;
    font-weight: 700;
    white-space: nowrap;
  }
  .grid {
    display: grid;
    grid-template-columns: 360px minmax(0, 1fr);
    gap: 20px;
    align-items: start;
  }
  @media (max-width: 899px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }
  .facts {
    display: flex;
    flex-direction: column;
    margin: 0;
  }
  .facts > div {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    padding: 7px 0;
    border-bottom: 1px solid var(--line);
  }
  .facts > div:last-child {
    border-bottom: none;
  }
  .facts dt {
    color: var(--muted);
    font-size: 0.84rem;
    flex: none;
  }
  .facts dd {
    margin: 0;
    font-size: 0.92rem;
    font-weight: 700;
    color: var(--ink);
    text-align: right;
    word-break: break-word;
  }
  .sub {
    font-size: 0.8rem;
    font-weight: 700;
    margin: 14px 0 2px;
  }
  .statusrow {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 10px;
    align-items: center;
  }
  .linklike {
    color: var(--accent);
    font-weight: 700;
    font-size: 0.82rem;
    min-height: 36px;
    padding: 4px 8px;
    border-radius: var(--radius-pill);
  }
  .arows {
    display: flex;
    flex-direction: column;
    margin: 0 0 8px;
  }
  .arows > div {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    padding: 7px 0;
    border-bottom: 1px solid var(--line);
  }
  .arows > div:last-child {
    border-bottom: none;
  }
  .arows dt {
    color: var(--muted);
    font-size: 0.84rem;
    flex: none;
  }
  .arows dd {
    margin: 0;
    font-size: 0.92rem;
    font-weight: 700;
    color: var(--ink);
    text-align: right;
    overflow-wrap: anywhere;
    min-width: 0;
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
