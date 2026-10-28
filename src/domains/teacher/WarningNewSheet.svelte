<script lang="ts">
  import Sheet from '$lib/ui/Sheet.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { t } from '$lib/i18n';
  import { notify } from '$lib/ui/notice';
  import { classRoster, daySchedule, isMissing, issueWarnings } from './api';
  import type { RosterEntry } from '$lib/api/types';
  import type { TeacherClass } from './api';
  import { guarded } from '$lib/nav';
  import { ApiError } from '$lib/api/types';
  import { foldSearch } from '$lib/search';

  // Llamado de atención en popup grande desde la agenda: mismo lenguaje
  // y mismo guardado que la pantalla /llamado/:groupID (POST
  // /v1/warnings/batch), pero con varios estudiantes a la vez: buscador
  // por nombre + selector múltiple.
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
  let title = '';
  let gravity: 'mild' | 'moderate' | 'severe' = 'mild';
  let description = '';
  let query = '';
  let selected: string[] = [];
  let saving = false;
  let feedback = '';
  let feedbackError = false;

  $: if (!open) {
    feedback = '';
    feedbackError = false;
  }

  $: titleOptions = [...$t.warning.titleOptions];
  $: visible = roster.filter((r) =>
    query.trim() ? foldSearch(`${r.Surnames} ${r.Names}`).includes(foldSearch(query.trim())) : true
  );
  $: valid =
    title.trim().length > 0 &&
    description.trim().length > 0 &&
    selected.length > 0 &&
    roster.length > 0;

  function bySurname(a: RosterEntry, b: RosterEntry): number {
    const x = `${a.Surnames} ${a.Names}`.toLowerCase();
    const y = `${b.Surnames} ${b.Names}`.toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  }

  function sevName(g: typeof gravity): string {
    return g === 'severe'
      ? $t.warning.severitySevere
      : g === 'moderate'
        ? $t.warning.severityModerate
        : $t.warning.severityMild;
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

  async function load() {
    loading = true;
    loadedFor = scope + groupID;
    roster = [];
    selected = [];
    query = '';
    if (!title) title = (titleOptions ?? [])[0] ?? '';
    if (!description) description = $t.warning.descDefault;
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
      // En modo global se agrupa por salón: un batch por salón con su
      // classID real, ya que el backend exige un salón por llamado.
      const byGroup = new Map<string, GlobalRoster[]>();
      for (const r of roster) {
        if (!selected.includes(r.StudentID)) continue;
        const gid = r.groupID || groupID;
        const list = byGroup.get(gid) ?? [];
        list.push(r);
        byGroup.set(gid, list);
      }
      for (const [gid, list] of byGroup) {
        const snapshots: Record<string, { names: string; surnames: string; documentID: string; classID: string }> = {};
        for (const r of list) {
          snapshots[r.StudentID] = {
            names: r.Names,
            surnames: r.Surnames,
            documentID: r.DocumentID,
            classID: gid
          };
        }
        await issueWarnings({
          studentIDs: list.map((r) => r.StudentID),
          classID: gid,
          title: title.trim(),
          gravity,
          description: description.trim(),
          snapshots
        });
      }
      notify($t.warning.saved);
      selected = [];
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

<Sheet {open} wide title={$t.warning.title} onClose={close}>
  {#if loading}
    <Skeleton rows={5} />
  {:else if roster.length === 0}
    <EmptyState icon="users" title={$t.warning.noRosterTitle} body={$t.warning.noRosterBody} />
  {:else}
    <div class="grid">
      <section class="fields">
        <p class="origin">{originLabel || groupID}</p>
        <label class="field">
          <span class="label">{$t.warning.titleLabel} *</span>
          <input
            type="text"
            list="warn-titles"
            bind:value={title}
            placeholder={$t.warning.titleLabel}
            autocomplete="off"
          />
          <datalist id="warn-titles">
            {#each titleOptions as opt}
              <option value={opt}></option>
            {/each}
          </datalist>
        </label>

        <div class="field">
          <span class="label" id="warn-sev">{$t.warning.severityLabel} *</span>
          <div class="seg" role="group" aria-labelledby="warn-sev">
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
          <p class="sevline">{sevName(gravity)}</p>
        </div>

        <label class="field">
          <span class="label">{$t.warning.descLabel} *</span>
          <textarea rows={5} bind:value={description} placeholder={$t.warning.descPlaceholder}></textarea>
        </label>
      </section>

      <section class="students">
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
      </section>
    </div>

    {#if feedback}<p class="flash error" role="alert">{feedback}</p>{/if}
    <div class="actions">
      <button class="ghost" type="button" on:click={close}>{$t.warning.cancel}</button>
      <button class="primary" type="button" disabled={!valid || saving} on:click={save}>
        {saving ? $t.warning.saving : $t.warning.save}
      </button>
    </div>
  {/if}
</Sheet>

<style>
  .grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 16px;
  }
  @media (min-width: 720px) {
    .grid {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }
  }
  .fields,
  .students {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
  }
  .origin {
    color: var(--muted);
    font-size: 0.82rem;
    font-weight: 700;
    overflow-wrap: anywhere;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .label {
    font-size: 0.85rem;
    font-weight: 700;
  }
  input[type='text'],
  textarea {
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 12px 14px;
    font-size: 0.92rem;
    width: 100%;
    font-family: inherit;
    color: var(--ink);
  }
  textarea {
    resize: vertical;
    min-height: 120px;
    line-height: 1.6;
  }
  input:focus,
  textarea:focus {
    outline: 2px solid var(--accent);
    outline-offset: 0;
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
  }
  .shead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
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
    max-height: 300px;
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
