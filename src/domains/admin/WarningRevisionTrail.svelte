<script lang="ts">
  // Trail de correcciones de un llamado: mismo lenguaje en la zona
  // dedicada y en el resumen del estudiante. Con studentName filtra a un
  // estudiante y oculta la pastilla de nombre.
  import { t } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';
  import type { WarningRevision } from './api';

  export let revisions: WarningRevision[] = [];
  /** Nombre a mostrar en la pastilla de persona; vacío la oculta. */
  export let personName = '';

  $: rows = revisions;

  function gravityName(g: string): string {
    return g === 'mild'
      ? $t.roster.warnGravityMild
      : g === 'moderate'
        ? $t.roster.warnGravityModerate
        : $t.roster.warnGravitySevere;
  }

  function gravityMarkClass(g: string): string {
    return g === 'mild' ? 'is-mild' : g === 'moderate' ? 'is-moderate' : 'is-severe';
  }

  function moment(value: string): string {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
</script>

{#if rows.length === 0}
  <p class="muted">{$t.warnings.revisionsEmpty}</p>
{:else}
  <ul class="revs">
    {#each rows as r (r.WarningID + r.ChangedAt)}
      <li class="rev">
        <span class="changerow">
          {#if personName}
            <span class="person">{personName}</span>
          {/if}
          {#if r.OldGravity !== r.NewGravity}
            <span class="change">
              <span class={`mk ${gravityMarkClass(r.OldGravity)}`}>
                {r.OldGravity ? gravityName(r.OldGravity) : '—'}
              </span>
              <span class="swap" aria-hidden="true"><Icon name="next" /></span>
              <span class={`mk solid ${gravityMarkClass(r.NewGravity)}`}>
                {gravityName(r.NewGravity)}
              </span>
            </span>
          {/if}
        </span>
        {#if r.OldTitle !== r.NewTitle}
          <span class="tchange">
            <span class="tlabel">{$t.warnings.renamedLabel}</span>
            <span class="told">«{r.OldTitle || '—'}»</span>
            <span class="swap" aria-hidden="true"><Icon name="next" /></span>
            <span class="tnew">«{r.NewTitle}»</span>
          </span>
        {/if}
        {#if r.OldDetail !== r.NewDetail}
          <span class="tchange">
            <span class="tlabel">{$t.warnings.detailLabel}</span>
            <span class="told">{r.OldDetail || '—'}</span>
            <span class="swap" aria-hidden="true"><Icon name="next" /></span>
            <span class="tnew">{r.NewDetail || '—'}</span>
          </span>
        {/if}
        <span class="meta">
          <span class="box">{r.Author}</span>
          <span class="box">{moment(r.ChangedAt)}</span>
        </span>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .muted {
    color: var(--muted);
    font-size: 0.9rem;
  }
  .revs {
    list-style: none;
    margin: 0;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
  }
  .rev {
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 10px 12px;
  }
  .changerow {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .person {
    align-self: flex-start;
    background: var(--tint);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 3px 10px;
    font-size: 0.82rem;
    font-weight: 800;
  }
  .change {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 4px 12px 4px 4px;
  }
  .mk {
    border-radius: 999px;
    padding: 3px 12px;
    font-size: 0.75rem;
    font-weight: 800;
    border: 2px solid transparent;
  }
  .mk.is-mild {
    color: var(--chip-sky-ink);
    border-color: var(--chip-sky-ink);
  }
  .mk.is-moderate {
    color: var(--chip-yellow-ink);
    border-color: var(--chip-yellow-ink);
  }
  .mk.is-severe {
    color: var(--g-grave-ink);
    border-color: var(--g-grave-ink);
  }
  .mk.solid.is-mild {
    background: var(--chip-sky-bg);
    border-color: transparent;
  }
  .mk.solid.is-moderate {
    background: var(--chip-yellow-bg);
    border-color: transparent;
  }
  .mk.solid.is-severe {
    background: var(--chip-pink-bg);
    border-color: transparent;
  }
  .swap {
    flex: none;
    width: 22px;
    height: 22px;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .swap :global(svg) {
    width: 12px;
    height: 12px;
  }
  .tchange {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    font-size: 0.85rem;
  }
  .tlabel {
    font-size: 0.72rem;
    font-weight: 800;
    text-transform: uppercase;
    color: var(--muted);
  }
  .told {
    color: var(--muted);
    text-decoration: line-through;
  }
  .tnew {
    font-weight: 700;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .box {
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 2px 8px;
    font-size: 0.72rem;
    color: var(--ink-soft);
    white-space: nowrap;
  }
  .box:first-child {
    background: var(--accent-soft);
    border-color: transparent;
    color: var(--accent);
  }
</style>
