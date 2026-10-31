// Slugs públicos para las URLs: las rutas del navegador solo muestran el
// código corto; el UUID viaja únicamente dentro de la app y la API.
// resolveId traduce una vez (con caché) y deja pasar UUIDs tal cual para
// compatibilidad con enlaces viejos.
import { api } from './api/client';

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cache = new Map<string, string>();

export function isUuid(value: string): boolean {
  return uuidRe.test((value ?? '').trim());
}

export async function resolveId(slugOrId: string): Promise<string> {
  const v = (slugOrId ?? '').trim();
  if (!v) throw new Error('empty link');
  if (isUuid(v)) return v;
  const hit = cache.get(v);
  if (hit) return hit;
  const r = await api.get<{ kind: string; id: string }>(`/v1/s/${encodeURIComponent(v)}`);
  if (!r?.id) throw new Error('bad link');
  cache.set(v, r.id);
  return r.id;
}
