<script lang="ts">
  // Hoja compartida para corregir marcas de una llamada: mismo lenguaje
  // que la lista docente (seg de 5 marcas por estudiante + motivo junto
  // a Guardar) y mismo guardado (POST /v1/sessions/{id}/marks por marca).
  // La usan el historial de llamadas y el resumen del estudiante.
  import Sheet from '$lib/ui/Sheet.svelte';
  import { t } from '$lib/i18n';
  import { recordSessionMark } from './api';

  type CorrectMark = '' | 'absence' | 'absence-permission' | 'evasion' | 'late';

  export let open = false;
  export let title: string = '';
  export let subtitle = '';
  export let sessionId = '';
  export let students: { id: string; name: string; current: string }[] = [];
  export let onClose: () => void = () => {};
  export let onSaved: () => void = () => {};

  let sel: Record<string, CorrectMark> = {};
  let note = '';
  let error = '';
  let saving = false;

  function markName(m: string): string {
    if (m === 'absence') return $t.admin.markAbsence;
    if (m === 'absence-permission') return $t.admin.markPermission;
    if (m === 'late') return $t.admin.markLate;
    if (m === 'evasion') return $t.admin.markEvasion;
    return $t.admin.markPresent;
  }

  function reset() {
    sel = {};
    note = '';
    error = '';
    saving = false;
  }

  $: if (open) reset();

  function pick(studentID: string, mark: CorrectMark) {
    sel = { ...sel, [studentID]: mark };
  }

  async function save() {
    error = '';
    const changed = Object.entries(sel);
    if (changed.length === 0) {
      error = $t.troll.shistory.pickStudent;
      return;
    }
    saving = true;
    try {
      for (const [studentID, mark] of changed) {
        await recordSessionMark(sessionId, studentID, mark, mark === '' ? '' : note.trim());
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
          <button type="button" class:present={(sel[s.id] ?? s.current) === ''} aria-pressed={(sel[s.id] ?? s.current) === ''} on:click={() => pick(s.id, '')}>
            {$t.admin.markPresent}
          </button>
          <button type="button" class:absent={(sel[s.id] ?? s.current) === 'absence'} aria-pressed={(sel[s.id] ?? s.current) === 'absence'} on:click={() => pick(s.id, 'absence')}>
            {$t.admin.markAbsence}
          </button>
          <button type="button" class:perm={(sel[s.id] ?? s.current) === 'absence-permission'} aria-pressed={(sel[s.id] ?? s.current) === 'absence-permission'} on:click={() => pick(s.id, 'absence-permission')}>
            {$t.admin.markPermission}
          </button>
          <button type="button" class:evasion={(sel[s.id] ?? s.current) === 'evasion'} aria-pressed={(sel[s.id] ?? s.current) === 'evasion'} on:click={() => pick(s.id, 'evasion')}>
            {$t.admin.markEvasion}
          </button>
          <button type="button" class:late={(sel[s.id] ?? s.current) === 'late'} aria-pressed={(sel[s.id] ?? s.current) === 'late'} on:click={() => pick(s.id, 'late')}>
            {$t.admin.markLate}
          </button>
        </span>
      </li>
    {/each}
  </ul>
  {#if error}<p class="flash error" role="alert">{error}</p>{/if}
  <div class="actions">
    <input
      class="motivo"
      type="text"
      placeholder={$t.troll.shistory.correctNotePlaceholder}
      aria-label={$t.troll.shistory.correctNoteLabel}
      bind:value={note}
      maxlength="140"
    />
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
  }
  .seg button.present {
    background: var(--chip-green-bg);
    color: var(--chip-green-ink);
  }
  .seg button.absent {
    background: var(--chip-pink-bg);
    color: var(--g-grave-ink);
  }
  .seg button.perm {
    background: var(--m-permission-bg);
    color: var(--m-permission);
  }
  .seg button.evasion {
    background: var(--chip-purple-bg);
    color: var(--chip-purple-ink);
  }
  .seg button.late {
    background: var(--chip-yellow-bg);
    color: var(--chip-yellow-ink);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }
  .motivo {
    flex: 1;
    min-width: 180px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 10px 12px;
    min-height: 48px;
    font-size: 0.9rem;
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
