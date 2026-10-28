<script lang="ts">
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ErrorState from '$lib/ui/ErrorState.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
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

  $: fullName = profile ? `${profile.Surnames} ${profile.Names}` : '';
  $: sessions = report?.Sessions ?? [];
  $: marks = sessions.filter((s) => s.Mark && s.Mark !== '').slice().reverse();
  $: totalSessions = report ? report.Sessions.length : 0;
  $: rate = report && totalSessions > 0 ? Math.round((report.Presences / totalSessions) * 100) : null;
  $: sortedWarnings = warnings.slice().sort((a, b) => (b.HappenedAt < a.HappenedAt ? -1 : 1));

  function markName(mark: string): string {
    if (mark === 'absence') return $t.studentSummary.markAbsence;
    if (mark === 'absence-permission') return $t.studentSummary.markPermission;
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
  <TopBar title={fullName || $t.studentSummary.titleFallback} showBack onBack={() => goBack('/admin/estudiantes')}><TopActions /></TopBar>

  <div class="pagehead">
    <p class="eyebrow">{$t.admin.consoleEyebrow}</p>
    <div class="toolbar">
      {#if profile}
        <button type="button" class="primary" on:click={() => push(`/admin/estudiantes/${encodeURIComponent(id)}`)}>
          {$t.studentSummary.openFull}
        </button>
      {/if}
    </div>
  </div>

  <div class="sheet">
    {#if state === 'loading'}
      <Skeleton rows={5} />
    {:else if state === 'error' || !profile || !report}
      <ErrorState error={loadError} onRetry={load} />
    {:else}
      <section class="card" aria-label={$t.studentSummary.statsTitle}>
        <div class="row-head"><h2>{$t.studentSummary.statsTitle}</h2></div>
        <dl class="kpis">
          <div><dt>{$t.studentSummary.rateLabel}</dt><dd>{rate === null ? '—' : `${rate}%`}</dd></div>
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
                <span class={`mk ${s.Mark}`}>{markName(s.Mark)}</span>
                <span class="meta">
                  <strong>{momentDay(s.Date)}</strong>
                  <span>{s.ClassLabel} · {$t.admin.yearLabel} {s.SchoolYear}{#if s.Period} · {$t.troll.shistory.periodLabel(s.Period)}{/if}</span>
                  {#if s.Mark === 'absence-permission' && s.Note}
                    <small class="permnote">{$t.studentSummary.permissionWithReason(s.Note)}</small>
                  {/if}
                </span>
                {#if s.Mark === 'absence' || s.Mark === 'absence-permission'}
                  <span class="rowbtns">
                    <button
                      type="button"
                      class={`permbtn ${s.Mark === 'absence-permission' ? 'on' : ''}`}
                      disabled={acting === s.SessionID + s.Mark}
                      on:click={() => togglePermission(s.SessionID, s.Mark)}
                    >{s.Mark === 'absence' ? $t.studentSummary.justifyAction : $t.studentSummary.unjustifiedAction}</button>
                    <button
                      type="button" class="mini"
                      on:click={() => (correcting = { sessionID: s.SessionID, mark: s.Mark })}
                    >{$t.studentSummary.modifyAction}</button>
                    <button type="button" class="mini" on:click={() => openTrail(s.SessionID)}>
                      {trailFor === s.SessionID ? $t.studentSummary.hideChanges : $t.studentSummary.showChanges}
                    </button>
                  </span>
                {/if}
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

      {#if alerts.length > 0}
        <section class="card" aria-label={$t.academicAlert.title}>
          <div class="row-head">
            <h2>{$t.academicAlert.title} ({openAlerts.length} {$t.academicAlert.openLabel})</h2>
          </div>
          <ul class="rows">
            {#each alerts as a (a.ID)}
              <li>
                <span class={`mk ${a.Status === 'open' ? 'sev-severe' : 'sev-mild'}`}>{a.Status === 'open' ? $t.academicAlert.openLabel : $t.academicAlert.reviewedLabel}</span>
                <div class="meta">
                  <strong>{a.Reason}</strong>
                  <span>{momentDay(a.CreatedAt)}</span>
                  {#if a.Status === 'open' && canManageUsers($profileStore.me?.roles)}
                    <span class="rowbtns">
                      <button
                        type="button" class="mini"
                        disabled={reviewingAlert === a.ID}
                        on:click={() => reviewAlert(a.ID)}
                      >{$t.academicAlert.reviewAction}</button>
                    </span>
                  {/if}
                </div>
              </li>
            {/each}
          </ul>
        </section>
      {/if}
      <section class="card" aria-label={$t.studentSummary.warningsTitle}>
        <div class="row-head">
          <h2>{$t.studentSummary.warningsTitle} ({sortedWarnings.length})</h2>
          <button
            type="button" class="mini"
            on:click={() => push(`/admin/llamados?estudiante=${encodeURIComponent(id)}&nombre=${encodeURIComponent(reviseName())}`)}
          >{$t.studentSummary.openWarnings}</button>
        </div>
        {#if sortedWarnings.length === 0}
          <p class="muted">{$t.studentSummary.warningsEmpty}</p>
        {:else}
          <ul class="rows">
            {#each sortedWarnings as w (w.ID)}
              <li>
                <span class={`mk sev-${w.Gravity}`}>{gravityName(w.Gravity)}</span>
                <div class="meta">
                  <strong>{w.Title}</strong>
                  <span>{momentDay(w.HappenedAt)}{#if w.ClassLabel} · {w.ClassLabel}{/if}{#if w.AuthorName} · {w.AuthorName}{/if}</span>
                  {#if w.Description}<small>{w.Description}</small>{/if}
                  <span class="rowbtns">
                    {#if staffWrite}
                      <button
                        type="button" class="mini"
                        on:click={() => (editingWarning = { id: w.ID, gravity: w.Gravity, title: w.Title, description: w.Description ?? '' })}
                      >{$t.studentSummary.modifyAction}</button>
                    {/if}
                    <button type="button" class="mini" on:click={() => toggleWarnRevs(w.ID)}>
                      {warnRevsFor === w.ID ? $t.studentSummary.hideChanges : $t.studentSummary.showChanges}
                    </button>
                  </span>
                  {#if warnRevsFor === w.ID}
                    {#if warnRevsLoading}
                      <p class="muted">{$t.common.retrying}</p>
                    {:else}
                      <WarningRevisionTrail revisions={warnRevs[w.ID] ?? []} />
                    {/if}
                  {/if}
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      <button type="button" class="primary big" on:click={() => push(`/admin/estudiantes/${encodeURIComponent(id)}`)}>
        {$t.studentSummary.openFull}
      </button>
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
    flex-wrap: wrap;
  }
  .primary {
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 700;
    min-height: 48px;
    border-radius: var(--radius-pill);
    padding: 0 20px;
  }
  .primary.big {
    width: 100%;
    min-height: 54px;
    font-size: 1rem;
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
    gap: 12px;
  }
  .row-head h2 {
    margin: 0;
    font-size: 1.2rem;
    letter-spacing: -0.02em;
  }
  .muted {
    color: var(--muted);
    font-size: 0.9rem;
  }
  .kpis {
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
    gap: 10px;
  }
  .kpis div {
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .kpis dt {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--muted);
  }
  .kpis dd {
    margin: 0;
    font-size: 1.3rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
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
    gap: 12px;
    align-items: flex-start;
    flex-wrap: wrap;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 10px 12px;
  }
  .mk {
    flex: none;
    font-size: 0.78rem;
    font-weight: 800;
    border-radius: var(--radius-pill);
    padding: 4px 10px;
    background: var(--tint);
    color: var(--ink-soft);
  }
  .mk.absence {
    background: var(--chip-pink-bg, #fbe4e6);
    color: var(--g-grave-ink, #b4232f);
  }
  .mk.absence-permission {
    background: var(--m-permission-bg, #e8f0fe);
    color: var(--m-permission, #1a56db);
  }
  .mk.evasion {
    background: var(--chip-purple-bg, #efe7fb);
    color: var(--chip-purple-ink, #6d3fd4);
  }
  .mk.late {
    background: var(--chip-yellow-bg, #fdf3d7);
    color: var(--chip-yellow-ink, #8a6d00);
  }
  .mk.sev-mild {
    background: var(--tint);
    color: var(--ink-soft);
  }
  .mk.sev-moderate {
    background: var(--chip-yellow-bg, #fdf3d7);
    color: var(--chip-yellow-ink, #8a6d00);
  }
  .mk.sev-severe {
    background: var(--chip-pink-bg, #fbe4e6);
    color: var(--g-grave-ink, #b4232f);
  }
  .meta {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 0.9rem;
    flex: 1;
    min-width: 200px;
  }
  .meta small {
    color: var(--muted);
  }
  .meta small.permnote {
    color: var(--m-permission, #1a56db);
    font-weight: 600;
  }
  .rowbtns {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .permbtn {
    border: 1px solid var(--line);
    background: var(--surface);
    border-radius: var(--radius-pill);
    padding: 6px 14px;
    min-height: 44px;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--ink-soft);
  }
  .permbtn.on {
    background: var(--m-permission-bg, #e8f0fe);
    color: var(--m-permission, #1a56db);
    border-color: transparent;
  }
  .permbtn:disabled {
    opacity: 0.6;
  }
  .mini {
    border: 1px solid var(--line);
    border-radius: var(--radius-pill);
    padding: 8px 14px;
    min-height: 44px;
    font-weight: 600;
    background: var(--surface);
  }
  .mini:disabled {
    opacity: 0.6;
  }
  .error {
    color: var(--danger);
    font-size: 0.9rem;
    font-weight: 600;
  }
  .meta strong {
    font-size: 0.95rem;
  }
  .meta span {
    color: var(--muted);
  }
  .meta small {
    color: var(--ink-soft);
  }
</style>
