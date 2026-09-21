<script lang="ts">
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { t } from '$lib/i18n';
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { paletteFor } from '$lib/ui/palette';
  import {
    classRoster,
    isMissing,
    issueWarnings,
    openSession,
    recordMark,
    type WarningSnapshot
  } from './api';
  import type { Mark, RosterEntry } from '$lib/api/types';
  import { guarded } from '$lib/nav';
  import { ApiError } from '$lib/api/types';

  export let params: { groupID?: string } = {};
  $: groupID = decodeURIComponent(params.groupID ?? '');

  type LoadState =
    | { kind: 'loading' }
    | { kind: 'error' }
    | { kind: 'ready'; roster: RosterEntry[] };

  let state: LoadState = { kind: 'loading' };
  let marks: Record<string, Mark> = {};
  let sessionID = '';
  let sessionError = '';

  let picked: string | null = null;
  let selecting = false;
  let selected = new Set<string>();

  let warnOpen = false;
  let warnTitle = '';
  let warnGravity: 'mild' | 'moderate' | 'severe' = 'moderate';
  let warnDescription = '';
  let warnFeedback = '';
  let markFeedback = '';

  async function load() {
    state = { kind: 'loading' };
    try {
      const roster = await guarded(() => classRoster(groupID));
      if (roster === null) return;
      state = { kind: 'ready', roster: [...roster].sort(bySurname) };
    } catch (err) {
      if (err instanceof ApiError && isMissing(err)) {
        state = { kind: 'ready', roster: [] };
      } else {
        state = { kind: 'error' };
      }
    }
  }

  function bySurname(a: RosterEntry, b: RosterEntry): number {
    const x = `${a.surnames} ${a.names}`.toLowerCase();
    const y = `${b.surnames} ${b.names}`.toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  }

  onMount(load);

  function initials(e: RosterEntry): string {
    return `${e.surnames.charAt(0)}${e.names.charAt(0)}`.toUpperCase();
  }

  function markLabel(m: Mark): string {
    if (m === 'absence') return $t.roster.absent;
    if (m === 'evasion') return $t.roster.evasion;
    if (m === 'late') return $t.roster.late;
    return $t.roster.present;
  }

  async function ensureSession(): Promise<boolean> {
    if (sessionID) return true;
    try {
      const detail = await openSession(groupID);
      sessionID = detail.session.id;
      marks = { ...detail.marks };
      sessionError = '';
      return true;
    } catch (err) {
      sessionError =
        err instanceof ApiError ? err.message : $t.common.loadError;
      return false;
    }
  }

  async function applyMark(studentID: string, mark: Mark) {
    markFeedback = '';
    if (!(await ensureSession())) return;
    try {
      await recordMark(sessionID, studentID, mark, '');
      marks = { ...marks, [studentID]: mark };
      if (mark === '') delete marks[studentID];
      marks = { ...marks };
      picked = null;
      markFeedback = $t.roster.markSaved;
    } catch (err) {
      markFeedback =
        err instanceof ApiError ? err.message : $t.common.loadError;
    }
  }

  function toggleSelect(id: string) {
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    selected = selected;
    selecting = selected.size > 0;
    if (!selecting) warnOpen = false;
  }

  function snapshots(roster: RosterEntry[]): Record<string, WarningSnapshot> {
    const out: Record<string, WarningSnapshot> = {};
    for (const e of roster) {
      if (!selected.has(e.studentID)) continue;
      out[e.studentID] = {
        names: e.names,
        surnames: e.surnames,
        documentID: e.documentID,
        classID: groupID
      };
    }
    return out;
  }

  async function saveWarning(roster: RosterEntry[]) {
    warnFeedback = '';
    try {
      await issueWarnings({
        studentIDs: [...selected],
        classID: groupID,
        title: warnTitle.trim(),
        gravity: warnGravity,
        description: warnDescription.trim(),
        snapshots: snapshots(roster)
      });
      warnFeedback = $t.roster.warnSaved;
      selected = new Set();
      selecting = false;
      warnOpen = false;
      warnTitle = '';
      warnDescription = '';
    } catch (err) {
      warnFeedback =
        err instanceof ApiError ? err.message : $t.common.loadError;
    }
  }

  const gravities = [
    { value: 'mild', label: $t.roster.warnGravityMild },
    { value: 'moderate', label: $t.roster.warnGravityModerate },
    { value: 'severe', label: $t.roster.warnGravitySevere }
  ] as const;
</script>

<div class="page">
  <TopBar title={$t.roster.title} showBack onBack={() => push('/hoy')}>
    <TopActions />
  </TopBar>

  {#if state.kind === 'loading'}
    <Skeleton rows={5} />
  {:else if state.kind === 'error'}
    <EmptyState icon="warn" title={$t.common.loadError} actionLabel={$t.common.retry} onAction={load} />
  {:else if state.roster.length === 0}
    <EmptyState icon="users" title={$t.roster.emptyTitle} body={$t.roster.emptyBody} />
  {:else}
    {#if markFeedback}
      <p class="flash" role="status">{markFeedback}</p>
    {/if}
    {#if sessionError}
      <p class="flash error" role="alert">{sessionError}</p>
    {/if}
    <ul class="roster">
      {#each state.roster as entry (entry.studentID)}
        <li>
          <button
            type="button"
            class="row"
            class:selected={selected.has(entry.studentID)}
            on:click={() => (selecting ? toggleSelect(entry.studentID) : (picked = entry.studentID))}
          >
            <span class={`avatar chip-${paletteFor(entry.studentID)}`} aria-hidden="true">
              {initials(entry)}
            </span>
            <span class="who">
              <span class="name">{entry.surnames} {entry.names}</span>
              {#if marks[entry.studentID]}
                <span class="mark">{markLabel(marks[entry.studentID])}</span>
              {/if}
            </span>
            {#if selecting}
              <span class="check" aria-hidden="true">
                {#if selected.has(entry.studentID)}<Icon name="check" />{/if}
              </span>
            {/if}
          </button>
        </li>
      {/each}
    </ul>
    <div class="toolbar">
      <button
        type="button"
        class="ghost"
        on:click={() => {
          selecting = !selecting;
          selected = new Set();
          warnOpen = false;
        }}
      >
        {selecting ? $t.common.cancel : $t.roster.warn}
      </button>
      {#if selecting}
        <button
          type="button"
          class="primary"
          disabled={selected.size === 0}
          on:click={() => (warnOpen = true)}
        >
          {$t.roster.warn} ({selected.size})
        </button>
      {/if}
    </div>
  {/if}
</div>

<Sheet
  open={picked !== null}
  title={state.kind === 'ready'
    ? (state.roster.find((e) => e.studentID === picked)?.surnames ?? '')
    : ''}
  on:close={() => (picked = null)}
>
  {#if picked}
    {@const studentID = picked}
    <div class="marks">
      <button type="button" class="mark-btn present" on:click={() => applyMark(studentID, '')}>
        <Icon name="check" /><span>{$t.roster.present}</span>
      </button>
      <button type="button" class="mark-btn m-absence" on:click={() => applyMark(studentID, 'absence')}>
        <Icon name="close" /><span>{$t.roster.absent}</span>
      </button>
      <button type="button" class="mark-btn m-evasion" on:click={() => applyMark(studentID, 'evasion')}>
        <Icon name="warn" /><span>{$t.roster.evasion}</span>
      </button>
      <button type="button" class="mark-btn m-late" on:click={() => applyMark(studentID, 'late')}>
        <Icon name="clock" /><span>{$t.roster.late}</span>
      </button>
    </div>
  {/if}
</Sheet>

<Sheet open={warnOpen} title={$t.roster.warnTitle} on:close={() => (warnOpen = false)}>
  {#if state.kind === 'ready'}
    <div class="warn-form">
      <p class="count">{$t.roster.warnStudents(selected.size)}</p>
      <label for="warn-title">{$t.roster.warnSubjectLabel}</label>
      <input id="warn-title" bind:value={warnTitle} maxlength={120} />
      <div class="segment" role="group" aria-label={$t.roster.warnGravityLabel}>
        {#each gravities as g}
          <button
            type="button"
            class:selected={warnGravity === g.value}
            aria-pressed={warnGravity === g.value}
            on:click={() => (warnGravity = g.value)}
          >
            {g.label}
          </button>
        {/each}
      </div>
      <label for="warn-desc">{$t.roster.warnDescLabel}</label>
      <textarea id="warn-desc" rows={4} bind:value={warnDescription} placeholder={$t.roster.warnPlaceholder}
      ></textarea>
      {#if warnFeedback}
        <p class="flash" role="status">{warnFeedback}</p>
      {/if}
      <button
        type="button"
        class="primary"
        disabled={!warnTitle.trim() || !warnDescription.trim()}
        on:click={() => saveWarning(state.kind === 'ready' ? state.roster : [])}
      >
        {$t.roster.warnSave}
      </button>
    </div>
  {/if}
</Sheet>

<style>
  .roster {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    text-align: left;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    padding: 12px 14px;
    min-height: 68px;
    transition:
      transform 0.1s ease,
      border-color 0.15s ease;
    animation: rise 0.25s ease both;
  }
  .row:active {
    transform: scale(0.98);
  }
  .row.selected {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }
  .avatar {
    flex: none;
    width: 44px;
    height: 44px;
    border-radius: var(--radius-pill);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
  }
  .avatar.chip-green { background: var(--chip-green-bg); color: var(--chip-green-ink); }
  .avatar.chip-yellow { background: var(--chip-yellow-bg); color: var(--chip-yellow-ink); }
  .avatar.chip-purple { background: var(--chip-purple-bg); color: var(--chip-purple-ink); }
  .avatar.chip-pink { background: var(--chip-pink-bg); color: var(--chip-pink-ink); }
  .avatar.chip-sky { background: var(--chip-sky-bg); color: var(--chip-sky-ink); }
  .who {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .name {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .mark {
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--accent);
  }
  .check {
    flex: none;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-pill);
    border: 2px solid var(--line);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--accent-ink);
  }
  .row.selected .check {
    background: var(--accent);
    border-color: var(--accent);
  }
  .check :global(svg) {
    width: 16px;
    height: 16px;
  }
  .toolbar {
    position: sticky;
    bottom: calc(84px + env(safe-area-inset-bottom));
    display: flex;
    gap: 8px;
    margin-top: 12px;
  }
  .ghost,
  .primary {
    min-height: 52px;
    border-radius: var(--radius-pill);
    font-weight: 700;
    padding: 12px 20px;
  }
  .ghost {
    flex: 1;
    background: var(--surface);
    border: 1px solid var(--line);
  }
  .primary {
    flex: 2;
    background: var(--accent);
    color: var(--accent-ink);
  }
  .primary:disabled {
    opacity: 0.5;
  }
  .flash {
    background: var(--chip-green-bg);
    color: var(--chip-green-ink);
    font-weight: 600;
    font-size: 0.9rem;
    border-radius: var(--radius-chip);
    padding: 10px 14px;
    margin-bottom: 12px;
  }
  .flash.error {
    background: var(--chip-pink-bg);
    color: var(--chip-pink-ink);
  }
  .marks {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    padding-bottom: 8px;
  }
  .mark-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 60px;
    border-radius: var(--radius-chip);
    font-weight: 700;
    border: 1px solid var(--line);
    background: var(--surface-2);
    transition: transform 0.1s ease;
  }
  .mark-btn:active {
    transform: scale(0.96);
  }
  .mark-btn.present {
    background: var(--chip-green-bg);
    color: var(--chip-green-ink);
    border-color: transparent;
  }
  .mark-btn.m-absence {
    background: var(--chip-pink-bg);
    color: var(--chip-pink-ink);
    border-color: transparent;
  }
  .mark-btn.m-evasion {
    background: var(--chip-yellow-bg);
    color: var(--chip-yellow-ink);
    border-color: transparent;
  }
  .mark-btn.m-late {
    background: var(--chip-sky-bg);
    color: var(--chip-sky-ink);
    border-color: transparent;
  }
  .warn-form {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .count {
    color: var(--muted);
    font-size: 0.9rem;
    font-weight: 600;
  }
  .warn-form label {
    font-weight: 600;
    font-size: 0.9rem;
  }
  .warn-form input,
  .warn-form textarea {
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 12px 14px;
    width: 100%;
    resize: vertical;
  }
  .warn-form input:focus,
  .warn-form textarea:focus {
    outline: 2px solid var(--accent);
    outline-offset: 0;
    border-color: var(--accent);
  }
  .segment {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .segment button {
    min-height: 48px;
    border-radius: var(--radius-chip);
    border: 1px solid var(--line);
    background: var(--surface-2);
    font-weight: 700;
    color: var(--muted);
  }
  .segment button.selected {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--accent);
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
</style>
