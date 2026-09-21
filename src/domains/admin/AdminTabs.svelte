<script lang="ts">
  import { push } from 'svelte-spa-router';
  import Tabs from '$lib/ui/Tabs.svelte';
  import { t } from '$lib/i18n';

  export let active: 'resumen' | 'docentes' | 'estudiantes' | 'horario';
</script>

<Tabs
  tabs={[
    { href: '/admin', icon: 'book', label: $t.nav.overview, active: active === 'resumen' },
    { href: '/admin/docentes', icon: 'users', label: $t.nav.teachers, active: active === 'docentes' },
    { href: '/admin/estudiantes', icon: 'list', label: $t.nav.students, active: active === 'estudiantes' },
    { href: '/admin/horario', icon: 'calendar', label: $t.nav.schedule, active: active === 'horario' }
  ]}
  onNavigate={(href) => push(href)}
/>
