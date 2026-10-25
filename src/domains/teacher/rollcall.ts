// Cache local del llamado del día: el backend aún no expone
// "el session de hoy por salón", así que tras guardar en la lista el
// resumen queda en localStorage y la Agenda lo muestra para el día
// actual. Nunca crea datos: un chip solo aparece si el docente guardó
// el llamado en este dispositivo ese día.

export interface RollcallRecord {
  // Date local YYYY-MM-DD; los registros de otro día se descartan.
  Date: string;
  GroupID: string;
  Students: number;
  Present: number;
  Absent: number;
  Permission: number;
  Late?: number;
  Evasion?: number;
}

const STORAGE_KEY = 'grado.rollcalls.v1';

export function dateKey(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function readAll(): RollcallRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RollcallRecord[]) : [];
  } catch {
    return [];
  }
}

function writeAll(records: RollcallRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    /* sin espacio o modo privado: el chip simplemente no aparece */
  }
}

/** Guarda (o reemplaza) el resumen de hoy para un salón. */
export function saveRollcall(rec: RollcallRecord): void {
  const today = dateKey();
  const others = readAll().filter((r) => r.Date === today);
  const rest = others.filter((r) => r.GroupID !== rec.GroupID);
  rest.push({ ...rec, Date: today });
  writeAll(rest);
}

/** Resumen guardado hoy para un salón, o null si no existe. */
export function loadRollcall(groupID: string): RollcallRecord | null {
  const today = dateKey();
  return readAll().find((r) => r.Date === today && r.GroupID === groupID) ?? null;
}
