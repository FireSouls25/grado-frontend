<script lang="ts">
  import Router, { replace } from 'svelte-spa-router';
  import type { RouteDetail } from 'svelte-spa-router';
  import { routes } from './routes';
  import { session } from './domains/auth/session';
  import SessionExpiredDialog from './domains/auth/SessionExpiredDialog.svelte';
  import PasswordNotice from './domains/auth/PasswordNotice.svelte';
  import { path } from '$lib/nav';
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { areaOf, currentMe } from '$lib/routeGuard';
  import { notify } from '$lib/ui/notice';
  import { t } from '$lib/i18n';

  /** Login recordando el destino: tras entrar, vuelve si le corresponde. */
  function toLogin(target: string) {
    replace(`/login?next=${encodeURIComponent(target)}`);
  }

  // Gate: logged-out visits outside public pages land on login.
  onMount(() => {
    if (!$session && areaOf($path) !== 'public') toLogin($path);
  });

  /** Una condición de área falló: la página no se creó. Sin sesión va al
   *  login; con sesión, a su propio inicio con un aviso. Se usa replace
   *  para que Atrás no devuelva a la ruta prohibida. */
  async function denied(detail: RouteDetail) {
    const target = detail.location + (detail.querystring ? `?${detail.querystring}` : '');
    const me = await currentMe();
    if (!me) {
      toLogin(target);
      return;
    }
    notify(get(t).login.forbiddenRedirect);
    replace(me.home && areaOf(me.home) !== 'public' ? me.home : '/');
  }
</script>

<Router {routes} onConditionsFailed={denied} />
<SessionExpiredDialog />
<PasswordNotice />
