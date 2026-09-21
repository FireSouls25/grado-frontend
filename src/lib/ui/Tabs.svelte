<script lang="ts">
  import Icon from './Icon.svelte';

  interface Tab {
    href: string;
    icon: 'list' | 'calendar' | 'users' | 'book' | 'warn';
    label: string;
    active: boolean;
  }

  export let tabs: Tab[];
  export let onNavigate: (href: string) => void;
</script>

<nav class="tabs" aria-label="Secciones">
  {#each tabs as tab}
    <button
      type="button"
      class:active={tab.active}
      aria-current={tab.active ? 'page' : undefined}
      on:click={() => onNavigate(tab.href)}
    >
      <Icon name={tab.icon} />
      <span>{tab.label}</span>
    </button>
  {/each}
</nav>

<style>
  .tabs {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 30;
    display: flex;
    background: var(--surface);
    border-top: 1px solid var(--line);
    padding: 6px 8px calc(8px + env(safe-area-inset-bottom));
  }
  .tabs button {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 8px 4px 6px;
    min-height: 56px;
    border-radius: 12px;
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 600;
    transition:
      color 0.15s ease,
      background-color 0.15s ease;
  }
  .tabs button:active {
    transform: scale(0.96);
  }
  .tabs button.active {
    color: var(--accent);
    background: var(--accent-soft);
  }
</style>
