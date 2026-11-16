<script lang="ts">
  import { onMount } from 'svelte';
  import { resolveId } from '$lib/slug';
  import { loadWhenReady } from '$lib/sessionReady';
  import { push } from 'svelte-spa-router';
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import ErrorState from '$lib/ui/ErrorState.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import AdminShell from './AdminShell.svelte';
  import { guarded, goBack } from '$lib/nav';
  import { profile as profileStore } from '$lib/shell/profile';
  import { canManageUsers, canWriteWarnings, canWriteDefenses, canManagePermits } from '$lib/access';
  import { t } from '$lib/i18n';
  import type { StudentProfile, Warning } from '$lib/api/types';
  import {
    studentProfile,
    studentReport,
    studentWarnings,
    studentAlerts,
    reviewAcademicAlert,
    notifyLateRecurring,
    recordSessionMark,
    recordDefense,
    sessionDetail,
    mergeTrail,
    warningRevisions,
    groupsByYear,
    studentPermits,
    grantPermit,
    revokePermit,
    scheduleEntries,
    listSubjects,
    type ScheduleEntry,
    type StudentReport,
    type SessionRevisionRow,
    type WarningRevision,
    type AcademicAlert,
    type PriorPermit,
    type YearGroup
  } from './api';
  import WarningCorrectForm from './WarningCorrectForm.svelte';
  import WarningRevisionTrail from './WarningRevisionTrail.svelte';
  import SessionCorrectSheet from './SessionCorrectSheet.svelte';
  import PermissionSheet from '$lib/ui/PermissionSheet.svelte';
  import StudentAttendance from './StudentAttendance.svelte';
  import Section from '$lib/ui/Section.svelte';
  import WarningDefenseSheet from '../teacher/WarningDefenseSheet.svelte';
  import { notify } from '$lib/ui/notice';
  import { rangeLabel } from '$lib/schedule';
  import { ApiError } from '$lib/api/types';
  import { calendarDate } from '$lib/dates';
  $: roles = $profileStore.me?.roles ?? [];
  $: staffWrite = canWriteWarnings($profileStore.me);
  $: staffDefense = canWriteDefenses($profileStore.me);
  $: staffPermits = canManagePermits($profileStore.me);

  export let params: { id?: string } = {};
  let id = '';
  $: rawSlug = decodeURIComponent(params.id ?? '');

  const currentYear = new Date().getFullYear();

  let state: 'loading' | 'error' | 'ready' = 'loading';
  let loadError: unknown = null;
  let acting: string | null = null;
  let correcting: { sessionID: string; mark: string } | null = null;
  let editingWarning: { id: string; gravity: 'mild' | 'moderate' | 'severe'; title: string; description: string } | null = null;
  let warnRevsFor: string | null = null;
  let defendingWarning: Warning | null = null;
  let warnRevs: Record<string, WarningRevision[]> = {};
  let alerts: AcademicAlert[] = [];
  let reviewingAlert: string | null = null;
  // Permisos previos: secretaría/administración cubren al estudiante antes
  // de la clase. La lista del docente lo muestra bloqueado.
  let permits: PriorPermit[] = [];
  let permitOpen = false;
  let permitDate = '';
  let permitGroupID = '';
  let permitReason = '';
  let permitSaving = false;
  let permitError = '';
  let permitGroups: YearGroup[] = [];
  // Salón actual del estudiante (id), resuelto desde su ficha.
  let studentGroup = '';
  let warnRevsLoading = false;
  let trailFor: string | null = null;
  let lateNotifying = false;
  let lateFeedback = '';
  let lateFeedbackError = false;

  async function notifyLates() {
    lateFeedback = '';
    lateFeedbackError = false;
    if (lateNotifying || !id) return;
    lateNotifying = true;
    try {
      const res = await notifyLateRecurring(id);
      lateFeedback = res.notified
        ? $t.admin.lateNotified(res.lates)
        : $t.admin.lateBelowThreshold(res.lates);
    } catch {
      lateFeedback = $t.admin.lateNotifyError;
      lateFeedbackError = true;
    } finally {
      lateNotifying = false;
    }
  }
  let trailRows: SessionRevisionRow[] = [];
  let trailLoading = false;
  let trailError: unknown = null;
  let profile: StudentProfile | null = null;
  let report: StudentReport | null = null;
  let warnings: Warning[] = [];

  $: fullName = profile ? `${profile.Surnames}, ${profile.Names}` : '';
  $: sessions = report?.Sessions ?? [];
  $: totalSessions = report ? report.Sessions.length : 0;
  $: rate = report && totalSessions > 0 ? Math.round(((report.Presences + report.Excused + report.Lates) / totalSessions) * 100) : null;
  $: sortedWarnings = warnings.slice().sort((a, b) => (b.HappenedAt < a.HappenedAt ? -1 : 1));


  function gravityName(g: Warning['Gravity']): string {
    if (g === 'severe') return $t.roster.warnGravitySevere;
    if (g === 'moderate') return $t.roster.warnGravityModerate;
    return $t.roster.warnGravityMild;
  }

  function momentDay(iso: string): string {
    const d = calendarDate(iso);
    if (!d) return iso;
    return d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  // Dar permiso exige motivo: se abre un popup que solo pide el motivo
  // y lo registra. Quitarlo es directo y no necesita motivo. Modificar
  // sigue abriendo la hoja completa de corrección.
  let permFor: { sessionID: string } | null = null;
  let defenseFor: { sessionID: string } | null = null;


  async function togglePermission(sessionID: string, mark: string) {
    if (mark === 'absence') {
      permFor = { sessionID };
      return;
    }
    if (acting) return;
    acting = sessionID + mark;
    try {
      const updated = await guarded(() => recordSessionMark(sessionID, id, 'absence', ''));
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
      if (detail) trailRows = mergeTrail(detail);
    } catch (err) {
      trailError = err;
    } finally {
      trailLoading = false;
    }
  }

  function reviseName(): string {
    return profile ? `${profile.Names} ${profile.Surnames}` : '';
  }

  async function savePermReason(draft: string) {
    if (!permFor || acting) return;
    acting = permFor.sessionID + 'perm';
    try {
      const updated = await guarded(() =>
        recordSessionMark(permFor!.sessionID, id, 'absence-permission', draft)
      );
      if (updated !== null) {
        notify($t.studentSummary.justifiedOk);
        permFor = null;
        await load();
      }
    } finally {
      acting = null;
    }
  }

  function openDefense(sessionID: string) {
    defenseFor = { sessionID };
  }

  // --- Permisos previos --------------------------------------------------
  // El alta la hace secretaría/administración (record-defenses). El
  // permiso deja al estudiante bloqueado en la lista del docente.
  function todayISO(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function groupLabelOf(g: YearGroup): string {
    return g.ClassLabel || `${g.Grade}-${g.GroupNo}`;
  }

  // Permiso previo: el salón sale del estudiante; la fecha se elige con
  // los próximos días de clase o con el calendario, y las clases de ese
  // día se marcan una a una o "todo el día".
  type PermitClass = { subjectID: string; name: string; times: string[] };
  let permitClasses: PermitClass[] = [];
  let permitClassesLoading = false;
  let permitSubjects: string[] = []; // vacío = todo el día
  let subjectNames: Record<string, string> = {};
  let weekCache: Record<string, ScheduleEntry[]> = {};
  const quickReasons = ['Cita médica', 'Calamidad familiar', 'Trámite familiar', 'Actividad institucional'];

  function isoOf(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  /** Próximos días hábiles (lunes a viernes), empezando hoy. */
  $: upcomingDays = (() => {
    const out: { iso: string; label: string }[] = [];
    const d = new Date();
    while (out.length < 8) {
      const wd = d.getDay();
      if (wd >= 1 && wd <= 5) {
        const iso = isoOf(d);
        const label =
          out.length === 0 && iso === isoOf(new Date())
            ? $t.studentSummary.priorPermitToday
            : d.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' });
        out.push({ iso, label });
      }
      d.setDate(d.getDate() + 1);
    }
    return out;
  })();

  $: permitGroupLabel = (() => {
    const g = permitGroups.find((x) => x.GroupID === permitGroupID);
    return g ? groupLabelOf(g) : '';
  })();

  function studentGroupID(): string {
    const cid = profile?.ClassID ?? '';
    const byID = permitGroups.find((g) => g.GroupID === cid);
    if (byID) return byID.GroupID;
    const byLabel = permitGroups.find((g) => groupLabelOf(g) === cid || `${g.Grade}-${g.GroupNo}` === cid);
    return byLabel?.GroupID ?? '';
  }

  async function loadPermitClasses() {
    permitSubjects = [];
    permitClasses = [];
    if (!permitGroupID || !permitDate) return;
    const d = new Date(`${permitDate}T12:00:00`);
    const weekday = d.getDay();
    const key = `${permitGroupID}:${weekday}`;
    permitClassesLoading = true;
    try {
      if (!weekCache[key]) {
        weekCache[key] = (await guarded(() => scheduleEntries({ classGroupID: permitGroupID, weekday }))) ?? [];
      }
      if (Object.keys(subjectNames).length === 0) {
        const subs = (await guarded(() => listSubjects())) ?? [];
        subjectNames = Object.fromEntries(subs.map((s) => [s.ID, s.Name]));
      }
      const bySubject = new Map<string, PermitClass>();
      for (const e of [...weekCache[key]].sort((a, b) => a.Start - b.Start)) {
        const c = bySubject.get(e.SubjectID) ?? { subjectID: e.SubjectID, name: subjectNames[e.SubjectID] ?? e.SubjectID, times: [] };
        c.times.push(rangeLabel(e.Start, e.End));
        bySubject.set(e.SubjectID, c);
      }
      permitClasses = [...bySubject.values()];
    } catch {
      permitClasses = [];
    } finally {
      permitClassesLoading = false;
    }
  }

  function pickPermitDay(iso: string) {
    permitDate = iso;
    void loadPermitClasses();
  }

  function toggleSubject(sid: string) {
    permitSubjects = permitSubjects.includes(sid) ? permitSubjects.filter((x) => x !== sid) : [...permitSubjects, sid];
  }

  async function openPermit(date = '', subjectID = '') {
    permitOpen = true;
    permitDate = date || todayISO();
    permitError = '';
    permitReason = '';
    permitSubjects = [];
    await ensureGroups();
    permitGroupID = studentGroupID();
    await loadPermitClasses();
    if (subjectID && permitClasses.some((c) => c.subjectID === subjectID)) permitSubjects = [subjectID];
  }

  async function ensureGroups() {
    if (permitGroups.length > 0) return;
    try {
      permitGroups = (await guarded(() => groupsByYear(currentYear))) ?? [];
    } catch {
      permitGroups = [];
    }
  }

  async function savePriorPermit() {
    permitError = '';
    if (!permitDate) {
      permitError = $t.studentSummary.priorPermitNeedDate;
      return;
    }
    if (!permitGroupID) {
      permitError = $t.studentSummary.priorPermitNeedGroup;
      return;
    }
    if (!permitReason.trim()) {
      permitError = $t.studentSummary.priorPermitNeedReason;
      return;
    }
    if (permitSaving) return;
    permitSaving = true;
    try {
      // Sin clases marcadas el permiso cubre el día; si no, uno por materia.
      const subjects = permitSubjects.length > 0 ? permitSubjects : [''];
      for (const subjectID of subjects) {
        await guarded(() =>
          grantPermit({
            studentID: id,
            classGroupID: permitGroupID,
            subjectID: subjectID || undefined,
            date: permitDate,
            reason: permitReason.trim()
          })
        );
      }
      notify($t.studentSummary.priorPermitSaved);
      permitOpen = false;
      await load();
    } catch (err) {
      permitError = err instanceof ApiError ? err.message : $t.common.loadError;
    } finally {
      permitSaving = false;
    }
  }

  async function revokePrior(p: PriorPermit) {
    if (acting) return;
    acting = p.ID;
    try {
      await guarded(() => revokePermit(p.ID));
      notify($t.studentSummary.priorPermitRevoked);
      await load();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : $t.common.loadError);
    } finally {
      acting = null;
    }
  }

  async function saveDefense(draft: string) {
    if (!defenseFor || acting) return;
    acting = defenseFor.sessionID + 'defense';
    try {
      await guarded(() => recordDefense(defenseFor!.sessionID, id, draft));
      notify($t.studentSummary.defenseSaved);
      defenseFor = null;
      await load();
    } finally {
      acting = null;
    }
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
    id = await resolveId(rawSlug);
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
      // Los permisos previos son un extra: si el endpoint aún no está,
      // la ficha sigue funcionando sin ellos.
      try {
        permits = (await guarded(() => studentPermits(id))) ?? [];
      } catch {
        permits = [];
      }
      await ensureGroups();
      studentGroup = studentGroupID();
      state = 'ready';
    } catch (err) {
      loadError = err;
      state = 'error';
    }
  }

  onMount(() => loadWhenReady(() => void load()));
</script>

<AdminShell active="estudiantes" year={currentYear} onYear={null}>
  <TopBar
    title={fullName || $t.studentSummary.titleFallback}
    subtitle={profile?.ClassID ? `${$t.studentDetail.classLabel} ${profile.ClassID}` : ''}
    showBack
    onBack={() => goBack('/admin/estudiantes')}
  >
    {#if profile}
      <button type="button" class="btn btn-primary" on:click={() => push(`/admin/estudiantes/${encodeURIComponent(rawSlug || id)}`)}>
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
      <Section key="summary-stats" icon="list" title={$t.studentSummary.statsTitle}>
        <dl class="kpis">
          <div><dt>{$t.studentSummary.rateLabel}</dt><dd class:low={rate !== null && rate < 85}>{rate === null ? '—' : `${rate}%`}</dd></div>
          <div><dt>{$t.studentSummary.presences}</dt><dd>{report.Presences}</dd></div>
          <div><dt>{$t.studentSummary.excused}</dt><dd>{report.Excused}</dd></div>
          <div><dt>{$t.studentSummary.absences}</dt><dd>{report.Absences}</dd></div>
          <div><dt>{$t.studentSummary.evasions}</dt><dd>{report.Evasions}</dd></div>
          <div><dt>{$t.studentSummary.lates}</dt><dd>{report.Lates}</dd></div>
        <div><dt>{$t.attendance.uniformFault}</dt><dd class:low={(report.UniformFaults ?? 0) > 0}>{report.UniformFaults ?? 0}</dd></div>
          <div><dt>{$t.roster.warnGravityMild}</dt><dd>{report.WarningsMild}</dd></div>
          <div><dt>{$t.roster.warnGravityModerate}</dt><dd>{report.WarningsModerate}</dd></div>
          <div><dt>{$t.roster.warnGravitySevere}</dt><dd>{report.WarningsSevere}</dd></div>
          <div><dt>{$t.studentSummary.faults}</dt><dd>{report.FaultsMinor + report.FaultsOrdinary + report.FaultsSevere}</dd></div>
        </dl>
        {#if (report.LateStreak ?? 0) >= 3}
          <p class="streakwarn" role="note">{$t.admin.lateStreak(report.LateStreak ?? 0)}</p>
          <div class="row-actions">
            <button type="button" class="btn btn-sm" disabled={lateNotifying} on:click={notifyLates}>
              {lateNotifying ? $t.admin.lateNotifying : $t.admin.lateNotify}
            </button>
            {#if lateFeedback}<p class="flash" class:error={lateFeedbackError} role="status">{lateFeedback}</p>{/if}
          </div>
        {/if}
      </Section>

      <Section key="summary-attendance" icon="calendar" title={$t.studentAttendance.title}>
          <StudentAttendance
            {report}
            {permits}
            groupID={studentGroup}
            canDefense={staffDefense}
            canPermits={staffPermits}
            {acting}
            studentName={reviseName()}
            {trailFor}
            {trailLoading}
            {trailError}
            {trailRows}
            onJustify={togglePermission}
            onDefense={openDefense}
            onModify={(sessionID, mark) => (correcting = { sessionID, mark })}
            onTrail={openTrail}
            onPermit={(date, subjectID) => openPermit(date, subjectID)}
            onRevoke={revokePrior}
          />
      </Section>

      <Section key="summary-warnings" icon="warn" tone="warn" title={$t.studentSummary.warningsTitle} count={sortedWarnings.length}>
        <svelte:fragment slot="actions">
            <button
              type="button"
              class="btn btn-sm"
              on:click={() => push(`/admin/llamados?estudiante=${encodeURIComponent(rawSlug || id)}&nombre=${encodeURIComponent(reviseName())}`)}
          >
              {$t.studentSummary.openWarnings}
            </button>
        </svelte:fragment>
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
                    {#if w.Defense}<small class="wdefense">{$t.warningDefense.label(w.Defense)}</small>{/if}
                  </div>
                  <div class="rowbtns">
                    {#if staffDefense}
                      <button type="button" class={`btn btn-sm ${w.Defense ? 'has' : ''}`} on:click={() => (defendingWarning = w)}>
                        {$t.warningDefense.action}
                      </button>
                    {/if}
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
      </Section>

      <Section key="summary-alerts" icon="bell" tone="alert" title={$t.academicAlert.title} count={`${openAlerts.length} ${$t.academicAlert.openLabel}`}>
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
                  {#if a.Status === 'open' && canManageUsers($profileStore.me)}
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
      </Section>

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

      {#if defendingWarning}
        <WarningDefenseSheet
          warningID={defendingWarning.ID}
          title={defendingWarning.Title}
          subtitle={momentDay(defendingWarning.HappenedAt)}
          current={defendingWarning.Defense ?? ''}
          onClose={() => (defendingWarning = null)}
          onSaved={(text) => {
            const wid = defendingWarning?.ID;
            warnings = warnings.map((x) => (x.ID === wid ? { ...x, Defense: text } : x));
            defendingWarning = null;
          }}
        />
      {/if}

      {#if correcting}
        <SessionCorrectSheet
          open
          title={$t.troll.shistory.correctTitle}
          subtitle={momentDay(sessions.find((m) => correcting && m.SessionID === correcting.sessionID)?.Date ?? '')}
          sessionId={correcting ? correcting.sessionID : ''}
          students={correcting ? [{ id, name: reviseName(), current: correcting.mark }] : []}
          onClose={() => (correcting = null)}
          onSaved={afterCorrection}
        />
      {/if}

      <PermissionSheet
        open={defenseFor !== null}
        title={$t.studentSummary.defenseTitle}
        subtitle={(() => { const dm = sessions.find((x) => defenseFor && x.SessionID === defenseFor.sessionID); return dm ? `${momentDay(dm.Date)} · ${dm.ClassLabel}` : ''; })()}
        reasonLabel={$t.studentSummary.defenseReasonLabel}
        reasonPlaceholder={$t.studentSummary.defenseReasonPlaceholder}
        onClose={() => (defenseFor = null)}
        onSave={saveDefense}
      />

      <PermissionSheet
        open={permFor !== null}
        title={$t.studentSummary.justifyAction}
        subtitle={(() => { const pm = sessions.find((x) => permFor && x.SessionID === permFor.sessionID); return pm ? `${momentDay(pm.Date)} · ${pm.ClassLabel}` : ''; })()}
        reasonLabel={$t.troll.shistory.permissionReasonLabel}
        reasonPlaceholder={$t.troll.shistory.permissionReasonPlaceholder}
        onClose={() => (permFor = null)}
        onSave={savePermReason}
      />

      <Sheet
        open={permitOpen}
        title={$t.studentSummary.priorPermitTitle}
        onClose={() => (permitOpen = false)}
      >
        <div class="permit-form">
          <p class="muted">{$t.studentSummary.priorPermitSubtitle}</p>
          <div class="field">
            <span>{$t.studentSummary.priorPermitGroup}</span>
            {#if permitGroupLabel && studentGroupID() === permitGroupID}
              <strong class="pgroup">{permitGroupLabel}</strong>
            {:else}
              <select bind:value={permitGroupID} on:change={loadPermitClasses}>
                <option value="">{$t.studentSummary.priorPermitNeedGroup}</option>
                {#each permitGroups as g (g.GroupID)}
                  <option value={g.GroupID}>{groupLabelOf(g)}</option>
                {/each}
              </select>
            {/if}
          </div>
          <div class="field">
            <span>{$t.studentSummary.priorPermitDate}</span>
            <div class="chips" role="group" aria-label={$t.studentSummary.priorPermitDate}>
              {#each upcomingDays as d (d.iso)}
                <button type="button" class="chipbtn" class:on={permitDate === d.iso} aria-pressed={permitDate === d.iso} on:click={() => pickPermitDay(d.iso)}>
                  {d.label}
                </button>
              {/each}
            </div>
            <input type="date" bind:value={permitDate} on:change={loadPermitClasses} aria-label={$t.studentSummary.priorPermitOtherDay} />
          </div>
          <div class="field">
            <span>{$t.studentSummary.priorPermitClasses}</span>
            {#if permitClassesLoading}
              <p class="muted">{$t.studentSummary.priorPermitLoadingClasses}</p>
            {:else if permitClasses.length === 0}
              <p class="muted">{$t.studentSummary.priorPermitNoClasses}</p>
            {:else}
              <div class="classpick">
                <button type="button" class="classbtn" class:on={permitSubjects.length === 0} aria-pressed={permitSubjects.length === 0} on:click={() => (permitSubjects = [])}>
                  <strong>{$t.studentSummary.priorPermitAllDay}</strong>
                  <small>{$t.studentSummary.priorPermitAllDayHint(permitClasses.length)}</small>
                </button>
                {#each permitClasses as c (c.subjectID)}
                  <button type="button" class="classbtn" class:on={permitSubjects.includes(c.subjectID)} aria-pressed={permitSubjects.includes(c.subjectID)} on:click={() => toggleSubject(c.subjectID)}>
                    <strong>{c.name}</strong>
                    <small>{c.times.join(' · ')}</small>
                  </button>
                {/each}
              </div>
            {/if}
          </div>
          <label class="field">
            <span>{$t.studentSummary.priorPermitReason}</span>
            <textarea
              rows="3"
              bind:value={permitReason}
              placeholder={$t.studentSummary.priorPermitReasonPlaceholder}
            ></textarea>
          </label>
          <div class="chips" role="group" aria-label={$t.studentSummary.priorPermitReason}>
            {#each quickReasons as r}
              <button type="button" class="chipbtn" on:click={() => (permitReason = r)}>{r}</button>
            {/each}
          </div>
          {#if permitError}
            <p class="error" role="alert">{permitError}</p>
          {/if}
          <div class="permit-actions">
            <button type="button" class="btn" on:click={() => (permitOpen = false)}>
              {$t.common.cancel}
            </button>
            <button
              type="button"
              class="btn btn-primary"
              disabled={permitSaving}
              on:click={savePriorPermit}
            >
              {permitSaving ? $t.studentSummary.priorPermitSaving : $t.studentSummary.priorPermitSave}
            </button>
          </div>
        </div>
      </Sheet>
    {/if}
  </div>
</AdminShell>

<style>
  .wdefense {
    color: var(--ink-soft) !important;
    border-left: 3px solid var(--accent);
    padding-left: 6px;
  }
  .rowbtns .btn.has {
    border-color: var(--accent);
    color: var(--accent);
  }
  .sheet {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-sheet);
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .streakwarn {
    margin: 0;
    background: var(--g-medio-bg);
    color: var(--g-medio-ink);
    font-weight: 700;
    font-size: 0.85rem;
    border-radius: var(--radius-control);
    padding: 8px 12px;
  }
  .row-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .row-actions .flash {
    margin: 0;
    font-size: 0.82rem;
    color: var(--muted);
  }
  .row-actions .flash.error {
    color: var(--danger);
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
  .rowbtns {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    margin-left: auto;
  }
  .error {
    color: var(--danger);
    font-size: 0.85rem;
    font-weight: 600;
  }
  .permit-form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .permit-form .muted {
    margin: 0;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--ink-soft);
  }
  .field input,
  .field select,
  .field textarea {
    font: inherit;
    font-weight: 400;
    color: var(--ink);
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-control);
    padding: 8px 10px;
  }
  .pgroup {
    font-size: 0.95rem;
    color: var(--ink);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chipbtn {
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--ink-soft);
    border-radius: 999px;
    padding: 5px 11px;
    font-size: 0.76rem;
    font-weight: 600;
    text-transform: capitalize;
  }
  .chipbtn:hover {
    background: var(--surface-2);
  }
  .chipbtn.on {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--accent);
  }
  .classpick {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 6px;
  }
  .classbtn {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    text-align: left;
    border: 1px solid var(--line);
    background: var(--surface);
    border-radius: var(--radius-control);
    padding: 8px 10px;
    color: var(--ink);
  }
  .classbtn small {
    color: var(--muted);
    font-weight: 500;
    font-size: 0.72rem;
  }
  .classbtn.on {
    background: var(--accent-soft);
    border-color: var(--accent);
  }
  .classbtn.on strong {
    color: var(--accent);
  }
  .permit-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
</style>
