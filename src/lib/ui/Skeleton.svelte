<script lang="ts">
  // Shimmering placeholder rows shown while content loads.
  export let rows = 3;
</script>

<div class="stack" aria-hidden="true">
  {#each Array(rows) as _}
    <div class="row"><div class="shimmer"></div></div>
  {/each}
</div>

<style>
  .stack {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .row {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    padding: 18px;
  }
  .shimmer {
    height: 18px;
    border-radius: 8px;
    background: linear-gradient(
      100deg,
      var(--surface-2) 30%,
      var(--line) 50%,
      var(--surface-2) 70%
    );
    background-size: 200% 100%;
    animation: slide 1.2s ease-in-out infinite;
  }
  @keyframes slide {
    from {
      background-position: 180% 0;
    }
    to {
      background-position: -80% 0;
    }
  }
</style>
