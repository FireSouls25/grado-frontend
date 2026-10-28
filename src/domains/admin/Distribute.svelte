<script lang="ts">
  import { onMount } from 'svelte';
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

  function passLabel(grade: number): string {
    return grade === 11 ? $t.cierre.distGraduate : $t.cierre.distPass;
  }

  function loadPersisted() {
    try {
      const n = Number(localStorage.getItem(`grado.distrib.salons.${destYear}.${targetGrade}`));
      if (Number.isInteger(n) && n >= 1 && n <= 8) salonCount = n;
      const g = Number(localStorage.getItem(`grado.distrib.grade.${destYear}`));
      if (Number.isInteger(g) && g >= 1 && g <= 11) targetGrade = g;
    } catch {
      /* sin almacenamiento: valores por defecto */
    }
  }

  function persist() {
    try {
      localStorage.setItem(`grado.distrib.salons.${destYear}.${targetGrade}`, String(salonCount));
      localStorage.setItem(`grado.distrib.grade.${destYear}`, String(targetGrade));
    } catch {
      /* sin almacenamiento: la sesión sigue funcionando */
    }
  }

  $: {
    // Recuerda la última elección por año y grado.
    salonCount;
    targetGrade;
    if (state === 'ready') persist();
  }

  onMount(load);

  async function load() {
    state = 'loading';
    loadError = null;
    choices = {};
    recorded = {};
    placed = {};
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

  async function confirm() {
    if (saving) return;
    saveError = '';
    saving = true;
    try {
      // Los salones existen o se crean numerados 1..N.
      const destGroups = await guarded(() => groupsByYear(destYear));
      if (!destGroups) return;
      const have = destGroups
        .filter((g) => g.Grade === targetGrade)
        .sort((a, b) => a.GroupNo - b.GroupNo);
      const salons: string[] = [];
      for (let i = 1; i <= salonCount; i++) {
        const found = have.find((g) => g.GroupNo === i);
        if (found) {
          salons.push(found.GroupID);
          continue;
        }
        const created = await guarded(() =>
          createClassGroup({ year: destYear, grade: targetGrade, groupNo: i })
        );
        if (!created) {
          saveError = $t.common.loadError;
          saving = false;
          return;
        }
        salons.push(created.GroupID);
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
      {/if}
    {:else}
      <div class="pickers">
        <Dropdown
          label={$t.cierre.distGradeLabel}
          value={String(targetGrade)}
          options={Array.from({ length: 11 }, (_, i) => ({ value: String(i + 1), label: gradeLabel(i + 1) }))}
          on:select={(e) => {
            targetGrade = Number(e.detail);
            selected = null;
          }}
        />
        <div class="stepper" role="group" aria-label={$t.cierre.distSalonsLabel}>
          <button type="button" aria-label="−" disabled={salonCount <= 1} on:click={() => (salonCount = Math.max(1, salonCount - 1))}>‹</button>
          <strong>{salonCount} {$t.cierre.distSalons(salonCount)}</strong>
          <button type="button" aria-label="+" disabled={salonCount >= 8} on:click={() => (salonCount = Math.min(8, salonCount + 1))}>›</button>
        </div>
      </div>
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
