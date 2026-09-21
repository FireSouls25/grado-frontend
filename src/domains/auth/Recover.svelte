<script lang="ts">
  import { t } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';
  import { push } from 'svelte-spa-router';

  let identifier = '';
  let error = '';
  let busy = false;
  let sent = false;

  async function submit() {
    error = '';
    if (!identifier.trim()) {
      error = $t.recovery.missing;
      return;
    }
    busy = true;
    // Mockup: no backend call yet. Simulates the round trip.
    await new Promise((resolve) => setTimeout(resolve, 900));
    busy = false;
    sent = true;
  }
</script>

<div class="page narrow">
  <button type="button" class="back" on:click={() => push('/login')}>
    <Icon name="back" />
    <span>{$t.recovery.backToLogin}</span>
  </button>

  {#if !sent}
    <div class="hero">
      <div class="mark" aria-hidden="true">?</div>
      <h1>{$t.recovery.title}</h1>
      <p>{$t.recovery.body}</p>
    </div>

    <form class="card" on:submit|preventDefault={submit}>
      <label for="recovery-id">{$t.recovery.identifierLabel}</label>
      <input
        id="recovery-id"
        name="username"
        autocomplete="username"
        bind:value={identifier}
      />
      {#if error}
        <p class="error" role="alert">{error}</p>
      {/if}
      <button class="primary" type="submit" disabled={busy}>
        {busy ? $t.recovery.sending : $t.recovery.submit}
      </button>
    </form>
  {:else}
    <div class="hero">
      <div class="mark ok" aria-hidden="true"><Icon name="check" /></div>
      <h1>{$t.recovery.successTitle}</h1>
      <p>{$t.recovery.successBody}</p>
    </div>
    <div class="card">
      <p class="demo">{$t.recovery.demoNote}</p>
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
    font-weight: 800;
    font-size: 1.7rem;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 10px;
    animation: pop 0.4s cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
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
    animation: rise 0.3s ease both;
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
  .error {
    color: var(--danger);
    font-size: 0.9rem;
    font-weight: 600;
  }
  .demo {
    color: var(--muted);
    font-size: 0.85rem;
    background: var(--surface-2);
    border: 1px dashed var(--line);
    border-radius: var(--radius-chip);
    padding: 10px 14px;
  }
  .primary {
    margin-top: 8px;
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 700;
    min-height: 54px;
    border-radius: var(--radius-pill);
    transition:
      transform 0.1s ease,
      opacity 0.15s ease;
  }
  .primary:active {
    transform: scale(0.98);
  }
  .primary:disabled {
    opacity: 0.7;
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
