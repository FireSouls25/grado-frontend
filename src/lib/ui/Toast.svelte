<script lang="ts">
  import { onDestroy } from 'svelte';
  import { t } from '$lib/i18n';
  import Icon from './Icon.svelte';

  // Aviso flotante de éxito: aparece sobre la vista, se va solo a los
  // pocos segundos y trae X para adelantarlo. Solo éxitos: los errores
  // se quedan fijos junto a su formulario hasta resolverse.
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
    bottom: calc(24px + env(safe-area-inset-bottom));
    transform: translateX(-50%);
    z-index: 90;
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: min(92vw, 420px);
    background: var(--ink);
    color: var(--bg);
    border-radius: var(--radius-pill);
    padding: 10px 10px 10px 16px;
    font-weight: 600;
    font-size: 0.88rem;
    box-shadow: var(--shadow);
    animation: rise 0.25s ease both;
  }
  .check {
    flex: none;
    display: inline-flex;
    color: var(--chip-green-bg);
  }
  .check :global(svg) {
    width: 18px;
    height: 18px;
  }
  .text {
    flex: 1;
    min-width: 0;
  }
  .toast button {
    flex: none;
    width: 40px;
    height: 40px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    opacity: 0.8;
  }
  .toast button:active {
    transform: scale(0.92);
  }
  .toast button :global(svg) {
    width: 18px;
    height: 18px;
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translate(-50%, 10px);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }
</style>
