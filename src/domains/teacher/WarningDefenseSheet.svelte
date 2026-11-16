<script lang="ts">
  // Descargo del estudiante sobre un llamado de atención: la misma hoja
  // para el docente (Observaciones) y para coordinación y secretaría
  // (Llamados y ficha del estudiante).
  import Sheet from '$lib/ui/Sheet.svelte';
  import { t } from '$lib/i18n';
  import { notify } from '$lib/ui/notice';
  import { guarded } from '$lib/nav';
  import { ApiError } from '$lib/api/types';
  import { defendWarning } from './api';

  export let warningID: string;
  export let title = '';
  export let subtitle = '';
  export let current = '';
  /** Dentro de otra hoja: el formulario va en línea, sin abrir otra. */
  export let inline = false;
  export let onClose: () => void = () => {};
  export let onSaved: (text: string) => void = () => {};

  let text = current;
  let saving = false;
  let error = '';

  async function save(clear = false) {
    if (saving) return;
    const value = clear ? '' : text.trim();
    if (!clear && !value) {
      error = $t.warningDefense.needText;
      return;
    }
    saving = true;
    error = '';
    try {
      await guarded(() => defendWarning(warningID, value));
      notify(clear ? $t.warningDefense.cleared : $t.warningDefense.saved);
      onSaved(value);
    } catch (err) {
      error = err instanceof ApiError ? err.message : $t.common.loadError;
    } finally {
      saving = false;
    }
  }
</script>

{#snippet form()}
  <div class="form">
    {#if title}<p class="what"><strong>{title}</strong>{#if subtitle}<small>{subtitle}</small>{/if}</p>{/if}
    <p class="hint">{$t.warningDefense.hint}</p>
    <label class="field">
      <span>{$t.studentSummary.defenseReasonLabel}</span>
      <textarea rows="4" maxlength="1000" bind:value={text} placeholder={$t.warningDefense.placeholder}></textarea>
    </label>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <div class="actions">
      {#if current}
        <button type="button" class="btn" disabled={saving} on:click={() => save(true)}>{$t.warningDefense.clear}</button>
      {/if}
      <button type="button" class="btn" on:click={onClose}>{$t.common.cancel}</button>
      <button type="button" class="btn btn-primary" disabled={saving} on:click={() => save()}>
        {saving ? '…' : $t.common.save}
      </button>
    </div>
  </div>
{/snippet}

{#if inline}
  <div class="inlinebox">{@render form()}</div>
{:else}
  <Sheet open title={$t.warningDefense.title} {onClose}>{@render form()}</Sheet>
{/if}

<style>
  .inlinebox {
    border: 1px solid var(--line);
    border-radius: var(--radius-control);
    padding: 10px;
    background: var(--surface-2);
  }
  .form {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .what {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
  }
  .what small,
  .hint {
    color: var(--muted);
    font-size: 0.8rem;
    margin: 0;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--ink-soft);
  }
  .field textarea {
    font: inherit;
    font-weight: 400;
    color: var(--ink);
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 10px 12px;
    resize: vertical;
  }
  .error {
    color: var(--g-grave-ink);
    font-size: 0.8rem;
    margin: 0;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    flex-wrap: wrap;
  }
</style>
