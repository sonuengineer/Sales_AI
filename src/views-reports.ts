import { api, type User } from './api/client';
import { escape } from './format';
import { shell } from './shell';
import { errorView } from './views';
import type { ReportData } from './types/index';

export function reportsView(user: User) {
  shell(user, `<section class="page-header"><div><span class="eyebrow">Administration</span><h1>Reports</h1><p>Enrollment, progress, quiz and submission health for the training platform.</p></div></section><div id="reports-content"><div class="loading">Loading…</div></div>`, 'Reports');
  reportsData(user);
}

async function reportsData(user: User) {
  try {
    const report = await api<ReportData>('/api/reports');
    const kpiCards = [
      ['Enrolled', String(report.enrollment.total), 'badge-normal'],
      ['Active', String(report.enrollment.active), 'badge-attention'],
      ['Completed', String(report.enrollment.completed), 'badge-stale'],
      ['Quizzes taken', `${report.quizzes.taken}/${report.quizzes.total}`, 'badge-normal'],
      ['Quizzes passed', String(report.quizzes.passed), 'badge-stale'],
      ['Avg quiz score', report.quizzes.avgBestScore !== null ? `${report.quizzes.avgBestScore}%` : '—', 'badge-normal'],
      ['Submissions', String(report.submissions.total), 'badge-normal'],
      ['Pending review', String(report.submissions.pendingReview), 'badge-attention'],
      ['Capstones approved', `${report.capstones.approved}/${report.capstones.total}`, 'badge-stale'],
    ].map(([label, value, badge]) => `<span class="chip">${escape(String(label))} <b>${escape(String(value))}</b></span>`).join('');
    const cohortRows = report.cohorts.map((cohort) => `<tr><td>${escape(cohort.name)}</td><td><span class="badge badge-normal">${escape(cohort.status)}</span></td><td>${cohort.student_count}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">No cohorts yet.</td></tr>';
    const progressRows = report.lessonProgress.map((row) => `<tr><td>${escape(row.studentName)}</td><td>${row.completedLessons}/${row.totalLessons} lessons</td><td>${row.percent}%</td></tr>`).join('') || '<tr><td colspan="3" class="muted">No enrolled students yet.</td></tr>';
    document.querySelector('#reports-content')!.innerHTML = `<section class="state"><strong>Platform health</strong><div class="workload-chips">${kpiCards}</div></section><section class="analytics-card"><h2>Cohorts</h2><div class="table-wrap"><table class="crm-table"><thead><tr><th>Cohort</th><th>Status</th><th>Students</th></tr></thead><tbody>${cohortRows}</tbody></table></div></section><section class="analytics-card"><h2>Lesson progress by student</h2><div class="table-wrap"><table class="crm-table"><thead><tr><th>Student</th><th>Lessons completed</th><th>Percent</th></tr></thead><tbody>${progressRows}</tbody></table></div></section>`;
  } catch (error) {
    errorView((error as Error).message);
  }
}
