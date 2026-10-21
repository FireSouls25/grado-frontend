<script lang="ts">
  import { t } from '$lib/i18n';
  import { ApiError } from '$lib/api/types';
  import { profile } from './profile';

  let photoInput: HTMLInputElement | null = null;
  let photoError = '';

  $: me = $profile.me;
  $: teacher = me?.teacher ?? null;

  function roleLabel(role: string): string {
    if (role === 'admin') return $t.profile.roleAdmin;
    if (role === 'teacher') return $t.profile.roleTeacher;
    if (role === 'student') return $t.profile.roleStudent;
    return role;
  }

  function sexLabel(sex: string): string {
    if (sex === 'female') return $t.profile.sexFemale;
    if (sex === 'male') return $t.profile.sexMale;
    return '';
  }

  /** Iniciales del docente (apellidos + nombres) o del usuario. */
  function initials(): string {
    const source = teacher
      ? `${teacher.surnames} ${teacher.names}`
      : (me?.username ?? '');
    const parts = source.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    const first = parts[0]?.[0] ?? '';
    const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
    return (first + second).toUpperCase() || '?';
  }

  /** Edad cumplida hoy a partir de una fecha ISO (YYYY-MM-DD). */
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

  // Cambio de contraseña: solo carga la política del backend, no la
  // duplica; el mensaje de error llega traducido con la respuesta.
  let pwOpen = false;
  let pwSaving = false;
  let pwError = '';
  let pwFeedback = '';
  let pwCurrent = '';
  let pwNew = '';
  let pwShow = false;

  function togglePassword() {
    pwOpen = !pwOpen;
    pwError = '';
    pwFeedback = '';
    pwCurrent = '';
    pwNew = '';
    pwShow = false;
  }

  async function savePassword() {
    if (pwSaving) return;
    pwFeedback = '';
    if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(pwNew)) {
      pwError = $t.profile.passwordWeak;
      return;
    }
    pwSaving = true;
    try {
      await profile.changePassword(pwCurrent, pwNew);
      pwFeedback = $t.profile.passwordSaved;
      pwCurrent = '';
      pwNew = '';
      pwShow = false;
    } catch (err) {
      pwError = err instanceof ApiError ? err.message : $t.common.loadError;
    } finally {
      pwSaving = false;
    }
  }
</script>

<div class="body">
  <div class="head">
    <strong>{$t.profile.title}</strong>
    <span>{$t.profile.subtitle}</span>
  </div>

  {#if $profile.state === 'loading'}
    <p class="status">{$t.profile.loading}</p>
  {:else if $profile.state === 'error'}
    <div class="status" role="alert">
      <span>{$t.profile.loadError}</span>
      <button type="button" class="retry" on:click={() => profile.refresh()}>
        {$t.common.retry}
      </button>
    </div>
  {:else if me}
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
        <div class="chips" aria-label={$t.profile.roles}>
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

    {#if teacher}
      <dl class="dl">
        {#if me.username}
          <div class="row"><dt>{$t.profile.username}</dt><dd>{me.username}</dd></div>
        {/if}
        {#if me.email}
          <div class="row"><dt>{$t.profile.email}</dt><dd>{me.email}</dd></div>
        {/if}
        {#if teacher.phone}
          <div class="row"><dt>{$t.profile.phone}</dt><dd>{teacher.phone}</dd></div>
        {/if}
        {#if teacher.documentID}
          <div class="row"><dt>{$t.profile.document}</dt><dd>{teacher.documentID}</dd></div>
        {/if}
        {#if sexLabel(teacher.sex)}
          <div class="row"><dt>{$t.profile.sex}</dt><dd>{sexLabel(teacher.sex)}</dd></div>
        {/if}
        {#if teacher.birthdate}
          <div class="row"><dt>{$t.profile.birthdate}</dt><dd>{formatDate(teacher.birthdate)}</dd></div>
        {/if}
        {#if ageFrom(teacher.birthdate) !== null}
          <div class="row">
            <dt>{$t.profile.age}</dt>
            <dd>{$t.profile.ageYears(ageFrom(teacher.birthdate) ?? 0)}</dd>
          </div>
        {/if}
        {#if me.createdAt}
          <div class="row"><dt>{$t.profile.memberSince}</dt><dd>{formatTimestamp(me.createdAt)}</dd></div>
        {/if}
        <div class="row"><dt>{$t.profile.accountID}</dt><dd class="mono">{me.subject}</dd></div>
      </dl>
    {:else}
      <div class="note">
        <strong>{$t.profile.noTeacherTitle}</strong>
        <span>{$t.profile.noTeacherBody}</span>
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
      </div>
    {/if}

    <section class="pw">
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
          {#if pwFeedback}<p class="ok" role="status">{pwFeedback}</p>{/if}
          <button type="submit" class="primary" disabled={pwSaving}>
            {pwSaving ? '…' : $t.profile.passwordSave}
          </button>
        </form>
      {/if}
    </section>
  {/if}

  <input
    bind:this={photoInput}
    type="file"
    accept="image/*"
    hidden
    on:change={onPhotoPicked}
  /></div>

<style>
  .body {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 6px 8px 10px;
  }
  .head {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .head strong {
    font-size: 0.95rem;
  }
  .head span {
    color: var(--muted);
    font-size: 0.78rem;
  }
  .status {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 16px 12px;
    text-align: center;
    color: var(--muted);
    font-size: 0.85rem;
  }
  .retry {
    color: var(--accent);
    font-weight: 700;
    font-size: 0.8rem;
    min-height: 36px;
    padding: 0 8px;
  }
  .identity {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .avatar {
    flex: none;
    width: 64px;
    height: 64px;
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
    font-size: 1.3rem;
  }
  .who {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .name {
    font-size: 1rem;
    line-height: 1.25;
    overflow-wrap: anywhere;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .chip {
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 0.7rem;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: var(--radius-pill);
  }
  .photolinks {
    display: flex;
    gap: 12px;
  }
  .link {
    color: var(--accent);
    font-weight: 600;
    font-size: 0.78rem;
    min-height: 32px;
    padding: 0 2px;
  }
  .link.danger {
    color: var(--danger);
  }
  .flash {
    color: var(--danger);
    font-size: 0.78rem;
  }
  .dl {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    font-size: 0.85rem;
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
    font-size: 0.75rem;
    color: var(--ink-soft);
  }
  .note {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
  }
  .note strong {
    font-size: 0.85rem;
  }
  .note span {
    color: var(--muted);
    font-size: 0.8rem;
  }
  .pw {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 12px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
  }
  .pw-toggle {
    color: var(--accent);
    font-weight: 700;
    font-size: 0.82rem;
    min-height: 36px;
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
    font-size: 0.78rem;
    font-weight: 600;
  }
  .pwform input {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 10px 12px;
    font-size: 0.88rem;
  }
  .pwform input:focus {
    outline: 2px solid var(--accent);
    outline-offset: 0;
  }
  .pwform .show {
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 600;
    align-self: flex-start;
    min-height: 28px;
    padding: 0 2px;
  }
  .pwform .ok {
    background: var(--chip-green-bg);
    color: var(--chip-green-ink);
    font-weight: 600;
    font-size: 0.78rem;
    border-radius: var(--radius-chip);
    padding: 8px 10px;
  }
  .pwform .primary {
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 700;
    font-size: 0.85rem;
    min-height: 44px;
    border-radius: var(--radius-pill);
  }
  .pwform .primary:disabled {
    opacity: 0.7;
  }
</style>
