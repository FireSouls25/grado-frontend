<script lang="ts">
  import { push } from 'svelte-spa-router';
  import { t } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';

  // Barra lateral persistente de la consola admin (docs/diseno.md).
  // Sin búsqueda: cada página filtra con la suya junto a sus tabs.
  export let active: 'resumen' | 'docentes' | 'estudiantes' | 'horario';
  export let year: number;
  export let onYear: ((delta: number) => void) | null = null;

  function goResumen() {
    if (active !== 'resumen') push('/admin');
  }
</script>

<div class="console">
  <aside class="side" aria-label={$t.admin.consoleEyebrow}>
    <div class="usercard">
      <span class="logo">SB</span>
      <span class="u-t"><strong>{$t.admin.schoolName}</strong><small>{$t.admin.schoolSite} · {year}</small></span>
    </div>
    <nav class="vnav" aria-label={$t.admin.manageTitle}>
      <p class="nav-cap">{$t.admin.manageTitle}</p>
      <button type="button" class:active={active === 'resumen'} on:click={goResumen}>
        <Icon name="book" /> {$t.admin.viewOverview}
      </button>
      <button type="button" class:active={active === 'docentes'} on:click={() => push('/admin/docentes')}>
        <Icon name="users" /> {$t.nav.teachers}
      </button>
      <button type="button" class:active={active === 'estudiantes'} on:click={() => push('/admin/estudiantes')}>
        <Icon name="list" /> {$t.nav.students}
      </button>
      <button type="button" class:active={active === 'horario'} on:click={() => push('/admin/horario')}>
        <Icon name="calendar" /> {$t.nav.schedule}
      </button>
      <button type="button" class="is-soon" disabled aria-disabled="true">
        <Icon name="warn" /> {$t.admin.navWarnings} <em>{$t.admin.soon}</em>
      </button>
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
    font-size: 0.82rem;
    white-space: nowrap;
  }
  .u-t small {
    color: var(--muted);
    font-size: 0.7rem;
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
  .vnav button.is-soon {
    opacity: 0.7;
  }
  .vnav em {
    margin-left: auto;
    font-style: normal;
    font-size: 0.7rem;
    background: var(--tint);
    border-radius: 999px;
    padding: 1px 8px;
    color: var(--muted);
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
    }
    .sbody {
      padding: 26px 28px calc(96px + env(safe-area-inset-bottom));
    }
  }
</style>
