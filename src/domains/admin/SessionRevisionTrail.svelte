<script lang="ts">
  // Trail de revisiones de una llamada: mismo lenguaje en el historial
  // de llamadas y en el resumen del estudiante. Con studentName filtra
  // a ese estudiante y oculta la pastilla de nombre (ya está en contexto).
  import { t } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';
  import type { SessionRevisionRow } from './api';

  export let revisions: SessionRevisionRow[] = [];
  export let studentName: string | null = null;

  $: rows = studentName ? revisions.filter((r) => r.Student === studentName) : revisions;

  function markName(m: string): string {
    if (m === 'absence') return $t.admin.markAbsence;
    if (m === 'absence-permission') return $t.admin.markPermission;
    if (m === 'late') return $t.admin.markLate;
    if (m === 'evasion') return $t.admin.markEvasion;
    return $t.admin.markPresent;
  }

  function markClass(m: string): string {
    if (m === 'absence' || m === 'absent') return 'is-absent';
    if (m === 'absence-permission') return 'is-permission';
    if (m === 'late') return 'is-late';
    if (m === 'evasion') return 'is-evasion';
    return 'is-present';
  }

  function momentTs(value: string): string {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString('es-CO', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
</script>

{#if rows.length === 0}
  <p class="muted">{$t.troll.shistory.revisionsEmpty}</p>
{:else}
  <ul class="revs">
    {#each rows as r (r.Student + r.ChangedAt + r.To)}
      <li class="rev">
        <span class="changerow">
          {#if !studentName}
            <span class="person">{r.Student}</span>
          {/if}
          <span class="change">
            {#if r.From}
              <span class={`mk ${markClass(r.From)}`}>{markName(r.From)}</span>
              <span class="swap" aria-hidden="true"><Icon name="next" /></span>
            {:else}
              <span class="first">{$t.admin.markPresent}</span>
            {/if}
            <span class={`mk solid ${markClass(r.To)}`}>{markName(r.To)}</span>
          </span>
        </span>
        {#if r.Note}<small class="revnote">{r.Note}</small>{/if}
        <span class="meta">
          <span class="box">{r.Author}</span>
          <span class="box">{momentTs(r.ChangedAt)}</span>
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
    gap: 6px;
    flex-wrap: wrap;
  }
  .mk {
    border-radius: 999px;
    padding: 3px 12px;
    font-size: 0.75rem;
    font-weight: 800;
    border: 2px solid transparent;
  }
  .mk.is-present {
    color: var(--chip-green-ink);
    border-color: var(--chip-green-ink);
  }
  .mk.is-absent {
    color: var(--g-grave-ink);
    border-color: var(--g-grave-ink);
  }
  .mk.is-permission {
    color: var(--m-permission);
    border-color: var(--m-permission);
  }
  .mk.is-late {
    color: var(--chip-yellow-ink);
    border-color: var(--chip-yellow-ink);
  }
  .mk.is-evasion {
    color: var(--chip-purple-ink);
    border-color: var(--chip-purple-ink);
  }
  .mk.solid.is-present {
    background: var(--chip-green-bg);
    border-color: transparent;
  }
  .mk.solid.is-absent {
    background: var(--chip-pink-bg);
    border-color: transparent;
  }
  .mk.solid.is-permission {
    background: var(--m-permission-bg);
    border-color: transparent;
  }
  .mk.solid.is-late {
    background: var(--chip-yellow-bg);
    border-color: transparent;
  }
  .mk.solid.is-evasion {
    background: var(--chip-purple-bg);
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
  .first {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--muted);
  }
  .revnote {
    font-size: 0.82rem;
    color: var(--ink-soft);
  }
  .meta {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .box {
    background: var(--tint);
    border-radius: 6px;
    padding: 2px 8px;
    font-size: 0.75rem;
    color: var(--muted);
  }
</style>
