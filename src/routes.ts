import Login from './domains/auth/Login.svelte';
import Home from './domains/teacher/Home.svelte';
import ClassDetail from './domains/teacher/ClassDetail.svelte';
import ScheduleTab from './domains/teacher/ScheduleTab.svelte';

// Hash routing: works from file://, dev server and Tauri webviews alike,
// with no server fallback needed.
export const routes = {
  '/': Login,
  '/login': Login,
  '/hoy': Home,
  '/horario': ScheduleTab,
  '/clase/:groupID': ClassDetail,
  '*': Login
};
