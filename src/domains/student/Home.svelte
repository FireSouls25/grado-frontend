<script lang="ts">
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import { t } from '$lib/i18n';
</script>

<div class="page">
  <TopBar title={$t.app.name}><TopActions /></TopBar>

  <div class="pagehead">
    <p class="eyebrow">{$t.studentHome.eyebrow}</p>
    <h1 class="title">{$t.studentHome.title}</h1>
  </div>

  <div class="sheet">
    <EmptyState
      icon="users"
      title={$t.studentHome.title}
      body={$t.studentHome.body}
    />
  </div>
</div>

<style>
  .page {
    min-height: 100vh;
    min-height: 100svh;
    background: var(--bg);
    color: var(--ink);
    padding-bottom: 40px;
  }
  .pagehead {
    margin-bottom: 12px;
  }
  .eyebrow {
    color: var(--muted);
    font-size: 0.85rem;
    margin-bottom: 2px;
  }
  .title {
    font-size: 2rem;
    letter-spacing: -0.03em;
    font-weight: 550;
    line-height: 1.05;
  }
  .sheet {
    background: var(--surface);
    border: 1px solid var(--line);
    border-bottom: 0;
    border-radius: 24px 24px 0 0;
    padding: 20px 18px 40px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  @media (min-width: 720px) {
    .title {
      font-size: 2.4rem;
    }
    .sheet {
      padding: 24px 26px 60px;
    }
  }
</style>
