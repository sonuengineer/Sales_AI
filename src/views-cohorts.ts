import { api, type User } from './api/client';
import { escape, formatDate } from './format';
import { shell } from './shell';
import { errorView } from './views';
import type { CohortDetail, CohortSummary, EnrollmentView, UserRow } from './types/index';

const cohortStatusLabels: Record<string, string> = { upcoming: 'Upcoming', active: 'Active', completed: 'Completed', cancelled: 'Cancelled' };
const cohortStatusBadges: Record<string, string> = { upcoming: 'badge-normal', active: 'badge-attention', completed: 'badge-stale', cancelled: 'badge-at_risk' };
const enrollmentStatusLabels: Record<string, string> = { active: 'Active', completed: 'Completed', dropped: 'Dropped', pending: 'Pending' };
const cohortHelp = () => '<details class="crm-help"><summary>How cohorts work</summary><p>A cohort groups students into one course delivery with start and end dates and an instructor. Enroll students to give them access, and update their status as they progress. Certificates are issued per enrollment once the completion criteria are met.</p></details>';

export function cohortsView(user: User) {
  shell(user, `<section class="page-header"><div><span class="eyebrow">Course delivery</span><h1>Cohorts</h1><p>Organise students into cohorts and manage their enrollment.</p></div><button id="new-cohort">New cohort</button></section>${cohortHelp()}<div id="cohorts-content"><div class="loading">Loading…</div></div>`, 'Cohorts');
  cohortsList(user);
}

async function cohortsList(user: User) {
  try {
    const { cohorts } = await api<{ cohorts: CohortSummary[] }>('/api/cohorts');
    const rows = cohorts.cohorts.map((cohort) => `<tr data-cohort="${cohort.id}" class="lead-row"><td>${escape(cohort.name)}</td><td><span class="badge ${cohortStatusBadges[cohort.status] || 'badge-normal'}">${cohortStatusLabels[cohort.status] || cohort.status}</span></td><td>${escape(cohort.instructorName || 'Unassigned')}</td><td>${cohort.studentCount}</td><td>${formatDate(cohort.startDate)} → ${formatDate(cohort.endDate)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No cohorts yet. Create one to get started.</td></tr>';
    document.querySelector('#cohorts-content')!.innerHTML = `<section class="analytics-card"><h2>All cohorts</h2><div class="table-wrap"><table class="crm-table"><thead><tr><th>Cohort</th><th>Status</th><th>Instructor</th><th>Students</th><th>Dates</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
    document.querySelectorAll('[data-cohort]').forEach((row) => row.addEventListener('click', () => cohortDetailView(user, row.getAttribute('data-cohort')!)));
    document.querySelector('#new-cohort')!.addEventListener('click', () => cohortFormView(user));
  } catch (error) {
    errorView((error as Error).message);
  }
}

async function cohortFormView(user: User, existing?: CohortDetail) {
  try {
    const { users } = await api<{ users: UserRow[] }>('/api/users');
    const instructors = users.filter((entry) => entry.role !== 'STUDENT');
    const instructorOptions = instructors.map((entry) => `<option value="${entry.id}" ${existing?.instructorId === entry.id ? 'selected' : ''}>${escape(entry.name)}</option>`).join('');
    shell(user, `<button id="back" class="secondary">← Back to cohorts</button><article class="editor"><span class="eyebrow">${existing ? 'Edit cohort' : 'New cohort'}</span><h1>${existing ? 'Edit cohort' : 'Create a cohort'}</h1><form id="cohort-form"><label>Name<input name="name" value="${escape(existing?.name || '')}" required></label><label>Instructor<select name="instructorId"><option value="">Unassigned</option>${instructorOptions}</select></label><label>Start date<input name="startDate" type="date" value="${existing?.startDate || ''}"></label><label>End date<input name="endDate" type="date" value="${existing?.endDate || ''}"></label><label>Status<select name="status"><option value="upcoming" ${existing?.status === 'upcoming' ? 'selected' : ''}>Upcoming</option><option value="active" ${existing?.status === 'active' ? 'selected' : ''}>Active</option><option value="completed" ${existing?.status === 'completed' ? 'selected' : ''}>Completed</option><option value="cancelled" ${existing?.status === 'cancelled' ? 'selected' : ''}>Cancelled</option></select></label><button>${existing ? 'Save cohort' : 'Create cohort'}</button></form></article>`, 'Cohorts');
    document.querySelector('#back')!.addEventListener('click', () => cohortsView(user));
    document.querySelector('#cohort-form')!.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const data = Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement)) as Record<string, string>;
        if (existing) await api(`/api/cohorts/${existing.id}`, { method: 'PUT', body: JSON.stringify({ name: data.name, instructorId: data.instructorId || undefined, startDate: data.startDate || null, endDate: data.endDate || null, status: data.status }) });
        else await api('/api/cohorts', { method: 'POST', body: JSON.stringify(data) });
        cohortsView(user);
      } catch (error) { alert((error as Error).message); }
    });
  } catch (error) {
    errorView((error as Error).message);
  }
}

async function cohortDetailView(user: User, cohortId: string) {
  try {
    const [detail, { users }] = await Promise.all([
      api<CohortDetail>(`/api/cohorts/${cohortId}`),
      api<{ users: UserRow[] }>('/api/users'),
    ]);
    const students = users.filter((entry) => entry.role === 'STUDENT');
    const enrolled = new Set(detail.enrollments.map((enrollment) => enrollment.studentId));
    const studentOptions = students.filter((entry) => !enrolled.has(entry.id)).map((entry) => `<option value="${entry.id}">${escape(entry.name)} (${escape(entry.email)})</option>`).join('');
    const rows = detail.enrollments.map((enrollment: EnrollmentView) => `<tr><td>${escape(enrollment.studentName)}</td><td>${escape(enrollment.studentEmail)}</td><td>${enrollment.progressPercent}%</td><td><select class="status-select" data-enrollment="${enrollment.id}">${Object.entries(enrollmentStatusLabels).map(([value, label]) => `<option value="${value}" ${enrollment.status === value ? 'selected' : ''}>${label}</option>`).join('')}</select></td><td><button class="danger-link" data-remove-enrollment="${enrollment.id}">Remove</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">No students enrolled yet.</td></tr>';
    shell(user, `<button id="back" class="secondary">← Back to cohorts</button><article class="lesson-detail"><span class="eyebrow">Cohort · ${formatDate(detail.startDate)} → ${formatDate(detail.endDate)}</span><h1>${escape(detail.name)}</h1><span class="badge ${cohortStatusBadges[detail.status] || 'badge-normal'}">${cohortStatusLabels[detail.status] || detail.status}</span><p class="muted">Instructor: ${escape(detail.instructorName || 'Unassigned')}</p><div style="margin-top:14px"><button id="edit-cohort" class="secondary">Edit cohort</button></div><h2>Enrolled students</h2><div class="table-wrap"><table class="crm-table"><thead><tr><th>Student</th><th>Email</th><th>Progress</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>${studentOptions ? `<h2>Enroll a student</h2><form id="enroll-form" class="editor"><label>Student<select name="studentId" required><option value="">Choose a student…</option>${studentOptions}</select></label><label>Status<select name="status"><option value="active">Active</option><option value="pending">Pending</option></select></label><button>Enroll student</button></form>` : '<p class="muted">All students are already enrolled.</p>'}</article>`, 'Cohorts');
    document.querySelector('#back')!.addEventListener('click', () => cohortsView(user));
    const editCohort = document.querySelector('#edit-cohort');
    if (editCohort) editCohort.addEventListener('click', () => cohortFormView(user, detail));
    const enrollForm = document.querySelector('#enroll-form');
    if (enrollForm) enrollForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const data = Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement)) as Record<string, string>;
        await api(`/api/cohorts/${cohortId}/enrollments`, { method: 'POST', body: JSON.stringify({ studentId: data.studentId, status: data.status }) });
        cohortDetailView(user, cohortId);
      } catch (error) { alert((error as Error).message); }
    });
    document.querySelectorAll('.status-select').forEach((select) => select.addEventListener('change', async () => {
      try {
        await api(`/api/cohorts/${cohortId}/enrollments/${(select as HTMLSelectElement).getAttribute('data-enrollment')}`, { method: 'PUT', body: JSON.stringify({ status: (select as HTMLSelectElement).value }) });
        cohortDetailView(user, cohortId);
      } catch (error) { alert((error as Error).message); }
    }));
    document.querySelectorAll('[data-remove-enrollment]').forEach((button) => button.addEventListener('click', async () => {
      if (!window.confirm('Remove this student from the cohort?')) return;
      try {
        await api(`/api/cohorts/${cohortId}/enrollments/${button.getAttribute('data-remove-enrollment')}`, { method: 'DELETE' });
        cohortDetailView(user, cohortId);
      } catch (error) { alert((error as Error).message); }
    }));
  } catch (error) {
    errorView((error as Error).message);
  }
}
