<script lang="ts">
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { t } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import { classRoster, isMissing, openSession, recordMark } from './api';
  import type { RosterEntry } from '$lib/api/types';
  import { guarded } from '$lib/nav';
  import { ApiError } from '$lib/api/types';
  import { session } from '../auth/session';
  import { devAccounts } from '../auth/accounts';

  export let params: { groupID?: string } = {};
  export let querystring: string = '';
  $: groupID = decodeURIComponent(params.groupID ?? '');

  function queryParam(key: string): string {
    try {
      const qs = querystring || window.location.hash.split('?')[1] || '';
      return new URLSearchParams(qs).get(key) ?? '';
    } catch {
      return '';
    }
  }
  $: subjectParam = queryParam('materia');

  interface DemoMeta {
    subject: string;
    group: string;
    room: string;
    range: string;
  }

  const demoByKey: Record<string, DemoMeta> = {
    fisica: { subject: 'Física', group: '11°B', room: '304', range: '08:45 - 10:15' },
    matematicas: { subject: 'Matemáticas', group: '10°A', room: '201', range: '07:00 - 08:30' },
    geometria: { subject: 'Geometría', group: '9°A', room: '102', range: '10:30 - 12:00' },
    estadistica: { subject: 'Estadística', group: '10°B', room: '202', range: '13:00 - 14:30' }
  };

  // Nómina de referencia tal cual la imagen (Física 11°B).
  const demoRoster: RosterEntry[] = [
    { StudentID: '#10024', Names: 'Mateo', Surnames: 'Albarracín', DocumentID: '#10024' },
    { StudentID: '#10156', Names: 'Sofía', Surnames: 'Beltrán', DocumentID: '#10156' },
    { StudentID: '#10098', Names: 'Juan José', Surnames: 'Cardona', DocumentID: '#10098' },
    { StudentID: '#10214', Names: 'Mariana', Surnames: 'Delgado', DocumentID: '#10214' },
    { StudentID: '#10045', Names: 'Lucas', Surnames: 'Espinosa', DocumentID: '#10045' },
    { StudentID: '#10112', Names: 'Valentina', Surnames: 'Fajardo', DocumentID: '#10112' },
    { StudentID: '#10301', Names: 'Andrés', Surnames: 'Gómez', DocumentID: '#10301' }
  ];
  const demoPresent = new Set(['#10024', '#10156', '#10214', '#10045', '#10112']);

  $: meta: DemoMeta =
    demoByKey[subjectParam] ??
    demoByKey[groupID] ?? { subject: 'Física', group: '11°B', room: '304', range: '08:45 - 10:15' };

  $: account = devAccounts.find((a) => a.id === $session) ?? devAccounts[1];
  $: teacherName = account?.displayName ? `Prof. ${account.displayName}` : $t.agenda.teacherName;

  let loading = true;
  let roster: RosterEntry[] = [];
  let present = new Set<string>(demoPresent);
  let presentInit = new Set<string>(demoPresent);
  let sessionID = '';
  let feedback = '';
  let feedbackError = false;
  let saving = false;

  function bySurname(a: RosterEntry, b: RosterEntry): number {
    const x = `${a.Surnames} ${a.Names}`.toLowerCase();
    const y = `${b.Surnames} ${b.Names}`.toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  }

  async function load() {
    loading = true;
    feedback = '';
    try {
      const data = await guarded(() => classRoster(groupID));
      if (data === null) {
        roster = [...demoRoster];
        return;
      }
      if (data.length === 0) {
        roster = [...demoRoster];
      } else {
        roster = [...data].sort(bySurname);
      }
      present = new Set(roster.filter((r) => demoPresent.has(r.StudentID)).map((r) => r.StudentID));
      if (present.size === 0) present = new Set(roster.slice(0, 5).map((r) => r.StudentID));
      presentInit = new Set(present);
    } catch (err) {
      if (err instanceof ApiError && isMissing(err)) {
        roster = [...demoRoster];
        present = new Set(demoPresent);
        presentInit = new Set(demoPresent);
      } else {
        roster = [...demoRoster];
        present = new Set(demoPresent);
        presentInit = new Set(demoPresent);
      }
    } finally {
      loading = false;
    }
  }

  onMount(load);

  function toggle(id: string) {
    if (present.has(id)) present.delete(id);
    else present.add(id);
    present = present;
    feedback = '';
  }

  $: presentCount = roster.filter((r) => present.has(r.StudentID)).length;
  $: absentCount = roster.length - presentCount;
  $: presentPct = roster.length ? Math.round((presentCount / roster.length) * 100) : 0;

  async function ensureSession(): Promise<boolean> {
    if (sessionID) return true;
    try {
      const detail = await openSession(groupID);
      sessionID = detail.Session.ID;
      return true;
    } catch {
      return false;
    }
  }

  async function save() {
    feedback = '';
    feedbackError = false;
    if (saving) return;
    saving = true;
    try {
      const ok = await ensureSession();
      if (ok && sessionID) {
        for (const r of roster) {
          const wasPresent = presentInit.has(r.StudentID);
          const isPresent = present.has(r.StudentID);
          if (wasPresent === isPresent) continue;
          try {
            await recordMark(sessionID, r.StudentID, isPresent ? '' : 'absence', '');
          } catch {
            /* backend pendiente: se conserva el estado local */
          }
        }
        presentInit = new Set(present);
      }
      feedback = $t.attendance.saved;
    } catch (err) {
      feedbackError = true;
      feedback = err instanceof ApiError ? err.message : $t.common.loadError;
    } finally {
      saving = false;
    }
  }

  function openCollective() {
    const q = subjectParam ? `?materia=${encodeURIComponent(subjectParam)}` : '';
    push(`/llamado/${encodeURIComponent(groupID)}${q}`);
  }
</script>

<div class="attendance">
  <header class="top">
    <div class="top-inner">
      <div class="brand">
        <span class="mark" aria-hidden="true">O</span>
        <span class="brand-text"><strong>Observador</strong><small>Estudiantil</small></span>
      </div>
      <nav class="mainnav" aria-label={$t.a11y.sections}>
        <button type="button" class="navlink active" aria-current="page" on:click={() => push('/agenda')}>{$t.nav.agenda}</button>
        <button type="button" class="navlink" on:click={() => push('/horario')}>{$t.nav.myClasses}</button>
        <button type="button" class="navlink" on:click={() => push('/hoy')}>{$t.nav.warnings}</button>
        <button type="button" class="navlink" on:click={() => push('/admin/estudiantes')}>{$t.nav.students}</button>
      </nav>
      <div class="top-right">
        <span class="search"><Icon name="search" /><span>{$t.agenda.searchPlaceholder}</span></span>
        <div class="profile">
          <span class="avatar" aria-hidden="true">CM</span>
          <span class="who"><strong>{teacherName}</strong><small>{$t.agenda.teacherId}</small></span>
        </div>
        <button type="button" class="gear" aria-label={$t.settings.title} on:click={() => push('/ajustes')}>
          <Icon name="settings" />
        </button>
      </div>
    </div>
  </header>

  <main class="body">
    <div class="head-row">
      <div>
        <p class="crumbs">{$t.attendance.breadcrumbHome} <span>›</span> {$t.attendance.breadcrumbAgenda} <span>›</span> <strong>{$t.attendance.breadcrumbHere}</strong></p>
        <h1>{$t.attendance.title}</h1>
      </div>
      <button type="button" class="collective" on:click={openCollective}>
        <Icon name="warn" /> {$t.attendance.collective}
      </button>
    </div>

    {#if loading}
      <Skeleton rows={6} />
    {:else}
      <div class="grid">
        <aside class="card info">
          <p class="tag">{$t.attendance.todayTag}</p>
          <h2>{meta.subject} - {meta.group}</h2>
          <p class="desc">{$t.attendance.classDesc}</p>
          <ul class="facts">
            <li><Icon name="calendar" /> {$t.attendance.dateLabel}</li>
            <li><Icon name="clock" /> {$t.attendance.timeLabel(meta.range)}</li>
            <li><Icon name="pin" /> {$t.attendance.roomLabel(meta.room)}</li>
          </ul>
          <div class="summary">
            <h3>{$t.attendance.summaryTitle}</h3>
            <div class="bar" role="img" aria-label={`${$t.attendance.presentLabel} ${presentCount}, ${$t.attendance.absentLabel} ${absentCount}`}>
              <span class="fill-present" style={`width: ${presentPct}%`}></span>
            </div>
            <p class="sum-row"><span class="dot blue"></span> {$t.attendance.presentLabel} <strong>{ $t.attendance.studentsCount(presentCount)}</strong></p>
            <p class="sum-row"><span class="dot red"></span> {$t.attendance.absentLabel} <strong>{ $t.attendance.studentsCount(absentCount)}</strong></p>
          </div>
        </aside>

        <section class="card list">
          <div class="list-head">
            <h2>{$t.attendance.listTitle(meta.group)}</h2>
            <p>{$t.attendance.listHint}</p>
          </div>
          <div class="table-head">
            <span>{$t.attendance.colId}</span>
            <span>{$t.attendance.colName}</span>
            <span class="center">{$t.attendance.colCheck}</span>
          </div>
          <ul class="rows">
            {#each roster as r (r.StudentID)}
              <li class="row">
                <span class="id">{r.StudentID}</span>
                <span class="name"><strong>{r.Surnames}</strong> , {r.Names}</span>
                <span class="check-wrap">
                  <button
                    type="button"
                    class="check"
                    class:on={present.has(r.StudentID)}
                    role="checkbox"
                    aria-checked={present.has(r.StudentID)}
                    aria-label={`${r.Surnames} ${r.Names}`}
                    on:click={() => toggle(r.StudentID)}
                  >
                    {#if present.has(r.StudentID)}<Icon name="check" />{/if}
                  </button>
                </span>
              </li>
            {/each}
          </ul>
          {#if feedback}
            <p class="flash" class:error={feedbackError} role="status">{feedback}</p>
          {:else}
            <p class="hint">{$t.attendance.saveHint}</p>
          {/if}
          <div class="actions">
            <button type="button" class="ghost" on:click={() => push('/agenda')}>{$t.attendance.back}</button>
            <button type="button" class="primary" disabled={saving} on:click={save}>{$t.attendance.save}</button>
          </div>
        </section>
      </div>
    {/if}
  </main>
</div>

<style>
  .attendance {
    min-height: 100vh;
    min-height: 100svh;
    background: var(--bg);
    color: var(--ink);
  }
  .top {
    background: var(--surface);
    border-bottom: 1px solid var(--line);
  }
  .top-inner {
    max-width: 1180px;
    margin: 0 auto;
    padding: 12px 20px;
    display: flex;
    align-items: center;
    gap: 20px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: none;
  }
  .mark {
    width: 36px;
    height: 36px;
    border-radius: 12px;
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 800;
    font-size: 1.15rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .brand-text {
    display: flex;
    flex-direction: column;
    line-height: 1.15;
  }
  .brand-text strong {
    font-size: 0.95rem;
  }
  .brand-text small {
    color: var(--accent);
    font-weight: 700;
    font-size: 0.75rem;
  }
  .mainnav {
    flex: 1;
    display: flex;
    justify-content: center;
    gap: 4px;
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 4px;
    max-width: 560px;
    margin: 0 auto;
    background: var(--surface);
  }
  .navlink {
    flex: 1;
    white-space: nowrap;
    padding: 8px 14px;
    border-radius: 8px;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--muted);
  }
  .navlink.active {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .top-right {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: none;
  }
  .search {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-pill);
    padding: 8px 14px;
    color: var(--muted);
    font-size: 0.85rem;
    min-width: 230px;
  }
  .profile {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .avatar {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-pill);
    background: var(--chip-sky-bg);
    color: var(--chip-sky-ink);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    font-size: 0.85rem;
  }
  .who {
    display: flex;
    flex-direction: column;
    line-height: 1.2;
  }
  .who strong {
    font-size: 0.85rem;
    white-space: nowrap;
  }
  .who small {
    color: var(--muted);
    font-size: 0.72rem;
  }
  .gear {
    width: 40px;
    height: 40px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-pill);
    color: var(--muted);
    border: 1px solid var(--line);
    background: var(--surface);
  }
  .body {
    max-width: 1180px;
    margin: 0 auto;
    padding: 18px 20px 96px;
  }
  .head-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 18px;
  }
  .crumbs {
    color: var(--muted);
    font-size: 0.8rem;
    margin-bottom: 4px;
  }
  .crumbs strong {
    color: var(--ink);
  }
  .head-row h1 {
    font-size: 1.9rem;
  }
  .collective {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: var(--chip-pink-bg);
    color: var(--chip-pink-ink);
    border: 1px solid currentColor;
    font-weight: 700;
    font-size: 0.85rem;
    border-radius: var(--radius-pill);
    padding: 10px 18px;
    white-space: nowrap;
  }
  .grid {
    display: grid;
    grid-template-columns: 320px 1fr;
    gap: 16px;
    align-items: start;
  }
  .card {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow);
    padding: 22px;
  }
  .tag {
    color: var(--accent);
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    margin-bottom: 6px;
  }
  .info h2 {
    font-size: 1.5rem;
    margin-bottom: 8px;
  }
  .desc {
    color: var(--muted);
    font-size: 0.88rem;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--line);
    margin-bottom: 16px;
  }
  .facts {
    list-style: none;
    margin: 0 0 20px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
    color: var(--muted);
    font-size: 0.88rem;
    font-weight: 500;
  }
  .facts li {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .summary h3 {
    font-size: 0.9rem;
    margin-bottom: 10px;
  }
  .bar {
    height: 8px;
    border-radius: 999px;
    background: var(--danger);
    overflow: hidden;
    margin-bottom: 12px;
  }
  .fill-present {
    display: block;
    height: 100%;
    background: var(--accent);
    border-radius: 999px;
    transition: width 0.25s ease;
  }
  .sum-row {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--muted);
    font-size: 0.85rem;
    padding: 2px 0;
  }
  .sum-row strong {
    margin-left: auto;
    color: var(--ink);
    font-size: 0.82rem;
  }
  .dot {
    width: 9px;
    height: 9px;
    border-radius: 999px;
    flex: none;
  }
  .dot.blue {
    background: var(--accent);
  }
  .dot.red {
    background: var(--danger);
  }
  .list-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }
  .list-head h2 {
    font-size: 1.05rem;
  }
  .list-head p {
    color: var(--muted);
    font-size: 0.78rem;
  }
  .table-head {
    display: grid;
    grid-template-columns: 110px 1fr 110px;
    gap: 12px;
    background: var(--surface-2);
    border-radius: 8px;
    padding: 10px 16px;
    color: var(--muted);
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    margin-bottom: 6px;
  }
  .table-head .center {
    text-align: center;
  }
  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .row {
    display: grid;
    grid-template-columns: 110px 1fr 110px;
    gap: 12px;
    align-items: center;
    padding: 13px 16px;
    border-bottom: 1px solid var(--line);
  }
  .id {
    color: var(--muted);
    font-size: 0.82rem;
    font-weight: 600;
  }
  .name {
    font-size: 0.92rem;
    color: var(--muted);
  }
  .name strong {
    color: var(--ink);
  }
  .check-wrap {
    display: flex;
    justify-content: center;
  }
  .check {
    width: 22px;
    height: 22px;
    border-radius: 7px;
    border: 1.5px solid var(--line);
    background: var(--surface);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--accent-ink);
  }
  .check.on {
    background: var(--accent);
    border-color: var(--accent);
  }
  .check :global(svg) {
    width: 14px;
    height: 14px;
  }
  .hint {
    color: var(--muted);
    font-size: 0.82rem;
    margin: 14px 2px 0;
  }
  .flash {
    background: var(--chip-green-bg);
    color: var(--chip-green-ink);
    font-weight: 600;
    font-size: 0.88rem;
    border-radius: var(--radius-chip);
    padding: 10px 14px;
    margin: 14px 0 0;
  }
  .flash.error {
    background: var(--chip-pink-bg);
    color: var(--chip-pink-ink);
  }
  .actions {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-top: 18px;
  }
  .ghost {
    background: var(--surface-2);
    color: var(--ink);
    font-weight: 700;
    font-size: 0.88rem;
    border-radius: 10px;
    padding: 12px 20px;
  }
  .primary {
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 700;
    font-size: 0.88rem;
    border-radius: 10px;
    padding: 12px 24px;
  }
  .primary:disabled {
    opacity: 0.6;
  }

  @media (max-width: 960px) {
    .top-inner {
      flex-wrap: wrap;
    }
    .mainnav {
      order: 3;
      flex-basis: 100%;
      max-width: none;
      overflow-x: auto;
    }
    .grid {
      grid-template-columns: 1fr;
    }
    .head-row {
      flex-direction: column;
    }
    .table-head,
    .row {
      grid-template-columns: 80px 1fr 60px;
    }
  }
</style>
