<script lang="ts">
  import Icon from './Icon.svelte';
  import { t } from '$lib/i18n';
  import { portal } from './portal';

  export let open = false;
  export let title: string;
  export let closeLabel = '';
  export let wide = false;
  export let onClose: () => void = () => {};

  function onKey(e: KeyboardEvent) {
    if (open && e.key === 'Escape') onClose();
  }
</script>

<svelte:window on:keydown={onKey} />

{#if open}
  <div use:portal>
    <div class="scrim" on:click={onClose} aria-hidden="true"></div>
    <div class="sheet" class:wide role="dialog" aria-modal="true" tabindex="-1" aria-label={title}>
      <div class="grab" aria-hidden="true"></div>
      <div class="head">
        <h2>{title}</h2>
        <button
          class="close-btn"
          type="button"
          on:click={onClose}
          aria-label={closeLabel || $t.a11y.close}
          title={closeLabel || $t.a11y.close}
        >
          <Icon name="close" />
        </button>
      </div>
      <div class="body">
        <slot />
      </div>
    </div>
  </div>
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: var(--scrim);
    animation: fade 0.18s ease both;
    z-index: 70;
  }
  .sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 71;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-sheet) var(--radius-sheet) 0 0;
    max-height: 88dvh;
    display: flex;
    flex-direction: column;
    overscroll-behavior: contain;
    animation: rise 0.22s var(--ease-out) both;
    padding-bottom: env(safe-area-inset-bottom);
    pointer-events: auto;
  }
  @media (min-width: 760px) {
    .sheet {
      left: 50%;
      right: auto;
      top: 50%;
      bottom: auto;
      width: min(540px, calc(100vw - 32px));
      max-height: min(86dvh, 760px);
      transform: translate(-50%, -50%);
      border-radius: var(--radius-sheet);
      padding-bottom: 4px;
    }
    .sheet.wide {
      width: min(860px, calc(100vw - 32px));
    }
  }
  .grab {
    width: 36px;
    height: 4px;
    border-radius: 4px;
    background: var(--control);
    margin: 10px auto 0;
  }
  @media (min-width: 760px) {
    .grab {
      display: none;
    }
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 16px 12px 20px;
    border-bottom: 1px solid var(--line);
  }
  .head h2 {
    font-size: 1rem;
    font-weight: 600;
    letter-spacing: -0.01em;
  }
  .body {
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    padding: 16px 20px 20px;
  }
  .close-btn {
    flex: none;
    width: 34px;
    height: 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-control);
    color: var(--muted);
    cursor: pointer;
  }
  .close-btn:hover {
    background: var(--surface-2);
    color: var(--ink);
  }
  .close-btn :global(svg) {
    width: 18px;
    height: 18px;
  }
  @keyframes rise {
    from {
      opacity: 0;
      translate: 0 18px;
    }
    to {
      opacity: 1;
      translate: 0 0;
    }
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>
