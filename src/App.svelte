<script lang="ts">
  import Router, { push } from 'svelte-spa-router';
  import { routes } from './routes';
  import { session } from './domains/auth/session';
  import { path } from '$lib/nav';
  import { onMount } from 'svelte';

  // Gate: logged-out visits outside public pages land on login.
  const publicPaths = ['/', '/login', '/recuperar'];
  onMount(() => {
    if (!$session && !publicPaths.includes($path)) {
      push('/login');
    }
  });
</script>

<Router {routes} />
