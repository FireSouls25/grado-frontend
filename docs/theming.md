# Theming

`src/styles/global.css` es la única fuente de color. Componentes: prohibido
cualquier literal de color (hex, rgb, nombres); siempre `var(--*)`.

## Tokens

Base clara tomada de `reference/schedule example`: fondo azul-gris
suave, superficies blancas, tinta navy, un solo acento azul. Los pasteles
(verde, amarillo, lila, rosa, cielo) solo codifican materias o estados;
nunca acciones (eso es solo el azul).

| Token | Light | Dark |
|---|---|---|
| `--bg` | `#eef1f7` | `#0e1322` |
| `--surface` / `--surface-2` | `#ffffff` / `#f3f5fa` | `#18203a` / `#111a30` |
| `--ink` / `--muted` / `--line` | `#1b2340` / `#68738f` | `#eef1f7` / `#9aa3c0` |
| `--accent` (+ ink/soft) | `#2f6bff` | `#5b8cff` |
| chips pastel bg/ink | claros saturados suaves | profundos con texto claro |

Radios: tarjetas 16px, chips 10px, píldoras 999px. Sombra única
`--shadow`. Tipografía: stack del sistema (offline-first para el APK).

## Modo

`Theme = 'light' | 'dark' | 'auto'`, persistido en `localStorage`
(`grado.theme`). Se aplica con `documentElement.dataset.theme`; `auto`
delega a `prefers-color-scheme` vía CSS y reacciona a cambios del SO.
El `<meta name="theme-color">` se sincroniza para la barra del móvil.
El botón de la barra superior cicla claro → oscuro → auto.

Movimiento: transiciones de 0.1–0.3s solo como respuesta a acciones
(press, sheet, cambio de tema); `prefers-reduced-motion` las anula.
Foco visible siempre con outline del acento.
