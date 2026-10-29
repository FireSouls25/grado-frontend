<script lang="ts">
  import Icon from './Icon.svelte';
  import { t } from '$lib/i18n';
  import { goBack } from '$lib/nav';

  export let title: string;
  export let subtitle = '';
  export let showBack = false;
  export let centered = false;
  export let onBack: () => void = () => goBack('/');
</script>

<header class="topbar" class:centered>
  <div class="left">
    {#if showBack}
      <button class="back-btn" type="button" on:click={onBack} aria-label={$t.a11y.back} title={$t.a11y.back}>
        <Icon name="back" />
      </button>
    {/if}
    <div class="titles">
      <h1>{title}</h1>
      {#if subtitle}
        <p class="subtitle">{subtitle}</p>
      {/if}
    </div>
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
    gap: 12px;
    padding: 4px 0 14px;
    background: var(--bg);
  }
  .left {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .back-btn {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: var(--radius-control);
    border: 1px solid var(--control);
    background: var(--surface);
    color: var(--ink-soft);
  }
  .back-btn:hover {
    background: var(--surface-2);
    color: var(--ink);
    border-color: var(--ink-soft);
  }
  .back-btn:active {
    transform: translateY(1px);
  }
  .back-btn :global(svg) {
    width: 18px;
    height: 18px;
    display: block;
  }
  .titles {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .left h1 {
    font-size: var(--fs-title);
    font-weight: 600;
    letter-spacing: -0.015em;
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .subtitle {
    color: var(--muted);
    font-size: 0.82rem;
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    flex: 1 1 auto;
    flex-wrap: wrap;
    min-width: 0;
  }
  .actions :global(.btn) {
    flex: none;
  }
  .topbar.centered {
    justify-content: center;
    position: relative;
  }
  .topbar.centered .actions {
    position: absolute;
    right: 0;
  }
</style>
