<script lang="ts">
  import { onDestroy } from 'svelte';
  import { t } from '$lib/i18n';
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import AdminShell from './AdminShell.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ErrorState from '$lib/ui/ErrorState.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { guarded, goBack } from '$lib/nav';
  import { notify } from '$lib/ui/notice';
  import { teacherRoll, recordTeacherDay, listYears, teachers, type TeacherRollRow, type TeacherMarkStatus } from './api';
  import { rollDate, resetRollDate } from './rollDate';

  const currentYear = new Date().getFullYear();

  function todayLocal(): string {
    const d = new Date();
    const fmtTwo = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    return `${d.getFullYear()}-${fmtTwo(d.getMonth() + 1)}-${fmtTwo(d.getDate())}`;
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
      /* best effort */
    }
  }

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
    const fmtTwo = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    const next = `${d.getFullYear()}-${fmtTwo(d.getMonth() + 1)}-${fmtTwo(d.getDate())}`;
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
  <TopBar title={$t.troll.rollTitle} subtitle={$t.troll.rollHint} showBack onBack={back}>
    <TopActions />
  </TopBar>

  <div class="sheet">
    <div class="daybar">
      <div class="stepper">
        <button type="button" class="btn btn-sm" on:click={() => changeDay(-1)} aria-label="−1 día"><Icon name="back" /></button>
        <div class="daylabel">
          <strong>{prettyDay(day)}</strong>
          <small>{$t.troll.countTeachers(rows.length)}{markedCount > 0 ? ` · ${markedCount}` : ''}</small>
        </div>
        <button type="button" class="btn btn-sm" disabled={day >= todayLocal()} on:click={() => changeDay(1)} aria-label="+1 día"><Icon name="next" /></button>
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
        <button type="button" class="btn" disabled={rows.length === 0} on:click={markAllPresent}>
          {$t.troll.markAllPresent}
        </button>
        <button type="button" class="btn btn-primary" disabled={saving || markedCount === 0} on:click={save}>
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
          {@const current = sel[row.TeacherID] ?? (row.Recorded ? row.Status : '')}
          <li>
            <span class="who">
              <span class="avatar" aria-hidden="true">
                {row.TeacherName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
              </span>
              <span class="name">{row.TeacherName}</span>
            </span>
            <span class="seg" role="group" aria-label={row.TeacherName}>
              <button
                type="button"
                class:present={current === 'present'}
                aria-pressed={current === 'present'}
                on:click={() => setStatus(row.TeacherID, 'present')}
              >
                {$t.troll.statusPresent}
              </button>
              <button
                type="button"
                class:absent={current === 'absent'}
                aria-pressed={current === 'absent'}
                on:click={() => setStatus(row.TeacherID, 'absent')}
              >
                {$t.troll.statusAbsent}
              </button>
              <button
                type="button"
                class:late={current === 'late'}
                aria-pressed={current === 'late'}
                on:click={() => setStatus(row.TeacherID, 'late')}
              >
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
  .sheet {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-sheet);
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .daybar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--line);
  }
  .stepper {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .daylabel {
    display: flex;
    flex-direction: column;
    min-width: 180px;
  }
  .daylabel strong {
    font-size: 0.95rem;
    font-weight: 600;
    text-transform: capitalize;
  }
  .daylabel small {
    color: var(--muted);
    font-size: 0.76rem;
    font-variant-numeric: tabular-nums;
  }
  .dayactions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
    flex: 1;
    justify-content: flex-end;
  }
  .motivo {
    flex: 1;
    min-width: 180px;
    max-width: 300px;
    background: var(--surface);
    border: 1px solid var(--control);
    border-radius: var(--radius-control);
    padding: 0 12px;
    min-height: var(--control-height);
    font-size: 0.84rem;
    color: var(--ink);
  }
  .motivo:focus {
    outline: none;
    border-color: var(--accent);
  }
  .notice {
    background: var(--chip-yellow-bg);
    color: var(--chip-yellow-ink);
    border-radius: var(--radius-control);
    padding: 10px 14px;
    font-size: 0.84rem;
    font-weight: 500;
  }
  .roll {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }
  .roll li {
    padding: 10px 4px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px 14px;
    border-top: 1px solid var(--line);
  }
  .roll li:first-child {
    border-top: 0;
  }
  .roll .who {
    flex: 1;
    min-width: 180px;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .roll .avatar {
    flex: none;
    width: 34px;
    height: 34px;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 0.76rem;
  }
  .roll .name {
    font-weight: 600;
    font-size: 0.88rem;
  }
  .seg {
    display: inline-flex;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-control);
    padding: 3px;
    gap: 3px;
  }
  .seg button {
    min-height: 32px;
    padding: 0 12px;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--muted);
  }
  .seg button:hover {
    color: var(--ink);
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
