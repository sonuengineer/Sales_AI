import { describe, it, expect } from 'vitest';
import { withServer, signIn } from './helpers';

async function json(base: string, path: string, cookie?: string, init: RequestInit = {}) {
  const response = await fetch(`${base}${path}`, { ...init, headers: { Cookie: cookie || '', ...(init.headers || {}) } });
  return { response, body: await response.json() as Record<string, unknown> };
}
const postJson = (base: string, path: string, cookie: string, body: unknown) => json(base, path, cookie, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const putJson = (base: string, path: string, cookie: string, body: unknown) => json(base, path, cookie, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

describe('cohorts — management', () => {
  it('requires authentication and role access', async () => {
    await withServer(async (base) => {
      expect((await fetch(`${base}/api/cohorts`)).status).toBe(401);
      expect((await fetch(`${base}/api/users`)).status).toBe(401);
      const student = (await signIn(base, 'student@nexaflow.demo')).cookie;
      expect((await json(base, '/api/cohorts', student)).response.status).toBe(403);
      expect((await json(base, '/api/users', student)).response.status).toBe(403);
    });
  });

  it('admin can create, list and delete a cohort', async () => {
    await withServer(async (base) => {
      const admin = (await signIn(base, 'admin@nexaflow.demo')).cookie;
      const created = await postJson(base, '/api/cohorts', admin, { name: 'Evening Cohort', instructorId: 'usr-instructor-001', startDate: '2026-11-01', endDate: '2026-12-31', status: 'upcoming' });
      expect(created.response.status).toBe(201);
      const cohortId = (created.body.cohort as { id: string }).id;
      const list = (await json(base, '/api/cohorts', admin)).body.cohorts as Array<{ id: string; name: string; instructorName: string | null }>;
      expect(list.some((cohort) => cohort.id === cohortId)).toBe(true);
      expect(list.find((cohort) => cohort.id === cohortId)!.instructorName).toBe('Jordan Lee');
      const deleted = await json(base, `/api/cohorts/${cohortId}`, admin, { method: 'DELETE' });
      expect(deleted.response.status).toBe(200);
      const after = (await json(base, '/api/cohorts', admin)).body.cohorts as Array<{ id: string }>;
      expect(after.some((cohort) => cohort.id === cohortId)).toBe(false);
    });
  });

  it('instructors can manage cohorts but only admins can delete them', async () => {
    await withServer(async (base) => {
      const instructor = (await signIn(base, 'instructor@nexaflow.demo')).cookie;
      const created = await postJson(base, '/api/cohorts', instructor, { name: 'Weekend Cohort', status: 'upcoming' });
      expect(created.response.status).toBe(201);
      const cohortId = (created.body.cohort as { id: string }).id;
      const updated = await putJson(base, `/api/cohorts/${cohortId}`, instructor, { status: 'active' });
      expect(updated.response.status).toBe(200);
      expect((updated.body.cohort as { status: string }).status).toBe('active');
      const denied = await json(base, `/api/cohorts/${cohortId}`, instructor, { method: 'DELETE' });
      expect(denied.response.status).toBe(403);
    });
  });

  it('admin can enroll students, update their status and remove them', async () => {
    await withServer(async (base) => {
      const admin = (await signIn(base, 'admin@nexaflow.demo')).cookie;
      const created = await postJson(base, '/api/cohorts', admin, { name: 'Beta Two', status: 'active' });
      const cohortId = (created.body.cohort as { id: string }).id;
      const users = (await json(base, '/api/users', admin)).body.users as Array<{ id: string; name: string; role: string }>;
      const student = users.find((entry) => entry.role === 'STUDENT')!;
      const enrolled = await postJson(base, `/api/cohorts/${cohortId}/enrollments`, admin, { studentId: student.id, status: 'pending' });
      expect(enrolled.response.status).toBe(201);
      const detail = (await json(base, `/api/cohorts/${cohortId}`, admin)).body as { studentCount: number; enrollments: Array<{ id: string; studentName: string; status: string }> };
      expect(detail.studentCount).toBe(1);
      expect(detail.enrollments[0].studentName).toBe(student.name);
      expect(detail.enrollments[0].status).toBe('pending');
      const duplicate = await postJson(base, `/api/cohorts/${cohortId}/enrollments`, admin, { studentId: student.id });
      expect(duplicate.response.status).toBe(409);
      const updated = await putJson(base, `/api/cohorts/${cohortId}/enrollments/${detail.enrollments[0].id}`, admin, { status: 'completed' });
      expect(updated.response.status).toBe(200);
      expect((updated.body.enrollment as { status: string; completed_at: string | null }).status).toBe('completed');
      const removed = await json(base, `/api/cohorts/${cohortId}/enrollments/${detail.enrollments[0].id}`, admin, { method: 'DELETE' });
      expect(removed.response.status).toBe(200);
      const after = (await json(base, `/api/cohorts/${cohortId}`, admin)).body as { enrollments: unknown[] };
      expect(after.enrollments.length).toBe(0);
    });
  });

  it('rejects enrolling a non-student or a missing student', async () => {
    await withServer(async (base) => {
      const admin = (await signIn(base, 'admin@nexaflow.demo')).cookie;
      const created = await postJson(base, '/api/cohorts', admin, { name: 'Invalid Enroll', status: 'active' });
      const cohortId = (created.body.cohort as { id: string }).id;
      const bad = await postJson(base, `/api/cohorts/${cohortId}/enrollments`, admin, { studentId: 'usr-instructor-001' });
      expect(bad.response.status).toBe(400);
      const missing = await postJson(base, `/api/cohorts/${cohortId}/enrollments`, admin, { studentId: 'usr-nobody' });
      expect(missing.response.status).toBe(400);
    });
  });
});
