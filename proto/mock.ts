// PROTOTYPE — throwaway mock data for admin redesign variants.
// Three variants of the admin home, switchable via `?variant=`, on the existing `/admin` route.
// No backend, no persistence: in-memory demo only. Do not promote to production as-is.

export interface RiskStudent {
  id: string;
  name: string;
  salon: string;
  absences: number;
  evasions: number;
  lates: number;
  rate: number; // attendance %
  severity: 'leve' | 'medio' | 'grave';
  trend: string;
}

export interface WarningItem {
  id: string;
  title: string;
  student: string;
  salon: string;
  severity: 'leve' | 'medio' | 'grave';
  when: string;
}

export interface Salon {
  id: string;
  label: string;
  docente: string;
  students: number;
  rate: number;
  graves: number;
  noSchedule: boolean;
}

export interface HourBlock {
  time: string;
  subject: string;
  salon: string;
  docente: string;
  room: string;
  status: 'done' | 'now' | 'next';
}

export const kpis = [
  { key: 'est', value: '842', label: 'Estudiantes', icon: 'users' },
  { key: 'doc', value: '38', label: 'Docentes', icon: 'book' },
  { key: 'sal', value: '22', label: 'Salones', icon: 'list' },
  { key: 'lla', value: '17', label: 'Llamados (7d)', icon: 'warn' }
] as const;

export const attention = {
  noSchedule: { count: 3, label: 'Salones sin horario', detail: '7-2 · 8-1 · 9-3' },
  risk: { count: 7, label: 'Riesgo de asistencia', detail: '< 85% o ≥ 3 faltas / 7d' },
  graves: { count: 4, label: 'Graves esta semana', detail: '2 hoy · 2 ayer' }
};

export const riskStudents: RiskStudent[] = [
  { id: '1', name: 'Valderrama, Sara', salon: '9-2', absences: 5, evasions: 2, lates: 1, rate: 71, severity: 'grave', trend: '+3 esta semana' },
  { id: '2', name: 'Ríos, Tomás', salon: '10-1', absences: 4, evasions: 0, lates: 3, rate: 78, severity: 'grave', trend: '+2 esta semana' },
  { id: '3', name: 'Cano, Lucía', salon: '8-1', absences: 3, evasions: 1, lates: 0, rate: 83, severity: 'medio', trend: 'igual' },
  { id: '4', name: 'Mora, Diego', salon: '11-2', absences: 2, evasions: 2, lates: 2, rate: 84, severity: 'medio', trend: '+1' },
  { id: '5', name: 'Pardo, Ana', salon: '7-1', absences: 3, evasions: 0, lates: 1, rate: 86, severity: 'leve', trend: 'mejora' },
  { id: '6', name: 'Soto, Julián', salon: '9-1', absences: 2, evasions: 0, lates: 4, rate: 88, severity: 'leve', trend: 'igual' }
];

export const recentWarnings: WarningItem[] = [
  { id: 'w1', title: 'Evasión reiterada de clase', student: 'Tomás Ríos · 10-1', salon: '10-1', severity: 'grave', when: 'Hoy 09:40' },
  { id: 'w2', title: 'Irrespeto a norma de convivencia', student: 'Sara Valderrama · 9-2', salon: '9-2', severity: 'grave', when: 'Hoy 08:15' },
  { id: 'w3', title: 'Uso de móvil sin autorización', student: 'Diego Mora · 11-2', salon: '11-2', severity: 'medio', when: 'Ayer 11:02' },
  { id: 'w4', title: 'Inasistencia injustificada', student: 'Lucía Cano · 8-1', salon: '8-1', severity: 'leve', when: 'Ayer 07:30' }
];

export const salones: Salon[] = [
  { id: 's71', label: '7-1', docente: 'M. Puentes', students: 34, rate: 96, graves: 0, noSchedule: false },
  { id: 's72', label: '7-2', docente: 'Sin asignar', students: 31, rate: 0, graves: 0, noSchedule: true },
  { id: 's81', label: '8-1', docente: 'C. Mendoza', students: 36, rate: 88, graves: 1, noSchedule: false },
  { id: 's91', label: '9-1', docente: 'L. Torres', students: 33, rate: 91, graves: 0, noSchedule: false },
  { id: 's92', label: '9-2', docente: 'R. Díaz', students: 35, rate: 74, graves: 2, noSchedule: false },
  { id: 's101', label: '10-1', docente: 'J. Rojas', students: 32, rate: 79, graves: 1, noSchedule: false },
  { id: 's112', label: '11-2', docente: 'A. Gil', students: 29, rate: 93, graves: 0, noSchedule: false },
  { id: 's93', label: '9-3', docente: 'Sin asignar', students: 0, rate: 0, graves: 0, noSchedule: true }
];

export const hoursToday: HourBlock[] = [
  { time: '07:00', subject: 'Matemáticas', salon: '10-1', docente: 'J. Rojas', room: '201', status: 'done' },
  { time: '08:45', subject: 'Física', salon: '11-2', docente: 'C. Mendoza', room: '304', status: 'now' },
  { time: '10:30', subject: 'Geometría', salon: '9-2', docente: 'L. Torres', room: '102', status: 'next' },
  { time: '13:00', subject: 'Estadística', salon: '10-1', docente: 'J. Rojas', room: '202', status: 'next' }
];

export const donutMarks = [
  { key: 'Presentes', value: 78, cls: 'm-present' },
  { key: 'Inasistencias', value: 9, cls: 'm-absent' },
  { key: 'Evasiones', value: 5, cls: 'm-evasion' },
  { key: 'Atrasos', value: 8, cls: 'm-late' }
];

export const gravityBars = [
  { key: 'Leve', value: 9, cls: 'sev-leve' },
  { key: 'Medio', value: 5, cls: 'sev-medio' },
  { key: 'Grave', value: 4, cls: 'sev-grave' }
];
