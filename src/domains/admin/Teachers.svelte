<script lang="ts">
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { t } from '$lib/i18n';
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import AdminTabs from './AdminTabs.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { teachers, createTeacher, createUser, type TeacherSummary } from './api';
  import { isMissing } from '../teacher/api';
  import { ApiError } from '$lib/api/types';
  import { guarded } from '$lib/nav';
  import Sheet from '$lib/ui/Sheet.svelte';

  let state: 'loading' | 'error' | 'ready' = 'loading';
  let list: TeacherSummary[] = [];

  let creating = false;
  let saving = false;
  let feedback = '';
  let error = '';
  let showPassword = false;
  let search = '';
  let form = freshForm();

  function freshForm() {
    return {
      Names: '',
      Surnames: '',
      DocumentID: '',
      Phone: '',
      Email: '',
      Username: '',
      Password: ''
    };
  }

  async function load() {
    state = 'loading';
    try {
      const data = await guarded(() => teachers());
      if (data === null) return;
      list = [...data].sort((a, b) =>
        `${a.Surnames} ${a.Names}`.toLowerCase() < `${b.Surnames} ${b.Names}`.toLowerCase() ? -1 : 1
      );
      state = 'ready';
    } catch (err) {
      state = err instanceof ApiError && isMissing(err) ? 'ready' : 'error';
    }
  }

  onMount(load);

  $: q = search.trim().toLowerCase();
  $: visible = list.filter((teacher) =>
    q
      ? `${teacher.Surnames} ${teacher.Names} ${teacher.DocumentID}`.toLowerCase().includes(q)
      : true
  );

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
      await createTeacher({
        Names: form.Names.trim(),
        Surnames: form.Surnames.trim(),
        DocumentID: form.DocumentID.trim(),
        Phone: form.Phone.trim(),
        Email: form.Email.trim()
      });
      let extra = '';
      const username = form.Username.trim();
      if (username) {
        try {
          await createUser({
            username,
            email: form.Email.trim(),
            password: form.Password,
            role: 'teacher'
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

<div class="page">
  <TopBar title={$t.admin.teachersTitle} showBack onBack={() => push('/admin')}><TopActions /></TopBar>

  <div class="pagehead">
    <p class="eyebrow">{$t.admin.consoleEyebrow}</p>
    <div class="toolbar">
      <label class="search">
        <Icon name="search" />
        <input type="search" placeholder={$t.admin.teachersSearch} aria-label={$t.admin.teachersSearch} bind:value={search} />
      </label>
      <button type="button" class="new" on:click={() => { creating = true; feedback = ''; error = ''; }}>
        {$t.admin.newTeacher}
      </button>
    </div>
  </div>

  <div class="sheet">
  {#if state === 'loading'}
    <Skeleton rows={4} />
  {:else if state === 'error'}
    <EmptyState
      icon="warn"
      title={$t.common.loadError}
      actionLabel={$t.common.retry}
      onAction={load}
    />
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
        <li>
          <button
            type="button"
            class="row"
            on:click={() => push(`/admin/docentes/${encodeURIComponent(teacher.ID)}`)}
          >
            <span class="who">
              <span class="name">{teacher.Surnames} {teacher.Names}</span>
              <span class="sub">
                {teacher.DocumentID}
                {#if teacher.HomeroomClassID}· {$t.admin.directs(teacher.HomeroomClassID)}{/if}
                {#if !teacher.Active}· {$t.admin.inactive}{/if}
              </span>
            </span>
            <span class="go" aria-hidden="true"><Icon name="next" /></span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
  </div>
</div>

<AdminTabs active="docentes" />

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
    <label
      >{$t.admin.formEmail}<input
        bind:value={form.Email}
        type="email"
        inputmode="email"
        autocapitalize="none"
        autocomplete="off"
      /></label
    >
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
  .form input {
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 12px 14px;
    min-height: 52px;
    width: 100%;
  }
  .form input:focus {
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
  .roster {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    text-align: left;
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    padding: 14px 16px;
    min-height: 68px;
    transition: transform 0.1s ease;
    animation: rise 0.25s ease both;
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
