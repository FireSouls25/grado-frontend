<script lang="ts">
  import { t } from '$lib/i18n';
  import { session } from './session';
  import { push } from 'svelte-spa-router';

  let subject = '';
  let error = '';

  function submit() {
    error = '';
    if (!session.login(subject)) {
      error = $t.login.missingId;
      return;
    }
    push('/hoy');
  }
</script>

<div class="page">
  <div class="hero">
    <div class="mark" aria-hidden="true">G</div>
    <h1>{$t.login.title}</h1>
    <p>{$t.login.subtitle}</p>
  </div>

  <form class="card" on:submit|preventDefault={submit}>
    <label for="subject">{$t.login.subjectLabel}</label>
    <input
      id="subject"
      name="subject"
      autocomplete="username"
      placeholder="8f3a…"
      bind:value={subject}
    />
    <p class="hint">{$t.login.subjectHint}</p>
    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}
    <button class="primary" type="submit">{$t.login.submit}</button>
  </form>
</div>

<style>
  .hero {
    padding: 32px 4px 20px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .hero p {
    color: var(--muted);
  }
  .mark {
    width: 52px;
    height: 52px;
    border-radius: 16px;
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 800;
    font-size: 1.6rem;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 8px;
    box-shadow: var(--shadow);
  }
  .card {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow);
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    animation: rise 0.3s ease both;
  }
  label {
    font-weight: 600;
    font-size: 0.9rem;
  }
  input {
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 12px 14px;
    min-height: 52px;
    width: 100%;
  }
  input:focus {
    outline: 2px solid var(--accent);
    outline-offset: 0;
    border-color: var(--accent);
  }
  .hint {
    color: var(--muted);
    font-size: 0.85rem;
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
    min-height: 52px;
    border-radius: var(--radius-pill);
    transition: transform 0.1s ease, filter 0.15s ease;
  }
  .primary:hover {
    filter: brightness(1.05);
  }
  .primary:active {
    transform: scale(0.98);
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
