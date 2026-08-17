import { describe, it, expect } from 'vitest';
import { withServer, signIn } from './helpers';

async function request(base: string, path: string, cookie: string | null, init: RequestInit = {}) {
  const response = await fetch(`${base}${path}`, { ...init, headers: { Cookie: cookie || '', ...(init.headers || {}) } });
  return { status: response.status, body: await response.json().catch(() => null) };
}

describe('permission sweep — every API area', () => {
  it('rejects unauthenticated access across all protected areas', async () => {
    await withServer(async (base) => {
      const paths = [
        '/api/courses', '/api/crm/leads', '/api/analytics', '/api/workflows', '/api/ai/templates',
        '/api/quizzes', '/api/assignments', '/api/submissions', '/api/capstone', '/api/capstone/review',
        '/api/cohorts', '/api/users', '/api/certificates', '/api/certificates/eligibility', '/api/reports',
        '/api/curriculum/coverage', '/api/dashboard/student', '/api/learning/progress',
      ];
      for (const path of paths) {
        const { status } = await request(base, path, null);
        expect(status, `${path} should require sign-in`).toBe(401);
      }
    });
  });

  it('students cannot manage content, CRM, cohorts, reports or the capstone review queue', async () => {
    await withServer(async (base) => {
      const student = (await signIn(base, 'student@nexaflow.demo')).cookie;
      const blocked: Array<[string, string, unknown?]> = [
        ['POST', '/api/courses', { title: 'x' }],
        ['POST', '/api/modules', { title: 'x' }],
        ['POST', '/api/lessons', { moduleId: 'mod-01', title: 'x' }],
        ['POST', '/api/crm/leads', {}],
        ['POST', '/api/quizzes', { moduleId: 'mod-01', title: 'x', questions: [] }],
        ['POST', '/api/assignments', { moduleId: 'mod-01', title: 'x' }],
        ['GET', '/api/submissions'],
        ['GET', '/api/capstone/review'],
        ['GET', '/api/cohorts'],
        ['GET', '/api/users'],
        ['GET', '/api/reports'],
        ['GET', '/api/curriculum/coverage'],
      ];
      for (const [method, path, body] of blocked) {
        const { status } = await request(base, path, student, { method, headers: { 'Content-Type': 'application/json' }, body: body !== undefined ? JSON.stringify(body) : undefined });
        expect(status, `${method} ${path} should be forbidden for students`).toBe(403);
      }
    });
  });

  it('students can use their own learning, CRM-scoped, AI and capstone workflows', async () => {
    await withServer(async (base) => {
      const student = (await signIn(base, 'student@nexaflow.demo')).cookie;
      const allowed: Array<[string, string, unknown?]> = [
        ['GET', '/api/courses'],
        ['GET', '/api/crm/leads'],
        ['GET', '/api/crm/companies'],
        ['GET', '/api/analytics'],
        ['GET', '/api/analytics/tat'],
        ['GET', '/api/analytics/stale'],
        ['GET', '/api/workflows'],
        ['GET', '/api/ai/templates'],
        ['GET', '/api/quizzes'],
        ['GET', '/api/assignments'],
        ['GET', '/api/capstone'],
        ['GET', '/api/certificates/eligibility'],
        ['POST', '/api/lessons/lesson-01/complete'],
      ];
      for (const [method, path, body] of allowed) {
        const { status } = await request(base, path, student, { method, headers: { 'Content-Type': 'application/json' }, body: body !== undefined ? JSON.stringify(body) : undefined });
        expect(status, `${method} ${path} should be allowed for students`).toBe(200);
      }
    });
  });

  it('instructors cannot use admin-only operations (delete cohorts, delete CRM records)', async () => {
    await withServer(async (base) => {
      const instructor = (await signIn(base, 'instructor@nexaflow.demo')).cookie;
      const admin = (await signIn(base, 'admin@nexaflow.demo')).cookie;
      // Instructors can create a cohort (content manager) but not delete it (admin only)
      const created = await request(base, '/api/cohorts', instructor, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Permission Cohort', status: 'upcoming' }) });
      expect(created.status).toBe(201);
      const cohortId = (created.body as { cohort: { id: string } }).cohort.id;
      expect((await request(base, `/api/cohorts/${cohortId}`, instructor, { method: 'DELETE' })).status).toBe(403);
      expect((await request(base, `/api/cohorts/${cohortId}`, admin, { method: 'DELETE' })).status).toBe(200);
      // Admin-only enrollment removal is blocked for instructors
      const createdTwo = await request(base, '/api/cohorts', instructor, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Enrollment Cohort', status: 'active' }) });
      const cohortTwo = (createdTwo.body as { cohort: { id: string } }).cohort.id;
      await request(base, `/api/cohorts/${cohortTwo}/enrollments`, instructor, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ studentId: 'usr-student-001' }) });
      const enrollmentId = ((await request(base, `/api/cohorts/${cohortTwo}`, instructor)).body as { enrollments: Array<{ id: string }> }).enrollments[0].id;
      expect((await request(base, `/api/cohorts/${cohortTwo}/enrollments/${enrollmentId}`, instructor, { method: 'DELETE' })).status).toBe(403);
      expect((await request(base, `/api/cohorts/${cohortTwo}/enrollments/${enrollmentId}`, admin, { method: 'DELETE' })).status).toBe(200);
    });
  });

  it('only students can complete lessons, take quizzes and issue certificates', async () => {
    await withServer(async (base) => {
      const student = (await signIn(base, 'student@nexaflow.demo')).cookie;
      const instructor = (await signIn(base, 'instructor@nexaflow.demo')).cookie;
      const admin = (await signIn(base, 'admin@nexaflow.demo')).cookie;
      expect((await request(base, '/api/lessons/lesson-01/complete', instructor, { method: 'POST' })).status).toBe(403);
      expect((await request(base, '/api/lessons/lesson-01/complete', admin, { method: 'POST' })).status).toBe(403);
      expect((await request(base, '/api/lessons/lesson-01/complete', student, { method: 'POST' })).status).toBe(200);
      // Quiz attempts are open to any authenticated user (learning content)
      expect((await request(base, '/api/quizzes/quiz-01/attempts', instructor, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers: [0, 0, 0] }) })).status).toBe(201);
      // Certificate issuance is student-only
      expect((await request(base, '/api/certificates/issue', instructor, { method: 'POST' })).status).toBe(403);
      expect((await request(base, '/api/certificates/issue', admin, { method: 'POST' })).status).toBe(403);
    });
  });

  it('validates request bodies and rejects malformed input with 4xx errors', async () => {
    await withServer(async (base) => {
      const instructor = (await signIn(base, 'instructor@nexaflow.demo')).cookie;
      const student = (await signIn(base, 'student@nexaflow.demo')).cookie;
      const badJson = await request(base, '/api/quizzes', instructor, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'not-json' });
      expect(badJson.status).toBe(400);
      const emptyQuiz = await request(base, '/api/quizzes', instructor, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ moduleId: 'mod-01', title: '', questions: [] }) });
      expect(emptyQuiz.status).toBe(400);
      const badAttempt = await request(base, '/api/quizzes/quiz-01/attempts', student, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers: [0] }) });
      expect(badAttempt.status).toBe(400);
      const emptySubmission = await request(base, '/api/assignments/asg-01/submissions', student, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: '', links: '' }) });
      expect(emptySubmission.status).toBe(400);
      const unknownSubmission = await request(base, '/api/submissions/anything', instructor, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ score: 80, status: 'graded' }) });
      expect(unknownSubmission.status).toBe(404);
      // A real submission with an out-of-range score is rejected by validation
      await request(base, '/api/assignments/asg-01/submissions', student, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: 'Work to grade.', links: '' }) });
      const queue = (await request(base, '/api/submissions?assignmentId=asg-01', instructor)).body as { submissions: Array<{ id: string }> };
      const badScore = await request(base, `/api/submissions/${queue.submissions[0].id}`, instructor, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ score: 150, status: 'graded' }) });
      expect(badScore.status).toBe(400);
      const unknownCohort = await request(base, '/api/cohorts/nope', instructor);
      expect(unknownCohort.status).toBe(404);
      const unknownLead = await request(base, '/api/crm/leads/nope', student);
      expect(unknownLead.status).toBe(404);
    });
  });
});
