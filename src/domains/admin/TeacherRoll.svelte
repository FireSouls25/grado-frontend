<script lang="ts">
  import { onDestroy } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { t } from '$lib/i18n';
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import AdminShell from './AdminShell.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ErrorState from '$lib/ui/ErrorState.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import { guarded, goBack } from '$lib/nav';
  import { notify } from '$lib/ui/notice';
  import { teacherRoll, recordTeacherDay, listYears, teachers, type TeacherRollRow, type TeacherMarkStatus } from './api';
  import { rollDate, resetRollDate } from './rollDate';

  const currentYear = new Date().getFullYear();

  function todayLocal(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function prettyDay(value: string): string {
    const d = new Date(`${value}T12:00:00`);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  let day = todayLocal();
  const unsub = rollDate.subscribe((v) => {
    if (v) day = v;
  });
  onDestroy(unsub);

  type State = 'loading' | 'error' | 'ready';
  let state: State = 'loading';
  let loadError: unknown = null;
  let rows: TeacherRollRow[] = [];
  let dayKind: '' | 'holiday' | 'noclass' = '';
  let yearsCache: { StartDate: string; EndDate: string; Holidays: string[]; NoClassDays?: string[] }[] = [];
  let yearsLoaded = false;

  function kindOf(dayISO: string): '' | 'holiday' | 'noclass' {
    const d = new Date(`${dayISO}T12:00:00`);
    if (Number.isNaN(d.getTime())) return '';
    for (const y of yearsCache) {
      if (d < new Date(y.StartDate) || d > new Date(y.EndDate)) continue;
      if ((y.Holidays ?? []).some((h) => h.slice(0, 10) === dayISO)) return 'holiday';
      if ((y.NoClassDays ?? []).some((h) => h.slice(0, 10) === dayISO)) return 'noclass';
      return '';
    }
    return '';
  }

  async function ensureYears() {
    if (yearsLoaded) return;
    yearsLoaded = true;
    try {
      const list = await guarded(() => listYears());
      if (list) yearsCache = list;
    } catch {
      /* best effort: without years the banner just stays hidden */
    }
  }
  // Explicit picks only: untouched rows stay unselected AND unsaved.
  // One shared motive next to save, attached to non-present marks.
  let sel: Record<string, TeacherMarkStatus> = {};
  let rollNote = '';
  let saving = false;

  $: markedCount = Object.keys(sel).length;

  async function load() {
    state = 'loading';
    loadError = null;
    sel = {};
    dayKind = '';
    try {
      await ensureYears();
      dayKind = kindOf(day);
      rows = (await guarded(() => teacherRoll(day))) ?? [];
      // Non-school day without expectations: offer the roster anyway so
      // an explicit roll stays possible (the backend records it).
      if (rows.length === 0 && dayKind !== '') {
        const all = await guarded(() => teachers());
        if (all) {
          rows = all
            .filter((x) => x.Active)
            .map((x) => ({
              TeacherID: x.ID,
              TeacherName: `${x.Surnames} ${x.Names}`,
              Day: day,
              Status: '' as TeacherRollRow['Status'],
              Note: '',
              Recorded: false
            }));
        }
      }
      state = 'ready';
    } catch (err) {
      loadError = err;
      state = 'error';
    }
  }

  function changeDay(delta: number) {
    const d = new Date(`${day}T12:00:00`);
    d.setDate(d.getDate() + delta);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (next > todayLocal()) return;
    day = next;
    void load();
  }

  function setStatus(id: string, status: TeacherMarkStatus) {
    sel = { ...sel, [id]: status };
  }

  function markAllPresent() {
    const next: typeof sel = {};
    for (const r of rows) next[r.TeacherID] = 'present';
    sel = next;
  }

  async function save() {
    saving = true;
    try {
      await recordTeacherDay(
        day,
        Object.entries(sel).map(([teacherID, status]) => ({
          teacherID,
          status,
          note: status === 'present' ? '' : rollNote.trim()
        }))
      );
      notify($t.troll.saved);
      await load();
    } catch (err) {
      loadError = err;
      state = 'error';
    } finally {
      saving = false;
    }
  }

  function back() {
    resetRollDate();
    goBack('/admin/docentes');
  }

  load();
</script>

<AdminShell active="docentes" year={currentYear}>
  <TopBar title={$t.troll.rollTitle} showBack onBack={back}><TopActions /></TopBar>

  <div class="pagehead">
    <p class="eyebrow">{$t.admin.consoleEyebrow}</p>
    <h1 class="title">{$t.troll.rollTitle}</h1>
    <p class="muted">{$t.troll.rollHint}</p>
  </div>

  <div class="sheet">
    <div class="daybar">
      <div class="stepper">
        <button type="button" class="mini" on:click={() => changeDay(-1)} aria-label="−1 día">‹</button>
        <div class="daylabel">
          <strong>{prettyDay(day)}</strong>
          <small>{$t.troll.countTeachers(rows.length)}{markedCount > 0 ? ` · ${markedCount}` : ''}</small>
        </div>
        <button type="button" class="mini" disabled={day >= todayLocal()} on:click={() => changeDay(1)} aria-label="+1 día">›</button>
      </div>
      <div class="dayactions">
        <input
          class="motivo"
          type="text"
          placeholder={$t.troll.notePlaceholder}
          aria-label={$t.troll.noteLabel}
          bind:value={rollNote}
          maxlength="140"
        />
        <button type="button" class="mini" disabled={rows.length === 0} on:click={markAllPresent}>
          {$t.troll.markAllPresent}
        </button>
        <button type="button" class="mini primary" disabled={saving || markedCount === 0} on:click={save}>
          {saving ? $t.troll.saving : $t.troll.saveRoll}
        </button>
      </div>
    </div>

    {#if dayKind !== '' && state === 'ready'}
      <p class="notice" role="status">
        {dayKind === 'holiday' ? $t.troll.nonSchoolHoliday : $t.troll.nonSchoolDay}
      </p>
    {/if}
    {#if state === 'loading'}
      <Skeleton rows={4} />
    {:else if state === 'error'}
      <ErrorState error={loadError} onRetry={load} />
    {:else if rows.length === 0}
      <EmptyState icon="users" title={$t.troll.expectedEmptyTitle} body={$t.troll.expectedEmptyBody} />
    {:else}
      <ul class="roll">
        {#each rows as row (row.TeacherID)}
          <li>
            <span class="who">
              <span class="avatar" aria-hidden="true">
                {row.TeacherName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
              </span>
              <span class="name">{row.TeacherName}</span>
            </span>
            <span class="seg" role="group" aria-label={row.TeacherName}>
              <button type="button" class:present={(sel[row.TeacherID] ?? (row.Recorded ? row.Status : '')) === 'present'} aria-pressed={(sel[row.TeacherID] ?? (row.Recorded ? row.Status : '')) === 'present'} on:click={() => setStatus(row.TeacherID, 'present')}>
                {$t.troll.statusPresent}
              </button>
              <button type="button" class:absent={(sel[row.TeacherID] ?? (row.Recorded ? row.Status : '')) === 'absent'} aria-pressed={(sel[row.TeacherID] ?? (row.Recorded ? row.Status : '')) === 'absent'} on:click={() => setStatus(row.TeacherID, 'absent')}>
                {$t.troll.statusAbsent}
              </button>
              <button type="button" class:late={(sel[row.TeacherID] ?? (row.Recorded ? row.Status : '')) === 'late'} aria-pressed={(sel[row.TeacherID] ?? (row.Recorded ? row.Status : '')) === 'late'} on:click={() => setStatus(row.TeacherID, 'late')}>
                {$t.troll.statusLate}
              </button>
            </span>
          </li>
        {/each}
      </ul>
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
    margin-bottom: 2px;
  }
  .title {
    margin: 0;
  }
  .muted {
    color: var(--muted);
    font-size: 0.85rem;
    margin: 6px 0 0;
  }
  .sheet {
    background: var(--surface);
    border: 1px solid var(--line);
    border-bottom: 0;
    border-radius: 24px 24px 0 0;
    padding: 16px 16px 130px;
  }
  @media (min-width: 700px) {
    .sheet {
      padding: 20px 20px 130px;
    }
  }
  .daybar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }
  .stepper {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .daylabel {
    display: flex;
    flex-direction: column;
    min-width: 200px;
  }
  .daylabel strong {
    font-size: 1rem;
    text-transform: capitalize;
  }
  .daylabel small {
    color: var(--muted);
    font-size: 0.78rem;
    font-weight: 600;
  }
  .dayactions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
  }
  .motivo {
    flex: 1;
    min-width: 180px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 10px 12px;
    min-height: 44px;
    font-size: 0.85rem;
    color: var(--ink);
  }
  .mini {
    display: inline-flex;
    align-items: center;
    min-height: 40px;
    padding: 0 14px;
    border-radius: var(--radius-pill);
    background: var(--tint);
    font-weight: 700;
    font-size: 0.82rem;
  }
  .mini.primary {
    background: var(--accent);
    color: #fff;
  }
  .mini:disabled {
    opacity: 0.5;
  }
  .roll {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .roll li {
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 10px 14px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 14px;
  }
  .roll .who {
    flex: 1;
    min-width: 180px;
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 10px;
  }
  .roll .avatar {
    flex: none;
    width: 40px;
    height: 40px;
    border-radius: var(--radius-pill);
    background: var(--accent-soft);
    color: var(--accent);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    font-size: 0.85rem;
  }
  .roll .name {
    font-weight: 700;
  }
  .seg {
    display: flex;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-pill);
    padding: 3px;
    gap: 2px;
  }
  .seg button {
    min-height: 36px;
    padding: 0 14px;
    border-radius: var(--radius-pill);
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--muted);
  }
  .seg button.present {
    background: var(--chip-green-bg);
    color: var(--chip-green-ink);
  }
  .seg button.absent {
    background: var(--chip-pink-bg);
    color: var(--g-grave-ink);
  }
  .seg button.late {
    background: var(--chip-yellow-bg);
    color: var(--chip-yellow-ink);
  }
</style>
