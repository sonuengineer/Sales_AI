import { describe, it, expect } from 'vitest';
import { withServer, signIn } from './helpers';

interface CoverageModule { position: number; title: string; lessonTitle: string; counts: { lesson: number; quiz: number; assignment: number; capstone: number }; coveragePercent: number; }
interface Coverage { studentCount: number; summary: { lessons: number; quizzes: number; assignments: number; capstones: number }; modules: CoverageModule[]; }

async function getCoverage(base: string, cookie: string) {
  const response = await fetch(`${base}/api/curriculum/coverage`, { headers: { Cookie: cookie } });
  expect(response.status).toBe(200);
  return (await response.json()) as Coverage;
}

describe('cohort curriculum coverage', () => {
  it('requires instructor or admin access', async () => {
    await withServer(async (base) => {
      expect((await fetch(`${base}/api/curriculum/coverage`)).status).toBe(401);
      const student = (await signIn(base, 'student@nexaflow.demo')).cookie;
      expect((await fetch(`${base}/api/curriculum/coverage`, { headers: { Cookie: student } })).status).toBe(403);
      const instructor = (await signIn(base, 'instructor@nexaflow.demo')).cookie;
      expect((await fetch(`${base}/api/curriculum/coverage`, { headers: { Cookie: instructor } })).status).toBe(200);
      const admin = (await signIn(base, 'admin@nexaflow.demo')).cookie;
      expect((await fetch(`${base}/api/curriculum/coverage`, { headers: { Cookie: admin } })).status).toBe(200);
    });
  });

  it('reports all 10 modules with zero coverage for a fresh cohort', async () => {
    await withServer(async (base) => {
      const instructor = (await signIn(base, 'instructor@nexaflow.demo')).cookie;
      const coverage = await getCoverage(base, instructor);
      expect(coverage.studentCount).toBe(10);
      expect(coverage.modules.length).toBe(10);
      expect(new Set(coverage.modules.map((module) => module.position))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
      expect(coverage.modules.every((module) => module.lessonTitle.length > 0)).toBe(true);
      expect(coverage.modules.every((module) => module.counts.lesson === 0 && module.counts.quiz === 0 && module.counts.assignment === 0 && module.counts.capstone === 0)).toBe(true);
      expect(coverage.modules.every((module) => module.coveragePercent === 0)).toBe(true);
    });
  });

  it('tracks cohort progress as students complete lessons and pass quizzes', async () => {
    await withServer(async (base) => {
      const student = (await signIn(base, 'student@nexaflow.demo')).cookie;
      const instructor = (await signIn(base, 'instructor@nexaflow.demo')).cookie;
      await fetch(`${base}/api/lessons/lesson-01/complete`, { method: 'POST', headers: { Cookie: student } });
      const attempt = await fetch(`${base}/api/quizzes/quiz-01/attempts`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: student }, body: JSON.stringify({ answers: [0, 0, 0] }) });
      expect(attempt.status).toBe(201);
      const coverage = await getCoverage(base, instructor);
      const module1 = coverage.modules.find((module) => module.position === 1)!;
      expect(module1.counts.lesson).toBe(1);
      expect(module1.counts.quiz).toBe(1);
      // 1 of 10 students = 10% per activity, averaged over the 10 modules
      expect(coverage.summary.lessons).toBe(1);
      expect(coverage.summary.quizzes).toBe(1);
      // (lesson 10% + quiz 10% + assignment 0% + capstone 0%) / 4
      expect(module1.coveragePercent).toBe(5);
    });
  });
});
