<script lang="ts">
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { t } from '$lib/i18n';
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import TeacherShell from './TeacherShell.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import { classRoster, isMissing, getObservationCatalog, recordObservation } from './api';
  import type { Situation } from './api';
  import { resolveId } from '$lib/slug';
  import type { RosterEntry } from '$lib/api/types';
  import { guarded, goBack } from '$lib/nav';
  import { ApiError } from '$lib/api/types';
  import { situationText, kindChip, todayISO } from './situations';

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
  $: preselectedStudent = queryParam('estudiante');

  function humanize(slug: string): string {
    const clean = slug.replace(/[-_]+/g, ' ').trim();
    return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : '';
  }

  // Origen honesto: solo lo que trae la ruta. Sin nómina del backend no
  // hay formulario: vacío honesto en vez de lista falsa.
  $: originLabel = humanize(subjectParam) ? `${humanize(subjectParam)} · ${groupID}` : groupID;

  let loading = true;
  let roster: RosterEntry[] = [];

  let studentID = '';
  // La situación manda: el servidor decide el tipo.
  let catalog: Situation[] = [];
  let situationID = '';
  let note = '';
  let date = todayISO();

  $: textOf = (id: string) => situationText($t.obs.situations, id);
  $: chosenKind = catalog.find((s) => s.ID === situationID)?.Kind ?? 0;

  let saving = false;
  let saved = false;
  let feedback = '';
  let feedbackError = false;

  function bySurname(a: RosterEntry, b: RosterEntry): number {
    const x = `${a.Surnames} ${a.Names}`.toLowerCase();
    const y = `${b.Surnames} ${b.Names}`.toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  }

  function studentLabel(r: RosterEntry): string {
    return `${r.StudentID}  ${r.Surnames}, ${r.Names} (${groupID})`;
  }

  async function load() {
    loading = true;
    try {
      groupID = await resolveId(decodeURIComponent(params.groupID ?? ''));
      try {
        catalog = (await getObservationCatalog()) ?? [];
      } catch {
        catalog = [];
      }
      const data = await guarded(() => classRoster(groupID));
      if (data === null) return;
      roster = [...data].sort(bySurname);
    } catch {
      // Backend sin nómina todavía (404 o error): vacío honesto.
      roster = [];
    } finally {
      const wanted = preselectedStudent || roster[0]?.StudentID || '';
      studentID = roster.some((r) => r.StudentID === wanted) ? wanted : roster[0]?.StudentID ?? '';
      loading = false;
    }
  }

  onMount(load);

  function detailHref(): string {
    const q = subjectParam ? `?materia=${encodeURIComponent(subjectParam)}` : '';
    return `/clase/${encodeURIComponent(groupID)}${q}`;
  }

  $: valid = situationID.length > 0 && studentID.length > 0 && roster.length > 0;

  async function save() {
    feedback = '';
    feedbackError = false;
    saved = false;
    if (!valid || saving) return;
    saving = true;
    try {
      await recordObservation({
        studentID,
        classGroupID: groupID || undefined,
        situationID,
        note: note.trim() || undefined,
        date: date || undefined
      });
      saved = true;
      feedback = $t.obs.saved;
    } catch (err) {
      if (err instanceof ApiError && isMissing(err)) {
        // Backend sin ruta todavía: se dice, no se finge el guardado.
        feedbackError = true;
        feedback = $t.warning.pendingBackend;
      } else {
        feedbackError = true;
        feedback = err instanceof ApiError ? err.message : $t.common.loadError;
      }
    } finally {
      saving = false;
    }
  }
</script>

<TeacherShell active="agenda">
  <div class="warning">
  <TopBar title={$t.obs.formTitle} subtitle={originLabel} showBack onBack={() => goBack(detailHref())}><TopActions /></TopBar>

  <div class="sheet">
    {#if loading}
      <Skeleton rows={5} />
    {:else if roster.length === 0}
      <EmptyState
        icon="users"
        title={$t.warning.noRosterTitle}
        body={$t.warning.noRosterBody}
        actionLabel={$t.common.retry}
        onAction={load}
      />
    {:else}
      <div class="grid">
        <aside class="card origin">
          <p class="tag">{$t.warning.originTag}</p>
          <h2>{originLabel}</h2>
          <p class="note"><span class="ibadge"><Icon name="list" /></span> {$t.warning.originNote}</p>
        </aside>

        <section class="card form">
          <label class="field">
            <span class="label">{$t.obs.fSituation} *</span>
            <span class="select-wrap">
              <select bind:value={situationID} aria-label={$t.obs.fSituation}>
                <option value="">{`— ${$t.obs.pickSituation} —`}</option>
                <optgroup label={$t.obs.situationGroupOne}>
                  {#each catalog.filter((s) => s.Kind === 1) as s (s.ID)}
                    <option value={s.ID}>{s.ID} · {textOf(s.ID)}</option>
                  {/each}
                </optgroup>
                <optgroup label={$t.obs.situationGroupTwo}>
                  {#each catalog.filter((s) => s.Kind === 2) as s (s.ID)}
                    <option value={s.ID}>{s.ID} · {textOf(s.ID)}</option>
                  {/each}
                </optgroup>
                <optgroup label={$t.obs.situationGroupThree}>
                  {#each catalog.filter((s) => s.Kind === 3) as s (s.ID)}
                    <option value={s.ID}>{s.ID} · {textOf(s.ID)}</option>
                  {/each}
                </optgroup>
              </select>
              <span class="chev" aria-hidden="true"><Icon name="next" /></span>
            </span>
          </label>
          {#if chosenKind}
            <p class="hint">
              <span class={`chip ${kindChip(chosenKind)}`}>{$t.obs.kindLabel[chosenKind]}</span>
              <small>{$t.obs.kindIntro[chosenKind]}</small>
            </p>
          {/if}

          <label class="field">
            <span class="label">{$t.warning.studentLabel} *</span>
            <span class="select-wrap">
              <select bind:value={studentID} aria-label={$t.warning.studentLabel}>
                {#each roster as r (r.StudentID)}
                  <option value={r.StudentID}>{studentLabel(r)}</option>
                {/each}
              </select>
              <span class="chev" aria-hidden="true"><Icon name="next" /></span>
            </span>
          </label>

          <label class="field">
            <span class="label">{$t.obs.fNote}</span>
            <textarea rows={6} bind:value={note} placeholder={$t.obs.notePlaceholder}></textarea>
          </label>

          <label class="field">
            <span class="label">{$t.obs.fDate}</span>
            <input type="date" bind:value={date} max={todayISO()} aria-label={$t.obs.fDate} />
          </label>

          {#if feedback}
            <p class="flash" class:error={feedbackError} role="status">{feedback}</p>
            {#if saved}
              <button type="button" class="link" on:click={() => push(detailHref())}>
                {$t.warning.backToDetail}
              </button>
            {/if}
          {/if}

          <div class="actions">
            <button type="button" class="btn" on:click={() => push(detailHref())}>{$t.obs.cancel}</button>
            <button type="button" class="btn btn-primary" disabled={!valid || saving} on:click={save}>
              {saving ? $t.obs.saving : $t.obs.save}
            </button>
          </div>
        </section>
      </div>
    {/if}
  </div>
</div>

</TeacherShell>

<style>
  .warning {
    margin: 0 auto;
    max-width: 1440px;
    min-width: 0;
    color: var(--ink);
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
  .origin h2 {
    font-size: 1.05rem;
    font-weight: 600;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--line);
    margin-bottom: 10px;
    overflow-wrap: anywhere;
  }
  .note {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    color: var(--ink-soft);
    font-size: 0.82rem;
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
  .form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .label {
    font-size: 0.88rem;
    font-weight: 700;
  }
  .select-wrap {
    position: relative;
    display: block;
  }
  .select-wrap select {
    width: 100%;
    appearance: none;
    background: var(--surface);
    border: 1px solid var(--control);
    border-radius: var(--radius-control);
    padding: 0 40px 0 12px;
    font-size: 0.85rem;
    color: var(--ink);
    min-height: var(--control-height);
  }
  .select-wrap select:focus {
    outline: none;
    border-color: var(--accent);
  }
  .chev {
    position: absolute;
    right: 14px;
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
  input[type='date'] {
    width: 100%;
    background: var(--surface);
    border: 1px solid var(--control);
    border-radius: var(--radius-control);
    padding: 0 12px;
    font-size: 0.85rem;
    color: var(--ink);
    min-height: var(--control-height);
    font-family: inherit;
  }
  .form textarea {
    background: var(--surface);
    border: 1px solid var(--control);
    border-radius: var(--radius-control);
    padding: 10px 12px;
    font-size: 0.85rem;
    line-height: 1.5;
    width: 100%;
    resize: vertical;
    min-height: 120px;
    color: var(--ink);
  }
  .form textarea:focus {
    outline: none;
    border-color: var(--accent);
  }
  .flash {
    background: var(--tint);
    color: var(--ink);
    font-weight: 600;
    font-size: 0.88rem;
    border-radius: var(--radius-chip);
    padding: 10px 14px;
  }
  .flash.error {
    background: var(--g-grave-bg);
    color: var(--g-grave-ink);
  }
  .link {
    align-self: flex-start;
    color: var(--accent);
    font-weight: 600;
    font-size: 0.84rem;
    padding: 6px 0;
  }
  .link:hover {
    text-decoration: underline;
  }
  .actions {
    display: flex;
    gap: 8px;
    margin-top: 6px;
    padding-top: 10px;
    border-top: 1px solid var(--line);
    justify-content: flex-end;
    flex-wrap: wrap;
  }
  @media (min-width: 720px) {
    .grid {
      grid-template-columns: 280px minmax(0, 1fr);
    }
  }
</style>
