<script lang="ts">
  // Sección colapsable con cabecera clara (ícono, título, conteo y
  // acciones). Recuerda en este navegador si quedó abierta o cerrada.
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';

  type IconName = 'calendar' | 'warn' | 'bell' | 'list' | 'users' | 'user' | 'book' | 'shield' | 'clock';

  export let key: string;
  export let title: string;
  export let icon: IconName = 'list';
  export let count: number | string | null = null;
  /** Color de acento de la cabecera. */
  export let tone: 'accent' | 'warn' | 'alert' = 'accent';
  export let open = true;

  const storageKey = `section:${key}`;
  onMount(() => {
    try {
      const v = localStorage.getItem(storageKey);
      if (v === '0') open = false;
      if (v === '1') open = true;
    } catch {
      /* sin almacenamiento: abierta por defecto */
    }
  });

  function toggle() {
    open = !open;
    try {
      localStorage.setItem(storageKey, open ? '1' : '0');
    } catch {
      /* ignorado */
    }
  }
</script>

<section class={`sec tone-${tone}`} class:closed={!open} aria-label={title}>
  <header class="sechead">
    <button type="button" class="toggle" aria-expanded={open} aria-controls={`sec-${key}`} on:click={toggle}>
      <span class="ico" aria-hidden="true"><Icon name={icon} /></span>
      <h2>{title}</h2>
      {#if count !== null}<span class="count">{count}</span>{/if}
      <span class="chev" aria-hidden="true"><Icon name="next" /></span>
    </button>
    {#if open && $$slots.actions}
      <div class="actions"><slot name="actions" /></div>
    {/if}
  </header>
  {#if open}
    <div class="secbody" id={`sec-${key}`}>
      <slot />
    </div>
  {/if}
</section>

<style>
  .sec {
    --tone: var(--accent);
    --tone-bg: var(--accent-soft);
    background: var(--card);
    border: 1px solid var(--line);
    border-top: 3px solid var(--tone);
    border-radius: var(--radius-card);
    overflow: hidden;
  }
  .sec.tone-warn {
    --tone: var(--chip-yellow-ink);
    --tone-bg: var(--chip-yellow-bg);
  }
  .sec.tone-alert {
    --tone: var(--g-grave-ink);
    --tone-bg: var(--g-grave-bg);
  }
  .sechead {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    padding: 12px 16px;
    background: linear-gradient(var(--tone-bg), var(--tone-bg)) top / 100% 100% no-repeat;
    background-color: var(--card);
  }
  .sec.closed .sechead {
    background: var(--card);
  }
  .toggle {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    text-align: left;
    color: var(--ink);
  }
  .ico {
    flex: none;
    width: 30px;
    height: 30px;
    border-radius: 8px;
    background: var(--card);
    color: var(--tone);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--line);
  }
  .ico :global(svg) {
    width: 16px;
    height: 16px;
  }
  h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 650;
  }
  .count {
    flex: none;
    white-space: nowrap;
    font-size: 0.74rem;
    font-weight: 700;
    border-radius: 999px;
    padding: 2px 9px;
    background: var(--card);
    color: var(--tone);
    border: 1px solid var(--line);
    font-variant-numeric: tabular-nums;
  }
  .chev {
    margin-left: auto;
    display: inline-flex;
    color: var(--muted);
  }
  .chev :global(svg) {
    width: 16px;
    height: 16px;
    transform: rotate(90deg);
    transition: transform var(--t-fast, 0.15s) var(--ease-out);
  }
  .sec.closed .chev :global(svg) {
    transform: rotate(0deg);
  }
  .actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .secbody {
    padding: 14px 16px 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    animation: secIn 0.16s var(--ease-out) both;
  }
  @keyframes secIn {
    from {
      opacity: 0;
      transform: translateY(-3px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
</style>
