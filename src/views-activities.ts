import { api, type User } from './api/client';
import { escape, formatDate } from './format';
import { shell } from './shell';
import { errorView } from './views';
import type { ActivitiesProgress, AssignmentDetail, AssignmentSummary, QuizAttempt, QuizDetail, QuizReviewItem, QuizSummary, SubmissionReviewRow, SubmissionView } from './types/index';

const statusLabels: Record<string, string> = { pending: 'Pending', submitted: 'Submitted', reviewed: 'Reviewed', returned: 'Needs revision', overdue: 'Overdue' };
const statusBadges: Record<string, string> = { pending: 'badge-normal', submitted: 'badge-attention', reviewed: 'badge-stale', returned: 'badge-at_risk', overdue: 'badge-stale' };
const activitiesHelp = () => '<details class="crm-help"><summary>How activities work</summary><p>Each module has a quiz and a practical assignment. Quizzes are scored automatically with review feedback after each attempt. Assignments are submitted as text or a link; an instructor reviews, scores and comments. You can resubmit once your work is returned for revision.</p></details>';

export function activitiesView(user: User, tab = 'assignments') {
  const tabs = [['assignments', 'Assignments'], ['quizzes', 'Quizzes']].map(([key, label]) => `<button class="tab ${tab === key ? 'active' : ''}" data-act-tab="${key}">${label}</button>`).join('');
  const active = user.role === 'STUDENT' ? 'Assignments' : tab === 'quizzes' ? 'Quizzes' : 'Assignments';
  shell(user, `<section class="page-header"><div><span class="eyebrow">Learning activities</span><h1>${user.role === 'STUDENT' ? 'Assignments & quizzes' : 'Activities'}</h1><p>Quizzes check understanding; assignments build portfolio evidence.</p></div></section>${activitiesHelp()}<nav class="tabs">${tabs}</nav><div id="activities-content"><div class="loading">Loading…</div></div>`, active);
  document.querySelectorAll('[data-act-tab]').forEach((button) => button.addEventListener('click', () => activitiesView(user, button.getAttribute('data-act-tab')!)));
  if (tab === 'quizzes') return quizzesList(user);
  return assignmentsList(user);
}

export function quizzesView(user: User) { activitiesView(user, 'quizzes'); }

async function progressSummary(user: User) {
  try {
    const { quizzes, assignments, progressPercent } = await api<ActivitiesProgress>('/api/learning/activities');
    const chips = [
      ['Quizzes taken', `${quizzes.taken}/${quizzes.total}`, 'badge-normal'],
      ['Quizzes passed', `${quizzes.passed}`, 'badge-stale'],
      ['Assignments pending', `${assignments.pending}`, 'badge-normal'],
      ['Awaiting review', `${assignments.submitted}`, 'badge-attention'],
      ['Reviewed', `${assignments.reviewed}`, 'badge-stale'],
      ['Overdue', `${assignments.overdue}`, 'badge-at_risk'],
    ].map(([label, value, badge]) => `<span class="chip">${escape(String(label))} <b>${escape(String(value))}</b></span>`).join('');
    return `<section class="state"><strong>Activities progress: ${progressPercent}%</strong><p>Quizzes count once passed; assignments count once reviewed.</p><div class="workload-chips">${chips}</div></section>`;
  } catch {
    return '';
  }
}

async function assignmentsList(user: User) {
  try {
    const [summary, { assignments }] = await Promise.all([
      progressSummary(user),
      api<{ assignments: AssignmentSummary[] }>('/api/assignments'),
    ]);
    const canManage = ['ADMIN', 'INSTRUCTOR'].includes(user.role);
    const rows = assignments.map((assignment) => `<tr data-assignment="${assignment.id}" class="lead-row"><td>${escape(assignment.moduleTitle)}</td><td>${escape(assignment.title)}</td><td>${formatDate(assignment.dueDate)}</td><td><span class="badge ${statusBadges[assignment.status]}">${statusLabels[assignment.status] || assignment.status}</span></td><td>${assignment.latestSubmission ? `<small class="muted">${escape(assignment.latestSubmission.feedback || (assignment.latestSubmission.score !== null ? `Score ${assignment.latestSubmission.score}` : 'Awaiting review'))}</small>` : ''}</td></tr>`).join('');
    document.querySelector('#activities-content')!.innerHTML = `${summary}<section class="analytics-card"><h2>Assignments</h2>${canManage ? '<button id="new-assignment" style="margin-bottom:12px">New assignment</button>' : ''}<div class="table-wrap"><table class="crm-table"><thead><tr><th>Module</th><th>Assignment</th><th>Due</th><th>Status</th><th>Latest feedback</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
    document.querySelectorAll('[data-assignment]').forEach((row) => row.addEventListener('click', () => assignmentDetailView(user, row.getAttribute('data-assignment')!)));
    const newAssignment = document.querySelector('#new-assignment');
    if (newAssignment) newAssignment.addEventListener('click', () => assignmentFormView(user));
  } catch (error) {
    errorView((error as Error).message);
  }
}

async function assignmentDetailView(user: User, assignmentId: string) {
  try {
    const canManage = ['ADMIN', 'INSTRUCTOR'].includes(user.role);
    const { assignment, submissions } = await api<{ assignment: AssignmentDetail; submissions: SubmissionView[] }>(`/api/assignments/${assignmentId}`);
    const latest = submissions[0] || null;
    const pendingReview = latest && latest.status === 'submitted';
    const submissionForm = canManage ? '' : `<h2>Submit your work</h2>${pendingReview ? '<p class="muted">You have a submission awaiting review. You can resubmit after it is returned for revision.</p>' : `<form id="submission-form" class="editor"><label>Your work (text)<textarea name="body" rows="6" placeholder="Paste or summarise your submission…"></textarea></label><label>Link (optional)<input name="links" placeholder="https://…"></label><button>Submit for review</button></form>`}`;
    const historyRows = submissions.length ? `<ul class="timeline">${submissions.map((submission) => `<li><strong>${submission.status}</strong> — submitted ${formatDate(submission.submittedAt)}${submission.score !== null ? ` · score ${submission.score}` : ''}${submission.feedback ? ` · ${escape(submission.feedback)}` : ''}</li>`).join('')}</ul>` : '<p class="muted">No submissions yet.</p>';
    const reviewSection = canManage ? `<section class="analytics-card"><h2>Review submissions</h2><div id="grading-rows"><div class="loading">Loading…</div></div></section>` : '';
    shell(user, `<button id="back" class="secondary">← Back to assignments</button><article class="lesson-detail"><span class="eyebrow">${escape(assignment.moduleTitle)} · Due ${formatDate(assignment.dueDate)}</span><h1>${escape(assignment.title)}</h1><span class="badge ${statusBadges[assignment.status]}">${statusLabels[assignment.status] || assignment.status}</span><h2>Instructions</h2><p>${escape(assignment.instructions || 'No instructions yet.')}</p>${assignment.rubric ? `<h2>Rubric</h2><p class="muted">${escape(assignment.rubric)}</p>` : ''}${canManage ? `<div style="margin-top:14px"><button id="edit-assignment" class="secondary">Edit assignment</button> <button id="delete-assignment" class="danger-link">Delete</button></div>` : ''}<h2>Your submissions</h2>${historyRows}${submissionForm}</article>${reviewSection}`, 'Assignments');
    document.querySelector('#back')!.addEventListener('click', () => assignmentsList(user));
    const submissionFormEl = document.querySelector('#submission-form');
    if (submissionFormEl) submissionFormEl.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const data = Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement)) as Record<string, string>;
        await api(`/api/assignments/${assignment.id}/submissions`, { method: 'POST', body: JSON.stringify({ body: data.body, links: data.links }) });
        assignmentDetailView(user, assignment.id);
      } catch (error) { alert((error as Error).message); }
    });
    const editAssignment = document.querySelector('#edit-assignment');
    if (editAssignment) editAssignment.addEventListener('click', () => assignmentFormView(user, assignment));
    const deleteAssignment = document.querySelector('#delete-assignment');
    if (deleteAssignment) deleteAssignment.addEventListener('click', async () => {
      if (!window.confirm('Delete this assignment and its submissions?')) return;
      try { await api(`/api/assignments/${assignment.id}`, { method: 'DELETE' }); assignmentsList(user); } catch (error) { alert((error as Error).message); }
    });
    if (canManage) gradingView(user, assignmentId);
  } catch (error) {
    errorView((error as Error).message);
  }
}

async function gradingView(user: User, assignmentId: string) {
  try {
    const { submissions } = await api<{ submissions: SubmissionReviewRow[] }>(`/api/submissions?assignmentId=${assignmentId}`);
    const rows = submissions.length ? submissions.map((submission) => `<tr><td>${escape(submission.studentName)}</td><td>${escape(submission.body || '—')}${submission.links ? ` · <a href="${escape(submission.links)}" target="_blank" rel="noreferrer">link</a>` : ''}</td><td>${escape(submission.status)}</td><td>${submission.score !== null ? submission.score : '—'}</td><td><form class="grade-form" data-submission="${submission.id}"><input name="score" type="number" min="0" max="100" value="${submission.score ?? ''}" placeholder="Score"><input name="feedback" value="${escape(submission.feedback)}" placeholder="Feedback"><select name="status"><option value="graded" ${submission.status === 'graded' ? 'selected' : ''}>Graded</option><option value="returned" ${submission.status === 'returned' ? 'selected' : ''}>Return for revision</option></select><button>Save</button></form></td></tr>`).join('') : '<tr><td colspan="5" class="muted">No submissions yet for this assignment.</td></tr>';
    const container = document.querySelector('#grading-rows');
    if (container) container.innerHTML = `<div class="table-wrap"><table class="crm-table"><thead><tr><th>Student</th><th>Work</th><th>Status</th><th>Score</th><th>Grade</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    document.querySelectorAll('.grade-form').forEach((form) => form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const id = (event.currentTarget as HTMLFormElement).getAttribute('data-submission')!;
      try {
        const data = Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement)) as Record<string, string>;
        await api(`/api/submissions/${id}`, { method: 'PUT', body: JSON.stringify({ score: Number(data.score || 0), feedback: data.feedback, status: data.status }) });
        gradingView(user, assignmentId);
      } catch (error) { alert((error as Error).message); }
    }));
  } catch (error) {
    errorView((error as Error).message);
  }
}

async function assignmentFormView(user: User, existing?: AssignmentDetail) {
  try {
    const { course } = await api<{ course: { modules: { id: string; title: string }[] } }>('/api/courses');
    const moduleOptions = course.modules.map((module) => `<option value="${module.id}">${escape(module.title)}</option>`).join('');
    shell(user, `<button id="back" class="secondary">← Back to assignments</button><article class="editor"><span class="eyebrow">${existing ? 'Edit assignment' : 'New assignment'}</span><h1>${existing ? 'Edit assignment' : 'Create an assignment'}</h1><form id="assignment-form"><label>Module<select name="moduleId">${moduleOptions}</select></label><label>Title<input name="title" value="${escape(existing?.title || '')}" required></label><label>Instructions<textarea name="instructions" rows="6">${escape(existing?.instructions || '')}</textarea></label><label>Rubric<textarea name="rubric" rows="3" placeholder="e.g. Clarity (40%) · completeness (30%) · evidence (30%)">${escape(existing?.rubric || '')}</textarea></label><label>Due date<input name="dueDate" type="date" value="${existing?.dueDate || ''}"></label><button>${existing ? 'Save assignment' : 'Create assignment'}</button></form></article>`, 'Assignments');
    document.querySelector('#back')!.addEventListener('click', () => activitiesView(user, 'assignments'));
    document.querySelector('#assignment-form')!.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const data = Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement)) as Record<string, string>;
        if (existing) await api(`/api/assignments/${existing.id}`, { method: 'PUT', body: JSON.stringify({ title: data.title, instructions: data.instructions, rubric: data.rubric, dueDate: data.dueDate || null }) });
        else await api('/api/assignments', { method: 'POST', body: JSON.stringify(data) });
        activitiesView(user, 'assignments');
      } catch (error) { alert((error as Error).message); }
    });
  } catch (error) {
    errorView((error as Error).message);
  }
}

async function quizzesList(user: User) {
  try {
    const [summary, { quizzes }] = await Promise.all([
      progressSummary(user),
      api<{ quizzes: QuizSummary[] }>('/api/quizzes'),
    ]);
    const canManage = ['ADMIN', 'INSTRUCTOR'].includes(user.role);
    const rows = quizzes.map((quiz) => `<tr data-quiz="${quiz.id}" class="lead-row"><td>${escape(quiz.moduleTitle)}</td><td>${escape(quiz.title)}</td><td>${quiz.questionCount}</td><td>${quiz.passScore}%</td><td>${quiz.attempts.taken ? `<span class="badge ${quiz.attempts.passed ? 'badge-stale' : 'badge-attention'}">${quiz.attempts.passed ? `Passed · ${quiz.attempts.bestScore}%` : `Attempted · best ${quiz.attempts.bestScore}%`}</span>` : '<span class="badge badge-normal">Not attempted</span>'}</td></tr>`).join('');
    document.querySelector('#activities-content')!.innerHTML = `${summary}<section class="analytics-card"><h2>Quizzes</h2>${canManage ? '<button id="new-quiz" style="margin-bottom:12px">New quiz</button>' : ''}<div class="table-wrap"><table class="crm-table"><thead><tr><th>Module</th><th>Quiz</th><th>Questions</th><th>Pass</th><th>My attempts</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
    document.querySelectorAll('[data-quiz]').forEach((row) => row.addEventListener('click', () => quizDetailView(user, row.getAttribute('data-quiz')!)));
    const newQuiz = document.querySelector('#new-quiz');
    if (newQuiz) newQuiz.addEventListener('click', () => quizFormView(user));
  } catch (error) {
    errorView((error as Error).message);
  }
}

async function quizDetailView(user: User, quizId: string) {
  try {
    const canManage = ['ADMIN', 'INSTRUCTOR'].includes(user.role);
    const { quiz, attempts } = await api<{ quiz: QuizDetail; attempts: QuizAttempt[] }>(`/api/quizzes/${quizId}`);
    const questionHtml = quiz.questions.map((question, index) => `<fieldset class="quiz-question"><legend>${index + 1}. ${escape(question.prompt)}</legend>${question.options.map((option, optionIndex) => `<label class="check"><input type="radio" name="q-${question.id}" value="${optionIndex}" required> ${escape(option)}</label>`).join('')}</fieldset>`).join('');
    const pastAttempts = attempts.length ? `<h2>Past attempts</h2><ul class="timeline">${attempts.map((attempt) => `<li><strong>${attempt.passed ? 'Passed' : 'Not passed'} · ${attempt.score}%</strong> — ${formatDate(attempt.submittedAt)}</li>`).join('')}</ul>` : '';
    shell(user, `<button id="back" class="secondary">← Back to quizzes</button><article class="lesson-detail"><span class="eyebrow">${escape(quiz.moduleTitle)} · ${quiz.questions.length} questions · pass at ${quiz.passScore}%</span><h1>${escape(quiz.title)}</h1>${canManage ? `<div style="margin-top:14px"><button id="edit-quiz" class="secondary">Edit quiz</button> <button id="delete-quiz" class="danger-link">Delete</button></div>` : ''}${canManage ? '' : `<form id="quiz-form" class="editor"><h2>Take the quiz</h2>${questionHtml}<button>Submit answers</button></form><div id="quiz-result"></div>`}${pastAttempts}</article>`, user.role === 'STUDENT' ? 'Assignments' : 'Quizzes');
    document.querySelector('#back')!.addEventListener('click', () => activitiesView(user, 'quizzes'));
    const editQuiz = document.querySelector('#edit-quiz');
    if (editQuiz) editQuiz.addEventListener('click', () => quizFormView(user, quiz));
    const deleteQuiz = document.querySelector('#delete-quiz');
    if (deleteQuiz) deleteQuiz.addEventListener('click', async () => {
      if (!window.confirm('Delete this quiz and its attempts?')) return;
      try { await api(`/api/quizzes/${quiz.id}`, { method: 'DELETE' }); activitiesView(user, 'quizzes'); } catch (error) { alert((error as Error).message); }
    });
    const quizForm = document.querySelector('#quiz-form');
    if (quizForm) quizForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const data = Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement)) as Record<string, string>;
        const answers = quiz.questions.map((question) => Number(data[`q-${question.id}`] ?? -1));
        const { attempt, review } = await api<{ attempt: QuizAttempt & { correct: number; total: number }; review: QuizReviewItem[] }>(`/api/quizzes/${quiz.id}/attempts`, { method: 'POST', body: JSON.stringify({ answers }) });
        renderQuizResult({ ...attempt, review });
      } catch (error) { alert((error as Error).message); }
    });
  } catch (error) {
    errorView((error as Error).message);
  }
}

function renderQuizResult(attempt: QuizAttempt & { correct: number; total: number }) {
  const container = document.querySelector('#quiz-result');
  if (!container) return;
  const passed = attempt.passed;
  const review = (attempt.review || []).map((item) => `<li class="${item.isCorrect ? 'review-correct' : 'review-wrong'}"><strong>${item.isCorrect ? '✓' : '✗'} ${escape(item.prompt)}</strong><br><span class="muted">Your answer: ${escape(item.options[item.selected] ?? '—')} · Correct: ${escape(item.options[item.correctOption])}</span>${item.explanation ? `<br><small>${escape(item.explanation)}</small>` : ''}</li>`).join('');
  container.innerHTML = `<section class="state"><strong>${passed ? 'Quiz passed!' : 'Not passed this time.'}</strong> <p>You scored ${attempt.score}% (${attempt.correct} of ${attempt.total} correct) — ${passed ? 'you can retake it to improve.' : 'review the feedback and try again.'}</p></section><h2>Review feedback</h2><ul class="timeline">${review}</ul>`;
}

async function quizFormView(user: User, existing?: QuizDetail) {
  try {
    const { course } = await api<{ course: { modules: { id: string; title: string }[] } }>('/api/courses');
    const moduleOptions = course.modules.map((module) => `<option value="${module.id}">${escape(module.title)}</option>`).join('');
    const questionRows = (existing?.questions || [{ id: '', prompt: '', options: ['', '', '', ''], position: 1 }]).map((question) => `<div class="quiz-question-row"><label>Question<input name="prompt" value="${escape(question.prompt)}" required></label><label>Options (comma separated)<input name="options" value="${escape(question.options.join(', '))}" required></label><label>Correct option (0-based)<input name="correctOption" type="number" min="0" value="0"></label><label>Explanation<input name="explanation" value=""></label></div>`).join('');
    shell(user, `<button id="back" class="secondary">← Back to quizzes</button><article class="editor"><span class="eyebrow">${existing ? 'Edit quiz' : 'New quiz'}</span><h1>${existing ? 'Edit quiz' : 'Create a quiz'}</h1><form id="quiz-form"><label>Module<select name="moduleId">${moduleOptions}</select></label><label>Title<input name="title" value="${escape(existing?.title || '')}" required></label><label>Pass score (%)<input name="passScore" type="number" min="0" max="100" value="${existing?.passScore ?? 70}"></label><h3>Questions</h3><div id="question-rows">${questionRows}</div><button type="button" id="add-question" class="secondary">Add question</button><button style="margin-top:16px">${existing ? 'Save quiz' : 'Create quiz'}</button></form></article>`, 'Quizzes');
    document.querySelector('#back')!.addEventListener('click', () => activitiesView(user, 'quizzes'));
    const addQuestion = document.querySelector('#add-question');
    if (addQuestion) addQuestion.addEventListener('click', () => {
      const row = document.createElement('div');
      row.className = 'quiz-question-row';
      row.innerHTML = '<label>Question<input name="prompt" required></label><label>Options (comma separated)<input name="options" required></label><label>Correct option (0-based)<input name="correctOption" type="number" min="0" value="0"></label><label>Explanation<input name="explanation"></label>';
      document.querySelector('#question-rows')!.appendChild(row);
    });
    document.querySelector('#quiz-form')!.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const data = Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement)) as Record<string, string>;
        const rows = Array.from(document.querySelectorAll('.quiz-question-row')).map((row) => {
          const fields = Object.fromEntries(new FormData(row as HTMLFormElement)) as Record<string, string>;
          return { prompt: fields.prompt, options: String(fields.options).split(',').map((option) => option.trim()).filter(Boolean), correctOption: Number(fields.correctOption || 0), explanation: fields.explanation || '' };
        });
        if (existing) await api(`/api/quizzes/${existing.id}`, { method: 'PUT', body: JSON.stringify({ title: data.title, passScore: Number(data.passScore || 70) }) });
        else await api('/api/quizzes', { method: 'POST', body: JSON.stringify({ moduleId: data.moduleId, title: data.title, passScore: Number(data.passScore || 70), questions: rows }) });
        activitiesView(user, 'quizzes');
      } catch (error) { alert((error as Error).message); }
    });
  } catch (error) {
    errorView((error as Error).message);
  }
}
