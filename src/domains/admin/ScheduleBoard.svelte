<script lang="ts">
  import { push } from 'svelte-spa-router';
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import Tabs from '$lib/ui/Tabs.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Icon from '$lib/ui/Icon.svelte';

  const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'];
  const hours = ['7 AM', '8 AM', '9 AM', '10 AM', '11 AM', '12 PM', '1 PM', '2 PM'];
  const currentYear = new Date().getFullYear();

  // Draft: salon/year pickers and cells fill in with the schedules
  // endpoints. The grid shell already follows reference/schedule example.
  let salon = '';
  let year = currentYear;
</script>

<div class="page wide">
  <TopBar title="Horario" showBack onBack={() => push('/admin')}><TopActions /></TopBar>

  <div class="pickers">
    <label>
      Salón
      <input value={salon} placeholder="7-1" on:input={(e) => (salon = e.currentTarget.value)} />
    </label>
    <label>
      Año
      <input
        value={year}
        inputmode="numeric"
        on:input={(e) => (year = Number(e.currentTarget.value) || currentYear)}
      />
    </label>
  </div>

  <div class="board-wrap">
    <div class="board" role="grid" aria-label={`Horario ${salon || '—'} ${year}`}>
      <div class="corner"></div>
      {#each days as day}
        <div class="day" role="columnheader">{day}</div>
      {/each}
      {#each hours as hour}
        <div class="hour">{hour}</div>
        {#each days as _d, di}
          <div class="cell" role="gridcell" data-day={di} data-hour={hour}></div>
        {/each}
      {/each}
    </div>
    <div class="overlay">
      <Icon name="calendar" />
      <p>
        {#if salon}
          Sin bloques para {salon} · {year}. Toca una celda vacía para asignar docente y materia.
        {:else}
          Escribe un salón para ver su semana. Tocar una celda asignará docente, materia y horas.
        {/if}
      </p>
    </div>
  </div>

  <EmptyState
    icon="book"
    title="Edición manual, como en secretaría"
    body="El horario no se genera solo: cada bloque lo coloca el administrador eligiendo docente y materia."
  />
</div>

<Tabs
  tabs={[
    { href: '/admin', icon: 'book', label: 'Resumen', active: false },
    { href: '/admin/docentes', icon: 'users', label: 'Docentes', active: false },
    { href: '/admin/estudiantes', icon: 'list', label: 'Estudiantes', active: false },
    { href: '/admin/horario', icon: 'calendar', label: 'Horario', active: true }
  ]}
  onNavigate={(href) => push(href)}
/>

<style>
  .wide {
    max-width: 100%;
  }
  @media (min-width: 900px) {
    .wide {
      max-width: 1024px;
    }
  }
  .pickers {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 12px;
  }
  .pickers label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--muted);
  }
  .pickers input {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 12px 14px;
    min-height: 52px;
    width: 100%;
  }
  .board-wrap {
    position: relative;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow);
    padding: 12px;
    overflow-x: auto;
    margin-bottom: 12px;
  }
  .board {
    display: grid;
    grid-template-columns: 52px repeat(5, minmax(96px, 1fr));
    gap: 6px;
    min-width: 560px;
  }
  .day {
    text-align: center;
    font-weight: 700;
    font-size: 0.85rem;
    padding: 6px 0;
  }
  .hour {
    color: var(--muted);
    font-size: 0.78rem;
    font-weight: 600;
    padding-top: 12px;
  }
  .cell {
    min-height: 52px;
    border-radius: var(--radius-chip);
    background: var(--surface-2);
    border: 1px dashed var(--line);
  }
  .overlay {
    position: absolute;
    inset: 12px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    text-align: center;
    background: color-mix(in srgb, var(--surface) 72%, transparent);
    border-radius: var(--radius-chip);
    padding: 24px;
    color: var(--muted);
  }
  .overlay p {
    max-width: 38ch;
    font-size: 0.92rem;
    font-weight: 600;
  }
  .overlay :global(svg) {
    width: 28px;
    height: 28px;
    color: var(--accent);
  }
</style>
