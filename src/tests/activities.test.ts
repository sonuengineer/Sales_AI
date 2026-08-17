import { describe, it, expect } from 'vitest';
import { withServer, signIn } from './helpers';

async function json(base: string, path: string, cookie?: string, init: RequestInit = {}) {
  const response = await fetch(`${base}${path}`, { ...init, headers: { Cookie: cookie || '', ...(init.headers || {}) } });
  return { response, body: await response.json() as Record<string, unknown> };
}
const postJson = (base: string, path: string, cookie: string, body: unknown) => json(base, path, cookie, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

describe('learning activities — quizzes', () => {
  it('requires authentication for activity endpoints', async () => {
    await withServer(async (base) => {
      expect((await fetch(`${base}/api/quizzes`)).status).toBe(401);
      expect((await fetch(`${base}/api/assignments`)).status).toBe(401);
      expect((await fetch(`${base}/api/learning/activities`)).status).toBe(401);
      expect((await fetch(`${base}/api/submissions`)).status).toBe(401);
    });
  });

  it('seeds one quiz and one assignment for every module', async () => {
    await withServer(async (base) => {
      const { cookie } = await signIn(base, 'student@nexaflow.demo');
      const quizzes = (await json(base, '/api/quizzes', cookie)).body.quizzes as Array<{ id: string; moduleId: string; questionCount: number; attempts: { taken: number } }>;
      expect(quizzes.length).toBe(10);
      expect(new Set(quizzes.map((quiz) => quiz.moduleId)).size).toBe(10);
      expect(quizzes.every((quiz) => quiz.questionCount >= 3)).toBe(true);
      const assignments = (await json(base, '/api/assignments', cookie)).body.assignments as Array<{ id: string; moduleId: string }>;
      expect(assignments.length).toBe(10);
      expect(new Set(assignments.map((assignment) => assignment.moduleId)).size).toBe(10);
    });
  });

  it('hides correct answers until after an attempt', async () => {
    await withServer(async (base) => {
      const { cookie } = await signIn(base, 'student@nexaflow.demo');
      const { body } = await json(base, '/api/quizzes/quiz-01', cookie);
      const questions = (body.quiz as { questions: Array<Record<string, unknown>> }).questions;
      expect(questions.length).toBe(3);
      expect(questions.every((question) => question.correctOption === undefined && question.explanation === undefined)).toBe(true);
    });
  });

  it('scores an attempt and returns review feedback with explanations', async () => {
    await withServer(async (base) => {
      const { cookie } = await signIn(base, 'student@nexaflow.demo');
      const attempt = await postJson(base, '/api/quizzes/quiz-01/attempts', cookie, { answers: [0, 0, 0] });
      expect(attempt.response.status).toBe(201);
      expect((attempt.body.attempt as { score: number; passed: boolean; correct: number; total: number }).score).toBe(100);
      expect((attempt.body.attempt as { passed: boolean }).passed).toBe(true);
      const review = attempt.body.review as Array<{ isCorrect: boolean; explanation: string | null }>;
      expect(review.length).toBe(3);
      expect(review.every((item) => item.isCorrect)).toBe(true);
      expect(review.some((item) => !!item.explanation)).toBe(true);
      // The quiz list reflects the attempt
      const quizzes = (await json(base, '/api/quizzes', cookie)).body.quizzes as Array<{ id: string; attempts: { taken: number; passed: boolean; bestScore: number | null } }>;
      const summary = quizzes.find((quiz) => quiz.id === 'quiz-01')!.attempts;
      expect(summary.taken).toBe(1);
      expect(summary.passed).toBe(true);
      expect(summary.bestScore).toBe(100);
    });
  });

  it('wrong answers fail the quiz and show the correct answer', async () => {
    await withServer(async (base) => {
      const { cookie } = await signIn(base, 'student@nexaflow.demo');
      const attempt = await postJson(base, '/api/quizzes/quiz-01/attempts', cookie, { answers: [1, 1, 1] });
      expect((attempt.body.attempt as { score: number; passed: boolean }).score).toBe(0);
      expect((attempt.body.attempt as { passed: boolean }).passed).toBe(false);
      const review = attempt.body.review as Array<{ isCorrect: boolean; correctOption: number; selected: number }>;
      expect(review.every((item) => !item.isCorrect)).toBe(true);
      expect(review.every((item) => item.correctOption === 0)).toBe(true);
    });
  });

  it('rejects attempts with the wrong number of answers', async () => {
    await withServer(async (base) => {
      const { cookie } = await signIn(base, 'student@nexaflow.demo');
      const attempt = await postJson(base, '/api/quizzes/quiz-01/attempts', cookie, { answers: [0] });
      expect(attempt.response.status).toBe(400);
    });
  });

  it('instructors can create and delete quizzes; students cannot', async () => {
    await withServer(async (base) => {
      const instructor = (await signIn(base, 'instructor@nexaflow.demo')).cookie;
      const student = (await signIn(base, 'student@nexaflow.demo')).cookie;
      const created = await postJson(base, '/api/quizzes', instructor, { moduleId: 'mod-01', title: 'Test quiz', passScore: 70, questions: [{ prompt: 'Q?', options: ['A', 'B'], correctOption: 1, explanation: 'Because.' }] });
      expect(created.response.status).toBe(201);
      const quizId = (created.body.quiz as { id: string }).id;
      const denied = await postJson(base, '/api/quizzes', student, { moduleId: 'mod-01', title: 'Nope', questions: [{ prompt: 'Q?', options: ['A', 'B'], correctOption: 0 }] });
      expect(denied.response.status).toBe(403);
      const deleted = await json(base, `/api/quizzes/${quizId}`, instructor, { method: 'DELETE' });
      expect(deleted.response.status).toBe(200);
    });
  });
});

describe('learning activities — assignments and grading', () => {
  it('flags an assignment as overdue when its due date has passed with no submission', async () => {
    await withServer(async (base) => {
      const { cookie } = await signIn(base, 'student@nexaflow.demo');
      const assignments = (await json(base, '/api/assignments', cookie)).body.assignments as Array<{ id: string; status: string }>;
      expect(assignments.find((assignment) => assignment.id === 'asg-02')!.status).toBe('overdue');
      expect(assignments.find((assignment) => assignment.id === 'asg-01')!.status).toBe('pending');
    });
  });

  it('lets a student submit, then blocks resubmission while awaiting review', async () => {
    await withServer(async (base) => {
      const { cookie } = await signIn(base, 'student@nexaflow.demo');
      const created = await postJson(base, '/api/assignments/asg-01/submissions', cookie, { body: 'My funnel map with ownership notes.', links: '' });
      expect(created.response.status).toBe(201);
      const assignments = (await json(base, '/api/assignments', cookie)).body.assignments as Array<{ id: string; status: string }>;
      expect(assignments.find((assignment) => assignment.id === 'asg-01')!.status).toBe('submitted');
      const again = await postJson(base, '/api/assignments/asg-01/submissions', cookie, { body: 'Another copy.', links: '' });
      expect(again.response.status).toBe(409);
      const detail = (await json(base, '/api/assignments/asg-01', cookie)).body;
      expect((detail.submissions as unknown[]).length).toBe(1);
    });
  });

  it('instructor reviews, scores and returns; student resubmits after a return', async () => {
    await withServer(async (base) => {
      const instructor = (await signIn(base, 'instructor@nexaflow.demo')).cookie;
      const student = (await signIn(base, 'student@nexaflow.demo')).cookie;
      await postJson(base, '/api/assignments/asg-01/submissions', student, { body: 'Draft funnel map.', links: '' });
      // Instructor sees the submission in the review queue and grades it
      const queue = (await json(base, '/api/submissions?assignmentId=asg-01', instructor)).body.submissions as Array<{ id: string; studentName: string }>;
      expect(queue.length).toBe(1);
      expect(queue[0].studentName).toBe('Taylor Shah');
      const graded = await json(base, `/api/submissions/${queue[0].id}`, instructor, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ score: 80, feedback: 'Good draft — add who owns each stage.', status: 'returned' }) });
      expect(graded.response.status).toBe(200);
      // Student sees the feedback and can now resubmit
      const detail = (await json(base, '/api/assignments/asg-01', student)).body;
      const latest = (detail.submissions as Array<{ status: string; score: number | null; feedback: string }>)[0];
      expect(latest.status).toBe('returned');
      expect(latest.score).toBe(80);
      expect(latest.feedback).toContain('Good draft');
      const resubmit = await postJson(base, '/api/assignments/asg-01/submissions', student, { body: 'Revised funnel map with owners.', links: '' });
      expect(resubmit.response.status).toBe(201);
      expect((resubmit.body.submission as { status: string }).status).toBe('submitted');
    });
  });

  it('students cannot grade submissions', async () => {
    await withServer(async (base) => {
      const instructor = (await signIn(base, 'instructor@nexaflow.demo')).cookie;
      const student = (await signIn(base, 'student@nexaflow.demo')).cookie;
      await postJson(base, '/api/assignments/asg-01/submissions', student, { body: 'Work.', links: '' });
      const queue = (await json(base, '/api/submissions?assignmentId=asg-01', instructor)).body.submissions as Array<{ id: string }>;
      const denied = await json(base, `/api/submissions/${queue[0].id}`, student, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ score: 99, feedback: 'self grade', status: 'graded' }) });
      expect(denied.response.status).toBe(403);
    });
  });

  it('progress summary counts quizzes passed and assignments reviewed', async () => {
    await withServer(async (base) => {
      const instructor = (await signIn(base, 'instructor@nexaflow.demo')).cookie;
      const student = (await signIn(base, 'student@nexaflow.demo')).cookie;
      const before = (await json(base, '/api/learning/activities', student)).body;
      expect((before.quizzes as { total: number; taken: number }).total).toBe(10);
      expect((before.quizzes as { taken: number }).taken).toBe(0);
      expect((before.assignments as { total: number; overdue: number }).overdue).toBe(1);
      // Pass a quiz and get an assignment reviewed
      await postJson(base, '/api/quizzes/quiz-01/attempts', student, { answers: [0, 0, 0] });
      await postJson(base, '/api/assignments/asg-01/submissions', student, { body: 'Work.', links: '' });
      const queue = (await json(base, '/api/submissions?assignmentId=asg-01', instructor)).body.submissions as Array<{ id: string }>;
      await json(base, `/api/submissions/${queue[0].id}`, instructor, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ score: 90, feedback: 'Nice work.', status: 'graded' }) });
      const after = (await json(base, '/api/learning/activities', student)).body;
      expect((after.quizzes as { taken: number; passed: number }).taken).toBe(1);
      expect((after.quizzes as { passed: number }).passed).toBe(1);
      expect((after.assignments as { reviewed: number }).reviewed).toBe(1);
      expect(after.progressPercent).toBe(10); // 1 passed quiz + 1 reviewed assignment of 20 items
    });
  });
});
