<script lang="ts">
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { t } from '$lib/i18n';
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import AdminShell from './AdminShell.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ErrorState from '$lib/ui/ErrorState.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import {
    teachers,
    teacherDetail,
    createTeacher,
    createUser,
    listSubjects,
    scheduleEntries,
    groupsByYear,
    updateTeacher,
    type TeacherSummary,
    type TeacherDetail,
    type YearGroup
  } from './api';
  import { isMissing } from '../teacher/api';
  import { ApiError } from '$lib/api/types';
  import { notify } from '$lib/ui/notice';
  import { guarded, goBack } from '$lib/nav';
  import { profile } from '$lib/shell/profile';
  import { canManageUsers } from '$lib/access';
  import { foldSearch } from '$lib/search';
  import Sheet from '$lib/ui/Sheet.svelte';
  import Dropdown from '$lib/ui/Dropdown.svelte';
  $: roles = $profile.me?.roles ?? [];

  let state: 'loading' | 'error' | 'ready' = 'loading';
  let loadError: unknown = null;
  let list: TeacherSummary[] = [];

  const currentYear = new Date().getFullYear();
  let creating = false;
  let saving = false;
  let feedback = '';
  let error = '';
  let showPassword = false;
  let search = '';
  let details: Record<string, TeacherDetail> = {};
  let taught: Record<string, { id: string; name: string; color: string }[]> = {};

  function tint(color: string): string {
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) return '';
    return `background:${color}1A;border-color:${color}59`;
  }
  let fSubject = '';
  let fGroup = '';
  let fRole: '' | 'director' | 'plain' = '';
  let form = freshForm();

  let assigning: TeacherSummary | null = null;
  let dirGroups: YearGroup[] = [];
  let dirGroupsState: 'idle' | 'loading' | 'ready' = 'idle';
  let dirValue = '';
  let dirSaving = false;
  let dirError = '';

  $: dirOptions = [
    { value: '', label: $t.admin.directionNone },
    ...dirGroups.map((g) => ({ value: g.ClassLabel, label: g.ClassLabel }))
  ];

  async function ensureDirGroups() {
    if (dirGroupsState !== 'idle') return;
    dirGroupsState = 'loading';
    try {
      dirGroups = (await guarded(() => groupsByYear(currentYear))) ?? [];
    } catch {
      dirGroups = [];
    } finally {
      dirGroupsState = 'ready';
    }
  }

  async function openAssign(teacher: TeacherSummary) {
    assigning = teacher;
    dirValue = teacher.HomeroomClassID ?? '';
    dirError = '';
    await ensureDirGroups();
  }

  async function saveAssign() {
    if (!assigning || dirSaving) return;
    dirError = '';
    dirSaving = true;
    try {
      const updated = await updateTeacher(assigning.ID, { HomeroomClassID: dirValue });
      list = list.map((x) => (x.ID === assigning!.ID ? { ...x, HomeroomClassID: updated.HomeroomClassID } : x));
      assigning = null;
      notify($t.admin.directionSaved);
    } catch (err) {
      dirError = err instanceof ApiError ? err.message : $t.common.loadError;
    } finally {
      dirSaving = false;
    }
  }

  function freshForm() {
    return {
      Names: '',
      Surnames: '',
      DocumentID: '',
      Phone: '',
      Email: '',
      Sex: '' as '' | 'female' | 'male',
      Address: '',
      Birthplace: '',
      Birthdate: '',
      MedicalConditions: '',
      HomeroomClassID: '',
      Username: '',
      Password: ''
    };
  }

  async function load() {
    state = 'loading';
    loadError = null;
    try {
      const data = await guarded(() => teachers());
      if (data === null) {
        list = [];
        state = 'ready';
        return;
      }
      list = [...data].sort((a, b) =>
        `${a.Surnames} ${a.Names}`.toLowerCase() < `${b.Surnames} ${b.Names}`.toLowerCase() ? -1 : 1
      );
      state = 'ready';
      void loadDetails();
      void ensureDirGroups();
    } catch (err) {
      loadError = err;
      state = err instanceof ApiError && isMissing(err) ? 'ready' : 'error';
    }
  }

  async function loadDetails() {
    const settled = await Promise.allSettled(list.map((teacher) => teacherDetail(teacher.ID)));
    const next: Record<string, TeacherDetail> = {};
    settled.forEach((result, i) => {
      if (result.status === 'fulfilled' && result.value) next[list[i].ID] = result.value;
    });
    details = next;
    try {
      const subs = (await guarded(() => listSubjects())) ?? [];
      const perTeacher = await Promise.allSettled(
        list.map((teacher) => scheduleEntries({ teacherID: teacher.ID }))
      );
      const taughtNext: Record<string, { id: string; name: string; color: string }[]> = {};
      perTeacher.forEach((result, i) => {
        if (result.status !== 'fulfilled' || !result.value) return;
        const seen = new Map<string, { id: string; name: string; color: string }>();
        for (const e of result.value) {
          if (!seen.has(e.SubjectID)) {
            const s = subs.find((x) => x.ID === e.SubjectID);
            seen.set(e.SubjectID, {
              id: e.SubjectID,
              name: s?.Name ?? e.SubjectID.slice(0, 8),
              color: s?.Color ?? ''
            });
          }
        }
        if (seen.size > 0) taughtNext[list[i].ID] = [...seen.values()];
      });
      taught = taughtNext;
    } catch {
      taught = {};
    }
  }

  function initialsOf(surnames: string, names: string): string {
    return `${surnames} ${names}`
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
  }

  onMount(load);

  $: q = foldSearch(search.trim());
  $: subjectOptions = [...new Set(Object.values(taught).flat().map((s) => s.name))].sort((a, b) =>
    a.localeCompare(b, 'es')
  );
  $: groupOptions = [...new Set(list.map((teacher) => teacher.HomeroomClassID).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'es')
  );
  $: visible = list.filter((teacher) => {
    if (
      q &&
      !foldSearch(`${teacher.Surnames} ${teacher.Names} ${teacher.DocumentID}`).includes(q)
    )
      return false;
    if (fRole === 'director' && !teacher.HomeroomClassID) return false;
    if (fRole === 'plain' && teacher.HomeroomClassID) return false;
    if (fGroup && teacher.HomeroomClassID !== fGroup) return false;
    if (fSubject) {
      const names = (taught[teacher.ID] ?? []).map((s) => s.name);
      if (!names.includes(fSubject)) return false;
    }
    return true;
  });

  function validate(): string {
    if (!form.Names.trim() || !form.Surnames.trim() || !form.DocumentID.trim()) {
      return $t.admin.formRequired;
    }
    if (!/^[0-9]+$/.test(form.DocumentID.trim())) {
      return $t.admin.formDocumentDigits;
    }
    if (form.Email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.Email.trim())) {
      return $t.admin.formEmailInvalid;
    }
    const username = form.Username.trim();
    if ((username && !form.Password) || (!username && form.Password)) {
      return $t.admin.accountNeedsBoth;
    }
    if (form.Password && !isPasswordOk(form.Password)) {
      return $t.admin.formPasswordWeak;
    }
    return '';
  }

  function isPasswordOk(password: string): boolean {
    if (password.length < 8 || password.length > 72) return false;
    return /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(password) && /[0-9]/.test(password);
  }

  async function save() {
    feedback = '';
    error = validate();
    if (error) return;
    saving = true;
    try {
      const created = await createTeacher({
        Names: form.Names.trim(),
        Surnames: form.Surnames.trim(),
        DocumentID: form.DocumentID.trim(),
        Phone: form.Phone.trim(),
        Email: form.Email.trim(),
        Sex: form.Sex,
        Address: form.Address.trim(),
        Birthplace: form.Birthplace.trim(),
        Birthdate: form.Birthdate,
        MedicalConditions: form.MedicalConditions.trim(),
        HomeroomClassID: form.HomeroomClassID.trim()
      });
      let extra = '';
      const username = form.Username.trim();
      if (username) {
        try {
          await createUser({
            username,
            email: form.Email.trim(),
            password: form.Password,
            role: 'teacher',
            teacherID: created.ID
          });
          extra = ' ' + $t.admin.accountCreated;
        } catch (err) {
          if (!(err instanceof ApiError && isMissing(err))) throw err;
          extra = ' ' + $t.admin.accountPending;
        }
      }
      feedback = $t.admin.createdTeacher + extra;
      notify(feedback);
      form = freshForm();
      showPassword = false;
      await load();
      creating = false;
    } catch (err) {
      error = err instanceof ApiError ? err.message : $t.common.loadError;
    } finally {
      saving = false;
    }
  }
</script>

<AdminShell active="docentes" year={currentYear}>
  <TopBar title={$t.admin.teachersTitle} showBack onBack={() => goBack('/admin')}>
    <button type="button" class="btn" on:click={() => push('/admin/docentes/lista')}>
      {$t.troll.rollAction}
    </button>
    <button type="button" class="btn" on:click={() => push('/admin/docentes/historial')}>
      {$t.troll.historyAction}
    </button>
    {#if canManageUsers(roles)}
      <button type="button" class="btn btn-primary" on:click={() => { creating = true; feedback = ''; error = ''; }}>
        <Icon name="plus" /> {$t.admin.newTeacher}
      </button>
    {/if}
    <TopActions />
  </TopBar>

  <div class="sheet">
    <div class="filterbar" role="group" aria-label={$t.admin.teachersTitle}>
      <label class="search">
        <span class="cap">{$t.admin.teachersSearch}</span>
        <div class="search-box">
          <Icon name="search" />
          <input type="search" placeholder={$t.admin.teachersSearch} aria-label={$t.admin.teachersSearch} bind:value={search} />
        </div>
      </label>
      <Dropdown
        label={$t.admin.filterSubject}
        value={fSubject}
        options={[{ value: '', label: $t.admin.filterAll }, ...subjectOptions.map((s) => ({ value: s, label: s }))]}
        on:select={(e) => (fSubject = e.detail)}
      />
      <Dropdown
        label={$t.admin.filterGroup}
        value={fGroup}
        options={[{ value: '', label: $t.admin.filterAll }, ...groupOptions.map((g) => ({ value: g, label: g }))]}
        on:select={(e) => (fGroup = e.detail)}
      />
      <Dropdown
        label={$t.admin.filterRole}
        value={fRole}
        options={[
          { value: '', label: $t.admin.filterAll },
          { value: 'director', label: $t.admin.roleDirector },
          { value: 'plain', label: $t.admin.rolePlain }
        ]}
        on:select={(e) => (fRole = e.detail === 'director' ? 'director' : e.detail === 'plain' ? 'plain' : '')}
      />
      <span class="count" role="status">{$t.admin.teachersCount(visible.length)}</span>
    </div>

    {#if state === 'loading'}
      <Skeleton rows={4} />
    {:else if state === 'error'}
      <ErrorState error={loadError} onRetry={load} />
    {:else if list.length === 0}
      <EmptyState
        icon="users"
        title={$t.admin.noTeachersTitle}
        body={$t.admin.noTeachersBody}
      />
    {:else if visible.length === 0}
      <EmptyState
        icon="list"
        title={$t.admin.teachersEmptySearch}
      />
    {:else}
      <div class="table-wrap">
        <div class="colhead" aria-hidden="true">
          <span>{$t.admin.teacherDetailTitle}</span>
          <span>{$t.admin.directionGroupLabel}</span>
          <span>{$t.admin.subjectsTitle}</span>
          <span class="act-col">{$t.a11y.actions}</span>
        </div>
        <ul class="roster">
          {#each visible as teacher (teacher.ID)}
            {@const detail = details[teacher.ID]}
            {@const subjects = taught[teacher.ID] ?? []}
            {@const contact = [teacher.DocumentID, detail?.Phone, detail?.Email].filter(Boolean).join(' · ')}
            <li class="trow">
              <button
                type="button"
                class="who-btn"
                on:click={() => push(`/admin/docentes/${encodeURIComponent(teacher.ID)}`)}
              >
                <span class="avatar" aria-hidden="true">{initialsOf(teacher.Surnames, teacher.Names)}</span>
                <span class="who">
                  <span class="nameline">
                    <strong class="name">{teacher.Surnames}, {teacher.Names}</strong>
                    {#if !teacher.Active}<span class="pill off">{$t.admin.inactive}</span>{/if}
                  </span>
                  <span class="sub">{contact || teacher.DocumentID}</span>
                </span>
              </button>

              <div class="dir-col">
                {#if teacher.HomeroomClassID}
                  <span class="pill dir">{$t.admin.directs(teacher.HomeroomClassID)}</span>
                {:else}
                  <span class="pill">{$t.admin.rolePlain}</span>
                {/if}
              </div>

              <div class="subj-col">
                {#each subjects.slice(0, 4) as subject}
                  <span class="pill sub" style={tint(subject.color)}>{subject.name}</span>
                {/each}
                {#if subjects.length === 0}
                  <span class="pill mute">{$t.admin.noSubjects}</span>
                {/if}
              </div>

              <div class="act-col">
                {#if canManageUsers(roles)}
                  <button
                    type="button"
                    class="btn btn-sm"
                    on:click={() => openAssign(teacher)}
                  >
                    {teacher.HomeroomClassID ? $t.admin.modifyDirection : $t.admin.assignDirection}
                  </button>
                {/if}
                <button
                  type="button"
                  class="btn btn-sm"
                  on:click={() => push(`/admin/docentes/${encodeURIComponent(teacher.ID)}`)}
                >
                  {$t.troll.openFile}
                </button>
              </div>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>
</AdminShell>

<Sheet open={creating} wide title={$t.admin.newTeacher} onClose={() => (creating = false)}>
  <form class="form" on:submit|preventDefault={save}>
    <p class="req-note">{$t.admin.formRequiredNote}</p>
    <h3 class="formsub">{$t.admin.formSectionBasic}</h3>
    <div class="row2">
      <label><span>{$t.admin.formNames} <span class="req" aria-hidden="true">*</span></span><input required bind:value={form.Names} autocomplete="off" /></label>
      <label><span>{$t.admin.formSurnames} <span class="req" aria-hidden="true">*</span></span><input required bind:value={form.Surnames} autocomplete="off" /></label>
    </div>
    <div class="row2">
      <label>
        <span>{$t.admin.formDocument} <span class="req" aria-hidden="true">*</span></span>
        <input
          required
          bind:value={form.DocumentID}
          placeholder={$t.admin.formDocumentPlaceholder}
          inputmode="numeric"
          pattern="[0-9]*"
          autocomplete="off"
        />
      </label>
      <label>{$t.admin.formBirthdateTeacher}<input type="date" lang="es-CO" bind:value={form.Birthdate} /></label>
    </div>
    <label>{$t.admin.formBirthplace}<input bind:value={form.Birthplace} autocomplete="off" /></label>

    <h3 class="formsub">{$t.admin.formSectionContact}</h3>
    <div class="row2">
      <label>{$t.admin.formPhone}<input bind:value={form.Phone} type="tel" inputmode="tel" autocomplete="off" /></label>
      <label>{$t.admin.formEmail}<input bind:value={form.Email} type="email" inputmode="email" autocapitalize="none" autocomplete="off" /></label>
    </div>
    <label>{$t.admin.formAddress}<input bind:value={form.Address} autocomplete="off" /></label>
    <div class="row2">
      <Dropdown
        label={$t.admin.formSex}
        value={form.Sex}
        options={[
          { value: '', label: $t.admin.formSexNone },
          { value: 'female', label: $t.admin.formSexFemale },
          { value: 'male', label: $t.admin.formSexMale }
        ]}
        on:select={(e) => (form.Sex = e.detail === 'female' || e.detail === 'male' ? e.detail : '')}
      />
      <label>{$t.admin.formMedicalTeacher}<input bind:value={form.MedicalConditions} autocomplete="off" /></label>
    </div>

    <h3 class="formsub">{$t.admin.formSectionWork}</h3>
    <Dropdown
      label={$t.admin.formHomeroom}
      value={form.HomeroomClassID}
      options={dirOptions}
      on:select={(e) => (form.HomeroomClassID = String(e.detail))}
    />

    <h3 class="formsub">{$t.admin.formSectionAccount}</h3>
    <div class="row2">
      <label>
        {$t.admin.formUsername}
        <input
          bind:value={form.Username}
          placeholder={$t.admin.formUsernamePlaceholder}
          autocapitalize="none"
          autocomplete="off"
        />
      </label>
      <label>
        {$t.admin.formPassword}
        <span class="password">
          <input
            bind:value={form.Password}
            type={showPassword ? 'text' : 'password'}
            autocomplete="new-password"
            autocapitalize="none"
          />
          <button
            type="button"
            class="peek"
            aria-label={showPassword ? $t.login.hidePassword : $t.login.showPassword}
            aria-pressed={showPassword}
            on:click={() => (showPassword = !showPassword)}
          >
            <Icon name={showPassword ? 'eyeOff' : 'eye'} />
          </button>
        </span>
      </label>
    </div>
    <p class="hint">{$t.admin.formPasswordHint}</p>
    {#if error}<p class="flash error" role="alert">{error}</p>{/if}
    {#if feedback}<p class="flash" role="status">{feedback}</p>{/if}
    <div class="form-actions">
      <button class="btn" type="button" on:click={() => (creating = false)}>
        {$t.admin.formClose}
      </button>
      <button class="btn btn-primary" type="submit" disabled={saving}>
        {saving ? '…' : $t.admin.formCreate}
      </button>
    </div>
  </form>
</Sheet>

<Sheet open={assigning !== null} title={assigning ? $t.admin.assignDirectionTitle(`${assigning.Surnames} ${assigning.Names}`) : ''} onClose={() => (assigning = null)}>
  {#if assigning}
    {#if dirGroupsState === 'loading'}
      <Skeleton rows={2} />
    {:else}
      <form class="form" on:submit|preventDefault={saveAssign}>
        {#if assigning.HomeroomClassID}
          <p class="hint">{$t.admin.directs(assigning.HomeroomClassID)}</p>
        {/if}
        <Dropdown
          label={$t.admin.directionGroupLabel}
          value={dirValue}
          options={dirOptions}
          on:select={(e) => (dirValue = String(e.detail))}
        />
        {#if dirValue === ''}<p class="hint">{$t.admin.directionNoneHint}</p>{/if}
        {#if dirGroups.length === 0}<p class="hint">{$t.admin.directionNoGroups}</p>{/if}
        {#if dirError}<p class="flash error" role="alert">{dirError}</p>{/if}
        <div class="form-actions">
          <button class="btn" type="button" on:click={() => (assigning = null)}>
            {$t.common.cancel}
          </button>
          <button class="btn btn-primary" type="submit" disabled={dirSaving}>
            {dirSaving ? '…' : $t.common.save}
          </button>
        </div>
      </form>
    {/if}
  {/if}
</Sheet>

<style>
  .sheet {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-sheet);
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .filterbar {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    align-items: end;
  }
  @media (min-width: 780px) {
    .filterbar {
      grid-template-columns: 1.6fr 1fr 1fr 1fr auto;
    }
  }
  .search {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
  }
  .search .cap {
    font-size: var(--fs-small);
    font-weight: 500;
    color: var(--muted);
  }
  .search-box {
    display: flex;
    gap: 8px;
    align-items: center;
    background: var(--surface);
    border: 1px solid var(--control);
    border-radius: var(--radius-control);
    padding: 0 10px;
    color: var(--muted);
    min-height: var(--control-height);
  }
  .search-box:focus-within {
    border-color: var(--accent);
  }
  .search-box :global(svg) {
    width: 16px;
    height: 16px;
    flex: none;
  }
  .search-box input {
    border: 0;
    background: none;
    outline: none;
    width: 100%;
    color: var(--ink);
    font-size: 0.84rem;
  }
  .count {
    align-self: center;
    justify-self: end;
    background: var(--tint);
    border-radius: 999px;
    padding: 4px 12px;
    color: var(--ink-soft);
    font-size: 0.76rem;
    font-weight: 600;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  /* Table & Rows */
  .table-wrap {
    overflow-x: auto;
  }
  .colhead {
    display: none;
  }
  .roster {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }
  .trow {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 4px;
    border-top: 1px solid var(--line);
  }
  .trow:first-child {
    border-top: 0;
  }
  .who-btn {
    display: flex;
    align-items: center;
    gap: 10px;
    text-align: left;
    min-width: 0;
  }
  .who-btn:hover .name {
    color: var(--accent);
  }
  .avatar {
    width: 34px;
    height: 34px;
    flex: none;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 0.74rem;
  }
  .who {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .nameline {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .name {
    font-weight: 600;
    font-size: 0.88rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sub {
    color: var(--muted);
    font-size: 0.76rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .dir-col,
  .subj-col {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .act-col {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
  }
  .pill {
    font-size: 0.74rem;
    font-weight: 600;
    border-radius: 999px;
    padding: 3px 10px;
    background: var(--tint);
    color: var(--ink-soft);
    white-space: nowrap;
  }
  .pill.dir {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .pill.sub {
    background: var(--surface-2);
    border: 1px solid var(--line);
    color: var(--ink);
  }
  .pill.off {
    background: var(--g-grave-bg);
    color: var(--g-grave-ink);
  }
  .pill.mute {
    background: transparent;
    border: 1px dashed var(--control);
    color: var(--muted);
  }
  @media (min-width: 820px) {
    .colhead {
      display: grid;
      grid-template-columns: minmax(220px, 1.4fr) 150px minmax(180px, 1.2fr) auto;
      gap: 14px;
      padding: 0 4px 8px;
      border-bottom: 1px solid var(--line);
      color: var(--muted);
      font-size: 0.75rem;
      font-weight: 500;
    }
    .colhead .act-col {
      justify-content: flex-end;
    }
    .trow {
      display: grid;
      grid-template-columns: minmax(220px, 1.4fr) 150px minmax(180px, 1.2fr) auto;
      gap: 14px;
      align-items: center;
    }
  }
  /* Form inside Sheet */
  .form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .form label {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-weight: 500;
    font-size: 0.82rem;
  }
  .row2 {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
  }
  @media (min-width: 480px) {
    .row2 {
      grid-template-columns: 1fr 1fr;
    }
  }
  .form input {
    background: var(--surface);
    border: 1px solid var(--control);
    border-radius: var(--radius-control);
    padding: 0 12px;
    min-height: var(--control-height);
    width: 100%;
    color: var(--ink);
    font: inherit;
    font-size: 0.85rem;
  }
  .form input:focus {
    outline: none;
    border-color: var(--accent);
  }
  .formsub {
    margin: 6px 0 0;
    padding-top: 8px;
    border-top: 1px solid var(--line);
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--ink-soft);
  }
  .req-note {
    color: var(--muted);
    font-size: 0.78rem;
  }
  .req {
    color: var(--danger);
    font-weight: 700;
  }
  .hint {
    color: var(--muted);
    font-size: 0.8rem;
  }
  .flash {
    background: var(--chip-green-bg);
    color: var(--chip-green-ink);
    font-weight: 600;
    font-size: 0.84rem;
    border-radius: var(--radius-control);
    padding: 8px 12px;
  }
  .flash.error {
    background: var(--g-grave-bg);
    color: var(--g-grave-ink);
  }
  .password {
    position: relative;
    display: block;
  }
  .password input {
    padding-right: 42px;
  }
  .peek {
    position: absolute;
    right: 3px;
    top: 3px;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    color: var(--muted);
  }
  .peek:hover {
    background: var(--surface-2);
    color: var(--ink);
  }
  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 6px;
    padding-top: 10px;
    border-top: 1px solid var(--line);
  }
</style>
