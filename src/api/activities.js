import crypto from 'node:crypto';
import { z } from 'zod';
import { parseUrl, readJson } from './context.js';

const quizSchema = z.object({
  moduleId: z.string().min(1), title: z.string().trim().min(1), passScore: z.coerce.number().int().min(0).max(100).optional(),
  questions: z.array(z.object({ prompt: z.string().trim().min(1), options: z.array(z.string().min(1)).min(2), correctOption: z.coerce.number().int().min(0), explanation: z.string().optional() })).min(1),
});
const quizUpdateSchema = z.object({ title: z.string().trim().min(1).optional(), passScore: z.coerce.number().int().min(0).max(100).optional() });
const attemptSchema = z.object({ answers: z.array(z.coerce.number().int().min(0)).min(1) });
const assignmentSchema = z.object({ moduleId: z.string().min(1), title: z.string().trim().min(1), instructions: z.string().optional(), dueDate: z.string().optional(), rubric: z.string().optional() });
const assignmentUpdateSchema = assignmentSchema.omit({ moduleId: true }).partial();
const submissionSchema = z.object({ body: z.string().optional(), links: z.string().optional() });
const gradeSchema = z.object({ score: z.coerce.number().min(0).max(100), feedback: z.string().optional(), status: z.enum(['graded', 'returned']) });

export function createActivitiesRoutes(ctx) {
  const { db, sendJson, referenceDate, requireUser, requireContentManager } = ctx;

  function enrollmentFor(user) {
    let enrollment = db.prepare('SELECT * FROM enrollments WHERE student_id = ? ORDER BY rowid LIMIT 1').get(user.id);
    if (!enrollment) {
      db.prepare('INSERT OR IGNORE INTO enrollments (id, cohort_id, student_id, progress_percent, status) VALUES (?, ?, ?, 0, ?)').run(`enroll-${user.id}`, 'cohort-beta-001', user.id, 'active');
      enrollment = db.prepare('SELECT * FROM enrollments WHERE id = ?').get(`enroll-${user.id}`);
    }
    return enrollment;
  }
  function questionsFor(quizId) {
    return db.prepare('SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY position').all(quizId).map((row) => ({ id: row.id, prompt: row.prompt, options: JSON.parse(row.options), correctOption: row.correct_option, explanation: row.explanation, position: row.position }));
  }
  function publicQuestions(quizId) {
    return questionsFor(quizId).map(({ correctOption, explanation, ...question }) => question);
  }
  function attemptReview(attempt) {
    const questions = questionsFor(attempt.quiz_id);
    const answers = JSON.parse(attempt.answers);
    return questions.map((question, index) => ({ questionId: question.id, prompt: question.prompt, options: question.options, selected: answers[index], correctOption: question.correctOption, explanation: question.explanation, isCorrect: answers[index] === question.correctOption }));
  }
  function decorateAttempt(row, quizId) {
    return { id: row.id, quizId, score: row.score, passed: !!row.passed, submittedAt: row.submitted_at };
  }
  function assignmentStatus(assignmentId, enrollmentId) {
    const latest = db.prepare('SELECT * FROM submissions WHERE assignment_id = ? AND enrollment_id = ? ORDER BY submitted_at DESC LIMIT 1').get(assignmentId, enrollmentId);
    if (latest) {
      if (latest.status === 'graded') return { status: 'reviewed', latestSubmission: decorateSubmission(latest) };
      if (latest.status === 'returned') return { status: 'returned', latestSubmission: decorateSubmission(latest) };
      return { status: 'submitted', latestSubmission: decorateSubmission(latest) };
    }
    const assignment = db.prepare('SELECT due_date FROM assignments WHERE id = ?').get(assignmentId);
    const overdue = assignment?.due_date && new Date(assignment.due_date) < referenceDate;
    return { status: overdue ? 'overdue' : 'pending', latestSubmission: null };
  }
  function decorateSubmission(row) {
    return { id: row.id, assignmentId: row.assignment_id, body: row.body || '', links: row.links || '', score: row.score, feedback: row.feedback || '', status: row.status, submittedAt: row.submitted_at, gradedAt: row.graded_at };
  }
  function quizRow(quiz, user) {
    const enrollment = enrollmentFor(user);
    const attempts = db.prepare('SELECT * FROM quiz_attempts WHERE quiz_id = ? AND enrollment_id = ? ORDER BY submitted_at DESC').all(quiz.id, enrollment.id);
    const questionCount = db.prepare('SELECT COUNT(*) AS count FROM quiz_questions WHERE quiz_id = ?').get(quiz.id).count;
    return {
      id: quiz.id, moduleId: quiz.module_id, moduleTitle: quiz.module_title, modulePosition: quiz.module_position,
      title: quiz.title, passScore: quiz.pass_score, questionCount,
      attempts: { taken: attempts.length, passed: attempts.some((attempt) => attempt.passed), bestScore: attempts.length ? Math.max(...attempts.map((attempt) => attempt.score)) : null },
    };
  }

  return async function activitiesRoutes(request, response, pathname) {
    if (request.method === 'GET' && pathname === '/api/quizzes') {
      const user = requireUser(request, response); if (!user) return true;
      const quizzes = db.prepare('SELECT q.*, m.title AS module_title, m.position AS module_position FROM quizzes q JOIN modules m ON m.id = q.module_id ORDER BY m.position').all();
      return sendJson(response, 200, { quizzes: quizzes.map((quiz) => quizRow(quiz, user)) });
    }
    const quizMatch = pathname.match(/^\/api\/quizzes\/([^/]+)$/);
    if (request.method === 'GET' && quizMatch) {
      const user = requireUser(request, response); if (!user) return true;
      const quiz = db.prepare('SELECT q.*, m.title AS module_title, m.position AS module_position FROM quizzes q JOIN modules m ON m.id = q.module_id WHERE q.id = ?').get(quizMatch[1]);
      if (!quiz) return sendJson(response, 404, { error: 'Quiz not found.' });
      const enrollment = enrollmentFor(user);
      const attempts = db.prepare('SELECT * FROM quiz_attempts WHERE quiz_id = ? AND enrollment_id = ? ORDER BY submitted_at DESC').all(quiz.id, enrollment.id).map((attempt) => ({ ...decorateAttempt(attempt, quiz.id), review: attemptReview(attempt) }));
      return sendJson(response, 200, { quiz: { id: quiz.id, moduleTitle: quiz.module_title, modulePosition: quiz.module_position, title: quiz.title, passScore: quiz.pass_score, questions: publicQuestions(quiz.id) }, attempts });
    }
    const attemptMatch = pathname.match(/^\/api\/quizzes\/([^/]+)\/attempts$/);
    if (request.method === 'GET' && attemptMatch) {
      const user = requireUser(request, response); if (!user) return true;
      const quiz = db.prepare('SELECT id FROM quizzes WHERE id = ?').get(attemptMatch[1]);
      if (!quiz) return sendJson(response, 404, { error: 'Quiz not found.' });
      const enrollment = enrollmentFor(user);
      const attempts = db.prepare('SELECT * FROM quiz_attempts WHERE quiz_id = ? AND enrollment_id = ? ORDER BY submitted_at DESC').all(quiz.id, enrollment.id).map((attempt) => ({ ...decorateAttempt(attempt, quiz.id), review: attemptReview(attempt) }));
      return sendJson(response, 200, { attempts });
    }
    if (request.method === 'POST' && attemptMatch) {
      const user = requireUser(request, response); if (!user) return true;
      const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(attemptMatch[1]);
      if (!quiz) return sendJson(response, 404, { error: 'Quiz not found.' });
      const questions = questionsFor(quiz.id);
      const body = attemptSchema.parse(await readJson(request));
      if (body.answers.length !== questions.length) return sendJson(response, 400, { error: `This quiz has ${questions.length} questions — provide exactly one answer per question.` });
      const correct = questions.filter((question, index) => body.answers[index] === question.correctOption).length;
      const score = questions.length ? Math.round((correct / questions.length) * 100) : 0;
      const passed = score >= quiz.pass_score;
      const enrollment = enrollmentFor(user);
      const attempt = { id: `att-${crypto.randomUUID()}`, quizId: quiz.id, enrollmentId: enrollment.id, answers: JSON.stringify(body.answers), score, passed: passed ? 1 : 0, submittedAt: new Date().toISOString() };
      db.prepare('INSERT INTO quiz_attempts (id, quiz_id, enrollment_id, answers, score, passed, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(attempt.id, attempt.quizId, attempt.enrollmentId, attempt.answers, attempt.score, attempt.passed, attempt.submittedAt);
      return sendJson(response, 201, { attempt: { id: attempt.id, quizId: attempt.quizId, score, passed, correct, total: questions.length, submittedAt: attempt.submittedAt }, review: questions.map((question, index) => ({ questionId: question.id, prompt: question.prompt, options: question.options, selected: body.answers[index], correctOption: question.correctOption, explanation: question.explanation, isCorrect: body.answers[index] === question.correctOption })) });
    }
    if (request.method === 'POST' && pathname === '/api/quizzes') {
      const user = requireContentManager(request, response); if (!user) return true;
      const body = quizSchema.parse(await readJson(request));
      if (!db.prepare('SELECT id FROM modules WHERE id = ?').get(body.moduleId)) return sendJson(response, 400, { error: 'A valid module is required.' });
      const quiz = { id: `quiz-${crypto.randomUUID()}`, moduleId: body.moduleId, title: body.title, passScore: body.passScore ?? 70 };
      db.prepare('INSERT INTO quizzes (id, module_id, title, pass_score) VALUES (?, ?, ?, ?)').run(quiz.id, quiz.moduleId, quiz.title, quiz.passScore);
      const insertQuestion = db.prepare('INSERT INTO quiz_questions (id, quiz_id, prompt, options, correct_option, explanation, position) VALUES (?, ?, ?, ?, ?, ?, ?)');
      body.questions.forEach((question, index) => insertQuestion.run(`q-${quiz.id}-${index + 1}`, quiz.id, question.prompt, JSON.stringify(question.options), question.correctOption, question.explanation || null, index + 1));
      return sendJson(response, 201, { quiz: { id: quiz.id, moduleId: quiz.moduleId, title: quiz.title, passScore: quiz.passScore, questionCount: body.questions.length } });
    }
    if (request.method === 'PUT' && quizMatch) {
      const user = requireContentManager(request, response); if (!user) return true;
      const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(quizMatch[1]);
      if (!quiz) return sendJson(response, 404, { error: 'Quiz not found.' });
      const body = quizUpdateSchema.parse(await readJson(request));
      if (body.title) db.prepare('UPDATE quizzes SET title = ? WHERE id = ?').run(body.title, quiz.id);
      if (body.passScore !== undefined) db.prepare('UPDATE quizzes SET pass_score = ? WHERE id = ?').run(body.passScore, quiz.id);
      return sendJson(response, 200, { quiz: { id: quiz.id, title: body.title || quiz.title, passScore: body.passScore ?? quiz.pass_score } });
    }
    if (request.method === 'DELETE' && quizMatch) {
      const user = requireContentManager(request, response); if (!user) return true;
      const quiz = db.prepare('SELECT id FROM quizzes WHERE id = ?').get(quizMatch[1]);
      if (!quiz) return sendJson(response, 404, { error: 'Quiz not found.' });
      db.prepare('DELETE FROM quizzes WHERE id = ?').run(quiz.id);
      return sendJson(response, 200, { ok: true });
    }
    if (request.method === 'GET' && pathname === '/api/assignments') {
      const user = requireUser(request, response); if (!user) return true;
      const enrollment = enrollmentFor(user);
      const assignments = db.prepare('SELECT a.*, m.title AS module_title, m.position AS module_position FROM assignments a JOIN modules m ON m.id = a.module_id ORDER BY m.position').all();
      return sendJson(response, 200, { assignments: assignments.map((assignment) => { const { status, latestSubmission } = assignmentStatus(assignment.id, enrollment.id); return { id: assignment.id, moduleId: assignment.module_id, moduleTitle: assignment.module_title, modulePosition: assignment.module_position, title: assignment.title, dueDate: assignment.due_date, status, latestSubmission }; }) });
    }
    const assignmentMatch = pathname.match(/^\/api\/assignments\/([^/]+)$/);
    if (request.method === 'GET' && assignmentMatch) {
      const user = requireUser(request, response); if (!user) return true;
      const assignment = db.prepare('SELECT a.*, m.title AS module_title, m.position AS module_position FROM assignments a JOIN modules m ON m.id = a.module_id WHERE a.id = ?').get(assignmentMatch[1]);
      if (!assignment) return sendJson(response, 404, { error: 'Assignment not found.' });
      const enrollment = enrollmentFor(user);
      const submissions = db.prepare('SELECT * FROM submissions WHERE assignment_id = ? AND enrollment_id = ? ORDER BY submitted_at DESC').all(assignment.id, enrollment.id).map(decorateSubmission);
      const { status } = assignmentStatus(assignment.id, enrollment.id);
      return sendJson(response, 200, { assignment: { id: assignment.id, moduleTitle: assignment.module_title, modulePosition: assignment.module_position, title: assignment.title, instructions: assignment.instructions || '', dueDate: assignment.due_date, rubric: assignment.rubric || '', status }, submissions });
    }
    const submissionMatch = pathname.match(/^\/api\/assignments\/([^/]+)\/submissions$/);
    if (request.method === 'POST' && submissionMatch) {
      const user = requireUser(request, response); if (!user) return true;
      const assignment = db.prepare('SELECT * FROM assignments WHERE id = ?').get(submissionMatch[1]);
      if (!assignment) return sendJson(response, 404, { error: 'Assignment not found.' });
      const body = submissionSchema.parse(await readJson(request));
      if (!String(body.body || '').trim() && !String(body.links || '').trim()) return sendJson(response, 400, { error: 'Add your work as text or a link before submitting.' });
      const enrollment = enrollmentFor(user);
      const pending = db.prepare("SELECT id FROM submissions WHERE assignment_id = ? AND enrollment_id = ? AND status = 'submitted'").get(assignment.id, enrollment.id);
      if (pending) return sendJson(response, 409, { error: 'You already have a submission awaiting review. Wait for feedback or a return before resubmitting.' });
      const submission = { id: `sub-${crypto.randomUUID()}`, assignmentId: assignment.id, enrollmentId: enrollment.id, body: String(body.body || '').trim(), links: String(body.links || '').trim(), status: 'submitted', submittedAt: new Date().toISOString() };
      db.prepare('INSERT INTO submissions (id, assignment_id, enrollment_id, body, links, status, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(submission.id, submission.assignmentId, submission.enrollmentId, submission.body, submission.links, submission.status, submission.submittedAt);
      return sendJson(response, 201, { submission: decorateSubmission(db.prepare('SELECT * FROM submissions WHERE id = ?').get(submission.id)) });
    }
    if (request.method === 'GET' && pathname === '/api/submissions') {
      const user = requireContentManager(request, response); if (!user) return true;
      const url = parseUrl(request); const assignmentId = url.searchParams.get('assignmentId');
      const rows = assignmentId
        ? db.prepare('SELECT s.*, u.name AS student_name, a.title AS assignment_title FROM submissions s JOIN assignments a ON a.id = s.assignment_id JOIN enrollments e ON e.id = s.enrollment_id JOIN users u ON u.id = e.student_id WHERE s.assignment_id = ? ORDER BY s.submitted_at DESC').all(assignmentId)
        : db.prepare('SELECT s.*, u.name AS student_name, a.title AS assignment_title FROM submissions s JOIN assignments a ON a.id = s.assignment_id JOIN enrollments e ON e.id = s.enrollment_id JOIN users u ON u.id = e.student_id ORDER BY s.submitted_at DESC').all();
      return sendJson(response, 200, { submissions: rows.map((row) => ({ ...decorateSubmission(row), studentName: row.student_name, assignmentTitle: row.assignment_title })) });
    }
    const gradeMatch = pathname.match(/^\/api\/submissions\/([^/]+)$/);
    if (request.method === 'PUT' && gradeMatch) {
      const user = requireContentManager(request, response); if (!user) return true;
      const submission = db.prepare('SELECT * FROM submissions WHERE id = ?').get(gradeMatch[1]);
      if (!submission) return sendJson(response, 404, { error: 'Submission not found.' });
      const body = gradeSchema.parse(await readJson(request));
      db.prepare('UPDATE submissions SET score = ?, feedback = ?, status = ?, graded_at = ?, graded_by = ? WHERE id = ?').run(body.score, String(body.feedback || '').trim(), body.status, new Date().toISOString(), user.id, submission.id);
      return sendJson(response, 200, { submission: decorateSubmission(db.prepare('SELECT * FROM submissions WHERE id = ?').get(submission.id)) });
    }
    if (request.method === 'POST' && pathname === '/api/assignments') {
      const user = requireContentManager(request, response); if (!user) return true;
      const body = assignmentSchema.parse(await readJson(request));
      if (!db.prepare('SELECT id FROM modules WHERE id = ?').get(body.moduleId)) return sendJson(response, 400, { error: 'A valid module is required.' });
      const assignment = { id: `asg-${crypto.randomUUID()}`, moduleId: body.moduleId, title: body.title, instructions: String(body.instructions || '').trim(), dueDate: body.dueDate || null, rubric: String(body.rubric || '').trim() };
      db.prepare('INSERT INTO assignments (id, module_id, title, instructions, due_date, rubric, starter_files) VALUES (?, ?, ?, ?, ?, ?, ?)').run(assignment.id, assignment.moduleId, assignment.title, assignment.instructions, assignment.dueDate, assignment.rubric, '[]');
      return sendJson(response, 201, { assignment });
    }
    if (request.method === 'PUT' && assignmentMatch) {
      const user = requireContentManager(request, response); if (!user) return true;
      const assignment = db.prepare('SELECT * FROM assignments WHERE id = ?').get(assignmentMatch[1]);
      if (!assignment) return sendJson(response, 404, { error: 'Assignment not found.' });
      const body = assignmentUpdateSchema.parse(await readJson(request));
      if (body.title) db.prepare('UPDATE assignments SET title = ? WHERE id = ?').run(body.title, assignment.id);
      if (body.instructions !== undefined) db.prepare('UPDATE assignments SET instructions = ? WHERE id = ?').run(String(body.instructions), assignment.id);
      if (body.dueDate !== undefined) db.prepare('UPDATE assignments SET due_date = ? WHERE id = ?').run(body.dueDate || null, assignment.id);
      if (body.rubric !== undefined) db.prepare('UPDATE assignments SET rubric = ? WHERE id = ?').run(String(body.rubric), assignment.id);
      return sendJson(response, 200, { assignment: db.prepare('SELECT * FROM assignments WHERE id = ?').get(assignment.id) });
    }
    if (request.method === 'DELETE' && assignmentMatch) {
      const user = requireContentManager(request, response); if (!user) return true;
      const assignment = db.prepare('SELECT id FROM assignments WHERE id = ?').get(assignmentMatch[1]);
      if (!assignment) return sendJson(response, 404, { error: 'Assignment not found.' });
      db.prepare('DELETE FROM assignments WHERE id = ?').run(assignment.id);
      return sendJson(response, 200, { ok: true });
    }
    if (request.method === 'GET' && pathname === '/api/learning/activities') {
      const user = requireUser(request, response); if (!user) return true;
      const enrollment = enrollmentFor(user);
      const quizzes = db.prepare('SELECT id, pass_score FROM quizzes').all();
      const quizAttempts = db.prepare('SELECT quiz_id, score, passed FROM quiz_attempts WHERE enrollment_id = ?').all(enrollment.id);
      const attemptsByQuiz = new Map();
      for (const attempt of quizAttempts) {
        if (!attemptsByQuiz.has(attempt.quiz_id)) attemptsByQuiz.set(attempt.quiz_id, []);
        attemptsByQuiz.get(attempt.quiz_id).push(attempt);
      }
      const taken = quizzes.filter((quiz) => attemptsByQuiz.has(quiz.id)).length;
      const passed = quizzes.filter((quiz) => (attemptsByQuiz.get(quiz.id) || []).some((attempt) => attempt.passed)).length;
      const assignments = db.prepare('SELECT id, due_date FROM assignments').all();
      const submissions = db.prepare('SELECT assignment_id, status, submitted_at FROM submissions WHERE enrollment_id = ?').all(enrollment.id);
      const byAssignment = new Map();
      for (const submission of submissions) { const latest = byAssignment.get(submission.assignment_id); if (!latest || submission.submitted_at > latest.submitted_at) byAssignment.set(submission.assignment_id, submission); }
      let pending = 0; let submitted = 0; let reviewed = 0; let returned = 0; let overdue = 0;
      for (const assignment of assignments) {
        const latest = byAssignment.get(assignment.id);
        if (!latest) {
          if (assignment.due_date && new Date(assignment.due_date) < referenceDate) overdue += 1; else pending += 1;
        } else if (latest.status === 'submitted') submitted += 1;
        else if (latest.status === 'returned') returned += 1;
        else reviewed += 1;
      }
      const totalItems = quizzes.length + assignments.length;
      const completedItems = passed + reviewed;
      return sendJson(response, 200, {
        quizzes: { total: quizzes.length, taken, passed, pending: quizzes.length - taken },
        assignments: { total: assignments.length, pending, submitted, reviewed, returned, overdue },
        progressPercent: totalItems ? Math.round((completedItems / totalItems) * 100) : 0,
      });
    }
    return false;
  };
}
