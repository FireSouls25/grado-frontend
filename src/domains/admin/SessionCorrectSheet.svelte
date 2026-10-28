<script lang="ts">
  // Hoja compartida para corregir marcas de una llamada: mismo lenguaje
  // que la lista docente y mismo guardado (POST /v1/sessions/{id}/marks
  // por marca). El segmento trae los 4 estados y el permiso va aparte:
  // solo se activa en falta y exige su motivo, que queda registrado.
  // La usan el historial de llamadas y el resumen del estudiante
  // (secretaría y admin; el docente no corrige).
  import Sheet from '$lib/ui/Sheet.svelte';
  import { t } from '$lib/i18n';
  import { recordSessionMark } from './api';

  type CorrectMark = '' | 'absence' | 'absence-permission' | 'evasion' | 'late';
  type SegMark = '' | 'absence' | 'evasion' | 'late';

  export let open = false;
  export let title: string = '';
  export let subtitle = '';
  export let sessionId = '';
  export let students: { id: string; name: string; current: string }[] = [];
  export let onClose: () => void = () => {};
  export let onSaved: () => void = () => {};

  let sel: Record<string, SegMark> = {};
  let perm: Record<string, boolean> = {};
  let note = '';
  let error = '';
  let saving = false;

  function baseOf(current: string): SegMark {
    if (current === 'evasion') return 'evasion';
    if (current === 'late') return 'late';
    if (!current) return '';
    return 'absence';
  }

  function permInitOf(current: string): boolean {
    return current === 'absence-permission';
  }

  function segOf(id: string, current: string): SegMark {
    return sel[id] ?? baseOf(current);
  }

  function permOf(id: string, current: string): boolean {
    return perm[id] ?? permInitOf(current);
  }

  function finalOf(id: string, current: string): CorrectMark {
    if (permOf(id, current)) return 'absence-permission';
    return segOf(id, current);
  }

  function reset() {
    sel = {};
    perm = {};
    note = '';
    error = '';
    saving = false;
  }

  $: if (open) reset();

  function pick(studentID: string, mark: SegMark) {
    sel = { ...sel, [studentID]: mark };
  }

  function togglePerm(studentID: string) {
    const cur = students.find((s) => s.id === studentID)?.current ?? '';
    perm = { ...perm, [studentID]: !permOf(studentID, cur) };
  }

  $: anyPermOn = students.some((s) => (perm[s.id] ?? s.current === 'absence-permission'));

  async function save() {
    error = '';
    const changed = students.filter((s) => finalOf(s.id, s.current) !== s.current);
    if (changed.length === 0) {
      error = $t.troll.shistory.pickStudent;
      return;
    }
    if (changed.some((s) => finalOf(s.id, s.current) === 'absence-permission') && !note.trim()) {
      error = $t.troll.shistory.needPermissionReason;
      return;
    }
    saving = true;
    try {
      for (const s of changed) {
        const mark = finalOf(s.id, s.current);
        await recordSessionMark(sessionId, s.id, mark, mark === 'absence-permission' ? note.trim() : '');
      }
      onSaved();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      saving = false;
    }
  }
</script>

<Sheet {open} {title} onClose={() => { reset(); onClose(); }}>
  {#if subtitle}<p class="muted">{subtitle}</p>{/if}
  <ul class="roll">
    {#each students as s (s.id)}
      <li>
        <span class="who">
          <span class="avatar" aria-hidden="true">
            {s.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
          </span>
          <span class="name">{s.name}</span>
        </span>
        <span class="seg" role="group" aria-label={s.name}>
          <button type="button" class:present={(sel[s.id] ?? baseOf(s.current)) === ''} aria-pressed={(sel[s.id] ?? baseOf(s.current)) === ''} on:click={() => pick(s.id, '')}>
            {$t.roster.present}
          </button>
          <button type="button" class:absent={(sel[s.id] ?? baseOf(s.current)) === 'absence'} aria-pressed={(sel[s.id] ?? baseOf(s.current)) === 'absence'} on:click={() => pick(s.id, 'absence')}>
            {$t.roster.absentShort}
          </button>
          <button type="button" class:evasion={(sel[s.id] ?? baseOf(s.current)) === 'evasion'} aria-pressed={(sel[s.id] ?? baseOf(s.current)) === 'evasion'} on:click={() => pick(s.id, 'evasion')}>
            {$t.roster.evasion}
          </button>
          <button type="button" class:late={(sel[s.id] ?? baseOf(s.current)) === 'late'} aria-pressed={(sel[s.id] ?? baseOf(s.current)) === 'late'} on:click={() => pick(s.id, 'late')}>
            {$t.roster.late}
          </button>
        </span>
        <button
          type="button"
          class="permbtn"
          class:on={(perm[s.id] ?? s.current === 'absence-permission')}
          aria-pressed={(perm[s.id] ?? s.current === 'absence-permission')}
          disabled={(sel[s.id] ?? baseOf(s.current)) !== 'absence' && !(perm[s.id] ?? s.current === 'absence-permission')}
          title={$t.troll.shistory.permissionHint}
          on:click={() => togglePerm(s.id)}
        >
          {$t.roster.permission}
        </button>
      </li>
    {/each}
  </ul>
  {#if anyPermOn}
    <label class="reason">
      <span>{$t.troll.shistory.permissionReasonLabel}</span>
      <input
        class="motivo"
        type="text"
        placeholder={$t.troll.shistory.permissionReasonPlaceholder}
        aria-label={$t.troll.shistory.permissionReasonLabel}
        bind:value={note}
        maxlength="140"
      />
    </label>
  {/if}
  {#if error}<p class="flash error" role="alert">{error}</p>{/if}
  <div class="actions">
    <button type="button" class="mini" on:click={() => { reset(); onClose(); }}>{$t.common.cancel}</button>
    <button type="button" class="mini primary" disabled={saving} on:click={save}>
      {saving ? $t.troll.saving : $t.common.save}
    </button>
  </div>
</Sheet>

<style>
  .muted {
    color: var(--muted);
    font-size: 0.9rem;
  }
  .roll {
    list-style: none;
    margin: 0 0 12px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-height: 50vh;
    overflow-y: auto;
  }
  .roll li {
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 12px 14px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 12px;
  }
  .who {
    flex: 1;
    min-width: 150px;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .avatar {
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
  .name {
    font-weight: 700;
    font-size: 1rem;
  }
  .seg {
    flex: 1 1 100%;
    display: flex;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 4px;
    gap: 4px;
    flex-wrap: wrap;
  }
  .seg button {
    min-height: 44px;
    padding: 6px 14px;
    border-radius: var(--radius-pill);
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--muted);
    flex: 1;
  }
  .seg button.present {
    background: var(--chip-green-bg);
    color: var(--chip-green-ink);
  }
  .seg button.absent {
    background: var(--chip-pink-bg);
    color: var(--g-grave-ink);
  }
  .seg button.evasion {
    background: var(--chip-purple-bg);
    color: var(--chip-purple-ink);
  }
  .seg button.late {
    background: var(--chip-yellow-bg);
    color: var(--chip-yellow-ink);
  }
  .permbtn {
    flex: 1 1 100%;
    min-height: 44px;
    padding: 6px 14px;
    border-radius: var(--radius-pill);
    border: 1px solid var(--line);
    background: var(--surface);
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--muted);
  }
  .permbtn.on {
    background: var(--m-permission-bg, #e8f0fe);
    color: var(--m-permission, #1a56db);
    border-color: transparent;
  }
  .permbtn:disabled {
    opacity: 0.45;
  }
  .reason {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 0.85rem;
    font-weight: 700;
    margin-bottom: 12px;
  }
  .reason .motivo {
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 10px 12px;
    min-height: 48px;
    font-size: 0.9rem;
    font-weight: 400;
  }
  .flash.error {
    border-radius: var(--radius);
    padding: 10px 12px;
    font-size: 0.9rem;
    margin: 0;
    background: var(--chip-pink-bg);
    color: var(--g-grave-ink);
    font-weight: 600;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }
  .mini {
    border: 1px solid var(--line);
    border-radius: var(--radius-pill);
    padding: 8px 16px;
    min-height: 44px;
    font-weight: 600;
    background: var(--surface);
  }
  .mini.primary {
    background: var(--accent);
    color: var(--accent-ink);
    border-color: transparent;
  }
  .mini:disabled {
    opacity: 0.6;
  }
</style>
