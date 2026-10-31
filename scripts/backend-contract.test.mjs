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
import { pathToFileURL } from 'node:url';

const require = createRequire('/home/grim/Documents/projects/grado/frontend/package.json');
const { buildSync } = require('esbuild');

const ROOT = '/home/grim/Documents/projects/grado/frontend';

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
import { openSession, recordMark, issueWarnings, todaySessions, sessionMarks } from '/home/grim/Documents/projects/grado/frontend/src/domains/teacher/api.ts';
import { hasPermission, canManageUsers, canBlockAccess } from '/home/grim/Documents/projects/grado/frontend/src/lib/access.ts';
import { schoolDay } from '/home/grim/Documents/projects/grado/frontend/src/lib/schoolDay.ts';
import { issueWarningBatch, correctWarning, studentReport } from '/home/grim/Documents/projects/grado/frontend/src/domains/admin/api.ts';
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
