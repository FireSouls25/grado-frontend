<script lang="ts">
  import Icon from './Icon.svelte';

  export let icon:
    | 'users'
    | 'calendar'
    | 'list'
    | 'warn'
    | 'book' = 'users';
  export let title: string;
  export let body = '';
  export let actionLabel = '';
  export let onAction: (() => void) | null = null;
</script>

<div class="empty" role="status">
  <div class="badge"><Icon name={icon} /></div>
  <h2>{title}</h2>
  {#if body}<p>{body}</p>{/if}
  {#if actionLabel && onAction}
    <button class="cta" type="button" on:click={onAction}>{actionLabel}</button>
  {/if}
</div>

<style>
  .empty {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow);
    padding: 32px 24px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    animation: rise 0.3s ease both;
  }
  .badge {
    width: 52px;
    height: 52px;
    border-radius: var(--radius-pill);
    background: var(--accent-soft);
    color: var(--accent);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 4px;
  }
  .empty p {
    color: var(--muted);
    font-size: 0.95rem;
    max-width: 36ch;
  }
  .cta {
    margin-top: 8px;
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 600;
    padding: 12px 24px;
    border-radius: var(--radius-pill);
    min-height: 48px;
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
