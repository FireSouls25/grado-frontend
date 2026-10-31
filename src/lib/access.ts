/** Capacidades por permiso efectivo, no por rol.
 *
 * El backend resuelve los permisos desde sus roles y los entrega en
 * `/v1/me` (`permissions`): este módulo solo lee esa lista. Añadir un
 * permiso nuevo es añadirlo al mapa de roles del backend y usar
 * `hasPermission` aquí; ningún rol se reimplementa en el frontend.
 * Si el backend aún no envía permisos, se respalda a la matriz por rol
 * anterior para no romper despliegues mezclados.
 */
export interface Who {
  permissions?: string[] | null;
  roles?: string[] | null;
}

function permissionsOf(who: Who | undefined | null): string[] | null {
  const list = who?.permissions;
  if (list && list.length > 0) return [...list];
  return null;
}

function rolesOf(who: Who | undefined | null): string[] {
  return who?.roles ?? [];
}

/** Nombres tal cual los entrega el backend (`Permission*`). */
export const Perm = {
  viewStudents: 'view-students',
  recordIncidents: 'record-incidents',
  recordAttendance: 'record-attendance',
  viewClassStats: 'view-class-statistics',
  manageStudents: 'manage-students',
  manageTeachers: 'manage-teachers',
  manageUsers: 'manage-users',
  manageRoles: 'manage-roles',
  manageSystem: 'manage-system',
  viewTeachers: 'view-teachers',
  blockAccess: 'block-access',
  manageSchedules: 'manage-schedules',
  viewWarnings: 'view-warnings',
  managePromotions: 'manage-promotions',
  manageOwners: 'manage-owners'
} as const;

function legacyGrants(perm: string, roles: string[]): boolean {
  const has = (...names: string[]) => names.some((n) => roles.includes(n));
  switch (perm) {
    case Perm.manageUsers:
      return has('admin');
    case Perm.blockAccess:
      return has('admin', 'secretary');
    case Perm.manageOwners:
      return has('owner');
    case Perm.recordIncidents:
      return has('admin', 'teacher');
    case Perm.managePromotions:
      return has('admin', 'secretary');
    case Perm.recordAttendance:
      return has('admin', 'teacher', 'secretary');
    default:
      return has('admin');
  }
}

/** ¿El permiso efectivo incluye `perm`? Respaldo a roles si falta. */
export function hasPermission(who: Who | undefined | null, perm: string): boolean {
  const perms = permissionsOf(who);
  if (perms) return perms.includes(perm);
  return legacyGrants(perm, rolesOf(who));
}

/** Crear/editar/retirar docentes y cuentas, años: solo admin. */
export function canManageUsers(who: Who | undefined | null): boolean {
  return hasPermission(who, Perm.manageUsers);
}

/** Bloquear o reactivar accesos: admin y secretaría. Solo el owner
 *  toca cuentas admin u owner (el backend lo niega al resto). */
export function canBlockAccess(who: Who | undefined | null): boolean {
  return hasPermission(who, Perm.blockAccess);
}

/** Ver eliminados, borrar, restaurar y tocar otros admins: owner. */
export function canManageOwners(who: Who | undefined | null): boolean {
  return hasPermission(who, Perm.manageOwners);
}

/** Crear o corregir llamados: docentes y admin; la secretaría solo mira. */
export function canWriteWarnings(who: Who | undefined | null): boolean {
  return hasPermission(who, Perm.recordIncidents);
}

/** Distribuir salones del año siguiente: admin y secretaría. */
export function canPromote(who: Who | undefined | null): boolean {
  return hasPermission(who, Perm.managePromotions);
}

/** Corregir asistencia: docentes, admin y secretaría. */
export function canWriteMarks(who: Who | undefined | null): boolean {
  return hasPermission(who, Perm.recordAttendance);
}

/** Identidad de rol para mostrar (no para autorizar): la consola usa
 *  permisos; esto solo etiqueta quién es quién en la interfaz. */
export function isAdmin(roles: string[] | undefined | null): boolean {
  return (roles ?? []).includes('admin');
}

export function isSecretary(roles: string[] | undefined | null): boolean {
  return (roles ?? []).includes('secretary');
}

export function isTeacher(roles: string[] | undefined | null): boolean {
  return (roles ?? []).includes('teacher');
}

export function isOwner(roles: string[] | undefined | null): boolean {
  return (roles ?? []).includes('owner');
}
