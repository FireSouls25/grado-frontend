<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import Icon from './Icon.svelte';

  interface DropOption {
    value: string;
    label: string;
    /** Agrupador opcional: pinta cabecera antes del primer ítem del grupo. */
    group?: string;
    /** Nota a la derecha (ej. quién ya lo ocupa). No bloquea elegir. */
    note?: string;
  }

  export let label: string = '';
  export let hideLabel = false;
  export let value: string;
  export let options: DropOption[] = [];
  export let placeholder = '';
  export let searchable = false;
  export let searchPlaceholder = '';
  export let emptyLabel = '—';
  export let disabled = false;
  /** Permite varias líneas por opción (situaciones largas del manual). */
  export let wrap = false;
  /** Panel más alto para listas largas (catálogo de materias). */
  export let tall = false;

  const dispatch = createEventDispatcher<{ select: string }>();

  let open = false;
  let query = '';
  let highlighted = -1;
  let box: HTMLDivElement | null = null;
  let face: HTMLButtonElement | null = null;
  let up = false;
  let popMax = 0;
  let spacerH = 0;

  $: q = query.trim().toLowerCase();
  $: shown = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  $: current = options.find((o) => o.value === value);
  // Cabeceras en orden de aparición; el buscador aplana (sin grupos).
  $: blocks = (() => {
    if (q) return [{ group: '', items: shown }];
    const out: { group: string; items: typeof shown }[] = [];
    for (const o of shown) {
      const g = o.group ?? '';
      const last = out[out.length - 1];
      if (last && last.group === g) last.items.push(o);
      else out.push({ group: g, items: [o] });
    }
    return out;
  })();

  // Sin portales: el panel es absoluto dentro del contenedor con scroll
  // y se mueve con él. Cuando abajo no cabe, se abre hacia arriba.
  function measure() {
    if (!face) return null;
    const f = face.getBoundingClientRect();
    let el = box?.parentElement ?? null;
    while (el) {
      const oy = getComputedStyle(el).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1) {
        const r = el.getBoundingClientRect();
        return { below: r.bottom - f.bottom, above: f.top - r.top };
      }
      el = el.parentElement;
    }
    return { below: window.innerHeight - f.bottom, above: f.top };
  }

  function openMenu() {
    open = true;
    query = '';
    highlighted = Math.max(0, shown.findIndex((o) => o.value === value));
    const maxH = tall ? 400 : 260;
    const space = measure();
    if (space && space.below < 180 && space.above > space.below) {
      up = true;
      popMax = Math.min(maxH, Math.max(140, space.above - 8));
      spacerH = 0;
    } else {
      // Hacia abajo: se reserva el alto del panel en el flujo para que
      // la hoja crezca (hasta su tope) en vez de recortar las opciones.
      up = false;
      popMax = 0;
      spacerH = maxH;
    }
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
  {#if label && !hideLabel}
    <span class="cap">{label}</span>
  {/if}
  <button
    type="button"
    class="face"
    bind:this={face}
    aria-label={label || placeholder}
    aria-haspopup="listbox"
    aria-expanded={open}
    disabled={disabled}
    on:click={() => (open ? close() : openMenu())}
  >
    <span class="val" class:placeholder={!current}>{current ? current.label : placeholder}</span>
    <span class="chev" class:up={open} aria-hidden="true"><Icon name="next" /></span>
  </button>
  {#if open}
    <div class="pop" class:tall class:up style={popMax ? `max-height:${popMax}px` : ''} role="listbox" aria-label={label || placeholder}>
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
          {#each blocks as block}
            {#if block.group}
              <li class="ghead" aria-hidden="true">{block.group}</li>
            {/if}
            {#each block.items as option, i}
              <li>
                <button
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  class:on={option.value === value}
                  class:wrap={wrap}
                  class:hl={option.value === (shown[highlighted]?.value ?? '::none::')}
                  on:click={() => choose(option.value)}
                  on:mousemove={() => (highlighted = shown.indexOf(option))}
                >
                  <span>{option.label}</span>
                  {#if option.note}<small class="note">{option.note}</small>{/if}
                  {#if option.value === value}<Icon name="check" />{/if}
                </button>
              </li>
            {/each}
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
  {#if open && spacerH}
    <div class="spacer" style={`height:${spacerH}px`} aria-hidden="true"></div>
  {/if}
</div>

<style>
  .drop {
    position: relative;
    min-width: 0;
  }
  .cap {
    display: block;
    font-size: var(--fs-small);
    font-weight: 500;
    color: var(--muted);
    margin-bottom: 5px;
  }
  .face {
    width: 100%;
    min-height: var(--control-height);
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--surface);
    border: 1px solid var(--control);
    border-radius: var(--radius-control);
    padding: 0 8px 0 12px;
    font-weight: 500;
    font-size: 0.84rem;
    color: var(--ink);
    text-align: left;
  }
  .face:hover:not(:disabled) {
    background: var(--surface-2);
    border-color: var(--ink-soft);
  }
  .face:active:not(:disabled) {
    transform: translateY(1px);
  }
  .face:disabled {
    opacity: 0.55;
  }
  .val {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .val.placeholder {
    color: var(--faint);
  }
  .chev {
    flex: none;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--muted);
  }
  .chev :global(svg) {
    width: 15px;
    height: 15px;
    transform: rotate(90deg);
    transition: transform var(--t-fast) var(--ease-out);
  }
  .chev.up :global(svg) {
    transform: rotate(-90deg);
  }
  .pop {
    position: absolute;
    top: calc(100% + 5px);
    left: 0;
    right: 0;
    min-width: 190px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    padding: 5px;
    z-index: 60;
    max-height: 260px;
    overflow-y: auto;
    animation: dropIn 0.14s var(--ease-out) both;
  }
  .pop.tall {
    max-height: 400px;
  }
  /* Sin espacio abajo: el panel crece hacia arriba del botón. */
  .pop.up {
    top: auto;
    bottom: calc(100% + 5px);
  }
  .find {
    display: flex;
    gap: 8px;
    align-items: center;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 0 10px;
    min-height: 36px;
    color: var(--muted);
    margin-bottom: 4px;
    position: sticky;
    top: 0;
    z-index: 1;
  }
  .find input {
    border: 0;
    background: none;
    outline: none;
    width: 100%;
    color: var(--ink);
    font-size: 0.82rem;
  }
  .empty {
    color: var(--muted);
    font-size: 0.82rem;
    text-align: center;
    padding: 10px;
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
    min-height: 36px;
    display: flex;
    align-items: center;
    gap: 8px;
    border-radius: 6px;
    padding: 7px 10px;
    font-size: 0.84rem;
    font-weight: 500;
    color: var(--ink);
    text-align: left;
  }
  li button span {
    flex: 1;
    min-width: 0;
  }
  li button .note {
    flex: none;
    margin-left: auto;
    color: var(--muted);
    font-size: 0.72rem;
    font-weight: 600;
    white-space: nowrap;
  }
  .spacer {
    width: 100%;
  }
  li button:not(.wrap) span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  li button.wrap span {
    /* Las situaciones del manual son largas: varias líneas, sin recorte. */
    white-space: normal;
    overflow-wrap: anywhere;
    line-height: 1.35;
  }
  .ghead {
    position: sticky;
    top: 0;
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
    background: var(--surface);
    padding: 8px 10px 4px;
  }
  li button :global(svg) {
    width: 15px;
    height: 15px;
    flex: none;
  }
  li button.hl {
    background: var(--surface-2);
  }
  li button.on {
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 600;
  }
  @keyframes dropIn {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
</style>
