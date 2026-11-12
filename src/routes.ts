import Login from './domains/auth/Login.svelte';
import Recover from './domains/auth/Recover.svelte';
import ResetPassword from './domains/auth/ResetPassword.svelte';
import SettingsPage from './domains/shell/SettingsPage.svelte';
import ProfilePage from './domains/shell/ProfilePage.svelte';
import HelpPage from './domains/shell/HelpPage.svelte';
import Agenda from './domains/teacher/Agenda.svelte';
import ClassDetail from './domains/teacher/ClassDetail.svelte';
import WarningNew from './domains/teacher/WarningNew.svelte';
import Observations from './domains/teacher/Observations.svelte';
import ScheduleTab from './domains/teacher/ScheduleTab.svelte';
import StudentHome from './domains/student/Home.svelte';
import wrap from 'svelte-spa-router/wrap';
import type { Component } from 'svelte';
import { guard, type Area } from '$lib/routeGuard';

// Hash routing: works from file://, dev server and Tauri webviews alike,
// with no server fallback needed.
//
// Admin routes lazy-load (echarts travels only in the admin chunk, keeping
// the teacher bundle light for the APK).
//
// Cada ruta privada lleva su condición de área: si falla, el componente
// nunca se crea y App decide (login o inicio propio con aviso).
const admin = (loader: () => Promise<{ default: Component }>) =>
  wrap({ asyncComponent: loader, conditions: [guard('admin')] });
const only = (area: Area, component: Component) => wrap({ component, conditions: [guard(area)] });

export const routes = {
  '/': Login,
  '/login': Login,
  '/recuperar': Recover,
  '/recuperar/:token': ResetPassword,
  '/ajustes': only('any', SettingsPage),
  '/ayuda': only('any', HelpPage),
  '/perfil': only('any', ProfilePage),
  '/hoy': only('teacher', Agenda),
  '/docente': only('teacher', Agenda),
  '/agenda': only('teacher', Agenda),
  '/mi-agenda': only('teacher', Agenda),
  '/horario': only('teacher', ScheduleTab),
  '/observaciones': only('teacher', Observations),
  '/estudiante': only('student', StudentHome),
  '/clase/:groupID': only('teacher', ClassDetail),
  '/llamado/:groupID': only('teacher', WarningNew),
  '/admin': admin(() => import('./domains/admin/Overview.svelte')),
  '/admin/docentes': admin(() => import('./domains/admin/Teachers.svelte')),
  '/admin/docentes/lista': admin(() => import('./domains/admin/TeacherRoll.svelte')),
  '/admin/docentes/historial': admin(() => import('./domains/admin/TeacherRollHistory.svelte')),
  '/admin/usuarios': admin(() => import('./domains/admin/Users.svelte')),
  '/admin/docentes/:id': admin(() => import('./domains/admin/TeacherDetail.svelte')),
  '/admin/estudiantes': admin(() => import('./domains/admin/Students.svelte')),
  '/admin/estudiantes/historial': admin(() => import('./domains/admin/SessionHistory.svelte')),
  '/admin/estudiantes/:id/resumen': admin(() => import('./domains/admin/StudentSummary.svelte')),
  '/admin/estudiantes/:id': admin(() => import('./domains/admin/StudentDetail.svelte')),
  '/admin/horario': admin(() => import('./domains/admin/ScheduleBoard.svelte')),
  '/admin/llamados': admin(() => import('./domains/admin/Warnings.svelte')),
  '/admin/anos': admin(() => import('./domains/admin/SchoolYears.svelte')),
  '/admin/cierre': admin(() => import('./domains/admin/YearEnd.svelte')),
  '/admin/cierre/salones': admin(() => import('./domains/admin/Distribute.svelte')),
  '*': Login
};
