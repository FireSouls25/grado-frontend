<script lang="ts">
  import EmptyState from './EmptyState.svelte';
  import { t } from '$lib/i18n';
  import { isOffline } from '$lib/api/types';

  // Estado de error unificado: distingue "no hubo conexión" de "el servidor
  // respondió con error" y siempre ofrece reintentar, porque en ambos casos
  // el siguiente intento puede funcionar.
  export let error: unknown = null;
  export let onRetry: (() => void | Promise<void>) | null = null;

  // El propio botón conoce si hay un reintento en curso: la página ya está
  // reintentando cuando esto está activo.
  let busy = false;

  async function retry() {
    if (!onRetry || busy) return;
    busy = true;
    try {
      await onRetry();
    } finally {
      busy = false;
    }
  }

  $: offline = isOffline(error);
</script>

<EmptyState
  icon="warn"
  title={offline ? $t.common.offlineTitle : $t.common.loadErrorTitle}
  body={offline ? $t.common.offlineBody : $t.common.loadErrorBody}
  actionLabel={busy ? $t.common.retrying : $t.common.retry}
  onAction={onRetry ? retry : null}
/>