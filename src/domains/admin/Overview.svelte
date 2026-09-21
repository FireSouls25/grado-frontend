<script lang="ts">
  import { t } from '$lib/i18n';
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import Tabs from '$lib/ui/Tabs.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Chart from '$lib/ui/Chart.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { push } from 'svelte-spa-router';

  // Draft phase: no group/year selected yet (selectors land with the
  // classes endpoint). Charts render their axes + honest empty overlay.
  const emptyMarks = { presences: 0, absences: 0, evasions: 0, lates: 0 };
  const hasData = false;

  $: donut = {
    series: [
      {
        type: 'pie',
        radius: ['58%', '80%'],
        label: { show: false },
        data: [
          { value: emptyMarks.presences, name: 'Presentes', itemStyle: { color: '#1c7a4d' } },
          { value: emptyMarks.absences, name: 'Inasistencias', itemStyle: { color: '#c22e5c' } },
          { value: emptyMarks.evasions, name: 'Evasiones', itemStyle: { color: '#8a6d1a' } },
          { value: emptyMarks.lates, name: 'Atrasos', itemStyle: { color: '#1f5fc4' } }
        ]
      }
    ]
  };

  $: bars = {
    xAxis: { type: 'category', data: ['Leve', 'Medio', 'Grave'] },
    yAxis: { type: 'value' },
    series: [{ type: 'bar', data: [0, 0, 0], itemStyle: { borderRadius: [8, 8, 0, 0] } }]
  };

  const cards = [
    { icon: 'users', value: '—', label: 'Estudiantes' },
    { icon: 'book', value: '—', label: 'Docentes' },
    { icon: 'list', value: '—', label: 'Salones' },
    { icon: 'warn', value: '—', label: 'Llamados' }
  ] as const;
</script>

<div class="page">
  <TopBar title="Panel"><TopActions /></TopBar>

  <div class="grid">
    {#each cards as card}
      <div class="stat">
        <span class="badge"><Icon name={card.icon} /></span>
        <strong>{card.value}</strong>
        <span>{card.label}</span>
      </div>
    {/each}
  </div>

  <section class="panel">
    <h2>Asistencia general</h2>
    <Chart option={donut} empty={!hasData} height={220} />
  </section>

  <section class="panel">
    <h2>Llamados por gravedad</h2>
    <Chart option={bars} empty={!hasData} height={220} />
  </section>

  <EmptyState
    icon="calendar"
    title="Elige un año y un salón"
    body="Los gráficos se llenan al seleccionar el salón; los selectores llegan con el endpoint de salones."
  />
</div>

<Tabs
  tabs={[
    { href: '/admin', icon: 'book', label: 'Resumen', active: true },
    { href: '/admin/docentes', icon: 'users', label: 'Docentes', active: false },
    { href: '/admin/estudiantes', icon: 'list', label: 'Estudiantes', active: false },
    { href: '/admin/horario', icon: 'calendar', label: 'Horario', active: false }
  ]}
  onNavigate={(href) => push(href)}
/>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    margin-bottom: 12px;
  }
  @media (min-width: 900px) {
    .grid {
      grid-template-columns: repeat(4, 1fr);
    }
  }
  .stat {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow);
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    animation: rise 0.3s ease both;
  }
  .stat strong {
    font-size: 1.5rem;
  }
  .stat span:last-child {
    color: var(--muted);
    font-size: 0.85rem;
    font-weight: 600;
  }
  .badge {
    width: 38px;
    height: 38px;
    border-radius: var(--radius-pill);
    background: var(--accent-soft);
    color: var(--accent);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 6px;
  }
  .panel {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow);
    padding: 18px;
    margin-bottom: 12px;
  }
  .panel h2 {
    font-size: 1rem;
    margin-bottom: 8px;
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
