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
    students: 'Estudiantes',
    agenda: 'Mi Agenda',
    myClasses: 'Mis Clases',
    warnings: 'Llamados de Atención'
  },
  agenda: {
    breadcrumbHome: 'Inicio',
    breadcrumbHere: 'Mi Agenda',
    eyebrow: 'Consola docente',
    title: 'Agenda de Clases',
    stateDone: 'Finalizada',
    stateNow: 'Ahora',
    stateNext: 'Siguiente',
    openList: 'Abrir lista',
    searchLabel: 'Buscar en tu agenda',
    todayLabel: 'Clases de hoy',
    todayValue: (count: number) => `${count} clases`,
    registeredLabel: 'Registradas',
    registeredValue: (done: number, total: number) => `${done} de ${total}`,
    monthLabel: 'Noviembre 2026',
    listTitle: 'Listado de clases asignadas',
    searchPlaceholder: 'Buscar estudiante o clase…',
    teacherName: 'Prof. Carlos Mendoza',
    teacherId: 'ID: #40582',
    openClass: 'Abrir Clase',
    statusDone: 'Finalizado',
    statusPending: 'Pendiente',
    gradeLabel: (grade: string) => `Grado: ${grade}`,
    roomLabel: (room: string) => `Salón ${room}`,
    loading: 'Cargando tu agenda…',
    emptyTitle: 'Sin clases este día',
    emptyBody: 'No tienes clases asignadas para este día. Elige otro día de la semana.'
  },
  studentHome: {
    eyebrow: 'Consola del estudiante',
    title: 'Mi historial',
    body: 'Aquí verás tus asistencias, llamados y faltas. Esta vista estará disponible próximamente.'
  },
  teacher: {
    eyebrow: 'Consola docente',
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
    eyebrow: 'Consola docente',
    title: 'Horario semanal',
    openList: 'Abrir lista',
    stateDone: 'Finalizada',
    stateNow: 'Ahora',
    stateNext: 'Siguiente',
    loading: 'Cargando tu horario…',
    emptyTitle: 'Sin horario todavía',
    emptyBody:
      'Cuando un administrador arme tu horario semanal aparecerá aquí, día por día.'
  },
  attendance: {
    breadcrumbHome: 'Inicio',
    breadcrumbAgenda: 'Mi Agenda',
    breadcrumbHere: 'Detalle de Clase',
    title: 'Control de Asistencia',
    collective: 'Llamado de Atención Colectivo',
    todayTag: 'Clase de hoy',
    dateLabel: 'Lunes 18 de Nov, 2026',
    timeLabel: (range: string) => `${range} (90 Min)`,
    roomLabel: (room: string) => `Salón de Ciencias ${room}`,
    summaryTitle: 'Resumen de Asistencia',
    presentLabel: 'Asistentes',
    absentLabel: 'Ausentes',
    studentsCount: (count: number) =>
      count === 1 ? '1 Estudiante' : `${count} Estudiantes`,
    listTitle: (group: string) => `Listado del Salón (${group})`,
    listHint: 'Ordenado alfabéticamente por apellido',
    colId: 'ID Estudiante',
    colName: 'Apellido, Nombre',
    colCheck: 'Asistencia',
    eyebrow: 'Consola docente',
    back: 'Volver a la Agenda',
    save: 'Guardar Asistencia',
    saved: 'Asistencia guardada.',
    savedLocal:
      'Guardado local: el backend aún no expone sesiones, así que nada se envió.',
    noSessionNote:
      'Sin sesión abierta en el backend: las marcas se conservan solo en este dispositivo.',
    emptyRosterTitle: 'Salón sin lista',
    emptyRosterBody:
      'El backend aún no expone la nómina de este salón. Vuelve a intentarlo más tarde.',
    saveHint: 'Marca con el check a quienes asistieron. Sin marca cuenta como ausente.',
    classDesc:
      'Clase enfocada en Mecánica de Fluidos y dinámica estática. Se revisarán ejercicios y casos prácticos.'
  },
  warning: {
    breadcrumbHome: 'Inicio',
    breadcrumbAgenda: 'Mi Agenda',
    breadcrumbDetail: 'Detalle de Clase',
    breadcrumbHere: 'Llamado de Atención',
    title: 'Registrar Llamado de Atención',
    originTag: 'Clase de origen',
    originNote:
      'El llamado de atención quedará guardado en el historial del estudiante.',
    titleLabel: 'Título del Llamado / Incidencia',
    titleOptions: [
      'Irrespeto reiterado a normas de convivencia en el salón de clases',
      'Uso de dispositivos móviles sin autorización durante la clase',
      'Inasistencia injustificada a la clase',
      'Falta de respeto hacia un compañero o docente'
    ],
    studentLabel: 'Seleccionar Estudiante',
    severityLabel: 'Nivel de Severidad',
    severityMild: 'Leve',
    severityModerate: 'Medio',
    severitySevere: 'Grave',
    descLabel: 'Descripción detallada de los hechos',
    descPlaceholder: 'Describe lo ocurrido con detalle…',
    descDefault:
      'El estudiante persistió en el uso de dispositivos móviles y juegos de mesa no autorizados durante el desarrollo de la explicación de Mecánica de Fluidos, ignorando las advertencias directas en tres oportunidades.',
    eyebrow: 'Consola docente',
    noRosterTitle: 'Salón sin lista',
    noRosterBody:
      'El backend aún no expone la nómina de este salón, así que no se puede registrar el llamado.',
    pendingBackend:
      'El backend aún no expone el registro de llamados; nada se envió.',
    cancel: 'Cancelar',
    save: 'Guardar Registro',
    saving: 'Guardando…',
    saved: 'Llamado guardado en el historial del estudiante.',
    backToDetail: 'Volver al detalle de la clase',
    loading: 'Cargando el formulario…'
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
    assignFailed: 'No se pudo asignar.',
    noCatalog: 'No hay materias creadas todavía.',
    directs: (group: string) => `Dirige ${group}`,
    inactive: 'Inactivo',
    roleDirector: 'Director de grupo',
    rolePlain: 'Docente',
    filterSubject: 'Materia',
    filterGroup: 'Salón',
    filterRole: 'Rol',
    filterAll: 'Todos',
    teachersCount: (count: number) =>
      count === 1 ? '1 docente' : `${count} docentes`,
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
      'El horario no se genera solo: cada bloque lo coloca el administrador eligiendo docente y materia.',
    newStudent: 'Nuevo estudiante',
    newTeacher: 'Nuevo docente',
    formNames: 'Nombres',
    formSurnames: 'Apellidos',
    formDocument: 'Documento',
    formDocumentPlaceholder: 'CC o TI',
    formClass: 'Curso',
    formClassPlaceholder: '9-1',
    formBirthdate: 'Fecha de nacimiento',
    formCaregiverName: 'Nombre del acudiente',
    formCaregiverPhone: 'Teléfono del acudiente',
    formPhone: 'Teléfono',
    formEmail: 'Correo',
    formUsername: 'Usuario de acceso (opcional)',
    formUsernamePlaceholder: 'nombre.apellido',
    formPassword: 'Contraseña inicial (opcional)',
    formPasswordHint:
      'Mínimo 8 caracteres, con letra y número. El docente solo la usará para entrar; no hay registro público.',
    formCreate: 'Crear',
    formClose: 'Cerrar',
    createdStudent: 'Estudiante creado.',
    createdTeacher: 'Docente creado.',
    accountCreated: 'Cuenta de acceso creada y rol otorgado.',
    accountPending: 'Acceso pendiente: actualiza el backend para crear la cuenta.',
    formRequired: 'Completa nombres, apellidos y documento.',
    formDocumentDigits: 'El documento solo acepta números.',
    formEmailInvalid: 'Ese correo no parece válido.',
    formPasswordWeak: 'La contraseña debe tener al menos 8 caracteres, con letra y número.',
    accountNeedsBoth: 'Para crear el acceso escribe usuario y contraseña.',
    createAnother: 'Crear otro',
    consoleEyebrow: 'Consola del colegio',
    consoleSearch: 'Buscar estudiante o salón…',
    consoleSearchLabel: 'Buscar en la consola',
    schoolName: 'Nuestra Señora de Guadalupe',
    schoolSite: 'Sede central',
    manageTitle: 'Gestionar',
    yearLabel: 'Año lectivo',
    viewOverview: 'Resumen',
    viewHistory: 'Historial',
    attRisk: 'Riesgo de asistencia',
    attRiskDetail: 'Bajo 85% o con 3 faltas o más',
    attListed: 'Salones con lista',
    attListedDetail: 'Con sesiones registradas',
    attSessions: 'Listas pasadas',
    attSessionsDetail: 'Sesiones registradas',
    attActionList: 'Ver lista',
    attNoData: 'Sin datos todavía',
    trendTitle: 'Tendencia de asistencia',
    trendEmpty: 'Sin tendencia todavía: no hay serie temporal en el backend.',
    trendPrev: 'Periodo anterior',
    trendCurrent: 'Este periodo',
    salonRateTitle: 'Tasa por salón',
    salonRateCaption: 'Con lista pasada',
    salonRateEmpty: 'Sin salones con lista pasada todavía.',
    salonBelow: (count: number) =>
      count === 1 ? '1 salón bajo el umbral de 85%' : `${count} salones bajo el umbral de 85%`,
    riskTitle: 'Estudiantes en riesgo',
    riskCount: (count: number) =>
      count === 1 ? '1 en lista' : `${count} en lista`,
    riskEmpty: 'Sin estudiantes en riesgo todavía.',
    riskNoMatch: 'Sin coincidencias para esa búsqueda.',
    colStudent: 'Estudiante',
    colSalon: 'Salón',
    colAbsences: 'Inasist.',
    colEvasions: 'Evas.',
    colRate: 'Tasa',
    rateBelow: (delta: number) => `${delta} del 85%`,
    rateAbove: (delta: number) => `+${delta} sobre 85%`,
    openFile: 'Abrir ficha',
    pendingTitle: 'Pendientes',
    pendingOpen: (count: number) =>
      count === 1 ? '1 abierto' : `${count} abiertos`,
    pendingEmpty: 'Sin pendientes por ahora.',
    pendingHint: 'Toca el círculo para dar por hecho un pendiente.',
    soon: 'Próximamente',
    callAction: 'Llamar',
    callSoonNote: 'Las llamadas al acudiente llegan próximamente.',
    reviewAction: 'Revisar',
    todayTitle: 'Horario de hoy',
    todayEmpty: 'Sin bloques hoy: el backend aún no expone el horario.',
    seeWeek: 'Ver semana',
    historyWarnings: 'Llamados',
    historyIncidents: 'Incidentes',
    historyEmpty: 'Sin movimientos todavía.',
    salonsCount: (count: number) =>
      count === 1 ? '1 salón' : `${count} salones`,
    salonNoTeacher: 'Sin asignar',
    teachersSearch: 'Buscar docente…',
    teachersEmptySearch: 'Ningún docente coincide con esa búsqueda.',
    reportTitle: 'Reporte del salón',
    reportSessions: (count: number) =>
      count === 1 ? '1 sesión' : `${count} sesiones`,
    reportEmpty: 'Sin lista pasada todavía para este salón.',
    scheduleSoon: 'La asignación de bloques llega próximamente.',
    navWarnings: 'Llamados'
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
