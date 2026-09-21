<script lang="ts">
  import Icon from './Icon.svelte';
  import { t } from '$lib/i18n';

  export let title: string;
  export let showBack = false;
  export let onBack: () => void = () => history.back();
</script>

<header class="topbar">
  <div class="left">
    {#if showBack}
      <button class="icon-btn" type="button" on:click={onBack} aria-label={$t.a11y.back}>
        <Icon name="back" />
      </button>
    {/if}
    <h1>{title}</h1>
  </div>
  <div class="actions">
    <slot />
  </div>
</header>

<style>
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 4px 0 12px;
    position: sticky;
    top: 0;
    z-index: 20;
    background: var(--bg);
  }
  .left {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }
  .left h1 {
    font-size: 1.35rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .actions {
    display: flex;
    gap: 4px;
    flex: none;
  }
  .actions :global(.icon-btn) {
    width: 44px;
    height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-pill);
    color: var(--muted);
  }
</style>
