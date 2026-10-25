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
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window on:keydown={onKey} />

{#if open}
  <div use:portal>
    <div class="scrim" on:click={onClose} aria-hidden="true"></div>
    <!-- The scrim is a sibling: clicks inside the sheet never reach it. -->
    <div class="sheet" class:wide role="dialog" aria-modal="true" tabindex="-1" aria-label={title}>
      <div class="grab" aria-hidden="true"></div>
      <div class="head">
        <h2>{title}</h2>
        <button
          class="icon-btn"
          type="button"
          on:click={onClose}
          aria-label={closeLabel || $t.a11y.close}
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
    animation: fade 0.2s ease both;
    z-index: 40;
  }
  .sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 41;
    background: var(--surface);
    border-radius: 20px 20px 0 0;
    box-shadow: var(--shadow);
    max-height: 85dvh;
    display: flex;
    flex-direction: column;
    overscroll-behavior: contain;
    animation: rise 0.25s cubic-bezier(0.2, 0.9, 0.3, 1) both;
    padding-bottom: env(safe-area-inset-bottom);
    pointer-events: auto;
  }
  @media (min-width: 900px) {
    /* Centered dialog on desktop (not a bottom sheet). The entrance
       animates the `translate` property so it never fights the
       `transform` centering below (a filled `transform` keyframe would
       override translateX(-50%) and shove the panel to the right). */
    .sheet {
      left: 50%;
      right: auto;
      top: 50%;
      bottom: auto;
      width: min(560px, calc(100vw - 32px));
      transform: translate(-50%, -50%);
      border-radius: 20px;
      padding-bottom: 8px;
    }
    .sheet.wide {
      width: min(880px, calc(100vw - 32px));
    }
  }
  .grab {
    width: 40px;
    height: 4px;
    border-radius: 4px;
    background: var(--line);
    margin: 10px auto 0;
  }
  @media (min-width: 900px) {
    .grab {
      display: none;
    }
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 8px 8px 20px;
  }
  .head h2 {
    font-size: 1.05rem;
  }
  .body {
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    padding: 4px 20px 20px;
  }
  .icon-btn {
    flex: none;
    width: 44px;
    height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-pill);
    color: var(--muted);
    cursor: pointer;
  }
  .icon-btn:hover {
    background: var(--surface-2);
    color: var(--ink);
  }
  @keyframes rise {
    from {
      opacity: 0.5;
      translate: 0 40px;
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
