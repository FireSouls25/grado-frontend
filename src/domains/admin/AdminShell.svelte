<script lang="ts">
  import { push } from 'svelte-spa-router';
  import { t } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';
  import Toast from '$lib/ui/Toast.svelte';
  import { notice, dismissNotice } from '$lib/ui/notice';

  // Barra lateral persistente de la consola admin (docs/diseno.md).
  // Sin búsqueda: cada página filtra con la suya junto a sus tabs.
  export let active:
    | 'resumen'
    | 'docentes'
    | 'estudiantes'
    | 'horario'
    | 'llamados'
    | 'auditoria'
    | 'anos';
  export let year: number;
  export let onYear: ((delta: number) => void) | null = null;

  type Key = typeof active;
  type IconName =
    | 'book'
    | 'users'
    | 'list'
    | 'calendar'
    | 'eye'
    | 'warn'
    | 'cap';

  // Una sola fuente para las dos navegaciones (lateral en escritorio,
  // barra horizontal en móvil): el mismo destino y el mismo estado.
  $: items = [
    { key: 'resumen' as Key, href: '/admin', icon: 'book' as IconName, label: $t.admin.viewOverview },
    { key: 'docentes' as Key, href: '/admin/docentes', icon: 'users' as IconName, label: $t.nav.teachers },
    { key: 'estudiantes' as Key, href: '/admin/estudiantes', icon: 'list' as IconName, label: $t.nav.students },
    { key: 'horario' as Key, href: '/admin/horario', icon: 'calendar' as IconName, label: $t.nav.schedule },
    { key: 'llamados' as Key, href: '/admin/llamados', icon: 'warn' as IconName, label: $t.admin.navWarnings },
    { key: 'auditoria' as Key, href: '/admin/auditoria', icon: 'eye' as IconName, label: $t.audit.navLabel },
    { key: 'anos' as Key, href: '/admin/anos', icon: 'cap' as IconName, label: $t.admin.navYears }
  ];
</script>

<div class="console">
  <aside class="side" aria-label={$t.admin.consoleEyebrow}>
    <div class="usercard">
      <span class="logo">G</span>
      <span class="u-t"><strong>{$t.admin.schoolName}</strong></span>
    </div>
    <nav class="vnav" aria-label={$t.admin.manageTitle}>
      <p class="nav-cap">{$t.admin.manageTitle}</p>
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
    <div class="yearbox">
      <small>{$t.admin.yearLabel}</small>
      {#if onYear}
        <div class="stepper">
          <button type="button" on:click={() => onYear && onYear(-1)} aria-label={$t.a11y.prevYear}>‹</button>
          <strong>{year}</strong>
          <button type="button" on:click={() => onYear && onYear(1)} aria-label={$t.a11y.nextYear}>›</button>
        </div>
      {:else}
        <div class="stepper"><strong>{year}</strong></div>
      {/if}
    </div>
  </aside>

  <!-- Móvil: la lateral no cabe, pero la navegación sigue siendo obligatoria. -->
  <nav class="mnav" aria-label={$t.admin.manageTitle}>
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
  <Toast message={$notice} onClose={dismissNotice} />
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
  .yearbox {
    border-top: 1px solid var(--line);
    padding: 14px 4px 0;
  }
  .yearbox small {
    color: var(--muted);
    font-weight: 600;
    font-size: 0.7rem;
  }
  .stepper {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-top: 6px;
  }
  .stepper strong {
    font-size: 1.3rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .stepper button {
    width: 44px;
    height: 44px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: var(--surface-2);
    font-size: 1.2rem;
    line-height: 1;
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
