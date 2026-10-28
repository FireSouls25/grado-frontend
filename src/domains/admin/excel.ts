// Exportaciones a Excel con fórmulas reales (nunca valores fijos): el
// porcentaje y los totales se calculan en la hoja, así la tabla sigue
// viva si alguien corrige un dato a mano. Estilo sobrio: encabezado
// tintado, bordes finos y fila de totales en negrita.
import * as XLSX from 'xlsx';

export interface StudentRow {
  surnames: string;
  names: string;
  presences: number;
  absences: number;
  excused: number;
  evasions: number;
  lates: number;
  sessions: number;
}

export interface SalonSheet {
  label: string;
  days: number;
  students: StudentRow[];
}

const HEADER_FILL = { patternType: 'solid', fgColor: { rgb: 'FFD9C7A7' } };
const TITLE_FILL = { patternType: 'solid', fgColor: { rgb: 'FFF3E8D8' } };
const TOTAL_FILL = { patternType: 'solid', fgColor: { rgb: 'FFEFE3D2' } };
const THIN_BORDER = {
  top: { style: 'thin', color: { rgb: 'FFB9A68A' } },
  bottom: { style: 'thin', color: { rgb: 'FFB9A68A' } },
  left: { style: 'thin', color: { rgb: 'FFB9A68A' } },
  right: { style: 'thin', color: { rgb: 'FFB9A68A' } }
};
const BOLD = { bold: true };
const TITLE_FONT = { bold: true, sz: 14 };

function styleCell(cell: XLSX.CellObject, fill?: unknown, font?: unknown) {
  cell.s = { ...(cell.s ?? {}), border: THIN_BORDER, ...(fill ? { fill } : {}), ...(font ? { font } : {}) };
  return cell;
}

function textCell(v: string, fill?: unknown, font?: unknown): XLSX.CellObject {
  return styleCell({ t: 's', v }, fill, font);
}

function numCell(v: number, fill?: unknown, font?: unknown, fmt?: string): XLSX.CellObject {
  const cell: XLSX.CellObject = { t: 'n', v };
  if (fmt) cell.z = fmt;
  return styleCell(cell, fill, font);
}

function formulaCell(computed: number, formula: string, fill?: unknown, font?: unknown, fmt?: string): XLSX.CellObject {
  const cell: XLSX.CellObject = { t: 'n', v: computed, f: formula };
  if (fmt) cell.z = fmt;
  return styleCell(cell, fill, font);
}

function colName(i: number): string {
  let s = '';
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

function download(name: string, wb: XLSX.WorkBook) {
  const bytes = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// Tabla de estudiantes de un salón: nombres en orden de lista, métricas
// y % con fórmula sobre sus propias celdas. La fila de totales suma con
// fórmulas y el % global divide los totales.
export function salonSheet(salon: SalonSheet, t: {
  title: string;
  daysLabel: string;
  headers: string[];
  totalLabel: string;
}) {
  const { students } = salon;
  const ws: XLSX.WorkSheet = {};
  const H = t.headers;
  // Fila 1: título. Fila 2: días con llamada. Fila 3: encabezados.
  ws['A1'] = textCell(t.title, TITLE_FILL, TITLE_FONT);
  ws['A2'] = textCell(`${t.daysLabel}: ${salon.days}`, TITLE_FILL);
  const headRow = 3;
  H.forEach((h, i) => {
    ws[`${colName(i)}${headRow}`] = textCell(h, HEADER_FILL, BOLD);
  });
  const first = headRow + 1;
  students.forEach((s, k) => {
    const r = first + k;
    const total = s.presences + s.absences + s.excused + s.evasions + s.lates;
    const rate = total > 0 ? s.presences / total : 0;
    ws[`A${r}`] = numCell(k + 1);
    ws[`B${r}`] = textCell(s.surnames);
    ws[`C${r}`] = textCell(s.names);
    ws[`D${r}`] = numCell(s.presences);
    ws[`E${r}`] = numCell(s.absences);
    ws[`F${r}`] = numCell(s.excused);
    ws[`G${r}`] = numCell(s.evasions);
    ws[`H${r}`] = numCell(s.lates);
    ws[`I${r}`] = numCell(s.sessions);
    ws[`J${r}`] = formulaCell(rate, `D${r}/SUM(D${r}:H${r})`, undefined, undefined, '0%');
  });
  const last = first + students.length;
  ws[`A${last}`] = textCell('', TOTAL_FILL);
  ws[`B${last}`] = textCell(t.totalLabel, TOTAL_FILL, BOLD);
  ws[`C${last}`] = textCell(`${students.length}`, TOTAL_FILL, BOLD);
  const cols = ['D', 'E', 'F', 'G', 'H', 'I'];
  const sums = cols.map((c) => {
    let acc = 0;
    students.forEach((s, k) => {
      const r = first + k;
      const v = ws[`${c}${r}`]?.v;
      if (typeof v === 'number') acc += v;
    });
    return acc;
  });
  cols.forEach((c, i) => {
    ws[`${c}${last}`] = formulaCell(sums[i], `SUM(${c}${first}:${c}${last - 1})`, TOTAL_FILL, BOLD);
  });
  const totalMarks = sums[0] + sums[1] + sums[2] + sums[3] + sums[4];
  ws[`J${last}`] = formulaCell(
    totalMarks > 0 ? sums[0] / totalMarks : 0,
    `D${last}/SUM(D${last}:H${last})`,
    TOTAL_FILL,
    BOLD,
    '0%'
  );
  ws['!ref'] = `A1:J${last}`;
  ws['!cols'] = [{ wch: 4 }, { wch: 24 }, { wch: 24 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 12 }];
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 9 } }];
  return ws;
}

export function exportStudentsWorkbook(
  file: string,
  salons: SalonSheet[],
  t: { title: string; daysLabel: string; headers: string[]; totalLabel: string }
) {
  const wb = XLSX.utils.book_new();
  for (const salon of salons) {
    const name = salon.label.slice(0, 31) || 'Salón';
    XLSX.utils.book_append_sheet(wb, salonSheet(salon, { ...t, title: `${t.title} · ${salon.label}` }), name);
  }
  download(file, wb);
}

export interface PeriodExport {
  n: number;
  start: string;
  end: string;
  days: number;
  marks: { Presences: number; Absences: number; Excused: number; Evasions: number; Lates: number; StudentDays: number };
  warnings: { Mild: number; Moderate: number; Severe: number };
  salons: { Label: string; Days: number; Presences: number; Absences: number; Excused: number; Evasions: number; Lates: number; StudentDays: number; Rate: number }[];
}

// Exportación del año: hoja Resumen (año general + tabla de periodos
// con fórmulas sobre las hojas de cada periodo) y una hoja por periodo
// con marcas, llamados y salones.
export function exportYearWorkbook(
  file: string,
  year: number,
  periods: PeriodExport[],
  t: {
    summaryTitle: string;
    yearLabel: string;
    periodLabel: string;
    rangeLabel: string;
    daysLabel: string;
    attendanceLabel: string;
    warningsLabel: string;
    mildLabel: string;
    moderateLabel: string;
    severeLabel: string;
    salonLabel: string;
    totalLabel: string;
  }
) {
  const wb = XLSX.utils.book_new();
  const ws: XLSX.WorkSheet = {};
  ws['A1'] = textCell(t.summaryTitle, TITLE_FILL, TITLE_FONT);
  ws['A2'] = textCell(`${t.yearLabel}: ${year}`, TITLE_FILL, BOLD);
  const head = 4;
  const H = [t.periodLabel, t.rangeLabel, t.daysLabel, t.attendanceLabel, t.mildLabel, t.moderateLabel, t.severeLabel];
  H.forEach((h, i) => {
    ws[`${colName(i)}${head}`] = textCell(h, HEADER_FILL, BOLD);
  });
  periods.forEach((p, k) => {
    const r = head + 1 + k;
    const sheet = `P${p.n}`;
    const present = p.marks.Presences;
    const total = p.marks.StudentDays;
    ws[`A${r}`] = textCell(`${t.periodLabel} ${p.n}`);
    ws[`B${r}`] = textCell(`${p.start} – ${p.end}`);
    ws[`C${r}`] = formulaCell(p.days, `'${sheet}'!B2`);
    ws[`D${r}`] = formulaCell(total > 0 ? present / total : 0, `'${sheet}'!B4`, undefined, undefined, '0%');
    ws[`E${r}`] = formulaCell(p.warnings.Mild, `'${sheet}'!B10`);
    ws[`F${r}`] = formulaCell(p.warnings.Moderate, `'${sheet}'!B11`);
    ws[`G${r}`] = formulaCell(p.warnings.Severe, `'${sheet}'!B12`);
  });
  const last = head + periods.length;
  ws[`A${last}`] = textCell(t.totalLabel, TOTAL_FILL, BOLD);
  const sumDays = periods.reduce((a, p) => a + p.days, 0);
  ws[`C${last}`] = formulaCell(sumDays, `SUM(C${head + 1}:C${last - 1})`, TOTAL_FILL, BOLD);
  ws[`E${last}`] = formulaCell(periods.reduce((a, p) => a + p.warnings.Mild, 0), `SUM(E${head + 1}:E${last - 1})`, TOTAL_FILL, BOLD);
  ws[`F${last}`] = formulaCell(periods.reduce((a, p) => a + p.warnings.Moderate, 0), `SUM(F${head + 1}:F${last - 1})`, TOTAL_FILL, BOLD);
  ws[`G${last}`] = formulaCell(periods.reduce((a, p) => a + p.warnings.Severe, 0), `SUM(G${head + 1}:G${last - 1})`, TOTAL_FILL, BOLD);
  ws['!ref'] = `A1:G${last}`;
  ws['!cols'] = [{ wch: 12 }, { wch: 26 }, { wch: 8 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];
  XLSX.utils.book_append_sheet(wb, ws, 'Resumen');

  for (const p of periods) {
    const ps: XLSX.WorkSheet = {};
    ps['A1'] = textCell(`${t.periodLabel} ${p.n} · ${p.start} – ${p.end}`, TITLE_FILL, TITLE_FONT);
    ps['A2'] = textCell(t.daysLabel);
    ps['B2'] = numCell(p.days, TITLE_FILL, BOLD);
    const M = p.marks;
    const rows: [string, number][] = [
      [t.attendanceLabel, M.StudentDays > 0 ? M.Presences / M.StudentDays : 0],
      ['Presente', M.Presences],
      ['Inasistencia', M.Absences],
      ['Con permiso', M.Excused],
      ['Evasión', M.Evasions],
      ['Atraso', M.Lates]
    ];
    rows.forEach(([label, v], i) => {
      const r = 4 + i;
      ps[`A${r}`] = textCell(label, undefined, i === 0 ? BOLD : undefined);
      ps[`B${r}`] = i === 0 ? numCell(v, undefined, BOLD, '0%') : numCell(v);
    });
    ps['A9'] = textCell(t.warningsLabel, undefined, BOLD);
    ps['A10'] = textCell(t.mildLabel);
    ps['B10'] = numCell(p.warnings.Mild);
    ps['A11'] = textCell(t.moderateLabel);
    ps['B11'] = numCell(p.warnings.Moderate);
    ps['A12'] = textCell(t.severeLabel);
    ps['B12'] = numCell(p.warnings.Severe);
    const sh = 14;
    [t.salonLabel, t.daysLabel, 'Presente', 'Inasistencia', 'Con permiso', 'Evasión', 'Atraso', t.attendanceLabel].forEach((h, i) => {
      ps[`${colName(i)}${sh}`] = textCell(h, HEADER_FILL, BOLD);
    });
    p.salons.forEach((s, k) => {
      const r = sh + 1 + k;
      ps[`A${r}`] = textCell(s.Label);
      ps[`B${r}`] = numCell(s.Days);
      ps[`C${r}`] = numCell(s.Presences);
      ps[`D${r}`] = numCell(s.Absences);
      ps[`E${r}`] = numCell(s.Excused);
      ps[`F${r}`] = numCell(s.Evasions);
      ps[`G${r}`] = numCell(s.Lates);
      const tot = s.Presences + s.Absences + s.Excused + s.Evasions + s.Lates;
      ps[`H${r}`] = formulaCell(tot > 0 ? s.Presences / tot : 0, `C${r}/SUM(C${r}:G${r})`, undefined, undefined, '0%');
    });
    ps['!ref'] = `A1:H${sh + p.salons.length}`;
    ps['!cols'] = [{ wch: 14 }, { wch: 8 }, { wch: 10 }, { wch: 13 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 }];
    ps['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }];
    XLSX.utils.book_append_sheet(wb, ps, `P${p.n}`);
  }
  download(file, wb);
}
