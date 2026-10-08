<script lang="ts">
  import { push } from 'svelte-spa-router';
  import { t } from '$lib/i18n';
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import AdminShell from './AdminShell.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Dropdown from '$lib/ui/Dropdown.svelte';
  import { onMount } from 'svelte';
  import { groupsByYear } from './api';

  const currentYear = new Date().getFullYear();
  // Salones con opciones reales del año + escritura libre con filtro:
  // combobox nativo (input + datalist), táctil y sin dependencias.
  let salon = '';
  let year = currentYear;
  let salonOptions: string[] = [];
  let optionsYear = 0;
  const yearOptions = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];

  $: boardDays = [...$t.admin.scheduleWeekdays, ...$t.admin.scheduleWeekend];

  async function loadGroups() {
    if (year === optionsYear) return;
    optionsYear = year;
    try {
      salonOptions = (await groupsByYear(year))
        .map((g) => g.ClassLabel)
        .sort((a, b) => a.localeCompare(b, 'es'));
      if (!salon && salonOptions.length > 0) salon = salonOptions[0];
    } catch {
      salonOptions = [];
    }
  }

  function onSalonSelect(next: string) {
    salon = next;
  }

  function onYearSelect(next: string) {
    year = Number(next) || currentYear;
    void loadGroups();
  }

  onMount(loadGroups);
</script>

<AdminShell active="horario" {year}>
  <TopBar title={$t.admin.scheduleTitle} showBack onBack={() => push('/admin')}><TopActions /></TopBar>

  <div class="pagehead">
    <p class="eyebrow">{$t.admin.consoleEyebrow}</p>
  </div>

  <div class="sheet">
  <div class="pickers">
    <Dropdown
      label={$t.admin.scheduleGroupLabel}
      value={salon}
      placeholder={$t.admin.scheduleGroupPlaceholder}
      searchable
      searchPlaceholder={$t.admin.scheduleGroupPlaceholder}
      options={salonOptions.map((option) => ({ value: option, label: option }))}
      on:select={(e) => onSalonSelect(e.detail)}
    />
    <Dropdown
      label={$t.admin.scheduleYearLabel}
      value={String(year)}
      options={yearOptions.map((option) => ({ value: String(option), label: String(option) }))}
      on:select={(e) => onYearSelect(e.detail)}
    />
  </div>

  <div class="board-wrap">
    <div class="board" role="grid" aria-label={`${$t.admin.scheduleTitle} ${salon || '—'} ${year}`}>
      <div class="corner"></div>
      {#each boardDays as day}
        <div class="day" role="columnheader">{day}</div>
      {/each}
      {#each $t.admin.scheduleHours as hour}
        <div class="hour">{hour}</div>
        {#each boardDays as _d, di}
          <div class="cell" role="gridcell" data-day={di} data-hour={hour}></div>
        {/each}
      {/each}
    </div>
    <div class="overlay">
      <Icon name="calendar" />
      <p>
        {#if salon}
          {$t.admin.scheduleNoBlocks(salon, year)}
        {:else}
          {$t.admin.scheduleEmpty}
          {$t.admin.scheduleEditHint}
        {/if}
      </p>
    </div>
  </div>

  <p class="soon-note"><span class="soon">{$t.admin.soon}</span> {$t.admin.scheduleSoon}</p>
  </div>

  <EmptyState
    icon="book"
    title={$t.admin.scheduleManualTitle}
    body={$t.admin.scheduleManualBody}
  />

</AdminShell>

<style>
  .pagehead {
    margin-bottom: 12px;
  }
  .eyebrow {
    color: var(--muted);
    font-size: 0.85rem;
    margin-bottom: 2px;
  }
  .sheet {
    background: var(--surface);
    border: 1px solid var(--line);
    border-bottom: 0;
    border-radius: 24px 24px 0 0;
    padding: 16px 16px 130px;
  }
  @media (min-width: 700px) {
    .sheet {
      padding: 20px 20px 130px;
    }
  }
  .soon-note {
    display: flex;
    gap: 8px;
    align-items: center;
    color: var(--muted);
    font-size: 0.85rem;
    margin-top: 12px;
  }
  .soon {
    background: var(--tint);
    color: var(--muted);
    font-weight: 700;
    font-size: 0.72rem;
    border-radius: 999px;
    padding: 8px 14px;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    white-space: nowrap;
    flex: none;
  }
  .pickers {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 12px;
  }
  .board-wrap {
    position: relative;
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow);
    padding: 12px;
    overflow-x: auto;
    margin-bottom: 12px;
  }
  .board {
    display: grid;
    grid-template-columns: 52px repeat(7, minmax(96px, 1fr));
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
    border: 1px dashed var(--grid);
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
    background: var(--surface-2);
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
