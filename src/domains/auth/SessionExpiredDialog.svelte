<script lang="ts">
  import { push } from 'svelte-spa-router';
  import Sheet from '$lib/ui/Sheet.svelte';
  import { path } from '$lib/nav';
  import { sessionExpired, authNotice } from './session';
  import { t } from '$lib/i18n';

  // El popup solo interrumpe dentro de la app: en páginas públicas
  // (login, recuperar) el aviso en línea de cada pantalla basta.
  $: show = $sessionExpired && $path !== '/login' && !$path.startsWith('/recuperar');
  $: maintenance = $authNotice === 'maintenance';

  function goLogin() {
    sessionExpired.set(false);
    push('/login');
  }
</script>

<Sheet open={show} title={maintenance ? $t.login.maintenanceTitle : $t.login.sessionExpiredTitle} onClose={goLogin}>
  <p class="body">{maintenance ? $t.login.maintenance : $t.login.sessionExpired}</p>
  <div class="actions">
    <button type="button" class="btn btn-primary" on:click={goLogin}>
      {$t.login.goLogin}
    </button>
  </div>
</Sheet>

<style>
  .body {
    color: var(--muted);
    font-size: 0.88rem;
    margin-bottom: 16px;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding-top: 12px;
    border-top: 1px solid var(--line);
  }
</style>
