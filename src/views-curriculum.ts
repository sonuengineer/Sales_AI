import { api, type User } from './api/client';
import { escape } from './format';
import { shell } from './shell';
import { errorView } from './views';
import { lessonView } from './views-course';
import { activitiesView } from './views-activities';
import { capstoneView } from './views-capstone';
import type { ActivitiesProgress, AssignmentSummary, CapstoneItem, CourseView, ModuleView, QuizSummary } from './types/index';

const assignmentLabels: Record<string, string> = { pending: 'Pending', submitted: 'Submitted', reviewed: 'Reviewed', returned: 'Needs revision', overdue: 'Overdue' };
const assignmentBadges: Record<string, string> = { pending: 'badge-normal', submitted: 'badge-attention', reviewed: 'badge-stale', returned: 'badge-at_risk', overdue: 'badge-stale' };
const capstoneLabels: Record<string, string> = { pending: 'Not started', submitted: 'Submitted', graded: 'Graded', returned: 'Needs revision' };
const capstoneBadges: Record<string, string> = { pending: 'badge-normal', submitted: 'badge-attention', graded: 'badge-stale', returned: 'badge-at_risk' };

function assignmentCell(assignment: AssignmentSummary | undefined) {
  if (!assignment) return '<span class="muted">—</span>';
  return `<button class="secondary small-btn" data-go-assignments>${escape(assignmentLabels[assignment.status] || assignment.status)}</button>`;
}

function capstoneCell(deliverable: CapstoneItem | undefined) {
  if (!deliverable) return '<span class="muted">—</span>';
  const state = deliverable.submission ? deliverable.submission.status : 'pending';
  return `<button class="secondary small-btn" data-go-capstone><span class="badge ${capstoneBadges[state]}">${capstoneLabels[state]}</span> Deliverable ${String(deliverable.position).padStart(2, '0')}</button>`;
}

export interface CohortCoverageModule { moduleId: string; position: number; title: string; lessonId: string; lessonTitle: string; counts: { lesson: number; quiz: number; assignment: number; capstone: number }; coveragePercent: number; }
export interface CohortCoverage { studentCount: number; summary: { lessons: number; quizzes: number; assignments: number; capstones: number }; modules: CohortCoverageModule[]; }

export async function curriculumCoverageView(user: User) {
  shell(user, `<section class="page-header"><div><span class="eyebrow">Module by module</span><h1>Curriculum coverage</h1><p>Track your progress through the 10 modules — lesson, quiz, assignment and capstone deliverable per module.</p></div></section><div id="coverage-content"><div class="loading">Loading…</div></div>`, 'Curriculum');
  loadCoverage(user);
}

export async function cohortCoverageView(user: User) {
  shell(user, `<section class="page-header"><div><span class="eyebrow">Cohort-wide</span><h1>Curriculum coverage</h1><p>How the whole cohort is progressing through the 10 modules — lesson, quiz, assignment and capstone deliverable per module.</p></div></section><div id="coverage-content"><div class="loading">Loading…</div></div>`, 'Coverage');
  loadCohortCoverage(user);
}

async function loadCohortCoverage(user: User) {
  try {
    const coverage = await api<CohortCoverage>('/api/curriculum/coverage');
    const students = coverage.studentCount;
    const chips = [
      ['Students enrolled', `${students}`, 'badge-normal'],
      ['Lessons complete', `${coverage.summary.lessons}%`, 'badge-stale'],
      ['Quizzes passed', `${coverage.summary.quizzes}%`, 'badge-stale'],
      ['Assignments reviewed', `${coverage.summary.assignments}%`, 'badge-stale'],
      ['Capstone graded', `${coverage.summary.capstones}%`, 'badge-stale'],
    ].map(([label, value, badge]) => `<span class="chip">${escape(String(label))} <b>${escape(String(value))}</b></span>`).join('');
    const rows = coverage.modules.map((module) => {
      const cell = (count: number) => `<td>${count}/${students}</td>`;
      return `<tr><td><strong>${module.position}.</strong> ${escape(module.title)}<br><small class="muted">${escape(module.lessonTitle)}</small></td>${cell(module.counts.lesson)}${cell(module.counts.quiz)}${cell(module.counts.assignment)}${cell(module.counts.capstone)}<td><strong>${module.coveragePercent}%</strong></td></tr>`;
    }).join('') || '<tr><td colspan="6" class="muted">No modules found — seed the course first.</td></tr>';
    document.querySelector('#coverage-content')!.innerHTML = `<section class="state"><strong>Coverage at a glance</strong><p>Share of enrolled students who completed each activity per module. Click a module to open the student-facing view for the full topic map.</p><div class="workload-chips">${chips}</div></section><section class="analytics-card"><h2>Module coverage — whole cohort</h2><div class="table-wrap"><table class="crm-table"><thead><tr><th>Module</th><th>Lesson complete</th><th>Quiz passed</th><th>Assignment reviewed</th><th>Capstone graded</th><th>Cohort coverage</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
  } catch (error) {
    errorView((error as Error).message);
  }
}

async function loadCoverage(user: User) {
  try {
    const [{ course }, { quizzes }, { assignments }, { deliverables }, activities] = await Promise.all([
      api<{ course: CourseView }>('/api/courses'),
      api<{ quizzes: QuizSummary[] }>('/api/quizzes'),
      api<{ assignments: AssignmentSummary[] }>('/api/assignments'),
      api<{ deliverables: CapstoneItem[] }>('/api/capstone'),
      api<ActivitiesProgress>('/api/learning/activities').catch(() => null),
    ]);
    const quizByModule = new Map(quizzes.map((quiz) => [quiz.moduleId, quiz]));
    const assignmentByModule = new Map(assignments.map((assignment) => [assignment.moduleId, assignment]));
    const deliverableByPosition = new Map(deliverables.map((deliverable) => [deliverable.position, deliverable]));

    const rows = course.modules.map((module) => {
      const lesson = module.lessons[0];
      const lessonDone = module.lessons.length > 0 && module.completedLessons === module.lessons.length;
      const quiz = quizByModule.get(module.id);
      const quizDone = !!quiz?.attempts.passed;
      const assignment = assignmentByModule.get(module.id);
      const assignmentDone = assignment?.status === 'reviewed';
      const deliverable = deliverableByPosition.get(module.position);
      const capstoneDone = deliverable?.submission?.status === 'graded';
      const done = [lessonDone, quizDone, assignmentDone, capstoneDone].filter(Boolean).length;
      const quizCell = quiz ? (quiz.attempts.taken ? `<button class="secondary small-btn" data-go-quizzes><span class="badge ${quiz.attempts.passed ? 'badge-stale' : 'badge-attention'}">${quiz.attempts.passed ? `Passed · ${quiz.attempts.bestScore}%` : `Attempted · best ${quiz.attempts.bestScore}%`}</span></button>` : '<span class="badge badge-normal">Not attempted</span>') : '<span class="muted">—</span>';
      return `<tr><td><strong>${module.position}.</strong> ${escape(module.title)}</td><td><button class="secondary small-btn ${lessonDone ? '' : ''}" data-open-lesson="${lesson?.id || ''}">${lessonDone ? '✓' : '○'} ${escape(lesson?.title || 'Lesson')}</button></td><td>${quizCell}</td><td>${assignmentCell(assignment)}</td><td>${capstoneCell(deliverable)}</td><td><strong>${done}/4</strong></td></tr>`;
    }).join('');

    const chips = [];
    if (activities) {
      chips.push(`<span class="chip">Course lessons <b>${course.completedLessonCount}/${course.lessonCount}</b></span>`);
      chips.push(`<span class="chip">Quizzes passed <b>${activities.quizzes.passed}/${activities.quizzes.total}</b></span>`);
      chips.push(`<span class="chip">Assignments reviewed <b>${activities.assignments.reviewed}/${activities.assignments.total}</b></span>`);
    }
    chips.push(`<span class="chip">Capstone graded <b>${deliverables.filter((item) => item.submission?.status === 'graded').length}/${deliverables.length}</b></span>`);

    document.querySelector('#coverage-content')!.innerHTML = `<section class="state"><strong>Coverage at a glance</strong><p>A module is fully covered when its lesson is complete, its quiz is passed, its assignment is reviewed and its capstone deliverable is graded.</p><div class="workload-chips">${chips.join('')}</div></section><section class="analytics-card"><h2>Module coverage</h2><div class="table-wrap"><table class="crm-table"><thead><tr><th>Module</th><th>Lesson</th><th>Quiz</th><th>Assignment</th><th>Capstone</th><th>Coverage</th></tr></thead><tbody>${rows}</tbody></table></div><p class="muted" style="margin-top:12px">Click a cell to jump to that activity. The detailed topic map for every module lives in <code>docs/curriculum-coverage.md</code>.</p></section>`;

    document.querySelectorAll('[data-open-lesson]').forEach((button) => button.addEventListener('click', () => lessonView(user, button.getAttribute('data-open-lesson')!)));
    document.querySelectorAll('[data-go-quizzes]').forEach((button) => button.addEventListener('click', () => activitiesView(user, 'quizzes')));
    document.querySelectorAll('[data-go-assignments]').forEach((button) => button.addEventListener('click', () => activitiesView(user, 'assignments')));
    document.querySelectorAll('[data-go-capstone]').forEach((button) => button.addEventListener('click', () => capstoneView(user)));
  } catch (error) {
    errorView((error as Error).message);
  }
}
