// Fechas calendario sin desfase de zona horaria.
//
// El backend guarda los días (sesiones, nacimientos) como medianoche UTC
// ("2026-10-30T00:00:00Z"). Hacer `new Date(valor)` y formatear en hora
// local (UTC-5) los corre al día anterior. Estas funciones interpretan los
// primeros 10 caracteres como fecha calendario local: el 30 siempre es 30.
//
// Usar SOLO para días. Los instantes con hora real (llamados, revisiones)
// se siguen parseando con `new Date` para conservar su hora local.

/** Y-M-D locales desde un ISO fecha u hora, o null si no hay día válido. */
export function calendarDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}
