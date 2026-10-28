// Exportaciones a Excel con ExcelJS: estilos reales (rellenos, bordes,
// negritas), columnas anchas, texto con ajuste y fórmulas vivas — el %
// y los totales se calculan en la hoja, nunca van fijos.
import ExcelJS from 'exceljs';

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

const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC98F5F' } };
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' } };
const METRIC_INK: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FF5A3A1A' } };
const TITLE_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF6ECDC' } };
const TOTAL_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0DCC0' } };
const COL_PRESENT: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDFF0D8' } };
const COL_ABSENT: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7DAD2' } };
const COL_PERMISSION: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD7E8F5' } };
const COL_EVASION: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6E0F2' } };
const COL_LATE: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF0C8' } };
const THIN: ExcelJS.BorderStyle = 'thin';
const LINE = { style: THIN, color: { argb: 'FFB9A68A' } };
const ALL_BORDERS: Partial<ExcelJS.Borders> = { top: LINE, bottom: LINE, left: LINE, right: LINE };

function paint(cell: ExcelJS.Cell, fill?: ExcelJS.Fill, font?: Partial<ExcelJS.Font>) {
  cell.border = ALL_BORDERS;
  cell.alignment = { wrapText: true, vertical: 'middle' };
  if (fill) cell.fill = fill;
  if (font) cell.font = font;
}

async function download(name: string, wb: ExcelJS.Workbook) {
  const bytes = await wb.xlsx.writeBuffer();
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
function fillSalonSheet(
  ws: ExcelJS.Worksheet,
  salon: SalonSheet,
  t: { title: string; daysLabel: string; headers: string[]; totalLabel: string }
) {
  const { students } = salon;
  const H = t.headers;
  ws.mergeCells('A1:J1');
  const title = ws.getCell('A1');
  title.value = t.title;
  paint(title, TITLE_FILL, { bold: true, size: 14 });
  ws.getRow(1).height = 26;
  const days = ws.getCell('A2');
  days.value = `${t.daysLabel}: ${salon.days}`;
  paint(days, TITLE_FILL, { bold: true });
  ws.mergeCells('A2:J2');
  ws.getRow(2).height = 20;
  const headRow = 3;
  const metricFill = [COL_PRESENT, COL_ABSENT, COL_PERMISSION, COL_EVASION, COL_LATE];
  H.forEach((h, i) => {
    const cell = ws.getCell(headRow, i + 1);
    cell.value = h;
    const metric = i >= 3 && i <= 7;
    paint(cell, metric ? metricFill[i - 3] : HEADER_FILL, metric ? METRIC_INK : HEADER_FONT);
  });
  ws.getRow(headRow).height = 26;
  const first = headRow + 1;
  const colFills = [undefined, undefined, undefined, COL_PRESENT, COL_ABSENT, COL_PERMISSION, COL_EVASION, COL_LATE, undefined, undefined];
  students.forEach((s, k) => {
    const r = first + k;
    const total = s.presences + s.absences + s.excused + s.evasions + s.lates;
    const rate = total > 0 ? s.presences / total : 0;
    const vals: (string | number)[] = [
      k + 1, s.surnames, s.names, s.presences, s.absences, s.excused, s.evasions, s.lates, s.sessions, 0
    ];
    vals.forEach((v, i) => {
      const cell = ws.getCell(r, i + 1);
      cell.value = v;
      paint(cell, colFills[i]);
    });
    const pct = ws.getCell(r, 10);
    pct.value = { formula: `D${r}/SUM(D${r}:H${r})`, result: rate };
    pct.numFmt = '0%';
    paint(pct, undefined, { bold: true });
    ws.getRow(r).height = 20;
  });
  const last = first + students.length;
  const endVals: (string | number)[] = ['', t.totalLabel, students.length, 0, 0, 0, 0, 0, 0, 0];
  const colLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
  const metricTint = [undefined, undefined, undefined, COL_PRESENT, COL_ABSENT, COL_PERMISSION, COL_EVASION, COL_LATE, undefined, undefined];
  endVals.forEach((v, i) => {
    const cell = ws.getCell(last, i + 1);
    cell.value = v;
    paint(cell, TOTAL_FILL, { bold: true });
    if (metricTint[i]) cell.fill = { ...(TOTAL_FILL as object), ...(metricTint[i] as object) } as ExcelJS.Fill;
  });
  ['D', 'E', 'F', 'G', 'H', 'I'].forEach((c) => {
    const cell = ws.getCell(`${c}${last}`);
    const col = c.charCodeAt(0) - 64;
    let acc = 0;
    students.forEach((_, k) => {
      const v = ws.getCell(first + k, col).value;
      if (typeof v === 'number') acc += v;
    });
    cell.value = { formula: `SUM(${c}${first}:${c}${last - 1})`, result: acc };
  });
  const totalMarks = ['D', 'E', 'F', 'G', 'H'].reduce((a, c) => {
    const v = ws.getCell(`${c}${last}`).value;
    return a + (typeof v === 'object' && v !== null && 'result' in v && typeof v.result === 'number' ? v.result : 0);
  }, 0);
  const grand = ws.getCell(`J${last}`);
  grand.value = {
    formula: `D${last}/SUM(D${last}:H${last})`,
    result: totalMarks > 0 ? sumResult(ws, `D${last}`) / totalMarks : 0
  };
  grand.numFmt = '0%';
  paint(grand, TOTAL_FILL, { bold: true });
  ws.getRow(last).height = 22;
  ws.columns = [
    { width: 5 }, { width: 30 }, { width: 30 }, { width: 11 }, { width: 14 },
    { width: 13 }, { width: 11 }, { width: 11 }, { width: 10 }, { width: 13 }
  ];
}

function sumResult(ws: ExcelJS.Worksheet, ref: string): number {
  const v = ws.getCell(ref).value;
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && v !== null && 'result' in v && typeof (v as { result: unknown }).result === 'number') {
    return (v as { result: number }).result;
  }
  return 0;
}

export async function exportStudentsWorkbook(
  file: string,
  salons: SalonSheet[],
  t: { title: string; daysLabel: string; headers: string[]; totalLabel: string }
) {
  const wb = new ExcelJS.Workbook();
  for (const salon of salons) {
    const ws = wb.addWorksheet(salon.label.slice(0, 31) || 'Salón');
    fillSalonSheet(ws, salon, { ...t, title: `${t.title} · ${salon.label}` });
  }
  await download(file, wb);
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
export async function exportYearWorkbook(
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
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Resumen');
  ws.mergeCells('A1:G1');
  const title = ws.getCell('A1');
  title.value = t.summaryTitle;
  paint(title, TITLE_FILL, { bold: true, size: 14 });
  ws.getRow(1).height = 26;
  const yl = ws.getCell('A2');
  yl.value = `${t.yearLabel}: ${year}`;
  paint(yl, TITLE_FILL, { bold: true });
  ws.mergeCells('A2:G2');
  const head = 4;
  [t.periodLabel, t.rangeLabel, t.daysLabel, t.attendanceLabel, t.mildLabel, t.moderateLabel, t.severeLabel].forEach(
    (h, i) => {
      const cell = ws.getCell(head, i + 1);
      cell.value = h;
      paint(cell, HEADER_FILL, HEADER_FONT);
    }
  );
  ws.getRow(head).height = 26;
  periods.forEach((p, k) => {
    const r = head + 1 + k;
    const sheet = `P${p.n}`;
    const present = p.marks.Presences;
    const total = p.marks.StudentDays;
    const cells: Array<string | number | { formula: string; result: number }> = [
      `${t.periodLabel} ${p.n}`,
      `${p.start} – ${p.end}`,
      { formula: `'${sheet}'!B2`, result: p.days },
      { formula: `'${sheet}'!B4`, result: total > 0 ? present / total : 0 },
      { formula: `'${sheet}'!B10`, result: p.warnings.Mild },
      { formula: `'${sheet}'!B11`, result: p.warnings.Moderate },
      { formula: `'${sheet}'!B12`, result: p.warnings.Severe }
    ];
    cells.forEach((v, i) => {
      const cell = ws.getCell(r, i + 1);
      cell.value = v;
      paint(cell);
    });
    ws.getCell(r, 4).numFmt = '0%';
    ws.getRow(r).height = 20;
  });
  const last = head + periods.length;
  const sumDays = periods.reduce((a, p) => a + p.days, 0);
  const sumM = periods.reduce((a, p) => a + p.warnings.Mild, 0);
  const sumMod = periods.reduce((a, p) => a + p.warnings.Moderate, 0);
  const sumS = periods.reduce((a, p) => a + p.warnings.Severe, 0);
  const endVals: Array<string | number | { formula: string; result: number }> = [
    t.totalLabel,
    '',
    { formula: `SUM(C${head + 1}:C${last - 1})`, result: sumDays },
    '',
    { formula: `SUM(E${head + 1}:E${last - 1})`, result: sumM },
    { formula: `SUM(F${head + 1}:F${last - 1})`, result: sumMod },
    { formula: `SUM(G${head + 1}:G${last - 1})`, result: sumS }
  ];
  endVals.forEach((v, i) => {
    const cell = ws.getCell(last, i + 1);
    cell.value = v;
    paint(cell, TOTAL_FILL, { bold: true });
  });
  ws.getRow(last).height = 22;
  ws.columns = [{ width: 12 }, { width: 26 }, { width: 9 }, { width: 13 }, { width: 11 }, { width: 11 }, { width: 11 }];

  for (const p of periods) {
    const ps = wb.addWorksheet(`P${p.n}`);
    ps.mergeCells('A1:H1');
    const pt = ps.getCell('A1');
    pt.value = `${t.periodLabel} ${p.n} · ${p.start} – ${p.end}`;
    paint(pt, TITLE_FILL, { bold: true, size: 14 });
    ps.getRow(1).height = 26;
    const dl = ps.getCell('A2');
    dl.value = t.daysLabel;
    paint(dl, TITLE_FILL, { bold: true });
    const dv = ps.getCell('B2');
    dv.value = p.days;
    paint(dv, TITLE_FILL, { bold: true });
    ps.getRow(2).height = 20;
    const M = p.marks;
    const rows: Array<[string, number, boolean]> = [
      [t.attendanceLabel, M.StudentDays > 0 ? M.Presences / M.StudentDays : 0, true],
      ['Presente', M.Presences, false],
      ['Inasistencia', M.Absences, false],
      ['Con permiso', M.Excused, false],
      ['Evasión', M.Evasions, false],
      ['Atraso', M.Lates, false]
    ];
    rows.forEach(([label, v, pct], i) => {
      const r = 4 + i;
      const a = ps.getCell(`A${r}`);
      a.value = label;
      paint(a, undefined, pct ? { bold: true } : undefined);
      const b = ps.getCell(`B${r}`);
      b.value = v;
      if (pct) b.numFmt = '0%';
      paint(b, undefined, pct ? { bold: true } : undefined);
    });
    const wlabel = ps.getCell('A9');
    wlabel.value = t.warningsLabel;
    paint(wlabel, undefined, { bold: true });
    const wrows: Array<[string, number]> = [
      [t.mildLabel, p.warnings.Mild],
      [t.moderateLabel, p.warnings.Moderate],
      [t.severeLabel, p.warnings.Severe]
    ];
    wrows.forEach(([label, v], i) => {
      const r = 10 + i;
      const a = ps.getCell(`A${r}`);
      a.value = label;
      paint(a);
      const b = ps.getCell(`B${r}`);
      b.value = v;
      paint(b);
    });
    const sh = 14;
    [t.salonLabel, t.daysLabel, 'Presente', 'Inasistencia', 'Con permiso', 'Evasión', 'Atraso', t.attendanceLabel].forEach(
      (h, i) => {
        const cell = ps.getCell(sh, i + 1);
        cell.value = h;
        const metric = i >= 2 && i <= 6;
        const fills = [HEADER_FILL, HEADER_FILL, COL_PRESENT, COL_ABSENT, COL_PERMISSION, COL_EVASION, COL_LATE, HEADER_FILL];
        paint(cell, fills[i], metric ? METRIC_INK : HEADER_FONT);
      }
    );
    ps.getRow(sh).height = 26;
    const scol = [undefined, undefined, COL_PRESENT, COL_ABSENT, COL_PERMISSION, COL_EVASION, COL_LATE, undefined];
    p.salons.forEach((s, k) => {
      const r = sh + 1 + k;
      const vals: Array<string | number> = [s.Label, s.Days, s.Presences, s.Absences, s.Excused, s.Evasions, s.Lates, 0];
      vals.forEach((v, i) => {
        const cell = ps.getCell(r, i + 1);
        cell.value = v;
        paint(cell, scol[i] as ExcelJS.Fill | undefined);
      });
      const tot = s.Presences + s.Absences + s.Excused + s.Evasions + s.Lates;
      const pct = ps.getCell(r, 8);
      pct.value = { formula: `C${r}/SUM(C${r}:G${r})`, result: tot > 0 ? s.Presences / tot : 0 };
      pct.numFmt = '0%';
      paint(pct, undefined, { bold: true });
      ps.getRow(r).height = 20;
    });
    ps.columns = [
      { width: 15 }, { width: 9 }, { width: 11 }, { width: 14 }, { width: 13 }, { width: 11 }, { width: 11 }, { width: 13 }
    ];
  }
  await download(file, wb);
}
