<script lang="ts">
  import { push } from 'svelte-spa-router';
  import Icon from '$lib/ui/Icon.svelte';
  import { t } from '$lib/i18n';
  import { theme } from '$lib/theme/theme';

  export let settings = true;
  export let help = true;

  const order = ['light', 'dark', 'auto'] as const;
  function cycleTheme() {
    const next = order[(order.indexOf($theme) + 1) % order.length];
    theme.set(next);
  }

  const themeIcon = () => ($theme === 'light' ? 'sun' : $theme === 'dark' ? 'moon' : 'auto');
</script>

<div class="actions" role="group" aria-label={$t.a11y.actions}>
  <button class="icon-btn" type="button" on:click={cycleTheme} aria-label={$t.a11y.theme} title={$t.a11y.theme}>
    <Icon name={themeIcon()} />
  </button>
  {#if settings}
    <button
      class="icon-btn"
      type="button"
      on:click={() => push('/ajustes')}
      aria-label={$t.settings.title}
      title={$t.settings.title}
    >
      <Icon name="settings" />
    </button>
  {/if}
  {#if help}
    <button
      class="icon-btn"
      type="button"
      on:click={() => push('/ayuda')}
      aria-label={$t.help.title}
      title={$t.help.title}
    >
      <Icon name="help" />
    </button>
  {/if}
</div>

<style>
  .actions {
    display: flex;
    gap: 4px;
  }
  .icon-btn {
    width: 44px;
    height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-pill);
    color: var(--muted);
    transition:
      background-color 0.15s ease,
      color 0.15s ease,
      transform 0.1s ease;
  }
  .icon-btn:hover {
    background: var(--surface-2);
    color: var(--ink);
  }
  .icon-btn:active {
    transform: scale(0.92) rotate(8deg);
  }
</style>
