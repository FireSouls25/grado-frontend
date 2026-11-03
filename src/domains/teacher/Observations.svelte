<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n';
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ErrorState from '$lib/ui/ErrorState.svelte';
  import TeacherTabs from './TeacherTabs.svelte';
  import {
    daySchedule,
    classRoster,
    getObservationCatalog,
    myObservations,
    recordObservation,
    isMissing,
    type Situation,
    type ObservationRow
  } from './api';
  import { guarded } from '$lib/nav';
  import { ApiError } from '$lib/api/types';
  import type { RosterEntry } from '$lib/api/types';

  type KindFilter = 0 | 1 | 2 | 3; // 0 = Todas

  // Textos de las situaciones ordenados como el manual: el id s{tipo}-{n}
  // se resuelve con el bloque del tipo y la posición n (1-based).
  const kindSize: Record<number, number> = { 1: 14, 2: 43, 3: 8 };
  const situations: string[] = $t.obs.situations;
  function situationText(id: string): string {
    const m = /^s([123])-(\d+)$/.exec(id);
    if (!m) return '';
    const kind = Number(m[1]);
    const n = Number(m[2]);
    const offset = kind === 1 ? 0 : kind === 2 ? 14 : 57;
    if (n < 1 || n > (kindSize[kind] ?? 0)) return '';
    return situations[offset + n - 1] ?? '';
  }

  // Paleta de severidad del proyecto: tipo I chip-sky (leve), II
  // chip-yellow (medio), III chip-pink (grave). Nunca colores nuevos.
  function kindChip(kind: number): 'chip-sky' | 'chip-yellow' | 'chip-pink' {
    return kind === 3 ? 'chip-pink' : kind === 2 ? 'chip-yellow' : 'chip-sky';
  }

  let loading = true;
  let loadError: unknown = null;
  let rows: ObservationRow[] = [];
  let filter: KindFilter = 0;

  // Formulario de registro (paso el docente por clase del día).
  let creating = false;
  let catalog: Situation[] = [];
  let classID = '';
  let studentID = '';
  let situationID = '';
  let note = '';
  let date = todayISO();
  let loadingRoster = false;
  let roster: RosterEntry[] = [];
  let saving = false;
  let feedback = '';
  let feedbackError = false;

  function todayISO(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  interface AgendaClass {
    GroupID: string;
    ClassLabel: string;
    SubjectName: string;
  }
  let dayScheduleClasses: AgendaClass[] = [];

  $: visible =
    filter === 0 ? rows : rows.filter((r) => r.Kind === filter);

  $: countLabel = $t.obs.count(visible.length);

  $: chosenSituationKind = catalog.find((s) => s.ID === situationID)?.Kind ?? 0;

  $: valid = studentID.length > 0 && situationID.length > 0;

  async function load() {
    loading = true;
    loadError = null;
    try {
      const data = await guarded(() => myObservations());
      if (data === null) {
        loading = false;
        return;
      }
      rows = data;
    } catch (err) {
      if (err instanceof ApiError && isMissing(err)) {
        // Backend sin ruta todavía: vacío honesto, no error.
        rows = [];
      } else {
        loadError = err;
      }
    } finally {
      loading = false;
    }
  }

  async function loadClasses() {
    try {
      const weekday = new Date().getDay() >= 1 && new Date().getDay() <= 5 ? new Date().getDay() : 1;
      const list = await guarded(() => daySchedule(weekday));
      dayScheduleClasses = (list ?? []).map((c) => ({
        GroupID: c.GroupID,
        ClassLabel: c.ClassLabel,
        SubjectName: c.SubjectName
      }));
    } catch {
      // Sin horario del día igual se puede registrar: la clase es opcional
      // en el backend, pero ofrecemos primero las reales del docente.
      dayScheduleClasses = [];
    }
  }

  async function openForm() {
    creating = true;
    feedback = '';
    feedbackError = false;
    if (catalog.length === 0) {
      try {
        catalog = await guarded(() => getObservationCatalog()) ?? [];
      } catch {
        catalog = [];
      }
    }
    if (dayScheduleClasses.length === 0) await loadClasses();
    if (!classID && dayScheduleClasses.length > 0) classID = dayScheduleClasses[0].GroupID;
    if (classID) await loadRoster();
  }

  function closeForm() {
    creating = false;
    feedback = '';
    studentID = '';
    situationID = '';
    note = '';
    date = todayISO();
    roster = [];
  }

  async function loadRoster() {
    if (!classID) {
      roster = [];
      studentID = '';
      return;
    }
    loadingRoster = true;
    try {
      const data = await guarded(() => classRoster(classID));
      roster = [...(data ?? [])].sort(bySurname);
    } catch {
      roster = [];
    } finally {
      if (!roster.some((r) => r.StudentID === studentID)) {
        studentID = roster[0]?.StudentID ?? '';
      }
      loadingRoster = false;
    }
  }

  function bySurname(a: RosterEntry, b: RosterEntry): number {
    const x = `${a.Surnames} ${a.Names}`.toLowerCase();
    const y = `${b.Surnames} ${b.Names}`.toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  }

  function studentLabel(r: RosterEntry): string {
    return `${r.Surnames}, ${r.Names}`;
  }

  function classLabel(groupID: string): string {
    const c = dayScheduleClasses.find((x) => x.GroupID === groupID);
    return c ? c.ClassLabel : '';
  }

  function moment(isoDate: string): string {
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  async function save() {
    if (!situationID) {
      feedbackError = true;
      feedback = $t.obs.needSituation;
      return;
    }
    if (!studentID) {
      feedbackError = true;
      feedback = $t.obs.needStudent;
      return;
    }
    saving = true;
    feedback = '';
    feedbackError = false;
    try {
      const created = await recordObservation({
        studentID,
        classGroupID: classID || undefined,
        situationID,
        note: note.trim() || undefined,
        date
      });
      // El backend devuelve la fila ya doblada con nombres y tipo.
      rows = [created, ...rows];
      feedback = $t.obs.saved;
      studentID = '';
      situationID = '';
      note = '';
    } catch (err) {
      feedbackError = true;
      feedback = err instanceof ApiError ? err.message : $t.common.loadError;
    } finally {
      saving = false;
    }
  }

  onMount(() => {
    void load();
    void loadClasses();
  });
</script>

<div class="obs">
  <TopBar title={$t.app.name}><TopActions /></TopBar>

  <div class="pagehead">
    <p class="eyebrow">{$t.obs.eyebrow}</p>
    <h1 class="title">{$t.obs.title}</h1>
    <p class="muted">{$t.obs.subtitle}</p>
    <div class="controlbar">
      {#if !creating}
        <button type="button" class="primary" on:click={openForm}>
          <Icon name="plus" /> {$t.obs.newAction}
        </button>
      {/if}
    </div>
  </div>

  <div class="sheet">
    <!-- Filtros: tres botones de tipo, tal como pidió el docente. -->
    <div class="filters" role="group" aria-label={$t.obs.filterLabel}>
      <button
        type="button"
        class="fbtn"
        class:selected={filter === 0}
        aria-pressed={filter === 0}
        on:click={() => (filter = 0)}
      >
        {$t.obs.filterAll}
      </button>
      {#each [1, 2, 3] as k (k)}
        <button
          type="button"
          class="fbtn {kindChip(k)}"
          class:selected={filter === k}
          aria-pressed={filter === k}
          on:click={() => (filter = k as KindFilter)}
        >
          {$t.obs.kindLabel[k]}
        </button>
      {/each}
      <span class="count" role="status">{countLabel}</span>
    </div>

    {#if creating}
      <section class="card form">
        <div class="formhead">
          <h2>{$t.obs.formTitle}</h2>
          <button type="button" class="ghost" on:click={closeForm} aria-label={$t.a11y.close}>
            <Icon name="close" />
          </button>
        </div>
        <p class="muted">{$t.obs.formNote}</p>

        <label class="field">
          <span class="label">{$t.obs.fClass}</span>
          <span class="select-wrap">
            <select bind:value={classID} aria-label={$t.obs.fClass} on:change={loadRoster}>
              <option value="">{$t.obs.pickClass}</option>
              {#each dayScheduleClasses as c (c.GroupID)}
                <option value={c.GroupID}>{c.ClassLabel} · {c.SubjectName}</option>
              {/each}
            </select>
            <span class="chev" aria-hidden="true"><Icon name="next" /></span>
          </span>
        </label>

        <label class="field">
          <span class="label">{$t.obs.fStudent} *</span>
          {#if loadingRoster}
            <Skeleton rows={1} />
          {:else if roster.length === 0}
            <p class="muted">{$t.obs.rosterEmpty}</p>
          {:else}
            <span class="select-wrap">
              <select bind:value={studentID} aria-label={$t.obs.fStudent}>
                {#each roster as r (r.StudentID)}
                  <option value={r.StudentID}>{studentLabel(r)}</option>
                {/each}
              </select>
              <span class="chev" aria-hidden="true"><Icon name="next" /></span>
            </span>
          {/if}
        </label>

        <label class="field">
          <span class="label">{$t.obs.fSituation} *</span>
          <span class="select-wrap">
            <select bind:value={situationID} aria-label={$t.obs.fSituation}>
              <option value="">{$t.obs.pickSituation}</option>
              <optgroup label={$t.obs.situationGroupOne}>
                {#each catalog.filter((s) => s.Kind === 1) as s (s.ID)}
                  <option value={s.ID}>{s.ID} · {situationText(s.ID)}</option>
                {/each}
              </optgroup>
              <optgroup label={$t.obs.situationGroupTwo}>
                {#each catalog.filter((s) => s.Kind === 2) as s (s.ID)}
                  <option value={s.ID}>{s.ID} · {situationText(s.ID)}</option>
                {/each}
              </optgroup>
              <optgroup label={$t.obs.situationGroupThree}>
                {#each catalog.filter((s) => s.Kind === 3) as s (s.ID)}
                  <option value={s.ID}>{s.ID} · {situationText(s.ID)}</option>
                {/each}
              </optgroup>
            </select>
            <span class="chev" aria-hidden="true"><Icon name="next" /></span>
          </span>
          {#if chosenSituationKind}
            <p class="hint">
              <span class={`chip ${kindChip(chosenSituationKind)}`}>{$t.obs.kindLabel[chosenSituationKind]}</span>
              <small>{$t.obs.kindIntro[chosenSituationKind]}</small>
            </p>
          {/if}
        </label>

        <label class="field">
          <span class="label">{$t.obs.fDate}</span>
          <input type="date" bind:value={date} max={todayISO()} aria-label={$t.obs.fDate} />
        </label>

        <!-- Nota adicional: burbuja lateral del listado; aquí es texto libre
             junto a la situación elegida. -->
        <label class="field">
          <span class="label">{$t.obs.fNote}</span>
          <textarea rows={4} bind:value={note} placeholder={$t.obs.notePlaceholder}></textarea>
        </label>

        {#if feedback}
          <p class="flash" class:error={feedbackError} role="status">{feedback}</p>
        {/if}

        <div class="actions">
          <button type="button" class="ghost" on:click={closeForm}>{$t.obs.cancel}</button>
          <button type="button" class="primary" disabled={!valid || saving} on:click={save}>
            {saving ? $t.obs.saving : $t.obs.save}
          </button>
        </div>
      </section>
    {/if}

    <h2 class="list-title">{$t.obs.title}</h2>

    {#if loading}
      <Skeleton rows={4} />
    {:else if loadError}
      <ErrorState error={loadError} onRetry={load} />
    {:else if visible.length === 0}
      {#if filter !== 0}
        <EmptyState icon="book" title={$t.obs.noMatchTitle} body={$t.obs.noMatchBody} />
      {:else}
        <EmptyState icon="book" title={$t.obs.emptyTitle} body={$t.obs.emptyBody} />
      {/if}
    {:else}
      <ol class="bubbles">
        {#each visible as r (r.ID)}
          {@const text = situationText(r.SituationID)}
          <li class="bubble">
            <span class={`chip ${kindChip(r.Kind)}`}>{$t.obs.kindLabel[r.Kind]}</span>
            <div class="btext">
              <strong>{text || r.SituationID}</strong>
              <small>{moment(r.Date)} · {r.StudentName}{#if r.ClassLabel} · {r.ClassLabel}{/if}</small>
            </div>
            {#if r.Note}
              <div class="sidebub">
                <span class="stag">{$t.obs.noteSideTitle}</span>
                {r.Note}
              </div>
            {/if}
          </li>
        {/each}
      </ol>
    {/if}
  </div>
</div>

<TeacherTabs active="observaciones" />

<style>
  .obs {
    min-height: 100vh;
    min-height: 100svh;
    background: var(--bg);
    color: var(--ink);
    /* Reserva para la barra inferior fija, no espacio muerto. */
    padding-bottom: calc(96px + env(safe-area-inset-bottom));
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
    margin-bottom: 6px;
  }
  .muted {
    color: var(--muted);
    font-size: 0.85rem;
  }
  .controlbar {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-top: 10px;
  }
  .primary {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--ink);
    color: var(--bg);
    border: 0;
    border-radius: var(--radius-pill);
    padding: 10px 16px;
    font-size: 0.85rem;
    font-weight: 600;
    min-height: 44px;
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
  /* Filtros tipo segmentado: los tres botones de tipo y "Todas". */
  .filters {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  .fbtn {
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--ink-soft);
    border-radius: var(--radius-pill);
    padding: 9px 14px;
    font-size: 0.78rem;
    font-weight: 600;
    min-height: 44px;
  }
  .fbtn.selected {
    background: var(--ink);
    color: var(--bg);
    border-color: var(--ink);
  }
  .count {
    color: var(--muted);
    font-size: 0.76rem;
    font-variant-numeric: tabular-nums;
    margin-left: auto;
  }
  .list-title {
    font-size: 1.05rem;
    font-weight: 650;
    letter-spacing: -0.01em;
    margin-top: 4px;
  }
  /* Burbujas: principal con la situación y chip del tipo; la nota adicional
     viaja como burbuja lateral pegada a la principal. */
  .bubbles {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .bubble {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 18px 18px 18px 6px;
    padding: 12px 14px 10px;
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 8px;
    align-items: start;
  }
  .btext {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .btext strong {
    font-weight: 550;
    line-height: 1.35;
  }
  .btext small {
    color: var(--muted);
    font-size: 0.74rem;
  }
  .sidebub {
    grid-column: 2;
    background: var(--tint);
    border: 1px solid var(--line);
    border-radius: 12px 12px 12px 2px;
    padding: 8px 10px;
    font-size: 0.8rem;
    color: var(--ink-soft);
    line-height: 1.35;
  }
  .stag {
    display: inline-block;
    color: var(--muted);
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    margin-right: 6px;
  }
  /* Formulario */
  .card {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    padding: 16px;
  }
  .formhead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .formhead h2 {
    font-size: 1.05rem;
    font-weight: 650;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 10px;
  }
  .field .label {
    font-size: 0.78rem;
    font-weight: 650;
    color: var(--ink-soft);
  }
  .field input,
  .field textarea {
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--surface);
    color: var(--ink);
    padding: 10px 12px;
    font: inherit;
    font-size: 0.85rem;
    min-height: 44px;
  }
  .field textarea {
    resize: vertical;
    min-height: 96px;
  }
  .select-wrap {
    position: relative;
    display: block;
  }
  .select-wrap select {
    width: 100%;
    appearance: none;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--surface);
    color: var(--ink);
    padding: 10px 36px 10px 12px;
    font: inherit;
    font-size: 0.85rem;
    min-height: 44px;
  }
  .chev {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%) rotate(90deg);
    color: var(--muted);
    pointer-events: none;
    display: inline-flex;
  }
  .hint {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 2px 0 0;
  }
  .hint small {
    color: var(--muted);
  }
  .flash {
    background: var(--chip-green-bg);
    color: var(--chip-green-ink);
    border-radius: 12px;
    padding: 9px 12px;
    font-size: 0.8rem;
  }
  .flash.error {
    background: var(--chip-pink-bg);
    color: var(--chip-pink-ink);
  }
  .actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-top: 12px;
  }
  .ghost {
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--ink-soft);
    border-radius: var(--radius-pill);
    padding: 9px 14px;
    font-size: 0.8rem;
    font-weight: 600;
    min-height: 44px;
  }
</style>
