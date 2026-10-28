<script lang="ts">
  import Sheet from '$lib/ui/Sheet.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { t } from '$lib/i18n';
  import { notify } from '$lib/ui/notice';
  import { classRoster, daySchedule, isMissing, raiseAcademicAlerts } from './api';
  import type { RosterEntry } from '$lib/api/types';
  import type { TeacherClass } from './api';
  import { guarded } from '$lib/nav';
  import { ApiError } from '$lib/api/types';
  import { foldSearch } from '$lib/search';

  // Alerta académica en popup: el docente selecciona uno o varios
  // estudiantes y escribe el motivo. La alerta queda abierta para que
  // los admins la revisen (mismo trato que faltas graves repetidas:
  // aviso + pendiente + marca en la ficha).
  export let open = false;
  export let groupID = '';
  /** all: junta la nómina de todos los salones del docente. */
  export let scope: 'group' | 'all' = 'group';
  export let originLabel = '';
  export let onClose: () => void = () => {};
  export let onSaved: () => void = () => {};

  let loading = false;
  let loadedFor = '';
  type GlobalRoster = RosterEntry & { groupLabel: string; groupID: string };

  let roster: GlobalRoster[] = [];
  let reason = '';
  let query = '';
  let selected: string[] = [];
  let saving = false;
  let feedback = '';
  let feedbackError = false;

  $: if (!open) {
    feedback = '';
    feedbackError = false;
  }

  $: visible = roster.filter((r) =>
    query.trim() ? foldSearch(`${r.Surnames} ${r.Names}`).includes(foldSearch(query.trim())) : true
  );
  $: valid = reason.trim().length > 0 && selected.length > 0 && roster.length > 0;

  function bySurname(a: RosterEntry, b: RosterEntry): number {
    const x = `${a.Surnames} ${a.Names}`.toLowerCase();
    const y = `${b.Surnames} ${b.Names}`.toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  }

  async function load() {
    loading = true;
    loadedFor = scope + groupID;
    roster = [];
    selected = [];
    query = '';
    reason = '';
    try {
      if (scope === 'all') {
        roster = await loadAll();
      } else {
        const data = await guarded(() => classRoster(groupID));
        roster = Array.isArray(data) ? [...data].map((r) => ({ ...r, groupLabel: '', groupID: '' })).sort(bySurname) : [];
      }
    } catch {
      roster = [];
    } finally {
      loading = false;
    }
  }

  $: if (open && (groupID || scope === 'all') && loadedFor !== scope + groupID) {
    void load();
  }

  async function loadAll(): Promise<GlobalRoster[]> {
    const days = await Promise.all([1, 2, 3, 4, 5, 6, 7].map((w) => daySchedule(w).catch(() => [] as TeacherClass[])));
    const byGroup = new Map<string, string>();
    for (const entries of days) {
      for (const e of entries) {
        if (e.GroupID && !byGroup.has(e.GroupID)) byGroup.set(e.GroupID, e.ClassLabel || e.GroupID.slice(0, 8));
      }
    }
    const settled = await Promise.all(
      [...byGroup.keys()].map(async (gid) => {
        try {
          const data = await guarded(() => classRoster(gid));
          return Array.isArray(data) ? data.map((r) => ({ ...r, groupLabel: byGroup.get(gid) ?? '', groupID: gid })) : [];
        } catch {
          return [] as GlobalRoster[];
        }
      })
    );
    return settled.flat().sort(bySurname);
  }

  function toggle(id: string) {
    selected = selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
  }

  function close() {
    selected = [];
    onClose();
  }

  async function save() {
    feedback = '';
    feedbackError = false;
    if (!valid || saving) return;
    saving = true;
    try {
      await raiseAcademicAlerts({ studentIDs: [...selected], reason: reason.trim() });
      notify($t.academicAlert.saved);
      selected = [];
      reason = '';
      onSaved();
    } catch (err) {
      feedbackError = true;
      if (err instanceof ApiError && isMissing(err)) feedback = $t.warning.pendingBackend;
      else feedback = err instanceof ApiError ? err.message : $t.common.loadError;
    } finally {
      saving = false;
    }
  }
</script>

<Sheet {open} wide title={$t.academicAlert.title} onClose={close}>
  {#if loading}
    <Skeleton rows={5} />
  {:else if roster.length === 0}
    <EmptyState icon="users" title={$t.warning.noRosterTitle} body={$t.warning.noRosterBody} />
  {:else}
    <p class="origin">{originLabel || groupID}</p>
    <label class="field">
      <span class="label">{$t.academicAlert.reasonLabel} *</span>
      <textarea rows={4} bind:value={reason} placeholder={$t.academicAlert.reasonPlaceholder}></textarea>
    </label>
    <div class="shead">
      <span class="label">{$t.warning.studentsLabel} *</span>
      <span class="selcount" role="status">{$t.warning.selectedStudents(selected.length)}</span>
    </div>
    <label class="search">
      <Icon name="search" />
      <input
        type="search"
        placeholder={$t.warning.searchStudents}
        aria-label={$t.warning.searchStudents}
        bind:value={query}
      />
    </label>
    {#if visible.length === 0}
      <p class="muted">{$t.warning.noStudentsMatch}</p>
    {:else}
      <ul class="roster">
        {#each visible as r (r.StudentID)}
          <li>
            <label class="pick">
              <input
                type="checkbox"
                checked={selected.includes(r.StudentID)}
                on:change={() => toggle(r.StudentID)}
              />
              <span class="who">
                <strong>{r.Surnames}, {r.Names}</strong>
                <small>{r.DocumentID}{(r as GlobalRoster).groupLabel ? ` · ${(r as GlobalRoster).groupLabel}` : ''}</small>
              </span>
            </label>
          </li>
        {/each}
      </ul>
    {/if}
    {#if feedback}<p class="flash error" role="alert">{feedback}</p>{/if}
    <div class="actions">
      <button class="ghost" type="button" on:click={close}>{$t.warning.cancel}</button>
      <button class="primary" type="button" disabled={!valid || saving} on:click={save}>
        {saving ? $t.warning.saving : $t.academicAlert.save}
      </button>
    </div>
  {/if}
</Sheet>

<style>
  .origin {
    color: var(--muted);
    font-size: 0.82rem;
    font-weight: 700;
    overflow-wrap: anywhere;
    margin-bottom: 10px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 12px;
  }
  .label {
    font-size: 0.85rem;
    font-weight: 700;
  }
  textarea {
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 12px 14px;
    font-size: 0.9rem;
    width: 100%;
    font-family: inherit;
    color: var(--ink);
    resize: vertical;
    min-height: 100px;
    line-height: 1.6;
  }
  textarea:focus {
    outline: 2px solid var(--accent);
    outline-offset: 0;
  }
  .shead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
  }
  .selcount {
    background: var(--tint);
    border-radius: 999px;
    padding: 3px 10px;
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--ink-soft);
    white-space: nowrap;
  }
  .search {
    display: flex;
    gap: 8px;
    align-items: center;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 9px 12px;
    color: var(--muted);
    min-height: 48px;
    margin-bottom: 8px;
  }
  .search input {
    border: 0;
    background: none;
    outline: none;
    width: 100%;
    color: var(--ink);
    font-size: 0.88rem;
    padding: 0;
  }
  .muted {
    color: var(--muted);
    font-size: 0.88rem;
  }
  .roster {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 280px;
    overflow-y: auto;
  }
  .pick {
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 10px 12px;
    cursor: pointer;
    min-height: 52px;
  }
  .pick input {
    width: 22px;
    height: 22px;
    flex: none;
    accent-color: var(--accent);
  }
  .who {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .who strong {
    font-size: 0.88rem;
    overflow-wrap: anywhere;
  }
  .who small {
    color: var(--muted);
    font-size: 0.76rem;
  }
  .flash.error {
    background: var(--g-grave-bg);
    color: var(--g-grave-ink);
    font-weight: 600;
    font-size: 0.88rem;
    border-radius: var(--radius-chip);
    padding: 10px 14px;
    margin: 12px 0 0;
  }
  .actions {
    display: flex;
    gap: 10px;
    margin-top: 14px;
  }
  .ghost,
  .primary {
    min-height: 48px;
    border-radius: var(--radius-chip);
    font-weight: 700;
    font-size: 0.88rem;
    padding: 10px 22px;
  }
  .ghost {
    background: var(--surface);
    border: 1px solid var(--line);
    flex: none;
  }
  .primary {
    background: var(--accent);
    color: var(--accent-ink);
    flex: 1;
  }
  .primary:disabled {
    opacity: 0.6;
  }
</style>
