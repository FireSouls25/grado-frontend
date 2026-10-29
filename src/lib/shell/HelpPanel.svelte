<script lang="ts">
  import { t } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';
</script>

<div class="panel">
  <p class="intro">{$t.help.intro}</p>
  <div class="guides">
    {#each $t.help.guides as guide}
      <article class="guide">
        <div class="badge"><Icon name="book" /></div>
        <div class="gtext">
          <h3>{guide.title}</h3>
          <p>{guide.body}</p>
        </div>
      </article>
    {/each}
  </div>
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .intro {
    color: var(--muted);
    font-size: 0.85rem;
  }
  .guides {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .guide {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    padding: 12px 14px;
  }
  .badge {
    flex: none;
    width: 34px;
    height: 34px;
    border-radius: var(--radius-control);
    background: var(--accent-soft);
    color: var(--accent);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .badge :global(svg) {
    width: 16px;
    height: 16px;
  }
  .gtext {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  h3 {
    font-size: 0.88rem;
    font-weight: 600;
  }
  p {
    color: var(--muted);
    font-size: 0.82rem;
    line-height: 1.45;
  }
</style>
