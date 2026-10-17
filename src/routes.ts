import Login from './domains/auth/Login.svelte';
import Recover from './domains/auth/Recover.svelte';
import SettingsPage from './domains/shell/SettingsPage.svelte';
import HelpPage from './domains/shell/HelpPage.svelte';
import Agenda from './domains/teacher/Agenda.svelte';
import ClassDetail from './domains/teacher/ClassDetail.svelte';
import WarningNew from './domains/teacher/WarningNew.svelte';
import ScheduleTab from './domains/teacher/ScheduleTab.svelte';
import StudentHome from './domains/student/Home.svelte';
import wrap from 'svelte-spa-router/wrap';
import type { Component } from 'svelte';

// Hash routing: works from file://, dev server and Tauri webviews alike,
// with no server fallback needed.
//
// Admin routes lazy-load (echarts travels only in the admin chunk, keeping
// the teacher bundle light for the APK).
const admin = (loader: () => Promise<{ default: Component }>) =>
  wrap({ asyncComponent: loader });

export const routes = {
  '/': Login,
  '/login': Login,
  '/recuperar': Recover,
  '/ajustes': SettingsPage,
  '/ayuda': HelpPage,
  '/hoy': Agenda,
  '/docente': Agenda,
  '/agenda': Agenda,
  '/mi-agenda': Agenda,
  '/horario': ScheduleTab,
  '/estudiante': StudentHome,
  '/clase/:groupID': ClassDetail,
  '/llamado/:groupID': WarningNew,
  '/admin': admin(() => import('./domains/admin/Overview.svelte')),
  '/admin/docentes': admin(() => import('./domains/admin/Teachers.svelte')),
  '/admin/docentes/:id': admin(() => import('./domains/admin/TeacherDetail.svelte')),
  '/admin/estudiantes': admin(() => import('./domains/admin/Students.svelte')),
  '/admin/estudiantes/:id': admin(() => import('./domains/admin/StudentDetail.svelte')),
  '/admin/materias': admin(() => import('./domains/admin/Subjects.svelte')),
  '/admin/materias/:id': admin(() => import('./domains/admin/SubjectDetail.svelte')),
  '/admin/horario': admin(() => import('./domains/admin/ScheduleBoard.svelte')),
  '/admin/auditoria': admin(() => import('./domains/admin/Audit.svelte')),
  '*': Login
};
