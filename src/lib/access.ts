/** Capacidades por rol para la consola. El backend niega de verdad;
 *  esto solo oculta o desactiva lo que el rol no puede usar. La secretaria
 *  ve la misma consola que el admin con un subconjunto de acciones.
 */
export function isAdmin(roles: string[] | undefined | null): boolean {
  return (roles ?? []).includes('admin');
}

export function isSecretary(roles: string[] | undefined | null): boolean {
  return (roles ?? []).includes('secretary');
}

export function isTeacher(roles: string[] | undefined | null): boolean {
  return (roles ?? []).includes('teacher');
}

/** Crear/editar/retirar docentes y cuentas, años, promociones: solo admin. */
export function canManageUsers(roles: string[] | undefined | null): boolean {
  return isAdmin(roles);
}

/** Bloquear o reactivar accesos: admin y secretaría (nunca a admins). */
export function canBlockAccess(roles: string[] | undefined | null): boolean {
  return isAdmin(roles) || isSecretary(roles);
}

/** Crear o corregir llamados: docentes y admin; la secretaría solo mira. */
export function canWriteWarnings(roles: string[] | undefined | null): boolean {
  return isAdmin(roles) || isTeacher(roles);
}

/** Distribuir salones del año siguiente: admin y secretaría. */
export function canPromote(roles: string[] | undefined | null): boolean {
  return isAdmin(roles) || isSecretary(roles);
}

/** Corregir asistencia: docentes, admin y secretaría. */
export function canWriteMarks(roles: string[] | undefined | null): boolean {
  return isAdmin(roles) || isTeacher(roles) || isSecretary(roles);
}
