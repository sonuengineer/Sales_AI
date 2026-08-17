import { describe, it, expect } from 'vitest';
import { withServer, signIn } from './helpers';

async function json(base: string, path: string, cookie?: string, init: RequestInit = {}) {
  const response = await fetch(`${base}${path}`, { ...init, headers: { Cookie: cookie || '', ...(init.headers || {}) } });
  let body: Record<string, unknown> = {};
  try { body = await response.json() as Record<string, unknown>; } catch { /* non-JSON response (print view) */ }
  return { response, body };
}
const postJson = (base: string, path: string, cookie: string, body: unknown) => json(base, path, cookie, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const putJson = (base: string, path: string, cookie: string, body: unknown) => json(base, path, cookie, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

async function completeCourse(base: string, student: string) {
  for (let index = 1; index <= 10; index += 1) {
    await postJson(base, `/api/lessons/lesson-${String(index).padStart(2, '0')}/complete`, student, {});
  }
}
async function passAllQuizzes(base: string, student: string) {
  for (let index = 1; index <= 10; index += 1) {
    await postJson(base, `/api/quizzes/quiz-${String(index).padStart(2, '0')}/attempts`, student, { answers: [0, 0, 0] });
  }
}
async function gradeAllAssignments(base: string, student: string, instructor: string) {
  for (let index = 1; index <= 10; index += 1) {
    const assignmentId = `asg-${String(index).padStart(2, '0')}`;
    await postJson(base, `/api/assignments/${assignmentId}/submissions`, student, { body: `Work for ${assignmentId}.`, links: '' });
    const queue = (await json(base, `/api/submissions?assignmentId=${assignmentId}`, instructor)).body.submissions as Array<{ id: string }>;
    await putJson(base, `/api/submissions/${queue[0].id}`, instructor, { score: 90, feedback: 'Great work.', status: 'graded' });
  }
}
async function approveCapstone(base: string, student: string, instructor: string) {
  const { body } = await json(base, '/api/capstone', student);
  for (const deliverable of body.deliverables as Array<{ id: string }>) {
    await postJson(base, `/api/capstone/deliverables/${deliverable.id}/submissions`, student, { body: `Deliverable work for ${deliverable.id}.`, links: '' });
  }
  await postJson(base, '/api/capstone/submit', student, {});
  const queue = (await json(base, '/api/capstone/review', instructor)).body.capstones as Array<{ id: string }>;
  const capstoneId = queue[0].id;
  for (const deliverable of body.deliverables as Array<{ id: string }>) {
    await putJson(base, `/api/capstone/review/${capstoneId}/deliverables/${deliverable.id}`, instructor, { score: 90, feedback: 'Excellent.', status: 'graded' });
  }
  await putJson(base, `/api/capstone/review/${capstoneId}`, instructor, { decision: 'approved', feedback: 'Portfolio-ready.' });
}

describe('certificates — eligibility', () => {
  it('requires authentication', async () => {
    await withServer(async (base) => {
      expect((await fetch(`${base}/api/certificates/eligibility`)).status).toBe(401);
      expect((await fetch(`${base}/api/certificates`)).status).toBe(401);
      expect((await fetch(`${base}/api/reports`)).status).toBe(401);
    });
  });

  it('a fresh student is not eligible', async () => {
    await withServer(async (base) => {
      const { cookie } = await signIn(base, 'student@nexaflow.demo');
      const { body } = await json(base, '/api/certificates/eligibility', cookie);
      expect((body.criteria as { eligible: boolean }).eligible).toBe(false);
      const lessons = body.criteria.lessons as { met: boolean };
      const assessment = body.criteria.assessment as { met: boolean };
      const capstone = body.criteria.capstone as { met: boolean };
      expect(lessons.met).toBe(false);
      expect(assessment.met).toBe(false);
      expect(capstone.met).toBe(false);
      const issued = await postJson(base, '/api/certificates/issue', cookie, {});
      expect(issued.response.status).toBe(400);
    });
  });

  it('issues a certificate only when all criteria are met, with learner name, course, date and verification ID', async () => {
    await withServer(async (base) => {
      const student = (await signIn(base, 'student@nexaflow.demo')).cookie;
      const instructor = (await signIn(base, 'instructor@nexaflow.demo')).cookie;
      await completeCourse(base, student);
      await passAllQuizzes(base, student);
      await gradeAllAssignments(base, student, instructor);
      await approveCapstone(base, student, instructor);
      const { body: eligibility } = await json(base, '/api/certificates/eligibility', student);
      expect((eligibility.criteria as { eligible: boolean }).eligible).toBe(true);
      expect((eligibility.criteria as { lessons: { value: number } }).lessons.value).toBe(100);
      expect((eligibility.criteria as { assessment: { value: number } }).assessment.value).toBe(95); // 10 quizzes at 100 + 10 assignments at 90
      expect((eligibility.criteria as { capstone: { met: boolean } }).capstone.met).toBe(true);
      const issued = await postJson(base, '/api/certificates/issue', student, {});
      expect(issued.response.status).toBe(201);
      const certificate = issued.body.certificate as { id: string; verificationId: string; issuedAt: string };
      expect(certificate.verificationId).toMatch(/^NF-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
      // Duplicate issuance is blocked
      const again = await postJson(base, '/api/certificates/issue', student, {});
      expect(again.response.status).toBe(409);
      // Certificate detail includes learner name, course and date
      const detail = (await json(base, `/api/certificates/${certificate.id}`, student)).body.certificate as { learnerName: string; courseName: string; verificationId: string };
      expect(detail.learnerName).toBe('Taylor Shah');
      expect(detail.courseName).toBeTruthy();
      expect(detail.verificationId).toBe(certificate.verificationId);
      // Verification endpoint resolves the ID
      const verified = await postJson(base, '/api/certificates/verify', instructor, { verificationId: certificate.verificationId });
      expect(verified.response.status).toBe(200);
      expect((verified.body.certificate as { learnerName: string; verified: boolean }).learnerName).toBe('Taylor Shah');
      expect((verified.body.certificate as { verified: boolean }).verified).toBe(true);
      // Printable HTML view includes learner name and verification ID
      const print = await fetch(`${base}/api/certificates/${certificate.id}/print`, { headers: { Cookie: student } });
      expect(print.status).toBe(200);
      const html = await print.text();
      expect(html).toContain('Taylor Shah');
      expect(html).toContain(certificate.verificationId);
      expect(html).toContain('Certificate of Completion');
    });
  });

  it('verification works publicly without signing in, and rejects unknown IDs', async () => {
    await withServer(async (base) => {
      const student = (await signIn(base, 'student@nexaflow.demo')).cookie;
      const instructor = (await signIn(base, 'instructor@nexaflow.demo')).cookie;
      await completeCourse(base, student);
      await passAllQuizzes(base, student);
      await gradeAllAssignments(base, student, instructor);
      await approveCapstone(base, student, instructor);
      const issued = await postJson(base, '/api/certificates/issue', student, {});
      const verificationId = (issued.body.certificate as { verificationId: string }).verificationId;
      // No cookie, no session — the public endpoint still verifies
      const response = await fetch(`${base}/api/certificates/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ verificationId }) });
      expect(response.status).toBe(200);
      const body = await response.json() as { certificate: { learnerName: string; verified: boolean } };
      expect(body.certificate.learnerName).toBe('Taylor Shah');
      expect(body.certificate.verified).toBe(true);
      // Unknown verification IDs return 404 without leaking anything
      const unknown = await fetch(`${base}/api/certificates/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ verificationId: 'NF-0000-0000-0000' }) });
      expect(unknown.status).toBe(404);
    });
  });

  it('rate-limits public verification attempts per client', async () => {
    await withServer(async (base) => {
      // The limiter runs before any lookup, so bogus IDs still count against the window.
      let lastStatus = 0;
      let lastHeaders: Headers | null = null;
      for (let index = 0; index < 12; index += 1) {
        const response = await fetch(`${base}/api/certificates/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ verificationId: 'NF-0000-0000-0000' }) });
        lastStatus = response.status;
        lastHeaders = response.headers;
      }
      expect(lastStatus).toBe(429);
      expect(Number(lastHeaders!.get('retry-after'))).toBeGreaterThan(0);
    });
  });

  it('students can only see their own certificate', async () => {
    await withServer(async (base) => {
      const student = (await signIn(base, 'student@nexaflow.demo')).cookie;
      const other = (await signIn(base, 'admin@nexaflow.demo')).cookie;
      const denied = await json(base, '/api/certificates/nonexistent', student);
      expect(denied.response.status).toBe(404);
      const unauthorized = await fetch(`${base}/api/certificates/cert-xyz/print`, { headers: { Cookie: student } });
      expect(unauthorized.status).toBe(404);
      const adminList = (await json(base, '/api/certificates', other)).body.certificates as unknown[];
      expect(adminList.length).toBe(0);
    });
  });

  it('students cannot access admin reports', async () => {
    await withServer(async (base) => {
      const student = (await signIn(base, 'student@nexaflow.demo')).cookie;
      const instructor = (await signIn(base, 'instructor@nexaflow.demo')).cookie;
      expect((await json(base, '/api/reports', student)).response.status).toBe(403);
      const reports = (await json(base, '/api/reports', instructor)).body;
      expect((reports as { enrollment: { total: number } }).enrollment.total).toBeGreaterThanOrEqual(1);
      expect((reports as { quizzes: { total: number } }).quizzes.total).toBe(10);
    });
  });
});
