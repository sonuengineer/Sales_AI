import crypto from 'node:crypto';
import { z } from 'zod';
import { parseUrl, readJson } from './context.js';
import { fileMeta, lessonFiles } from './course.js';

// Instructor-attached example files follow the same shape as lesson starter
// files; ids are optional on input and assigned by the server when missing.
const instructorFileSchema = z.object({
  id: z.string().optional(), name: z.string().trim().min(1), label: z.string().trim().min(1),
  description: z.string().optional(), contentType: z.string().optional(), content: z.string().optional()
});

const submissionSchema = z.object({ body: z.string().optional(), links: z.string().optional() });
const gradeSchema = z.object({ score: z.coerce.number().min(0).max(100), feedback: z.string().optional(), status: z.enum(['graded', 'returned']) });
const decisionSchema = z.object({ decision: z.enum(['approved', 'returned']), feedback: z.string().optional() });

export function createCapstoneRoutes(ctx) {
  const { db, sendJson, requireUser, requireContentManager } = ctx;

  function enrollmentFor(user) {
    let enrollment = db.prepare('SELECT * FROM enrollments WHERE student_id = ? ORDER BY rowid LIMIT 1').get(user.id);
    if (!enrollment) {
      db.prepare('INSERT OR IGNORE INTO enrollments (id, cohort_id, student_id, progress_percent, status) VALUES (?, ?, ?, 0, ?)').run(`enroll-${user.id}`, 'cohort-beta-001', user.id, 'active');
      enrollment = db.prepare('SELECT * FROM enrollments WHERE id = ?').get(`enroll-${user.id}`);
    }
    return enrollment;
  }
  function capstoneFor(user) {
    const enrollment = enrollmentFor(user);
    let capstone = db.prepare('SELECT * FROM capstones WHERE enrollment_id = ?').get(enrollment.id);
    if (!capstone) {
      db.prepare('INSERT OR IGNORE INTO capstones (id, enrollment_id, status) VALUES (?, ?, ?)').run(`cap-${enrollment.id}`, enrollment.id, 'in_progress');
      capstone = db.prepare('SELECT * FROM capstones WHERE enrollment_id = ?').get(enrollment.id);
    }
    return capstone;
  }
  // The worked-example section of a lesson (between the `## Worked example`
  // and `## Practice questions` headings) — the concrete "how to build it"
  // reference shown on each capstone deliverable.
  function workedExample(content) {
    const start = content.indexOf('## Worked example');
    if (start === -1) return '';
    const end = content.indexOf('## Practice questions', start);
    return end === -1 ? content.slice(start).trim() : content.slice(start, end).trim();
  }
  function lessonFor(deliverable) {
    if (!deliverable.lessonId) return null;
    const lesson = db.prepare('SELECT l.id, l.title, l.content, l.files, m.title AS module_title, m.position AS module_position FROM lessons l JOIN modules m ON m.id = l.module_id WHERE l.id = ?').get(deliverable.lessonId);
    if (!lesson) return null;
    return { id: lesson.id, title: lesson.title, moduleTitle: lesson.module_title || '', modulePosition: lesson.module_position, files: lessonFiles(db, lesson.id).map(fileMeta), workedExample: workedExample(lesson.content || '') };
  }
  function instructorFilesFor(row) {
    try { return (JSON.parse(row.instructor_files || '[]')).map(fileMeta); } catch { return []; }
  }
  function deliverables() {
    return db.prepare('SELECT * FROM capstone_deliverables ORDER BY position').all().map((row) => {
      const deliverable = { id: row.id, position: row.position, title: row.title, summary: row.summary || '', rubric: row.rubric || '', deadline: row.deadline, relatedLinks: JSON.parse(row.related_links || '[]') };
      return { ...deliverable, lesson: row.lesson_id ? lessonFor({ lessonId: row.lesson_id }) : null, instructorFiles: instructorFilesFor(row) };
    });
  }
  function submissionFor(capstoneId, deliverableId) {
    const row = db.prepare('SELECT * FROM capstone_submissions WHERE capstone_id = ? AND deliverable_id = ?').get(capstoneId, deliverableId);
    return row ? decorateSubmission(row) : null;
  }
  function decorateSubmission(row) {
    return { id: row.id, deliverableId: row.deliverable_id, body: row.body || '', links: row.links || '', score: row.score, feedback: row.feedback || '', status: row.status, submittedAt: row.submitted_at, gradedAt: row.graded_at };
  }
  function workspace(capstone) {
    const allDeliverables = deliverables();
    const items = allDeliverables.map((deliverable) => ({ ...deliverable, submission: submissionFor(capstone.id, deliverable.id) }));
    const submitted = items.filter((item) => item.submission && item.submission.status !== 'returned').length;
    const graded = items.filter((item) => item.submission?.status === 'graded').length;
    const canSubmit = items.length > 0 && items.every((item) => item.submission && item.submission.status !== 'returned');
    let portfolio = null;
    if (capstone.status === 'approved') {
      portfolio = {
        title: 'AI-Powered Sales Intelligence & CRM Operations Platform',
        completedAt: capstone.reviewed_at,
        finalScore: capstone.final_score,
        feedback: capstone.final_feedback || '',
        deliverables: items.map((item) => ({ title: item.title, position: item.position, score: item.submission?.score ?? null })),
      };
    }
    return {
      capstone: { id: capstone.id, status: capstone.status, submittedAt: capstone.submitted_at, reviewedAt: capstone.reviewed_at, finalScore: capstone.final_score, finalFeedback: capstone.final_feedback || '' },
      deliverables: items,
      progress: { total: items.length, submitted, graded, canSubmit },
      portfolio,
    };
  }
  function reviewList() {
    return db.prepare('SELECT c.*, u.name AS student_name FROM capstones c JOIN enrollments e ON e.id = c.enrollment_id JOIN users u ON u.id = e.student_id ORDER BY c.updated_at DESC').all().map((row) => {
      const capstone = { id: row.id, status: row.status, submittedAt: row.submitted_at, reviewedAt: row.reviewed_at, finalScore: row.final_score, finalFeedback: row.final_feedback || '' };
      const items = deliverables().map((deliverable) => ({ ...deliverable, submission: submissionFor(row.id, deliverable.id) }));
      return { ...capstone, studentName: row.student_name, submitted: items.filter((item) => item.submission && item.submission.status !== 'returned').length, graded: items.filter((item) => item.submission?.status === 'graded').length, total: items.length };
    });
  }
  function reviewDetail(capstoneId) {
    const row = db.prepare('SELECT c.*, u.name AS student_name FROM capstones c JOIN enrollments e ON e.id = c.enrollment_id JOIN users u ON u.id = e.student_id WHERE c.id = ?').get(capstoneId);
    if (!row) return null;
    const items = deliverables().map((deliverable) => ({ ...deliverable, submission: submissionFor(row.id, deliverable.id) }));
    return { capstone: { id: row.id, status: row.status, submittedAt: row.submitted_at, reviewedAt: row.reviewed_at, finalScore: row.final_score, finalFeedback: row.final_feedback || '' }, studentName: row.student_name, deliverables: items };
  }

  return async function capstoneRoutes(request, response, pathname) {
    if (request.method === 'GET' && pathname === '/api/capstone') {
      const user = requireUser(request, response); if (!user) return true;
      return sendJson(response, 200, workspace(capstoneFor(user)));
    }
    if (request.method === 'POST' && pathname === '/api/capstone/submit') {
      const user = requireUser(request, response); if (!user) return true;
      const capstone = capstoneFor(user);
      if (capstone.status === 'approved') return sendJson(response, 409, { error: 'This capstone has already been approved.' });
      if (capstone.status === 'submitted') return sendJson(response, 409, { error: 'This capstone is already awaiting final review.' });
      const items = deliverables().map((deliverable) => ({ deliverable, submission: submissionFor(capstone.id, deliverable.id) }));
      if (!items.every((item) => item.submission && item.submission.status !== 'returned')) return sendJson(response, 400, { error: 'Submit or fix every deliverable before requesting final review — returned items still need revision.' });
      db.prepare('UPDATE capstones SET status = ?, submitted_at = ?, updated_at = datetime(\'now\') WHERE id = ?').run('submitted', new Date().toISOString(), capstone.id);
      return sendJson(response, 200, workspace(db.prepare('SELECT * FROM capstones WHERE id = ?').get(capstone.id)));
    }
    const capstoneFileMatch = pathname.match(/^\/api\/capstone-files\/([^/]+)$/);
    if (request.method === 'GET' && capstoneFileMatch) {
      const user = requireUser(request, response); if (!user) return true;
      for (const row of db.prepare('SELECT id, instructor_files FROM capstone_deliverables').all()) {
        let files = [];
        try { files = JSON.parse(row.instructor_files || '[]'); } catch { files = []; }
        const full = files.find((entry) => entry.id === capstoneFileMatch[1]);
        if (full) {
          const contentType = full.contentType || 'text/plain';
          const asciiName = String(full.name || 'example-file').replace(/[^a-zA-Z0-9._-]/g, '_');
          response.writeHead(200, { 'Content-Type': contentType, 'Content-Disposition': `attachment; filename="${asciiName}"` });
          response.end(full.content || '');
          return true;
        }
      }
      return sendJson(response, 404, { error: 'File not found.' });
    }
    const deliverableFileMatch = pathname.match(/^\/api\/capstone\/deliverables\/([^/]+)\/files$/);
    if (request.method === 'PUT' && deliverableFileMatch) {
      const user = requireContentManager(request, response); if (!user) return true;
      const deliverable = db.prepare('SELECT id FROM capstone_deliverables WHERE id = ?').get(deliverableFileMatch[1]);
      if (!deliverable) return sendJson(response, 404, { error: 'Deliverable not found.' });
      const body = z.object({ files: z.array(instructorFileSchema) }).parse(await readJson(request));
      const files = body.files.map((file) => ({ ...file, id: file.id || `ifile-${crypto.randomUUID()}`, contentType: file.contentType || 'text/plain' }));
      db.prepare('UPDATE capstone_deliverables SET instructor_files = ? WHERE id = ?').run(JSON.stringify(files), deliverable.id);
      return sendJson(response, 200, { files: files.map(fileMeta) });
    }
    const deliverableMatch = pathname.match(/^\/api\/capstone\/deliverables\/([^/]+)\/submissions$/);
    if (request.method === 'POST' && deliverableMatch) {
      const user = requireUser(request, response); if (!user) return true;
      const deliverable = db.prepare('SELECT id FROM capstone_deliverables WHERE id = ?').get(deliverableMatch[1]);
      if (!deliverable) return sendJson(response, 404, { error: 'Deliverable not found.' });
      const body = submissionSchema.parse(await readJson(request));
      if (!String(body.body || '').trim() && !String(body.links || '').trim()) return sendJson(response, 400, { error: 'Add your work as text or a link before submitting.' });
      const capstone = capstoneFor(user);
      if (capstone.status === 'approved') return sendJson(response, 409, { error: 'This capstone has already been approved.' });
      const existing = db.prepare('SELECT * FROM capstone_submissions WHERE capstone_id = ? AND deliverable_id = ?').get(capstone.id, deliverable.id);
      if (existing && ['submitted', 'graded'].includes(existing.status)) return sendJson(response, 409, { error: 'This deliverable is already awaiting review or has been graded. Wait for feedback or a return before resubmitting.' });
      const submission = { id: existing?.id || `capsub-${crypto.randomUUID()}`, body: String(body.body || '').trim(), links: String(body.links || '').trim(), submittedAt: new Date().toISOString() };
      if (existing) db.prepare('UPDATE capstone_submissions SET body = ?, links = ?, status = \'submitted\', score = NULL, feedback = NULL, submitted_at = ?, graded_at = NULL, graded_by = NULL WHERE id = ?').run(submission.body, submission.links, submission.submittedAt, existing.id);
      else db.prepare('INSERT INTO capstone_submissions (id, capstone_id, deliverable_id, body, links, status, submitted_at) VALUES (?, ?, ?, ?, ?, \'submitted\', ?)').run(submission.id, capstone.id, deliverable.id, submission.body, submission.links, submission.submittedAt);
      if (capstone.status === 'returned') db.prepare('UPDATE capstones SET status = \'in_progress\', updated_at = datetime(\'now\') WHERE id = ?').run(capstone.id);
      return sendJson(response, 201, { submission: submissionFor(capstone.id, deliverable.id) });
    }
    if (request.method === 'GET' && pathname === '/api/capstone/review') {
      const user = requireContentManager(request, response); if (!user) return true;
      const url = parseUrl(request); const status = url.searchParams.get('status');
      const list = status ? reviewList().filter((row) => row.status === status) : reviewList();
      return sendJson(response, 200, { capstones: list });
    }
    const reviewMatch = pathname.match(/^\/api\/capstone\/review\/([^/]+)$/);
    if (request.method === 'GET' && reviewMatch) {
      const user = requireContentManager(request, response); if (!user) return true;
      const detail = reviewDetail(reviewMatch[1]);
      if (!detail) return sendJson(response, 404, { error: 'Capstone not found.' });
      return sendJson(response, 200, detail);
    }
    const deliverableGradeMatch = pathname.match(/^\/api\/capstone\/review\/([^/]+)\/deliverables\/([^/]+)$/);
    if (request.method === 'PUT' && deliverableGradeMatch) {
      const user = requireContentManager(request, response); if (!user) return true;
      const detail = reviewDetail(deliverableGradeMatch[1]);
      if (!detail) return sendJson(response, 404, { error: 'Capstone not found.' });
      const submission = db.prepare('SELECT * FROM capstone_submissions WHERE capstone_id = ? AND deliverable_id = ?').get(deliverableGradeMatch[1], deliverableGradeMatch[2]);
      if (!submission) return sendJson(response, 404, { error: 'No submission for this deliverable yet.' });
      const body = gradeSchema.parse(await readJson(request));
      db.prepare('UPDATE capstone_submissions SET score = ?, feedback = ?, status = ?, graded_at = ?, graded_by = ? WHERE id = ?').run(body.score, String(body.feedback || '').trim(), body.status, new Date().toISOString(), user.id, submission.id);
      db.prepare('UPDATE capstones SET updated_at = datetime(\'now\') WHERE id = ?').run(deliverableGradeMatch[1]);
      return sendJson(response, 200, { submission: submissionFor(deliverableGradeMatch[1], deliverableGradeMatch[2]) });
    }
    if (request.method === 'PUT' && reviewMatch) {
      const user = requireContentManager(request, response); if (!user) return true;
      const detail = reviewDetail(reviewMatch[1]);
      if (!detail) return sendJson(response, 404, { error: 'Capstone not found.' });
      const body = decisionSchema.parse(await readJson(request));
      const scores = detail.deliverables.map((item) => item.submission?.score).filter((score) => score !== null && score !== undefined);
      if (body.decision === 'approved' && scores.length < detail.deliverables.length) return sendJson(response, 400, { error: `Grade all ${detail.deliverables.length} deliverables before approving — ${scores.length} graded so far.` });
      const finalScore = body.decision === 'approved' ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null;
      db.prepare('UPDATE capstones SET status = ?, final_score = ?, final_feedback = ?, reviewed_at = ?, reviewed_by = ?, updated_at = datetime(\'now\') WHERE id = ?').run(body.decision, finalScore, String(body.feedback || '').trim(), new Date().toISOString(), user.id, detail.capstone.id);
      return sendJson(response, 200, { capstone: db.prepare('SELECT * FROM capstones WHERE id = ?').get(detail.capstone.id) });
    }
    return false;
  };
}
