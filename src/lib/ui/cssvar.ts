/** Read a theme token at runtime so canvas/SVG code (ECharts) uses the
 *  same single source of truth as CSS. Falls back to `fallback`. */
export function cssVar(name: string, fallback = ''): string {
  if (typeof window === 'undefined') return fallback;
  return (
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
    fallback
  );
}
