// Contrato frontend→backend: verifica que los cuerpos que el SPA envía
// sean exactamente los que el backend acepta (sin campos de más, con los
// nombres correctos). Corre en CI con node puro, sin navegador.
//
// El espejo vive en el backend: backend/src/tests/e2e/teacher_flow_test.go
// acepta estos mismos cuerpos contra la app real y exige el recorrido
// completo (guardar → ver en admin → corregir → volver a ver).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Derivadas del propio script: en CI el checkout vive en otra ruta
// (/home/runner/...) y los absolutos del autor no existen.
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(new URL('../package.json', import.meta.url));
const { buildSync } = require('esbuild');

const calls = [];
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), method: init?.method || 'GET', body: init?.body ? JSON.parse(init.body) : undefined });
  return { ok: true, status: 200, json: async () => ({}) };
};
globalThis.localStorage = {
  store: { 'grado.token': 'contract' },
  getItem(k) { return this.store[k] ?? null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; }
};

const entry = `
import { openSession, recordMark, recordUniform, issueWarnings, todaySessions, sessionMarks, updateMyTeacher, raiseAcademicAlerts, recordObservation } from '${ROOT}/src/domains/teacher/api.ts';
import { areaOf, canEnter, safeNext } from '${ROOT}/src/lib/routeGuard.ts';
import { hasPermission, canManageUsers, canBlockAccess, canWriteDefenses } from '${ROOT}/src/lib/access.ts';
import { schoolDay } from '${ROOT}/src/lib/schoolDay.ts';
import { resolveId, isUuid } from '${ROOT}/src/lib/slug.ts';
import { issueWarningBatch, correctWarning, recordDefense, recordTeacherDay, studentReport, updateStudent } from '${ROOT}/src/domains/admin/api.ts';
const fail = (m) => { console.error('CONTRACT FAIL:', m); process.exitCode = 1; };
const last = () => globalThis.__calls[globalThis.__calls.length - 1];
await openSession('gid-1');
{
  const c = last();
  if (c.url !== 'http://contract.test/v1/sessions/open' || c.method !== 'POST') fail('openSession ' + c.method + ' ' + c.url);
  const keys = Object.keys(c.body || {}).sort().join(',');
  if (keys !== 'classGroupID') fail('openSession body keys: ' + keys);
}
await recordMark('s-1', 'stu-1', 'absence', '');
{
  const c = last();
  if (!c.url.endsWith('/v1/sessions/s-1/marks') || c.method !== 'POST') fail('recordMark ' + c.method + ' ' + c.url);
  const b = c.body || {};
  if (b.studentID !== 'stu-1' || b.mark !== 'absence' || b.note !== '') fail('recordMark body: ' + JSON.stringify(b));
}
await issueWarnings({ studentIDs: ['a'], classID: 'g', title: 'T', gravity: 'moderate', description: 'D' });
{
  const c = last();
  if (!c.url.endsWith('/v1/warnings/batch')) fail('issueWarnings url ' + c.url);
  if ('snapshots' in (c.body || {})) fail('issueWarnings envía snapshots (el backend lo rechaza con 400)');
  const keys = Object.keys(c.body || {}).sort().join(',');
  if (keys !== 'classID,description,gravity,studentIDs,title') fail('issueWarnings body keys: ' + keys);
}
await issueWarningBatch({ classID: 'g', studentIDs: ['a'], gravity: 'mild', title: 'T', description: 'D' });
{
  const c = last();
  if (!c.url.endsWith('/v1/warnings/batch')) fail('issueWarningBatch url ' + c.url);
  if ('snapshots' in (c.body || {})) fail('issueWarningBatch envía snapshots');
}
await todaySessions('g-1', '2026-10-30');
{
  const c = last();
  const want = '/v1/sessions/history?classGroupID=g-1&from=2026-10-30&to=2026-10-30';
  if (!c.url.endsWith(want) || c.method !== 'GET') fail('todaySessions ' + c.method + ' ' + c.url);
}
globalThis.fetch = async (url, init) => {
  globalThis.__calls.push({ url: String(url), method: init?.method || 'GET', body: init?.body ? JSON.parse(init.body) : undefined });
  return { ok: true, status: 200, json: async () => ({ Marks: { a: 'absence' } }) };
};
const marks = await sessionMarks('s-9');
if (!marks || marks.a !== 'absence') fail('sessionMarks no lee Marks del detalle');
await correctWarning('w-1', { description: 'Nuevo texto' });
{
  const c = last();
  if (!c.url.endsWith('/v1/warnings/w-1') || c.method !== 'PUT') fail('correctWarning ' + c.method + ' ' + c.url);
}
await studentReport('stu-1');
{
  const c = last();
  if (!c.url.endsWith('/v1/statistics/student/stu-1')) fail('studentReport url ' + c.url);
}

globalThis.fetch = async (url, init) => {
  globalThis.__calls.push({ url: String(url), method: init?.method || 'GET', body: init?.body ? JSON.parse(init.body) : undefined });
  return { ok: true, status: 200, json: async () => ({ date: '2026-10-31', weekday: 5, now: '2026-10-31T00:00:00Z' }) };
};
const day = await schoolDay();
if (day !== '2026-10-31') fail('schoolDay no usa el día del servidor: ' + day);
if (!hasPermission({ permissions: ['manage-users'] }, 'manage-users')) fail('hasPermission con permisos');
if (canManageUsers({ permissions: ['record-attendance'] })) fail('canManageUsers con docente');
if (!canManageUsers({ roles: ['admin'] })) fail('respaldo a roles roto (admin)');
if (!canBlockAccess({ roles: ['secretary'] })) fail('respaldo a roles roto (secretaría)');
if (!canWriteDefenses({ permissions: ['record-defenses'] })) fail('canWriteDefenses con permiso');
if (canWriteDefenses({ roles: ['teacher'] })) fail('canWriteDefenses con docente');
if (!canWriteDefenses({ roles: ['secretary'] })) fail('respaldo descargo secretaría');
if (!canWriteDefenses({ permissions: ['record-defenses'] })) fail('canWriteDefenses con permiso');
if (canWriteDefenses({ roles: ['teacher'] })) fail('canWriteDefenses niega docente');
await recordUniform('s-1', 'stu-1', false);
{
  const c = last();
  if (!c.url.endsWith('/v1/sessions/s-1/uniform') || c.method !== 'POST') fail('recordUniform ' + c.method + ' ' + c.url);
  if (c.body?.studentID !== 'stu-1' || c.body?.ok !== false) fail('recordUniform body: ' + JSON.stringify(c.body));
}
await recordDefense('s-1', 'stu-1', 'Se varó el bus');
{
  const c = last();
  if (!c.url.endsWith('/v1/sessions/s-1/defenses') || c.method !== 'POST') fail('recordDefense ' + c.method + ' ' + c.url);
  if (c.body?.studentID !== 'stu-1' || !c.body?.text) fail('recordDefense body: ' + JSON.stringify(c.body));
}
globalThis.fetch = async (url, init) => {
  globalThis.__calls.push({ url: String(url), method: init?.method || 'GET', body: init?.body ? JSON.parse(init.body) : undefined });
  return { ok: true, status: 200, json: async () => ({ kind: 'student', id: 'stu-9' }) };
};
if (!isUuid('fcdcba87-d0fe-4b39-b15e-969dd4bc745f')) fail('isUuid no reconoce UUID');
if (isUuid('abc12345')) fail('isUuid confunde slug con UUID');
if (await resolveId('fcdcba87-d0fe-4b39-b15e-969dd4bc745f') !== 'fcdcba87-d0fe-4b39-b15e-969dd4bc745f') fail('resolveId debe pasar UUID sin fetch');
{
  const callsBefore = globalThis.__calls.length;
  if (await resolveId('abc12345') !== 'stu-9') fail('resolveId no resuelve slug');
  if (!globalThis.__calls.slice(callsBefore).some(c => c.url.endsWith('/v1/s/abc12345'))) fail('resolveId no llama a /v1/s/{slug}');
  await resolveId('abc12345');
  if (globalThis.__calls.length !== callsBefore + 1) fail('resolveId no cachea');
}
await recordTeacherDay('2026-10-30', [{ teacherID: 't1', status: 'permission', note: 'Cita médica' }]);
{
  const c = last();
  if (!c.url.endsWith('/v1/teachers/attendance') || c.method !== 'POST') fail('recordTeacherDay ' + c.method + ' ' + c.url);
  if (!c.body?.marks?.[0] || c.body.marks[0].status !== 'permission') fail('recordTeacherDay body: ' + JSON.stringify(c.body));
}

// Falta con permiso: la marca viaja con su nota (espejo: e2e/teacher_flow_test.go).
await recordMark('s-1', 'stu-1', 'permission', 'Cita médica');
{
  const c = last();
  if (!c.url.endsWith('/v1/sessions/s-1/marks') || c.method !== 'POST') fail('recordMark permiso ' + c.method + ' ' + c.url);
  if (JSON.stringify(Object.keys(c.body).sort()) !== '["mark","note","studentID"]' || c.body.mark !== 'permission') fail('recordMark permiso body: ' + JSON.stringify(c.body));
}
// Alerta académica (espejo: http/academics_test.go raiseAlertRequest).
await raiseAcademicAlerts({ studentIDs: ['a', 'b'], reason: 'Bajo rendimiento' });
{
  const c = last();
  if (!c.url.endsWith('/v1/academic-alerts') || c.method !== 'POST') fail('raiseAcademicAlerts ' + c.method + ' ' + c.url);
  if (JSON.stringify(Object.keys(c.body).sort()) !== '["reason","studentIDs"]') fail('raiseAcademicAlerts body: ' + JSON.stringify(c.body));
}
// Observación de convivencia (espejo: observationRequest).
await recordObservation({ studentID: 'stu-1', situationID: 's1-01', note: 'Nota', classGroupID: 'g' });
{
  const c = last();
  if (!c.url.endsWith('/v1/observations') || c.method !== 'POST') fail('recordObservation ' + c.method + ' ' + c.url);
  const allowed = ['classGroupID', 'date', 'note', 'situationID', 'studentID'];
  if (Object.keys(c.body).some((k) => !allowed.includes(k))) fail('recordObservation body: ' + JSON.stringify(c.body));
}
// Perfil del docente: la fecha del input (AAAA-MM-DD) sale en RFC 3339
// (espejo: http/frontendbodies_test.go).
await updateMyTeacher({ Phone: '3105559999', Birthdate: '1990-05-01', Sex: 'female' });
{
  const c = last();
  if (!c.url.endsWith('/v1/teachers/me') || c.method !== 'PUT') fail('updateMyTeacher ' + c.method + ' ' + c.url);
  if (c.body?.Birthdate !== '1990-05-01T00:00:00Z') fail('updateMyTeacher Birthdate: ' + JSON.stringify(c.body));
}
// Ficha del estudiante: nunca envía ID ni Status (los decide el servidor).
await updateStudent('stu-1', { ID: 'stu-1', Status: 'active', Names: 'Ana', Surnames: 'Gómez', Birthdate: '2011-03-15T00:00:00Z' });
{
  const c = last();
  if (!c.url.endsWith('/v1/students/stu-1') || c.method !== 'PUT') fail('updateStudent ' + c.method + ' ' + c.url);
  if ('ID' in c.body || 'Status' in c.body || c.body.Names !== 'Ana') fail('updateStudent body: ' + JSON.stringify(c.body));
}
// Acceso por rol a las rutas (espejo de los permisos del backend).
{
  const teacher = { roles: ['teacher'], home: '/docente' };
  const admin = { roles: ['admin'], home: '/admin' };
  const secretary = { roles: ['secretary'], home: '/admin' };
  const student = { roles: ['student'], home: '/estudiante' };
  const expect = (who, path, want, name) => {
    if (canEnter(areaOf(path), who) !== want) fail('acceso ' + name + ' a ' + path + ': quería ' + want);
  };
  expect(teacher, '/admin/usuarios', false, 'docente');
  expect(teacher, '/clase/g-1', true, 'docente');
  expect(teacher, '/estudiante', false, 'docente');
  expect(admin, '/clase/g-1', false, 'admin');
  expect(admin, '/docente', false, 'admin');
  expect(admin, '/admin/estudiantes/x', true, 'admin');
  expect(secretary, '/admin/estudiantes', true, 'secretaría');
  expect(secretary, '/llamado/g-1', false, 'secretaría');
  expect(student, '/estudiante', true, 'estudiante');
  expect(student, '/admin', false, 'estudiante');
  expect(student, '/perfil', true, 'estudiante');
  expect(null, '/perfil', false, 'sin sesión');
  if (safeNext('//evil.example') || safeNext('https://evil.example') || safeNext('/login')) fail('safeNext acepta destinos externos o públicos');
  if (safeNext('/admin/estudiantes') !== '/admin/estudiantes') fail('safeNext rechaza una ruta interna');
}
if (!process.exitCode) console.log('CONTRACT OK: cuerpos del frontend compatibles con el backend');
`;
globalThis.__calls = calls;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'contract-'));
const entryFile = path.join(dir, 'entry.js');
const outFile = path.join(dir, 'bundle.mjs');
fs.writeFileSync(entryFile, entry);
buildSync({
  entryPoints: [entryFile],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: outFile,
  alias: { $lib: ROOT + '/src/lib' },
  define: { 'import.meta.env.VITE_API_URL': '"http://contract.test"' }
});
await import(pathToFileURL(outFile).href);
