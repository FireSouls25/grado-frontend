<script lang="ts">
  import { t } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';
  import { push } from 'svelte-spa-router';
  import { ApiError } from '$lib/api/types';
  import { resetPassword } from '../teacher/api';
  import { createCooldown } from './cooldown';
  import { onDestroy } from 'svelte';

  export let params: { token?: string } = {};

  $: token = decodeURIComponent(params.token ?? '');

  let password = '';
  let confirm = '';
  let showPassword = false;
  let error = '';
  let busy = false;
  let done = false;
  const cooldown = createCooldown();
  onDestroy(() => cooldown.stop());

  function passwordOk(value: string): boolean {
    if (value.length < 8 || value.length > 72) return false;
    return /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(value) && /[0-9]/.test(value);
  }

  async function submit() {
    error = '';
    if (!token) {
      error = $t.recovery.invalidToken;
      return;
    }
    if (!passwordOk(password)) {
      error = $t.recovery.passwordWeak;
      return;
    }
    if (password !== confirm) {
      error = $t.recovery.passwordsMismatch;
      return;
    }
    busy = true;
    try {
      await resetPassword(token, password);
      password = '';
      confirm = '';
      done = true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        error = err.message || $t.recovery.invalidToken;
      } else if (err instanceof ApiError && err.status === 429) {
        error = err.message || $t.login.rateLimited;
        cooldown.start(60);
      } else if (err instanceof ApiError) {
        error = err.message || $t.common.loadError;
      } else {
        error = $t.common.loadError;
      }
    } finally {
      busy = false;
    }
  }
</script>

<div class="page narrow">
  <button type="button" class="back" on:click={() => push('/login')}>
    <Icon name="back" />
    <span>{$t.recovery.backToLogin}</span>
  </button>

  {#if !done}
    <div class="hero">
      <div class="mark" aria-hidden="true"><Icon name="check" /></div>
      <h1>{$t.recovery.resetTitle}</h1>
      <p>{$t.recovery.resetBody}</p>
    </div>

    <form class="card" on:submit|preventDefault={submit}>
      <label for="new-password">{$t.recovery.newPasswordLabel}</label>
      <div class="password">
        <input
          id="new-password"
          name="new-password"
          type={showPassword ? 'text' : 'password'}
          autocomplete="new-password"
          enterkeyhint="next"
          bind:value={password}
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
      </div>

      <label for="confirm-password">{$t.recovery.confirmPasswordLabel}</label>
      <input
        id="confirm-password"
        name="new-password"
        type={showPassword ? 'text' : 'password'}
        autocomplete="new-password"
        enterkeyhint="go"
        bind:value={confirm}
      />

      {#if error}
        <p class="error" role="alert">{error}</p>
      {/if}
      <button class="primary" type="submit" disabled={busy || $cooldown > 0}>
        {busy ? $t.recovery.resetting : $cooldown > 0 ? $t.login.retryIn($cooldown) : $t.recovery.resetSubmit}
      </button>
      <a class="forgot" href="#/recuperar">{$t.recovery.requestNew}</a>
    </form>
  {:else}
    <div class="hero">
      <div class="mark ok" aria-hidden="true"><Icon name="check" /></div>
      <h1>{$t.recovery.resetSuccessTitle}</h1>
      <p>{$t.recovery.resetSuccessBody}</p>
    </div>
    <div class="card">
      <button class="primary" type="button" on:click={() => push('/login')}>
        {$t.recovery.backToLogin}
      </button>
    </div>
  {/if}
</div>

<style>
  .narrow {
    max-width: 480px;
  }
  .back {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--muted);
    font-weight: 600;
    min-height: 44px;
    margin-top: 8px;
  }
  .back:hover {
    color: var(--ink);
  }
  .hero {
    padding: 16px 4px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .hero p {
    color: var(--muted);
  }
  .mark {
    width: 56px;
    height: 56px;
    border-radius: 18px;
    background: var(--accent-soft);
    color: var(--accent);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 10px;
  }
  .mark.ok {
    background: var(--chip-green-bg);
    color: var(--chip-green-ink);
  }
  .card {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow);
    padding: 22px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .card label {
    font-weight: 600;
    font-size: 0.9rem;
  }
  .card input {
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 12px 14px;
    min-height: 52px;
    width: 100%;
  }
  .card input:focus {
    outline: 2px solid var(--accent);
    outline-offset: 0;
    border-color: var(--accent);
  }
  .password {
    position: relative;
  }
  .password .peek {
    position: absolute;
    right: 6px;
    top: 50%;
    transform: translateY(-50%);
    min-width: 44px;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--muted);
  }
  .error {
    color: var(--danger);
    font-size: 0.9rem;
    font-weight: 600;
  }
  .primary {
    margin-top: 8px;
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 700;
    min-height: 54px;
    border-radius: var(--radius-pill);
  }
  .primary:disabled {
    opacity: 0.7;
  }
  .forgot {
    text-align: center;
    color: var(--muted);
    font-weight: 600;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
</style>
