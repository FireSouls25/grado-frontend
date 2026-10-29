<script lang="ts">
  import { onDestroy } from 'svelte';
  import { t } from '$lib/i18n';
  import Icon from './Icon.svelte';

  export let message = '';
  export let durationMs = 4000;
  export let onClose: () => void = () => {};

  let timer: ReturnType<typeof setTimeout> | null = null;

  function arm() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (message) timer = setTimeout(onClose, durationMs);
  }

  $: message, durationMs, arm();

  onDestroy(() => {
    if (timer) clearTimeout(timer);
  });
</script>

{#if message}
  <div class="toast" role="status">
    <span class="check" aria-hidden="true"><Icon name="check" /></span>
    <span class="text">{message}</span>
    <button type="button" aria-label={$t.a11y.close} on:click={onClose}>
      <Icon name="close" />
    </button>
  </div>
{/if}

<style>
  .toast {
    position: fixed;
    left: 50%;
    bottom: calc(20px + env(safe-area-inset-bottom));
    transform: translateX(-50%);
    z-index: 90;
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: min(92vw, 420px);
    background: var(--ink);
    color: var(--bg);
    border-radius: var(--radius-control);
    padding: 8px 8px 8px 14px;
    font-weight: 600;
    font-size: 0.84rem;
    animation: rise 0.2s var(--ease-out) both;
  }
  .check {
    flex: none;
    display: inline-flex;
    color: var(--chip-green-bg);
  }
  .check :global(svg) {
    width: 16px;
    height: 16px;
  }
  .text {
    flex: 1;
    min-width: 0;
  }
  .toast button {
    flex: none;
    width: 32px;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    opacity: 0.8;
  }
  .toast button:hover {
    opacity: 1;
  }
  .toast button :global(svg) {
    width: 16px;
    height: 16px;
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translate(-50%, 8px);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }
</style>
