<script lang="ts">
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { t } from '$lib/i18n';
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import TeacherShell from './TeacherShell.svelte';
  import WarningNewSheet from './WarningNewSheet.svelte';
  import { classRoster, isMissing, openSession, recordMark } from './api';
  import { dateKey, saveRollcall } from './rollcall';
  import type { RosterEntry } from '$lib/api/types';
  import { guarded, goBack } from '$lib/nav';
  import { ApiError } from '$lib/api/types';

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

  interface ClassMeta {
    subject: string;
    group: string;
  }

  function humanize(slug: string): string {
    const clean = slug.replace(/[-_]+/g, ' ').trim();
    return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : '';
  }

  // Meta honesta: solo lo que trae la ruta (materia y salón). Sala y hora
  // las pone el horario del backend cuando exista; aquí no se inventan.
  let meta: ClassMeta = { subject: '', group: '' };
  $: meta = {
    subject: humanize(subjectParam),
    group: groupID
  };
  $: titleLabel = meta.subject ? `${meta.subject} · ${meta.group}` : meta.group;

  const initials = (names: string, surnames: string) =>
    `${surnames} ${names}`
      .split(/[\s,]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();

  let loading = true;
  let roster: RosterEntry[] = [];
  let present = new Set<string>();
  let presentInit = new Set<string>();
  // Ausentes separados por permiso: el docente registra la falta con
  // permiso (absence-permission) por estudiante antes de guardar.
  let permission = new Set<string>();
  let permissionInit = new Set<string>();
  let sessionID = '';
  let sessionMissing = false;
  let feedback = '';
  let feedbackError = false;
  let saving = false;

  $: todayLabel = new Date().toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });

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
      if (data === null) return; // 401/403 already navigated away
      roster = [...data].sort(bySurname);
      present = new Set(roster.map((r) => r.StudentID));
      presentInit = new Set(present);
      permission = new Set();
      permissionInit = new Set();
    } catch {
      // Backend sin nómina todavía (404 o error): vacío honesto, no lista falsa.
      roster = [];
      present = new Set();
      presentInit = new Set();
      permission = new Set();
      permissionInit = new Set();
    } finally {
      loading = false;
    }
  }

  onMount(load);

  function toggle(id: string) {
    if (present.has(id)) present.delete(id);
    else {
      present.add(id);
      permission.delete(id); // presente y con permiso son excluyentes
    }
    present = present;
    permission = permission;
    feedback = '';
  }

  // Alterna la ausencia marcada entre falta injustificada y falta con
  // permiso; solo aplica a quien no está presente.
  function cyclePermission(id: string) {
    if (present.has(id)) return;
    if (permission.has(id)) permission.delete(id);
    else permission.add(id);
    permission = permission;
    feedback = '';
  }

  $: presentCount = roster.filter((r) => present.has(r.StudentID)).length;
  $: notPresent = roster.filter((r) => !present.has(r.StudentID));
  $: permissionCount = notPresent.filter((r) => permission.has(r.StudentID)).length;
  $: absentCount = notPresent.length - permissionCount;
  $: presentPct = roster.length ? Math.round((presentCount / roster.length) * 100) : 0;

  async function ensureSession(): Promise<boolean> {
    if (sessionID) return true;
    try {
      const detail = await openSession(groupID);
      sessionID = detail.Session.ID;
      return true;
    } catch (err) {
      if (err instanceof ApiError && isMissing(err)) sessionMissing = true;
      return false;
    }
  }

  // Acciones en bloque: en un salón de 35 students, marcar uno por uno es
  // la forma más común de equivocarse. Se marca todo y luego se descuenta
  // a quien falta; el guardado sigue siendo el de siempre.
  function markAllPresent() {
    const next = new Set<string>();
    for (const r of roster) next.add(r.StudentID);
    present = next;
    permission = new Set();
    feedback = '';
  }

  function markAllAbsent() {
    present = new Set<string>();
    feedback = '';
  }

  // Instantánea del resumen para la Agenda: tanto si el backend guardó
  // como si quedó local, el estado final es lo que se anota.
  function snapshotRollcall() {
    saveRollcall({
      Date: dateKey(),
      GroupID: groupID,
      Students: roster.length,
      Present: presentCount,
      Absent: absentCount,
      Permission: permissionCount
    });
  }

  async function save() {
    feedback = '';
    feedbackError = false;
    if (saving) return;
    saving = true;
    try {
      const ok = await ensureSession();
      if (!ok || !sessionID) {
        // Sin sesión en el backend: se conserva el estado local y se dice.
        presentInit = new Set(present);
        permissionInit = new Set(permission);
        snapshotRollcall();
        feedback = $t.attendance.savedLocal;
        return;
      }
      for (const r of roster) {
        // Marca equivalente de cada estado (presente = "").
        const wasMark = presentInit.has(r.StudentID)
          ? ''
          : permissionInit.has(r.StudentID)
            ? 'absence-permission'
            : 'absence';
        const isMark = present.has(r.StudentID)
          ? ''
          : permission.has(r.StudentID)
            ? 'absence-permission'
            : 'absence';
        if (wasMark === isMark) continue;
        try {
          await recordMark(sessionID, r.StudentID, isMark, '');
        } catch {
          /* marca no enviada: se conserva el estado local */
        }
      }
      presentInit = new Set(present);
      permissionInit = new Set(permission);
      snapshotRollcall();
      feedback = $t.attendance.saved;
    } catch (err) {
      feedbackError = true;
      feedback = err instanceof ApiError ? err.message : $t.common.loadError;
    } finally {
      saving = false;
    }
  }

  let warnOpen = false;

  function openCollective() {
    const q = subjectParam ? `?materia=${encodeURIComponent(subjectParam)}` : '';
    push(`/llamado/${encodeURIComponent(groupID)}${q}`);
  }
</script>

<TeacherShell active="agenda">
  <div class="attendance">
  <TopBar title={$t.app.name} showBack onBack={() => goBack('/agenda')}><TopActions /></TopBar>

  <div class="pagehead">
    <p class="crumbs">{$t.attendance.breadcrumbHome} <span>›</span> {$t.attendance.breadcrumbAgenda} <span>›</span> <strong>{$t.attendance.breadcrumbHere}</strong></p>
    <p class="eyebrow">{$t.attendance.eyebrow}</p>
    <h1 class="title">{$t.attendance.title}</h1>
    <div class="headactions">
      <button type="button" class="collective" on:click={openCollective}>
        <Icon name="warn" /> {$t.attendance.collective}
      </button>
      <button type="button" class="collective ghost" on:click={() => (warnOpen = true)}>
        <Icon name="warn" /> {$t.agenda.warnActionLong}
      </button>
    </div>
    <WarningNewSheet
      open={warnOpen}
      groupID={groupID}
      originLabel={titleLabel}
      onClose={() => (warnOpen = false)}
      onSaved={() => (warnOpen = false)}
    />
  </div>

  <div class="sheet">
    {#if loading}
      <Skeleton rows={6} />
    {:else if roster.length === 0}
      <EmptyState
        icon="users"
        title={$t.attendance.emptyRosterTitle}
        body={$t.attendance.emptyRosterBody}
        actionLabel={$t.common.retry}
        onAction={load}
      />
    {:else}
      <div class="grid">
        <aside class="card info">
          <p class="tag">{$t.attendance.todayTag}</p>
          <h2>{titleLabel}</h2>
          <ul class="facts">
            <li><span class="ibadge"><Icon name="calendar" /></span> <span class="cap">{todayLabel}</span></li>
            <li><span class="ibadge"><Icon name="list" /></span> {$t.attendance.listTitle(meta.group)}</li>
          </ul>
          <div class="summary">
            <h3>{$t.attendance.summaryTitle}</h3>
            <p class="rate"><strong>{presentPct}%</strong><span class="rbar"><span style={`width: ${presentPct}%`}></span></span></p>
            <p class="sum-row"><span class="dot present"></span> {$t.attendance.presentLabel} <strong>{$t.attendance.studentsCount(presentCount)}</strong></p>
            <p class="sum-row"><span class="dot absent"></span> {$t.attendance.absentLabel} <strong>{$t.attendance.studentsCount(absentCount)}</strong></p>
            <p class="sum-row"><span class="dot permission"></span> {$t.attendance.permissionLabel} <strong>{$t.attendance.studentsCount(permissionCount)}</strong></p>
          </div>
          {#if sessionMissing}
            <p class="note">{$t.attendance.noSessionNote}</p>
          {/if}
        </aside>

        <section class="card list">
          <div class="list-head">
            <h2>{$t.attendance.listTitle(meta.group)}</h2>
            <span class="countpill">{$t.attendance.studentsCount(roster.length)}</span>
          </div>
          <p class="hint-top">{$t.attendance.listHint}</p>
          <div class="bulk">
            <button type="button" class="bulk-btn" on:click={markAllPresent}>
              <Icon name="check" /> {$t.attendance.markAllPresent}
            </button>
            <button type="button" class="bulk-btn" on:click={markAllAbsent}>
              <Icon name="close" /> {$t.attendance.markAllAbsent}
            </button>
          </div>
          <ul class="ledger">
            {#each roster as r (r.StudentID)}
              <li>
                <button
                  type="button"
                  class="check"
                  class:on={present.has(r.StudentID)}
                  role="checkbox"
                  aria-checked={present.has(r.StudentID)}
                  aria-label={`${r.Surnames} ${r.Names}`}
                  on:click={() => toggle(r.StudentID)}
                >
                  <span class="box">{#if present.has(r.StudentID)}<Icon name="check" />{/if}</span>
                </button>
                <span class="avatar" aria-hidden="true">{initials(r.Names, r.Surnames)}</span>
                <span class="who"><strong>{r.Surnames}, {r.Names}</strong><small>{r.StudentID}</small></span>
                {#if present.has(r.StudentID)}
                  <span class="markpill present">{$t.roster.present}</span>
                {:else}
                  <button
                    type="button"
                    class={`markpill togglable ${permission.has(r.StudentID) ? 'permitted' : 'absent'}`}
                    aria-pressed={permission.has(r.StudentID)}
                    title={$t.attendance.permissionHint}
                    on:click={() => cyclePermission(r.StudentID)}
                  >
                    {permission.has(r.StudentID) ? $t.roster.permission : $t.roster.absent}
                  </button>
                {/if}
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
  </div>
</div>

</TeacherShell>

<style>
  .attendance {
    margin: 0 auto;
    max-width: 1400px;
    min-width: 0;
    color: var(--ink);
  }
  .pagehead {
    margin-bottom: 12px;
  }
  .crumbs {
    color: var(--muted);
    font-size: 0.8rem;
    margin-bottom: 6px;
  }
  .crumbs strong {
    color: var(--ink);
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
    margin-bottom: 12px;
    font-variant-numeric: tabular-nums;
  }
  .collective {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 700;
    font-size: 0.85rem;
    border-radius: var(--radius-pill);
    padding: 10px 18px;
    white-space: nowrap;
    min-height: 44px;
  }
  .collective :global(svg) {
    width: 15px;
    height: 15px;
  }
  .headactions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .collective.ghost {
    background: var(--surface);
    color: var(--ink);
    border: 1px solid var(--line);
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
  .grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 12px;
    align-items: start;
  }
  .card {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    padding: 20px 18px;
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
    font-size: 1.4rem;
    letter-spacing: -0.02em;
    margin-bottom: 12px;
    overflow-wrap: anywhere;
  }
  .facts {
    list-style: none;
    margin: 0 0 16px;
    padding: 0 0 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    border-bottom: 1px solid var(--line);
    color: var(--ink-soft);
    font-size: 0.85rem;
    font-weight: 500;
  }
  .facts li {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .cap {
    text-transform: capitalize;
  }
  .ibadge {
    width: 26px;
    height: 26px;
    border-radius: 8px;
    background: var(--tint);
    color: var(--ink-soft);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
  }
  .ibadge :global(svg) {
    width: 15px;
    height: 15px;
  }
  .summary h3 {
    font-size: 0.9rem;
    font-weight: 550;
    margin-bottom: 10px;
  }
  .rate {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
  }
  .rate strong {
    font-size: 1.5rem;
    font-weight: 550;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }
  .rbar {
    flex: 1;
    height: 8px;
    border-radius: var(--radius-pill);
    background: var(--tint);
    overflow: hidden;
  }
  .rbar span {
    display: block;
    height: 100%;
    background: var(--ink);
    border-radius: var(--radius-pill);
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
    font-variant-numeric: tabular-nums;
  }
  .dot {
    width: 9px;
    height: 9px;
    border-radius: var(--radius-pill);
    flex: none;
  }
  .dot.present {
    background: var(--m-present);
  }
  .dot.absent {
    background: var(--m-absent);
    border: 1px solid var(--m-evasion);
  }
  .dot.permission {
    background: var(--m-permission);
  }
  .note {
    color: var(--muted);
    font-size: 0.78rem;
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--line);
  }
  .list-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 4px;
  }
  .list-head h2 {
    font-size: 1rem;
    font-weight: 550;
    overflow-wrap: anywhere;
  }
  .countpill {
    background: var(--tint);
    color: var(--ink-soft);
    font-size: 0.74rem;
    font-weight: 600;
    border-radius: var(--radius-pill);
    padding: 5px 12px;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .bulk {
    display: flex;
    gap: 8px;
    margin-bottom: 10px;
    flex-wrap: wrap;
  }
  .bulk-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 38px;
    padding: 0 14px;
    border-radius: var(--radius-pill);
    border: 1px solid var(--line);
    background: var(--surface-2);
    color: var(--muted);
    font-weight: 600;
    font-size: 0.8rem;
  }
  .bulk-btn:hover {
    color: var(--ink);
  }
  .bulk-btn :global(svg) {
    width: 15px;
    height: 15px;
  }
  .hint-top {
    color: var(--muted);
    font-size: 0.78rem;
    margin-bottom: 10px;
  }
  .ledger {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .ledger li {
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 6px 14px 6px 6px;
    min-height: 56px;
  }
  .check {
    flex: none;
    width: 44px;
    height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .box {
    width: 22px;
    height: 22px;
    border-radius: 7px;
    border: 1.5px solid var(--muted);
    background: var(--surface);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--bg);
  }
  .box :global(svg) {
    width: 14px;
    height: 14px;
  }
  .check.on .box {
    background: var(--ink);
    border-color: var(--ink);
  }
  .avatar {
    flex: none;
    width: 36px;
    height: 36px;
    border-radius: var(--radius-pill);
    border: 1px solid var(--ink);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 0.7rem;
  }
  .who {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .who strong {
    font-size: 0.9rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .who small {
    color: var(--muted);
    font-size: 0.74rem;
    font-variant-numeric: tabular-nums;
  }
  .markpill {
    flex: none;
    font-size: 0.7rem;
    font-weight: 600;
    border-radius: var(--radius-pill);
    padding: 5px 12px;
    white-space: nowrap;
    background: var(--tint);
    color: var(--ink-soft);
  }
  .markpill.absent {
    background: var(--g-medio-bg);
    color: var(--g-medio-ink);
  }
  .markpill.permitted {
    background: var(--m-permission-bg);
    color: var(--m-permission);
  }
  button.markpill.togglable {
    border: none;
    cursor: pointer;
    font: inherit;
    font-size: 0.7rem;
  }
  button.markpill.togglable:hover {
    filter: brightness(0.96);
  }
  .hint {
    color: var(--muted);
    font-size: 0.82rem;
    margin: 14px 2px 0;
  }
  .flash {
    background: var(--tint);
    color: var(--ink);
    font-weight: 600;
    font-size: 0.88rem;
    border-radius: var(--radius-chip);
    padding: 10px 14px;
    margin: 14px 0 0;
  }
  .flash.error {
    background: var(--g-grave-bg);
    color: var(--g-grave-ink);
  }
  .actions {
    display: flex;
    flex-direction: column-reverse;
    gap: 8px;
    margin-top: 18px;
  }
  .ghost {
    background: var(--surface);
    border: 1px solid var(--line);
    color: var(--ink);
    font-weight: 700;
    font-size: 0.88rem;
    border-radius: var(--radius-chip);
    padding: 12px 20px;
    min-height: 44px;
  }
  .primary {
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 700;
    font-size: 0.88rem;
    border-radius: var(--radius-chip);
    padding: 12px 24px;
    min-height: 44px;
  }
  .primary:disabled {
    opacity: 0.6;
  }
  @media (min-width: 720px) {
    .title {
      font-size: 2.4rem;
    }
    .sheet {
      padding: 24px 26px 60px;
    }
    .grid {
      grid-template-columns: 320px minmax(0, 1fr);
      gap: 12px;
    }
    .actions {
      flex-direction: row;
      justify-content: space-between;
    }
  }
</style>
