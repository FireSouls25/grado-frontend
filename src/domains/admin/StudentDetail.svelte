<script lang="ts">
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { t } from '$lib/i18n';
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import AdminShell from './AdminShell.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ErrorState from '$lib/ui/ErrorState.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import {
    auditForStudent,
    studentProfile,
    studentReport,
    studentWarnings,
    updateStudent,
    type AuditEntry
  } from './api';
  import type { StudentProfile, Warning } from '$lib/api/types';
  import { guarded } from '$lib/nav';
  import { isMissing } from '../teacher/api';
  import { ApiError } from '$lib/api/types';

  export let params: { id?: string } = {};
  $: studentID = decodeURIComponent(params.id ?? '');

  const currentYear = new Date().getFullYear();

  let state: 'loading' | 'error' | 'ready' = 'loading';
  let loadError: unknown = null;
  let profile: StudentProfile | null = null;
  let warnings: Warning[] = [];
  let report: Awaited<ReturnType<typeof studentReport>> | null = null;
  let reportDenied = false;
  let trail: AuditEntry[] = [];

  async function load() {
    state = 'loading';
    loadError = null;
    try {
      const data = await guarded(() => studentProfile(studentID));
      if (data === null) return; // 401/403 ya navegaron
      profile = data;
      state = 'ready';
    } catch (err) {
      if (err instanceof ApiError && isMissing(err)) {
        profile = null;
        state = 'ready';
        return;
      }
      loadError = err;
      state = 'error';
      return;
    }
    // Cada bloque falla por su cuenta: un historial vacío no debe hide la
    // ficha, ni al revés.
    void loadWarnings();
    void loadReport();
    void loadTrail();
  }

  async function loadWarnings() {
    try {
      warnings = (await guarded(() => studentWarnings(studentID))) ?? [];
    } catch {
      warnings = [];
    }
  }

  async function loadReport() {
    reportDenied = false;
    try {
      report = (await guarded(() => studentReport(studentID))) ?? null;
    } catch (err) {
      report = null;
      // El informe completo es admin-only (manage-system): un docente ve la
      // ficha, pero el backend le cierra este bloque. Se dice, no se oculta.
      reportDenied = err instanceof ApiError && err.status === 403;
    }
  }

  async function loadTrail() {
    try {
      trail = (await guarded(() => auditForStudent(studentID))) ?? [];
    } catch {
      trail = [];
    }
  }

  onMount(load);

  $: fullName = profile ? `${profile.Surnames}, ${profile.Names}`.replace(/^,\s*/, '') : '';
  $: initials = profile
    ? `${profile.Surnames} ${profile.Names}`
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0])
        .join('')
        .toUpperCase()
    : '';

  $: age = ageOf(profile?.Birthdate ?? '');

  function ageOf(birthdate: string): number | null {
    if (!birthdate) return null;
    const born = new Date(birthdate);
    if (Number.isNaN(born.getTime())) return null;
    const now = new Date();
    let years = now.getFullYear() - born.getFullYear();
    const before =
      now.getMonth() < born.getMonth() ||
      (now.getMonth() === born.getMonth() && now.getDate() < born.getDate());
    if (before) years -= 1;
    return years >= 0 && years < 130 ? years : null;
  }

  function longDate(value: string): string {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  function moment(value: string): string {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function shortId(value: string): string {
    return value ? value.slice(0, 8) : '—';
  }

  function gravityClass(g: Warning['Gravity']): string {
    return g === 'severe' ? 'grave' : g === 'moderate' ? 'medio' : 'leve';
  }

  function actionClass(a: AuditEntry['Action']): string {
    return a === 'create' || a === 'update' || a === 'mark' ? 'write' : 'read';
  }

  function conditionText(c: { Has: boolean; Detail: string }): string {
    if (!c.Has) return $t.studentDetail.conditionNo;
    return c.Detail || $t.studentDetail.conditionYes;
  }

  function severityLabel(g: Warning['Gravity']): string {
    if (g === 'severe') return $t.roster.warnGravitySevere;
    if (g === 'moderate') return $t.roster.warnGravityModerate;
    return $t.roster.warnGravityMild;
  }

  function markLabel(mark: string): string {
    if (mark === 'evasion') return $t.roster.evasion;
    if (mark === 'late') return $t.roster.late;
    if (mark === 'absence') return $t.roster.absent;
    return $t.roster.present;
  }

  function actionLabel(a: AuditEntry['Action']): string {
    return $t.studentDetail.actionLabel[a];
  }

  function resourceLabel(r: AuditEntry['Resource']): string {
    return $t.studentDetail.resourceLabel[r];
  }

  const guardianRows = (g: StudentProfile['Mother']) => [
    { label: $t.studentDetail.guardianNames, value: g.Names },
    { label: $t.studentDetail.guardianDocument, value: g.DocumentID },
    { label: $t.studentDetail.guardianPhone, value: g.Phone },
    { label: $t.studentDetail.guardianOccupation, value: g.Occupation },
    { label: $t.studentDetail.guardianAddress, value: g.Address }
  ];

  $: hasContactData = profile
    ? [profile.Phone, profile.Email, profile.Address].some(Boolean)
    : false;

  // Edición: el formulario parte de la ficha cargada y se envía completa
  // (PUT reemplaza el perfil). El estado nunca se edita a mano.
  let editing = false;
  let saving = false;
  let editError = '';
  let editFeedback = '';
  let form: StudentProfile | null = null;

  function startEdit() {
    if (!profile) return;
    form = {
      ...profile,
      Mother: { ...profile.Mother },
      Father: { ...profile.Father },
      Caregiver: { ...profile.Caregiver },
      Vision: { ...profile.Vision },
      Hearing: { ...profile.Hearing },
      SpecialistReport: { ...profile.SpecialistReport },
      Siblings: profile.Siblings.map((s) => ({ ...s }))
    };
    editError = '';
    editFeedback = '';
    editing = true;
  }

  function validateEdit(): string {
    if (!form) return $t.common.loadError;
    if (!form.Names.trim() || !form.Surnames.trim()) return $t.admin.formRequired;
    if (!form.ClassID.trim()) return $t.admin.formRequired;
    if (!form.DocumentID.trim()) return $t.admin.formRequired;
    if (!form.Caregiver.Names.trim()) return $t.studentDetail.caregiverRequired;
    if (form.Email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.Email.trim())) {
      return $t.admin.formEmailInvalid;
    }
    return '';
  }

  async function saveEdit() {
    if (!form) return;
    editError = validateEdit();
    editFeedback = '';
    if (editError) return;
    saving = true;
    try {
      profile = await updateStudent(studentID, form);
      form = null;
      editing = false;
      editFeedback = $t.studentDetail.saved;
      void loadTrail(); // la propia edición queda en la bitácora
    } catch (err) {
      editError = err instanceof ApiError ? err.message : $t.common.loadError;
    } finally {
      saving = false;
    }
  }
</script>

<AdminShell active="estudiantes" year={currentYear}>
  <TopBar title={$t.admin.studentsTitle} showBack onBack={() => push('/admin/estudiantes')}>
    <TopActions />
  </TopBar>

  <div class="pagehead">
    <p class="eyebrow">{$t.admin.consoleEyebrow}</p>
    <h1 class="title">{fullName || $t.studentDetail.title}</h1>
    {#if profile && !editing}
      <div class="toolbar">
        {#if editFeedback}<p class="flash" role="status">{editFeedback}</p>{/if}
        <button type="button" class="mini" on:click={startEdit}>
          <Icon name="settings" /> {$t.studentDetail.editAction}
        </button>
      </div>
    {/if}
  </div>

  <div class="sheet">
    {#if state === 'loading'}
      <Skeleton rows={6} />
    {:else if state === 'error'}
      <ErrorState error={loadError} onRetry={load} />
    {:else if !profile}
      <EmptyState icon="users" title={$t.studentDetail.notFoundTitle} body={$t.studentDetail.notFoundBody} />
    {:else}
      <div class="grid">
        <aside class="card">
          <div class="idblock">
            <span class="avatar" aria-hidden="true">{initials}</span>
            <div>
              <strong>{fullName}</strong>
              <small>{profile.DocumentID || $t.common.noData}</small>
            </div>
          </div>

          <dl class="facts">
            <div><dt>{$t.studentDetail.classLabel}</dt><dd>{profile.ClassID || '—'}</dd></div>
            <div><dt>{$t.studentDetail.birthdateLabel}</dt><dd>
              {longDate(profile.Birthdate)}{age !== null ? ` · ${$t.studentDetail.ageLabel(age)}` : ''}
            </dd></div>
            <div><dt>{$t.studentDetail.birthplaceLabel}</dt><dd>{profile.Birthplace || '—'}</dd></div>
            <div><dt>{$t.studentDetail.bloodTypeLabel}</dt><dd>{profile.BloodType || '—'}</dd></div>
            <div><dt>{$t.studentDetail.statusLabel}</dt><dd>
              <span class={`chip ${profile.Status === 'active' ? 'chip-green' : 'chip-yellow'}`}>
                {profile.Status === 'active' ? $t.studentDetail.statusActive : $t.studentDetail.statusGraduated}
              </span>
            </dd></div>
          </dl>

          {#if hasContactData}
            <h2 class="sub">{$t.studentDetail.contactTitle}</h2>
            <dl class="facts">
              {#if profile.Phone}<div><dt>{$t.studentDetail.phoneLabel}</dt><dd>{profile.Phone}</dd></div>{/if}
              {#if profile.Email}<div><dt>{$t.studentDetail.emailLabel}</dt><dd>{profile.Email}</dd></div>{/if}
              {#if profile.Address}<div><dt>{$t.studentDetail.addressLabel}</dt><dd>{profile.Address}</dd></div>{/if}
            </dl>
          {/if}

          <h2 class="sub">{$t.studentDetail.healthTitle}</h2>
          <dl class="facts">
            <div><dt>{$t.studentDetail.visionLabel}</dt><dd>{conditionText(profile.Vision)}</dd></div>
            <div><dt>{$t.studentDetail.hearingLabel}</dt><dd>{conditionText(profile.Hearing)}</dd></div>
            <div><dt>{$t.studentDetail.specialistLabel}</dt><dd>{conditionText(profile.SpecialistReport)}</dd></div>
          </dl>
          {#if profile.MedicalReport}
            <p class="note">{$t.studentDetail.medicalLabel}: {profile.MedicalReport}</p>
          {/if}
          {#if profile.DiversityCondition}
            <p class="note">{$t.studentDetail.diversityLabel}: {profile.DiversityCondition}</p>
          {/if}
        </aside>

        <div class="col">
          <section class="card">
            <div class="card-head">
              <h2>{$t.studentDetail.warningsTitle}</h2>
              <span class="count">{warnings.length}</span>
            </div>
            {#if warnings.length === 0}
              <EmptyState icon="warn" title={$t.studentDetail.noWarningsTitle} body={$t.studentDetail.noWarningsBody} />
            {:else}
              <ul class="wlist">
                {#each warnings as w (w.ID)}
                  <li>
                    <span class={`sev ${gravityClass(w.Gravity)}`}>{severityLabel(w.Gravity)}</span>
                    <div class="wtext">
                      <strong>{w.Title}</strong>
                      {#if w.Description}<p>{w.Description}</p>{/if}
                      <small>
                        {moment(w.HappenedAt)}
                        {#if w.Snapshot?.CaregiverName} · {$t.studentDetail.caregiverLabel}: {w.Snapshot.CaregiverName}{/if}
                      </small>
                    </div>
                  </li>
                {/each}
              </ul>
            {/if}
          </section>

          <section class="card">
            <div class="card-head">
              <h2>{$t.studentDetail.reportTitle}</h2>
              {#if report}<span class="count">{$t.studentDetail.sessionsLabel(report.Sessions.length)}</span>{/if}
            </div>
            {#if reportDenied}
              <p class="note">{$t.studentDetail.reportDeniedBody}</p>
            {:else if !report}
              <EmptyState icon="list" title={$t.studentDetail.noReportTitle} body={$t.studentDetail.noReportBody} />
            {:else}
              <div class="kpis">
                <div class="kpi"><small>{$t.admin.markPresent}</small><strong>{report.Presences}</strong></div>
                <div class="kpi"><small>{$t.admin.markAbsence}</small><strong>{report.Absences}</strong></div>
                <div class="kpi"><small>{$t.admin.markEvasion}</small><strong>{report.Evasions}</strong></div>
                <div class="kpi"><small>{$t.admin.markLate}</small><strong>{report.Lates}</strong></div>
                <div class="kpi"><small>{$t.roster.warnGravityMild}</small><strong>{report.WarningsMild}</strong></div>
                <div class="kpi"><small>{$t.roster.warnGravityModerate}</small><strong>{report.WarningsModerate}</strong></div>
                <div class="kpi"><small>{$t.roster.warnGravitySevere}</small><strong>{report.WarningsSevere}</strong></div>
              </div>
              {#if report.Sessions.length > 0}
                <h3 class="sub">{$t.studentDetail.sessionsTitle}</h3>
                <ul class="slist">
                  {#each report.Sessions as s (s.SessionID)}
                    <li>
                      <span>{longDate(s.Date)}</span>
                      <span class="muted">{s.ClassLabel} · {$t.studentDetail.periodLabel(s.Period)}</span>
                      <span class={`chip ${s.Mark === '' ? 'chip-green' : 'chip-yellow'}`}>{markLabel(s.Mark)}</span>
                    </li>
                  {/each}
                </ul>
              {/if}
            {/if}
          </section>

          <section class="card">
            <div class="card-head">
              <h2>{$t.studentDetail.trailTitle}</h2>
              <span class="count">{trail.length}</span>
            </div>
            {#if trail.length === 0}
              <EmptyState icon="list" title={$t.studentDetail.noTrailTitle} body={$t.studentDetail.noTrailBody} />
            {:else}
              <ul class="tlist">
                {#each trail as e (e.ID)}
                  <li>
                    <span class={`pill ${actionClass(e.Action)}`}>{actionLabel(e.Action)}</span>
                    <div class="ttext">
                      <strong>{resourceLabel(e.Resource)}</strong>
                      <small>{moment(e.HappenedAt)} · {$t.studentDetail.byLabel} {shortId(e.SubjectID)}</small>
                    </div>
                    <span class="code" class:denied={e.Status >= 400}>{e.Status}</span>
                  </li>
                {/each}
              </ul>
            {/if}
          </section>
        </div>
      </div>
    {/if}
  </div>
</AdminShell>

<Sheet open={editing && form !== null} title={$t.studentDetail.editTitle} onClose={() => (editing = false)}>
  {#if form}
    <form class="form" on:submit|preventDefault={saveEdit}>
      <div class="row2">
        <label>{$t.admin.formSurnames}<input bind:value={form.Surnames} autocomplete="off" /></label>
        <label>{$t.admin.formNames}<input bind:value={form.Names} autocomplete="off" /></label>
      </div>
      <div class="row2">
        <label>{$t.admin.formDocument}<input bind:value={form.DocumentID} inputmode="numeric" autocomplete="off" /></label>
        <label>{$t.studentDetail.classLabel}<input bind:value={form.ClassID} autocomplete="off" /></label>
      </div>
      <div class="row2">
        <label>{$t.admin.formBirthdate}
          <input type="date" value={form.Birthdate ? form.Birthdate.slice(0, 10) : ''}
            on:change={(e) => {
              const v = (e.currentTarget as HTMLInputElement).value;
              form!.Birthdate = v ? `${v}T00:00:00Z` : '0001-01-01T00:00:00Z';
            }} />
        </label>
        <label>{$t.studentDetail.bloodTypeLabel}<input bind:value={form.BloodType} placeholder="O+, A-, AB…" /></label>
      </div>
      <div class="row2">
        <label>{$t.studentDetail.phoneLabel}<input bind:value={form.Phone} inputmode="tel" autocomplete="off" /></label>
        <label>{$t.studentDetail.emailLabel}<input bind:value={form.Email} inputmode="email" autocomplete="off" /></label>
      </div>
      <label>{$t.studentDetail.addressLabel}<input bind:value={form.Address} autocomplete="off" /></label>
      <h3 class="formsub">{$t.studentDetail.caregiverTitle}</h3>
      <div class="row2">
        <label>{$t.studentDetail.guardianNames}<input bind:value={form.Caregiver.Names} autocomplete="off" /></label>
        <label>{$t.studentDetail.guardianPhone}<input bind:value={form.Caregiver.Phone} inputmode="tel" autocomplete="off" /></label>
      </div>
      <h3 class="formsub">{$t.studentDetail.healthTitle}</h3>
      <div class="row2">
        <label>{$t.studentDetail.visionLabel}
          <input bind:value={form.Vision.Detail} placeholder={$t.studentDetail.conditionNo} />
        </label>
        <label>{$t.studentDetail.hearingLabel}
          <input bind:value={form.Hearing.Detail} placeholder={$t.studentDetail.conditionNo} />
        </label>
      </div>
      <label>{$t.studentDetail.medicalLabel}<input bind:value={form.MedicalReport} autocomplete="off" /></label>
      {#if editError}<p class="flash error" role="alert">{editError}</p>{/if}
      <div class="actions">
        <button class="ghost" type="button" on:click={() => (editing = false)}>{$t.common.cancel}</button>
        <button class="primary" type="submit" disabled={saving}>{saving ? '…' : $t.common.save}</button>
      </div>
    </form>
  {/if}
</Sheet>

<style>
  .toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 8px;
  }
  .mini {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 40px;
    padding: 0 16px;
    border-radius: var(--radius-pill);
    border: 1px solid var(--line);
    background: var(--surface);
    font-weight: 600;
    font-size: 0.85rem;
  }
  .flash {
    background: var(--chip-green-bg);
    color: var(--chip-green-ink);
    font-weight: 600;
    font-size: 0.85rem;
    border-radius: var(--radius-chip);
    padding: 8px 12px;
  }
  .flash.error {
    background: var(--chip-pink-bg);
    color: var(--chip-pink-ink);
  }
  .form {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .row2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .form label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.82rem;
    font-weight: 600;
  }
  .form input {
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 10px 12px;
    font-size: 0.92rem;
    width: 100%;
  }
  .form input:focus {
    outline: 2px solid var(--accent);
    outline-offset: 0;
  }
  .formsub {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
    margin-top: 4px;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 6px;
  }
  .ghost,
  .primary {
    min-height: 46px;
    border-radius: var(--radius-pill);
    font-weight: 700;
    font-size: 0.88rem;
    padding: 10px 22px;
  }
  .ghost {
    background: var(--surface);
    border: 1px solid var(--line);
  }
  .primary {
    background: var(--accent);
    color: var(--accent-ink);
  }
  .primary:disabled {
    opacity: 0.6;
  }
  .grid {
    display: grid;
    grid-template-columns: 320px minmax(0, 1fr);
    gap: 16px;
    align-items: start;
  }
  .col {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
  }
  .card {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    padding: 20px;
  }
  .card-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
  }
  .card-head h2 {
    font-size: 1.02rem;
  }
  .count {
    color: var(--muted);
    font-size: 0.78rem;
    font-weight: 700;
  }
  .idblock {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--line);
    margin-bottom: 14px;
  }
  .idblock strong {
    display: block;
    font-size: 1.05rem;
  }
  .idblock small {
    color: var(--muted);
    font-size: 0.8rem;
  }
  .avatar {
    flex: none;
    width: 46px;
    height: 46px;
    border-radius: var(--radius-pill);
    background: var(--accent-soft);
    color: var(--accent);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
  }
  .facts {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 0;
  }
  .facts > div {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }
  .facts dt {
    color: var(--muted);
    font-size: 0.82rem;
  }
  .facts dd {
    margin: 0;
    font-size: 0.88rem;
    font-weight: 600;
    text-align: right;
    word-break: break-word;
  }
  .sub {
    font-size: 0.85rem;
    color: var(--muted);
    margin: 18px 0 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .note {
    color: var(--muted);
    font-size: 0.84rem;
    margin-top: 10px;
  }
  .wlist,
  .slist,
  .tlist {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .wlist li,
  .tlist li {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--line);
  }
  .wlist li:last-child,
  .tlist li:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }
  .sev {
    flex: none;
    border-radius: 999px;
    padding: 2px 10px;
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: capitalize;
  }
  .sev.leve {
    background: var(--chip-sky-bg);
    color: var(--chip-sky-ink);
  }
  .sev.medio {
    background: var(--chip-yellow-bg);
    color: var(--chip-yellow-ink);
  }
  .sev.grave {
    background: var(--chip-pink-bg);
    color: var(--chip-pink-ink);
  }
  .wtext,
  .ttext {
    flex: 1;
    min-width: 0;
  }
  .wtext strong,
  .ttext strong {
    display: block;
    font-size: 0.9rem;
  }
  .wtext p {
    color: var(--muted);
    font-size: 0.85rem;
    margin: 2px 0;
  }
  .wtext small,
  .ttext small {
    color: var(--muted);
    font-size: 0.75rem;
  }
  .pill {
    flex: none;
    border-radius: 999px;
    padding: 2px 10px;
    font-size: 0.7rem;
    font-weight: 700;
  }
  .pill.read {
    background: var(--surface-2);
    color: var(--muted);
  }
  .pill.write {
    background: var(--chip-sky-bg);
    color: var(--chip-sky-ink);
  }
  .code {
    flex: none;
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .code.denied {
    color: var(--danger);
  }
  .kpis {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
    gap: 10px;
  }
  .kpi {
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 10px 12px;
  }
  .kpi small {
    display: block;
    color: var(--muted);
    font-size: 0.72rem;
  }
  .kpi strong {
    font-size: 1.2rem;
    font-variant-numeric: tabular-nums;
  }
  .slist li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 0;
    border-bottom: 1px solid var(--line);
    font-size: 0.85rem;
  }
  .slist li:last-child {
    border-bottom: none;
  }
  .slist .muted {
    color: var(--muted);
    flex: 1;
  }
</style>