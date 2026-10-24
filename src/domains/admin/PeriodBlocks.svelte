<script lang="ts">
  // Bloques de periodos: un bloque por periodo con sus dos fechas
  // (inicio y fin). Se usa al crear y al editar un año sin salones;
  // en readonly pinta el detalle del año con fechas claras.
  export let ranges: { start: string; end: string }[] = [];
  export let disabled = false;
  export let readonly = false;
  export let min = '';
  export let max = '';
  export let titlePrefix = 'Periodo';
  export let startLabel = 'Inicio';
  export let endLabel = 'Fin';

  function clearDate(iso: string): string {
    const d = new Date(`${iso}T12:00:00`);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
  }
</script>

{#each ranges as r, i (i)}
  <section class="pblock" aria-label={`${titlePrefix} ${i + 1}`}>
    <h4>{titlePrefix} {i + 1}</h4>
    {#if readonly}
      <dl class="pdates">
        <div>
          <dt>{startLabel}</dt>
          <dd>{clearDate(r.start)}</dd>
        </div>
        <div>
          <dt>{endLabel}</dt>
          <dd>{clearDate(r.end)}</dd>
        </div>
      </dl>
    {/if}
    {#if !readonly}
      <div class="pgrid">
        <label>{startLabel}
          <input
            type="date" min={min || undefined} max={max || undefined}
            aria-label={`${startLabel} ${titlePrefix} ${i + 1}`}
            bind:value={r.start} {disabled}
          />
        </label>
        <label>{endLabel}
          <input
            type="date" min={min || undefined} max={max || undefined}
            aria-label={`${endLabel} ${titlePrefix} ${i + 1}`}
            bind:value={r.end} {disabled}
          />
        </label>
      </div>
    {/if}
  </section>
{/each}

<style>
  .pblock {
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .pblock h4 {
    margin: 0;
    font-size: 0.95rem;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--line);
  }
  .pdates {
    margin: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  @media (max-width: 560px) {
    .pdates {
      grid-template-columns: 1fr;
    }
  }
  .pdates div {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .pdates dt {
    font-size: 0.78rem;
    color: var(--muted);
    font-weight: 600;
  }
  .pdates dd {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
  }
  .pgrid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  @media (max-width: 560px) {
    .pgrid {
      grid-template-columns: 1fr;
    }
  }
  .pgrid label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.85rem;
    font-weight: 600;
  }
  .pgrid input {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 10px 12px;
    min-height: 52px;
    width: 100%;
  }
  .pgrid input:focus {
    outline: 2px solid var(--accent);
    outline-offset: 0;
    border-color: var(--accent);
  }
</style>
