<script lang="ts">
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import Tabs from '$lib/ui/Tabs.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { teachers, type TeacherSummary } from './api';
  import { isMissing } from '../teacher/api';
  import { ApiError } from '$lib/api/types';
  import { guarded } from '$lib/nav';

  let state: 'loading' | 'error' | 'ready' = 'loading';
  let list: TeacherSummary[] = [];

  async function load() {
    state = 'loading';
    try {
      const data = await guarded(() => teachers());
      if (data === null) return;
      list = [...data].sort((a, b) =>
        `${a.surnames} ${a.names}`.toLowerCase() < `${b.surnames} ${b.names}`.toLowerCase() ? -1 : 1
      );
      state = 'ready';
    } catch (err) {
      state = err instanceof ApiError && isMissing(err) ? 'ready' : 'error';
    }
  }

  onMount(load);
</script>

<div class="page">
  <TopBar title="Docentes" showBack onBack={() => push('/admin')}><TopActions /></TopBar>

  {#if state === 'loading'}
    <Skeleton rows={4} />
  {:else if state === 'error'}
    <EmptyState
      icon="warn"
      title="No se pudo cargar. Revisa tu conexión e intenta de nuevo."
      actionLabel="Reintentar"
      onAction={load}
    />
  {:else if list.length === 0}
    <EmptyState
      icon="users"
      title="Aún no hay docentes"
      body="Las cuentas las crean los administradores. Cuando existan, aquí verás su ficha, sus materias y sus salones."
    />
  {:else}
    <ul class="roster">
      {#each list as teacher (teacher.id)}
        <li>
          <button
            type="button"
            class="row"
            on:click={() => push(`/admin/docentes/${encodeURIComponent(teacher.id)}`)}
          >
            <span class="who">
              <span class="name">{teacher.surnames} {teacher.names}</span>
              <span class="sub">
                {teacher.documentID}
                {#if teacher.homeroomClassID}· Dirige {teacher.homeroomClassID}{/if}
                {#if !teacher.active}· Inactivo{/if}
              </span>
            </span>
            <span class="go" aria-hidden="true"><Icon name="next" /></span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<Tabs
  tabs={[
    { href: '/admin', icon: 'book', label: 'Resumen', active: false },
    { href: '/admin/docentes', icon: 'users', label: 'Docentes', active: true },
    { href: '/admin/estudiantes', icon: 'list', label: 'Estudiantes', active: false },
    { href: '/admin/horario', icon: 'calendar', label: 'Horario', active: false }
  ]}
  onNavigate={(href) => push(href)}
/>

<style>
  .roster {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    text-align: left;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    padding: 14px 16px;
    min-height: 68px;
    transition: transform 0.1s ease;
    animation: rise 0.25s ease both;
  }
  .row:active {
    transform: scale(0.98);
  }
  .who {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .name {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sub {
    color: var(--muted);
    font-size: 0.85rem;
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
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
</style>
