<script lang="ts">
  import { t } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';
  import { paletteFor } from '$lib/ui/palette';
  import type { TeacherClass } from './api';

  export let entry: TeacherClass;
  export let studentsLabel: string;
  export let students: string;
  export let onOpen: () => void;

  $: palette = paletteFor(entry.subjectID || entry.groupID);
</script>

<button type="button" class="card" on:click={onOpen}>
  <div class="main">
    <span class={`chip chip-${palette}`}>{entry.subjectName || entry.classLabel}</span>
    <h2>{entry.classLabel}</h2>
    <p class="meta">
      <Icon name="clock" />
      <span>{entry.start} – {entry.end}</span>
      {#if students}
        <span class="dot" aria-hidden="true">·</span>
        <span>{students}</span>
      {/if}
    </p>
    <p class="sr">{studentsLabel}</p>
  </div>
  <span class="go" aria-hidden="true"><Icon name="next" /></span>
</button>

<style>
  .card {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    text-align: left;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow);
    padding: 18px;
    min-height: 96px;
    transition:
      transform 0.1s ease,
      box-shadow 0.2s ease;
    animation: rise 0.3s ease both;
  }
  .card:hover {
    box-shadow:
      0 14px 32px rgba(27, 35, 64, 0.13);
  }
  .card:active {
    transform: scale(0.98);
  }
  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }
  .main h2 {
    font-size: 1.4rem;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--muted);
    font-size: 0.9rem;
    font-weight: 600;
  }
  .meta :global(svg) {
    width: 16px;
    height: 16px;
  }
  .dot {
    opacity: 0.6;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
  .go {
    flex: none;
    width: 40px;
    height: 40px;
    border-radius: var(--radius-pill);
    background: var(--surface-2);
    color: var(--muted);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
</style>
