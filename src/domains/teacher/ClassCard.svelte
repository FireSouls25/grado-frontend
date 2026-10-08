<script lang="ts">
  import { t } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';
  import type { TeacherClass } from './api';

  export let entry: TeacherClass;
  export let studentsLabel: string;
  export let students: string;
  export let onOpen: () => void;
</script>

<article class="card">
  <div class="main">
    <span class="subjectpill">{entry.SubjectName || entry.ClassLabel}</span>
    <h2>{entry.ClassLabel}</h2>
    <div class="facts">
      <span class="factpill"><Icon name="clock" /> {entry.Start} – {entry.End}</span>
      {#if students}
        <span class="factpill"><Icon name="users" /> {students}</span>
      {/if}
    </div>
    <span class="sr">{studentsLabel}</span>
  </div>
  <button type="button" class="open" on:click={onOpen}>{$t.agenda.openList}</button>
</article>

<style>
  .card {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    text-align: left;
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    padding: 16px 18px;
    min-height: 96px;
  }
  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  .main h2 {
    font-size: 1.4rem;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }
  .subjectpill {
    background: var(--tint);
    color: var(--ink-soft);
    border-radius: var(--radius-pill);
    padding: 5px 12px;
    font-size: 0.74rem;
    font-weight: 600;
    white-space: nowrap;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .facts {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 8px;
  }
  .factpill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: var(--tint);
    color: var(--ink-soft);
    border-radius: var(--radius-pill);
    padding: 4px 11px;
    font-size: 0.74rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .factpill :global(svg) {
    width: 15px;
    height: 15px;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
  .open {
    flex: none;
    background: var(--surface);
    border: 1px solid var(--line);
    color: var(--ink);
    font-weight: 700;
    font-size: 0.85rem;
    white-space: nowrap;
    border-radius: var(--radius-chip);
    padding: 9px 18px;
    min-height: 44px;
  }
  .open:active {
    transform: scale(0.97);
  }
</style>
