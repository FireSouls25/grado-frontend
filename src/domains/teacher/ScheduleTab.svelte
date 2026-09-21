<script lang="ts">
  import { push } from 'svelte-spa-router';
  import { t } from '$lib/i18n';
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import Tabs from '$lib/ui/Tabs.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
</script>

<div class="page">
  <TopBar title={$t.schedule.title}><TopActions /></TopBar>
  <EmptyState
    icon="calendar"
    title={$t.schedule.emptyTitle}
    body={$t.schedule.emptyBody}
  />
</div>

<Tabs
  tabs={[
    { href: '/hoy', icon: 'list', label: $t.nav.today, active: false },
    { href: '/horario', icon: 'calendar', label: $t.nav.schedule, active: true }
  ]}
  onNavigate={(href) => push(href)}
/>
