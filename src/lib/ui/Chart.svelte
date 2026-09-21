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
  export let emptyLabel = 'Sin datos todavía';
  export let empty = true;
  export let height = 240;

  let el: HTMLDivElement;
  let chart: echarts.ECharts | null = null;
  let observer: ResizeObserver | null = null;

  function palette() {
    const dark =
      document.documentElement.dataset.theme === 'dark' ||
      (document.documentElement.dataset.theme !== 'light' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    return dark
      ? { text: '#eef1f7', muted: '#9aa3c0', line: '#26304d' }
      : { text: '#1b2340', muted: '#68738f', line: '#e2e8f3' };
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
  <div class="chart" bind:this={el} role="img" aria-label={emptyLabel}></div>
  {#if empty}
    <div class="overlay"><span>{emptyLabel}</span></div>
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
