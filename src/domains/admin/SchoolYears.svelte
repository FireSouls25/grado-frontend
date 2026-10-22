<script lang="ts">
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ErrorState from '$lib/ui/ErrorState.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import AdminShell from './AdminShell.svelte';
  import PeriodBlocks from './PeriodBlocks.svelte';
  import { guarded } from '$lib/nav';
  import { ApiError } from '$lib/api/types';
  import { t } from '$lib/i18n';
  import {
    listYears,
    createYear,
    updateYear,
    closeYear,
    officialHolidays,
    groupsByYear,
    type SchoolYear
  } from './api';

  const currentYear = new Date().getFullYear();
  let years: SchoolYear[] = [];
  let state: 'loading' | 'error' | 'ready' = 'loading';
  let loadError: unknown = null;

  // Creation form. Period count defaults to the newest year's (the
  // suggestion that carries forward), dates and ranges split evenly.
  let creating = false;
  let step: 1 | 2 = 1;
  let saving = false;
  let feedback = '';
  let error = '';
  let form = freshForm(currentYear, 4);

  // Edition (holidays always; full while the year has no groups).
  let editing: string | null = null;
  let editSaving = false;
  let editError = '';
  let editForm = freshForm(currentYear, 4);
  let editStarted = false;
  let closing: string | null = null;
  let closingBusy = false;

  interface YearForm {
    year: number;
    periods: number;
    start: string;
    end: string;
    holidays: string[];
    holidayDraft: string;
    noClass: string[];
    noClassDraft: string;
    ranges: { start: string; end: string }[];
  }

  function freshForm(year: number, periods: number): YearForm {
    const b = yearBounds(year);
    return { year, periods, start: b.start, end: b.end, holidays: [], holidayDraft: '', noClass: [], noClassDraft: '', ranges: [] };
  }

  /** El año lectivo siempre va del 1 de enero al 31 de diciembre. */
  function yearBounds(year: number): { start: string; end: string } {
    if (!year || year < 2000 || year > 2100) return { start: '', end: '' };
    return { start: `${year}-01-01`, end: `${year}-12-31` };
  }

  function syncBounds(f: YearForm): void {
    const b = yearBounds(f.year);
    f.start = b.start;
    f.end = b.end;
    splitEven(f);
    f = f;
  }

  function isoDay(v: string): string {
    return v ? v.slice(0, 10) : '';
  }

  function toRFC3339(day: string): string {
    return new Date(day + 'T00:00:00Z').toISOString();
  }

  function latest(): SchoolYear | null {
    return years.length > 0 ? years[0] : null;
  }

  async function load() {
    state = 'loading';
    loadError = null;
    try {
      const data = await guarded(() => listYears());
      if (data === null) {
        // guarded() already routed (401 → login, 403 → back): never spin forever.
        state = 'error';
        return;
      }
      years = data;
      state = 'ready';
    } catch (err) {
      loadError = err;
      state = 'error';
    }
  }

  function openCreate() {
    const last = latest();
    const year = last ? last.Year + 1 : currentYear;
    form = freshForm(year, last?.Periods ?? 4);
    error = '';
    feedback = '';
    step = 1;
    creating = true;
  }

  /** Even split of [start, end] into n ranges: the editable suggestion. */
  function splitEven(f: YearForm): void {
    if (!f.start || !f.end || f.periods < 1) return;
    const start = new Date(f.start + 'T00:00:00Z').getTime();
    const end = new Date(f.end + 'T00:00:00Z').getTime();
    if (!(end > start)) return;
    const day = 86400000;
    const total = Math.round((end - start) / day) + 1;
    const per = Math.floor(total / f.periods);
    let cursor = start;
    f.ranges = [];
    for (let i = 0; i < f.periods; i++) {
      const span = i === f.periods - 1 ? end : cursor + (per - 1) * day;
      f.ranges.push({ start: isoDay(new Date(cursor).toISOString()), end: isoDay(new Date(span).toISOString()) });
      cursor = span + day;
    }
    f.ranges = f.ranges;
  }

  function validRanges(f: YearForm): string {
    if (f.ranges.length !== f.periods) return $t.admin.yearsNeedRanges;
    let prevEnd = '';
    for (const r of f.ranges) {
      if (!r.start || !r.end) return $t.admin.yearsNeedRanges;
      if (!(r.end > r.start)) return $t.admin.yearsInvalidRanges;
      if (f.start && r.start < f.start) return $t.admin.yearsInvalidRanges;
      if (f.end && r.end > f.end) return $t.admin.yearsInvalidRanges;
      if (prevEnd && !(r.start > prevEnd)) return $t.admin.yearsInvalidRanges;
      prevEnd = r.end;
    }
    return '';
  }

  function validateStep1(f: YearForm): string {
    if (!f.year || f.year < 2000 || f.year > 2100) return $t.admin.yearsInvalidYear;
    if (f.periods < 1 || f.periods > 6) return $t.admin.yearsInvalidPeriods;
    const b = yearBounds(f.year);
    f.start = b.start;
    f.end = b.end;
    if (!f.start || !f.end || !(f.end > f.start)) return $t.admin.yearsInvalidDates;
    return '';
  }

  function goStep2() {
    error = validateStep1(form);
    if (error) return;
    if (form.ranges.length !== form.periods) splitEven(form);
    error = '';
    step = 2;
  }

  function validate(f: YearForm): string {
    if (!f.year || f.year < 2000 || f.year > 2100) return $t.admin.yearsInvalidYear;
    if (f.periods < 1 || f.periods > 6) return $t.admin.yearsInvalidPeriods;
    if (!f.start || !f.end || !(f.end > f.start)) return $t.admin.yearsInvalidDates;
    return validRanges(f);
  }

  async function save() {
    if (saving) return;
    error = validate(form);
    feedback = '';
    if (error) return;
    saving = true;
    try {
      await createYear({
        year: form.year,
        periods: form.periods,
        startDate: toRFC3339(form.start),
        endDate: toRFC3339(form.end),
        holidays: form.holidays.map(toRFC3339),
        noClassDays: form.noClass.map(toRFC3339),
        periodRanges: form.ranges.map((r) => ({ start: toRFC3339(r.start), end: toRFC3339(r.end) }))
      });
      feedback = $t.admin.yearCreated;
      creating = false;
      await load();
    } catch (err) {
      error = err instanceof ApiError ? err.message : $t.common.loadError;
    } finally {
      saving = false;
    }
  }

  async function startEdit(y: SchoolYear) {
    editError = '';
    editForm = {
      year: y.Year,
      periods: y.Periods,
      start: isoDay(y.StartDate),
      end: isoDay(y.EndDate),
      holidays: (y.Holidays ?? []).map(isoDay),
      holidayDraft: '',
      noClass: (y.NoClassDays ?? []).map(isoDay),
      noClassDraft: '',
      ranges: (y.PeriodRanges ?? []).map((r) => ({ start: isoDay(r.Start), end: isoDay(r.End) }))
    };
    editStarted = false;
    try {
      const groups = await guarded(() => groupsByYear(y.Year));
      editStarted = groups !== null && groups.length > 0;
    } catch {
      editStarted = false;
    }
    editing = y.ID;
  }

  async function saveEdit(y: SchoolYear) {
    if (editSaving) return;
    editError = '';
    const err = validate(editForm);
    if (err) {
      editError = err;
      return;
    }
    editSaving = true;
    try {
      await updateYear(y.ID, {
        year: editForm.year,
        periods: editForm.periods,
        startDate: toRFC3339(editForm.start),
        endDate: toRFC3339(editForm.end),
        holidays: editForm.holidays.map(toRFC3339),
        noClassDays: editForm.noClass.map(toRFC3339),
        periodRanges: editForm.ranges.map((r) => ({ start: toRFC3339(r.start), end: toRFC3339(r.end) }))
      });
      feedback = $t.admin.yearUpdated;
      editing = null;
      await load();
    } catch (e) {
      editError = e instanceof ApiError ? e.message : $t.common.loadError;
    } finally {
      editSaving = false;
    }
  }

  async function close(y: SchoolYear) {
    if (closingBusy) return;
    if (closing !== y.ID) {
      closing = y.ID;
      return;
    }
    closingBusy = true;
    try {
      await closeYear(y.ID);
      feedback = $t.admin.yearClosedOk;
      closing = null;
      await load();
    } catch (err) {
      error = err instanceof ApiError ? err.message : $t.common.loadError;
    } finally {
      closingBusy = false;
    }
  }

  function addHoliday(f: YearForm) {
    if (!f.holidayDraft) return;
    const day = isoDay(f.holidayDraft);
    if (day && !f.holidays.includes(day)) f.holidays = [...f.holidays, day].sort();
    f.holidayDraft = '';
  }

  function addNoClass(f: YearForm) {
    if (!f.noClassDraft) return;
    const day = isoDay(f.noClassDraft);
    if (day && !f.noClass.includes(day)) f.noClass = [...f.noClass, day].sort();
    f.noClassDraft = '';
  }

  let preloading = false;
  let preloadError = '';

  async function preloadHolidays(f: YearForm) {
    if (preloading) return;
    preloadError = '';
    if (!f.year || f.year < 2000 || f.year > 2100) {
      preloadError = $t.admin.yearsInvalidYear;
      return;
    }
    preloading = true;
    try {
      const days = await guarded(() => officialHolidays(f.year));
      if (days) {
        const merged = new Set([...f.holidays, ...days]);
        f.holidays = [...merged].sort();
      }
    } catch (err) {
      preloadError = err instanceof ApiError ? err.message : $t.common.loadError;
    } finally {
      preloading = false;
    }
  }

  onMount(load);
</script>

<AdminShell active="anos" year={currentYear} onYear={null}>
  <TopBar title={$t.admin.yearsTitle} showBack onBack={() => push('/admin')}><TopActions /></TopBar>

  <div class="pagehead">
    <p class="eyebrow">{$t.admin.consoleEyebrow}</p>
    <div class="toolbar">
      {#if feedback}<p class="flash" role="status">{feedback}</p>{/if}
      {#if !creating}
        <button type="button" class="new" on:click={openCreate}>{$t.admin.yearsNew}</button>
      {/if}
    </div>
  </div>

  {#if creating}
    <section class="card">
      <h2>{$t.admin.yearsNew}</h2>
      <p class="muted">{$t.admin.yearsStepOf(1, 2)}</p>
      {#if step === 1}
        <p class="question">{$t.admin.yearsHowMany(form.year)}</p>
        <div class="stepper">
          <button type="button" class="stepbtn" aria-label="−" disabled={form.periods <= 1} on:click={() => { form.periods = Math.max(1, form.periods - 1); form = form; }}>−</button>
          <strong class="stepval" aria-live="polite">{$t.admin.yearsPeriodsCount(form.periods)}</strong>
          <button type="button" class="stepbtn" aria-label="+" disabled={form.periods >= 6} on:click={() => { form.periods = Math.min(6, form.periods + 1); form = form; }}>+</button>
        </div>
        <div class="grid2">
          <label>{$t.admin.yearLabel}
            <input type="number" min="2000" max="2100" bind:value={form.year} on:change={() => syncBounds(form)} />
          </label>
        </div>
        <p class="muted">{$t.admin.yearsFixedRange(form.year)}</p>
        {#if error}<p class="error" role="alert">{error}</p>{/if}
        <div class="toolbar">
          <button type="button" class="primary" on:click={goStep2}>{$t.admin.yearsContinue}</button>
          <button
            type="button" class="mini"
            on:click={() => { creating = false; error = ''; }}
          >{$t.common.cancel}</button>
        </div>
      {:else}
        <p class="muted">{$t.admin.yearsStepOf(2, 2)} · {$t.admin.yearsFixedRange(form.year)}</p>
        <div class="row-head">
          <h3>{$t.admin.yearsRanges}</h3>
          <button type="button" class="mini" on:click={() => splitEven(form)}>{$t.admin.yearsSplitEven}</button>
        </div>
        {#if form.ranges.length !== form.periods}
          <p class="error" role="alert">{$t.admin.yearsNeedRanges}</p>
        {/if}
        <PeriodBlocks
          bind:ranges={form.ranges}
          min={form.start}
          max={form.end}
          titlePrefix={$t.admin.yearsPeriodBlock}
          startLabel={$t.admin.yearsStart}
          endLabel={$t.admin.yearsEnd}
        />
      <div class="row-head">
        <h3>{$t.admin.yearsHolidays}</h3>
        <button type="button" class="mini" disabled={preloading} on:click={() => preloadHolidays(form)}>
          {preloading ? $t.common.retrying : $t.admin.yearsPreloadHolidays}
        </button>
      </div>
      {#if preloadError}<p class="error" role="alert">{preloadError}</p>{/if}
      <div class="hollyrow">
        <input type="date" bind:value={form.holidayDraft} />
        <button type="button" class="mini" on:click={() => addHoliday(form)}>{$t.admin.yearsAddHoliday}</button>
      </div>
      {#if form.holidays.length > 0}
        <p class="chips">
          {#each form.holidays as h}
            <span class="chip">{h}
              <button
                type="button" class="x" aria-label={$t.common.close}
                on:click={() => (form.holidays = form.holidays.filter((x) => x !== h))}>×</button>
            </span>
          {/each}
        </p>
      {/if}
      <div class="row-head">
        <h3>{$t.admin.yearsNoClass}</h3>
      </div>
      <p class="muted">{$t.admin.yearsNoClassHint}</p>
      <div class="hollyrow">
        <input type="date" bind:value={form.noClassDraft} />
        <button type="button" class="mini" on:click={() => addNoClass(form)}>{$t.admin.yearsAddHoliday}</button>
      </div>
      {#if form.noClass.length > 0}
        <p class="chips">
          {#each form.noClass as h}
            <span class="chip chip-pink">{h}
              <button
                type="button" class="x" aria-label={$t.common.close}
                on:click={() => (form.noClass = form.noClass.filter((x) => x !== h))}>×</button>
            </span>
          {/each}
        </p>
      {/if}
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <div class="toolbar">
        <button type="button" class="mini" on:click={() => { step = 1; error = ''; }}>{$t.admin.yearsBack}</button>
        <button type="button" class="primary" disabled={saving || form.ranges.length !== form.periods} on:click={save}>
          {saving ? $t.common.retrying : $t.admin.formCreate}
        </button>
        <button
          type="button" class="mini"
          on:click={() => { creating = false; error = ''; }}
        >{$t.common.cancel}</button>
      </div>
      {/if}
    </section>
  {/if}

  <div class="sheet">
    {#if state === 'loading'}
      <Skeleton rows={4} />
    {:else if state === 'error'}
      <ErrorState error={loadError} onRetry={load} />
    {:else if years.length === 0}
      <EmptyState icon="cap" title={$t.admin.yearsEmptyTitle} body={$t.admin.yearsEmptyBody} />
    {:else}
      {#each years as y (y.ID)}
        <section class="card">
          <div class="row-head">
            <h2>{y.Year}</h2>
            <div class="badges">
              <span class="chip">{$t.admin.yearsPeriodsCount(y.Periods)}</span>
              {#if y.Closed}
                <span class="chip chip-pink">{$t.admin.yearsClosed}</span>
              {/if}
            </div>
          </div>
          <p class="muted">{isoDay(y.StartDate)} → {isoDay(y.EndDate)} · {$t.admin.yearsHolidaysCount(y.Holidays.length)}{y.NoClassDays.length > 0 ? ` · ${$t.admin.yearsNoClassCount(y.NoClassDays.length)}` : ''}</p>
          {#if y.Holidays.length > 0}
            <p class="chips">
              {#each y.Holidays.map(isoDay) as h}
                <span class="chip">{h}</span>
              {/each}
            </p>
          {/if}
          {#if y.NoClassDays.length > 0}
            <p class="chips">
              {#each y.NoClassDays.map(isoDay) as h}
                <span class="chip chip-pink">{$t.admin.yearsNoClassShort}: {h}</span>
              {/each}
            </p>
          {/if}
          {#if y.PeriodRanges.length > 0}
            <PeriodBlocks
              ranges={y.PeriodRanges.map((r) => ({ start: isoDay(r.Start), end: isoDay(r.End) }))}
              readonly
              titlePrefix={$t.admin.yearsPeriodBlock}
            />
          {:else}
            <p class="muted">{$t.admin.yearsNoRanges}</p>
          {/if}
          {#if editing === y.ID}
            <div class="grid2">
              <label>{$t.admin.yearLabel}
                <input
                  type="number" min="2000" max="2100" bind:value={editForm.year} disabled={editStarted || y.Closed}
                  on:change={() => { if (!editStarted) syncBounds(editForm); }}
                />
              </label>
              <label>{$t.admin.yearsPeriods}
                <input type="number" min="1" max="6" bind:value={editForm.periods} disabled={editStarted || y.Closed} />
              </label>
              <label>{$t.admin.yearsStart}<input type="date" bind:value={editForm.start} disabled /></label>
              <label>{$t.admin.yearsEnd}<input type="date" bind:value={editForm.end} disabled /></label>
            </div>
            {#if editStarted && !y.Closed}
              <p class="muted">{$t.admin.yearsStartedNote}</p>
            {/if}
            {#if !editStarted && !y.Closed}
              <div class="row-head">
                <h3>{$t.admin.yearsRanges}</h3>
                <button type="button" class="mini" on:click={() => splitEven(editForm)}>{$t.admin.yearsSplitEven}</button>
              </div>
              <PeriodBlocks
                bind:ranges={editForm.ranges}
                min={editForm.start}
                max={editForm.end}
                titlePrefix={$t.admin.yearsPeriodBlock}
                startLabel={$t.admin.yearsStart}
                endLabel={$t.admin.yearsEnd}
              />
            {/if}
            {#if y.Closed}
              <p class="muted">{$t.admin.yearsClosedNote}</p>
            {/if}
            {#if !y.Closed}
              <div class="row-head">
                <h3>{$t.admin.yearsHolidays}</h3>
                <button type="button" class="mini" disabled={preloading} on:click={() => preloadHolidays(editForm)}>
                  {preloading ? $t.common.retrying : $t.admin.yearsPreloadHolidays}
                </button>
              </div>
              {#if preloadError}<p class="error" role="alert">{preloadError}</p>{/if}
              <div class="hollyrow">
                <input type="date" bind:value={editForm.holidayDraft} />
                <button type="button" class="mini" on:click={() => addHoliday(editForm)}>{$t.admin.yearsAddHoliday}</button>
              </div>
              {#if editForm.holidays.length > 0}
                <p class="chips">
                  {#each editForm.holidays as h}
                    <span class="chip">{h}
                      <button
                        type="button" class="x" aria-label={$t.common.close}
                        on:click={() => (editForm.holidays = editForm.holidays.filter((x) => x !== h))}>×</button>
                    </span>
                  {/each}
                </p>
              {/if}
              <div class="row-head">
                <h3>{$t.admin.yearsNoClass}</h3>
              </div>
              <p class="muted">{$t.admin.yearsNoClassHint}</p>
              <div class="hollyrow">
                <input type="date" bind:value={editForm.noClassDraft} />
                <button type="button" class="mini" on:click={() => addNoClass(editForm)}>{$t.admin.yearsAddHoliday}</button>
              </div>
              {#if editForm.noClass.length > 0}
                <p class="chips">
                  {#each editForm.noClass as h}
                    <span class="chip chip-pink">{h}
                      <button
                        type="button" class="x" aria-label={$t.common.close}
                        on:click={() => (editForm.noClass = editForm.noClass.filter((x) => x !== h))}>×</button>
                    </span>
                  {/each}
                </p>
              {/if}
            {/if}
            {#if editError}<p class="error" role="alert">{editError}</p>{/if}
            {#if !y.Closed}
              <div class="toolbar">
                <button type="button" class="primary" disabled={editSaving} on:click={() => saveEdit(y)}>
                  {editSaving ? $t.common.retrying : $t.common.save}
                </button>
                <button type="button" class="mini" on:click={() => (editing = null)}>{$t.common.cancel}</button>
              </div>
            {/if}
          {:else}
            <div class="toolbar">
              {#if !y.Closed}
                <button type="button" class="mini" on:click={() => startEdit(y)}>{$t.admin.editYear}</button>
                <button
                  type="button" class="mini danger"
                  disabled={closingBusy}
                  on:click={() => close(y)}
                >{closing === y.ID ? $t.admin.confirmCloseYear : $t.admin.closeYear}</button>
                {#if closing === y.ID}
                  <button type="button" class="mini" on:click={() => (closing = null)}>{$t.common.cancel}</button>
                {/if}
              {/if}
            </div>
            {#if closing === y.ID}
              <p class="warn" role="alert">{$t.admin.confirmCloseBody(y.Year)}</p>
            {/if}
          {/if}
        </section>
      {/each}
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
    margin-bottom: 2px;
  }
  .toolbar {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  .question {
    font-size: 1.2rem;
    font-weight: 600;
    letter-spacing: -0.01em;
  }
  .stepper {
    display: flex;
    align-items: center;
    gap: 16px;
    margin: 4px 0 8px;
  }
  .stepbtn {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    border: 1px solid var(--line);
    background: var(--surface-2);
    font-size: 1.5rem;
    font-weight: 700;
    line-height: 1;
  }
  .stepbtn:disabled {
    opacity: 0.4;
  }
  .stepval {
    font-size: 1.4rem;
    min-width: 110px;
    text-align: center;
  }
  .flash {
    color: var(--chip-green-ink);
    font-weight: 600;
  }
  .new {
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 700;
    min-height: 44px;
    border-radius: var(--radius-pill);
    padding: 0 18px;
  }
  .sheet {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 24px 24px 0 0;
    padding: 20px 18px 40px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .card {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow);
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .row-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
  }
  .row-head h2 {
    font-size: 1.4rem;
    letter-spacing: -0.02em;
  }
  .row-head h3 {
    font-size: 0.9rem;
    color: var(--ink-soft);
  }
  .badges {
    display: flex;
    gap: 6px;
  }
  .muted {
    color: var(--muted);
    font-size: 0.9rem;
  }
  .warn {
    color: var(--danger);
    font-size: 0.9rem;
    font-weight: 600;
  }
  .error {
    color: var(--danger);
    font-size: 0.9rem;
    font-weight: 600;
  }
  .grid2 {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 10px;
  }
  .grid2 label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.85rem;
    font-weight: 600;
  }
  .grid2 input {
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 10px 12px;
    min-height: 48px;
  }
  .hollyrow {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .hollyrow input {
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 10px 12px;
    min-height: 48px;
  }
  .chips {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: var(--tint);
    border-radius: var(--radius-pill);
    padding: 4px 10px;
    font-size: 0.85rem;
  }
  .chip-pink {
    background: var(--chip-pink-bg, #fbe4e6);
    color: var(--chip-pink-ink, #b4232f);
  }
  .mini {
    border: 1px solid var(--line);
    border-radius: var(--radius-pill);
    padding: 8px 14px;
    min-height: 44px;
    font-weight: 600;
  }
  .mini.danger {
    color: var(--danger);
    border-color: var(--danger);
  }
  .primary {
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 700;
    min-height: 48px;
    border-radius: var(--radius-pill);
    padding: 0 20px;
  }
  .primary:disabled {
    opacity: 0.7;
  }
  .x {
    min-width: 24px;
    min-height: 24px;
    font-weight: 700;
  }
</style>
