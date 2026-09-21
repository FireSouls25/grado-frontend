<script lang="ts">
  import { t } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';
</script>

<div class="panel">
  <p class="intro">{$t.help.intro}</p>
  {#each $t.help.guides as guide}
    <article class="guide">
      <div class="badge"><Icon name="book" /></div>
      <div>
        <h3>{guide.title}</h3>
        <p>{guide.body}</p>
      </div>
    </article>
  {/each}
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .intro {
    color: var(--muted);
    font-size: 0.92rem;
  }
  .guide {
    display: flex;
    gap: 12px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 14px;
    animation: rise 0.25s ease both;
  }
  .guide:nth-child(3) {
    animation-delay: 0.05s;
  }
  .guide:nth-child(4) {
    animation-delay: 0.1s;
  }
  .badge {
    flex: none;
    width: 40px;
    height: 40px;
    border-radius: var(--radius-pill);
    background: var(--accent-soft);
    color: var(--accent);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  h3 {
    font-size: 0.95rem;
    margin-bottom: 2px;
  }
  p {
    color: var(--muted);
    font-size: 0.9rem;
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
</style>
