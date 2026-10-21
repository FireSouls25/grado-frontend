# Referencia visual — Consola del administrador

**No forma parte de la aplicación.** Nada en `src/` importa este
directorio: es la maqueta aprobada de cómo debe verse y sentirse la
consola admin. Sirve para mirar, copiar decisiones y auditar la
implementación real.

- `ConsolaAdmin.svelte` — la consola validada (variante E del prototipo):
  sidebar en crema, lámina blanca, rail Pendientes, gráficas semánticas.
- `mock.ts` — datos demo que usaba la maqueta.

## Reglas que la maqueta deja (resumen; autoridad completa en `docs/diseno.md`)

1. Sidebar en crema; blancos solo en user-card, búsqueda y item activo.
2. Header en crema (título + controles + tabs segmentados a 44px).
3. Contenido en lámina blanca, redondeo solo arriba (24px).
4. Tarjetas interiores en tono exterior para recortar sobre la lámina.
5. Cada gráfica usa los colores de lo que mide (regla madre).
6. Severidad azul/amarillo/rojo en pills, puntos, barras y leyendas.
7. Acciones primarias en píldora terracota rellena; sin flechas `→`.
8. Iconos en insignia tintada 26px, trazo 15px, sin acento.
9. Atajo de búsqueda `/`, sin asumir plataforma.
10. Responsive primero: 360px una columna, rail apilado, táctil ≥ 44px.
