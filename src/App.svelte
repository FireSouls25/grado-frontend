<script lang="ts">
  import Router, { push } from 'svelte-spa-router';
  import { routes } from './routes';
  import { session } from './domains/auth/session';
  import { path } from '$lib/nav';
  import { onMount } from 'svelte';

  // Gate: logged-out visits outside public pages land on login.
  const publicPaths = ['/', '/login', '/recuperar'];
  const isPublic = (p: string) => publicPaths.includes(p) || p.startsWith('/recuperar/');
  onMount(() => {
    if (!$session && !isPublic($path)) {
      push('/login');
    }
  });
</script>

<Router {routes} />
