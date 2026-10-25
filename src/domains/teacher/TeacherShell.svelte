<script lang="ts">
  import { push } from 'svelte-spa-router';
  import { t } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';

  // Barra lateral de la consola docente: mismo sistema que AdminShell
  // (lateral en escritorio, píldoras arriba en móvil), con las dos
  // secciones del docente. Las pantallas de detalle (clase, llamado)
  // cuelgan de la agenda sin resaltar nada.
  export let active: 'agenda' | 'horario' | null = null;

  type Key = 'agenda' | 'horario';
  type IconName = 'list' | 'calendar';

  $: items = [
    { key: 'agenda' as Key, href: '/agenda', icon: 'list' as IconName, label: $t.nav.agenda },
    { key: 'horario' as Key, href: '/horario', icon: 'calendar' as IconName, label: $t.nav.schedule }
  ];
</script>

<div class="console">
  <aside class="side" aria-label={$t.agenda.eyebrow}>
    <div class="usercard">
      <span class="logo">G</span>
      <span class="u-t"><strong>{$t.admin.schoolName}</strong></span>
    </div>
    <nav class="vnav" aria-label={$t.agenda.eyebrow}>
      <p class="nav-cap">{$t.agenda.eyebrow}</p>
      {#each items as item (item.key)}
        <button
          type="button"
          class:active={active === item.key}
          aria-current={active === item.key ? 'page' : undefined}
          on:click={() => item.key !== active && push(item.href)}
        >
          <Icon name={item.icon} /> {item.label}
        </button>
      {/each}
    </nav>
  </aside>

  <!-- Móvil: la lateral no cabe, pero la navegación sigue siendo obligatoria. -->
  <nav class="mnav" aria-label={$t.agenda.eyebrow}>
    {#each items as item (item.key)}
      <button
        type="button"
        class:active={active === item.key}
        aria-current={active === item.key ? 'page' : undefined}
        on:click={() => item.key !== active && push(item.href)}
      >
        <Icon name={item.icon} /> <span>{item.label}</span>
      </button>
    {/each}
  </nav>

  <div class="sbody"><slot /></div>
</div>

<style>
  .console {
    min-height: 100vh;
    min-height: 100svh;
    background: var(--bg);
    color: var(--ink);
  }
  .side {
    display: none;
  }
  /* Barra de secciones en móvil: coincide con el lateral de escritorio
     (mismos destinos, mismo estado activo) y se desplaza en horizontal. */
  .mnav {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    scrollbar-width: none;
    padding: calc(10px + env(safe-area-inset-top)) 16px 10px;
    background: var(--bg);
    position: sticky;
    top: 0;
    z-index: 20;
  }
  .mnav::-webkit-scrollbar {
    display: none;
  }
  .mnav button {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    padding: 0 16px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--ink-soft);
    font-weight: 500;
    font-size: 0.85rem;
    white-space: nowrap;
  }
  .mnav button.active {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--bg);
    font-weight: 600;
  }
  .mnav button :global(svg) {
    width: 18px;
    height: 18px;
  }
  .sbody {
    min-width: 0;
    padding: 0 16px calc(96px + env(safe-area-inset-bottom));
  }
  .usercard {
    display: flex;
    gap: 10px;
    align-items: center;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 10px 12px;
    box-shadow: var(--shadow);
  }
  .logo {
    width: 36px;
    height: 36px;
    flex: none;
    background: var(--ink);
    color: var(--bg);
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    font-size: 0.72rem;
  }
  .u-t {
    display: flex;
    flex-direction: column;
    line-height: 1.25;
    min-width: 0;
  }
  .u-t strong {
    font-size: 0.8rem;
    line-height: 1.25;
  }
  .vnav {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .nav-cap {
    color: var(--ink-soft);
    font-size: 0.78rem;
    font-weight: 500;
    padding: 0 12px 6px;
  }
  .vnav button {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 9px 12px;
    min-height: 44px;
    border-radius: 10px;
    color: var(--ink-soft);
    font-weight: 500;
    font-size: 0.86rem;
    border: 1px solid transparent;
    text-align: left;
  }
  .vnav button.active {
    background: var(--surface);
    border-color: var(--line);
    color: var(--ink);
    box-shadow: var(--shadow);
  }
  @media (min-width: 1020px) {
    .console {
      display: grid;
      grid-template-columns: 272px minmax(0, 1fr);
    }
    .side {
      display: flex;
      background: var(--bg);
      padding: 18px 14px;
      flex-direction: column;
      gap: 14px;
      position: sticky;
      top: 0;
      height: 100vh;
      height: 100svh;
      overflow-y: auto;
    }
    /* La lateral reemplaza a la barra en escritorio: nunca ambas. */
    .mnav {
      display: none;
    }
    .sbody {
      padding: 26px 28px calc(96px + env(safe-area-inset-bottom));
    }
  }
</style>
