<script lang="ts">
  import { onMount, tick } from 'svelte';
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ErrorState from '$lib/ui/ErrorState.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import Dropdown from '$lib/ui/Dropdown.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import AdminShell from './AdminShell.svelte';
  import { mapSettled } from '$lib/async';
  import { notify } from '$lib/ui/notice';
  import { t } from '$lib/i18n';
  import { ApiError } from '$lib/api/types';
  import { guarded, goBack } from '$lib/nav';
  import {
    groupsByYear,
    classReport,
    promotionsForGroup,
    recordPromotion,
    createClassGroup,
    studentReport,
    type YearGroup,
    type PromotionDecision
  } from './api';

  // Tablero de distribución del año siguiente: primero se decide quién
  // pasa y quién no salón por salón, y esa selección ya es la lista
  // exacta por grado; después, grado por grado, se elige cuántos salones
  // tendrá (se recuerda la última elección), se arrastra a cada
  // estudiante a su columna (orden alfabético al soltar) y confirmar
  // crea los salones y deja a cada uno matriculado donde se decidió.

  const currentYear = new Date().getFullYear();
  let year = currentYear;

  type Choice = {
    studentID: string;
    names: string;
    surnames: string;
    fromGroupID: string;
    fromGrade: number;
    decision: PromotionDecision;
    toGroupID: string | null;
  };

  let state: 'loading' | 'error' | 'ready' = 'loading';
  let loadError: unknown = null;
  let groups: YearGroup[] = [];
  let choices: Record<string, Choice> = {};
  let recorded: Record<string, { decision: PromotionDecision; toGroupID: string | null }> = {};

  let tab: 'pass' | 'place' = 'pass';
  let srcGroupID = '';
  let targetGrade = 1;
  let salonCount = 2;
  let selected: string | null = null;
  let suggestMode: 'balanced' | 'split' = 'balanced';
  let salonMin = 10;
  let salonMax = 35;
  let suggesting = false;
  let suggestNote = '';
  let rowsSaved = -1;
  let stats: Record<string, { risk: number; bad: boolean }> = {};
  let placed: Record<string, number> = {};
  let dragOverCol: number | null = null;
  let saving = false;
  let saveError = '';
  let search = '';

  $: destYear = year + 1;
  $: srcGroups = groups;
  $: srcGroup = groups.find((g) => g.GroupID === srcGroupID) ?? null;
  $: srcChoices = Object.values(choices)
    .filter((c) => c.fromGroupID === srcGroupID)
    .sort((a, b) => `${a.surnames} ${a.names}`.localeCompare(`${b.surnames} ${b.names}`, 'es'));
  $: q = search.trim().toLowerCase();
  $: pool = Object.values(choices).filter((c) => {
    const target = c.decision === 'promote' ? c.fromGrade + 1 : c.decision === 'repeat' ? c.fromGrade : -1;
    if (target !== targetGrade) return false;
    if (q && !`${c.surnames} ${c.names}`.toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => `${a.surnames} ${a.names}`.localeCompare(`${b.surnames} ${b.names}`, 'es'));
  $: placedIn = (col: number) =>
    pool
      .filter((c) => placed[c.studentID] === col)
      .sort((a, b) => `${a.surnames} ${a.names}`.localeCompare(`${b.surnames} ${b.names}`, 'es'));
  $: unplaced = pool.filter((c) => placed[c.studentID] === undefined);
  $: cols = Array.from({ length: salonCount }, (_, i) => i);

  function gradeLabel(g: number): string {
    return `${g}°`;
  }

  function targetOf(c: { decision: string; fromGrade: number }): number {
    if (c.decision === 'promote') return c.fromGrade + 1;
    if (c.decision === 'repeat') return c.fromGrade;
    return -1;
  }

  function passLabel(grade: number): string {
    return grade === 11 ? $t.cierre.distGraduate : $t.cierre.distPass;
  }

  let gradeInit = false;

  // Recuerda la última elección por año y grado: al cambiar de grado
  // se recupera su número de salones, modo y límites. El grado solo se
  // restaura una vez al abrir; después manda el selector.
  function loadGradeConfig(includeGrade: boolean) {
    try {
      if (includeGrade) {
        const g = Number(localStorage.getItem(`grado.distrib.grade.${destYear}`));
        if (Number.isInteger(g) && g >= 1 && g <= 11) targetGrade = g;
      }
      const n = Number(localStorage.getItem(`grado.distrib.salons.${destYear}.${targetGrade}`));
      if (Number.isInteger(n) && n >= 1 && n <= 8) salonCount = n;
      const mo = localStorage.getItem(`grado.distrib.mode.${destYear}.${targetGrade}`);
      if (mo === 'balanced' || mo === 'split') suggestMode = mo;
      const lo = Number(localStorage.getItem(`grado.distrib.min.${destYear}.${targetGrade}`));
      if (Number.isInteger(lo) && lo >= 1 && lo <= 200) salonMin = lo;
      const hi = Number(localStorage.getItem(`grado.distrib.max.${destYear}.${targetGrade}`));
      if (Number.isInteger(hi) && hi >= 1 && hi <= 200) salonMax = hi;
    } catch {
      /* sin almacenamiento: valores por defecto */
    }
  }

  function persist() {
    try {
      localStorage.setItem(`grado.distrib.salons.${destYear}.${targetGrade}`, String(salonCount));
      localStorage.setItem(`grado.distrib.grade.${destYear}`, String(targetGrade));
      localStorage.setItem(`grado.distrib.mode.${destYear}.${targetGrade}`, suggestMode);
      localStorage.setItem(`grado.distrib.min.${destYear}.${targetGrade}`, String(salonMin));
      localStorage.setItem(`grado.distrib.max.${destYear}.${targetGrade}`, String(salonMax));
      localStorage.setItem(`grado.distrib.placed.${destYear}.${targetGrade}`, JSON.stringify(placed));
    } catch {
      /* sin almacenamiento: la sesión sigue funcionando */
    }
  }

  function restorePlaced() {
    try {
      const raw = localStorage.getItem(`grado.distrib.placed.${destYear}.${targetGrade}`);
      if (!raw) return;
      const saved = JSON.parse(raw) as Record<string, number>;
      const next: Record<string, number> = {};
      for (const [id, col] of Object.entries(saved)) {
        if (Number.isInteger(col) && col >= 0 && col < salonCount) next[id] = col as number;
      }
      placed = next;
    } catch {
      /* arranca vacío */
    }
  }

  // Min/max razonables según el volumen real: si no hay elección
  // guardada, se proponen desde el promedio por salón.
  function autoMinMax() {
    try {
      const hasMin = localStorage.getItem(`grado.distrib.min.${destYear}.${targetGrade}`) !== null;
      const hasMax = localStorage.getItem(`grado.distrib.max.${destYear}.${targetGrade}`) !== null;
      if (hasMin && hasMax) return;
      const perPool = pool.filter((c) => targetOf(c) === targetGrade);
      if (perPool.length === 0) return;
      const avg = perPool.length / Math.max(1, salonCount);
      if (!hasMin) salonMin = Math.max(1, Math.floor(avg * 0.7));
      if (!hasMax) salonMax = Math.max(salonMin + 1, Math.ceil(avg * 1.3));
    } catch {
      /* conserva los valores actuales */
    }
  }

  $: if (state === 'ready' && !gradeInit) {
    gradeInit = true;
    void (async () => {
      loadGradeConfig(true);
      await tick();
      autoMinMax();
      restorePlaced();
    })();
  }

  // Guarda lo decidido en la pestaña Pasa/No pasa sin destino: la
  // distribución asigna el salón después. Omite lo idéntico a lo ya
  // guardado para no duplicar historial.
  async function saveDecisions() {
    if (saving) return;
    saveError = '';
    saving = true;
    try {
      let done = 0;
      for (const c of srcChoices) {
        const key = c.studentID + '|' + c.fromGroupID;
        const prev = recorded[key];
        if (prev && prev.decision === c.decision) {
          done += 1;
          continue;
        }
        const rec = await guarded(() =>
          recordPromotion({
            studentID: c.studentID,
            fromGroupID: c.fromGroupID,
            decision: c.decision
          })
        );
        if (!rec) {
          saveError = $t.common.loadError;
          return;
        }
        recorded[key] = { decision: c.decision, toGroupID: null };
        done += 1;
      }
      rowsSaved = done;
      notify($t.cierre.distDecisionsSaved(done));
    } catch (err) {
      saveError = err instanceof ApiError ? err.message : $t.common.loadError;
    } finally {
      saving = false;
    }
  }

  function onGradeChange(g: number) {
    if (!Number.isInteger(g) || g < 1 || g > 11) return;
    targetGrade = g;
    selected = null;
    search = '';
    rowsSaved = -1;
    loadGradeConfig(false);
    void (async () => {
      await tick();
      autoMinMax();
      restorePlaced();
    })();
  }

  $: {
    salonCount;
    targetGrade;
    salonMin;
    salonMax;
    suggestMode;
    if (state === 'ready') persist();
  }

  onMount(load);

  async function load() {
    state = 'loading';
    loadError = null;
    choices = {};
    recorded = {};
    selected = null;
    try {
      const data = await guarded(() => groupsByYear(year));
      if (data === null) {
        state = 'error';
        return;
      }
      groups = [...data].sort((a, b) => a.Grade - b.Grade || a.GroupNo - b.GroupNo);
      if (!groups.some((g) => g.GroupID === srcGroupID)) {
        srcGroupID = groups[0]?.GroupID ?? '';
      }
      const settled = await mapSettled(groups, 4, async (g) => {
        const [report, decided] = await Promise.all([
          guarded(() => classReport(g.GroupID)),
          guarded(() => promotionsForGroup(g.GroupID))
        ]);
        return { group: g, report, decided: decided ?? [] };
      });
      const next: Record<string, Choice> = {};
      const rec: Record<string, { decision: PromotionDecision; toGroupID: string | null }> = {};
      settled.forEach((result) => {
        if (result.status !== 'fulfilled' || !result.value?.report) return;
        const { group, report, decided } = result.value;
        const byStudent = new Map(decided.map((d) => [d.StudentID, d]));
        for (const s of report.Students) {
          const d = byStudent.get(s.StudentID);
          const decision = d?.Decision ?? (group.Grade === 11 ? 'graduate' : 'promote');
          next[s.StudentID] = {
            studentID: s.StudentID,
            names: s.Names,
            surnames: s.Surnames,
            fromGroupID: group.GroupID,
            fromGrade: group.Grade,
            decision,
            toGroupID: d?.ToGroupID ?? null
          };
          if (d) rec[s.StudentID + '|' + group.GroupID] = { decision: d.Decision, toGroupID: d.ToGroupID ?? null };
        }
      });
      choices = next;
      recorded = rec;
      state = 'ready';
    } catch (err) {
      loadError = err;
      state = 'error';
    }
  }

  function setChoice(c: Choice, pass: boolean) {
    const decision: PromotionDecision = pass
      ? c.fromGrade === 11
        ? 'graduate'
        : 'promote'
      : 'repeat';
    choices = { ...choices, [c.studentID]: { ...c, decision } };
    if (selected === c.studentID && !pass) selected = null;
  }

  function place(studentID: string, col: number) {
    placed = { ...placed, [studentID]: col };
    if (selected === studentID) selected = null;
    dragOverCol = null;
  }

  function unplace(studentID: string) {
    const next = { ...placed };
    delete next[studentID];
    placed = next;
  }

  function onDrop(col: number, e: DragEvent) {
    e.preventDefault();
    const id = e.dataTransfer?.getData('text/student-id') || selected;
    if (id) place(id, col);
    else dragOverCol = null;
  }

  async function destSalons(): Promise<YearGroup[]> {
    const dest = (await guarded(() => groupsByYear(destYear))) ?? [];
    return dest.filter((g) => g.Grade === targetGrade).sort((a, b) => a.GroupNo - b.GroupNo);
  }

  // Crear salones es un paso aparte: la sugerencia y la confirmación
  // nunca inventan salones solas.
  async function createSalons() {
    if (saving) return;
    saveError = '';
    saving = true;
    try {
      const have = await destSalons();
      let created = 0;
      for (let i = 1; i <= salonCount; i++) {
        if (have.some((g) => g.GroupNo === i)) continue;
        const rec = await guarded(() =>
          createClassGroup({ year: destYear, grade: targetGrade, groupNo: i })
        );
        if (!rec) {
          saveError = $t.common.loadError;
          return;
        }
        created += 1;
      }
      notify(created === 0 ? $t.cierre.distSalonsExist : $t.cierre.distSalonsCreated(created));
      await load();
    } catch (err) {
      saveError = err instanceof ApiError ? err.message : $t.common.loadError;
    } finally {
      saving = false;
    }
  }

  type Risk = { risk: number; bad: boolean };

  function riskOf(id: string): Risk {
    return stats[id] ?? { risk: 0, bad: false };
  }

  // Heurística documentada: riesgo = tasa de inasistencia + 0.1 por cada
  // Tipo 3; malo = algún Tipo 3 o asistencia < 75%.
  async function loadStats(): Promise<boolean> {
    try {
      const settled = await mapSettled(pool, 4, async (c) => {
        const known = stats[c.studentID];
        if (known) return { id: c.studentID, ...known };
        const r = await guarded(() => studentReport(c.studentID));
        const total =
          (r?.Presences ?? 0) + (r?.Absences ?? 0) + (r?.Excused ?? 0) + (r?.Evasions ?? 0) + (r?.Lates ?? 0);
        const rate = total > 0 ? (r?.Presences ?? 0) / total : 1;
        const severe = r?.WarningsSevere ?? 0;
        return { id: c.studentID, risk: 1 - rate + 0.1 * severe, bad: severe > 0 || rate < 0.75 };
      });
      const next: Record<string, Risk> = { ...stats };
      settled.forEach((res) => {
        if (res.status === 'fulfilled' && res.value) {
          next[res.value.id] = { risk: res.value.risk, bad: res.value.bad };
        }
      });
      stats = next;
      return true;
    } catch {
      return false;
    }
  }

  function deal(list: typeof pool, cols: number[], max: number): Record<string, number> {
    const counts = new Map<number, number>(cols.map((c) => [c, 0]));
    const out: Record<string, number> = {};
    let idx = 0;
    for (const c of list) {
      let tries = 0;
      while ((counts.get(cols[idx % cols.length]) ?? 0) >= max && tries < cols.length) {
        idx++;
        tries++;
      }
      let col = cols[idx % cols.length];
      if ((counts.get(col) ?? 0) >= max) {
        col = [...counts.entries()].sort((a, b) => a[1] - b[1])[0][0];
      }
      out[c.studentID] = col;
      counts.set(col, (counts.get(col) ?? 0) + 1);
      idx++;
    }
    return out;
  }

  async function suggest() {
    if (suggesting || pool.length === 0) return;
    suggesting = true;
    suggestNote = '';
    try {
      if (!(await loadStats())) {
        suggestNote = $t.common.loadError;
        return;
      }
      const lo = Math.max(1, Math.min(salonMin, salonMax));
      const hi = Math.max(1, Math.max(salonMin, salonMax));
      if (pool.length > salonCount * hi) {
        suggestNote = $t.cierre.distTooMany(pool.length, salonCount * hi);
        notify(suggestNote);
        return;
      }
      if (pool.length < salonCount * lo) {
        suggestNote = $t.cierre.distTooFew(pool.length, salonCount * lo);
        notify(suggestNote);
        return;
      }
      const byName = (a: (typeof pool)[number], b: (typeof pool)[number]) =>
        `${a.surnames} ${a.names}`.localeCompare(`${b.surnames} ${b.names}`, 'es');
      let assignment: Record<string, number>;
      let summary = '';
      if (suggestMode === 'balanced') {
        const ordered = [...pool].sort((a, b) => riskOf(b.studentID).risk - riskOf(a.studentID).risk);
        const cols = Array.from({ length: salonCount }, (_, i) => i);
        const fwd = deal(
          ordered.filter((_, i) => i % 2 === 0),
          cols,
          hi
        );
        const bwd = deal(ordered.filter((_, i) => i % 2 !== 0), [...cols].reverse(), hi);
        assignment = { ...fwd };
        for (const [k, v] of Object.entries(bwd)) assignment[k] = v;
        const risks = pool.map((c) => riskOf(c.studentID).risk);
        const avg = risks.reduce((n, r) => n + r, 0) / Math.max(1, risks.length);
        summary = $t.cierre.distBalancedNote(avg);
      } else {
        const good = pool.filter((c) => !riskOf(c.studentID).bad).sort(byName);
        const bad = pool.filter((c) => riskOf(c.studentID).bad).sort(byName);
        if (good.length === 0 || bad.length === 0) {
          assignment = deal([...pool].sort(byName), Array.from({ length: salonCount }, (_, i) => i), hi);
          summary = $t.cierre.distSplitFallback;
        } else {
          const kGood = Math.min(salonCount - 1, Math.max(1, Math.round((salonCount * good.length) / pool.length)));
          const g = deal(good, Array.from({ length: kGood }, (_, i) => i), hi);
          const b = deal(bad, Array.from({ length: salonCount - kGood }, (_, i) => i + kGood), hi);
          assignment = { ...g };
          for (const [k, v] of Object.entries(b)) assignment[k] = v;
          summary = $t.cierre.distSplitNote(good.length, bad.length);
        }
      }
      placed = assignment;
      selected = null;
      suggestNote = summary;
    } finally {
      suggesting = false;
    }
  }

  async function confirm() {
    if (saving) return;
    saveError = '';
    saving = true;
    try {
      // Confirmar no crea salones: usa los que ya existen (botón aparte).
      const have = await destSalons();
      const salons: string[] = [];
      for (let i = 1; i <= salonCount; i++) {
        const found = have.find((g) => g.GroupNo === i);
        if (!found) {
          saveError = $t.cierre.distNeedSalons;
          saving = false;
          return;
        }
        salons.push(found.GroupID);
      }
      // Cada ubicado queda con decisión y matrícula donde se decidió;
      // lo idéntico a lo ya guardado se omite para no duplicar.
      let done = 0;
      for (const c of pool) {
        const col = placed[c.studentID];
        if (col === undefined) continue;
        const toGroupID = salons[col];
        if (!toGroupID) continue;
        const key = c.studentID + '|' + c.fromGroupID;
        const prev = recorded[key];
        const want: PromotionDecision = c.decision === 'graduate' ? 'graduate' : c.fromGrade === targetGrade ? 'repeat' : 'promote';
        if (prev && prev.decision === want && prev.toGroupID === toGroupID) {
          done += 1;
          continue;
        }
        const rec = await guarded(() =>
          recordPromotion({
            studentID: c.studentID,
            fromGroupID: c.fromGroupID,
            ...(want === 'graduate' ? {} : { toGroupID }),
            decision: want
          })
        );
        if (!rec) {
          saveError = $t.common.loadError;
          break;
        }
        done += 1;
      }
      notify($t.cierre.distConfirmed(done));
      placed = {};
      selected = null;
      await load();
    } catch (err) {
      saveError = err instanceof ApiError ? err.message : $t.common.loadError;
    } finally {
      saving = false;
    }
  }
</script>

<AdminShell active="cierre" year={currentYear}>
  <TopBar title={$t.cierre.distTitle} showBack onBack={() => goBack('/admin/cierre')}><TopActions /></TopBar>

  <div class="pagehead">
    <p class="eyebrow">{$t.admin.consoleEyebrow}</p>
    <div class="tabs" role="tablist" aria-label={$t.cierre.distTitle}>
      <button type="button" role="tab" aria-selected={tab === 'pass'} class:on={tab === 'pass'} on:click={() => (tab = 'pass')}>
        {$t.cierre.distPassTab}
      </button>
      <button type="button" role="tab" aria-selected={tab === 'place'} class:on={tab === 'place'} on:click={() => (tab = 'place')}>
        {$t.cierre.distPlaceTab}
      </button>
    </div>
  </div>

  <div class="sheet">
    {#if state === 'loading'}
      <Skeleton rows={5} />
    {:else if state === 'error'}
      <ErrorState error={loadError} onRetry={load} />
    {:else if tab === 'pass'}
      <div class="pickers">
        <Dropdown
          label={$t.cierre.groupLabel}
          value={srcGroupID}
          options={srcGroups.map((g) => ({ value: g.GroupID, label: g.ClassLabel }))}
          on:select={(e) => (srcGroupID = String(e.detail))}
        />
      </div>
      {#if srcChoices.length === 0}
        <EmptyState icon="users" title={$t.cierre.distNoStudents} body={$t.cierre.distNoStudentsBody} />
      {:else}
        <ul class="prows">
          {#each srcChoices as c (c.studentID)}
            <li>
              <span class="who"><strong>{c.surnames}, {c.names}</strong></span>
              <span class="seg" role="group" aria-label={`${c.surnames} ${c.names}`}>
                <button
                  type="button"
                  class:present={c.decision !== 'repeat'}
                  aria-pressed={c.decision !== 'repeat'}
                  on:click={() => setChoice(c, true)}
                >{passLabel(c.fromGrade)}</button>
                <button
                  type="button"
                  class:absent={c.decision === 'repeat'}
                  aria-pressed={c.decision === 'repeat'}
                  on:click={() => setChoice(c, false)}
                >{$t.cierre.distFail}</button>
              </span>
            </li>
          {/each}
        </ul>
        <div class="confirmbar">
          <button type="button" class="primary" disabled={saving} on:click={saveDecisions}>
            {saving ? $t.common.retrying : $t.cierre.distSaveDecisions}
          </button>
        </div>
        {#if rowsSaved >= 0}<p class="note" role="status">{$t.cierre.distDecisionsSaved(rowsSaved)}</p>{/if}
      {/if}
    {:else}
      <div class="pickers">
        <Dropdown
          label={$t.cierre.distGradeLabel}
          value={String(targetGrade)}
          options={Array.from({ length: 11 }, (_, i) => ({ value: String(i + 1), label: gradeLabel(i + 1) }))}
          on:select={(e) => onGradeChange(Number(e.detail))}
        />
        <div class="stepper" role="group" aria-label={$t.cierre.distSalonsLabel}>
          <button type="button" aria-label="−" disabled={salonCount <= 1} on:click={() => (salonCount = Math.max(1, salonCount - 1))}>‹</button>
          <strong>{$t.cierre.distSalons(salonCount)}</strong>
          <button type="button" aria-label="+" disabled={salonCount >= 8} on:click={() => (salonCount = Math.min(8, salonCount + 1))}>›</button>
        </div>
      </div>
      <div class="suggestbox">
        <div class="seg" role="group" aria-label={$t.cierre.distModeLabel}>
          <button type="button" class:on={suggestMode === 'balanced'} aria-pressed={suggestMode === 'balanced'} on:click={() => (suggestMode = 'balanced')}>
            {$t.cierre.distModeBalanced}
          </button>
          <button type="button" class:on={suggestMode === 'split'} aria-pressed={suggestMode === 'split'} on:click={() => (suggestMode = 'split')}>
            {$t.cierre.distModeSplit}
          </button>
        </div>
        <label class="minmax">
          <span>{$t.cierre.distMin}</span>
          <input type="number" min="1" max="200" bind:value={salonMin} />
        </label>
        <label class="minmax">
          <span>{$t.cierre.distMax}</span>
          <input type="number" min="1" max="200" bind:value={salonMax} />
        </label>
        <button type="button" class="mini" disabled={suggesting || pool.length === 0} on:click={suggest}>
          {suggesting ? $t.common.retrying : $t.cierre.distSuggest}
        </button>
        <button type="button" class="mini" disabled={saving} on:click={createSalons}>
          {$t.cierre.distCreate}
        </button>
      </div>
      {#if suggestNote}<p class="note" role="status">{suggestNote}</p>{/if}
      <label class="search">
        <Icon name="search" />
        <input type="search" placeholder={$t.cierre.distSearch} aria-label={$t.cierre.distSearch} bind:value={search} />
      </label>
      {#if pool.length === 0}
        <EmptyState icon="users" title={$t.cierre.distEmptyPool} body={$t.cierre.distEmptyPoolBody} />
      {:else}
        <div class="board">
          <section class="col pool" aria-label={$t.cierre.distPool}>
            <h3>{$t.cierre.distPool} ({unplaced.length})</h3>
            <ul>
              {#each unplaced as c (c.studentID)}
                <li>
                  <button
                    type="button"
                    class:selected={selected === c.studentID}
                    draggable="true"
                    on:dragstart={(e) => {
                      selected = c.studentID;
                      e.dataTransfer?.setData('text/student-id', c.studentID);
                    }}
                    on:click={() => (selected = selected === c.studentID ? null : c.studentID)}
                  >
                    <strong>{c.surnames}, {c.names}</strong>
                    <small>{gradeLabel(c.fromGrade)}</small>
                  </button>
                </li>
              {/each}
            </ul>
          </section>
          {#each cols as col}
            {@const list = placedIn(col)}
            <section
              class="col"
              class:over={dragOverCol === col}
              aria-label={`${targetGrade}-${col + 1}`}
              on:dragover={(e) => {
                e.preventDefault();
                dragOverCol = col;
              }}
              on:dragleave={() => (dragOverCol = null)}
              on:drop={(e) => onDrop(col, e)}
            >
              <div class="colhead">
                <h3>{targetGrade}-{col + 1} ({list.length})</h3>
                {#if selected && pool.some((c) => c.studentID === selected)}
                  <button type="button" class="mini" on:click={() => selected && place(selected, col)}>
                    {$t.cierre.distPlaceHere}
                  </button>
                {/if}
              </div>
              <ul>
                {#each list as c (c.studentID)}
                  <li>
                    <span class="placed">
                      <strong>{c.surnames}, {c.names}</strong>
                      <button type="button" class="x" aria-label={$t.common.unplace} on:click={() => unplace(c.studentID)}>×</button>
                    </span>
                  </li>
                {/each}
              </ul>
            </section>
          {/each}
        </div>
        {#if saveError}<p class="error" role="alert">{saveError}</p>{/if}
        <div class="confirmbar">
          <button type="button" class="primary" disabled={saving} on:click={confirm}>
            {saving ? $t.common.retrying : $t.cierre.distConfirm}
          </button>
        </div>
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
    margin-bottom: 8px;
  }
  .tabs {
    display: inline-flex;
    gap: 2px;
    background: var(--tint);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 3px;
    align-self: flex-start;
  }
  .tabs button {
    padding: 8px 20px;
    min-height: 44px;
    color: var(--muted);
    font-size: 0.84rem;
    font-weight: 600;
    border-radius: 9px;
  }
  .tabs button.on {
    background: var(--surface);
    color: var(--ink);
    box-shadow: var(--shadow);
  }
  .sheet {
    background: var(--surface);
    border: 1px solid var(--line);
    border-bottom: 0;
    border-radius: 24px 24px 0 0;
    padding: 20px 18px 130px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .pickers {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    align-items: end;
  }
  .stepper {
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 6px 10px;
    min-height: 52px;
  }
  .stepper button {
    width: 40px;
    height: 40px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: var(--surface);
    font-size: 1.2rem;
    line-height: 1;
  }
  .stepper button:disabled {
    opacity: 0.4;
  }
  .stepper strong {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .search {
    display: flex;
    gap: 8px;
    align-items: center;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 9px 12px;
    color: var(--muted);
    min-height: 48px;
  }
  .search input {
    border: 0;
    background: none;
    outline: none;
    width: 100%;
    color: var(--ink);
    font-size: 0.88rem;
  }
  .prows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .prows li {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 10px 12px;
  }
  .who {
    flex: 1;
    min-width: 180px;
  }
  .who strong {
    overflow-wrap: anywhere;
  }
  .seg {
    flex: 1 1 220px;
    display: flex;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 4px;
    gap: 4px;
  }
  .seg button {
    flex: 1;
    min-height: 44px;
    padding: 6px 10px;
    border-radius: var(--radius-pill);
    font-size: 0.82rem;
    font-weight: 700;
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
  .board {
    display: grid;
    grid-template-columns: minmax(220px, 280px) repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px;
    align-items: start;
  }
  .col {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    padding: 12px;
    min-height: 200px;
  }
  .col.over {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-soft);
  }
  .col h3 {
    font-size: 0.85rem;
    margin: 0;
    font-variant-numeric: tabular-nums;
  }
  .colhead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
  }
  .mini {
    border: 1px solid var(--line);
    border-radius: var(--radius-pill);
    padding: 6px 12px;
    min-height: 36px;
    font-weight: 600;
    font-size: 0.78rem;
    background: var(--surface);
  }
  .mini:disabled {
    opacity: 0.6;
  }
  .suggestbox {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: end;
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 12px 14px;
  }
  .suggestbox .seg {
    display: flex;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 4px;
    gap: 4px;
  }
  .suggestbox .seg button {
    min-height: 40px;
    padding: 6px 14px;
    border-radius: 999px;
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--muted);
    white-space: nowrap;
  }
  .suggestbox .seg button.on {
    background: var(--accent);
    color: #fff;
  }
  .minmax {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--ink-soft);
  }
  .minmax input {
    width: 76px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 8px 10px;
    min-height: 44px;
    font-size: 0.88rem;
    color: var(--ink);
  }
  .note {
    color: var(--ink-soft);
    font-size: 0.85rem;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 8px 12px;
  }
  .col ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 60px;
  }
  .col button:not(.x) {
    width: 100%;
    text-align: left;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 8px 10px;
    cursor: grab;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .col button:not(.x).selected {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-soft);
  }
  .col button:not(.x) strong {
    font-size: 0.82rem;
    overflow-wrap: anywhere;
  }
  .col button:not(.x) small {
    color: var(--muted);
    font-size: 0.72rem;
  }
  .placed {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 8px 10px;
  }
  .placed strong {
    flex: 1;
    min-width: 0;
    font-size: 0.82rem;
    overflow-wrap: anywhere;
  }
  .x {
    flex: none;
    width: 32px;
    height: 32px;
    border-radius: 999px;
    background: var(--surface);
    border: 1px solid var(--line);
    color: var(--muted);
    font-size: 1rem;
    line-height: 1;
  }
  .error {
    color: var(--danger);
    font-size: 0.9rem;
    font-weight: 600;
  }
  .confirmbar {
    display: flex;
    justify-content: flex-end;
    position: sticky;
    bottom: 12px;
  }
  .primary {
    background: var(--accent);
    color: #fff;
    font-weight: 700;
    min-height: 52px;
    padding: 10px 28px;
    border-radius: var(--radius-pill);
  }
  .primary:disabled {
    opacity: 0.6;
  }
</style>
