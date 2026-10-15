<script lang="ts">
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { t } from '$lib/i18n';
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import AdminShell from './AdminShell.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ErrorState from '$lib/ui/ErrorState.svelte';
  import Dropdown from '$lib/ui/Dropdown.svelte';
  import { auditRecent, type AuditEntry } from './api';
  import { auditActionClass, shortId } from '$lib/audit';
  import { guarded } from '$lib/nav';
  import { isMissing } from '../teacher/api';
  import { ApiError } from '$lib/api/types';

  const currentYear = new Date().getFullYear();

  let state: 'loading' | 'error' | 'ready' = 'loading';
  let loadError: unknown = null;
  let entries: AuditEntry[] = [];
  let filter: '' | AuditEntry['Action'] = '';
  let denied = false;

  async function load() {
    state = 'loading';
    loadError = null;
    denied = false;
    try {
      entries = (await guarded(() => auditRecent(100))) ?? [];
      state = 'ready';
    } catch (err) {
      if (err instanceof ApiError && isMissing(err)) {
        // Sin endpoint todavía: vacío honesto, no pantalla de error.
        entries = [];
        state = 'ready';
        return;
      }
      if (err instanceof ApiError && err.status === 403) {
        denied = true;
        state = 'ready';
        return;
      }
      loadError = err;
      state = 'error';
    }
  }

  onMount(load);

  $: visible = filter === '' ? entries : entries.filter((e) => e.Action === filter);

  function moment(value: string): string {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
</script>

<AdminShell active="auditoria" year={currentYear}>
  <TopBar title={$t.audit.title} showBack onBack={() => push('/admin')}>
    <TopActions />
  </TopBar>

  <div class="pagehead">
    <p class="eyebrow">{$t.admin.consoleEyebrow}</p>
    <div class="toolbar">
      <Dropdown
        label={$t.audit.filterLabel}
        value={filter}
        options={[
          { value: '', label: $t.audit.filterAll },
          { value: 'read', label: $t.studentDetail.actionLabel.read },
          { value: 'create', label: $t.studentDetail.actionLabel.create },
          { value: 'update', label: $t.studentDetail.actionLabel.update },
          { value: 'mark', label: $t.studentDetail.actionLabel.mark }
        ]}
        on:select={(e) => (filter = e.detail as typeof filter)}
      />
      <span class="count" role="status">{$t.audit.countLabel(visible.length)}</span>
    </div>
  </div>

  <div class="sheet">
    <h2 class="card-title">{$t.audit.listTitle}</h2>
    <p class="muted">{$t.audit.listHint}</p>

    {#if state === 'loading'}
      <Skeleton rows={6} />
    {:else if state === 'error'}
      <ErrorState error={loadError} onRetry={load} />
    {:else if denied}
      <EmptyState icon="warn" title={$t.audit.deniedTitle} body={$t.audit.deniedBody} />
    {:else if visible.length === 0}
      <EmptyState icon="list" title={$t.audit.emptyTitle} body={$t.audit.emptyBody} />
    {:else}
      <ul class="rows">
        {#each visible as e (e.ID)}
          <li>
            <span class={`pill ${auditActionClass(e.Action)}`}>{$t.studentDetail.actionLabel[e.Action]}</span>
            <div class="what">
              <strong>{$t.studentDetail.resourceLabel[e.Resource]}</strong>
              <small>{moment(e.HappenedAt)}</small>
            </div>
            <div class="who">
              <small>{$t.studentDetail.byLabel}</small>
              <code>{shortId(e.SubjectID)}</code>
            </div>
            <span class="res" title={$t.audit.resourceIdLabel}>{shortId(e.ResourceID)}</span>
            <span class="code" class:denied={e.Status >= 400}>{e.Status}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</AdminShell>

<style>
  .pagehead {
    margin-bottom: 12px;
  }
  .eyebrow {
    color: var(--muted);
    font-size: 0.85rem;
    margin-bottom: 8px;
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .count {
    color: var(--muted);
    font-size: 0.82rem;
    font-weight: 600;
  }
  .sheet {
    background: var(--surface);
    border: 1px solid var(--line);
    border-bottom: 0;
    border-radius: var(--radius-card) var(--radius-card) 0 0;
    padding: 22px;
  }
  .card-title {
    font-size: 1.05rem;
  }
  .muted {
    color: var(--muted);
    font-size: 0.84rem;
    margin: 2px 0 16px;
  }
  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }
  .rows li {
    display: grid;
    grid-template-columns: 104px minmax(0, 1fr) 120px 90px 46px;
    gap: 12px;
    align-items: center;
    padding: 12px 4px;
    border-bottom: 1px solid var(--line);
  }
  .rows li:last-child {
    border-bottom: none;
  }
  .pill {
    border-radius: 999px;
    padding: 2px 10px;
    font-size: 0.72rem;
    font-weight: 700;
    text-align: center;
  }
  .pill.read {
    background: var(--surface-2);
    color: var(--muted);
  }
  .pill.write {
    background: var(--chip-sky-bg);
    color: var(--chip-sky-ink);
  }
  .what {
    min-width: 0;
  }
  .what strong {
    display: block;
    font-size: 0.9rem;
  }
  .what small,
  .who small {
    color: var(--muted);
    font-size: 0.75rem;
  }
  .who {
    display: flex;
    flex-direction: column;
  }
  .who code {
    font-size: 0.78rem;
  }
  .res {
    color: var(--muted);
    font-size: 0.75rem;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .code {
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
  .code.denied {
    color: var(--danger);
  }
  @media (max-width: 760px) {
    .rows li {
      grid-template-columns: 92px minmax(0, 1fr) 44px;
    }
    .who,
    .res {
      display: none;
    }
  }
</style>