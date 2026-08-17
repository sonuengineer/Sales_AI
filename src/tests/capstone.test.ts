import { describe, it, expect } from 'vitest';
import { withServer, signIn } from './helpers';

async function json(base: string, path: string, cookie?: string, init: RequestInit = {}) {
  const response = await fetch(`${base}${path}`, { ...init, headers: { Cookie: cookie || '', ...(init.headers || {}) } });
  return { response, body: await response.json() as Record<string, unknown> };
}
const postJson = (base: string, path: string, cookie: string, body: unknown) => json(base, path, cookie, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const putJson = (base: string, path: string, cookie: string, body: unknown) => json(base, path, cookie, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

describe('capstone — student workspace', () => {
  it('requires authentication for capstone endpoints', async () => {
    await withServer(async (base) => {
      expect((await fetch(`${base}/api/capstone`)).status).toBe(401);
      expect((await fetch(`${base}/api/capstone/review`)).status).toBe(401);
    });
  });

  it('seeds ten deliverables with rubric, deadline and related links', async () => {
    await withServer(async (base) => {
      const { cookie } = await signIn(base, 'student@nexaflow.demo');
      const { body } = await json(base, '/api/capstone', cookie);
      const deliverables = body.deliverables as Array<{ id: string; position: number; rubric: string; relatedLinks: unknown[]; deadline: string }>;
      expect(deliverables.length).toBe(10);
      expect(new Set(deliverables.map((item) => item.position))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
      expect(deliverables.every((item) => !!item.rubric && !!item.deadline)).toBe(true);
      expect(deliverables.every((item) => Array.isArray(item.relatedLinks))).toBe(true);
      expect((body.progress as { total: number; submitted: number }).submitted).toBe(0);
      expect((body.capstone as { status: string }).status).toBe('in_progress');
    });
  });

  it('every deliverable links to its supporting lesson with a worked example and starter files', async () => {
    await withServer(async (base) => {
      const { cookie } = await signIn(base, 'student@nexaflow.demo');
      const { body } = await json(base, '/api/capstone', cookie);
      const deliverables = body.deliverables as Array<{ id: string; lesson: { id: string; title: string; moduleTitle: string; files: { id: string; name: string }[]; workedExample: string } }>;
      expect(deliverables.every((item) => item.lesson && item.lesson.id.length > 0)).toBe(true);
      expect(deliverables.every((item) => item.lesson.files.length > 0)).toBe(true);
      expect(deliverables.every((item) => item.lesson.workedExample.includes('## Worked example'))).toBe(true);
      const cleaning = deliverables.find((item) => item.id === 'cap-del-01')!;
      expect(cleaning.lesson.id).toBe('lesson-02');
      expect(cleaning.lesson.title).toBe('Clean data for analysis');
      expect(cleaning.lesson.workedExample).toContain('cleaning a real export');
      expect(cleaning.lesson.files.some((file) => file.name === 'dirty-crm-export.csv')).toBe(true);
      const dashboard = deliverables.find((item) => item.id === 'cap-del-05')!;
      expect(dashboard.lesson.id).toBe('lesson-03');
      expect(dashboard.lesson.workedExample).toContain('writing definitions before the dashboard');
    });
  });

  it('blocks final review until every deliverable is submitted', async () => {
    await withServer(async (base) => {
      const { cookie } = await signIn(base, 'student@nexaflow.demo');
      const early = await postJson(base, '/api/capstone/submit', cookie, {});
      expect(early.response.status).toBe(400);
      const { body } = await json(base, '/api/capstone', cookie);
      const first = (body.deliverables as Array<{ id: string }>)[0].id;
      await postJson(base, `/api/capstone/deliverables/${first}/submissions`, cookie, { body: 'Cleaning rules documented.', links: '' });
      const stillBlocked = await postJson(base, '/api/capstone/submit', cookie, {});
      expect(stillBlocked.response.status).toBe(400);
    });
  });

  it('lets a student submit a deliverable and blocks resubmission while awaiting review', async () => {
    await withServer(async (base) => {
      const { cookie } = await signIn(base, 'student@nexaflow.demo');
      const { body } = await json(base, '/api/capstone', cookie);
      const first = (body.deliverables as Array<{ id: string }>)[0].id;
      const created = await postJson(base, `/api/capstone/deliverables/${first}/submissions`, cookie, { body: 'My cleaning plan with duplicate detection.', links: 'https://docs.example' });
      expect(created.response.status).toBe(201);
      const again = await postJson(base, `/api/capstone/deliverables/${first}/submissions`, cookie, { body: 'A newer version.', links: '' });
      expect(again.response.status).toBe(409);
      const after = (await json(base, '/api/capstone', cookie)).body;
      const item = (after.deliverables as Array<{ id: string; submission: { status: string; body: string } }>).find((entry) => entry.id === first)!;
      expect(item.submission.status).toBe('submitted');
      expect(item.submission.body).toContain('cleaning plan');
      expect((after.progress as { submitted: number }).submitted).toBe(1);
    });
  });

  it('lets a student submit the full capstone once all deliverables are submitted', async () => {
    await withServer(async (base) => {
      const { cookie } = await signIn(base, 'student@nexaflow.demo');
      const { body } = await json(base, '/api/capstone', cookie);
      for (const deliverable of body.deliverables as Array<{ id: string }>) {
        await postJson(base, `/api/capstone/deliverables/${deliverable.id}/submissions`, cookie, { body: `Work for ${deliverable.id}.`, links: '' });
      }
      const submitted = await postJson(base, '/api/capstone/submit', cookie, {});
      expect(submitted.response.status).toBe(200);
      expect((submitted.body.capstone as { status: string }).status).toBe('submitted');
      const twice = await postJson(base, '/api/capstone/submit', cookie, {});
      expect(twice.response.status).toBe(409);
    });
  });
});

describe('capstone — instructor review and grading', () => {
  it('students cannot access the review queue or grade deliverables', async () => {
    await withServer(async (base) => {
      const { cookie } = await signIn(base, 'student@nexaflow.demo');
      expect((await json(base, '/api/capstone/review', cookie)).response.status).toBe(403);
      expect((await json(base, '/api/capstone/review/whatever', cookie)).response.status).toBe(403);
    });
  });

  it('instructor grades each deliverable; returned items can be resubmitted', async () => {
    await withServer(async (base) => {
      const student = (await signIn(base, 'student@nexaflow.demo')).cookie;
      const instructor = (await signIn(base, 'instructor@nexaflow.demo')).cookie;
      const { body } = await json(base, '/api/capstone', student);
      const first = (body.deliverables as Array<{ id: string }>)[0].id;
      await postJson(base, `/api/capstone/deliverables/${first}/submissions`, student, { body: 'Draft.', links: '' });
      const queue = (await json(base, '/api/capstone/review', instructor)).body.capstones as Array<{ id: string; studentName: string }>;
      expect(queue.length).toBe(1);
      expect(queue[0].studentName).toBe('Taylor Shah');
      const detail = (await json(base, `/api/capstone/review/${queue[0].id}`, instructor)).body;
      const item = (detail.deliverables as Array<{ id: string; submission: { id: string; status: string } }>).find((entry) => entry.id === first)!;
      expect(item.submission.status).toBe('submitted');
      const graded = await putJson(base, `/api/capstone/review/${queue[0].id}/deliverables/${first}`, instructor, { score: 60, feedback: 'Good start — add the missing-value rules.', status: 'returned' });
      expect(graded.response.status).toBe(200);
      const after = (await json(base, '/api/capstone', student)).body;
      const returned = (after.deliverables as Array<{ id: string; submission: { status: string; score: number; feedback: string } }>).find((entry) => entry.id === first)!;
      expect(returned.submission.status).toBe('returned');
      expect(returned.submission.score).toBe(60);
      expect(returned.submission.feedback).toContain('missing-value');
      const resubmit = await postJson(base, `/api/capstone/deliverables/${first}/submissions`, student, { body: 'Revised with missing-value rules.', links: '' });
      expect(resubmit.response.status).toBe(201);
      expect((resubmit.body.submission as { status: string }).status).toBe('submitted');
    });
  });

  it('instructors can attach example files that students can download; students cannot modify', async () => {
    await withServer(async (base) => {
      const student = (await signIn(base, 'student@nexaflow.demo')).cookie;
      const instructor = (await signIn(base, 'instructor@nexaflow.demo')).cookie;
      const denied = await putJson(base, '/api/capstone/deliverables/cap-del-01/files', student, { files: [{ name: 'x.csv', label: 'X', content: 'a,b' }] });
      expect(denied.response.status).toBe(403);
      const attached = await putJson(base, '/api/capstone/deliverables/cap-del-01/files', instructor, { files: [{ name: 'example-clean.csv', label: 'Example cleaned export', description: 'A cleaned version', contentType: 'text/csv', content: 'lead_id,company\nlead-001,AtlasHR' }] });
      expect(attached.response.status).toBe(200);
      const files = (attached.body.files as Array<{ id: string; name: string; contentType: string }>);
      expect(files.length).toBe(1);
      expect(files[0].name).toBe('example-clean.csv');
      expect(files[0].id.length).toBeGreaterThan(0); // server assigns ids
      const fileId = files[0].id;
      const workspace = (await json(base, '/api/capstone', student)).body;
      const item = (workspace.deliverables as Array<{ id: string; instructorFiles: Array<{ id: string; name: string }> }>).find((entry) => entry.id === 'cap-del-01')!;
      expect(item.instructorFiles.length).toBe(1);
      expect(item.instructorFiles[0].name).toBe('example-clean.csv');
      const download = await fetch(`${base}/api/capstone-files/${fileId}`, { headers: { Cookie: student } });
      expect(download.status).toBe(200);
      expect(download.headers.get('content-type')).toContain('text/csv');
      expect(await download.text()).toContain('AtlasHR');
      expect((await fetch(`${base}/api/capstone-files/${fileId}`)).status).toBe(401);
      const removed = await putJson(base, '/api/capstone/deliverables/cap-del-01/files', instructor, { files: [] });
      expect(removed.response.status).toBe(200);
      const after = (await json(base, '/api/capstone', student)).body;
      expect((after.deliverables as Array<{ id: string; instructorFiles: unknown[] }>).find((entry) => entry.id === 'cap-del-01')!.instructorFiles.length).toBe(0);
      expect((await fetch(`${base}/api/capstone-files/${fileId}`, { headers: { Cookie: student } })).status).toBe(404);
    });
  });

  it('instructor review detail includes the supporting lesson and starter files per deliverable', async () => {
    await withServer(async (base) => {
      const student = (await signIn(base, 'student@nexaflow.demo')).cookie;
      const instructor = (await signIn(base, 'instructor@nexaflow.demo')).cookie;
      const { body } = await json(base, '/api/capstone', student);
      const first = (body.deliverables as Array<{ id: string }>)[0].id;
      await postJson(base, `/api/capstone/deliverables/${first}/submissions`, student, { body: 'Draft.', links: '' });
      const queue = (await json(base, '/api/capstone/review', instructor)).body.capstones as Array<{ id: string }>;
      const detail = (await json(base, `/api/capstone/review/${queue[0].id}`, instructor)).body;
      const items = detail.deliverables as Array<{ id: string; lesson: { id: string; title: string; files: { name: string }[]; workedExample: string } }>;
      expect(items.every((item) => item.lesson && item.lesson.files.length > 0 && item.lesson.workedExample.length > 0)).toBe(true);
      const cleaning = items.find((item) => item.id === 'cap-del-01')!;
      expect(cleaning.lesson.title).toBe('Clean data for analysis');
      expect(cleaning.lesson.files.some((file) => file.name === 'dirty-crm-export.csv')).toBe(true);
      expect(cleaning.lesson.workedExample).toContain('## Worked example');
    });
  });

  it('requires all deliverables graded before approving; approval produces the portfolio summary', async () => {
    await withServer(async (base) => {
      const student = (await signIn(base, 'student@nexaflow.demo')).cookie;
      const instructor = (await signIn(base, 'instructor@nexaflow.demo')).cookie;
      const { body } = await json(base, '/api/capstone', student);
      const deliverables = body.deliverables as Array<{ id: string }>;
      for (const deliverable of deliverables) {
        await postJson(base, `/api/capstone/deliverables/${deliverable.id}/submissions`, student, { body: `Work for ${deliverable.id}.`, links: '' });
      }
      await postJson(base, '/api/capstone/submit', student, {});
      const queue = (await json(base, '/api/capstone/review', instructor)).body.capstones as Array<{ id: string }>;
      const capstoneId = queue[0].id;
      // Approving before grading everything is rejected
      const early = await putJson(base, `/api/capstone/review/${capstoneId}`, instructor, { decision: 'approved', feedback: 'Nice.' });
      expect(early.response.status).toBe(400);
      // Grade only half, then approve the other half
      const half = deliverables.slice(0, 5);
      const rest = deliverables.slice(5);
      for (const deliverable of half) {
        await putJson(base, `/api/capstone/review/${capstoneId}/deliverables/${deliverable.id}`, instructor, { score: 90, feedback: 'Great.', status: 'graded' });
      }
      const stillEarly = await putJson(base, `/api/capstone/review/${capstoneId}`, instructor, { decision: 'approved', feedback: 'Nice.' });
      expect(stillEarly.response.status).toBe(400);
      for (const deliverable of rest) {
        await putJson(base, `/api/capstone/review/${capstoneId}/deliverables/${deliverable.id}`, instructor, { score: 70, feedback: 'Solid.', status: 'graded' });
      }
      const approved = await putJson(base, `/api/capstone/review/${capstoneId}`, instructor, { decision: 'approved', feedback: 'Portfolio-ready work — well done.' });
      expect(approved.response.status).toBe(200);
      expect((approved.body.capstone as { status: string; final_score: number }).status).toBe('approved');
      const workspace = (await json(base, '/api/capstone', student)).body;
      expect((workspace.capstone as { status: string }).status).toBe('approved');
      expect((workspace.capstone as { finalScore: number }).finalScore).toBe(80);
      const portfolio = workspace.portfolio as { deliverables: unknown[]; finalScore: number; feedback: string };
      expect(portfolio.deliverables.length).toBe(10);
      expect(portfolio.finalScore).toBe(80);
      expect(portfolio.feedback).toContain('Portfolio-ready');
      // Once approved, the student can no longer submit deliverables
      const locked = await postJson(base, '/api/capstone/deliverables/cap-del-01/submissions', student, { body: 'Too late.', links: '' });
      expect(locked.response.status).toBe(409);
    });
  });

  it('returning the capstone sends it back for revision', async () => {
    await withServer(async (base) => {
      const student = (await signIn(base, 'student@nexaflow.demo')).cookie;
      const instructor = (await signIn(base, 'instructor@nexaflow.demo')).cookie;
      const { body } = await json(base, '/api/capstone', student);
      for (const deliverable of body.deliverables as Array<{ id: string }>) {
        await postJson(base, `/api/capstone/deliverables/${deliverable.id}/submissions`, student, { body: 'Work.', links: '' });
      }
      await postJson(base, '/api/capstone/submit', student, {});
      const queue = (await json(base, '/api/capstone/review', instructor)).body.capstones as Array<{ id: string }>;
      const returned = await putJson(base, `/api/capstone/review/${queue[0].id}`, instructor, { decision: 'returned', feedback: 'Revisit the dashboard section.' });
      expect(returned.response.status).toBe(200);
      const workspace = (await json(base, '/api/capstone', student)).body;
      expect((workspace.capstone as { status: string }).status).toBe('returned');
      // A returned deliverable can be resubmitted and the capstone resubmitted for review
      await postJson(base, '/api/capstone/deliverables/cap-del-05/submissions', student, { body: 'Fixed dashboard.', links: '' });
      const resubmit = await postJson(base, '/api/capstone/submit', student, {});
      expect(resubmit.response.status).toBe(200);
      expect((resubmit.body.capstone as { status: string }).status).toBe('submitted');
    });
  });
});
