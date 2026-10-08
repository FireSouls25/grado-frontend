# Identidad visual — Consola del administrador

Viva: nace del prototipo `src/proto/` (variante E, validada contra
`reference/cosmos.png`) y manda sobre `global.css` y los dominios admin
cuando haya conflicto. Tono: español, app estándar, sobrio colegial.

## Mundo

Papel cálido + tarjetas blancas planas + tinta casi negra + un solo
terracota para la acción. La referencia manda: nada de sombras pesadas,
nada de degradados, nada de vidrio. Bordes hairline (`--line`) separan;
el color informa, no decora.

- Fondo exterior crema, dashboard en lámina blanca con esquinas
  superiores redondeadas (24px) que corre hasta el final de la página.
- Barra lateral en crema, sin tarjeta: solo user-card, búsqueda y el
  item activo son blancos.
- Títulos grandes con tracking apretado (`-0.03em`, peso 550);
  numerales siempre tabulares.

## Tokens (tema claro)

| Token | Valor | Uso |
|---|---|---|
| `--bg` | `hsl(36, 9%, 94%)` | exterior crema |
| `--surface` | `#fff` | lámina, rail, inputs |
| `--surface-2` | `hsl(40, 12%, 97%)` | hundidos suaves |
| `--card` | `hsl(44, 20%, 95.5%)` | tarjetas **dentro** de la lámina |
| `--tint` | `hsl(45, 8%, 91%)` | pistas, chips neutros, rieles |
| `--ink` / `--ink-soft` / `--muted` | `10%` / `28%` / `52%` neutros | texto / secundario / terciario |
| `--line` | `hsl(45, 10%, 88%)` | hairlines |
| `--grid` | `hsl(43, 12%, 78%)` | líneas de la grilla de horario |
| `--accent` / `--accent-ink` / `--accent-soft` | terracota `hsl(28, 40%, 52%)` | **acción y atención**, nada más |
| `--coral` | `hsl(343, 68%, 48%)` | puntos de datos en series |

Neutros casi sin saturación (≤10%): el amarillo de la versión anterior
quedó prohibido por muestreo de la referencia.

## Regla madre del color

**Cada gráfica usa los colores de lo que mide.** Una gráfica de
gravedad usa gravedad; una de inasistencia, inasistencia; nunca la
paleta corporativa de adorno. Excepción única: las series de tiempo
usan línea terracota + puntos coral (voz de la marca), con la serie
anterior en línea punteada gris.

## Severidad (llamados y faltas)

Azul leve, amarillo medio, rojo grave — en tonos que conviven con el
papel. La misma terna en pills, puntos, barras y leyendas, sin excepción.

| Gravedad | Fondo | Tinta |
|---|---|---|
| Leve (azul) | `hsl(203, 70%, 91%)` | `hsl(198, 72%, 45%)` |
| Medio (amarillo) | `hsl(46, 75%, 87%)` | `hsl(45, 85%, 31%)` |
| Grave (rojo) | `hsl(6, 70%, 91%)` | `hsl(0, 60%, 51%)` |

Barras de gravedad: relleno sólido en tinta de su nivel.
Tasa por salón bajo el umbral (85%): tinta grave; el resto, tinta.

## Asistencia (marcas)

| Marca | Color | Notas |
|---|---|---|
| Presente | verde `hsl(104, 42%, 39%)` | domina la dona; es el estado base |
| Inasistencia | marrón `hsl(26, 55%, 45%)` | tierra, nunca rojo |
| Evasión | violeta `hsl(249, 17%, 56%)` | deliberado y distinto |
| Atraso | acero `hsl(202, 38%, 53%)` | informativo |

La inasistencia no lleva rojo a propósito: el rojo está reservado a
gravedad grave. Un estudiante con muchas inasistencias se señala con su
tasa bajo umbral (tinta grave + delta), no tiñendo la marca.

## Acciones y estados

- Acción primaria en contexto: píldora rellena terracota
  (`Armar`, `Ver lista`, `Revisar`, `Llamar acudiente`).
- Acción secundaria: píldora con borde hairline sobre hundido
  (`Abrir lista`, `Asignar`, `Ficha`, `Abrir ficha`).
- Prohibidas las flechas `→` como affordance: el botón ya dice la
  intención. Prohibido el `⌘`: el atajo de búsqueda es `/`
  (neutral por plataforma) y debe funcionar de verdad.
- Pendiente cumplido: checkbox relleno tinta + título tachado.
- Tasa: `%` grande tabular + minibarra + delta contra el umbral
  (`−14 del 85%`, `+3 sobre 85%`); bajo umbral en tinta grave.

## Iconografía

- Set de trazo fino 20px (`lib/ui/Icon.svelte`); en insignias se
  renderiza a 15px dentro de un badge de 26px con fondo `--tint`.
- Iconos en insignia: `--ink-soft`, nunca acento. El acento es para
  acciones y severidad, no para decorar iconos.
- Conteo y porcentaje siempre juntos: ningún número de riesgo viaja
  sin su contexto (salón, tendencia o delta).

## Componentes

- **Lámina**: `background: surface; border: line; radius 24px 24px 0 0;
  border-bottom: 0`. El header (título, controles, tabs) vive en crema
  **encima** de la lámina, nunca dentro.
- **Tarjetas en lámina**: fondo `--card`, borde hairline, radio 14–16px,
  sin sombra. Detalles expandibles: inserto blanco (`--surface`).
- **Rail Pendientes**: tarjeta `--rail` (blanca en claro), sticky,
  coronada por su contador (`N abiertos`); su borde superior se alinea
  con la barra de tabs.
- **Tabs Overview/Salones/Historial**: control segmentado (pista tint,
  activo en píldora blanca con sombra); alineado en fila con búsqueda,
  periodo y tema a 44px de alto.
- **Filas de riesgo**: rank + avatar con iniciales + nombre/tendencia +
  píldora de salón + conteos separados por medida + bloque de tasa +
  píldora de gravedad. En móvil solo rank, avatar, nombre y tasa.
- **Horario**: cada bloque nombra materia, `Salón X · año`, docente
  (`Prof. …`) y aula explícitos; estados `Finalizada / Ahora /
  Siguiente` (el `Ahora` es el único relleno tinta).

## Tema oscuro (Dracula contenido)

Mismas reglas, paleta gris-violeta contenida. La lámina es lo más
cercano al negro; el exterior queda un paso más claro (gris); las
tarjetas flotan entre ambos. Misma jerarquía, mismos radios, mismos
hábitos de color: terracota→naranja satura la acción, rosa Dracula
marca los puntos de datos, severidad en cian/amarillo/rojo Dracula.

| Token | Valor | Uso |
|---|---|---|
| `--bg` | `hsl(230, 10%, 17%)` | exterior gris |
| `--surface` | `hsl(230, 12%, 11%)` | lámina, lo más cercano al negro |
| `--surface-2` | `hsl(230, 10%, 14%)` | hundidos |
| `--card` | `hsl(230, 10%, 21%)` | tarjetas dentro de la lámina |
| `--tint` | `hsl(230, 10%, 18%)` | pistas, chips neutros, rieles |
| `--ink` / `--ink-soft` / `--muted` | `#f8f8f2`-ish / `76%` / lavanda Dracula | texto y terciarios |
| `--line` | `hsl(45, 6%, 26%)` | hairlines neutros, nunca azules |
| `--grid` | `hsl(45, 6%, 34%)` | líneas de la grilla de horario |
| `--accent` | naranja Dracula `hsl(31, 95%, 68%)` | acción y atención |
| `--coral` | rosa Dracula `hsl(330, 100%, 73%)` | puntos de datos |
| Leve / Medio / Grave | cian `80%` / amarillo `77%` / rojo `71%` sobre tintes `20–22%` | severidad |
| Presente / resto | tinta clara / grises neutros ascendentes | asistencia |
