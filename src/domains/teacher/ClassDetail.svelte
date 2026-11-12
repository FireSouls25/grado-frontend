<script lang="ts">
  import { onMount } from 'svelte';
  import { loadWhenReady } from '$lib/sessionReady';
  import { push } from 'svelte-spa-router';
  import { t } from '$lib/i18n';
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import TeacherShell from './TeacherShell.svelte';
  import WarningNewSheet from './WarningNewSheet.svelte';
  import AcademicAlertSheet from './AcademicAlertSheet.svelte';
  import { classRoster, groupPermits, isMissing, openSession, recordMark, recordUniform, sessionMarks, sessionUniform, todaySessions } from './api';
  import { groupsByYear, listSubjects } from '../admin/api';
  import { notify } from '$lib/ui/notice';
  import { dateKey, saveRollcall } from './rollcall';
  import { resolveId } from '$lib/slug';
  import { calendarDate } from '$lib/dates';
  import { schoolDay } from '$lib/schoolDay';
  import type { RosterEntry } from '$lib/api/types';
  import { guarded, goBack } from '$lib/nav';
  import { ApiError } from '$lib/api/types';

  export let params: { groupID?: string } = {};
  export let querystring: string = '';
  let groupID = '';

  function queryParam(key: string): string {
    try {
      const qs = querystring || window.location.hash.split('?')[1] || '';
      return new URLSearchParams(qs).get(key) ?? '';
    } catch {
      return '';
    }
  }
  $: subjectParam = queryParam('materia');
  // Bloque del día dentro del salón (1 = único o primero): la asistencia
  // es por clase; cada tarjeta de la agenda trae el suyo.
  $: periodParam = Number.parseInt(queryParam('periodo') || '1', 10) || 1;

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
    subject: subjectName || humanize(subjectParam),
    group: groupLabel || groupID
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
  // Ausentes separados por atraso: el docente registra el atraso
  // estudiante antes de guardar.
  let late = new Set<string>();
  let lateInit = new Set<string>();
  // Evasiones aparte de la falta: marca propia del backend que también
  // baja la asistencia y sale en estadísticas.
  let evasion = new Set<string>();
  let evasionInit = new Set<string>();
  // Permisos con motivo registrado: el docente también puede otorgarlos;
  // el motivo viaja en la nota de la marca.
  let perm = new Set<string>();
  let permInit = new Set<string>();
  // Uniforme: checkbox por estudiante, marcado por defecto. Solo se
  // guardan los cambios respecto a lo último registrado.
  let uniformOff = new Set<string>();
  let uniformOffInit = new Set<string>();
  let permNotes: Record<string, string> = {};
  let permNotesInit: Record<string, string> = {};
  // Permiso previo concedido por secretaría/administración antes de la
  // clase. El estudiante sigue en la nómina, pero queda bloqueado: el
  // docente no puede marcar presente ni falta porque el permiso manda.
  let locked = new Set<string>();
  let lockReasons: Record<string, string> = {};
  let groupLabel = '';
  let subjectName = '';
  let sessionID = '';
  let sessionMissing = false;
  let feedback = '';
  let feedbackError = false;
  let saving = false;

  // El rótulo y la consulta usan el día del servidor, no el reloj del
  // equipo: hoy es hoy aunque el dispositivo mienta.
  let todayKey = '';
  $: todayLabel = (() => {
    const d = todayKey ? calendarDate(todayKey) : null;
    const base = d ?? new Date();
    return base.toLocaleDateString('es-CO', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });
  })();

  function bySurname(a: RosterEntry, b: RosterEntry): number {
    const x = `${a.Surnames} ${a.Names}`.toLowerCase();
    const y = `${b.Surnames} ${b.Names}`.toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  }

  async function load() {
    loading = true;
    feedback = '';
    try {
      groupID = await resolveId(decodeURIComponent(params.groupID ?? ''));
      todayKey = await schoolDay();
      const data = await guarded(() => classRoster(groupID), {
        forbidden: () => {
          notify($t.attendance.deniedRedirect);
          push('/agenda');
        }
      });
      if (data === null) return; // 401/403 already navigated away
      roster = [...data].sort(bySurname);
      void resolveLabels();
      present = new Set(roster.map((r) => r.StudentID));
      presentInit = new Set(present);
      late = new Set();
      lateInit = new Set();
      evasion = new Set();
      evasionInit = new Set();
      await resumeToday();
      await loadPermits();
    } catch {
      // Backend sin nómina todavía (404 o error): vacío honesto, no lista falsa.
      roster = [];
      present = new Set();
      presentInit = new Set();
      late = new Set();
      lateInit = new Set();
      evasion = new Set();
      evasionInit = new Set();
    } finally {
      loading = false;
    }
  }

  // Si el salón ya tiene llamado hoy EN ESTE BLOQUE, se retoma: la
  // lista abre con el estado de cada estudiante y se sigue la misma
  // sesión en vez de abrir otra. Sin sesión previa queda todo presente.
  async function resumeToday() {
    try {
      const list = await guarded(() => todaySessions(groupID, todayKey || dateKey()));
      const ours = (list ?? []).find((s) => (s.Period || 1) === periodParam) ?? list?.[0];
      if (!list || list.length === 0 || !ours?.ID) return;
      const marks = await guarded(() => sessionMarks(ours.ID));
      if (!marks) return;
      sessionID = ours.ID;
      const p = new Set<string>();
      const l = new Set<string>();
      const v = new Set<string>();
      const pm = new Set<string>();
      for (const r of roster) {
        const m = marks[r.StudentID] ?? '';
        if (m === 'late') l.add(r.StudentID);
        else if (m === 'evasion') v.add(r.StudentID);
        else if (m === 'absence-permission') pm.add(r.StudentID);
        else if (m === '') p.add(r.StudentID);
      }
      present = p;
      late = l;
      evasion = v;
      perm = pm;
      presentInit = new Set(p);
      lateInit = new Set(l);
      evasionInit = new Set(v);
      permInit = new Set(pm);
      try {
        const uniform = await guarded(() => sessionUniform(ours.ID));
        const off = new Set<string>();
        if (uniform) {
          for (const r of roster) {
            if (uniform[r.StudentID] === false) off.add(r.StudentID);
          }
        }
        uniformOff = off;
        uniformOffInit = new Set(off);
      } catch {
        /* sin uniforme legible: todo marcado, como antes */
      }
    } catch {
      /* sin historial legible: todo presente, como antes */
    }
  }

  // Permisos previos del salón para hoy: quien ya está cubierto entra en
  // la nómina como "Con permiso" y sus marcas quedan bloqueadas.
  async function loadPermits() {
    try {
      const list = await guarded(() => groupPermits(groupID, todayKey || dateKey()));
      const next = new Set<string>();
      const reasons: Record<string, string> = {};
      for (const p of list ?? []) {
        // Un permiso con materia solo cubre esa clase.
        if (p.SubjectID && subjectParam && p.SubjectID !== subjectParam) continue;
        next.add(p.StudentID);
        reasons[p.StudentID] = p.Reason;
      }
      locked = next;
      lockReasons = reasons;
      const p = new Set(present);
      const l = new Set(late);
      const v = new Set(evasion);
      const pm = new Set(perm);
      for (const id of locked) {
        p.delete(id);
        l.delete(id);
        v.delete(id);
        pm.add(id);
        permNotes[id] = reasons[id] ?? '';
      }
      present = p;
      late = l;
      evasion = v;
      perm = pm;
      presentInit = new Set(p);
      lateInit = new Set(l);
      evasionInit = new Set(v);
      permInit = new Set(pm);
      permNotesInit = Object.fromEntries([...pm].map((id) => [id, permNotes[id] ?? '']));
    } catch {
      /* sin permisos legibles: la lista sigue como antes */
    }
  }

  // Nombre del salon y de la materia para no exponer ids internos:
  // el docente ya puede leer salones y el catalogo de materias.
  async function resolveLabels() {
    try {
      const year = new Date().getFullYear();
      const [gs, subs] = await Promise.all([
        guarded(() => groupsByYear(year)),
        guarded(() => listSubjects())
      ]);
      const g = (gs ?? []).find((x) => x.GroupID === groupID);
      if (g) groupLabel = g.ClassLabel;
      const s = (subs ?? []).find((x) => x.ID === subjectParam);
      if (s) subjectName = s.Name;
    } catch {
      /* vacio honesto: se muestran los ids */
    }
  }

  onMount(() => loadWhenReady(() => void load()));

  type RollMark = '' | 'absence' | 'absence-permission' | 'evasion' | 'late';

  function toggleUniform(id: string) {
    if (uniformOff.has(id)) uniformOff.delete(id);
    else uniformOff.add(id);
    uniformOff = uniformOff;
    feedback = '';
  }

  function pick(id: string, mark: RollMark) {
    // El permiso previo manda: sus botones están bloqueados.
    if (locked.has(id)) return;
    if (mark === '') present.add(id);
    else present.delete(id);
    if (mark === 'late') late.add(id);
    else late.delete(id);
    if (mark === 'evasion') evasion.add(id);
    else evasion.delete(id);
    // Los docentes no otorgan permisos a estudiantes (solo secretaría y
  // administración, vía permiso record-defenses del backend): al tocar un
    // heredado se vuelve falta común; crearlos no está disponible.
    if (perm.has(id) && mark !== 'absence-permission') {
      perm.delete(id);
      delete permNotes[id];
    }
    present = present;
    late = late;
    evasion = evasion;
    perm = perm;
    feedback = '';
  }


  $: presentCount = roster.filter((r) => present.has(r.StudentID)).length;
  $: notPresent = roster.filter((r) => !present.has(r.StudentID));
  $: lateCount = notPresent.filter((r) => late.has(r.StudentID)).length;
  $: permCount = notPresent.filter((r) => perm.has(r.StudentID)).length;
  $: evasionCount = notPresent.filter((r) => evasion.has(r.StudentID)).length;
  $: uniformFaults = roster.filter((r) => uniformOff.has(r.StudentID)).length;
  $: absentCount = notPresent.length - lateCount - permCount - evasionCount;
  $: presentPct = roster.length ? Math.round(((presentCount + permCount + lateCount) / roster.length) * 100) : 0;

  async function ensureSession(): Promise<boolean> {
    if (sessionID) return true;
    try {
      const created = await openSession(groupID, periodParam, subjectParam || undefined);
      if (!created?.ID) throw new Error('empty session');
      sessionID = created.ID;
      return true;
    } catch (err) {
      // Un 403 es lista ajena: a la agenda propia, no a un error.
      if (err instanceof ApiError && err.status === 403) {
        notify($t.attendance.deniedRedirect);
        push('/agenda');
        return false;
      }
      // Solo el 404 significa "backend sin sesiones": cualquier otro
      // error (año cerrado, red, validación) debe verse tal cual.
      if (err instanceof ApiError && isMissing(err)) {
        sessionMissing = true;
        return false;
      }
      throw err;
    }
  }

  // Acciones en bloque: en un salón de 35 students, marcar uno por uno es
  // la forma más común de equivocarse. Se marca todo y luego se descuenta
  // a quien falta; el guardado sigue siendo el de siempre.
  function markAllPresent() {
    const next = new Set<string>();
    for (const r of roster) if (!locked.has(r.StudentID)) next.add(r.StudentID);
    present = next;
    late = new Set();
    evasion = new Set();
    perm = new Set(locked);
    permNotes = Object.fromEntries([...locked].map((id) => [id, lockReasons[id] ?? '']));
    feedback = '';
  }

  function markAllAbsent() {
    present = new Set<string>();
    late = new Set();
    evasion = new Set();
    perm = new Set(locked);
    permNotes = Object.fromEntries([...locked].map((id) => [id, lockReasons[id] ?? '']));
    feedback = '';
  }

  // Instantánea del resumen para la Agenda: tanto si el backend guardó
  // como si quedó local, el estado final es lo que se anota.
  // El botón solo se habilita cuando el estado difiere de lo último
  // guardado: sin cambios no hay nada que enviar.
  function sameSets(a: Set<string>, b: Set<string>): boolean {
    if (a.size !== b.size) return false;
    for (const v of a) if (!b.has(v)) return false;
    return true;
  }
  function sameNotes(a: Record<string, string>, b: Record<string, string>, ids: Set<string>): boolean {
    for (const id of ids) if ((a[id] ?? '') !== (b[id] ?? '')) return false;
    return true;
  }
  $: dirty =
    !sameSets(present, presentInit) ||
    !sameSets(late, lateInit) ||
    !sameSets(evasion, evasionInit) ||
    !sameSets(perm, permInit) ||
    !sameNotes(permNotes, permNotesInit, perm) ||
    !sameSets(uniformOff, uniformOffInit);

  function snapshotRollcall() {
    saveRollcall({
      Date: todayKey || dateKey(),
      GroupID: groupID,
      Period: periodParam,
      Students: roster.length,
      Present: presentCount,
      Absent: absentCount,
      Permission: permCount,
      Late: lateCount,
      Evasion: evasionCount
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
        lateInit = new Set(late);
        evasionInit = new Set(evasion);
        permInit = new Set(perm);
        uniformOffInit = new Set(uniformOff);
        snapshotRollcall();
        feedback = $t.attendance.savedLocal;
        return;
      }
      const markOf = (p: Set<string>, l: Set<string>, v: Set<string>, m: Set<string>, id: string): RollMark =>
        p.has(id) ? '' : l.has(id) ? 'late' : v.has(id) ? 'evasion' : m.has(id) ? 'absence-permission' : 'absence';
      const noteOf = (m: Set<string>, id: string): string =>
        m.has(id) ? (permNotes[id] ?? '') : '';
      for (const r of roster) {
        // El permiso previo se aplica solo al abrir la sesión: aquí no se
        // envía ninguna marca por ese estudiante.
        if (locked.has(r.StudentID)) continue;
        // Marca equivalente de cada estado (presente = "").
        const wasMark = markOf(presentInit, lateInit, evasionInit, permInit, r.StudentID);
        const isMark = markOf(present, late, evasion, perm, r.StudentID);
        if (wasMark === isMark && noteOf(permInit, r.StudentID) === noteOf(perm, r.StudentID)) continue;
        try {
          await recordMark(sessionID, r.StudentID, isMark, noteOf(perm, r.StudentID));
        } catch (err) {
          if (err instanceof ApiError && err.status === 403) {
            notify($t.attendance.deniedRedirect);
            push('/agenda');
            return;
          }
          /* marca no enviada: se conserva el estado local */
        }
      }
      for (const r of roster) {
        const wasOff = uniformOffInit.has(r.StudentID);
        const isOff = uniformOff.has(r.StudentID);
        if (wasOff === isOff) continue;
        try {
          await recordUniform(sessionID, r.StudentID, !isOff);
        } catch {
          /* uniforme no enviado: se conserva el estado local */
        }
      }
      presentInit = new Set(present);
      lateInit = new Set(late);
      evasionInit = new Set(evasion);
      permInit = new Set(perm);
      permNotesInit = Object.fromEntries([...perm].map((id) => [id, permNotes[id] ?? '']));
      uniformOffInit = new Set(uniformOff);
      snapshotRollcall();
      notify($t.attendance.saved);
    } catch (err) {
      feedbackError = true;
      feedback = err instanceof ApiError ? err.message : $t.common.loadError;
    } finally {
      saving = false;
    }
  }

  let warnOpen = false;
  let alertOpen = false;
</script>

<TeacherShell active="agenda">
  <div class="attendance">
  <TopBar title={titleLabel || $t.attendance.title} subtitle={`${todayLabel} · ${$t.attendance.summaryTitle}: ${presentPct}%`} showBack onBack={() => goBack('/agenda')}>
    <button type="button" class="btn" on:click={() => (warnOpen = true)}>
      <Icon name="warn" /> {$t.agenda.warnAction}
    </button>
    <button type="button" class="btn" on:click={() => (alertOpen = true)}>
      <Icon name="bell" /> {$t.academicAlert.action}
    </button>
    <TopActions />
  </TopBar>

  <div class="quick-actions">
    <button type="button" class="btn btn-sm" on:click={() => push('/agenda')}>{$t.attendance.back}</button>
  </div>
  <WarningNewSheet
      open={warnOpen}
      groupID={groupID}
      originLabel={titleLabel}
      onClose={() => (warnOpen = false)}
      onSaved={() => (warnOpen = false)}
    />
    <AcademicAlertSheet
      open={alertOpen}
      groupID={groupID}
      originLabel={titleLabel}
      onClose={() => (alertOpen = false)}
      onSaved={() => (alertOpen = false)}
    />


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
          <h2>{titleLabel}</h2>
          <ul class="facts">
            <li><span class="ibadge"><Icon name="calendar" /></span> <span class="cap">{todayLabel}</span></li>
            <li><span class="ibadge"><Icon name="list" /></span> {$t.attendance.listTitle(meta.group)}</li>
          </ul>
          <div class="summary">
            <h3>{$t.attendance.summaryTitle}</h3>
            <p class="rate"><strong>{presentPct}%</strong><span class="rbar"><span style={`width: ${presentPct}%`}></span></span></p>
            <p class="sum-row"><span class="dot present"></span> {$t.attendance.presentLabel} <strong>{$t.attendance.studentsCount(presentCount)}</strong></p>
            <p class="sum-row"><span class="dot absent"></span> {$t.roster.absent} <strong>{$t.attendance.studentsCount(absentCount)}</strong></p>
            <p class="sum-row"><span class="dot evasion"></span> {$t.roster.evasion} <strong>{$t.attendance.studentsCount(evasionCount)}</strong></p>
            <p class="sum-row"><span class="dot late"></span> {$t.attendance.lateLabel} <strong>{$t.attendance.studentsCount(lateCount)}</strong></p>
            <p class="sum-row"><span class="dot perm"></span> {$t.roster.permission} <strong>{$t.attendance.studentsCount(permCount)}</strong></p>
            <p class="sum-row"><span class="dot uniform"></span> {$t.attendance.uniformFault} <strong>{$t.attendance.studentsCount(uniformFaults)}</strong></p>
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
          {#if locked.size > 0}
            <p class="locknote" role="note">
              <Icon name="shield" />
              {$t.attendance.priorPermitNote(locked.size)}
            </p>
          {/if}
          <div class="bulk">
            <button type="button" class="btn btn-sm" on:click={markAllPresent}>
              <Icon name="check" /> {$t.attendance.markAllPresent}
            </button>
            <button type="button" class="btn btn-sm" on:click={markAllAbsent}>
              <Icon name="close" /> {$t.attendance.markAllAbsent}
            </button>
          </div>
          <ul class="ledger">
            {#each roster as r (r.StudentID)}
              {@const inPresent = present.has(r.StudentID)}
              {@const isLate = late.has(r.StudentID)}
              {@const isEvasion = evasion.has(r.StudentID)}
              {@const isPerm = perm.has(r.StudentID)}
              {@const isLocked = locked.has(r.StudentID)}
              {@const cur = inPresent ? '' : isLate ? 'late' : isEvasion ? 'evasion' : isPerm ? 'absence-permission' : 'absence'}
              <li class:locked={isLocked}>
                <span class="who">
                  <span class="avatar" aria-hidden="true">{initials(r.Names, r.Surnames)}</span>
                  <span class="name"><strong>{r.Surnames}, {r.Names}</strong><small>{r.DocumentID}</small></span>
                  {#if isLocked}
                    <span
                      class="lockchip"
                      title={lockReasons[r.StudentID]
                        ? $t.attendance.priorPermitWithReason(lockReasons[r.StudentID])
                        : $t.attendance.priorPermitTag}
                    >
                      <Icon name="shield" /> {$t.attendance.priorPermitTag}
                    </span>
                  {/if}
                </span>
                <label class="uniform-check" title={$t.attendance.uniformLabel}>
                  <input
                    type="checkbox"
                    checked={!uniformOff.has(r.StudentID)}
                    on:change={() => toggleUniform(r.StudentID)}
                  />
                  <span class="uniform-tag">{$t.attendance.uniformLabel}</span>
                </label>
                <span class="seg" role="group" aria-label={`${r.Surnames} ${r.Names}`}>
                  <button
                    type="button"
                    class:present={cur === ''}
                    aria-pressed={cur === ''}
                    disabled={isLocked}
                    on:click={() => pick(r.StudentID, '')}
                  >
                    {$t.studentSummary.presences}
                  </button>
                  <button
                    type="button"
                    class:absent={cur === 'absence'}
                    aria-pressed={cur === 'absence'}
                    disabled={isLocked}
                    on:click={() => pick(r.StudentID, 'absence')}
                  >
                    {$t.roster.absentShort}
                  </button>
                  <button
                    type="button"
                    class:evasion={cur === 'evasion'}
                    aria-pressed={cur === 'evasion'}
                    disabled={isLocked}
                    on:click={() => pick(r.StudentID, 'evasion')}
                  >
                    {$t.roster.evasion}
                  </button>
                  <button
                    type="button"
                    class:late={cur === 'late'}
                    aria-pressed={cur === 'late'}
                    on:click={() => pick(r.StudentID, 'late')}
                  >
                    {$t.studentSummary.markLate}
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
            <button type="button" class="btn" on:click={() => push('/agenda')}>{$t.attendance.back}</button>
            <button type="button" class="btn btn-primary" disabled={saving || roster.length === 0 || !dirty} on:click={save}>{saving ? '…' : $t.attendance.save}</button>
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
  .quick-actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }
  .sheet {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-sheet);
    padding: 18px;
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
    border-radius: var(--radius-control);
    background: var(--surface-2);
    border: 1px solid var(--line);
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
    background: var(--surface-2);
    border: 1px solid var(--line);
    color: var(--ink-soft);
    font-size: 0.74rem;
    font-weight: 600;
    border-radius: 999px;
    padding: 4px 10px;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .bulk {
    display: flex;
    gap: 6px;
    margin-bottom: 10px;
    flex-wrap: wrap;
  }
  .bulk .btn :global(svg) {
    width: 14px;
    height: 14px;
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
    gap: 10px 12px;
    flex-wrap: wrap;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 10px 14px;
    min-height: 56px;
  }
  .avatar {
    flex: none;
    width: 34px;
    height: 34px;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 0.72rem;
  }
  .who {
    flex: 1;
    min-width: 180px;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .who .name {
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
  /* Mismo selector que las pantallas de admin: estados como opciones y
     el permiso como botón separado. */
  .seg {
    flex: 1 1 240px;
    display: flex;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-control);
    padding: 3px;
    gap: 3px;
    flex-wrap: wrap;
  }
  .seg button {
    flex: 1;
    min-height: 30px;
    padding: 4px 8px;
    border-radius: 6px;
    font-size: 0.74rem;
    font-weight: 600;
    color: var(--muted);
    white-space: nowrap;
  }
  .seg button.present {
    background: var(--chip-green-bg);
    color: var(--chip-green-ink);
  }
  .seg button.absent {
    background: var(--chip-pink-bg);
    color: var(--g-grave-ink);
  }
  .seg button.evasion {
    background: var(--chip-purple-bg);
    color: var(--chip-purple-ink);
  }
  .seg button.late {
    background: var(--chip-yellow-bg);
    color: var(--chip-yellow-ink);
  }
  .dot.late {
    background: var(--chip-yellow-ink);
  }
  .dot.perm {
    background: var(--m-permission);
  }
  .dot.evasion {
    background: var(--chip-purple-ink);
  }
  .flash.error {
    background: var(--g-grave-bg);
    color: var(--g-grave-ink);
    font-weight: 600;
    font-size: 0.84rem;
    border-radius: var(--radius-control);
    padding: 8px 12px;
  }
  .dot.uniform {
    background: var(--accent);
  }
  .uniform-check {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--muted);
    cursor: pointer;
    user-select: none;
    white-space: nowrap;
  }
  .uniform-check input {
    width: 16px;
    height: 16px;
    accent-color: var(--accent);
    cursor: pointer;
  }
  .hint {
    color: var(--muted);
    font-size: 0.82rem;
    margin: 14px 2px 0;
  }
  .flash {
    background: var(--surface-2);
    border: 1px solid var(--line);
    color: var(--ink);
    font-weight: 500;
    font-size: 0.84rem;
    border-radius: var(--radius-control);
    padding: 10px 12px;
    margin: 12px 0 0;
  }
  .flash.error {
    background: var(--g-grave-bg);
    border-color: transparent;
    color: var(--g-grave-ink);
  }
  .actions {
    display: flex;
    gap: 8px;
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid var(--line);
    justify-content: flex-end;
    flex-wrap: wrap;
  }
  @media (min-width: 720px) {
    .grid {
      grid-template-columns: 300px minmax(0, 1fr);
      gap: 14px;
    }
  }
</style>
