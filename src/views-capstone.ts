import { api, type User } from './api/client';
import { escape, formatDate } from './format';
import { navigate, shell } from './shell';
import { errorView } from './views';
import { lessonView, renderLessonContent } from './views-course';
import type { CapstoneItem, CapstonePortfolio, CapstoneReviewDetail, CapstoneReviewRow, CapstoneWorkspace } from './types/index';

const capstoneHelp = () => '<details class="crm-help"><summary>How the capstone works</summary><p>This is the final portfolio project: build a complete sales intelligence system for the fictional NexaFlow company across ten deliverables. Submit each deliverable as text or a link. Once all ten are submitted, request final review — an instructor grades every deliverable and then approves the capstone or returns it for revision. An approved capstone produces your portfolio-ready summary. All data is fictional training data.</p></details>';
const statusLabels: Record<string, string> = { in_progress: 'In progress', submitted: 'Awaiting review', approved: 'Approved', returned: 'Needs revision' };
const statusBadges: Record<string, string> = { in_progress: 'badge-normal', submitted: 'badge-attention', approved: 'badge-stale', returned: 'badge-at_risk' };
const itemStatus: Record<string, string> = { pending: 'Not started', submitted: 'Submitted', graded: 'Graded', returned: 'Needs revision' };
const itemBadges: Record<string, string> = { pending: 'badge-normal', submitted: 'badge-attention', graded: 'badge-stale', returned: 'badge-at_risk' };
function itemState(item: CapstoneItem) {
  if (!item.submission) return 'pending';
  return item.submission.status;
}

export function capstoneView(user: User) {
  shell(user, `<section class="page-header"><div><span class="eyebrow">Final portfolio project</span><h1>Capstone workspace</h1><p>Build the complete AI-Powered Sales Intelligence &amp; CRM Operations Platform, one deliverable at a time.</p></div></section>${capstoneHelp()}<div id="capstone-content"><div class="loading">Loading…</div></div>`, 'Capstone');
  capstoneWorkspace(user);
}

async function capstoneWorkspace(user: User) {
  try {
    const { capstone, deliverables, progress, portfolio } = await api<CapstoneWorkspace>('/api/capstone');
    const badges = [['Deliverables submitted', `${progress.submitted}/${progress.total}`, 'badge-normal'], ['Graded', `${progress.graded}/${progress.total}`, 'badge-stale'], ['Status', statusLabels[capstone.status] || capstone.status, statusBadges[capstone.status] || 'badge-normal']].map(([label, value, badge]) => `<span class="chip">${escape(String(label))} <b>${escape(String(value))}</b></span>`).join('');
    const submitButton = progress.canSubmit && !['submitted', 'approved'].includes(capstone.status) ? '<button id="submit-capstone" style="margin-top:12px">Request final review</button>' : '';
    const portfolioHtml = portfolio ? renderPortfolio(portfolio) : '';
    const cards = deliverables.map((item) => {
      const state = itemState(item);
      const links = item.relatedLinks.length ? `<div class="deliverable-links">${item.relatedLinks.map((link) => `<button class="secondary small-btn" data-link-target="${escape(link.target)}">${escape(link.label)}</button>`).join('')}</div>` : '';
      const lessonHint = item.lesson ? `<p class="muted" style="margin:6px 0 0;font-size:.82rem">📎 Supporting lesson: ${escape(item.lesson.title)} — worked example + ${item.lesson.files.length} starter file(s)</p>` : '';
      const instructorHint = item.instructorFiles.length ? `<p class="muted" style="margin:2px 0 0;font-size:.82rem">➕ ${item.instructorFiles.length} instructor example file(s) available</p>` : '';
      return `<article class="capstone-card" data-deliverable="${item.id}"><div class="capstone-card-head"><span class="deliverable-number">${String(item.position).padStart(2, '0')}</span><span class="badge ${itemBadges[state]}">${itemStatus[state]}</span></div><h2>${escape(item.title)}</h2><p>${escape(item.summary)}</p><div class="capstone-meta"><span>Due ${formatDate(item.deadline)}</span>${item.submission?.score !== null && item.submission?.score !== undefined ? `<span>Score ${item.submission.score}</span>` : ''}</div>${lessonHint}${instructorHint}${links}<button class="secondary small-btn" data-open-deliverable="${item.id}">Open deliverable</button></article>`;
    }).join('');
    document.querySelector('#capstone-content')!.innerHTML = `<section class="state"><strong>Capstone progress: ${progress.submitted}/${progress.total} submitted · ${progress.graded} graded</strong><p>Every deliverable must be submitted before you can request final review. After review, fix anything returned and resubmit.</p><div class="workload-chips">${badges}</div>${submitButton}</section>${portfolioHtml}<section class="analytics-card"><h2>The ten deliverables</h2><div class="capstone-grid">${cards}</div></section>`;
    const submitButtonEl = document.querySelector('#submit-capstone');
    if (submitButtonEl) submitButtonEl.addEventListener('click', async () => {
      try { await api('/api/capstone/submit', { method: 'POST' }); capstoneWorkspace(user); } catch (error) { alert((error as Error).message); }
    });
    document.querySelectorAll('[data-open-deliverable]').forEach((button) => button.addEventListener('click', () => capstoneDeliverableView(user, button.getAttribute('data-open-deliverable')!)));
    document.querySelectorAll('[data-deliverable]').forEach((card) => card.addEventListener('click', (event) => {
      if ((event.target as HTMLElement).closest('button')) return;
      capstoneDeliverableView(user, card.getAttribute('data-deliverable')!);
    }));
    bindRelatedLinks(user);
  } catch (error) {
    errorView((error as Error).message);
  }
}

function renderPortfolio(portfolio: CapstonePortfolio) {
  const rows = portfolio.deliverables.map((item) => `<tr><td>${String(item.position).padStart(2, '0')}. ${escape(item.title)}</td><td>${item.score !== null && item.score !== undefined ? `${item.score}%` : '—'}</td></tr>`).join('');
  return `<section class="state portfolio"><strong>🎉 Capstone approved — portfolio-ready summary</strong><p>${escape(portfolio.feedback) || 'Final feedback was not recorded.'}</p><p class="muted">Completed ${formatDate(portfolio.completedAt)} · Final score <b>${portfolio.finalScore}%</b></p><div class="table-wrap"><table class="crm-table"><thead><tr><th>Deliverable</th><th>Score</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

async function capstoneDeliverableView(user: User, deliverableId: string) {
  try {
    const { capstone, deliverables } = await api<CapstoneWorkspace>('/api/capstone');
    const item = deliverables.find((entry) => entry.id === deliverableId);
    if (!item) return errorView('Deliverable not found.');
    const state = itemState(item);
    const submitted = !!item.submission;
    const canSubmit = !['submitted', 'graded'].includes(state) && capstone.status !== 'approved';
    const form = canSubmit ? `<h2>Submit this deliverable</h2><form id="deliverable-form" class="editor"><label>Your work (text)<textarea name="body" rows="8" placeholder="Summarise your deliverable, embed key findings, or describe what you built…">${escape(item.submission?.body || '')}</textarea></label><label>Link (optional)<input name="links" value="${escape(item.submission?.links || '')}" placeholder="https://…"></label><button>${submitted ? 'Resubmit after revision' : 'Submit deliverable'}</button></form>` : '';
    const stateNote = state === 'submitted' ? '<p class="muted">This deliverable is awaiting review by your instructor.</p>' : state === 'graded' ? `<p class="muted">Graded ${item.submission?.score !== null && item.submission?.score !== undefined ? `${item.submission.score}%` : ''} — ${escape(item.submission?.feedback || 'no feedback recorded')}</p>` : state === 'returned' ? '<p class="muted">This deliverable was returned for revision — review the feedback and resubmit.</p>' : '';
    const links = item.relatedLinks.length ? `<h2>Related tools</h2><div class="deliverable-links">${item.relatedLinks.map((link) => `<button class="secondary" data-link-target="${escape(link.target)}">${escape(link.label)}</button>`).join('')}</div>` : '';
    const lessonSection = item.lesson ? `<h2>Supporting lesson &amp; starter files</h2><p>Open <button class="secondary small-btn" data-open-lesson="${item.lesson.id}">${escape(item.lesson.title)}</button> in the course to study the full lesson, then use the worked example below and the downloadable files to build this deliverable.</p>${item.lesson.workedExample ? renderLessonContent(item.lesson.workedExample) : ''}${item.lesson.files.length ? `<div class="starter-files"><h2>Starter files</h2><ul>${item.lesson.files.map((file) => `<li><a href="/api/lesson-files/${encodeURIComponent(file.id)}" download><strong>${escape(file.name)}</strong></a><span class="file-desc">${escape(file.label)}${file.description ? ` — ${escape(file.description)}` : ''}</span></li>`).join('')}</ul></div>` : ''}` : '';
    const instructorSection = item.instructorFiles.length ? `<div class="starter-files"><h2>Instructor example files</h2><p class="muted">Example work attached by your instructor — use it as a reference for what good looks like.</p><ul>${item.instructorFiles.map((file) => `<li><a href="/api/capstone-files/${encodeURIComponent(file.id)}" download><strong>${escape(file.name)}</strong></a><span class="file-desc">${escape(file.label)}${file.description ? ` — ${escape(file.description)}` : ''}</span></li>`).join('')}</ul></div>` : '';
    shell(user, `<button id="back" class="secondary">← Back to capstone</button><article class="lesson-detail"><span class="eyebrow">Deliverable ${item.position} of 10 · Due ${formatDate(item.deadline)}</span><h1>${escape(item.title)}</h1><span class="badge ${itemBadges[state]}">${itemStatus[state]}</span>${stateNote}<h2>Instructions</h2><p>${escape(item.summary)}</p><h2>Rubric</h2><p class="muted">${escape(item.rubric)}</p>${links}${lessonSection}${instructorSection}${form}</article>`, 'Capstone');
    document.querySelector('#back')!.addEventListener('click', () => capstoneView(user));
    bindRelatedLinks(user);
    document.querySelectorAll('[data-open-lesson]').forEach((button) => button.addEventListener('click', () => lessonView(user, button.getAttribute('data-open-lesson')!)));
    const formEl = document.querySelector('#deliverable-form');
    if (formEl) formEl.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const data = Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement)) as Record<string, string>;
        await api(`/api/capstone/deliverables/${item.id}/submissions`, { method: 'POST', body: JSON.stringify({ body: data.body, links: data.links }) });
        capstoneDeliverableView(user, item.id);
      } catch (error) { alert((error as Error).message); }
    });
  } catch (error) {
    errorView((error as Error).message);
  }
}

function bindRelatedLinks(user: User) {
  document.querySelectorAll('[data-link-target]').forEach((button) => button.addEventListener('click', () => navigate(user, button.getAttribute('data-link-target')!)));
}

export function capstonesReviewView(user: User) {
  shell(user, `<section class="page-header"><div><span class="eyebrow">Capstone reviews</span><h1>Capstone review queue</h1><p>Assess every deliverable against its rubric, then approve the capstone or return it for revision.</p></div><button id="manage-files" class="secondary">Manage example files for the cohort</button></section><div id="capstone-review-content"><div class="loading">Loading…</div></div>`, 'Capstones');
  document.querySelector('#manage-files')!.addEventListener('click', () => capstoneFilesManageView(user));
  capstoneReviewQueue(user);
}

function capstoneFilesManageView(user: User) {
  shell(user, `<button id="back" class="secondary">← Back to review queue</button><article class="lesson-detail"><span class="eyebrow">Cohort-wide</span><h1>Example files for the capstone deliverables</h1><p>Attach your own example files to any deliverable — every student sees them on the deliverable page as a reference for what good looks like. Files are stored as text (paste CSV, Markdown, HTML or JSON content).</p><div id="files-manage-content"><div class="loading">Loading…</div></div></article>`, 'Capstones');
  document.querySelector('#back')!.addEventListener('click', () => capstonesReviewView(user));
  loadFilesManage(user);
}

async function loadFilesManage(user: User) {
  try {
    const { deliverables } = await api<CapstoneWorkspace>('/api/capstone');
    const rows = deliverables.map((item) => {
      const existing = item.instructorFiles.length ? `<ul style="margin:8px 0 0">${item.instructorFiles.map((file) => `<li style="display:flex;align-items:center;gap:10px">${escape(file.name)} — <span class="muted">${escape(file.label)}</span><button class="danger-link" data-remove-file="${item.id}:${file.id}">Remove</button></li>`).join('')}</ul>` : '<p class="muted">No example files attached yet.</p>';
      return `<div class="review-deliverable"><strong>${String(item.position).padStart(2, '0')}. ${escape(item.title)}</strong>${existing}<details class="crm-help"><summary>Add example file</summary><form class="inline-form" data-add-file="${item.id}"><label>File name<input name="name" required placeholder="example-answer.csv"></label><label>Label<input name="label" required placeholder="Example answer"></label><label>Description<input name="description" placeholder="What this example shows"></label><label>Type<select name="contentType"><option value="text/markdown">Markdown</option><option value="text/csv">CSV</option><option value="text/plain">Plain text</option><option value="text/html">HTML</option><option value="application/json">JSON</option></select></label><label style="flex-basis:100%">Content<textarea name="content" rows="5" placeholder="Paste the file content…"></textarea></label><button>Add file</button></form></details></div>`;
    }).join('');
    document.querySelector('#files-manage-content')!.innerHTML = rows;
    document.querySelectorAll('[data-add-file]').forEach((form) => form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const deliverableId = (event.currentTarget as HTMLFormElement).getAttribute('data-add-file')!;
      const data = Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement)) as Record<string, string>;
      const item = deliverables.find((entry) => entry.id === deliverableId)!;
      try {
        await api(`/api/capstone/deliverables/${deliverableId}/files`, { method: 'PUT', body: JSON.stringify({ files: [...item.instructorFiles, { name: data.name, label: data.label, description: data.description, contentType: data.contentType, content: data.content }] }) });
        capstoneFilesManageView(user);
      } catch (error) { alert((error as Error).message); }
    }));
    document.querySelectorAll('[data-remove-file]').forEach((button) => button.addEventListener('click', async () => {
      const [deliverableId, fileId] = button.getAttribute('data-remove-file')!.split(':');
      const item = deliverables.find((entry) => entry.id === deliverableId)!;
      try {
        await api(`/api/capstone/deliverables/${deliverableId}/files`, { method: 'PUT', body: JSON.stringify({ files: item.instructorFiles.filter((file) => file.id !== fileId) }) });
        capstoneFilesManageView(user);
      } catch (error) { alert((error as Error).message); }
    }));
  } catch (error) {
    errorView((error as Error).message);
  }
}

async function capstoneReviewQueue(user: User) {
  try {
    const { capstones } = await api<{ capstones: CapstoneReviewRow[] }>('/api/capstone/review');
    const rows = capstones.map((row) => `<tr data-capstone-review="${row.id}" class="lead-row"><td>${escape(row.studentName)}</td><td><span class="badge ${statusBadges[row.status]}">${statusLabels[row.status] || row.status}</span></td><td>${row.submitted}/${row.total} submitted</td><td>${row.graded}/${row.total} graded</td><td>${row.finalScore !== null && row.finalScore !== undefined ? `${row.finalScore}%` : '—'}</td><td>${formatDate(row.reviewedAt || row.submittedAt)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">No capstones yet.</td></tr>';
    document.querySelector('#capstone-review-content')!.innerHTML = `<section class="analytics-card"><h2>Capstones</h2><div class="table-wrap"><table class="crm-table"><thead><tr><th>Student</th><th>Status</th><th>Submissions</th><th>Graded</th><th>Final score</th><th>Last activity</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
    document.querySelectorAll('[data-capstone-review]').forEach((row) => row.addEventListener('click', () => capstoneReviewDetailView(user, row.getAttribute('data-capstone-review')!)));
  } catch (error) {
    errorView((error as Error).message);
  }
}

async function capstoneReviewDetailView(user: User, capstoneId: string) {
  try {
    const detail = await api<CapstoneReviewDetail>(`/api/capstone/review/${capstoneId}`);
    const items = detail.deliverables.map((item) => {
      const submission = item.submission;
      const lessonBlock = item.lesson ? `<details class="crm-help review-lesson"><summary>Supporting lesson &amp; starter files — ${escape(item.lesson.title)}</summary><p class="muted">${item.lesson.modulePosition ? `Module ${item.lesson.modulePosition}${item.lesson.moduleTitle ? ` — ${escape(item.lesson.moduleTitle)}` : ''}. ` : ''}Grade against the worked example and download the same files the student used.</p>${item.lesson.workedExample ? renderLessonContent(item.lesson.workedExample) : ''}${item.lesson.files.length ? `<div class="starter-files"><h2>Starter files</h2><ul>${item.lesson.files.map((file) => `<li><a href="/api/lesson-files/${encodeURIComponent(file.id)}" download><strong>${escape(file.name)}</strong></a><span class="file-desc">${escape(file.label)}</span></li>`).join('')}</ul></div>` : ''}</details>` : '';
      if (!submission) return `<div class="review-deliverable"><strong>${String(item.position).padStart(2, '0')}. ${escape(item.title)}</strong><p class="muted">No submission yet.</p>${lessonBlock}</div>`;
      const gradeForm = `<form class="grade-form" data-grade-deliverable="${item.id}"><input name="score" type="number" min="0" max="100" value="${submission.score ?? ''}" placeholder="Score"><input name="feedback" value="${escape(submission.feedback)}" placeholder="Feedback"><select name="status"><option value="graded" ${submission.status === 'graded' ? 'selected' : ''}>Graded</option><option value="returned" ${submission.status === 'returned' ? 'selected' : ''}>Return for revision</option></select><button>Save grade</button></form>`;
      return `<div class="review-deliverable"><strong>${String(item.position).padStart(2, '0')}. ${escape(item.title)}</strong><span class="badge ${itemBadges[submission.status]}">${itemStatus[submission.status]}</span>${submission.score !== null && submission.score !== undefined ? `<p class="muted">Current score: ${submission.score}%</p>` : ''}<p>${escape(submission.body || '')}${submission.links ? ` <a href="${escape(submission.links)}" target="_blank" rel="noreferrer">link</a>` : ''}</p>${gradeForm}${lessonBlock}</div>`;
    }).join('');
    shell(user, `<button id="back" class="secondary">← Back to review queue</button><article class="lesson-detail"><span class="eyebrow">Capstone review</span><h1>${escape(detail.studentName)}</h1><span class="badge ${statusBadges[detail.capstone.status]}">${statusLabels[detail.capstone.status] || detail.capstone.status}</span><h2>Deliverables</h2>${items}<h2>Final decision</h2><p class="muted">Grade every deliverable before approving — the final score is the average of all deliverable scores.</p><form id="final-decision" class="editor"><label>Final feedback<textarea name="feedback" rows="3" placeholder="Summary of strengths and next steps…">${escape(detail.capstone.finalFeedback)}</textarea></label><div style="display:flex;gap:10px;margin-top:14px"><button data-decision="approved">Approve capstone</button><button type="button" data-decision="returned" class="secondary">Return for revision</button></div></form></article>`, 'Capstones');
    document.querySelector('#back')!.addEventListener('click', () => capstonesReviewView(user));
    document.querySelectorAll('[data-grade-deliverable]').forEach((form) => form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const deliverableId = (event.currentTarget as HTMLFormElement).getAttribute('data-grade-deliverable')!;
      try {
        const data = Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement)) as Record<string, string>;
        await api(`/api/capstone/review/${capstoneId}/deliverables/${deliverableId}`, { method: 'PUT', body: JSON.stringify({ score: Number(data.score || 0), feedback: data.feedback, status: data.status }) });
        capstoneReviewDetailView(user, capstoneId);
      } catch (error) { alert((error as Error).message); }
    }));
    document.querySelector('#final-decision')!.addEventListener('submit', async (event) => {
      event.preventDefault();
      const decision = (event.submitter as HTMLButtonElement).getAttribute('data-decision') || 'approved';
      try {
        const data = Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement)) as Record<string, string>;
        await api(`/api/capstone/review/${capstoneId}`, { method: 'PUT', body: JSON.stringify({ decision, feedback: data.feedback }) });
        capstonesReviewView(user);
      } catch (error) { alert((error as Error).message); }
    });
  } catch (error) {
    errorView((error as Error).message);
  }
}
