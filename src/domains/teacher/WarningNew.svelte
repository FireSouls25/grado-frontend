<script lang="ts">
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { t } from '$lib/i18n';
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import TeacherTabs from './TeacherTabs.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import { classRoster, isMissing, issueWarnings } from './api';
  import type { RosterEntry } from '$lib/api/types';
  import { guarded } from '$lib/nav';
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

  let title = '';
  let studentID = '';
  let gravity: 'mild' | 'moderate' | 'severe' = 'mild';
  let description = '';

  $: titleOptions = [...$t.warning.titleOptions];
  $: if (!title && titleOptions.length > 0) title = titleOptions[0];
  $: if (!description) description = $t.warning.descDefault;

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

  function sevOf(g: typeof gravity): 'leve' | 'medio' | 'grave' {
    return g === 'severe' ? 'grave' : g === 'moderate' ? 'medio' : 'leve';
  }

  async function load() {
    loading = true;
    try {
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

  $: valid = title.trim().length > 0 && studentID.length > 0 && description.trim().length > 0 && roster.length > 0;

  async function save() {
    feedback = '';
    feedbackError = false;
    saved = false;
    if (!valid || saving) return;
    saving = true;
    try {
      const target = roster.find((r) => r.StudentID === studentID);
      const snapshots: Record<string, { names: string; surnames: string; documentID: string; classID: string }> = {};
      if (target) {
        snapshots[target.StudentID] = {
          names: target.Names,
          surnames: target.Surnames,
          documentID: target.DocumentID,
          classID: groupID
        };
      }
      await issueWarnings({
        studentIDs: target ? [target.StudentID] : [],
        classID: groupID,
        title: title.trim(),
        gravity,
        description: description.trim(),
        snapshots
      });
      saved = true;
      feedback = $t.warning.saved;
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

<div class="warning">
  <TopBar title={$t.app.name} showBack onBack={() => push(detailHref())}><TopActions /></TopBar>

  <div class="pagehead">
    <p class="crumbs">
      {$t.warning.breadcrumbHome} <span>›</span>
      {$t.warning.breadcrumbAgenda} <span>›</span>
      {$t.warning.breadcrumbDetail} <span>›</span>
      <strong>{$t.warning.breadcrumbHere}</strong>
    </p>
    <p class="eyebrow">{$t.warning.eyebrow}</p>
    <h1 class="title">{$t.warning.title}</h1>
  </div>

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
            <span class="label">{$t.warning.titleLabel} *</span>
            <span class="select-wrap">
              <select bind:value={title} aria-label={$t.warning.titleLabel}>
                {#each titleOptions as opt}
                  <option value={opt}>{opt}</option>
                {/each}
              </select>
              <span class="chev" aria-hidden="true"><Icon name="next" /></span>
            </span>
          </label>

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

          <div class="field">
            <span class="label" id="severity-label">{$t.warning.severityLabel} *</span>
            <div class="seg" role="group" aria-labelledby="severity-label">
              <button
                type="button"
                class="sevpill leve"
                class:selected={gravity === 'mild'}
                aria-pressed={gravity === 'mild'}
                on:click={() => (gravity = 'mild')}
              >
                <i aria-hidden="true"></i>{$t.warning.severityMild}
              </button>
              <button
                type="button"
                class="sevpill medio"
                class:selected={gravity === 'moderate'}
                aria-pressed={gravity === 'moderate'}
                on:click={() => (gravity = 'moderate')}
              >
                <i aria-hidden="true"></i>{$t.warning.severityModerate}
              </button>
              <button
                type="button"
                class="sevpill grave"
                class:selected={gravity === 'severe'}
                aria-pressed={gravity === 'severe'}
                on:click={() => (gravity = 'severe')}
              >
                <i aria-hidden="true"></i>{$t.warning.severitySevere}
              </button>
            </div>
            <p class="sevline">{$t.warning.severityLabel}: <span class={`sev ${sevOf(gravity)}`}><i aria-hidden="true"></i>{sevOf(gravity)}</span></p>
          </div>

          <label class="field">
            <span class="label">{$t.warning.descLabel} *</span>
            <textarea rows={6} bind:value={description} placeholder={$t.warning.descPlaceholder}></textarea>
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
            <button type="button" class="ghost" on:click={() => push(detailHref())}>{$t.warning.cancel}</button>
            <button type="button" class="primary" disabled={!valid || saving} on:click={save}>
              {saving ? $t.warning.saving : $t.warning.save}
            </button>
          </div>
        </section>
      </div>
    {/if}
  </div>
</div>

<TeacherTabs active="agenda" />

<style>
  .warning {
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
    color: var(--muted);
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    margin-bottom: 6px;
  }
  .origin h2 {
    font-size: 1.3rem;
    letter-spacing: -0.02em;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--line);
    margin-bottom: 14px;
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
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 13px 44px 13px 16px;
    font-size: 0.88rem;
    color: var(--ink);
    min-height: 44px;
  }
  .select-wrap select:focus {
    outline: 2px solid var(--accent);
    outline-offset: 0;
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
  .seg {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 6px;
  }
  .sevpill {
    min-height: 44px;
    border-radius: 8px;
    font-weight: 600;
    font-size: 0.85rem;
    color: var(--muted);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }
  .sevpill i {
    width: 8px;
    height: 8px;
    border-radius: var(--radius-pill);
    background: currentColor;
  }
  .sevpill.selected.leve {
    background: var(--g-leve-bg);
    color: var(--g-leve-ink);
  }
  .sevpill.selected.medio {
    background: var(--g-medio-bg);
    color: var(--g-medio-ink);
  }
  .sevpill.selected.grave {
    background: var(--g-grave-bg);
    color: var(--g-grave-ink);
  }
  .sevline {
    color: var(--muted);
    font-size: 0.78rem;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .sev {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: capitalize;
    border-radius: var(--radius-pill);
    padding: 5px 12px 5px 8px;
  }
  .sev.leve {
    background: var(--g-leve-bg);
    color: var(--g-leve-ink);
  }
  .sev.medio {
    background: var(--g-medio-bg);
    color: var(--g-medio-ink);
  }
  .sev.grave {
    background: var(--g-grave-bg);
    color: var(--g-grave-ink);
  }
  .sev i {
    width: 8px;
    height: 8px;
    border-radius: var(--radius-pill);
  }
  .sev.leve i {
    background: var(--g-leve-ink);
  }
  .sev.medio i {
    background: var(--g-medio-ink);
  }
  .sev.grave i {
    background: var(--g-grave-ink);
  }
  .form textarea {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 14px 16px;
    font-size: 0.88rem;
    line-height: 1.6;
    width: 100%;
    resize: vertical;
    min-height: 130px;
    color: var(--ink);
  }
  .form textarea:focus {
    outline: 2px solid var(--accent);
    outline-offset: 0;
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
    font-weight: 700;
    font-size: 0.88rem;
    padding: 10px 0;
    min-height: 44px;
  }
  .link:hover {
    text-decoration: underline;
  }
  .actions {
    display: flex;
    flex-direction: column-reverse;
    gap: 8px;
    margin-top: 4px;
  }
  .ghost {
    background: var(--surface);
    border: 1px solid var(--line);
    color: var(--ink);
    font-weight: 700;
    font-size: 0.88rem;
    border-radius: var(--radius-chip);
    padding: 12px 22px;
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
      grid-template-columns: 300px minmax(0, 1fr);
    }
    .actions {
      flex-direction: row;
      justify-content: flex-end;
    }
  }
</style>
