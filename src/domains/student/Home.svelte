<script lang="ts">
  import { onMount } from 'svelte';
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ErrorState from '$lib/ui/ErrorState.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import { t } from '$lib/i18n';
  import { guarded } from '$lib/nav';
  import { ApiError } from '$lib/api/types';
  import type { Warning } from '$lib/api/types';
  import { me, studentIncidents, type StudentIncident } from '../teacher/api';
  import { studentProfile, studentReport, studentWarnings, type StudentReport } from '../admin/api';
  import type { Me, StudentProfile } from '$lib/api/types';

  // Mi historial (lectura): la cuenta estudiante ve su ficha, su
  // asistencia, sus llamados y sus faltas. Todo viaja por endpoints
  // que ya autorizan "own history" en el backend.

  let state: 'loading' | 'error' | 'ready' = 'loading';
  let loadError: unknown = null;
  let profile: StudentProfile | null = null;
  let report: StudentReport | null = null;
  let warnings: Warning[] = [];
  let incidents: StudentIncident[] = [];

  onMount(load);

  async function load() {
    state = 'loading';
    loadError = null;
    try {
      const m: Me | null = await guarded(() => me());
      if (!m) {
        state = 'error';
        return;
      }
      const id = m.subject;
      const [p, r, w, f] = await Promise.all([
        guarded(() => studentProfile(id)),
        guarded(() => studentReport(id)),
        guarded(() => studentWarnings(id)),
        guarded(() => studentIncidents(id))
      ]);
      profile = p;
      report = r;
      warnings = (w ?? []).slice().sort((a, b) => (a.HappenedAt < b.HappenedAt ? 1 : -1));
      incidents = (f ?? []).slice().sort((a, b) => (a.HappenedAt < b.HappenedAt ? 1 : -1));
      if (!profile && !report) {
        state = 'error';
        return;
      }
      state = 'ready';
    } catch (err) {
      loadError = err;
      state = 'error';
    }
  }

  $: sessions = report?.Sessions ?? [];
  $: marked = sessions.filter((s) => s.Mark && s.Mark !== 'present');
  $: total = (report?.Presences ?? 0) + (report?.Absences ?? 0) + (report?.Excused ?? 0) + (report?.Evasions ?? 0) + (report?.Lates ?? 0);
  $: rate = total > 0 ? Math.round(((report?.Presences ?? 0) / total) * 100) : 0;

  function gravityName(g: string): string {
    if (g === 'mild') return $t.roster.warnGravityMild;
    if (g === 'moderate') return $t.roster.warnGravityModerate;
    return $t.roster.warnGravitySevere;
  }

  function markName(m: string): string {
    if (m === 'absence') return $t.admin.markAbsence;
    if (m === 'absence-permission') return $t.admin.markPermission;
    if (m === 'evasion') return $t.admin.markEvasion;
    if (m === 'late') return $t.admin.markLate;
    return $t.admin.markPresent;
  }

  function markClass(m: string): string {
    if (m === 'absence') return 'is-absence';
    if (m === 'absence-permission') return 'is-permission';
    if (m === 'evasion') return 'is-evasion';
    if (m === 'late') return 'is-late';
    return 'is-present';
  }

  function momentDay(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso.length <= 10 ? `${iso.slice(0, 10)}T12:00:00` : iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  }
</script>

<div class="page">
  <TopBar title={$t.app.name}><TopActions settings={false} help={false} /></TopBar>

  <div class="pagehead">
    <p class="eyebrow">{$t.studentHome.eyebrow}</p>
    <h1 class="title">{profile ? `${profile.Surnames} ${profile.Names}` : $t.studentHome.title}</h1>
    {#if profile}
      <p class="sub">{profile.DocumentID}{profile.ClassID ? ` · ${profile.ClassID}` : ''}</p>
    {/if}
  </div>

  <div class="sheet">
    {#if state === 'loading'}
      <Skeleton rows={4} />
    {:else if state === 'error'}
      <ErrorState error={loadError} onRetry={load} />
    {:else}
      <section class="card" aria-label={$t.studentHome.attendanceTitle}>
        <div class="row-head">
          <h2>{$t.studentHome.attendanceTitle}</h2>
          <span class="count" role="status">{$t.studentSummary.rateLabel} {rate}%</span>
        </div>
        <div class="kpis">
          <div class="kpi"><small>{$t.studentSummary.presences}</small><strong>{report?.Presences ?? 0}</strong></div>
          <div class="kpi"><small>{$t.admin.markAbsence}</small><strong>{report?.Absences ?? 0}</strong></div>
          <div class="kpi"><small>{$t.admin.markLate}</small><strong>{report?.Lates ?? 0}</strong></div>
          <div class="kpi"><small>{$t.admin.markEvasion}</small><strong>{report?.Evasions ?? 0}</strong></div>
        </div>
        {#if marked.length === 0}
          <p class="muted">{$t.studentHome.noMarks}</p>
        {:else}
          <h3 class="sub">{$t.studentHome.recentTitle}</h3>
          <ul class="rows">
            {#each marked.slice(0, 8) as s (s.SessionID)}
              <li>
                <span class={`mk ${markClass(s.Mark)}`}>{markName(s.Mark)}</span>
                <span class="meta">
                  <strong>{momentDay(s.Date)}{s.ClassLabel ? ` · ${s.ClassLabel}` : ''}</strong>
                </span>
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      <section class="card" aria-label={$t.studentHome.warningsTitle}>
        <div class="row-head">
          <h2>{$t.studentHome.warningsTitle} ({warnings.length})</h2>
        </div>
        {#if warnings.length === 0}
          <EmptyState icon="warn" title={$t.studentHome.warningsTitle} body={$t.studentHome.noWarnings} />
        {:else}
          <ul class="rows">
            {#each warnings as w (w.ID)}
              <li>
                <span class={`mk sev-${w.Gravity}`}>{gravityName(w.Gravity)}</span>
                <span class="meta">
                  <strong>{w.Title}</strong>
                  <span>{momentDay(w.HappenedAt)}{w.ClassLabel ? ` · ${w.ClassLabel}` : ''}</span>
                  {#if w.Description}<small>{w.Description}</small>{/if}
                </span>
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      <section class="card" aria-label={$t.studentHome.incidentsTitle}>
        <div class="row-head">
          <h2>{$t.studentHome.incidentsTitle} ({incidents.length})</h2>
        </div>
        {#if incidents.length === 0}
          <EmptyState icon="list" title={$t.studentHome.incidentsTitle} body={$t.studentHome.noIncidents} />
        {:else}
          <ul class="rows">
            {#each incidents as f (f.ID)}
              <li>
                <span class="meta">
                  <strong>{f.Title}</strong>
                  <span>{momentDay(f.HappenedAt)}</span>
                </span>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {/if}
  </div>
</div>

<style>
  .page {
    min-height: 100vh;
    min-height: 100svh;
    background: var(--bg);
    color: var(--ink);
    padding-bottom: 40px;
  }
  .pagehead {
    margin-bottom: 12px;
  }
  .eyebrow {
    color: var(--muted);
    font-size: 0.85rem;
    margin-bottom: 2px;
  }
  .title {
    font-size: 2rem;
    letter-spacing: -0.03em;
    font-weight: 550;
    line-height: 1.05;
    overflow-wrap: anywhere;
  }
  .sub {
    color: var(--muted);
    font-size: 0.85rem;
    margin-top: 2px;
  }
  .sheet {
    background: var(--surface);
    border: 1px solid var(--line);
    border-bottom: 0;
    border-radius: 24px 24px 0 0;
    padding: 20px 18px 40px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  @media (min-width: 720px) {
    .title {
      font-size: 2.4rem;
    }
    .sheet {
      padding: 24px 26px 60px;
    }
  }
  .card {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow);
    padding: 18px;
    animation: rise 0.3s ease both;
  }
  .row-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 8px;
  }
  .row-head h2 {
    font-size: 1rem;
    margin: 0;
  }
  .count {
    background: var(--tint);
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 5px 14px;
    color: var(--ink-soft);
    font-size: 0.78rem;
    font-weight: 700;
    white-space: nowrap;
  }
  .kpis {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    margin: 8px 0 12px;
  }
  @media (max-width: 560px) {
    .kpis {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  .kpi {
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
  }
  .kpi small {
    color: var(--muted);
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .kpi strong {
    font-size: 1.3rem;
    font-variant-numeric: tabular-nums;
  }
  .sub {
    font-size: 0.8rem;
    font-weight: 700;
    margin: 12px 0 2px;
  }
  .muted {
    color: var(--muted);
    font-size: 0.9rem;
  }
  .rows {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
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
    border-radius: 999px;
    padding: 3px 12px;
    font-size: 0.75rem;
    font-weight: 800;
    border: 2px solid transparent;
    white-space: nowrap;
  }
  .mk.is-present {
    color: var(--chip-green-ink);
    border-color: var(--chip-green-ink);
  }
  .mk.is-absence {
    color: var(--g-grave-ink);
    border-color: var(--g-grave-ink);
  }
  .mk.is-permission {
    background: var(--m-permission-bg, #e8f0fe);
    color: var(--m-permission, #1a56db);
    border-color: transparent;
  }
  .mk.is-evasion {
    color: var(--chip-yellow-ink);
    border-color: var(--chip-yellow-ink);
  }
  .mk.is-late {
    color: var(--chip-sky-ink);
    border-color: var(--chip-sky-ink);
  }
  .mk.sev-mild {
    color: var(--chip-sky-ink);
    border-color: var(--chip-sky-ink);
  }
  .mk.sev-moderate {
    color: var(--chip-yellow-ink);
    border-color: var(--chip-yellow-ink);
  }
  .mk.sev-severe {
    color: var(--g-grave-ink);
    border-color: var(--g-grave-ink);
  }
  .meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 0.9rem;
    flex: 1;
    min-width: 200px;
  }
  .meta small {
    color: var(--muted);
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
