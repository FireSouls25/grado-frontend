<script lang="ts">
  import { t } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';
  import { session } from './session';
  import { resolveDevAccount, checkDevPassword } from './accounts';
  import { me } from '../teacher/api';
  import { ApiError } from '$lib/api/types';
  import { push } from 'svelte-spa-router';

  // Draft identifier only (never the password): survives any remount so
  // typed text is never lost. Cleared on successful login.
  const DRAFT_KEY = 'grado.loginDraft';

  function loadDraft(): string {
    try {
      return localStorage.getItem(DRAFT_KEY) ?? '';
    } catch {
      return '';
    }
  }

  let identifier = loadDraft();
  let password = '';
  let showPassword = false;
  let error = '';
  let busy = false;

  $: try {
    if (identifier) localStorage.setItem(DRAFT_KEY, identifier);
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }

  async function submit() {
    error = '';
    const account = resolveDevAccount(identifier);
    if (!identifier.trim() || !password) {
      error = $t.login.missingCredentials;
      return;
    }
    if (!account) {
      error = $t.login.unknownAccount;
      return;
    }
    if (!checkDevPassword(account, password)) {
      error = $t.login.invalidPassword;
      return;
    }
    session.login(account.id);
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
    busy = true;
    try {
      const profile = await me();
      push(profile.home || '/hoy');
    } catch (err) {
      // Visible failure: wrong navigation hides real problems. Tell the
      // user what happened and stay put instead of landing on an
      // unrelated page.
      busy = false;
      if (err instanceof ApiError) {
        error = err.message || $t.common.loadError;
      } else {
        error = $t.common.loadError;
      }
    }
  }
</script>

<div class="page login">
  <div class="split">
    <div class="hero">
      <div class="mark" aria-hidden="true">O</div>
      <p class="brand">{$t.login.brand}</p>
      <h1>{$t.login.title}</h1>
      <p class="tagline">{$t.login.tagline}</p>

      <ul class="features">
        {#each $t.login.features as feature}
          <li>
            <span class="tick" aria-hidden="true"><Icon name="check" /></span>
            <div>
              <strong>{feature.title}</strong>
              <p>{feature.body}</p>
            </div>
          </li>
        {/each}
      </ul>
    </div>

    <form class="card" on:submit|preventDefault={submit}>
      <h2>{$t.login.subtitle}</h2>

      <label for="identifier">{$t.login.identifierLabel}</label>
      <input
        id="identifier"
        name="username"
        autocomplete="username"
        autocapitalize="none"
        autocorrect="off"
        spellcheck="false"
        enterkeyhint="next"
        placeholder={$t.login.identifierPlaceholder}
        bind:value={identifier}
      />

      <label for="password">{$t.login.passwordLabel}</label>
      <div class="password">
        <input
          id="password"
          name="current-password"
          type={showPassword ? 'text' : 'password'}
          autocomplete="current-password"
          autocapitalize="none"
          autocorrect="off"
          spellcheck="false"
          enterkeyhint="go"
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

      {#if error}
        <p class="error" role="alert">{error}</p>
      {:else}
        <p class="error empty" aria-hidden="true">&nbsp;</p>
      {/if}

      <button class="primary" type="submit" disabled={busy}>
        {busy ? $t.login.signingIn : $t.login.submit}
      </button>

      <a class="forgot" href="#/recuperar">{$t.login.forgot}</a>
    </form>
  </div>

  <p class="footer">{$t.login.footer}</p>
</div>

<style>
  .login {
    max-width: 560px;
    min-height: 100svh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding-bottom: calc(24px + env(safe-area-inset-bottom));
  }
  .split {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .hero {
    padding: 20px 4px 4px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  .brand {
    color: var(--muted);
    font-weight: 700;
    font-size: 0.9rem;
    letter-spacing: 0.04em;
  }
  .hero h1 {
    font-size: 2.3rem;
  }
  .tagline {
    color: var(--muted);
    font-size: 1.05rem;
  }
  .mark {
    width: 64px;
    height: 64px;
    border-radius: 20px;
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 800;
    font-size: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 12px;
    box-shadow: var(--shadow);
    animation: pop 0.4s cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
  }
  .features {
    list-style: none;
    margin: 14px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .features li {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    animation: rise 0.35s ease both;
  }
  .features li:nth-child(2) {
    animation-delay: 0.06s;
  }
  .features li:nth-child(3) {
    animation-delay: 0.12s;
  }
  .tick {
    flex: none;
    width: 32px;
    height: 32px;
    border-radius: var(--radius-pill);
    background: var(--chip-green-bg);
    color: var(--chip-green-ink);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .tick :global(svg) {
    width: 16px;
    height: 16px;
  }
  .features strong {
    display: block;
    font-size: 0.95rem;
  }
  .features p {
    color: var(--muted);
    font-size: 0.9rem;
  }
  .card {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow);
    padding: 26px 24px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    animation: rise 0.3s ease both;
  }
  .card h2 {
    font-size: 1.1rem;
    color: var(--muted);
    font-weight: 600;
    margin-bottom: 6px;
  }
  .card label {
    font-weight: 600;
    font-size: 0.95rem;
  }
  .card input {
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 12px 16px;
    min-height: 56px;
    font-size: 1.02rem;
    width: 100%;
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease,
      background-color 0.2s ease;
  }
  .card input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .password {
    position: relative;
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
  .error {
    color: var(--danger);
    font-size: 0.92rem;
    font-weight: 600;
    min-height: 1.4em;
  }
  .error.empty {
    visibility: hidden;
  }
  .primary {
    margin-top: 8px;
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 700;
    font-size: 1.02rem;
    min-height: 54px;
    border-radius: var(--radius-pill);
    transition:
      transform 0.1s ease,
      filter 0.15s ease,
      opacity 0.15s ease;
  }
  .primary:hover {
    filter: brightness(1.05);
  }
  .primary:active {
    transform: scale(0.98);
  }
  .primary:disabled {
    opacity: 0.7;
  }
  .forgot {
    align-self: center;
    color: var(--accent);
    font-weight: 600;
    font-size: 0.92rem;
    padding: 10px;
    text-decoration: none;
  }
  .forgot:hover {
    text-decoration: underline;
  }
  .footer {
    margin-top: 20px;
    color: var(--muted);
    font-size: 0.85rem;
    text-align: center;
    padding-bottom: 8px;
  }

  @media (min-width: 900px) {
    .login {
      max-width: 920px;
    }
    .split {
      flex-direction: row;
      align-items: stretch;
      gap: 0;
      margin-top: 24px;
      border-radius: 24px;
      overflow: hidden;
      box-shadow: var(--shadow);
      border: 1px solid var(--line);
    }
    .hero {
      flex: 1.1;
      background: linear-gradient(160deg, var(--accent-soft), var(--surface) 75%);
      padding: 48px 40px;
    }
    .hero h1 {
      font-size: 2.4rem;
    }
    .card {
      flex: 1;
      border: none;
      border-radius: 0;
      box-shadow: none;
      padding: 48px 40px;
      justify-content: center;
    }
  }

  @keyframes pop {
    from {
      opacity: 0;
      transform: scale(0.7);
    }
    to {
      opacity: 1;
      transform: none;
    }
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
