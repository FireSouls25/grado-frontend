<script lang="ts">
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import { t } from '$lib/i18n';
</script>

<div class="page">
  <TopBar title={$t.app.name}><TopActions /></TopBar>
  <EmptyState
    icon="users"
    title={$t.studentHome.title}
    body={$t.studentHome.body}
  />
</div>
