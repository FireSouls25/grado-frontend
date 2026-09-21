<script lang="ts">
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import HelpPanel from '$lib/shell/HelpPanel.svelte';
  import { t } from '$lib/i18n';
</script>

<div class="page">
  <TopBar title={$t.help.title} showBack><TopActions settings={false} help={false} /></TopBar>
  <HelpPanel />
</div>

<style>
  .page {
    padding-bottom: calc(24px + env(safe-area-inset-bottom));
  }
</style>
