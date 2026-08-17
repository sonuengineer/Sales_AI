import { api, type User } from './api/client';
import { escape, parseYouTubeId, youtubeEmbedUrl, youtubeThumbUrl } from './format';
import { shell } from './shell';
import { errorView } from './views';
import type { CourseView, LessonView, ModuleView } from './types/index';

function progressBar(value: number) { return `<div class="progress"><span style="width:${value}%"></span></div>`; }

// Renders lesson content as structured HTML: `## ` / `### ` headings, `- ` bullets
// and paragraphs separated by blank lines, so full-length lesson text stays readable.
export function renderLessonContent(content: string) {
  const lines = content.split('\n');
  const out: string[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  const flushParagraph = () => { if (paragraph.length) { out.push(`<p>${escape(paragraph.join(' '))}</p>`); paragraph = []; } };
  const flushList = () => { if (list.length) { out.push(`<ul>${list.map((item) => `<li>${escape(item)}</li>`).join('')}</ul>`); list = []; } };
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith('### ')) { flushParagraph(); flushList(); out.push(`<h4>${escape(line.slice(4))}</h4>`); }
    else if (line.startsWith('## ')) { flushParagraph(); flushList(); out.push(`<h3>${escape(line.slice(3))}</h3>`); }
    else if (line.startsWith('- ')) { flushParagraph(); list.push(line.slice(2)); }
    else if (line === '') { flushParagraph(); flushList(); }
    else paragraph.push(line);
  }
  flushParagraph(); flushList();
  return out.join('');
}

export async function courseView(user: User) {
  try {
    const { course } = await api<{ course: CourseView }>('/api/courses');
    const canManage = user.role !== 'STUDENT';
    const modules = course.modules.map((module) => `<article class="module"><div class="module-head"><div><span class="eyebrow">Module ${module.position}</span><h2>${escape(module.title)}</h2><p>${escape(module.summary)}</p></div><span class="module-actions"><span>${module.completedLessons}/${module.lessons.length} complete</span>${canManage ? `<button class="secondary" data-edit-module="${module.id}">Edit module</button>` : ''}</span></div>${module.lessons.map((lesson) => `<div class="lesson-row-wrap"><button class="lesson-row" data-lesson="${lesson.id}"><span>${lesson.completed ? '✓' : '○'} ${escape(lesson.title)}</span><small>${lesson.durationMinutes} min</small></button>${canManage ? `<button class="secondary lesson-edit" data-edit-lesson="${lesson.id}">Edit</button>` : ''}</div>`).join('') || '<p class="muted">No lessons yet.</p>'}</article>`).join('');
    const controls = canManage ? `<section class="editor"><h2>Manage course content</h2><form id="course-form"><label>Course title<input name="title" value="${escape(course.title)}" required></label><label>Summary<input name="summary" value="${escape(course.summary)}"></label><button>Save course details</button></form><form id="module-form"><h3>Add module</h3><label>Module title<input name="title" required></label><label>Summary<input name="summary"></label><button>Add module</button></form><form id="lesson-form"><h3>Add lesson</h3><label>Module<select name="moduleId">${course.modules.map((module) => `<option value="${module.id}">${escape(module.title)}</option>`).join('')}</select></label><label>Lesson title<input name="title" required></label><label>Summary<input name="summary"></label><label>Learning objectives (one per line)<textarea name="objectives" rows="3"></textarea></label><label>Lesson content<textarea name="content" rows="5"></textarea></label><label>Video URL<input name="videoUrl" type="url"></label><label style="display:flex;align-items:center;gap:8px"><input name="videoRequired" type="checkbox"> Mark video as required viewing</label><label>Estimated minutes<input name="durationMinutes" type="number" min="1" value="10"></label><button>Add lesson</button></form></section>` : '';
    shell(user, `<section class="page-header"><div><span class="eyebrow">Course library</span><h1>${escape(course.title)}</h1><p>${escape(course.summary)}</p></div><div class="progress-card"><strong>${course.progressPercent}% complete</strong>${progressBar(course.progressPercent)}<small>${course.completedLessonCount} of ${course.lessonCount} lessons completed</small></div></section><section class="module-list">${modules}</section>${controls}`, user.role === 'STUDENT' ? 'My Learning' : 'Courses');
    document.querySelectorAll('[data-lesson]').forEach((button) => button.addEventListener('click', () => lessonView(user, button.getAttribute('data-lesson')!)));
    document.querySelectorAll('[data-edit-lesson]').forEach((button) => button.addEventListener('click', () => lessonEditView(user, button.getAttribute('data-edit-lesson')!)));
    document.querySelectorAll('[data-edit-module]').forEach((button) => button.addEventListener('click', () => moduleEditView(user, course.modules.find((module) => module.id === button.getAttribute('data-edit-module'))!)));
    if (canManage) bindCourseForms(user);
  } catch (error) {
    errorView((error as Error).message);
  }
}

function bindCourseForms(user: User) {
  document.querySelector('#course-form')!.addEventListener('submit', async (event) => {
    event.preventDefault();
    try { await api('/api/courses', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement))) }); courseView(user); } catch (error) { alert((error as Error).message); }
  });
  document.querySelector('#module-form')!.addEventListener('submit', async (event) => {
    event.preventDefault();
    try { await api('/api/modules', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement))) }); courseView(user); } catch (error) { alert((error as Error).message); }
  });
  document.querySelector('#lesson-form')!.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const data = Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement)) as Record<string, string>;
      const objectives = String(data.objectives || '').split('\n').map((item) => item.trim()).filter(Boolean);
      const videoRequired = data.videoRequired === 'on' ? 1 : 0;
      delete data.objectives;
      delete data.videoRequired;
      await api('/api/lessons', { method: 'POST', body: JSON.stringify({ ...data, objectives, videoRequired }) });
      courseView(user);
    } catch (error) { alert((error as Error).message); }
  });
}

function moduleEditView(user: User, module: ModuleView) {
  shell(user, `<button id="back" class="secondary">← Back to course</button><article class="editor"><span class="eyebrow">Module ${module.position}</span><h1>Edit module</h1><form id="module-edit-form"><label>Module title<input name="title" value="${escape(module.title)}" required></label><label>Summary<input name="summary" value="${escape(module.summary)}"></label><button>Save module</button></form></article>`, user.role === 'STUDENT' ? 'My Learning' : 'Courses');
  document.querySelector('#back')!.addEventListener('click', () => courseView(user));
  document.querySelector('#module-edit-form')!.addEventListener('submit', async (event) => {
    event.preventDefault();
    try { await api(`/api/modules/${module.id}`, { method: 'PUT', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement))) }); courseView(user); } catch (error) { alert((error as Error).message); }
  });
}

async function lessonEditView(user: User, lessonId: string) {
  try {
    const { lesson } = await api<{ lesson: LessonView }>(`/api/lessons/${lessonId}`);
    const filesNote = lesson.files.length ? `<div class="starter-files"><h2>Bundled starter files</h2><p class="muted">${lesson.files.length} file(s) are bundled with this lesson and downloaded by learners. File content is managed in the seed data — edit <code>data/course.seed.json</code> to change it.</p><ul>${lesson.files.map((file) => `<li><strong>${escape(file.name)}</strong> — ${escape(file.label)}</li>`).join('')}</ul></div>` : '';
    const resourcesSection = `<div class="starter-files"><h2>Instructor resources</h2><p class="muted">Attach extra resources learners can download for this lesson. Content is stored as text — paste the file body below.</p><div id="resource-list">${lesson.resources.length ? `<ul style="margin:8px 0 0">${lesson.resources.map((file) => `<li style="display:flex;align-items:center;gap:10px">${escape(file.name)} — <span class="muted">${escape(file.label)}</span><button class="danger-link" data-remove-resource="${file.id}">Remove</button></li>`).join('')}</ul>` : '<p class="muted">No instructor resources attached yet.</p>'}</div><form id="resource-form" style="margin-top:12px"><h3>Add resource</h3><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label>File name<input name="name" placeholder="e.g. extra-reading.md" required></label><label>Label<input name="label" placeholder="e.g. Additional reading" required></label></div><label>Description<input name="description" placeholder="Short description of the resource"></label><label>Type<select name="contentType"><option value="text/plain">Plain text</option><option value="text/markdown">Markdown</option><option value="text/csv">CSV</option><option value="text/html">HTML</option><option value="application/json">JSON</option></select></label><label>Content<textarea name="content" rows="6" placeholder="Paste the file body here…"></textarea></label><button>Add resource</button></form></div>`;
    shell(user, `<button id="back" class="secondary">← Back to course</button><article class="editor"><span class="eyebrow">${lesson.durationMinutes} minutes</span><h1>Edit lesson</h1><form id="lesson-edit-form"><label>Lesson title<input name="title" value="${escape(lesson.title)}" required></label><label>Summary<input name="summary" value="${escape(lesson.summary)}"></label><label>Learning objectives (one per line)<textarea name="objectives" rows="4">${escape(lesson.objectives.join('\n'))}</textarea></label><label>Lesson content<textarea name="content" rows="8">${escape(lesson.content)}</textarea></label><label>Video URL<input name="videoUrl" type="url" value="${escape(lesson.videoUrl)}"></label><label style="display:flex;align-items:center;gap:8px"><input name="videoRequired" type="checkbox" ${lesson.videoRequired ? 'checked' : ''}> Mark this video as required viewing for learners</label><label>Estimated minutes<input name="durationMinutes" type="number" min="1" value="${lesson.durationMinutes}"></label><button>Save lesson</button></form>${filesNote}${resourcesSection}</article>`, user.role === 'STUDENT' ? 'My Learning' : 'Courses');
    document.querySelector('#back')!.addEventListener('click', () => courseView(user));
    document.querySelector('#lesson-edit-form')!.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const data = Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement)) as Record<string, string>;
        const objectives = String(data.objectives || '').split('\n').map((item) => item.trim()).filter(Boolean);
        const videoRequired = data.videoRequired === 'on' ? 1 : 0;
        delete data.objectives;
        delete data.videoRequired;
        await api(`/api/lessons/${lesson.id}`, { method: 'PUT', body: JSON.stringify({ ...data, objectives, videoRequired }) });
        courseView(user);
      } catch (error) { alert((error as Error).message); }
    });
    document.querySelector('#resource-form')!.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const data = Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement)) as Record<string, string>;
        await api(`/api/lessons/${lesson.id}/resources`, { method: 'PUT', body: JSON.stringify({ resources: [...lesson.resources, { name: data.name, label: data.label, description: data.description, contentType: data.contentType, content: data.content }] }) });
        lessonEditView(user, lesson.id);
      } catch (error) { alert((error as Error).message); }
    });
    document.querySelectorAll('[data-remove-resource]').forEach((button) => button.addEventListener('click', async () => {
      const fileId = button.getAttribute('data-remove-resource')!;
      try {
        await api(`/api/lessons/${lesson.id}/resources`, { method: 'PUT', body: JSON.stringify({ resources: lesson.resources.filter((file) => file.id !== fileId) }) });
        lessonEditView(user, lesson.id);
      } catch (error) { alert((error as Error).message); }
    }));
  } catch (error) {
    errorView((error as Error).message);
  }
}

// Renders the lesson video as a thumbnail with a click-to-play overlay. The
// youtube-nocookie iframe is only injected after the learner clicks play, so no
// YouTube request happens until there is real intent; everything else stays an
// outbound link.
function renderLessonVideo(videoUrl: string) {
  const id = parseYouTubeId(videoUrl);
  if (id) {
    return `<div class="video-thumb" data-video-id="${encodeURIComponent(id)}"><img src="${youtubeThumbUrl(id)}" alt="Lesson video thumbnail — click to play" loading="lazy"><button class="video-play" aria-label="Play lesson video" tabindex="0"></button></div>`;
  }
  return `<p><a href="${escape(videoUrl)}" target="_blank" rel="noreferrer">Open lesson video</a></p>`;
}

export async function lessonView(user: User, lessonId: string) {
  try {
    const { lesson } = await api<{ lesson: LessonView }>(`/api/lessons/${lessonId}`);
    const objectives = lesson.objectives.length ? `<ul>${lesson.objectives.map((item) => `<li>${escape(item)}</li>`).join('')}</ul>` : '<p class="muted">No learning objectives have been added.</p>';
    const files = lesson.files.length ? `<div class="starter-files"><h2>Starter files</h2><p class="muted">Download these files to work through the lesson and build your portfolio.</p><ul>${lesson.files.map((file) => `<li><a href="/api/lesson-files/${encodeURIComponent(file.id)}" download><strong>${escape(file.name)}</strong></a><span class="file-desc">${escape(file.label)}${file.description ? ` — ${escape(file.description)}` : ''}</span></li>`).join('')}</ul></div>` : '';
    const resources = lesson.resources.length ? `<div class="starter-files"><h2>Instructor resources</h2><p class="muted">Extra material attached by your instructor for this lesson.</p><ul>${lesson.resources.map((file) => `<li><a href="/api/lesson-resources/${encodeURIComponent(file.id)}" download><strong>${escape(file.name)}</strong></a><span class="file-desc">${escape(file.label)}${file.description ? ` — ${escape(file.description)}` : ''}</span></li>`).join('')}</ul></div>` : '';
    const video = lesson.videoUrl ? `<h2>Lesson video <span class="badge ${lesson.videoRequired ? 'badge-attention' : 'badge-normal'}">${lesson.videoRequired ? 'Required' : 'Optional'}</span></h2>${renderLessonVideo(lesson.videoUrl)}` : '<p class="muted">Video placeholder — no video has been added yet.</p>';
    const studentAction = user.role === 'STUDENT' ? `<button id="complete" ${lesson.completed ? 'disabled' : ''}>${lesson.completed ? 'Lesson completed' : 'Mark lesson complete'}</button>` : '';
    shell(user, `<button id="back" class="secondary">← Back to course</button><article class="lesson-detail"><span class="eyebrow">${lesson.durationMinutes} minutes</span><h1>${escape(lesson.title)}</h1><p>${escape(lesson.summary)}</p><h2>Learning objectives</h2>${objectives}<h2>Lesson content</h2>${renderLessonContent(lesson.content)}${files}${resources}${video}${studentAction}</article>`, user.role === 'STUDENT' ? 'My Learning' : 'Courses');
    document.querySelector('#back')!.addEventListener('click', () => courseView(user));
    document.querySelectorAll('[data-video-id]').forEach((thumb) => thumb.addEventListener('click', () => {
      const id = thumb.getAttribute('data-video-id')!;
      thumb.outerHTML = `<div class="video-embed"><iframe src="${youtubeEmbedUrl(id, true)}" title="Lesson video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>`;
    }));
    const complete = document.querySelector('#complete');
    if (complete) complete.addEventListener('click', async () => {
      try { await api(`/api/lessons/${lesson.id}/complete`, { method: 'POST' }); lessonView(user, lesson.id); } catch (error) { alert((error as Error).message); }
    });
  } catch (error) {
    errorView((error as Error).message);
  }
}
