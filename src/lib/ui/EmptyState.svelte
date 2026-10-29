<script lang="ts">
  import Icon from './Icon.svelte';

  export let icon:
    | 'users'
    | 'calendar'
    | 'list'
    | 'warn'
    | 'book'
    | 'cap'
    | 'search' = 'users';
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
    <button class="btn btn-primary cta" type="button" on:click={onAction}>{actionLabel}</button>
  {/if}
</div>

<style>
  .empty {
    background: var(--surface-2);
    border: 1px dashed var(--control);
    border-radius: var(--radius-card);
    padding: 28px 20px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
  .badge {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-control);
    background: var(--surface);
    border: 1px solid var(--line);
    color: var(--muted);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 4px;
  }
  .empty h2 {
    font-size: 0.95rem;
    font-weight: 600;
  }
  .empty p {
    color: var(--muted);
    font-size: 0.85rem;
    max-width: 40ch;
  }
  .cta {
    margin-top: 8px;
  }
</style>
