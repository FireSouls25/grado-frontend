<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import SettingsPanel from '$lib/shell/SettingsPanel.svelte';
  import HelpPanel from '$lib/shell/HelpPanel.svelte';
  import { t } from '$lib/i18n';
  import { theme } from '$lib/theme/theme';

  let open: 'settings' | 'help' | null = null;

  const order = ['light', 'dark', 'auto'] as const;
  function cycleTheme() {
    const next = order[(order.indexOf($theme) + 1) % order.length];
    theme.set(next);
  }

  const themeIcon = () => ($theme === 'light' ? 'sun' : $theme === 'dark' ? 'moon' : 'auto');
</script>

<div class="actions" role="group" aria-label="Acciones">
  <button class="icon-btn" type="button" on:click={cycleTheme} aria-label="Tema" title="Tema">
    <Icon name={themeIcon()} />
  </button>
  <button
    class="icon-btn"
    type="button"
    on:click={() => (open = 'settings')}
    aria-label={$t.settings.title}
    title={$t.settings.title}
  >
    <Icon name="settings" />
  </button>
  <button
    class="icon-btn"
    type="button"
    on:click={() => (open = 'help')}
    aria-label={$t.help.title}
    title={$t.help.title}
  >
    <Icon name="help" />
  </button>
</div>

<Sheet open={open === 'settings'} title={$t.settings.title} on:close={() => (open = null)}>
  <SettingsPanel />
</Sheet>
<Sheet open={open === 'help'} title={$t.help.title} on:close={() => (open = null)}>
  <HelpPanel />
</Sheet>

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
