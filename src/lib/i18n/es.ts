// Central UI copy. Spanish only for now; every user-facing string lives
// here (never inline in components) so i18n later means adding a locale
// file, not hunting strings. Tone: plain app language, sentence case,
// one job per string; empties invite action, errors explain and guide.
export const es = {
  app: {
    name: 'Observador Estudiantil'
  },
  a11y: {
    back: 'Atrás',
    close: 'Cerrar',
    sections: 'Secciones',
    actions: 'Acciones',
    theme: 'Tema',
    prevYear: 'Año anterior',
    nextYear: 'Año siguiente'
  },
  login: {
    brand: 'Observador Estudiantil',
    tagline: 'El historial académico de tu colegio, en un solo lugar.',
    title: 'Iniciar sesión',
    subtitle: 'Usa tu correo o tu usuario y tu contraseña para entrar.',
    identifierLabel: 'Correo o usuario',
    identifierPlaceholder: 'ana.gomez',
    passwordLabel: 'Contraseña',
    showPassword: 'Mostrar contraseña',
    hidePassword: 'Ocultar contraseña',
    forgot: '¿Olvidaste tu contraseña?',
    submit: 'Entrar',
    signingIn: 'Entrando…',
    missingCredentials: 'Escribe tu usuario y tu contraseña para continuar.',
    invalidPassword: 'La contraseña no coincide. Intenta de nuevo.',
    unknownAccount:
      'No encontramos esa cuenta. Revisa tu correo o usuario.',
    features: [
      {
        title: 'Lista en segundos',
        body: 'Abre tu clase del día y marca la asistencia sin planillas.'
      },
      {
        title: 'Historial por estudiante',
        body: 'Inasistencias, evasiones, atrasos y llamados, año por año.'
      },
      {
        title: 'Horarios por salón',
        body: 'Cada salón con sus docentes y materias, semana a semana.'
      }
    ],
    footer: 'Uso institucional. Si no tienes cuenta, pide una a tu colegio.'
  },
  recovery: {
    title: 'Recuperar contraseña',
    body: 'Escribe tu correo o tu usuario y te enviaremos un enlace para crear una nueva contraseña.',
    identifierLabel: 'Correo o usuario',
    submit: 'Enviar enlace',
    sending: 'Enviando…',
    missing: 'Escribe tu correo o tu usuario para continuar.',
    successTitle: 'Revisa tu correo',
    successBody:
      'Si la cuenta existe, en unos minutos llegará un enlace para crear una nueva contraseña.',
    backToLogin: 'Volver a iniciar sesión',
    demoNote: 'Demostración visual: aún no se envía ningún correo.'
  },
  nav: {
    today: 'Hoy',
    schedule: 'Horario',
    overview: 'Resumen',
    teachers: 'Docentes',
    students: 'Estudiantes'
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
    warnStudents: (count: number) =>
      count === 1 ? '1 estudiante' : `${count} estudiantes`,
    warnSubjectLabel: 'Título',
    warnGravityLabel: 'Gravedad',
    warnGravityMild: 'Leve',
    warnGravityModerate: 'Medio',
    warnGravitySevere: 'Grave',
    warnDescLabel: 'Descripción',
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
  admin: {
    overviewTitle: 'Panel',
    teachersTitle: 'Docentes',
    teacherDetailTitle: 'Docente',
    studentsTitle: 'Estudiantes',
    scheduleTitle: 'Horario',
    statsStudents: 'Estudiantes',
    statsTeachers: 'Docentes',
    statsGroups: 'Salones',
    statsWarnings: 'Llamados',
    attendanceTitle: 'Asistencia general',
    warningsTitle: 'Llamados por gravedad',
    markPresent: 'Presentes',
    markAbsence: 'Inasistencias',
    markEvasion: 'Evasiones',
    markLate: 'Atrasos',
    chooseYearGroupTitle: 'Elige un año y un salón',
    chooseYearGroupBody:
      'Selecciona el año y el salón para ver sus gráficos y listas.',
    noTeachersTitle: 'Aún no hay docentes',
    noTeachersBody:
      'Cuando existan docentes registrados aparecerán aquí con su ficha, sus materias y sus salones.',
    noSubjects: 'Sin materias asignadas.',
    noGroups: 'Sin salones en el horario.',
    assignSubject: 'Asignar',
    assignSubjectTitle: 'Asignar materia',
    noCatalog: 'No hay materias creadas todavía.',
    directs: (group: string) => `Dirige ${group}`,
    inactive: 'Inactivo',
    subjectsTitle: 'Materias',
    groupsTitle: 'Salones',
    loadingGroups: 'Cargando salones…',
    groupDetailTitle: (label: string, year: number) => `Salón ${label} · ${year}`,
    noGroupsYear: (year: number) => `Sin salones en ${year}`,
    noGroupsYearBody:
      'Cuando existan salones con estudiantes matriculados aparecerán aquí, organizados por grado y grupo.',
    groupStudents: (count: number) =>
      count === 1 ? '1 estudiante' : `${count} estudiantes`,
    rosterHint: 'Toca un salón para ver su lista de estudiantes.',
    scheduleGroupLabel: 'Salón',
    scheduleGroupPlaceholder: '7-1',
    scheduleYearLabel: 'Año',
    scheduleWeekdays: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'],
    scheduleHours: ['7 AM', '8 AM', '9 AM', '10 AM', '11 AM', '12 PM', '1 PM', '2 PM'],
    scheduleEmpty: 'Escribe un salón para ver su semana.',
    scheduleEditHint: 'Tocar una celda asignará docente, materia y horas.',
    scheduleNoBlocks: (salon: string, year: number) =>
      `Sin bloques para ${salon} · ${year}. Toca una celda vacía para asignar docente y materia.`,
    scheduleManualTitle: 'Edición manual, como en secretaría',
    scheduleManualBody:
      'El horario no se genera solo: cada bloque lo coloca el administrador eligiendo docente y materia.'
  },
  charts: {
    noData: 'Sin datos todavía'
  },
  settings: {
    title: 'Ajustes',
    theme: 'Apariencia',
    themeLight: 'Claro',
    themeDark: 'Oscuro',
    themeAuto: 'Automático',
    about: 'Acerca de la aplicación',
    aboutBody:
      'Observador Estudiantil lleva el historial escolar: asistencia, faltas y convivencia de cada estudiante, por salón y por año.',
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
