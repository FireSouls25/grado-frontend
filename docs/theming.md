# Theming

`src/styles/global.css` es la única fuente de color. Componentes: prohibido
cualquier literal de color (hex, rgb, nombres); siempre `var(--*)`.
Autoridad visual: `docs/diseno.md`.

## Tokens

Papel cálido + tinta casi negra + un terracota para la acción (claro);
gris violeta contenido estilo Dracula (oscuro).

| Token | Claro | Oscuro |
|---|---|---|
| `--bg` | crema `94%` | gris `17%` |
| `--surface` / `--surface-2` / `--card` | `#fff` / `97%` / `95.5%` | `11%` (lámina, casi negro) / `14%` / `21%` |
| `--tint` | `91%` | `18%` |
| `--ink` / `--ink-soft` / `--muted` / `--line` | `12%` / `32%` / `60%` / `88%` | `95%` / `76%` / `60%` / `26%` |
| `--accent` (+ ink/soft) | terracota `52%` | naranja `68%` |
| `--coral` | puntos de datos claro | rosa Dracula oscuro |
| `--g-leve/medio/grave` (-bg/-ink) | azul / amarillo / rojo | cian / amarillo / rojo Dracula |
| `--m-present/absent/evasion/late` | tinta / grises cálidos | tinta clara / grises neutros |
| `--chip-*` | compatibilidad: amarillos/rosas/cielos delegan a `--g-*` | idem en oscuro |

Radios: tarjetas 16px, chips 10px, píldoras 999px. Sombra sutil en
claro (`0 1px 2px`), profunda solo en oscuro. Tipografía: stack del
sistema (offline-first para el APK); `h1` con tracking `-0.01em` y
numerales tabulares.

## Modo

`Theme = 'light' | 'dark' | 'auto'`, persistido en `localStorage`
(`grado.theme`). Se aplica con `documentElement.dataset.theme`; `auto`
delega a `prefers-color-scheme` vía CSS y reacciona a cambios del SO.
El `<meta name="theme-color">` se sincroniza para la barra del móvil.
El botón de la barra superior cicla claro → oscuro → auto.

Movimiento: transiciones de 0.1–0.3s solo como respuesta a acciones
(press, sheet, cambio de tema); `prefers-reduced-motion` las anula.
Foco visible siempre con outline del acento.

## Responsive (Tauri + Android desde el día uno)

La misma base compila a web, escritorio y APK (Tauri 2): todo layout
nace mobile-first.

- Base 360px: una columna, rail y paneles apilados, tablas → filas.
- Controles táctiles ≥ 44px de alto (tabs, búsqueda, píldoras).
- `100svh` y safe-area en móviles con notch; sin hover como único
  affordance (todo clicable también es tocable y visible).
- Desktop: lámina centrada con tope ancho, rail lateral sticky.
