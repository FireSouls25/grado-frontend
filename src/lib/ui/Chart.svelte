<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import * as echarts from 'echarts/core';
  import { BarChart, PieChart } from 'echarts/charts';
  import {
    GridComponent,
    TooltipComponent,
    LegendComponent,
    GraphicComponent
  } from 'echarts/components';
  import { CanvasRenderer } from 'echarts/renderers';
  import type { EChartsCoreOption } from 'echarts/core';
  import { theme } from '$lib/theme/theme';
  import { t } from '$lib/i18n';

  import { cssVar } from './cssvar';

  echarts.use([
    BarChart,
    PieChart,
    GridComponent,
    TooltipComponent,
    LegendComponent,
    GraphicComponent,
    CanvasRenderer
  ]);

  export let option: EChartsCoreOption;
  export let emptyLabel = '';
  export let empty = true;
  export let height = 240;

  let el: HTMLDivElement;
  let chart: echarts.ECharts | null = null;
  let observer: ResizeObserver | null = null;

  function palette() {
    // Resolved live from theme tokens: canvas cannot read var() directly,
    // and render() already re-runs on theme change (see onMount).
    return {
      text: cssVar('--ink', '#1b2340'),
      muted: cssVar('--muted', '#68738f'),
      line: cssVar('--line', '#e2e8f3')
    };
  }

  function render() {
    if (!chart) return;
    const p = palette();
    chart.setOption(
      {
        textStyle: { color: p.text, fontFamily: 'inherit' },
        tooltip: { trigger: 'item' },
        ...option
      },
      { replaceMerge: ['series'] }
    );
  }

  onMount(() => {
    chart = echarts.init(el);
    render();
    observer = new ResizeObserver(() => chart?.resize());
    observer.observe(el);
    const unsub = theme.subscribe(() => render());
    onDestroy(() => {
      unsub();
      observer?.disconnect();
      chart?.dispose();
      chart = null;
    });
  });

  $: if (chart) render();
</script>

<div class="wrap" style={`height: ${height}px`}>
  <div class="chart" bind:this={el} role="img" aria-label={emptyLabel || $t.charts.noData}></div>
  {#if empty}
    <div class="overlay"><span>{emptyLabel || $t.charts.noData}</span></div>
  {/if}
</div>

<style>
  .wrap {
    position: relative;
    width: 100%;
  }
  .chart {
    width: 100%;
    height: 100%;
  }
  .overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }
  .overlay span {
    background: var(--surface-2);
    border: 1px solid var(--line);
    color: var(--muted);
    font-size: 0.85rem;
    font-weight: 600;
    padding: 6px 14px;
    border-radius: var(--radius-pill);
  }
</style>
