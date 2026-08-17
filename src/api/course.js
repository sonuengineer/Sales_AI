import crypto from 'node:crypto';
import { z } from 'zod';
import { readJson } from './context.js';

const courseSchema = z.object({ title: z.string().trim().min(1), summary: z.string().optional() });
const moduleSchema = z.object({ title: z.string().trim().min(1), summary: z.string().optional() });
const fileSchema = z.object({
  id: z.string().min(1), name: z.string().min(1), label: z.string().min(1),
  description: z.string().optional(), contentType: z.string().optional(), content: z.string().optional()
});
const lessonSchema = z.object({
  moduleId: z.string().min(1), title: z.string().trim().min(1), summary: z.string().optional(),
  objectives: z.array(z.string()).optional(), content: z.string().optional(), videoUrl: z.string().optional(),
  videoRequired: z.coerce.number().int().min(0).max(1).optional(),
  files: z.array(fileSchema).optional(), durationMinutes: z.coerce.number().int().min(0).optional()
});

// Public metadata for a lesson file — never include the file body in list views.
export function fileMeta(file) {
  return { id: file.id, name: file.name, label: file.label, description: file.description || '', contentType: file.contentType || 'text/plain' };
}

export function lessonFiles(db, lessonId) {
  const row = db.prepare('SELECT files FROM lessons WHERE id = ?').get(lessonId);
  if (!row) return [];
  try { return JSON.parse(row.files || '[]'); } catch { return []; }
}

// Parses a markdown pipe-table glossary (`| Term | Definition | Why it matters |`)
// into structured terms for the searchable Glossary page. Skips the heading row
// and separator rows; tolerates a missing trailing pipe on the last line.
export function parseGlossary(content) {
  const terms = [];
  for (const rawLine of String(content || '').split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map((cell) => cell.trim()).filter((cell) => cell !== '');
    if (cells.length < 2) continue;
    if (/^:?-{2,}:?$/.test(cells[0])) continue; // separator row (| --- | --- |)
    if (/^(metric|term|definition|why it matters)$/i.test(cells[0])) continue; // header row
    terms.push({ term: cells[0], definition: cells[1] || '', whyItMatters: cells.slice(2).join(' ') });
  }
  return terms;
}

// Instructor-attached resources follow the same shape as lesson starter files;
// ids are optional on input and assigned by the server when missing.
function lessonResources(db, lessonId) {
  const row = db.prepare('SELECT instructor_resources FROM lessons WHERE id = ?').get(lessonId);
  if (!row) return [];
  try { return JSON.parse(row.instructor_resources || '[]'); } catch { return []; }
}

const instructorResourceSchema = z.object({
  id: z.string().optional(), name: z.string().trim().min(1), label: z.string().trim().min(1),
  description: z.string().optional(), contentType: z.string().optional(), content: z.string().optional()
});

export function createCourseRoutes(ctx) {
  const { db, sendJson, requireUser, requireRole, requireContentManager } = ctx;

  function courseFor(user) {
    const course = db.prepare('SELECT * FROM courses ORDER BY rowid LIMIT 1').get();
    if (!course) return null;
    const modules = db.prepare('SELECT * FROM modules WHERE course_id = ? ORDER BY position').all(course.id);
    const lessons = db.prepare('SELECT * FROM lessons WHERE module_id IN (SELECT id FROM modules WHERE course_id = ?) ORDER BY position').all(course.id);
    const objectives = db.prepare('SELECT * FROM lesson_objectives ORDER BY position').all();
    const completedRows = db.prepare('SELECT lesson_id FROM lesson_completions WHERE user_id = ?').all(user.id);
    const completed = new Set(completedRows.map((row) => row.lesson_id));
    const objectivesByLesson = new Map();
    for (const objective of objectives) {
      if (!objectivesByLesson.has(objective.lesson_id)) objectivesByLesson.set(objective.lesson_id, []);
      objectivesByLesson.get(objective.lesson_id).push(objective.text);
    }
    const lessonsByModule = new Map();
    for (const lesson of lessons) {
      if (!lessonsByModule.has(lesson.module_id)) lessonsByModule.set(lesson.module_id, []);
      lessonsByModule.get(lesson.module_id).push(lesson);
    }
    const filesByLesson = new Map(lessons.map((lesson) => [lesson.id, lessonFiles(db, lesson.id).map(fileMeta)]));
    const resourcesByLesson = new Map(lessons.map((lesson) => [lesson.id, lessonResources(db, lesson.id).map(fileMeta)]));
    const moduleViews = modules.map((module) => {
      const moduleLessons = lessonsByModule.get(module.id) || [];
      const lessonViews = moduleLessons.map((lesson) => ({ id: lesson.id, title: lesson.title, summary: lesson.summary || '', objectives: objectivesByLesson.get(lesson.id) || [], content: lesson.content || '', videoUrl: lesson.video_url || '', videoRequired: !!lesson.video_required, files: filesByLesson.get(lesson.id) || [], resources: resourcesByLesson.get(lesson.id) || [], durationMinutes: lesson.duration_minutes, completed: completed.has(lesson.id) }));
      return { id: module.id, position: module.position, title: module.title, summary: module.summary || '', lessons: lessonViews, completedLessons: lessonViews.filter((lesson) => lesson.completed).length };
    });
    const total = moduleViews.reduce((sum, module) => sum + module.lessons.length, 0);
    return { id: course.id, title: course.title, summary: course.summary || '', modules: moduleViews, progressPercent: total ? Math.round((completed.size / total) * 100) : 0, completedLessonCount: completed.size, lessonCount: total };
  }

  return async function courseRoutes(request, response, pathname) {
    if (request.method === 'GET' && pathname === '/api/courses') {
      const user = requireUser(request, response); if (!user) return true;
      const course = courseFor(user);
      if (!course) return sendJson(response, 404, { error: 'No course found. Run `npm run db:seed` first.' });
      return sendJson(response, 200, { course });
    }
    if (request.method === 'GET' && pathname === '/api/learning/progress') {
      const user = requireUser(request, response); if (!user) return true;
      const view = courseFor(user) || { progressPercent: 0, completedLessonCount: 0, lessonCount: 0 };
      return sendJson(response, 200, { progressPercent: view.progressPercent, completedLessonCount: view.completedLessonCount, lessonCount: view.lessonCount });
    }
    if (request.method === 'GET' && pathname === '/api/glossary') {
      const user = requireUser(request, response); if (!user) return true;
      // Source of truth: the sales-metrics-glossary.md bundled with lesson-01.
      let source = null;
      let terms = [];
      for (const lesson of db.prepare('SELECT id FROM lessons').all()) {
        const file = lessonFiles(db, lesson.id).find((entry) => entry.name === 'sales-metrics-glossary.md');
        if (file) { source = file.name; terms = parseGlossary(file.content); break; }
      }
      return sendJson(response, 200, { source, termCount: terms.length, terms });
    }
    const lessonMatch = pathname.match(/^\/api\/lessons\/([^/]+)$/);
    if (request.method === 'GET' && lessonMatch) {
      const user = requireUser(request, response); if (!user) return true;
      const lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(lessonMatch[1]);
      if (!lesson) return sendJson(response, 404, { error: 'Lesson not found.' });
      const objectives = db.prepare('SELECT text FROM lesson_objectives WHERE lesson_id = ? ORDER BY position').all(lesson.id).map((row) => row.text);
      const completed = !!db.prepare('SELECT 1 FROM lesson_completions WHERE user_id = ? AND lesson_id = ?').get(user.id, lesson.id);
      return sendJson(response, 200, { lesson: { id: lesson.id, title: lesson.title, summary: lesson.summary || '', objectives, content: lesson.content || '', videoUrl: lesson.video_url || '', videoRequired: !!lesson.video_required, files: lessonFiles(db, lesson.id).map(fileMeta), resources: lessonResources(db, lesson.id).map(fileMeta), durationMinutes: lesson.duration_minutes, completed } });
    }
    const fileMatch = pathname.match(/^\/api\/lesson-files\/([^/]+)$/);
    if (request.method === 'GET' && fileMatch) {
      const user = requireUser(request, response); if (!user) return true;
      for (const lesson of db.prepare('SELECT id, files FROM lessons').all()) {
        for (const file of lessonFiles(db, lesson.id)) {
          if (file.id === fileMatch[1]) {
            const contentType = file.contentType || 'text/plain';
            const asciiName = String(file.name || 'starter-file').replace(/[^a-zA-Z0-9._-]/g, '_');
            response.writeHead(200, { 'Content-Type': contentType, 'Content-Disposition': `attachment; filename="${asciiName}"` });
            response.end(file.content || '');
            return true;
          }
        }
      }
      return sendJson(response, 404, { error: 'File not found.' });
    }
    const resourceFileMatch = pathname.match(/^\/api\/lesson-resources\/([^/]+)$/);
    if (request.method === 'GET' && resourceFileMatch) {
      const user = requireUser(request, response); if (!user) return true;
      for (const lesson of db.prepare('SELECT id, instructor_resources FROM lessons').all()) {
        let resources = [];
        try { resources = JSON.parse(lesson.instructor_resources || '[]'); } catch { resources = []; }
        const full = resources.find((entry) => entry.id === resourceFileMatch[1]);
        if (full) {
          const contentType = full.contentType || 'text/plain';
          const asciiName = String(full.name || 'resource').replace(/[^a-zA-Z0-9._-]/g, '_');
          response.writeHead(200, { 'Content-Type': contentType, 'Content-Disposition': `attachment; filename="${asciiName}"` });
          response.end(full.content || '');
          return true;
        }
      }
      return sendJson(response, 404, { error: 'Resource not found.' });
    }
    const resourceMatch = pathname.match(/^\/api\/lessons\/([^/]+)\/resources$/);
    if (request.method === 'PUT' && resourceMatch) {
      const user = requireContentManager(request, response); if (!user) return true;
      const lesson = db.prepare('SELECT id FROM lessons WHERE id = ?').get(resourceMatch[1]);
      if (!lesson) return sendJson(response, 404, { error: 'Lesson not found.' });
      const body = z.object({ resources: z.array(instructorResourceSchema) }).parse(await readJson(request));
      const resources = body.resources.map((file) => ({ ...file, id: file.id || `res-${crypto.randomUUID()}`, contentType: file.contentType || 'text/plain' }));
      db.prepare('UPDATE lessons SET instructor_resources = ? WHERE id = ?').run(JSON.stringify(resources), lesson.id);
      return sendJson(response, 200, { resources: resources.map(fileMeta) });
    }
    const completeMatch = pathname.match(/^\/api\/lessons\/([^/]+)\/complete$/);
    if (request.method === 'POST' && completeMatch) {
      const user = requireRole(request, response, 'STUDENT'); if (!user) return true;
      if (!db.prepare('SELECT id FROM lessons WHERE id = ?').get(completeMatch[1])) return sendJson(response, 404, { error: 'Lesson not found.' });
      db.prepare('INSERT OR IGNORE INTO lesson_completions (user_id, lesson_id, completed_at) VALUES (?, ?, ?)').run(user.id, completeMatch[1], new Date().toISOString());
      return sendJson(response, 200, { progressPercent: courseFor(user).progressPercent });
    }
    if (request.method === 'POST' && pathname === '/api/courses') {
      const user = requireContentManager(request, response); if (!user) return true;
      const body = courseSchema.parse(await readJson(request));
      const course = db.prepare('SELECT id FROM courses ORDER BY rowid LIMIT 1').get();
      if (!course) return sendJson(response, 404, { error: 'No course found.' });
      db.prepare('UPDATE courses SET title = ?, summary = ? WHERE id = ?').run(body.title, String(body.summary || '').trim(), course.id);
      return sendJson(response, 200, { course: courseFor(user) });
    }
    if (request.method === 'POST' && pathname === '/api/modules') {
      const user = requireContentManager(request, response); if (!user) return true;
      const body = moduleSchema.parse(await readJson(request));
      const course = db.prepare('SELECT id FROM courses ORDER BY rowid LIMIT 1').get();
      if (!course) return sendJson(response, 404, { error: 'No course found.' });
      const position = (db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS position FROM modules WHERE course_id = ?').get(course.id)).position;
      const module = { id: `mod-${crypto.randomUUID()}`, courseId: course.id, position, title: body.title, summary: String(body.summary || '').trim() };
      db.prepare('INSERT INTO modules (id, course_id, position, title, summary) VALUES (?, ?, ?, ?, ?)').run(module.id, module.courseId, module.position, module.title, module.summary);
      return sendJson(response, 201, { module });
    }
    const moduleMatch = pathname.match(/^\/api\/modules\/([^/]+)$/);
    if (request.method === 'PUT' && moduleMatch) {
      const user = requireContentManager(request, response); if (!user) return true;
      const module = db.prepare('SELECT * FROM modules WHERE id = ?').get(moduleMatch[1]);
      if (!module) return sendJson(response, 404, { error: 'Module not found.' });
      const body = moduleSchema.partial().parse(await readJson(request));
      if (body.title) db.prepare('UPDATE modules SET title = ? WHERE id = ?').run(body.title, module.id);
      if (body.summary !== undefined) db.prepare('UPDATE modules SET summary = ? WHERE id = ?').run(String(body.summary), module.id);
      return sendJson(response, 200, { module: db.prepare('SELECT * FROM modules WHERE id = ?').get(module.id) });
    }
    if (request.method === 'POST' && pathname === '/api/lessons') {
      const user = requireContentManager(request, response); if (!user) return true;
      const body = lessonSchema.parse(await readJson(request));
      const module = db.prepare('SELECT * FROM modules WHERE id = ?').get(body.moduleId);
      if (!module) return sendJson(response, 400, { error: 'A valid module and lesson title are required.' });
      const position = (db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS position FROM lessons WHERE module_id = ?').get(module.id)).position;
      const lesson = { id: `lesson-${crypto.randomUUID()}`, moduleId: module.id, position, title: body.title, summary: String(body.summary || '').trim(), content: String(body.content || ''), videoUrl: String(body.videoUrl || ''), videoRequired: Number(body.videoRequired || 0), files: body.files || [], durationMinutes: Number(body.durationMinutes || 0) };
      db.prepare('INSERT INTO lessons (id, module_id, position, title, summary, content, video_url, video_required, files, duration_minutes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(lesson.id, lesson.moduleId, lesson.position, lesson.title, lesson.summary, lesson.content, lesson.videoUrl, lesson.videoRequired, JSON.stringify(lesson.files), lesson.durationMinutes);
      const objectives = body.objectives || [];
      const insertObjective = db.prepare('INSERT INTO lesson_objectives (id, lesson_id, position, text) VALUES (?, ?, ?, ?)');
      objectives.forEach((text, index) => insertObjective.run(`obj-${lesson.id}-${index + 1}`, lesson.id, index + 1, String(text).trim()));
      return sendJson(response, 201, { lesson: { id: lesson.id, title: lesson.title, summary: lesson.summary, objectives, content: lesson.content, videoUrl: lesson.videoUrl, videoRequired: lesson.videoRequired, files: lesson.files.map(fileMeta), durationMinutes: lesson.durationMinutes } });
    }
    if (request.method === 'PUT' && lessonMatch) {
      const user = requireContentManager(request, response); if (!user) return true;
      const lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(lessonMatch[1]);
      if (!lesson) return sendJson(response, 404, { error: 'Lesson not found.' });
      const body = lessonSchema.omit({ moduleId: true }).partial().parse(await readJson(request));
      if (body.title) db.prepare('UPDATE lessons SET title = ? WHERE id = ?').run(body.title, lesson.id);
      if (body.summary !== undefined) db.prepare('UPDATE lessons SET summary = ? WHERE id = ?').run(String(body.summary), lesson.id);
      if (body.content !== undefined) db.prepare('UPDATE lessons SET content = ? WHERE id = ?').run(String(body.content), lesson.id);
      if (body.videoUrl !== undefined) db.prepare('UPDATE lessons SET video_url = ? WHERE id = ?').run(String(body.videoUrl), lesson.id);
      if (body.videoRequired !== undefined) db.prepare('UPDATE lessons SET video_required = ? WHERE id = ?').run(Number(body.videoRequired), lesson.id);
      if (body.files !== undefined) db.prepare('UPDATE lessons SET files = ? WHERE id = ?').run(JSON.stringify(body.files), lesson.id);
      if (body.durationMinutes !== undefined) db.prepare('UPDATE lessons SET duration_minutes = ? WHERE id = ?').run(Number(body.durationMinutes), lesson.id);
      if (body.objectives !== undefined) {
        db.prepare('DELETE FROM lesson_objectives WHERE lesson_id = ?').run(lesson.id);
        const insertObjective = db.prepare('INSERT INTO lesson_objectives (id, lesson_id, position, text) VALUES (?, ?, ?, ?)');
        body.objectives.forEach((text, index) => insertObjective.run(`obj-${lesson.id}-${index + 1}`, lesson.id, index + 1, String(text).trim()));
      }
      return sendJson(response, 200, { lesson: db.prepare('SELECT * FROM lessons WHERE id = ?').get(lesson.id) });
    }
    return false;
  };
}
