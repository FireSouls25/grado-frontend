<script lang="ts">
  // Formulario compartido de corrección de un llamado: misma pantalla y
  // mismo guardado (PUT /v1/warnings/{id}) en la zona dedicada
  // (Historial de llamados) y en el resumen del estudiante.
  import Dropdown from '$lib/ui/Dropdown.svelte';
  import { t } from '$lib/i18n';
  import type { Warning } from '$lib/api/types';
  import { correctWarning } from './api';

  export let warningId = '';
  export let initialGravity: 'mild' | 'moderate' | 'severe' = 'mild';
  export let initialTitle = '';
  export let initialDescription = '';
  export let onClose: () => void = () => {};
  export let onSaved: (w: Warning) => void = () => {};

  let gravity: 'mild' | 'moderate' | 'severe' = initialGravity;
  let title = initialTitle;
  let description = initialDescription;
  let error = '';
  let saving = false;

  $: gravityOptions = [
    { value: 'mild', label: $t.roster.warnGravityMild },
    { value: 'moderate', label: $t.roster.warnGravityModerate },
    { value: 'severe', label: $t.roster.warnGravitySevere }
  ];

  function selectGravity(e: CustomEvent<string>) {
    const v = e.detail;
    gravity = v === 'moderate' || v === 'severe' ? v : 'mild';
  }

  async function save() {
    error = '';
    if (!title.trim()) {
      error = $t.warnings.needTitle;
      return;
    }
    saving = true;
    try {
      const updated = await correctWarning(warningId, {
        gravity,
        title: title.trim(),
        description: description.trim()
      });
      onSaved(updated);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      saving = false;
    }
  }
</script>

<div class="editform">
  <Dropdown
    label={$t.warnings.fGravity}
    value={gravity}
    options={gravityOptions}
    on:select={selectGravity}
  />
  <label>
    <span>{$t.warnings.fTitle}</span>
    <input type="text" bind:value={title} maxlength="120" />
  </label>
  <label>
    <span>{$t.warnings.fDesc}</span>
    <textarea rows="2" bind:value={description}></textarea>
  </label>
  {#if error}<p class="flash error" role="alert">{error}</p>{/if}
  <div class="actions">
    <button type="button" class="mini" on:click={onClose}>{$t.common.cancel}</button>
    <button type="button" class="mini primary" disabled={saving} on:click={save}>
      {saving ? $t.troll.saving : $t.common.save}
    </button>
  </div>
</div>

<style>
  .editform {
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 12px 14px;
  }
  .editform label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.85rem;
    font-weight: 600;
  }
  .editform input,
  .editform textarea {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 10px 12px;
    font-size: 0.9rem;
    font-family: inherit;
    resize: vertical;
  }
  .flash.error {
    border-radius: var(--radius);
    padding: 10px 12px;
    font-size: 0.85rem;
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
    border-color: transparent;
    color: #fff;
  }
  .mini:disabled {
    opacity: 0.6;
  }
</style>
