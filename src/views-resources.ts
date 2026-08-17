import { api, type User } from './api/client';
import { escape } from './format';
import { shell } from './shell';
import { errorView } from './views';
import type { CourseView, LessonFile, LessonView, ModuleView } from './types/index';

interface ResourceItem { modulePosition: number; moduleTitle: string; lessonTitle: string; lessonId: string; file: LessonFile; instructor: boolean; }

export function resourcesView(user: User) {
  shell(user, `<section class="page-header"><div><span class="eyebrow">Course resources</span><h1>Resource centre</h1><p>Every starter file, cheat sheet, template and instructor resource across the 10 modules — searchable and downloadable for your portfolio work.</p></div></section><section class="analytics-card"><h2>Search resources</h2><input id="resource-search" placeholder="Search by file name, label, lesson or module…" style="width:100%;margin-bottom:14px"><div id="resource-count" class="muted"></div><div id="resource-list"><div class="loading">Loading…</div></div></section>`, 'Resources');
  loadResources(user);
}

async function loadResources(user: User) {
  try {
    const { course } = await api<{ course: CourseView }>('/api/courses');
    const items: ResourceItem[] = [];
    for (const module of course.modules) {
      for (const lesson of module.lessons) {
        for (const file of lesson.files) {
          items.push({ modulePosition: module.position, moduleTitle: module.title, lessonTitle: lesson.title, lessonId: lesson.id, file, instructor: false });
        }
        for (const file of lesson.resources || []) {
          items.push({ modulePosition: module.position, moduleTitle: module.title, lessonTitle: lesson.title, lessonId: lesson.id, file, instructor: true });
        }
      }
    }
    renderResources(items);
    document.querySelector('#resource-search')!.addEventListener('input', (event) => {
      renderResources(items, String((event.target as HTMLInputElement).value).trim().toLowerCase());
    });
  } catch (error) {
    errorView((error as Error).message);
  }
}

function renderResources(items: ResourceItem[], query = '') {
  const filtered = query
    ? items.filter((item) => [item.moduleTitle, item.lessonTitle, item.file.name, item.file.label, item.file.description].join(' ').toLowerCase().includes(query))
    : items;
  const byModule = new Map<number, { title: string; rows: ResourceItem[] }>();
  for (const item of filtered) {
    if (!byModule.has(item.modulePosition)) byModule.set(item.modulePosition, { title: item.moduleTitle, rows: [] });
    byModule.get(item.modulePosition)!.rows.push(item);
  }
  const groups = [...byModule.entries()].sort((a, b) => a[0] - b[0]).map(([, group]) => `<div class="review-deliverable"><strong>Module ${group.rows[0].modulePosition} — ${escape(group.title)}</strong><ul style="margin:8px 0 0;display:grid;gap:6px">${group.rows.map((item) => `<li style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><a href="${item.instructor ? '/api/lesson-resources/' : '/api/lesson-files/'}${encodeURIComponent(item.file.id)}" download><strong>${escape(item.file.name)}</strong></a>${item.instructor ? '<span class="badge">Instructor resource</span>' : ''}<span class="muted">${escape(item.file.label)} — ${escape(item.lessonTitle)}</span></li>`).join('')}</ul></div>`).join('');
  const count = document.querySelector('#resource-count');
  if (count) count.textContent = filtered.length === items.length ? `${items.length} resources available` : `${filtered.length} of ${items.length} resources match`;
  document.querySelector('#resource-list')!.innerHTML = filtered.length ? groups : '<p class="muted">No resources match that search.</p>';
}
