<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import { site } from './site';

  const year = new Date().getFullYear();
  const years = year > site.since ? `${site.since}–${year}` : `${site.since}`;
  const school = site.school;
  const webLabel = school.web.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
</script>

<footer class="site-footer">
  <div class="cols">
    <section aria-labelledby="ft-school">
      <p class="eyebrow" id="ft-school">Institución</p>
      <p class="name">{school.legalName}</p>
      <ul>
        {#if school.address}
          <li><Icon name="pin" /><span>{school.address}</span></li>
        {/if}
        {#if school.phone}
          <li>
            <Icon name="phone" /><a href={`tel:${school.phone.replace(/\s/g, '')}`}>{school.phone}</a>
          </li>
        {/if}
        {#if school.email}
          <li><Icon name="mail" /><a href={`mailto:${school.email}`}>{school.email}</a></li>
        {/if}
        {#if school.web}
          <li><Icon name="globe" /><a href={school.web} rel="noopener" target="_blank">{webLabel}</a></li>
        {/if}
      </ul>
    </section>

    <section aria-labelledby="ft-platform">
      <p class="eyebrow" id="ft-platform">Plataforma</p>
      <p class="name">{site.product}</p>
      <ul>
        <li><Icon name="shield" /><a href={site.privacyPath}>Política de privacidad</a></li>
        <li><Icon name="mail" /><a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a></li>
      </ul>
    </section>
  </div>

  <div class="bottom">
    <p>Acceso solo para personal del colegio: las cuentas las crea la institución, no hay registro abierto.</p>
    <p class="copy">© {years} {site.team.join(' y ')} · {site.brand}</p>
  </div>
</footer>

<style>
  .site-footer {
    margin-top: 28px;
    padding-top: 20px;
    border-top: 1px solid var(--line);
    color: var(--muted);
    font-size: 0.82rem;
    line-height: 1.45;
  }
  .cols {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 20px;
  }
  .eyebrow {
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    margin-bottom: 4px;
  }
  .name {
    color: var(--ink);
    font-weight: 600;
    font-size: 0.9rem;
    margin-bottom: 8px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  li {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    min-width: 0;
  }
  li :global(svg) {
    flex: none;
    width: 15px;
    height: 15px;
    margin-top: 1px;
    color: var(--muted);
  }
  li span,
  li a {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  a {
    color: var(--accent);
    font-weight: 600;
    text-decoration: none;
  }
  a:hover {
    text-decoration: underline;
  }
  .bottom {
    margin-top: 20px;
    padding-top: 14px;
    border-top: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    text-align: center;
  }
  .copy {
    font-size: 0.76rem;
  }

  @media (min-width: 640px) {
    .cols {
      grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
      gap: 32px;
    }
  }
</style>
