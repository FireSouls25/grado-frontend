// Helpers compartidos de la bitácora (admin/Audit + ficha del estudiante).
// Antes vivían duplicados en ambos componentes; una sola fuente para que
// el formato de IDs y la clasificación lectura/escritura no diverjan.
import type { AuditEntry } from '../domains/admin/api';

export type AuditAction = AuditEntry['Action'];

/** Muestra los primeros 8 del ID (UUID) o un guion si viene vacío. */
export function shortId(value: string): string {
  return value ? value.slice(0, 8) : '—';
}

/** Las escrituras (create/update/mark) resaltan; las lecturas van tenues. */
export function auditActionClass(action: AuditAction): string {
  return action === 'create' || action === 'update' || action === 'mark' ? 'write' : 'read';
}
