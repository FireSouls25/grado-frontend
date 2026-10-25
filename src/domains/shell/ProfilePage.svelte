<script lang="ts">
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import ErrorState from '$lib/ui/ErrorState.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import Dropdown from '$lib/ui/Dropdown.svelte';
  import { notify } from '$lib/ui/notice';
  import { t } from '$lib/i18n';
  import { ApiError } from '$lib/api/types';
  import { profile } from '$lib/shell/profile';
  import { authNotice, session } from '../auth/session';
  import { updateMyTeacher, daySchedule, type TeacherClass } from '../teacher/api';

  $: me = $profile.me;
  $: teacher = me?.teacher ?? null;
  import { isAdmin as hasAdminConsole, isSecretary } from '$lib/access';

  $: isAdmin = hasAdminConsole(me?.roles);
  $: staffView = isAdmin || isSecretary(me?.roles);

  function roleLabel(role: string): string {
    if (role === 'admin') return $t.profile.roleAdmin;
    if (role === 'teacher') return $t.profile.roleTeacher;
    if (role === 'student') return $t.profile.roleStudent;
    if (role === 'secretary') return $t.profile.roleSecretary;
    return role;
  }

  function sexLabel(sex: string): string {
    if (sex === 'female') return $t.profile.sexFemale;
    if (sex === 'male') return $t.profile.sexMale;
    return '';
  }

  function initials(): string {
    const source = teacher ? `${teacher.surnames} ${teacher.names}` : (me?.username ?? '');
    const parts = source.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    const first = parts[0]?.[0] ?? '';
    const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
    return (first + second).toUpperCase() || '?';
  }

  function ageFrom(iso: string): number | null {
    if (!iso) return null;
    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d) return null;
    const birth = new Date(y, m - 1, d);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const beforeBirthday =
      today.getMonth() < birth.getMonth() ||
      (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate());
    if (beforeBirthday) age--;
    return age >= 0 ? age : null;
  }

  function formatDate(iso: string): string {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d) return iso;
    return new Date(y, m - 1, d).toLocaleDateString('es-CO', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }

  function formatTimestamp(rfc3339: string): string {
    const date = new Date(rfc3339);
    if (Number.isNaN(date.getTime())) return rfc3339;
    return date.toLocaleDateString('es-CO', { dateStyle: 'long' });
  }

  onMount(() => {
    if ($profile.state === 'idle') void profile.refresh();
    void loadGroups();
  });

  // Salones asignados: se derivan del horario propio (un día por vez),
  // agrupados por salón. Si el horario falla, la tarjeta pinta vacío
  // honesto en vez de bloquear la página.
  let groups: { gid: string; label: string; subjects: string[] }[] = [];
  let groupsState: 'loading' | 'ready' = 'loading';

  async function loadGroups() {
    if (!teacher) {
      groupsState = 'ready';
      return;
    }
    try {
      const days: TeacherClass[][] = await Promise.all(
        [1, 2, 3, 4, 5, 6, 7].map((w) => daySchedule(w).catch(() => [] as TeacherClass[]))
      );
      const byGroup = new Map<string, { gid: string; subjects: Set<string> }>();
      for (const entries of days) {
        for (const e of entries) {
          if (!e.ClassLabel) continue;
          let g = byGroup.get(e.ClassLabel);
          if (!g) {
            g = { gid: e.GroupID ?? '', subjects: new Set() };
            byGroup.set(e.ClassLabel, g);
          }
          if (e.SubjectName) g.subjects.add(e.SubjectName);
        }
      }
      groups = [...byGroup.entries()]
        .map(([label, g]) => ({ gid: g.gid, label, subjects: [...g.subjects].sort((a, b) => a.localeCompare(b, 'es')) }))
        .sort((a, b) => a.label.localeCompare(b.label, 'es'));
    } catch {
      groups = [];
    } finally {
      groupsState = 'ready';
    }
  }

  // Foto propia: escribe en la ficha vinculada o en la cuenta.
  let photoInput: HTMLInputElement | null = null;
  let photoError = '';

  async function onPhotoPicked(e: Event) {
    photoError = '';
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (photoInput) photoInput.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      photoError = $t.profile.photoTooLarge;
      return;
    }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      await profile.savePhoto(dataUrl);
    } catch (err) {
      photoError = err instanceof ApiError ? err.message : $t.common.loadError;
    }
  }

  async function removePhoto() {
    photoError = '';
    try {
      await profile.savePhoto('');
    } catch (err) {
      photoError = err instanceof ApiError ? err.message : $t.common.loadError;
    }
  }

  // Actualizar información: solo contacto y salud de la ficha propia.
  // La identidad (nombres, cédula), la dirección de grupo y el estado
  // los administra el colegio.
  let editing = false;
  let saving = false;
  let editError = '';
  let form = { Phone: '', Email: '', Address: '', Birthplace: '', Birthdate: '', Sex: '', MedicalConditions: '' };

  $: sexOptions = [
    { value: '', label: $t.admin.formSexNone },
    { value: 'female', label: $t.admin.formSexFemale },
    { value: 'male', label: $t.admin.formSexMale }
  ];

  function startEdit() {
    if (!teacher) return;
    form = {
      Phone: teacher.phone ?? '',
      Email: teacher.email ?? '',
      Address: teacher.address ?? '',
      Birthplace: teacher.birthplace ?? '',
      Birthdate: (teacher.birthdate ?? '').slice(0, 10),
      Sex: teacher.sex ?? '',
      MedicalConditions: teacher.medicalConditions ?? ''
    };
    editError = '';
    editing = true;
  }

  async function saveEdit() {
    if (saving) return;
    editError = '';
    if (form.Email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.Email.trim())) {
      editError = $t.admin.formEmailInvalid;
      return;
    }
    if (form.Birthdate && !/^\d{4}-\d{2}-\d{2}$/.test(form.Birthdate)) {
      editError = $t.common.loadError;
      return;
    }
    saving = true;
    try {
      await updateMyTeacher({
        Phone: form.Phone.trim(),
        Email: form.Email.trim(),
        Address: form.Address.trim(),
        Birthplace: form.Birthplace.trim(),
        ...(form.Birthdate ? { Birthdate: form.Birthdate } : {}),
        Sex: form.Sex === 'female' || form.Sex === 'male' ? form.Sex : '',
        MedicalConditions: form.MedicalConditions.trim()
      });
      await profile.refresh();
      editing = false;
      notify($t.profile.updated);
    } catch (err) {
      editError = err instanceof ApiError ? err.message : $t.common.loadError;
    } finally {
      saving = false;
    }
  }

  // Cambio de contraseña: cierra todas las sesiones al guardar.
  let pwOpen = false;
  let pwSaving = false;
  let pwError = '';
  let pwCurrent = '';
  let pwNew = '';
  let pwShow = false;

  function togglePassword() {
    pwOpen = !pwOpen;
    pwError = '';
    pwCurrent = '';
    pwNew = '';
    pwShow = false;
  }

  async function savePassword() {
    if (pwSaving) return;
    if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(pwNew)) {
      pwError = $t.profile.passwordWeak;
      return;
    }
    pwSaving = true;
    try {
      await profile.changePassword(pwCurrent, pwNew);
      pwCurrent = '';
      pwNew = '';
      pwShow = false;
      pwOpen = false;
      authNotice.set('passwordChanged');
      await session.logout();
      push('/login');
    } catch (err) {
      pwError = err instanceof ApiError ? err.message : $t.common.loadError;
    } finally {
      pwSaving = false;
    }
  }
</script>

<div class="page">
  <TopBar title={$t.profile.pageTitle} showBack>
    <TopActions settings={false} help={false} />
  </TopBar>
  <p class="lede">{$t.profile.pageSubtitle}</p>

  {#if $profile.state === 'loading' || $profile.state === 'idle'}
    <Skeleton rows={4} />
  {:else if $profile.state === 'error' || !me}
    <ErrorState error={$profile.error} onRetry={() => profile.refresh()} />
  {:else}
    <section class="card" aria-label={$t.profile.accountTitle}>
      <div class="identity">
        {#if $profile.photoUrl}
          <img class="avatar" src={$profile.photoUrl} alt={teacher ? `${teacher.surnames} ${teacher.names}` : (me.username ?? '')} />
        {:else}
          <div class="avatar placeholder" aria-hidden="true">{initials()}</div>
        {/if}
        <div class="who">
          <strong class="name">
            {teacher ? `${teacher.surnames} ${teacher.names}` : (me.username || $t.common.noData)}
          </strong>
          <div class="chips">
            {#each me.roles as role (role)}
              <span class="chip">{roleLabel(role)}</span>
            {/each}
          </div>
          <div class="photolinks">
            <button type="button" class="link" on:click={() => photoInput?.click()}>
              {$t.profile.photoChange}
            </button>
            {#if $profile.photoUrl}
              <button type="button" class="link danger" on:click={removePhoto}>
                {$t.profile.photoRemove}
              </button>
            {/if}
          </div>
          {#if photoError}<p class="flash" role="alert">{photoError}</p>{/if}
        </div>
      </div>
      <dl class="dl">
        {#if me.username}
          <div class="row"><dt>{$t.profile.username}</dt><dd>{me.username}</dd></div>
        {/if}
        {#if me.email}
          <div class="row"><dt>{$t.profile.email}</dt><dd>{me.email}</dd></div>
        {/if}
        {#if me.createdAt}
          <div class="row"><dt>{$t.profile.memberSince}</dt><dd>{formatTimestamp(me.createdAt)}</dd></div>
        {/if}
        <div class="row"><dt>{$t.profile.accountID}</dt><dd class="mono">{me.subject}</dd></div>
      </dl>
      <input bind:this={photoInput} type="file" accept="image/*" hidden on:change={onPhotoPicked} />
    </section>

    {#if teacher}
      <section class="card" aria-label={$t.profile.fileTitle}>
        <div class="row-head">
          <h2>{$t.profile.fileTitle}</h2>
          <button type="button" class="mini" on:click={startEdit}>{$t.profile.updateAction}</button>
        </div>
        <h3 class="sub">{$t.troll.filePersonalTitle}</h3>
        <dl class="dl">
          {#if teacher.documentID}
            <div class="row"><dt>{$t.profile.document}</dt><dd>{teacher.documentID}</dd></div>
          {/if}
          {#if teacher.birthdate}
            <div class="row">
              <dt>{$t.profile.birthdate}</dt>
              <dd>{formatDate(teacher.birthdate)}{#if ageFrom(teacher.birthdate) !== null} · {$t.profile.ageYears(ageFrom(teacher.birthdate) ?? 0)}{/if}</dd>
            </div>
          {/if}
          {#if teacher.birthplace}
            <div class="row"><dt>{$t.profile.birthplace}</dt><dd>{teacher.birthplace}</dd></div>
          {/if}
          {#if sexLabel(teacher.sex)}
            <div class="row"><dt>{$t.profile.sex}</dt><dd>{sexLabel(teacher.sex)}</dd></div>
          {/if}
        </dl>
        <h3 class="sub">{$t.troll.fileContactTitle}</h3>
        <dl class="dl">
          {#if teacher.phone}
            <div class="row"><dt>{$t.profile.phone}</dt><dd>{teacher.phone}</dd></div>
          {/if}
          {#if teacher.address}
            <div class="row"><dt>{$t.profile.address}</dt><dd>{teacher.address}</dd></div>
          {/if}
          {#if teacher.email}
            <div class="row"><dt>{$t.profile.email}</dt><dd>{teacher.email}</dd></div>
          {/if}
        </dl>
        {#if teacher.medicalConditions}
          <h3 class="sub">{$t.troll.fileHealthTitle}</h3>
          <p class="muted">{teacher.medicalConditions}</p>
        {/if}
        {#if teacher.homeroomClassID}
          <div class="statusrow">
            <span class="chip chip-sky">{$t.admin.directs(teacher.homeroomClassID)}</span>
          </div>
        {/if}
      </section>

      <section class="card" aria-label={$t.profile.groupsTitle}>
        <div class="row-head">
          <h2>{$t.profile.groupsTitle}</h2>
          <span class="count" role="status">{groups.length}</span>
        </div>
        {#if groupsState === 'loading'}
          <Skeleton rows={2} />
        {:else if groups.length === 0}
          <p class="muted">{$t.profile.groupsEmpty}</p>
        {:else}
          <ul class="sgroups">
            {#each groups as g (g.label)}
              <li>
                {#if g.gid}
                  <button
                    type="button" class="grow"
                    on:click={() => push(`/admin/estudiantes?salon=${encodeURIComponent(g.gid)}`)}
                  >
                    <strong>{g.label}</strong>
                    <span class="chips">
                      {#each g.subjects as s}<span class="chip">{s}</span>{/each}
                    </span>
                  </button>
                {:else}
                  <strong>{g.label}</strong>
                  <span class="chips">
                    {#each g.subjects as s}<span class="chip">{s}</span>{/each}
                  </span>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {:else if staffView}
      <section class="card" aria-label={$t.profile.fileTitle}>
        <div class="row-head">
          <h2>{$t.profile.fileTitle}</h2>
        </div>
        <p class="muted">{$t.profile.noTeacherBody}</p>
        <dl class="dl">
          {#if me.username}
            <div class="row"><dt>{$t.profile.username}</dt><dd>{me.username}</dd></div>
          {/if}
          {#if me.email}
            <div class="row"><dt>{$t.profile.email}</dt><dd>{me.email}</dd></div>
          {/if}
          <div class="row"><dt>{$t.profile.roles}</dt><dd>{me.roles.map(roleLabel).join(', ')}</dd></div>
        </dl>
      </section>
    {/if}

    <section class="card" aria-label={$t.profile.passwordEdit}>
      <button type="button" class="pw-toggle" aria-expanded={pwOpen} on:click={togglePassword}>
        {$t.profile.passwordEdit}
      </button>
      {#if pwOpen}
        <form class="pwform" on:submit|preventDefault={savePassword}>
          <label>
            <span>{$t.profile.passwordCurrent}</span>
            <input type={pwShow ? 'text' : 'password'} bind:value={pwCurrent} autocomplete="current-password" />
          </label>
          <label>
            <span>{$t.profile.passwordNew}</span>
            <input type={pwShow ? 'text' : 'password'} bind:value={pwNew} autocomplete="new-password" />
          </label>
          <button type="button" class="show" aria-pressed={pwShow} on:click={() => (pwShow = !pwShow)}>
            {pwShow ? $t.login.hidePassword : $t.login.showPassword}
          </button>
          {#if pwError}<p class="flash" role="alert">{pwError}</p>{/if}
          <button type="submit" class="primary" disabled={pwSaving}>
            {pwSaving ? '…' : $t.profile.passwordSave}
          </button>
        </form>
      {/if}
    </section>
  {/if}
</div>

<Sheet open={editing} title={$t.profile.editTitle} onClose={() => (editing = false)}>
  <form class="form" on:submit|preventDefault={saveEdit}>
    <div class="row2">
      <label>{$t.profile.phone}<input bind:value={form.Phone} inputmode="tel" autocomplete="off" /></label>
      <label>{$t.profile.email}<input bind:value={form.Email} inputmode="email" autocapitalize="none" autocomplete="off" /></label>
    </div>
    <label>{$t.profile.address}<input bind:value={form.Address} autocomplete="off" /></label>
    <div class="row2">
      <label>{$t.profile.birthplace}<input bind:value={form.Birthplace} autocomplete="off" /></label>
      <label>{$t.profile.birthdate}<input type="date" bind:value={form.Birthdate} /></label>
    </div>
    <label>
      <span>{$t.profile.sex}</span>
      <Dropdown label={$t.profile.sex} value={form.Sex} options={sexOptions} on:select={(e) => (form.Sex = String(e.detail))} />
    </label>
    <label>{$t.profile.medical}<textarea rows="2" bind:value={form.MedicalConditions}></textarea></label>
    {#if editError}<p class="flash error" role="alert">{editError}</p>{/if}
    <div class="actions">
      <button class="ghost" type="button" on:click={() => (editing = false)}>{$t.common.cancel}</button>
      <button class="primary" type="submit" disabled={saving}>{saving ? '…' : $t.common.save}</button>
    </div>
  </form>
</Sheet>

<style>
  .page {
    padding-bottom: calc(24px + env(safe-area-inset-bottom));
  }
  .lede {
    color: var(--muted);
    font-size: 0.85rem;
    margin: 0 0 12px;
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
  .identity {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
  }
  .avatar {
    flex: none;
    width: 72px;
    height: 72px;
    border-radius: 999px;
    object-fit: cover;
    border: 1px solid var(--line);
  }
  .avatar.placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--tint);
    color: var(--muted);
    font-weight: 700;
    font-size: 1.4rem;
  }
  .who {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .name {
    font-size: 1.05rem;
    line-height: 1.25;
    overflow-wrap: anywhere;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 0.72rem;
    font-weight: 700;
    padding: 3px 10px;
    border-radius: var(--radius-pill);
  }
  .chip-sky {
    background: var(--chip-sky-bg);
    color: var(--chip-sky-ink);
  }
  .photolinks {
    display: flex;
    gap: 12px;
  }
  .link {
    color: var(--accent);
    font-weight: 600;
    font-size: 0.8rem;
    min-height: 32px;
    padding: 0 2px;
  }
  .link.danger {
    color: var(--danger);
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
    color: var(--g-grave-ink);
  }
  p.flash {
    margin: 8px 0 0;
  }
  .dl {
    margin: 8px 0 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    font-size: 0.9rem;
  }
  .row dt {
    color: var(--muted);
    flex: none;
  }
  .row dd {
    margin: 0;
    font-weight: 600;
    text-align: right;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .row dd.mono {
    font-variant-numeric: tabular-nums;
    font-size: 0.78rem;
    color: var(--ink-soft);
  }
  .row-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 8px;
  }
  .row-head h2 {
    font-size: 1rem;
    margin: 0;
  }
  .mini {
    border: 1px solid var(--line);
    border-radius: var(--radius-pill);
    padding: 8px 16px;
    min-height: 44px;
    font-weight: 600;
    font-size: 0.85rem;
    background: var(--surface);
    color: var(--accent);
  }
  .sub {
    font-size: 0.8rem;
    font-weight: 700;
    margin: 14px 0 2px;
  }
  .muted {
    color: var(--muted);
    font-size: 0.92rem;
  }
  .statusrow {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 12px;
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
  .sgroups {
    list-style: none;
    margin: 12px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .sgroups li {
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 10px 14px;
  }
  .grow {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    text-align: left;
    background: none;
    border: 0;
    padding: 0;
    font: inherit;
    color: inherit;
    cursor: pointer;
  }
  .sgroups li > strong {
    min-width: 52px;
    font-variant-numeric: tabular-nums;
  }
  .sgroups .chips {
    flex: 1;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .sgroups .chip {
    background: var(--surface);
    border: 1px solid var(--line);
    color: var(--ink-soft);
  }
  .pw-toggle {
    color: var(--accent);
    font-weight: 700;
    font-size: 0.88rem;
    min-height: 44px;
    text-align: left;
    padding: 0 2px;
  }
  .pwform {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-top: 8px;
  }
  .pwform label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.82rem;
    font-weight: 600;
  }
  .pwform input {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 12px 14px;
    font-size: 0.92rem;
  }
  .pwform .show {
    color: var(--muted);
    font-size: 0.78rem;
    font-weight: 600;
    align-self: flex-start;
    min-height: 32px;
    padding: 0 2px;
  }
  .pwform .primary {
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 700;
    font-size: 0.88rem;
    min-height: 48px;
    border-radius: var(--radius-pill);
  }
  .pwform .primary:disabled {
    opacity: 0.7;
  }
  .form {
    display: flex;
    flex-direction: column;
    gap: 10px;
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
  .form label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.85rem;
    font-weight: 600;
  }
  .form input,
  .form textarea {
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 12px 14px;
    font-size: 0.92rem;
    width: 100%;
    font-family: inherit;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 6px;
  }
  .ghost,
  .primary {
    min-height: 48px;
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
