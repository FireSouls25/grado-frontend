<script lang="ts">
  import Router, { push } from 'svelte-spa-router';
  import { routes } from './routes';
  import { session } from './domains/auth/session';
  import { path } from '$lib/nav';
  import { onMount } from 'svelte';

  // Gate: logged-out visits outside login land on login.
  onMount(() => {
    if (!$session && $path !== '/login' && $path !== '/') {
      push('/login');
    }
  });
</script>

<Router {routes} />
