<script lang="ts">
  import { push } from 'svelte-spa-router';
  import { t } from '$lib/i18n';
  import Sheet from '$lib/ui/Sheet.svelte';
  import { profile } from '$lib/shell/profile';

  // Aviso de contraseña inicial: sale en cada login nuevo mientras la
  // cuenta conserve la inicial (cédula). Se cierra con la X y no vuelve
  // hasta el próximo inicio de sesión. El owner (bootstrapeado) nunca
  // lo ve: es gestión interna, no una cuenta.
  let dismissed = false;
  $: if ($profile.state === 'idle') dismissed = false;
  $: show =
    $profile.state === 'ready' &&
    $profile.me !== null &&
    $profile.me.passwordChanged === false &&
    !($profile.me.roles ?? []).includes('owner') &&
    !dismissed;

  function goChange() {
    dismissed = true;
    push('/perfil');
  }
</script>

<Sheet open={!!show} title={$t.profile.initialNoticeTitle} onClose={() => (dismissed = true)}>
  <p class="body">{$t.profile.initialNoticeBody}</p>
  <div class="actions">
    <button type="button" class="primary" on:click={goChange}>
      {$t.profile.initialNoticeAction}
    </button>
  </div>
</Sheet>

<style>
  .body {
    color: var(--muted);
    font-size: 0.9rem;
    line-height: 1.55;
    margin: 0 0 14px;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }
</style>
