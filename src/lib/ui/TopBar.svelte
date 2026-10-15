<script lang="ts">
  import Icon from './Icon.svelte';
  import { t } from '$lib/i18n';

  export let title: string;
  export let showBack = false;
  // Optativo: `centered` centra el título (acciones fijadas a la derecha).
  export let centered = false;
  export let onBack: () => void = () => history.back();
</script>

<header class="topbar" class:centered>
  <div class="left">
    {#if showBack}
      <button class="icon-btn" type="button" on:click={onBack} aria-label={$t.a11y.back}>
        <Icon name="back" />
      </button>
    {/if}
    <h1>{title}</h1>
  </div>
  <div class="actions">
    <slot />
  </div>
</header>

<style>
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 4px 0 12px;
    position: sticky;
    top: 0;
    z-index: 20;
    background: var(--bg);
  }
  .left {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }
  /* El botón de atrás comparte caja y centro con el texto: sin esto el
     SVG se alinea a la línea base y el chevron queda unos px por encima. */
  .left .icon-btn {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: var(--radius-pill);
    color: var(--muted);
  }
  .left .icon-btn :global(svg) {
    display: block;
  }
  .left h1 {
    font-size: 1.35rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .actions {
    display: flex;
    gap: 4px;
    flex: none;
  }
  .actions :global(.icon-btn) {
    width: 44px;
    height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-pill);
    color: var(--muted);
  }
  /* Título centrado (atrás + texto al medio): las acciones se fijan a la
     derecha para no desplazar el centro. */
  .topbar.centered {
    justify-content: center;
  }
  .topbar.centered .actions {
    position: absolute;
    right: 0;
  }
</style>
