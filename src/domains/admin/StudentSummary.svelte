<script lang="ts">
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import ErrorState from '$lib/ui/ErrorState.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import AdminShell from './AdminShell.svelte';
  import { guarded, goBack } from '$lib/nav';
  import { profile as profileStore } from '$lib/shell/profile';
  import { canManageUsers, canWriteWarnings } from '$lib/access';
  import { t } from '$lib/i18n';
  import type { StudentProfile, Warning } from '$lib/api/types';
  import {
    studentProfile,
    studentReport,
    studentWarnings,
    studentAlerts,
    reviewAcademicAlert,
    recordSessionMark,
    sessionDetail,
    warningRevisions,
    type StudentReport,
    type SessionRevisionRow,
    type WarningRevision,
    type AcademicAlert
  } from './api';
  import WarningCorrectForm from './WarningCorrectForm.svelte';
  import WarningRevisionTrail from './WarningRevisionTrail.svelte';
  import SessionCorrectSheet from './SessionCorrectSheet.svelte';
  import SessionRevisionTrail from './SessionRevisionTrail.svelte';
  import { notify } from '$lib/ui/notice';
  import { ApiError } from '$lib/api/types';
  $: roles = $profileStore.me?.roles ?? [];
  $: staffWrite = canWriteWarnings(roles);

  export let params: { id?: string } = {};
  $: id = decodeURIComponent(params.id ?? '');

  const currentYear = new Date().getFullYear();

  let state: 'loading' | 'error' | 'ready' = 'loading';
  let loadError: unknown = null;
  let acting: string | null = null;
  let correcting: { sessionID: string; mark: string } | null = null;
  let editingWarning: { id: string; gravity: 'mild' | 'moderate' | 'severe'; title: string; description: string } | null = null;
  let warnRevsFor: string | null = null;
  let warnRevs: Record<string, WarningRevision[]> = {};
  let alerts: AcademicAlert[] = [];
  let reviewingAlert: string | null = null;
  let warnRevsLoading = false;
  let trailFor: string | null = null;
  let trailRows: SessionRevisionRow[] = [];
  let trailLoading = false;
  let trailError: unknown = null;
  let profile: StudentProfile | null = null;
  let report: StudentReport | null = null;
  let warnings: Warning[] = [];

  $: fullName = profile ? `${profile.Surnames}, ${profile.Names}` : '';
  $: sessions = report?.Sessions ?? [];
  $: marks = sessions.filter((s) => s.Mark && s.Mark !== '').slice().reverse();
  $: totalSessions = report ? report.Sessions.length : 0;
  $: rate = report && totalSessions > 0 ? Math.round((report.Presences / totalSessions) * 100) : null;
  $: sortedWarnings = warnings.slice().sort((a, b) => (b.HappenedAt < a.HappenedAt ? -1 : 1));

  function markName(mark: string): string {
    if (mark === 'absence') return $t.roster.absentShort;
    if (mark === 'absence-permission') return $t.roster.permission;
    if (mark === 'evasion') return $t.studentSummary.markEvasion;
    if (mark === 'late') return $t.studentSummary.markLate;
    return mark;
  }

  function gravityName(g: Warning['Gravity']): string {
    if (g === 'severe') return $t.roster.warnGravitySevere;
    if (g === 'moderate') return $t.roster.warnGravityModerate;
    return $t.roster.warnGravityMild;
  }

  function momentDay(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  async function togglePermission(sessionID: string, mark: string) {
    if (acting) return;
    acting = sessionID + mark;
    try {
      const next = mark === 'absence' ? 'absence-permission' : 'absence';
      const updated = await guarded(() => recordSessionMark(sessionID, id, next as 'absence' | 'absence-permission', ''));
      if (updated !== null) {
        notify($t.studentSummary.justifiedOk);
        await load();
      }
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) {
        notify(err instanceof Error ? err.message : String(err));
      }
    } finally {
      acting = null;
    }
  }

  async function openTrail(sessionID: string) {
    if (trailFor === sessionID) {
      trailFor = null;
      return;
    }
    trailFor = sessionID;
    trailRows = [];
    trailError = null;
    trailLoading = true;
    try {
      const detail = await guarded(() => sessionDetail(sessionID));
      if (detail) trailRows = detail.Revisions;
    } catch (err) {
      trailError = err;
    } finally {
      trailLoading = false;
    }
  }

  function reviseName(): string {
    return profile ? `${profile.Names} ${profile.Surnames}` : '';
  }

  async function afterCorrection() {
    correcting = null;
    trailFor = null;
    notify($t.studentSummary.justifiedOk);
    await load();
  }

  async function toggleWarnRevs(wid: string) {
    if (warnRevsFor === wid) {
      warnRevsFor = null;
      return;
    }
    warnRevsFor = wid;
    if (warnRevs[wid]) return;
    warnRevsLoading = true;
    try {
      warnRevs = { ...warnRevs, [wid]: (await guarded(() => warningRevisions(wid))) ?? [] };
    } finally {
      warnRevsLoading = false;
    }
  }

  async function afterWarningCorrection() {
    editingWarning = null;
    notify($t.warnings.updated);
    await load();
  }

  $: openAlerts = alerts.filter((a) => a.Status === 'open');

  async function reviewAlert(id: string) {
    reviewingAlert = id;
    try {
      await reviewAcademicAlert(id);
      notify($t.academicAlert.reviewedOk);
      await load();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : $t.common.loadError);
    } finally {
      reviewingAlert = null;
    }
  }

  async function load() {
    state = 'loading';
    loadError = null;
    try {
      const [p, r, w, al] = await Promise.all([
        guarded(() => studentProfile(id)),
        guarded(() => studentReport(id)),
        guarded(() => studentWarnings(id)),
        guarded(() => studentAlerts(id))
      ]);
      if (p === null || r === null || w === null || al === null) {
        state = 'error';
        return;
      }
      profile = p;
      report = r;
      warnings = w;
      alerts = (al ?? []).slice().sort((a, b) => (a.CreatedAt < b.CreatedAt ? 1 : -1));
      state = 'ready';
    } catch (err) {
      loadError = err;
      state = 'error';
    }
  }

  onMount(load);
</script>

<AdminShell active="estudiantes" year={currentYear} onYear={null}>
  <TopBar
    title={fullName || $t.studentSummary.titleFallback}
    subtitle={profile?.ClassID ? `${$t.studentDetail.classLabel} ${profile.ClassID}` : ''}
    showBack
    onBack={() => goBack('/admin/estudiantes')}
  >
    {#if profile}
      <button type="button" class="btn btn-primary" on:click={() => push(`/admin/estudiantes/${encodeURIComponent(id)}`)}>
        {$t.studentSummary.openFull}
      </button>
    {/if}
    <TopActions />
  </TopBar>

  <div class="sheet">
    {#if state === 'loading'}
      <Skeleton rows={5} />
    {:else if state === 'error' || !profile || !report}
      <ErrorState error={loadError} onRetry={load} />
    {:else}
      <section class="card" aria-label={$t.studentSummary.statsTitle}>
        <div class="row-head"><h2>{$t.studentSummary.statsTitle}</h2></div>
        <dl class="kpis">
          <div><dt>{$t.studentSummary.rateLabel}</dt><dd class:low={rate !== null && rate < 85}>{rate === null ? '—' : `${rate}%`}</dd></div>
          <div><dt>{$t.studentSummary.presences}</dt><dd>{report.Presences}</dd></div>
          <div><dt>{$t.studentSummary.absences}</dt><dd>{report.Absences}</dd></div>
          <div><dt>{$t.studentSummary.excused}</dt><dd>{report.Excused}</dd></div>
          <div><dt>{$t.studentSummary.evasions}</dt><dd>{report.Evasions}</dd></div>
          <div><dt>{$t.studentSummary.lates}</dt><dd>{report.Lates}</dd></div>
          <div><dt>{$t.roster.warnGravityMild}</dt><dd>{report.WarningsMild}</dd></div>
          <div><dt>{$t.roster.warnGravityModerate}</dt><dd>{report.WarningsModerate}</dd></div>
          <div><dt>{$t.roster.warnGravitySevere}</dt><dd>{report.WarningsSevere}</dd></div>
          <div><dt>{$t.studentSummary.faults}</dt><dd>{report.FaultsMinor + report.FaultsOrdinary + report.FaultsSevere}</dd></div>
        </dl>
      </section>

      <section class="card" aria-label={$t.studentSummary.marksTitle}>
        <div class="row-head">
          <h2>{$t.studentSummary.marksTitle} ({marks.length})</h2>
        </div>
        {#if marks.length === 0}
          <p class="muted">{$t.studentSummary.marksEmpty}</p>
        {:else}
          <ul class="rows">
            {#each marks as s (s.SessionID + s.Mark)}
              <li>
                <div class="row-top">
                  <span class={`mk ${s.Mark}`}>{markName(s.Mark)}</span>
                  <span class="meta">
                    <strong>{momentDay(s.Date)}</strong>
                    <span>{s.ClassLabel} · {$t.admin.yearLabel} {s.SchoolYear}{#if s.Period} · {$t.troll.shistory.periodLabel(s.Period)}{/if}</span>
                    {#if s.Mark === 'absence-permission' && s.Note}
                      <small class="permnote">{$t.studentSummary.permissionWithReason(s.Note)}</small>
                    {/if}
                  </span>
                  <div class="rowbtns">
                    {#if s.Mark === 'absence' || s.Mark === 'absence-permission'}
                      <button
                        type="button"
                        class={`btn btn-sm ${s.Mark === 'absence-permission' ? 'perm-on' : ''}`}
                        disabled={acting === s.SessionID + s.Mark}
                        on:click={() => togglePermission(s.SessionID, s.Mark)}
                      >
                        {s.Mark === 'absence' ? $t.studentSummary.justifyAction : $t.studentSummary.unjustifiedAction}
                      </button>
                    {/if}
                    <button
                      type="button"
                      class="btn btn-sm"
                      on:click={() => (correcting = { sessionID: s.SessionID, mark: s.Mark })}
                    >
                      {$t.studentSummary.modifyAction}
                    </button>
                    <button type="button" class="btn btn-sm" on:click={() => openTrail(s.SessionID)}>
                      {trailFor === s.SessionID ? $t.studentSummary.hideChanges : $t.studentSummary.showChanges}
                    </button>
                  </div>
                </div>
                {#if trailFor === s.SessionID}
                  {#if trailLoading}
                    <p class="muted">{$t.common.retrying}</p>
                  {:else if trailError}
                    <p class="error" role="alert">{$t.common.loadError}</p>
                  {:else}
                    <SessionRevisionTrail revisions={trailRows} studentName={reviseName()} />
                  {/if}
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      <section class="card" aria-label={$t.academicAlert.title}>
        <div class="row-head">
          <h2>{$t.academicAlert.title} ({openAlerts.length} {$t.academicAlert.openLabel})</h2>
        </div>
        {#if alerts.length === 0}
          <p class="muted">{$t.academicAlert.empty}</p>
        {:else}
          <ul class="rows">
            {#each alerts as a (a.ID)}
              <li>
                <div class="row-top">
                  <span class={`mk ${a.Status === 'open' ? 'sev-severe' : 'sev-mild'}`}>
                    {a.Status === 'open' ? $t.academicAlert.openLabel : $t.academicAlert.reviewedLabel}
                  </span>
                  <div class="meta">
                    <strong>{a.Reason}</strong>
                    <span>{momentDay(a.CreatedAt)}</span>
                  </div>
                  {#if a.Status === 'open' && canManageUsers($profileStore.me?.roles)}
                    <div class="rowbtns">
                      <button
                        type="button"
                        class="btn btn-sm"
                        disabled={reviewingAlert === a.ID}
                        on:click={() => reviewAlert(a.ID)}
                      >
                        {$t.academicAlert.reviewAction}
                      </button>
                    </div>
                  {/if}
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      <section class="card" aria-label={$t.studentSummary.warningsTitle}>
        <div class="row-head">
          <h2>{$t.studentSummary.warningsTitle} ({sortedWarnings.length})</h2>
          <button
            type="button"
            class="btn btn-sm"
            on:click={() => push(`/admin/llamados?estudiante=${encodeURIComponent(id)}&nombre=${encodeURIComponent(reviseName())}`)}
          >
            {$t.studentSummary.openWarnings}
          </button>
        </div>
        {#if sortedWarnings.length === 0}
          <p class="muted">{$t.studentSummary.warningsEmpty}</p>
        {:else}
          <ul class="rows">
            {#each sortedWarnings as w (w.ID)}
              <li>
                <div class="row-top">
                  <span class={`mk sev-${w.Gravity}`}>{gravityName(w.Gravity)}</span>
                  <div class="meta">
                    <strong>{w.Title}</strong>
                    <span>{momentDay(w.HappenedAt)}{#if w.ClassLabel} · {w.ClassLabel}{/if}{#if w.AuthorName} · {w.AuthorName}{/if}</span>
                    {#if w.Description}<small>{w.Description}</small>{/if}
                  </div>
                  <div class="rowbtns">
                    {#if staffWrite}
                      <button
                        type="button"
                        class="btn btn-sm"
                        on:click={() => (editingWarning = { id: w.ID, gravity: w.Gravity, title: w.Title, description: w.Description ?? '' })}
                      >
                        {$t.studentSummary.modifyAction}
                      </button>
                    {/if}
                    <button type="button" class="btn btn-sm" on:click={() => toggleWarnRevs(w.ID)}>
                      {warnRevsFor === w.ID ? $t.studentSummary.hideChanges : $t.studentSummary.showChanges}
                    </button>
                  </div>
                </div>
                {#if warnRevsFor === w.ID}
                  {#if warnRevsLoading}
                    <p class="muted">{$t.common.retrying}</p>
                  {:else}
                    <WarningRevisionTrail revisions={warnRevs[w.ID] ?? []} />
                  {/if}
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      <Sheet
        open={editingWarning !== null}
        title={$t.warnings.editTitle}
        onClose={() => (editingWarning = null)}
      >
        {#if editingWarning}
          <WarningCorrectForm
            warningId={editingWarning.id}
            initialGravity={editingWarning.gravity}
            initialTitle={editingWarning.title}
            initialDescription={editingWarning.description}
            onClose={() => (editingWarning = null)}
            onSaved={afterWarningCorrection}
          />
        {/if}
      </Sheet>

      {#if correcting}
        <SessionCorrectSheet
          open
          title={$t.troll.shistory.correctTitle}
          subtitle={momentDay(marks.find((m) => correcting && m.SessionID === correcting.sessionID)?.Date ?? '')}
          sessionId={correcting ? correcting.sessionID : ''}
          students={correcting ? [{ id, name: reviseName(), current: correcting.mark }] : []}
          onClose={() => (correcting = null)}
          onSaved={afterCorrection}
        />
      {/if}
    {/if}
  </div>
</AdminShell>

<style>
  .sheet {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-sheet);
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .card {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .row-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .row-head h2 {
    margin: 0;
    font-size: 0.98rem;
    font-weight: 600;
  }
  .muted {
    color: var(--muted);
    font-size: 0.85rem;
  }
  .kpis {
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
    gap: 8px;
  }
  .kpis div {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-control);
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .kpis dt {
    font-size: 0.74rem;
    font-weight: 500;
    color: var(--muted);
  }
  .kpis dd {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .kpis dd.low {
    color: var(--g-grave-ink);
  }
  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .rows li {
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-control);
    padding: 12px 14px;
  }
  .row-top {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .mk {
    flex: none;
    font-size: 0.74rem;
    font-weight: 600;
    border-radius: 999px;
    padding: 3px 10px;
    background: var(--tint);
    color: var(--ink-soft);
  }
  .mk.absence {
    background: var(--chip-pink-bg);
    color: var(--g-grave-ink);
  }
  .mk.absence-permission {
    background: var(--m-permission-bg);
    color: var(--m-permission);
  }
  .mk.evasion {
    background: var(--chip-purple-bg);
    color: var(--chip-purple-ink);
  }
  .mk.late {
    background: var(--chip-yellow-bg);
    color: var(--chip-yellow-ink);
  }
  .mk.sev-mild {
    background: var(--chip-sky-bg);
    color: var(--chip-sky-ink);
  }
  .mk.sev-moderate {
    background: var(--chip-yellow-bg);
    color: var(--chip-yellow-ink);
  }
  .mk.sev-severe {
    background: var(--chip-pink-bg);
    color: var(--g-grave-ink);
  }
  .meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 0.85rem;
    flex: 1;
    min-width: 180px;
  }
  .meta strong {
    font-size: 0.88rem;
    font-weight: 600;
  }
  .meta span {
    color: var(--muted);
    font-size: 0.78rem;
  }
  .meta small {
    color: var(--ink-soft);
    font-size: 0.8rem;
  }
  .meta small.permnote {
    color: var(--m-permission);
    font-weight: 600;
  }
  .rowbtns {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    margin-left: auto;
  }
  .perm-on {
    background: var(--m-permission-bg);
    color: var(--m-permission);
    border-color: transparent;
  }
  .error {
    color: var(--danger);
    font-size: 0.85rem;
    font-weight: 600;
  }
</style>
