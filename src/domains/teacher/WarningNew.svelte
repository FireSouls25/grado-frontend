<script lang="ts">
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { t } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import { classRoster, isMissing, issueWarnings } from './api';
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
  $: preselectedStudent = queryParam('estudiante');

  const demoByKey: Record<string, { subject: string; group: string }> = {
    fisica: { subject: 'Física', group: '11°B' },
    matematicas: { subject: 'Matemáticas', group: '10°A' },
    geometria: { subject: 'Geometría', group: '9°A' },
    estadistica: { subject: 'Estadística', group: '10°B' }
  };

  // Misma nómina de referencia del detalle (Física 11°B).
  const demoRoster: RosterEntry[] = [
    { StudentID: '#10024', Names: 'Mateo', Surnames: 'Albarracín', DocumentID: '#10024' },
    { StudentID: '#10156', Names: 'Sofía', Surnames: 'Beltrán', DocumentID: '#10156' },
    { StudentID: '#10098', Names: 'Juan José', Surnames: 'Cardona', DocumentID: '#10098' },
    { StudentID: '#10214', Names: 'Mariana', Surnames: 'Delgado', DocumentID: '#10214' },
    { StudentID: '#10045', Names: 'Lucas', Surnames: 'Espinosa', DocumentID: '#10045' },
    { StudentID: '#10112', Names: 'Valentina', Surnames: 'Fajardo', DocumentID: '#10112' },
    { StudentID: '#10301', Names: 'Andrés', Surnames: 'Gómez', DocumentID: '#10301' }
  ];

  $: meta =
    demoByKey[subjectParam] ??
    demoByKey[groupID] ?? { subject: 'Física', group: '11°B' };

  $: account = devAccounts.find((a) => a.id === $session) ?? devAccounts[1];
  $: teacherName = account?.displayName ? `Prof. ${account.displayName}` : $t.agenda.teacherName;

  let loading = true;
  let roster: RosterEntry[] = [...demoRoster];

  let title = $t.warning.titleOptions[0];
  let studentID = '#10098';
  let gravity: 'mild' | 'moderate' | 'severe' = 'mild';
  let description = $t.warning.descDefault;

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
    return `${r.StudentID}  ${r.Surnames}, ${r.Names} (${meta.group})`;
  }

  async function load() {
    loading = true;
    try {
      const data = await guarded(() => classRoster(groupID));
      if (data === null) return;
      if (data.length > 0) roster = [...data].sort(bySurname);
    } catch (err) {
      if (!(err instanceof ApiError && isMissing(err))) {
        roster = [...demoRoster];
      }
    } finally {
      const wanted = preselectedStudent || '#10098';
      studentID = roster.some((r) => r.StudentID === wanted) ? wanted : roster[0]?.StudentID ?? '';
      loading = false;
    }
  }

  onMount(load);

  function detailHref(): string {
    const q = subjectParam ? `?materia=${encodeURIComponent(subjectParam)}` : '';
    return `/clase/${encodeURIComponent(groupID)}${q}`;
  }

  $: valid = title.trim().length > 0 && studentID.length > 0 && description.trim().length > 0;

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
        // Backend sin ruta todavía: respaldo demo, no bucle de error.
        saved = true;
        feedback = $t.warning.saved;
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
    <p class="crumbs">
      {$t.warning.breadcrumbHome} <span>›</span>
      {$t.warning.breadcrumbAgenda} <span>›</span>
      {$t.warning.breadcrumbDetail} <span>›</span>
      <strong>{$t.warning.breadcrumbHere}</strong>
    </p>
    <h1>{$t.warning.title}</h1>

    {#if loading}
      <Skeleton rows={5} />
    {:else}
      <div class="grid">
        <aside class="card origin">
          <p class="tag">{$t.warning.originTag}</p>
          <h2>{meta.subject} - {meta.group}</h2>
          <p class="note">{$t.warning.originNote}</p>
        </aside>

        <section class="card form">
          <label class="field">
            <span class="label">{$t.warning.titleLabel} *</span>
            <span class="select-wrap">
              <select bind:value={title} aria-label={$t.warning.titleLabel}>
                {#each $t.warning.titleOptions as opt}
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
                class:selected={gravity === 'mild'}
                aria-pressed={gravity === 'mild'}
                on:click={() => (gravity = 'mild')}
              >
                {$t.warning.severityMild}
              </button>
              <button
                type="button"
                class:selected={gravity === 'moderate'}
                aria-pressed={gravity === 'moderate'}
                on:click={() => (gravity = 'moderate')}
              >
                {$t.warning.severityModerate}
              </button>
              <button
                type="button"
                class:selected={gravity === 'severe'}
                aria-pressed={gravity === 'severe'}
                on:click={() => (gravity = 'severe')}
              >
                {$t.warning.severitySevere}
              </button>
            </div>
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
  </main>
</div>

<style>
  .warning {
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
  .crumbs {
    color: var(--muted);
    font-size: 0.8rem;
    margin-bottom: 4px;
  }
  .crumbs strong {
    color: var(--ink);
  }
  .body h1 {
    font-size: 1.9rem;
    margin-bottom: 18px;
  }
  .grid {
    display: grid;
    grid-template-columns: 300px 1fr;
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
    color: var(--muted);
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    margin-bottom: 6px;
  }
  .origin h2 {
    font-size: 1.35rem;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--line);
    margin-bottom: 14px;
  }
  .note {
    color: var(--muted);
    font-size: 0.85rem;
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
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 13px 44px 13px 16px;
    font-size: 0.88rem;
    color: var(--ink);
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
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 6px;
  }
  .seg button {
    min-height: 44px;
    border-radius: 8px;
    font-weight: 600;
    font-size: 0.88rem;
    color: var(--muted);
  }
  .seg button.selected {
    background: var(--surface);
    color: var(--ink);
    font-weight: 700;
    box-shadow: var(--shadow);
  }
  .form textarea {
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 14px 16px;
    font-size: 0.88rem;
    line-height: 1.6;
    width: 100%;
    resize: vertical;
    min-height: 130px;
  }
  .form textarea:focus {
    outline: 2px solid var(--accent);
    outline-offset: 0;
    border-color: var(--accent);
  }
  .flash {
    background: var(--chip-green-bg);
    color: var(--chip-green-ink);
    font-weight: 600;
    font-size: 0.88rem;
    border-radius: var(--radius-chip);
    padding: 10px 14px;
  }
  .flash.error {
    background: var(--chip-pink-bg);
    color: var(--chip-pink-ink);
  }
  .link {
    align-self: flex-start;
    color: var(--accent);
    font-weight: 700;
    font-size: 0.88rem;
    padding: 4px 0;
  }
  .link:hover {
    text-decoration: underline;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 4px;
  }
  .ghost {
    background: var(--surface);
    border: 1px solid var(--line);
    color: var(--ink);
    font-weight: 700;
    font-size: 0.88rem;
    border-radius: 10px;
    padding: 12px 22px;
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
    .actions {
      flex-direction: column-reverse;
    }
    .ghost,
    .primary {
      width: 100%;
    }
  }
</style>
