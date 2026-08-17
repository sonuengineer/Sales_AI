import crypto from 'node:crypto';
import { z } from 'zod';
import { readJson } from './context.js';

const cohortSchema = z.object({
  name: z.string().trim().min(1),
  instructorId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.enum(['upcoming', 'active', 'completed', 'cancelled']).optional(),
});
const cohortUpdateSchema = cohortSchema.partial();
const enrollSchema = z.object({ studentId: z.string().min(1), status: z.enum(['active', 'completed', 'dropped', 'pending']).optional() });
const enrollmentUpdateSchema = z.object({ status: z.enum(['active', 'completed', 'dropped', 'pending']) });

export function createCohortRoutes(ctx) {
  const { db, sendJson, requireUser, requireContentManager, requireRole } = ctx;

  function decorateCohort(row) {
    return { id: row.id, name: row.name, courseId: row.course_id, instructorId: row.instructor_id, instructorName: row.instructor_name || null, startDate: row.start_date, endDate: row.end_date, status: row.status, createdAt: row.created_at, studentCount: row.student_count ?? 0 };
  }
  function cohortList() {
    return db.prepare('SELECT c.*, u.name AS instructor_name, (SELECT COUNT(*) FROM enrollments e WHERE e.cohort_id = c.id) AS student_count FROM cohorts c LEFT JOIN users u ON u.id = c.instructor_id ORDER BY c.created_at DESC').all().map(decorateCohort);
  }
  function cohortDetail(id) {
    const row = db.prepare('SELECT c.*, u.name AS instructor_name FROM cohorts c LEFT JOIN users u ON u.id = c.instructor_id WHERE c.id = ?').get(id);
    if (!row) return null;
    const enrollments = db.prepare('SELECT e.*, u.name AS student_name, u.email AS student_email FROM enrollments e JOIN users u ON u.id = e.student_id WHERE e.cohort_id = ? ORDER BY e.enrolled_at').all(id).map((enrollment) => ({ id: enrollment.id, studentId: enrollment.student_id, studentName: enrollment.student_name, studentEmail: enrollment.student_email, progressPercent: enrollment.progress_percent, status: enrollment.status, enrolledAt: enrollment.enrolled_at, completedAt: enrollment.completed_at }));
    return { ...decorateCohort({ ...row, student_count: enrollments.length }), enrollments };
  }

  return async function cohortRoutes(request, response, pathname) {
    if (request.method === 'GET' && pathname === '/api/cohorts') {
      const user = requireContentManager(request, response); if (!user) return true;
      return sendJson(response, 200, { cohorts: cohortList() });
    }
    if (request.method === 'POST' && pathname === '/api/cohorts') {
      const user = requireContentManager(request, response); if (!user) return true;
      const body = cohortSchema.parse(await readJson(request));
      const course = db.prepare('SELECT id FROM courses ORDER BY rowid LIMIT 1').get();
      if (!course) return sendJson(response, 400, { error: 'No course found. Run `npm run db:seed` first.' });
      if (body.instructorId && !db.prepare('SELECT id FROM users WHERE id = ? AND role IN (\'ADMIN\', \'INSTRUCTOR\')').get(body.instructorId)) return sendJson(response, 400, { error: 'Choose a valid instructor.' });
      const cohort = { id: `cohort-${crypto.randomUUID()}`, courseId: course.id, instructorId: body.instructorId || null, name: body.name, startDate: body.startDate || null, endDate: body.endDate || null, status: body.status || 'upcoming' };
      db.prepare('INSERT INTO cohorts (id, course_id, instructor_id, name, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)').run(cohort.id, cohort.courseId, cohort.instructorId, cohort.name, cohort.startDate, cohort.endDate, cohort.status);
      return sendJson(response, 201, { cohort: cohortDetail(cohort.id) });
    }
    const cohortMatch = pathname.match(/^\/api\/cohorts\/([^/]+)$/);
    if (request.method === 'GET' && cohortMatch) {
      const user = requireContentManager(request, response); if (!user) return true;
      const detail = cohortDetail(cohortMatch[1]);
      if (!detail) return sendJson(response, 404, { error: 'Cohort not found.' });
      return sendJson(response, 200, detail);
    }
    if (request.method === 'PUT' && cohortMatch) {
      const user = requireContentManager(request, response); if (!user) return true;
      const cohort = db.prepare('SELECT id FROM cohorts WHERE id = ?').get(cohortMatch[1]);
      if (!cohort) return sendJson(response, 404, { error: 'Cohort not found.' });
      const body = cohortUpdateSchema.parse(await readJson(request));
      if (body.instructorId && !db.prepare('SELECT id FROM users WHERE id = ? AND role IN (\'ADMIN\', \'INSTRUCTOR\')').get(body.instructorId)) return sendJson(response, 400, { error: 'Choose a valid instructor.' });
      if (body.name) db.prepare('UPDATE cohorts SET name = ? WHERE id = ?').run(body.name, cohort.id);
      if (body.instructorId !== undefined) db.prepare('UPDATE cohorts SET instructor_id = ? WHERE id = ?').run(body.instructorId || null, cohort.id);
      if (body.startDate !== undefined) db.prepare('UPDATE cohorts SET start_date = ? WHERE id = ?').run(body.startDate || null, cohort.id);
      if (body.endDate !== undefined) db.prepare('UPDATE cohorts SET end_date = ? WHERE id = ?').run(body.endDate || null, cohort.id);
      if (body.status) db.prepare('UPDATE cohorts SET status = ? WHERE id = ?').run(body.status, cohort.id);
      db.prepare("UPDATE cohorts SET updated_at = datetime('now') WHERE id = ?").run(cohort.id);
      return sendJson(response, 200, { cohort: cohortDetail(cohort.id) });
    }
    if (request.method === 'DELETE' && cohortMatch) {
      const user = requireRole(request, response, 'ADMIN'); if (!user) return true;
      const cohort = db.prepare('SELECT id FROM cohorts WHERE id = ?').get(cohortMatch[1]);
      if (!cohort) return sendJson(response, 404, { error: 'Cohort not found.' });
      db.prepare('DELETE FROM cohorts WHERE id = ?').run(cohort.id);
      return sendJson(response, 200, { ok: true });
    }
    const enrollMatch = pathname.match(/^\/api\/cohorts\/([^/]+)\/enrollments$/);
    if (request.method === 'POST' && enrollMatch) {
      const user = requireContentManager(request, response); if (!user) return true;
      const cohort = db.prepare('SELECT id FROM cohorts WHERE id = ?').get(enrollMatch[1]);
      if (!cohort) return sendJson(response, 404, { error: 'Cohort not found.' });
      const body = enrollSchema.parse(await readJson(request));
      const student = db.prepare('SELECT id FROM users WHERE id = ? AND role = \'STUDENT\'').get(body.studentId);
      if (!student) return sendJson(response, 400, { error: 'Choose a valid student.' });
      const existing = db.prepare('SELECT id FROM enrollments WHERE cohort_id = ? AND student_id = ?').get(cohort.id, body.studentId);
      if (existing) return sendJson(response, 409, { error: 'This student is already enrolled in the cohort.' });
      const enrollment = { id: `enroll-${crypto.randomUUID()}`, cohortId: cohort.id, studentId: body.studentId, status: body.status || 'active' };
      db.prepare('INSERT INTO enrollments (id, cohort_id, student_id, progress_percent, status) VALUES (?, ?, ?, 0, ?)').run(enrollment.id, enrollment.cohortId, enrollment.studentId, enrollment.status);
      return sendJson(response, 201, { enrollment: db.prepare('SELECT * FROM enrollments WHERE id = ?').get(enrollment.id) });
    }
    const enrollmentMatch = pathname.match(/^\/api\/cohorts\/([^/]+)\/enrollments\/([^/]+)$/);
    if (request.method === 'PUT' && enrollmentMatch) {
      const user = requireContentManager(request, response); if (!user) return true;
      const enrollment = db.prepare('SELECT * FROM enrollments WHERE id = ? AND cohort_id = ?').get(enrollmentMatch[2], enrollmentMatch[1]);
      if (!enrollment) return sendJson(response, 404, { error: 'Enrollment not found.' });
      const body = enrollmentUpdateSchema.parse(await readJson(request));
      db.prepare('UPDATE enrollments SET status = ?, completed_at = ? WHERE id = ?').run(body.status, body.status === 'completed' ? new Date().toISOString() : null, enrollment.id);
      return sendJson(response, 200, { enrollment: db.prepare('SELECT * FROM enrollments WHERE id = ?').get(enrollment.id) });
    }
    if (request.method === 'DELETE' && enrollmentMatch) {
      const user = requireRole(request, response, 'ADMIN'); if (!user) return true;
      const enrollment = db.prepare('SELECT id FROM enrollments WHERE id = ? AND cohort_id = ?').get(enrollmentMatch[2], enrollmentMatch[1]);
      if (!enrollment) return sendJson(response, 404, { error: 'Enrollment not found.' });
      db.prepare('DELETE FROM enrollments WHERE id = ?').run(enrollment.id);
      return sendJson(response, 200, { ok: true });
    }
    if (request.method === 'GET' && pathname === '/api/users') {
      const user = requireContentManager(request, response); if (!user) return true;
      const users = db.prepare('SELECT id, name, email, role FROM users ORDER BY name').all().map((row) => ({ id: row.id, name: row.name, email: row.email, role: row.role }));
      return sendJson(response, 200, { users });
    }
    return false;
  };
}
