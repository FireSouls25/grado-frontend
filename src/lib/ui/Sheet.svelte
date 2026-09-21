<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import Icon from './Icon.svelte';

  export let open = false;
  export let title: string;
  export let closeLabel = 'Cerrar';

  const dispatch = createEventDispatcher<{ close: void }>();

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') dispatch('close');
  }
</script>

<svelte:window on:keydown={onKey} />

{#if open}
  <div class="scrim" on:click={() => dispatch('close')} aria-hidden="true"></div>
  <div class="sheet" role="dialog" aria-modal="true" aria-label={title}>
    <div class="grab" aria-hidden="true"></div>
    <div class="head">
      <h2>{title}</h2>
      <button
        class="icon-btn"
        type="button"
        on:click={() => dispatch('close')}
        aria-label={closeLabel}
      >
        <Icon name="close" />
      </button>
    </div>
    <div class="body">
      <slot />
    </div>
  </div>
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: rgba(15, 20, 36, 0.45);
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
    animation: up 0.25s cubic-bezier(0.2, 0.9, 0.3, 1) both;
    padding-bottom: env(safe-area-inset-bottom);
  }
  @media (min-width: 900px) {
    .sheet {
      left: 50%;
      right: auto;
      width: 560px;
      transform: translateX(-50%);
    }
  }
  .grab {
    width: 40px;
    height: 4px;
    border-radius: 4px;
    background: var(--line);
    margin: 10px auto 0;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 8px 8px 20px;
  }
  .body {
    overflow-y: auto;
    padding: 4px 20px 20px;
  }
  .icon-btn {
    width: 44px;
    height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-pill);
    color: var(--muted);
  }
  .icon-btn:hover {
    background: var(--surface-2);
    color: var(--ink);
  }
  @keyframes up {
    from {
      opacity: 0.5;
      transform: translateY(40px);
    }
    to {
      opacity: 1;
      transform: none;
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
