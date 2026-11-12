<script lang="ts">
  import { site } from './site';

  const year = new Date().getFullYear();
  const years = year > site.since ? `${site.since}–${year}` : `${site.since}`;
  const school = site.school;
</script>

<footer class="site-footer">
  <p class="who">
    <strong>{site.product}</strong> · {school.name}
  </p>
  <p>
    Acceso solo para personal del colegio: las cuentas las crea la institución, no hay registro abierto.
  </p>
  {#if school.web || school.email || school.phone}
    <p class="school">
      Colegio:
      {#if school.web}<a href={school.web} rel="noopener" target="_blank">sitio web</a>{/if}
      {#if school.email}<a href={`mailto:${school.email}`}>{school.email}</a>{/if}
      {#if school.phone}<a href={`tel:${school.phone.replace(/\s/g, '')}`}>{school.phone}</a>{/if}
    </p>
  {/if}
  <nav aria-label="Información legal">
    <a href={site.privacyPath}>Política de privacidad</a>
    <span aria-hidden="true">·</span>
    <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>
  </nav>
  <p class="copy">© {years} {site.team.join(' y ')} · {site.brand}</p>
</footer>

<style>
  .site-footer {
    margin-top: 24px;
    padding-bottom: 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    color: var(--muted);
    font-size: 0.82rem;
    text-align: center;
    line-height: 1.45;
  }
  .who {
    font-size: 0.88rem;
  }
  .who strong {
    color: var(--ink);
  }
  nav,
  .school {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 4px 8px;
  }
  a {
    color: var(--accent);
    font-weight: 600;
    text-decoration: none;
    overflow-wrap: anywhere;
  }
  a:hover {
    text-decoration: underline;
  }
  .copy {
    margin-top: 4px;
    font-size: 0.78rem;
  }
</style>
