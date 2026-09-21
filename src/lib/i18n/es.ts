// Central UI copy. Spanish only for now; every user-facing string lives
// here (never inline in components) so i18n later means adding a locale
// file, not hunting strings.
export const es = {
  app: {
    name: 'Grado'
  },
  login: {
    title: 'Bienvenido a Grado',
    subtitle: 'Ingresa para ver tus clases y estudiantes.',
    subjectLabel: 'Identificación de usuario',
    subjectHint: 'Tu cuenta la crea un administrador. Por ahora usa tu id.',
    submit: 'Entrar',
    missingId: 'Escribe tu identificación para continuar.'
  },
  nav: {
    today: 'Hoy',
    schedule: 'Horario'
  },
  teacher: {
    greeting: 'Hola',
    todayTitle: 'Clases de hoy',
    nextTitle: 'Próxima clase',
    weekendTitle: 'Fin de semana',
    weekendBody:
      'No hay clases hoy. Esta es la próxima en tu horario.',
    emptyTitle: 'Sin clases asignadas',
    emptyBody:
      'Aún no tienes materias ni salones asignados. Un administrador las asignará y aparecerán aquí.',
    loading: 'Cargando tus clases…',
    classStudents: (count: number) =>
      count === 1 ? '1 estudiante' : `${count} estudiantes`,
    openList: 'Pasar lista',
    startsAt: 'Inicia'
  },
  roster: {
    title: 'Lista de estudiantes',
    emptyTitle: 'Salón vacío',
    emptyBody: 'No hay estudiantes matriculados en este salón.',
    present: 'Presente',
    absent: 'Inasistencia',
    evasion: 'Evasión',
    late: 'Atraso',
    warn: 'Llamado de atención',
    warnTitle: 'Nuevo llamado de atención',
    warnPlaceholder: 'Describe lo ocurrido…',
    warnSave: 'Guardar llamado',
    warnSaved: 'Llamado guardado.',
    markSaved: 'Asistencia guardada.'
  },
  schedule: {
    title: 'Horario semanal',
    emptyTitle: 'Sin horario todavía',
    emptyBody:
      'Cuando un administrador arme tu horario semanal aparecerá aquí, día por día.'
  },
  settings: {
    title: 'Ajustes',
    theme: 'Apariencia',
    themeLight: 'Claro',
    themeDark: 'Oscuro',
    themeAuto: 'Automático',
    about: 'Acerca de Grado',
    aboutBody:
      'Grado lleva el historial escolar: asistencia, faltas y convivencia de cada estudiante, por salón y por año.',
    account: 'Cuenta',
    signOut: 'Cerrar sesión'
  },
  help: {
    title: 'Ayuda',
    intro: 'Guías cortas para usar la aplicación.',
    guides: [
      {
        title: 'Pasar lista',
        body: 'Abre tu clase del día, toca un estudiante y marca inasistencia, evasión o atraso. Sin marca cuenta como presente.'
      },
      {
        title: 'Llamado de atención',
        body: 'Selecciona uno o varios estudiantes y describe lo ocurrido. El llamado guarda sus datos tal como están en ese momento.'
      },
      {
        title: 'Corregir asistencia',
        body: 'Si un estudiante llega tarde, cambia su marca: se guardan ambos estados y puedes ver la diferencia.'
      }
    ]
  },
  common: {
    back: 'Atrás',
    close: 'Cerrar',
    save: 'Guardar',
    cancel: 'Cancelar',
    retry: 'Reintentar',
    loadError: 'No se pudo cargar. Revisa tu conexión e intenta de nuevo.',
    today: 'Hoy'
  }
} as const;

export type Copy = typeof es;
