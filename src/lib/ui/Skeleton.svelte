<script lang="ts">
  // Flat tonal placeholder rows shown while content loads (no gradient shimmer).
  export let rows = 3;
</script>

<div class="stack" aria-hidden="true">
  {#each Array(rows) as _, i}
    <div class="row">
      <div class="bar primary" style={`width: ${65 - (i % 3) * 12}%`}></div>
      <div class="bar secondary" style={`width: ${40 + (i % 2) * 15}%`}></div>
    </div>
  {/each}
</div>

<style>
  .stack {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .row {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .bar {
    height: 12px;
    border-radius: 4px;
    background: var(--tint);
    animation: pulse 1.5s ease-in-out infinite;
  }
  .bar.secondary {
    height: 10px;
    opacity: 0.65;
  }
  @keyframes pulse {
    0%,
    100% {
      opacity: 0.85;
    }
    50% {
      opacity: 0.45;
    }
  }
</style>
