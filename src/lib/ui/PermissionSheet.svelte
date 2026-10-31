<script lang="ts">
  // Popup compartido para pedir el motivo de un permiso o un descargo:
  // lo usan la lista de docentes y el resumen del estudiante con los
  // mismos textos y el mismo comportamiento (motivo obligatorio).
  import Sheet from './Sheet.svelte';
  import { t } from '$lib/i18n';

  export let open = false;
  export let title: string = '';
  export let subtitle = '';
  export let reasonLabel = '';
  export let reasonPlaceholder = '';
  export let initial = '';
  export let onClose: () => void = () => {};
  export let onSave: (reason: string) => void | Promise<unknown> = () => {};

  let reason = '';
  let error = '';
  let saving = false;
  let wasOpen = false;
  $: if (open && !wasOpen) {
    reason = initial;
    error = '';
    saving = false;
  }
  $: wasOpen = open;

  async function submit() {
    error = '';
    if (!reason.trim()) {
      error = $t.troll.shistory.needPermissionReason;
      return;
    }
    saving = true;
    try {
      await onSave(reason.trim());
      onClose();
    } catch (e) {
      error = e instanceof Error ? e.message : $t.common.loadError;
    } finally {
      saving = false;
    }
  }
</script>

<Sheet {open} {title} {onClose}>
  <div class="sheet-body">
    {#if subtitle}<p class="muted">{subtitle}</p>{/if}
    <label class="reason">
      <span>{reasonLabel || $t.troll.shistory.permissionReasonLabel}</span>
      <textarea rows={3} bind:value={reason} placeholder={reasonPlaceholder || $t.troll.shistory.permissionReasonPlaceholder}></textarea>
    </label>
    {#if error}<p class="flash error" role="alert">{error}</p>{/if}
    <div class="form-actions">
      <button type="button" class="btn" on:click={onClose}>{$t.common.cancel}</button>
      <button type="button" class="btn btn-primary" disabled={saving} on:click={submit}>
        {$t.common.save}
      </button>
    </div>
  </div>
</Sheet>

<style>
  .sheet-body {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .muted {
    color: var(--muted);
    font-size: 0.84rem;
  }
  .reason {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 0.82rem;
    font-weight: 500;
    color: var(--muted);
  }
  .reason textarea {
    border: 1px solid var(--control);
    border-radius: var(--radius-control);
    background: var(--surface);
    padding: 10px 12px;
    font-size: 0.85rem;
    font-family: inherit;
    color: var(--ink);
    width: 100%;
    resize: vertical;
  }
  .reason textarea:focus {
    outline: none;
    border-color: var(--accent);
  }
  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
    padding-top: 12px;
    border-top: 1px solid var(--line);
  }
  .flash.error {
    background: var(--g-grave-bg);
    color: var(--g-grave-ink);
    font-weight: 600;
    font-size: 0.84rem;
    border-radius: var(--radius-control);
    padding: 8px 12px;
  }
</style>
