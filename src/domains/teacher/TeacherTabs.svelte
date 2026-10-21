<script lang="ts">
  import { push } from 'svelte-spa-router';
  import { t } from '$lib/i18n';
  import Tabs from '$lib/ui/Tabs.svelte';

  // Navegación inferior del dominio docente. Las páginas la montan todas:
  // en el APK es la única forma de cambiar de sección sin barra del sistema.
  export let active: 'agenda' | 'horario';
</script>

<Tabs
  tabs={[
    { href: '/agenda', icon: 'list', label: $t.nav.agenda, active: active === 'agenda' },
    { href: '/horario', icon: 'calendar', label: $t.nav.schedule, active: active === 'horario' }
  ]}
  onNavigate={(href) => push(href)}
/>