// Textos del manual de convivencia ordenados como el catálogo: el id
// s{tipo}-{n} corresponde a la posición n (1-based) dentro del bloque.
// El tipo siempre lo decide el servidor; aquí solo se resuelve el texto
// para mostrar. No reordenar: rompería el mapeo con el catálogo.
export const kindSize: Record<number, number> = { 1: 14, 2: 43, 3: 8 };

export function situationText(situations: string[], id: string): string {
  const m = /^s([123])-(\d+)$/.exec(id);
  if (!m) return '';
  const kind = Number(m[1]);
  const n = Number(m[2]);
  const offset = kind === 1 ? 0 : kind === 2 ? 14 : 57;
  if (n < 1 || n > (kindSize[kind] ?? 0)) return '';
  return situations[offset + n - 1] ?? '';
}

// Paleta de severidad del proyecto: tipo I chip-sky (leve), II
// chip-yellow (medio), III chip-pink (grave). Nunca colores nuevos.
export function kindChip(kind: number): 'chip-sky' | 'chip-yellow' | 'chip-pink' {
  return kind === 3 ? 'chip-pink' : kind === 2 ? 'chip-yellow' : 'chip-sky';
}

export function todayISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
