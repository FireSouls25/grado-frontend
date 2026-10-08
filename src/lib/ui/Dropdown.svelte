<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import Icon from './Icon.svelte';

  // Desplegable de la identidad (docs/diseno.md): botón de 44px con
  // píldora, lista con borde hairline y resaltado con teclado. Todo texto
  // entra por props: este componente no conoce el catálogo i18n.
  interface DropOption {
    value: string;
    label: string;
  }

  export let label: string;
  export let value: string;
  export let options: DropOption[] = [];
  export let placeholder = '';
  export let searchable = false;
  export let searchPlaceholder = '';
  export let emptyLabel = '—';

  const dispatch = createEventDispatcher<{ select: string }>();

  let open = false;
  let query = '';
  let highlighted = -1;
  let box: HTMLDivElement | null = null;

  $: q = query.trim().toLowerCase();
  $: shown = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  $: current = options.find((o) => o.value === value);

  function openMenu() {
    open = true;
    query = '';
    highlighted = Math.max(0, shown.findIndex((o) => o.value === value));
  }

  function close() {
    open = false;
  }

  function choose(next: string) {
    dispatch('select', next);
    close();
  }

  function onWindowClick(e: MouseEvent) {
    if (open && box && !box.contains(e.target as Node)) close();
  }

  function onKey(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlighted = Math.min(shown.length - 1, highlighted + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlighted = Math.max(0, highlighted - 1);
    } else if (e.key === 'Enter' && highlighted >= 0 && shown[highlighted]) {
      choose(shown[highlighted].value);
    }
  }
</script>

<svelte:window on:click={onWindowClick} on:keydown={onKey} />

<div class="drop" bind:this={box}>
  <span class="cap">{label}</span>
  <button type="button" class="face" aria-haspopup="listbox" aria-expanded={open} on:click={() => (open ? close() : openMenu())}>
    <span class="val">{current ? current.label : placeholder}</span>
    <span class="chev" class:up={open} aria-hidden="true"><Icon name="next" /></span>
  </button>
  {#if open}
    <div class="pop" role="listbox" aria-label={label}>
      {#if searchable}
        <label class="find">
          <Icon name="search" />
          <input type="search" placeholder={searchPlaceholder} aria-label={searchPlaceholder} bind:value={query} />
        </label>
      {/if}
      {#if shown.length === 0}
        <p class="empty">{emptyLabel}</p>
      {:else}
        <ul>
          {#each shown as option, i}
            <li>
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                class:on={option.value === value}
                class:hl={i === highlighted}
                on:click={() => choose(option.value)}
                on:mousemove={() => (highlighted = i)}
              >
                <span>{option.label}</span>
                {#if option.value === value}<Icon name="check" />{/if}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</div>

<style>
  .drop {
    position: relative;
    min-width: 0;
  }
  .cap {
    display: block;
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--muted);
    margin-bottom: 4px;
  }
  .face {
    width: 100%;
    min-height: 44px;
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 0 8px 0 14px;
    font-weight: 600;
    font-size: 0.84rem;
    color: var(--ink);
    text-align: left;
  }
  .face:active {
    transform: scale(0.99);
  }
  .val {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .chev {
    flex: none;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--muted);
  }
  .chev :global(svg) {
    width: 16px;
    height: 16px;
    transform: rotate(90deg);
    transition: transform 0.15s ease;
  }
  .chev.up :global(svg) {
    transform: rotate(-90deg);
  }
  .pop {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    right: 0;
    min-width: 200px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: var(--shadow);
    padding: 6px;
    z-index: 50;
    max-height: 280px;
    overflow-y: auto;
  }
  .find {
    display: flex;
    gap: 8px;
    align-items: center;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 0 10px;
    min-height: 44px;
    color: var(--muted);
    margin-bottom: 4px;
    position: sticky;
    top: 0;
  }
  .find input {
    border: 0;
    background: none;
    outline: none;
    width: 100%;
    color: var(--ink);
    font-size: 0.84rem;
  }
  .empty {
    color: var(--muted);
    font-size: 0.84rem;
    text-align: center;
    padding: 12px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  li button {
    width: 100%;
    min-height: 44px;
    display: flex;
    align-items: center;
    gap: 8px;
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 0.84rem;
    font-weight: 500;
    color: var(--ink);
    text-align: left;
  }
  li button span {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  li button.hl {
    background: var(--surface-2);
  }
  li button.on {
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 700;
  }
</style>
