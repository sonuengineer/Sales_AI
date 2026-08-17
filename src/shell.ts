import { api, type User } from './api/client';
import { escape } from './format';

export const roleNames: Record<string, string> = { ADMIN: 'Admin', INSTRUCTOR: 'Instructor', STUDENT: 'Student' };
export const navigation: Record<string, string[]> = {
  ADMIN: ['Dashboard', 'Users', 'Courses', 'CRM Lab', 'Workflow Lab', 'Analytics', 'Cohorts', 'Reports', 'Certificates', 'Settings'],
  INSTRUCTOR: ['Dashboard', 'Courses', 'Resources', 'Glossary', 'Coverage', 'Cohorts', 'CRM Lab', 'Workflow Lab', 'Analytics', 'Assignments', 'Quizzes', 'Capstones', 'Profile'],
  STUDENT: ['My Learning', 'Curriculum', 'Resources', 'Glossary', 'CRM Lab', 'Workflow Lab', 'Dashboard', 'Analytics', 'Assignments', 'AI Practice Lab', 'Capstone', 'Certificates', 'Profile'],
};

const navHandlers = new Map<string, (user: User) => void>();
let defaultNavHandler: ((user: User) => void) | null = null;
let renderApp: (() => void) | null = null;

export function registerNavHandler(item: string, handler: (user: User) => void) { navHandlers.set(item, handler); }
export function setDefaultNavHandler(handler: (user: User) => void) { defaultNavHandler = handler; }
export function setRenderApp(render: () => void) { renderApp = render; }

export function navigate(user: User, item: string) {
  const handler = navHandlers.get(item) || defaultNavHandler;
  if (handler) handler(user);
}

export function shell(user: User, content: string, active = 'Dashboard') {
  const app = document.querySelector('#app') as HTMLElement;
  const nav = (navigation[user.role] || []).map((item) => `<button class="nav-item ${item === active ? 'active' : ''}" data-nav="${escape(item)}">${item}</button>`).join('');
  app.innerHTML = `<div class="shell"><aside class="sidebar"><div class="brand">NexaFlow <small>Training platform</small></div><nav class="nav">${nav}</nav></aside><div class="content"><header class="topbar"><span class="eyebrow">${roleNames[user.role]} workspace</span><div class="profile"><span class="avatar">${escape(user.name)[0]}</span><span>${escape(user.name)}</span><button id="logout" class="secondary">Sign out</button></div></header><main class="main">${content}</main></div></div>`;
  document.querySelector('#logout')!.addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST' });
    renderApp?.();
  });
  document.querySelectorAll('[data-nav]').forEach((button) => {
    button.addEventListener('click', () => {
      const item = button.getAttribute('data-nav') || '';
      const handler = navHandlers.get(item) || defaultNavHandler;
      if (handler) handler(user);
    });
  });
}
