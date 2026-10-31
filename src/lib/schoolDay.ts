// Día lectivo según el servidor (YYYY-MM-DD).
//
// El reloj del dispositivo puede mentir (adelantado, atrasado, otra zona)
// y la app mostraba "hoy" con él: listas retomadas del día equivocado y
// rótulos que no coincidían con el admin. El backend es la única fuente
// de "hoy"; si no responde se usa la fecha local como respaldo.
import { api } from '$lib/api/client';

let cached: string | null = null;
let flight: Promise<string> | null = null;

export function localDay(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export async function schoolDay(): Promise<string> {
  if (cached) return cached;
  if (!flight) {
    flight = api
      .get<{ date?: string }>('/v1/today')
      .then((r) => {
        const iso = typeof r?.date === 'string' ? r.date.slice(0, 10) : '';
        cached = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : localDay();
        return cached;
      })
      .catch(() => (cached = localDay()))
      .finally(() => {
        flight = null;
      });
  }
  return flight;
}
