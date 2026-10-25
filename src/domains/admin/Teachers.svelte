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
  import { teachers, teacherDetail, createTeacher, createUser, listSubjects, scheduleEntries, groupsByYear, updateTeacher, type TeacherSummary, type TeacherDetail, type YearGroup } from './api';
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

  // Asignar dirección de grupo: el salón dirigido vive en la ficha
  // (HomeroomClassID) y se edita con el mismo PUT de docentes.
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

  async function openAssign(teacher: TeacherSummary) {
    assigning = teacher;
    dirValue = teacher.HomeroomClassID ?? '';
    dirError = '';
    if (dirGroupsState === 'idle') {
      dirGroupsState = 'loading';
      try {
        dirGroups = (await guarded(() => groupsByYear(currentYear))) ?? [];
      } catch {
        dirGroups = [];
      } finally {
        dirGroupsState = 'ready';
      }
    }
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
    // Materias leídas del horario: una entrada por docente, catálogo una vez.
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
        Sex: form.Sex
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
          // Old backend without POST /v1/users: the profile exists,
          // the login stays pending instead of failing silently.
          if (!(err instanceof ApiError && isMissing(err))) throw err;
          extra = ' ' + $t.admin.accountPending;
        }
      }
      feedback = $t.admin.createdTeacher + extra;
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
  <TopBar title={$t.admin.teachersTitle} showBack onBack={() => goBack('/admin')}><TopActions /></TopBar>

  <div class="pagehead">
    <p class="eyebrow">{$t.admin.consoleEyebrow}</p>
    <div class="toolbar">
      <label class="search">
        <Icon name="search" />
        <input type="search" placeholder={$t.admin.teachersSearch} aria-label={$t.admin.teachersSearch} bind:value={search} />
      </label>
      {#if canManageUsers(roles)}
        <button type="button" class="new" on:click={() => { creating = true; feedback = ''; error = ''; }}>
          {$t.admin.newTeacher}
        </button>
      {/if}
    </div>
    <div class="filters" role="group" aria-label={$t.admin.teachersTitle}>
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
  </div>

  <div class="actions" role="group" aria-label={$t.admin.teachersTitle}>
    <button type="button" class="act primary" on:click={() => push('/admin/docentes/lista')}>
      {$t.troll.rollAction}
    </button>
    <button type="button" class="act" on:click={() => push('/admin/docentes/historial')}>
      {$t.troll.historyAction}
    </button>
  </div>

  <div class="sheet">
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
    <ul class="roster">
      {#each visible as teacher (teacher.ID)}
        {@const detail = details[teacher.ID]}
        {@const subjects = taught[teacher.ID] ?? []}
        {@const contact = [teacher.DocumentID, detail?.Phone, detail?.Email].filter(Boolean).join(' · ')}
        <li class="trow">
          <button
            type="button"
            class="row"
            on:click={() => push(`/admin/docentes/${encodeURIComponent(teacher.ID)}`)}
          >
            <span class="who">
              <span class="liner">
                <span class="avatar" aria-hidden="true">{initialsOf(teacher.Surnames, teacher.Names)}</span>
                <span class="name">{teacher.Surnames} {teacher.Names}</span>
                {#if !teacher.Active}<span class="pill off">{$t.admin.inactive}</span>{/if}
              </span>
              <span class="sub">{contact || teacher.DocumentID}</span>
              <span class="tags">
                {#if teacher.HomeroomClassID}
                  <span class="pill dir">{$t.admin.directs(teacher.HomeroomClassID)}</span>
                {:else}
                  <span class="pill">{$t.admin.rolePlain}</span>
                {/if}
                {#each subjects.slice(0, 3) as subject}<span class="pill sub" style={tint(subject.color)}>{subject.name}</span>{/each}
                {#if subjects.length === 0}<span class="pill mute">{$t.admin.noSubjects}</span>{/if}
              </span>
            </span>
            <span class="go" aria-hidden="true"><Icon name="next" /></span>
          </button>
          {#if canManageUsers(roles)}
            <button
              type="button"
              class="assignbar"
              on:click={() => openAssign(teacher)}
            >
              {teacher.HomeroomClassID ? $t.admin.modifyDirection : $t.admin.assignDirectionLine}
            </button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
  </div>
</AdminShell>

<Sheet open={creating} title={$t.admin.newTeacher} onClose={() => (creating = false)}>
  <form class="form" on:submit|preventDefault={save}>
    <div class="row2">
      <label>{$t.admin.formNames}<input bind:value={form.Names} autocomplete="off" /></label>
      <label>{$t.admin.formSurnames}<input bind:value={form.Surnames} autocomplete="off" /></label>
    </div>
    <div class="row2">
      <label
        >{$t.admin.formDocument}<input
          bind:value={form.DocumentID}
          placeholder={$t.admin.formDocumentPlaceholder}
          inputmode="numeric"
          pattern="[0-9]*"
          autocomplete="off"
        /></label
      >
      <label
        >{$t.admin.formPhone}<input
          bind:value={form.Phone}
          type="tel"
          inputmode="tel"
          autocomplete="off"
        /></label
      >
    </div>
    <div class="row2">
      <label
        >{$t.admin.formEmail}<input
          bind:value={form.Email}
          type="email"
          inputmode="email"
          autocapitalize="none"
          autocomplete="off"
        /></label
      >
      <label
        >{$t.admin.formSex}
        <select bind:value={form.Sex}>
          <option value="">{$t.admin.formSexNone}</option>
          <option value="female">{$t.admin.formSexFemale}</option>
          <option value="male">{$t.admin.formSexMale}</option>
        </select></label
      >
    </div>
    <div class="row2">
      <label
        >{$t.admin.formUsername}<input
          bind:value={form.Username}
          placeholder={$t.admin.formUsernamePlaceholder}
          autocapitalize="none"
          autocomplete="off"
        /></label
      >
      <label
        >{$t.admin.formPassword}
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
    <div class="actions">
      <button class="ghost" type="button" on:click={() => (creating = false)}>
        {$t.admin.formClose}
      </button>
      <button class="primary" type="submit" disabled={saving}>
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
        <div class="actions">
          <button class="ghost" type="button" on:click={() => (assigning = null)}>
            {$t.common.cancel}
          </button>
          <button class="primary" type="submit" disabled={dirSaving}>
            {dirSaving ? '…' : $t.common.save}
          </button>
        </div>
      </form>
    {/if}
  {/if}
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
    gap: 8px;
    align-items: center;
  }
  .search {
    display: flex;
    gap: 8px;
    align-items: center;
    background: var(--surface);
    border: 1px solid var(--line);
    box-shadow: var(--shadow);
    border-radius: 10px;
    padding: 9px 12px;
    color: var(--muted);
    min-height: 44px;
    flex: 1;
    min-width: 0;
  }
  .search input {
    border: 0;
    background: none;
    outline: none;
    width: 100%;
    color: var(--ink);
    font-size: 0.84rem;
  }
  .sheet {
    background: var(--surface);
    border: 1px solid var(--line);
    border-bottom: 0;
    border-radius: 24px 24px 0 0;
    padding: 16px 16px 130px;
  }
  .actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }
  .act {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0 20px;
    border-radius: var(--radius-pill);
    background: var(--surface);
    border: 1px solid var(--line);
    font-weight: 700;
    font-size: 0.85rem;
    color: var(--ink);
  }
  .act.primary {
    background: var(--accent);
    border-color: transparent;
    color: #fff;
  }
  @media (min-width: 700px) {
    .sheet {
      padding: 20px 20px 130px;
    }
  }
  .new {
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 700;
    min-height: 48px;
    padding: 10px 22px;
    border-radius: var(--radius-pill);
    white-space: nowrap;
    flex: none;
  }
  .new:active {
    transform: scale(0.97);
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
  .row2 {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
  }
  @media (min-width: 420px) {
    .row2 {
      grid-template-columns: 1fr 1fr;
    }
  }
  .form input,
  .form select {
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 12px 14px;
    min-height: 52px;
    width: 100%;
    color: var(--ink);
    font: inherit;
  }
  .form input:focus,
  .form select:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .hint {
    color: var(--muted);
    font-size: 0.85rem;
  }
  .flash {
    background: var(--chip-green-bg);
    color: var(--chip-green-ink);
    font-weight: 600;
    font-size: 0.9rem;
    border-radius: var(--radius-chip);
    padding: 10px 14px;
  }
  .flash.error {
    background: var(--surface-2);
    color: var(--danger);
  }
  .password {
    position: relative;
    display: block;
  }
  .password input {
    padding-right: 52px;
  }
  .peek {
    position: absolute;
    right: 4px;
    top: 4px;
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-pill);
    color: var(--muted);
  }
  .peek:hover {
    background: var(--surface-2);
    color: var(--ink);
  }
  .primary {
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 700;
    min-height: 54px;
    border-radius: var(--radius-pill);
    margin-top: 4px;
  }
  .primary:disabled {
    opacity: 0.7;
  }
  .actions {
    display: flex;
    gap: 10px;
    margin-top: 4px;
  }
  .actions .primary {
    flex: 1;
    margin-top: 0;
  }
  .ghost {
    min-height: 54px;
    padding: 10px 22px;
    border-radius: var(--radius-pill);
    border: 1px solid var(--line);
    background: var(--surface-2);
    color: var(--ink);
    font-weight: 700;
  }
  .ghost:active {
    transform: scale(0.98);
  }
  .filters {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr auto;
    gap: 8px;
    margin-top: 10px;
    align-items: end;
  }
  .count {
    align-self: center;
    color: var(--muted);
    font-size: 0.82rem;
    font-weight: 600;
    white-space: nowrap;
    padding-bottom: 10px;
  }
  .liner {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .liner .name {
    flex: 1;
  }
  .avatar {
    width: 38px;
    height: 38px;
    flex: none;
    border-radius: 999px;
    border: 1px solid var(--ink);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 0.72rem;
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 6px;
  }
  .pill {
    font-size: 0.7rem;
    font-weight: 700;
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
  }
  .pill.off {
    background: var(--g-grave-bg);
    color: var(--g-grave-ink);
  }
  .pill.mute {
    background: transparent;
    border: 1px dashed var(--line);
    color: var(--muted);
  }
  @media (max-width: 700px) {
    .filters {
      grid-template-columns: 1fr 1fr;
    }
    .count {
      grid-column: 1 / -1;
      padding-bottom: 0;
    }
  }
  .roster {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .trow {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    overflow: hidden;
    animation: rise 0.25s ease both;
  }
  .assignbar {
    width: 100%;
    display: flex;
    align-items: center;
    min-height: 48px;
    padding: 10px 16px;
    border-top: 1px solid var(--line);
    background: var(--surface-2);
    color: var(--accent);
    font-weight: 700;
    font-size: 0.85rem;
  }
  .assignbar:active {
    transform: scale(0.99);
  }
  .row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    text-align: left;
    background: none;
    border: 0;
    padding: 14px 16px;
    min-height: 68px;
    transition: transform 0.1s ease;
  }
  .row:active {
    transform: scale(0.98);
  }
  .who {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .name {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sub {
    color: var(--muted);
    font-size: 0.85rem;
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
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
</style>
