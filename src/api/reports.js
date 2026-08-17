export function createReportRoutes(ctx) {
  const { db, sendJson, requireContentManager } = ctx;

  function lessonProgressByStudent() {
    const total = db.prepare('SELECT COUNT(*) AS count FROM lessons').get().count || 1;
    return db.prepare('SELECT u.id, u.name, COUNT(lc.lesson_id) AS completed FROM users u JOIN enrollments e ON e.student_id = u.id LEFT JOIN lesson_completions lc ON lc.user_id = u.id WHERE u.role = \'STUDENT\' GROUP BY u.id ORDER BY u.name').all().map((row) => ({ studentId: row.id, studentName: row.name, completedLessons: row.completed, totalLessons: total, percent: Math.round((row.completed / total) * 100) }));
  }
  function quizResults() {
    const quizzes = db.prepare('SELECT id FROM quizzes').all();
    const attempts = db.prepare('SELECT quiz_id, score, passed FROM quiz_attempts').all();
    const taken = attempts.length;
    const passed = attempts.filter((attempt) => attempt.passed).length;
    const byQuiz = new Map();
    for (const quiz of quizzes) byQuiz.set(quiz.id, []);
    for (const attempt of attempts) { if (byQuiz.has(attempt.quiz_id)) byQuiz.get(attempt.quiz_id).push(attempt); }
    const bestScores = [...byQuiz.values()].map((list) => list.length ? Math.max(...list.map((attempt) => attempt.score)) : null).filter((score) => score !== null);
    return { total: quizzes.length, taken, passed, avgBestScore: bestScores.length ? Math.round(bestScores.reduce((sum, score) => sum + score, 0) / bestScores.length) : null };
  }
  function submissionStatus() {
    const rows = db.prepare('SELECT s.status FROM submissions s JOIN assignments a ON a.id = s.assignment_id').all();
    const graded = rows.filter((row) => row.status === 'graded').length;
    const returned = rows.filter((row) => row.status === 'returned').length;
    const submitted = rows.filter((row) => row.status === 'submitted').length;
    return { total: rows.length, submitted, graded, returned, pendingReview: submitted };
  }
  function capstoneStatus() {
    const capstones = db.prepare('SELECT status, final_score FROM capstones').all();
    const approved = capstones.filter((row) => row.status === 'approved');
    const scores = approved.map((row) => row.final_score).filter((score) => score !== null && score !== undefined);
    return { total: capstones.length, approved: approved.length, submitted: capstones.filter((row) => ['submitted', 'approved', 'returned'].includes(row.status)).length, avgFinalScore: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null };
  }
  function enrollmentStats() {
    const enrollments = db.prepare('SELECT status FROM enrollments').all();
    const count = (status) => enrollments.filter((row) => row.status === status).length;
    return { total: enrollments.length, active: count('active'), completed: count('completed'), dropped: count('dropped'), pending: count('pending') };
  }

  // Cohort curriculum coverage: for every module, how many enrolled students
  // have completed the lesson, passed the quiz, had the assignment reviewed and
  // graded the capstone deliverable. Mirrors the student Curriculum page, but
  // aggregated across the whole cohort for instructors and admins.
  function cohortCoverage() {
    const students = db.prepare("SELECT u.id AS user_id, e.id AS enrollment_id FROM users u JOIN enrollments e ON e.student_id = u.id WHERE u.role = 'STUDENT'").all();
    const studentCount = students.length;
    const modules = db.prepare('SELECT m.id AS module_id, m.position, m.title, l.id AS lesson_id, l.title AS lesson_title FROM modules m JOIN lessons l ON l.module_id = m.id ORDER BY m.position').all();
    const quizzes = db.prepare('SELECT id, module_id FROM quizzes').all();
    const quizByModule = new Map(quizzes.map((quiz) => [quiz.module_id, quiz.id]));
    const assignments = db.prepare('SELECT id, module_id FROM assignments').all();
    const assignmentByModule = new Map(assignments.map((assignment) => [assignment.module_id, assignment.id]));
    const deliverables = db.prepare('SELECT id, position FROM capstone_deliverables').all();
    const deliverableByPosition = new Map(deliverables.map((deliverable) => [deliverable.position, deliverable.id]));
    const percent = (count) => (studentCount ? Math.round((count / studentCount) * 100) : 0);

    const moduleRows = modules.map((module) => {
      const lessonCount = db.prepare('SELECT COUNT(DISTINCT user_id) AS count FROM lesson_completions WHERE lesson_id = ?').get(module.lesson_id).count;
      const quizId = quizByModule.get(module.module_id);
      const quizCount = quizId ? db.prepare('SELECT COUNT(DISTINCT enrollment_id) AS count FROM quiz_attempts WHERE quiz_id = ? AND passed = 1').get(quizId).count : 0;
      const assignmentId = assignmentByModule.get(module.module_id);
      const assignmentCount = assignmentId ? db.prepare("SELECT COUNT(DISTINCT enrollment_id) AS count FROM submissions WHERE assignment_id = ? AND status = 'graded'").get(assignmentId).count : 0;
      const deliverableId = deliverableByPosition.get(module.position);
      const capstoneCount = deliverableId ? db.prepare("SELECT COUNT(DISTINCT capstone_id) AS count FROM capstone_submissions WHERE deliverable_id = ? AND status = 'graded'").get(deliverableId).count : 0;
      const percents = [percent(lessonCount), percent(quizCount), percent(assignmentCount), percent(capstoneCount)];
      return {
        moduleId: module.module_id, position: module.position, title: module.title,
        lessonId: module.lesson_id, lessonTitle: module.lesson_title,
        counts: { lesson: lessonCount, quiz: quizCount, assignment: assignmentCount, capstone: capstoneCount },
        coveragePercent: Math.round(percents.reduce((sum, value) => sum + value, 0) / percents.length),
      };
    });
    const average = (key) => (moduleRows.length ? Math.round(moduleRows.reduce((sum, row) => sum + percent(row.counts[key]), 0) / moduleRows.length) : 0);
    return {
      studentCount,
      summary: { lessons: average('lesson'), quizzes: average('quiz'), assignments: average('assignment'), capstones: average('capstone') },
      modules: moduleRows,
    };
  }

  return async function reportRoutes(request, response, pathname) {
    if (request.method === 'GET' && pathname === '/api/reports') {
      const user = requireContentManager(request, response); if (!user) return true;
      return sendJson(response, 200, {
        generatedAt: new Date().toISOString(),
        enrollment: enrollmentStats(),
        cohorts: db.prepare('SELECT c.id, c.name, c.status, (SELECT COUNT(*) FROM enrollments e WHERE e.cohort_id = c.id) AS student_count FROM cohorts c ORDER BY c.created_at DESC').all(),
        lessonProgress: lessonProgressByStudent(),
        quizzes: quizResults(),
        submissions: submissionStatus(),
        capstones: capstoneStatus(),
      });
    }
    if (request.method === 'GET' && pathname === '/api/curriculum/coverage') {
      const user = requireContentManager(request, response); if (!user) return true;
      return sendJson(response, 200, cohortCoverage());
    }
    return false;
  };
}
