<script lang="ts">
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ErrorState from '$lib/ui/ErrorState.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import Dropdown from '$lib/ui/Dropdown.svelte';
  import AdminShell from './AdminShell.svelte';
  import { guarded, goBack } from '$lib/nav';
  import { notify } from '$lib/ui/notice';
  import { ApiError } from '$lib/api/types';
  import { t } from '$lib/i18n';
  import {
    groupsByYear,
    listYears,
    classReport,
    studentReport,
    recordPromotion,
    promotionsForGroup,
    closeYear,
    type YearGroup,
    type Promotion,
    type PromotionDecision
  } from './api';

  const currentYear = new Date().getFullYear();
  const RISK_RATE = 0.85;
  const decisionKinds: PromotionDecision[] = ['promote', 'repeat', 'graduate'];

  let year = currentYear;
  let groups: YearGroup[] = [];
  let picked: YearGroup | null = null;
  let years: { ID: string; Year: number; EndDate: string; Closed: boolean; PeriodRanges: { Start: string; End: string }[] }[] = [];
  let closing = false;
  let closeSaving = false;
  let closeError = '';
  let earlyOverride = false;

  let state: 'loading' | 'error' | 'ready' = 'loading';
  let loadError: unknown = null;

  interface Row {
    studentID: string;
    grade: number;
    names: string;
    sessions: number;
    rate: number | null;
    severeWarnings: number;
    severeFaults: number;
    critical: string[];
    suggestion: PromotionDecision;
    decided: Promotion | null;
    choice: PromotionDecision;
    dest: string;
    saving: boolean;
    error: string;
    done: boolean;
  }

  let rows: Row[] = [];
  let destGroups: YearGroup[] = [];
  let nextYearExists = false;
  let nextYearInCatalog = false;
  let lastPeriodActive = false;

  $: decidedCount = rows.filter((r) => r.decided || r.done).length;
  $: criticalCount = rows.filter((r) => r.critical.length > 0).length;
  $: lowRateCount = rows.filter((r) => r.critical.includes('rate')).length;
  $: graveCount = rows.filter((r) => r.critical.includes('warnings')).length;
  $: severeFaultCount = rows.filter((r) => r.critical.includes('faults')).length;

  async function loadYears() {
    try {
      const data = await guarded(() => listYears());
      if (data) {
        years = data.map((y) => ({
          ID: y.ID,
          Year: y.Year,
          EndDate: y.EndDate ?? '',
          Closed: !!y.Closed,
          PeriodRanges: y.PeriodRanges ?? []
        }));
      }
    } catch {
      years = [];
    }
  }

  async function groupsOrEmpty(y: number): Promise<YearGroup[]> {
    try {
      return (await guarded(() => groupsByYear(y))) ?? [];
    } catch {
      return [];
    }
  }

  $: yearRec = years.find((y) => y.Year === year) ?? null;
  $: yearClosed = yearRec?.Closed ?? false;
  $: yearEnd = yearRec?.EndDate ? new Date(`${yearRec.EndDate.slice(0, 10)}T12:00:00`) : null;
  $: yearEnded = yearEnd !== null && new Date() >= yearEnd;
  $: closeBlocked = !yearClosed && !yearEnded && !earlyOverride;
  $: yearEndLabel = yearEnd
    ? yearEnd.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  $: closeAllowed = !yearClosed && (yearEnded || earlyOverride);

  async function confirmClose() {
    if (!yearRec || closeSaving) return;
    closeError = '';
    closeSaving = true;
    try {
      await guarded(() => closeYear(yearRec.ID));
      closing = false;
      earlyOverride = false;
      notify($t.cierre.closedOk);
      await loadYears();
      await loadGroups();
    } catch (err) {
      closeError = err instanceof ApiError ? err.message : $t.common.loadError;
    } finally {
      closeSaving = false;
    }
  }

  function checkLastPeriod() {
    const y = years.find((v) => v.Year === year);
    lastPeriodActive = false;
    if (!y || y.PeriodRanges.length === 0) return;
    const last = y.PeriodRanges[y.PeriodRanges.length - 1];
    const now = new Date();
    lastPeriodActive = new Date(last.Start) <= now && now <= new Date(last.End);
  }

  async function loadGroups() {
    state = 'loading';
    loadError = null;
    picked = null;
    rows = [];
    try {
      const [gs, dest] = await Promise.all([groupsOrEmpty(year), groupsOrEmpty(year + 1)]);
      groups = gs;
      destGroups = dest;
      nextYearExists = dest.length > 0;
      nextYearInCatalog = years.some((y) => y.Year === year + 1);
      if (groups.length > 0) picked = groups[0];
      checkLastPeriod();
      state = 'ready';
      if (picked) await loadReview();
    } catch (err) {
      loadError = err;
      state = 'error';
    }
  }

  function suggest(grade: number, critical: string[]): PromotionDecision {
    if (grade === 11) return critical.length > 0 ? 'repeat' : 'graduate';
    return critical.length > 0 ? 'repeat' : 'promote';
  }

  function defaultDest(grade: number, decision: PromotionDecision): string {
    const want = decision === 'promote' ? grade + 1 : grade;
    return destGroups.find((g) => g.Grade === want)?.GroupID ?? '';
  }

  async function loadReview() {
    if (!picked) return;
    state = 'loading';
    try {
      const [report, decided] = await Promise.all([
        guarded(() => classReport(picked!.GroupID)),
        guarded(() => promotionsForGroup(picked!.GroupID))
      ]);
      if (!report || !decided) {
        state = 'error';
        return;
      }
      const byStudent = new Map(decided.map((d) => [d.StudentID, d]));
      const details = await Promise.all(
        report.Students.map(async (s) => {
          try {
            return await guarded(() => studentReport(s.StudentID));
          } catch {
            return null;
          }
        })
      );
      rows = report.Students.map((s, i) => {
        const rep = details[i];
        const rate = s.Sessions > 0 ? s.Presences / s.Sessions : null;
        const severeWarnings = rep?.WarningsSevere ?? 0;
        const severeFaults = rep?.FaultsSevere ?? 0;
        const critical: string[] = [];
        if (rate !== null && rate < RISK_RATE) critical.push('rate');
        if (severeWarnings > 0) critical.push('warnings');
        if (severeFaults > 0) critical.push('faults');
        const suggestion = suggest(picked!.Grade, critical);
        const decidedRec = byStudent.get(s.StudentID) ?? null;
        return {
          studentID: s.StudentID,
          grade: picked!.Grade,
          names: `${s.Surnames} ${s.Names}`,
          sessions: s.Sessions,
          rate,
          severeWarnings,
          severeFaults,
          critical,
          suggestion,
          decided: decidedRec,
          choice: decidedRec?.Decision ?? suggestion,
          dest: decidedRec?.ToGroupID ?? defaultDest(picked!.Grade, decidedRec?.Decision ?? suggestion),
          saving: false,
          error: '',
          done: false
        };
      });
      state = 'ready';
    } catch (err) {
      loadError = err;
      state = 'error';
    }
  }

  function decisionLabel(d: PromotionDecision): string {
    if (d === 'promote') return $t.cierre.decision_promote;
    if (d === 'repeat') return $t.cierre.decision_repeat;
    return $t.cierre.decision_graduate;
  }

  function destOptions(grade: number, decision: PromotionDecision): YearGroup[] {
    if (decision === 'graduate') return [];
    const want = decision === 'promote' ? grade + 1 : grade;
    return destGroups.filter((g) => g.Grade === want);
  }

  async function saveRow(row: Row) {
    if (!picked || row.saving) return;
    row.error = '';
    if (row.choice !== 'graduate' && !row.dest) {
      row.error = $t.cierre.destRequired;
      rows = rows;
      return;
    }
    row.saving = true;
    rows = rows;
    try {
      const rec = await guarded(() =>
        recordPromotion({
          studentID: row.studentID,
          fromGroupID: picked!.GroupID,
          ...(row.choice === 'graduate' ? {} : { toGroupID: row.dest }),
          decision: row.choice
        })
      );
      if (rec) {
        row.decided = rec;
        row.done = true;
      }
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) {
        row.error = err instanceof ApiError ? err.message : $t.common.loadError;
      }
    } finally {
      row.saving = false;
      rows = rows;
    }
  }

  function changeYear(delta: number) {
    year += delta;
    void loadGroups();
  }

  function pickGroup(id: string) {
    picked = groups.find((g) => g.GroupID === id) ?? null;
    if (picked) void loadReview();
  }

  onMount(async () => {
    await loadYears();
    await loadGroups();
  });
</script>

<AdminShell active="cierre" {year} onYear={changeYear}>
  <TopBar title={$t.cierre.title} showBack onBack={() => goBack('/admin')}><TopActions /></TopBar>

  <div class="pagehead">
    <p class="eyebrow">{$t.admin.consoleEyebrow}</p>
    {#if lastPeriodActive}
      <p class="banner" role="status">{$t.cierre.lastPeriod}</p>
    {:else}
      <p class="muted">{$t.cierre.outsidePeriod}</p>
    {/if}
  </div>

  <div class="sheet">
    {#if yearRec}
      <div class="statuscard" class:closed={yearClosed}>
        <div class="row-head">
          <h2>{yearClosed ? $t.cierre.statusClosed : $t.cierre.statusOpen} · {year}</h2>
          {#if closeAllowed && !closing}
            <button type="button" class="mini danger" on:click={() => { closing = true; closeError = ''; }}>
              {$t.cierre.confirmAction}
            </button>
          {/if}
        </div>
        {#if yearClosed}
          <p class="muted"><strong>{$t.cierre.lockedTitle}</strong></p>
          <p class="muted">{$t.cierre.lockedBody}</p>
        {:else if !yearEnded}
          <p class="muted"><strong>{$t.cierre.notYetTitle}.</strong> {$t.cierre.notYetBody(yearEndLabel)}</p>
          <label class="override">
            <input type="checkbox" bind:checked={earlyOverride} />
            <span>{$t.cierre.overrideLabel}</span>
          </label>
          <p class="muted">{$t.cierre.previewNote}</p>
        {:else}
          <p class="muted"><strong>{$t.cierre.confirmTitle}.</strong></p>
          <p class="muted">{$t.cierre.confirmBody}</p>
        {/if}
        {#if closing && closeAllowed}
          <div class="confirmbox" role="alertdialog" aria-label={$t.cierre.confirmTitle}>
            <p><strong>{$t.cierre.confirmSure}</strong></p>
            <p class="muted">{$t.cierre.confirmBody}</p>
            {#if closeError}<p class="error" role="alert">{closeError}</p>{/if}
            <div class="rowbtns">
              <button type="button" class="mini" disabled={closeSaving} on:click={() => (closing = false)}>
                {$t.common.cancel}
              </button>
              <button type="button" class="mini primary" disabled={closeSaving} on:click={confirmClose}>
                {closeSaving ? '…' : $t.cierre.confirmYes}
              </button>
            </div>
          </div>
        {/if}
      </div>
    {/if}
    {#if state === 'loading' && rows.length === 0}
      <Skeleton rows={5} />
    {:else if state === 'error' && rows.length === 0}
      <ErrorState error={loadError} onRetry={loadGroups} />
    {:else}
      <div class="pickers">
        <Dropdown
          label={$t.cierre.groupLabel}
          value={picked?.GroupID ?? ''}
          options={groups.map((g) => ({ value: g.GroupID, label: g.ClassLabel }))}
          on:select={(e) => pickGroup(String(e.detail))}
        />
      </div>

      {#if !picked}
        <EmptyState icon="list" title={$t.cierre.noGroupTitle} body={$t.cierre.noGroupBody(year)} />
      {:else if state === 'loading'}
        <Skeleton rows={5} />
      {:else if !nextYearExists || destGroups.length === 0}
        {#if nextYearInCatalog}
          <EmptyState
            icon="list"
            title={$t.cierre.noDestTitle}
            body={$t.cierre.noDestBody(year + 1)}
            actionLabel={$t.common.retry}
            onAction={() => loadGroups()}
          />
        {:else}
          <EmptyState
            icon="list"
            title={$t.cierre.noNextYearTitle}
            body={$t.cierre.noNextYearBody(year + 1)}
            actionLabel={$t.common.retry}
            onAction={() => loadGroups()}
          />
        {/if}
        <div class="rowbtns">
          <button type="button" class="mini" on:click={() => push('/admin/anos')}>
            {$t.cierre.goYears}
          </button>
        </div>
      {:else if picked}
        <div class="summary" role="status">
          <span><strong>{rows.length}</strong> {$t.cierre.summaryRoster}</span>
          <span><strong>{criticalCount}</strong> {$t.cierre.summaryCritical}</span>
          <span>{$t.cierre.summaryByCause(lowRateCount, graveCount, severeFaultCount)}</span>
          <span><strong>{decidedCount}/{rows.length}</strong> {$t.cierre.summaryDecided}</span>
        </div>
        {#each rows as row (row.studentID)}
          <section class="card">
            <div class="row-head">
              <div>
                <strong>{row.names}</strong>
                <span class="muted">
                  {#if row.rate === null}
                    {$t.cierre.noSessions}
                  {:else}
                    {Math.round(row.rate * 100)}% · {row.sessions} {$t.cierre.sessionsLabel}
                  {/if}
                  {#if row.severeWarnings > 0}
                    · {row.severeWarnings} {$t.cierre.graveLabel}
                  {/if}
                  {#if row.severeFaults > 0}
                    · {row.severeFaults} {$t.cierre.severeFaultLabel}
                  {/if}
                </span>
              </div>
              <div class="badges">
                {#if row.decided || row.done}
                  <span class="chip chip-green">{$t.cierre.decided}</span>
                {:else}
                  <span class="chip">{$t.cierre.suggestLabel}{decisionLabel(row.suggestion)}</span>
                {/if}
                {#if row.critical.length > 0}
                  <span class="chip chip-pink">{$t.cierre.critical}</span>
                {/if}
              </div>
            </div>
            <div class="decide">
              {#each decisionKinds as d}
                <button
                  type="button"
                  class="pill"
                  class:on={row.choice === d}
                  disabled={d === 'graduate' && row.grade !== 11}
                  title={d === 'graduate' && row.grade !== 11 ? $t.cierre.graduateOnly11 : ''}
                  on:click={() => {
                    row.choice = d;
                    if (d === 'graduate') row.dest = '';
                    else if (!row.dest) row.dest = defaultDest(row.grade, d);
                    rows = rows;
                  }}
                >{decisionLabel(d)}</button>
              {/each}
              {#if row.choice !== 'graduate'}
                <select
                  aria-label={$t.cierre.destLabel}
                  bind:value={row.dest}
                  on:change={() => (rows = rows)}
                >
                  <option value="">{$t.cierre.destPlaceholder}</option>
                  {#each destOptions(row.grade, row.choice) as g}
                    <option value={g.GroupID}>{g.ClassLabel}</option>
                  {/each}
                </select>
              {/if}
              {#if !yearClosed}
                <button type="button" class="mini" disabled={row.saving} on:click={() => saveRow(row)}>
                  {row.saving ? $t.common.retrying : $t.common.save}
                </button>
              {/if}
            </div>
            {#if row.error}<p class="error" role="alert">{row.error}</p>{/if}
          </section>
        {/each}
      {:else}
        <EmptyState icon="list" title={$t.cierre.noGroupTitle} body={$t.cierre.noGroupBody(year)} />
      {/if}
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
  .banner {
    background: var(--accent-soft);
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 10px 14px;
    font-weight: 600;
    font-size: 0.9rem;
  }
  .muted {
    color: var(--muted);
    font-size: 0.9rem;
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
  .pickers {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .summary {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    font-size: 0.9rem;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 10px 14px;
  }
  .card {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow);
    padding: 16px 18px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .row-head {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
    align-items: flex-start;
  }
  .rowbtns {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 10px;
  }
  .row-head .muted {
    display: block;
    margin-top: 2px;
  }
  .badges {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .chip {
    background: var(--tint);
    border-radius: var(--radius-pill);
    padding: 4px 10px;
    font-size: 0.8rem;
    font-weight: 600;
  }
  .chip-green {
    background: var(--chip-green-bg, #e3f2e7);
    color: var(--chip-green-ink, #1d6b3a);
  }
  .chip-pink {
    background: var(--chip-pink-bg, #fbe4e6);
    color: var(--chip-pink-ink, #b4232f);
  }
  .decide {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
  }
  .pill {
    border: 1px solid var(--line);
    border-radius: var(--radius-pill);
    padding: 8px 14px;
    min-height: 44px;
    font-weight: 600;
  }
  .pill.on {
    background: var(--ink);
    color: var(--bg);
    border-color: var(--ink);
  }
  .pill:disabled {
    opacity: 0.4;
  }
  .decide select {
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 10px 12px;
    min-height: 48px;
  }
  .mini {
    border: 1px solid var(--line);
    border-radius: var(--radius-pill);
    padding: 8px 14px;
    min-height: 44px;
    font-weight: 600;
  }
  .mini:disabled {
    opacity: 0.6;
  }
  .error {
    color: var(--danger);
    font-size: 0.9rem;
    font-weight: 600;
  }
  .statuscard {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    padding: 16px 18px;
    margin-bottom: 12px;
  }
  .statuscard.closed {
    border-color: var(--g-grave-ink);
  }
  .statuscard .row-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 8px;
  }
  .statuscard .row-head h2 {
    font-size: 1rem;
    margin: 0;
  }
  .mini.danger {
    background: var(--g-grave-bg);
    border-color: transparent;
    color: var(--g-grave-ink);
  }
  .mini.primary {
    background: var(--accent);
    border-color: transparent;
    color: #fff;
  }
  .override {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    font-size: 0.88rem;
    font-weight: 600;
    margin: 8px 0 0;
  }
  .override input {
    width: 20px;
    height: 20px;
    margin-top: 2px;
    accent-color: var(--accent);
  }
  .confirmbox {
    margin-top: 12px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 12px 14px;
  }
  .rowbtns {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 10px;
  }
</style>
