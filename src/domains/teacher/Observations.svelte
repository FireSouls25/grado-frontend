<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n';
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ErrorState from '$lib/ui/ErrorState.svelte';
  import TeacherShell from './TeacherShell.svelte';
  import WarningNewSheet from './WarningNewSheet.svelte';
  import WarningDefenseSheet from './WarningDefenseSheet.svelte';
  import { profile } from '$lib/shell/profile';
  import { canWriteDefenses } from '$lib/access';
  import { myWarnings, type MyWarning } from './api';
  import { guarded } from '$lib/nav';
  import { foldSearch } from '$lib/search';
  import { kindChip } from './situations';

  // Los llamados de atención del docente: los mismos que ve la
  // administración en Llamados y en la ficha del estudiante, con su tipo
  // 1, 2 o 3 según la situación del manual de convivencia.
  type KindFilter = 0 | 1 | 2 | 3; // 0 = Todos

  let loading = true;
  let loadError: unknown = null;
  let rows: MyWarning[] = [];
  let filter: KindFilter = 0;
  let query = '';
  let creating = false;
  let defending: MyWarning | null = null;
  $: canDefense = canWriteDefenses($profile.me);

  const kindOf = (g: MyWarning['Gravity']): 1 | 2 | 3 => (g === 'severe' ? 3 : g === 'moderate' ? 2 : 1);

  $: visible = rows.filter((r) => {
    if (filter !== 0 && kindOf(r.Gravity) !== filter) return false;
    const q = foldSearch(query.trim());
    if (!q) return true;
    return foldSearch([r.StudentName, r.ClassLabel, r.Title, r.Description].join(' ')).includes(q);
  });
  $: countOf = (k: 1 | 2 | 3) => rows.filter((r) => kindOf(r.Gravity) === k).length;

  async function load() {
    loading = true;
    loadError = null;
    try {
      const data = await guarded(() => myWarnings());
      if (data !== null) rows = data;
    } catch (err) {
      loadError = err;
    } finally {
      loading = false;
    }
  }

  function moment(value: string): string {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  onMount(load);
</script>

<TeacherShell active="observaciones">
<div class="obs">
  <TopBar title={$t.app.name}><TopActions /></TopBar>

  <div class="pagehead">
    <p class="eyebrow">{$t.obs.eyebrow}</p>
    <h1 class="title">{$t.obs.title}</h1>
    <p class="muted">{$t.obs.subtitle}</p>
    <div class="controlbar">
      <button type="button" class="primary" on:click={() => (creating = true)}>
        <Icon name="plus" /> {$t.obs.newAction}
      </button>
    </div>
  </div>

  <div class="sheet">
    <div class="filters" role="group" aria-label={$t.obs.filterLabel}>
      <button
        type="button"
        class="fbtn"
        class:selected={filter === 0}
        aria-pressed={filter === 0}
        on:click={() => (filter = 0)}
      >
        {$t.obs.filterAll} · {rows.length}
      </button>
      {#each [1, 2, 3] as k (k)}
        <button
          type="button"
          class="fbtn {kindChip(k)}"
          class:selected={filter === k}
          aria-pressed={filter === k}
          on:click={() => (filter = k as KindFilter)}
        >
          {$t.obs.kindLabel[k]} · {countOf(k as 1 | 2 | 3)}
        </button>
      {/each}
      <span class="count" role="status">{$t.obs.count(visible.length)}</span>
    </div>

    <label class="search">
      <Icon name="search" />
      <input type="search" placeholder={$t.obs.searchPlaceholder} aria-label={$t.obs.searchPlaceholder} bind:value={query} />
    </label>

    {#if loading}
      <Skeleton rows={4} />
    {:else if loadError}
      <ErrorState error={loadError} onRetry={load} />
    {:else if visible.length === 0}
      {#if rows.length > 0}
        <EmptyState icon="book" title={$t.obs.noMatchTitle} body={$t.obs.noMatchBody} />
      {:else}
        <EmptyState icon="book" title={$t.obs.emptyTitle} body={$t.obs.emptyBody} />
      {/if}
    {:else}
      <ol class="bubbles">
        {#each visible as r (r.ID)}
          {@const k = kindOf(r.Gravity)}
          <li class="bubble">
            <span class={`chip ${kindChip(k)}`}>{$t.obs.kindLabel[k]}</span>
            <div class="btext">
              <strong>{r.Title}</strong>
              <small>{moment(r.HappenedAt)} · {r.StudentName}{#if r.ClassLabel} · {r.ClassLabel}{/if}</small>
            </div>
            {#if r.Description}
              <div class="sidebub">
                <span class="stag">{$t.obs.noteSideTitle}</span>
                {r.Description}
              </div>
            {/if}
            {#if r.Defense}
              <div class="sidebub defense">
                <span class="stag">{$t.warningDefense.action}</span>
                {r.Defense}
              </div>
            {/if}
            {#if canDefense}
              <div class="bact">
                <button type="button" class="defbtn" class:has={!!r.Defense} on:click={() => (defending = r)}>
                  {#if r.Defense}<Icon name="check" />{/if}
                  {$t.warningDefense.action}
                </button>
              </div>
            {/if}
          </li>
        {/each}
      </ol>
    {/if}
  </div>
</div>

{#if defending}
  <WarningDefenseSheet
    warningID={defending.ID}
    title={defending.Title}
    subtitle={`${defending.StudentName ?? ''}${defending.ClassLabel ? ` · ${defending.ClassLabel}` : ''}`}
    current={defending.Defense ?? ''}
    onClose={() => (defending = null)}
    onSaved={(text) => {
      const id = defending?.ID;
      rows = rows.map((x) => (x.ID === id ? { ...x, Defense: text } : x));
      defending = null;
    }}
  />
{/if}
{#if creating}
  <WarningNewSheet
    open
    scope="all"
    originLabel={$t.agenda.allGroups}
    onClose={() => (creating = false)}
    onSaved={() => {
      creating = false;
      void load();
    }}
  />
{/if}
</TeacherShell>

<style>
  .obs {
    min-height: 100vh;
    min-height: 100svh;
    background: var(--bg);
    color: var(--ink);
    /* Reserva para la barra inferior fija, no espacio muerto. */
    padding-bottom: calc(96px + env(safe-area-inset-bottom));
  }
  .pagehead {
    margin-bottom: 12px;
  }
  .eyebrow {
    color: var(--muted);
    font-size: 0.85rem;
    margin-bottom: 2px;
  }
  .title {
    font-size: 2rem;
    letter-spacing: -0.03em;
    font-weight: 550;
    line-height: 1.05;
    margin-bottom: 6px;
  }
  .muted {
    color: var(--muted);
    font-size: 0.85rem;
  }
  .controlbar {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-top: 10px;
  }
  .primary {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--ink);
    color: var(--bg);
    border: 0;
    border-radius: var(--radius-pill);
    padding: 10px 16px;
    font-size: 0.85rem;
    font-weight: 600;
    min-height: 44px;
  }
  .sheet {
    background: var(--surface);
    border: 1px solid var(--line);
    border-bottom: 0;
    border-radius: 24px 24px 0 0;
    padding: 20px 18px 40px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  /* Filtros tipo segmentado: los tres botones de tipo y "Todas". */
  .filters {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  .fbtn {
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--ink-soft);
    border-radius: var(--radius-pill);
    padding: 9px 14px;
    font-size: 0.78rem;
    font-weight: 600;
    min-height: 44px;
  }
  .fbtn.selected {
    background: var(--ink);
    color: var(--bg);
    border-color: var(--ink);
  }
  .count {
    color: var(--muted);
    font-size: 0.76rem;
    font-variant-numeric: tabular-nums;
    margin-left: auto;
  }
  .list-title {
    font-size: 1.05rem;
    font-weight: 650;
    letter-spacing: -0.01em;
    margin-top: 4px;
  }
  /* Burbujas: principal con la situación y chip del tipo; la nota adicional
     viaja como burbuja lateral pegada a la principal. */
  .bubbles {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .bubble {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 18px 18px 18px 6px;
    padding: 12px 14px 10px;
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 8px;
    align-items: start;
  }
  .btext {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .btext strong {
    font-weight: 550;
    line-height: 1.35;
  }
  .btext small {
    color: var(--muted);
    font-size: 0.74rem;
  }
  .sidebub {
    grid-column: 2;
    background: var(--tint);
    border: 1px solid var(--line);
    border-radius: 12px 12px 12px 2px;
    padding: 8px 10px;
    font-size: 0.8rem;
    color: var(--ink-soft);
    line-height: 1.35;
  }
  .sidebub.defense {
    border-left: 3px solid var(--accent);
  }
  .bact {
    grid-column: 2;
    display: flex;
    justify-content: flex-end;
  }
  .defbtn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--ink-soft);
    border-radius: var(--radius-pill);
    padding: 6px 12px;
    font-size: 0.76rem;
    font-weight: 600;
    min-height: 36px;
  }
  .defbtn.has {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--accent);
  }
  .defbtn :global(svg) {
    width: 13px;
    height: 13px;
  }
  .stag {
    display: inline-block;
    color: var(--muted);
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    margin-right: 6px;
  }
  .search {
    display: flex;
    align-items: center;
    gap: 8px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--surface);
    padding: 0 12px;
    min-height: 44px;
    color: var(--muted);
  }
  .search input {
    border: 0;
    outline: none;
    background: none;
    color: var(--ink);
    font: inherit;
    font-size: 0.85rem;
    width: 100%;
  }
</style>
