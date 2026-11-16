<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { site } from './site';

  // Pista de scroll: el pie queda bajo el borde de la pantalla y es fácil
  // no verlo. Mientras no esté a la vista, una píldora abajo al centro
  // invita a bajar; se va sola cuando el pie aparece o al empezar a bajar.
  let footerEl: HTMLElement | null = null;
  let hint = false;
  let scrolled = false;

  onMount(() => {
    if (!footerEl || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      ([entry]) => {
        hint = !entry.isIntersecting;
      },
      { threshold: 0.05 }
    );
    io.observe(footerEl);
    const onScroll = () => {
      if (window.scrollY > 80) scrolled = true;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
  });

  function goDown() {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    footerEl?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }

  const year = new Date().getFullYear();
  const years = year > site.since ? `${site.since}–${year}` : `${site.since}`;
  const school = site.school;
  const webLabel = school.web.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
</script>

<button
  type="button"
  class="scrollhint"
  class:show={hint && !scrolled}
  aria-hidden={!(hint && !scrolled)}
  tabindex={hint && !scrolled ? 0 : -1}
  on:click={goDown}
>
  <span>Información de la institución</span>
  <span class="arrow" aria-hidden="true"><Icon name="next" /></span>
</button>

<footer class="site-footer" bind:this={footerEl}>
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
  .scrollhint {
    position: fixed;
    left: 50%;
    bottom: calc(18px + env(safe-area-inset-bottom));
    z-index: 30;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px 8px 16px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: color-mix(in srgb, var(--surface) 88%, transparent);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.12);
    color: var(--ink-soft);
    font-size: 0.8rem;
    font-weight: 600;
    opacity: 0;
    pointer-events: none;
    transform: translate(-50%, 12px);
    transition:
      opacity 0.3s var(--ease-out),
      transform 0.3s var(--ease-out);
  }
  .scrollhint.show {
    opacity: 1;
    pointer-events: auto;
    transform: translate(-50%, 0);
  }
  .scrollhint:hover {
    color: var(--ink);
    border-color: var(--ink-soft);
  }
  .arrow {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--accent-ink);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .arrow :global(svg) {
    width: 14px;
    height: 14px;
    transform: rotate(90deg);
  }
  .scrollhint.show .arrow {
    animation: nudge 1.6s var(--ease-out) 0.6s infinite;
  }
  @keyframes nudge {
    0%,
    60%,
    100% {
      transform: translateY(0);
    }
    30% {
      transform: translateY(4px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .scrollhint,
    .scrollhint.show .arrow {
      transition: none;
      animation: none;
    }
  }
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
