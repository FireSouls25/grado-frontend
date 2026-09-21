import Login from './domains/auth/Login.svelte';
import Recover from './domains/auth/Recover.svelte';
import SettingsPage from './domains/shell/SettingsPage.svelte';
import HelpPage from './domains/shell/HelpPage.svelte';
import Home from './domains/teacher/Home.svelte';
import ClassDetail from './domains/teacher/ClassDetail.svelte';
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
  '/hoy': Home,
  '/docente': Home,
  '/horario': ScheduleTab,
  '/estudiante': StudentHome,
  '/clase/:groupID': ClassDetail,
  '/admin': admin(() => import('./domains/admin/Overview.svelte')),
  '/admin/docentes': admin(() => import('./domains/admin/Teachers.svelte')),
  '/admin/docentes/:id': admin(() => import('./domains/admin/TeacherDetail.svelte')),
  '/admin/estudiantes': admin(() => import('./domains/admin/Students.svelte')),
  '/admin/horario': admin(() => import('./domains/admin/ScheduleBoard.svelte')),
  '*': Login
};
