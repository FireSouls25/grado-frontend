// Política de privacidad: tema guardado de la app y sección actual en el
// índice. Todo lo demás funciona sin este script.
import { theme } from '$lib/theme/theme';

// Suscribirse aplica el tema guardado (claro, oscuro o automático).
theme.subscribe(() => {});

const sections = [...document.querySelectorAll<HTMLElement>('.pv-card h2[id]')];
const links = [...document.querySelectorAll<HTMLAnchorElement>('.toc-side a, .toc-mobile a')];
const current = document.querySelector<HTMLElement>('[data-current]');
const mobile = document.querySelector<HTMLDetailsElement>('.toc-mobile');

function mark(id: string) {
  for (const a of links) {
    const on = a.hash === `#${id}`;
    if (on) a.setAttribute('aria-current', 'true');
    else a.removeAttribute('aria-current');
  }
  const h = sections.find((s) => s.id === id);
  if (current && h) current.textContent = h.textContent?.replace(/^\d+\.\s*/, '') ?? '';
}

// La sección actual es la última cuyo título ya pasó el tercio superior.
function update() {
  const line = window.innerHeight / 3;
  let active = sections[0]?.id ?? '';
  for (const s of sections) {
    if (s.getBoundingClientRect().top <= line) active = s.id;
  }
  // Al final de la página, la última sección aunque sea corta.
  if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
    active = sections[sections.length - 1]?.id ?? active;
  }
  mark(active);
}

let ticking = false;
window.addEventListener(
  'scroll',
  () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      update();
    });
  },
  { passive: true }
);
window.addEventListener('resize', update);
update();

// En móvil, elegir una sección cierra el índice.
for (const a of links) {
  a.addEventListener('click', () => {
    if (mobile) mobile.open = false;
  });
}
