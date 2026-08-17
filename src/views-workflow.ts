import { api, type User } from './api/client';
import { escape, formatDate } from './format';
import { shell } from './shell';
import { errorView } from './views';
import { leadDetailView } from './views-crm';
import type { AssignmentResultRow, AssignmentRule, LeadScoreRow, MatchedFactor, SalespersonView, SandboxRun, SandboxRunDetail, ScoringFactor, WorkflowView } from './types/index';

const factorCategories: Record<string, string> = { COMPANY_FIT: 'Company fit', INDUSTRY_FIT: 'Industry fit', DECISION_MAKER: 'Decision maker', ENGAGEMENT: 'Engagement', INTENT: 'Intent' };
const ruleFields: Record<string, string> = { employeeSize: 'Employee size', industry: 'Industry', region: 'Region', source: 'Source', stage: 'Stage', score: 'Lead score' };
const ruleOperators: Record<string, string> = { IN: 'is one of', NOT_IN: 'is not', EQUALS: 'equals', GTE: 'is ≥', LTE: 'is ≤', CONTAINS_ANY: 'contains' };
const workflowLabHelp = () => '<details class="crm-help"><summary>What is the workflow lab?</summary><p>Practise the logic sales operations teams automate: a transparent <strong>lead score</strong> from configurable factors, <strong>assignment rules</strong> you can simulate without touching shared data, a readable <strong>workflow</strong> for validation → assignment → follow-up → escalation, in-app <strong>alerts</strong>, and a <strong>sandbox</strong> where you can change factors and rules and observe the outcome on a demo copy. Everything is fictional NexaFlow training data.</p></details>';

function ruleCondition(rule: AssignmentRule): string {
  let value = rule.value;
  try { const parsed = JSON.parse(rule.value); if (Array.isArray(parsed)) value = parsed.join(' or '); } catch { /* plain value */ }
  return `${ruleFields[rule.field] || rule.field} ${ruleOperators[rule.operator] || rule.operator} ${value}`;
}
function matchedChips(matched: MatchedFactor[]) {
  return matched.length ? `<div class="factor-chips">${matched.map((factor) => `<span class="chip" title="${escape(factorCategories[factor.category] || factor.category)}">${escape(factor.label)} <b>+${factor.points}</b></span>`).join('')}</div>` : '<p class="muted">No factors matched — score is 0.</p>';
}

export function workflowLabView(user: User, tab = 'scoring') {
  const tabs = [['scoring', 'Scoring'], ['assignment', 'Assignment'], ['workflows', 'Workflows'], ['alerts', 'Alerts'], ['sandbox', 'Sandbox']].map(([key, label]) => `<button class="tab ${tab === key ? 'active' : ''}" data-wtab="${key}">${label}</button>`).join('');
  shell(user, `<section class="page-header"><div><span class="eyebrow">Sales operations</span><h1>Workflow Lab</h1><p>Practise the logic behind lead scoring, assignment and pipeline automation.</p></div></section>${workflowLabHelp()}<nav class="tabs">${tabs}</nav><div id="workflow-content"><div class="loading">Loading…</div></div>`, 'Workflow Lab');
  document.querySelectorAll('[data-wtab]').forEach((button) => button.addEventListener('click', () => workflowLabView(user, button.getAttribute('data-wtab')!)));
  if (tab === 'assignment') return assignmentView(user);
  if (tab === 'workflows') return workflowsView(user);
  if (tab === 'alerts') return alertsView(user);
  if (tab === 'sandbox') return sandboxView(user);
  return scoringView(user);
}

async function scoringView(user: User) {
  try {
    const { factors, targetIndustries, definition } = await api<{ factors: ScoringFactor[]; targetIndustries: string[]; definition: string }>('/api/scoring');
    const canManage = ['ADMIN', 'INSTRUCTOR'].includes(user.role);
    const rows = factors.map((factor) => `<tr><td>${escape(factorCategories[factor.category] || factor.category)}</td><td>${escape(factor.label)}</td><td>${factor.enabled ? `<span class="badge badge-normal">Active</span>` : `<span class="badge badge-stale">Off</span>`}</td><td>+${factor.points}</td></tr>`).join('');
    const editForm = canManage ? `<details class="lead-edit"><summary>Edit scoring model (instructors &amp; admins)</summary><form id="scoring-form"><label>Target industries (comma separated)<input name="targetIndustries" value="${escape(targetIndustries.join(', '))}"></label>${factors.map((factor) => `<div class="sandbox-row"><label class="check"><input type="checkbox" name="enabled-${factor.id}" ${factor.enabled ? 'checked' : ''}> ${escape(factor.label)}</label><input type="number" name="points-${factor.id}" min="0" max="100" value="${factor.points}" class="points-input" title="Points"></div>`).join('')}<button>Save scoring model</button></form></details>` : '';
    document.querySelector('#workflow-content')!.innerHTML = `<section class="state"><strong>Scoring model:</strong> ${escape(definition)}</section><div class="breakdown-grid"><section class="analytics-card"><h2>Scoring factors</h2><div class="table-wrap"><table class="crm-table"><thead><tr><th>Category</th><th>Factor</th><th>Status</th><th>Points</th></tr></thead><tbody>${rows}</tbody></table></div></section><section class="analytics-card"><h2>How scores add up</h2><p class="muted">A lead earns points for every factor that matches — company size, target industry, decision-maker title, recent activity and intent signals. The total (capped at 100) is the lead score you see across the CRM.</p><div class="score-example">${matchedChips([{ id: '', category: 'COMPANY_FIT', label: 'Mid-market company (201–1000 employees)', points: 20 }, { id: '', category: 'INDUSTRY_FIT', label: 'Target industry', points: 20 }, { id: '', category: 'DECISION_MAKER', label: 'Decision-maker title (VP, Director, Head, Chief)', points: 25 }])}<p class="muted">Example: a mid-market company in a target industry with a decision-maker title starts at <strong>65 points</strong> before engagement and intent are added.</p></div></section></div><section class="analytics-card"><h2>Score breakdown per open lead</h2><div class="table-wrap"><table class="crm-table"><thead><tr><th>Contact</th><th>Company</th><th>Stage</th><th>Score</th><th>What earned the points</th></tr></thead><tbody id="score-lead-rows"><tr><td colspan="5"><div class="loading">Loading leads…</div></td></tr></tbody></table></div></section>${editForm}`;
    if (canManage) {
      document.querySelector('#scoring-form')!.addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
          const data = Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement)) as Record<string, string>;
          const body = {
            targetIndustries: String(data.targetIndustries || '').split(',').map((value) => value.trim()).filter(Boolean),
            factors: factors.map((factor) => ({ id: factor.id, enabled: data[`enabled-${factor.id}`] === 'on', points: Number(data[`points-${factor.id}`] || factor.points) })),
          };
          await api('/api/scoring', { method: 'PUT', body: JSON.stringify(body) });
          scoringView(user);
        } catch (error) { alert((error as Error).message); }
      });
    }
    const { leads } = await api<{ leads: LeadScoreRow[] }>('/api/scoring/leads');
    const leadRows = leads.map((lead) => `<tr data-lead="${lead.id}" class="lead-row"><td>${escape(lead.contactName)}</td><td>${escape(lead.companyName)}</td><td>${escape(lead.stage)}</td><td><strong>${lead.score}</strong></td><td>${matchedChips(lead.matched)}</td></tr>`).join('');
    const container = document.querySelector('#score-lead-rows');
    if (container) container.innerHTML = leadRows || '<tr><td colspan="5" class="muted">No open leads.</td></tr>';
    document.querySelectorAll('[data-lead]').forEach((row) => row.addEventListener('click', () => leadDetailView(user, row.getAttribute('data-lead')!)));
  } catch (error) {
    errorView((error as Error).message);
  }
}

async function assignmentView(user: User) {
  try {
    const [{ rules, salespeople }, simulation] = await Promise.all([
      api<{ rules: AssignmentRule[]; salespeople: SalespersonView[] }>('/api/assignment'),
      api<{ results: AssignmentResultRow[]; workload: SalespersonView[]; summary: { assigned: number; unassigned: number; changed: number } }>('/api/assignment/simulate'),
    ]);
    const canManage = ['ADMIN', 'INSTRUCTOR'].includes(user.role);
    const ownerName = (id: string | null) => salespeople.find((sp) => sp.id === id)?.name || 'Unassigned';
    const ruleRows = rules.map((rule) => `<tr><td>${rule.priority}</td><td>${escape(rule.name)}</td><td>${escape(ruleCondition(rule))}</td><td>${escape(ownerName(rule.assignTo))}</td><td>${rule.enabled ? `<span class="badge badge-normal">On</span>` : `<span class="badge badge-stale">Off</span>`}</td>${canManage ? `<td><button class="secondary" data-edit-rule="${rule.id}">Edit</button> <button class="danger-link" data-delete-rule="${rule.id}">Delete</button></td>` : ''}</tr>`).join('');
    const workloadChips = simulation.workload.map((sp) => `<span class="chip">${escape(sp.name)} <b>${sp.openLeads}/${sp.capacity ?? '∞'}</b></span>`).join('');
    const simRows = simulation.results.map((row) => `<tr data-lead="${row.leadId}" class="lead-row"><td>${escape(row.contactName)}</td><td>${escape(row.companyName)}</td><td>${escape(row.currentOwnerName || 'Unassigned')}</td><td>${row.suggestedOwnerName ? `<strong>${escape(row.suggestedOwnerName)}</strong>` : '<span class="muted">Unassigned</span>'}</td><td>${escape(row.ruleName || '—')}</td><td class="muted">${escape(row.reason)}</td></tr>`).join('');
    const addRuleForm = canManage ? `<details class="lead-edit"><summary>Add assignment rule</summary><form id="add-rule-form"><label>Rule name<input name="name" placeholder="e.g. High-value accounts → senior rep" required></label><label>Priority (lower runs first)<input name="priority" type="number" min="1" value="${rules.length + 1}"></label><label>Field<select name="field">${Object.entries(ruleFields).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select></label><label>Operator<select name="operator">${Object.entries(ruleOperators).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select></label><label>Value<input name="value" placeholder="For “is one of”, comma-separated, e.g. 501-1000, 1001-5000"></label><label>Assign to<select name="assignTo">${['<option value="">Unassigned</option>', ...salespeople.map((sp) => `<option value="${sp.id}">${escape(sp.name)}</option>`)].join('')}</select></label><button>Add rule</button></form></details>` : '';
    document.querySelector('#workflow-content')!.innerHTML = `<div class="breakdown-grid"><section class="analytics-card"><h2>Assignment rules</h2><div class="table-wrap"><table class="crm-table"><thead><tr><th>#</th><th>Rule</th><th>Condition</th><th>Assigns to</th><th>Status</th>${canManage ? '<th></th>' : ''}</tr></thead><tbody>${ruleRows}</tbody></table></div></section><section class="analytics-card"><h2>Rep workload</h2><p class="muted">Open leads each rep already owns, versus capacity. Rules skip reps who are at capacity.</p><div class="workload-chips">${workloadChips}</div></section></div>${addRuleForm}<section class="analytics-card"><h2>Rule simulation — what would happen if these rules ran</h2><p class="muted">Simulated on the current open leads without changing anything. ${simulation.summary.changed} leads would change owner, ${simulation.summary.assigned} would be assigned, ${simulation.summary.unassigned} left unassigned.</p><div class="table-wrap"><table class="crm-table"><thead><tr><th>Contact</th><th>Company</th><th>Current owner</th><th>Suggested owner</th><th>Rule</th><th>Why</th></tr></thead><tbody>${simRows}</tbody></table></div>${canManage ? '<button id="apply-rules" class="secondary" style="margin-top:14px">Apply rules to CRM (reassign open leads)</button>' : ''}</section>`;
    document.querySelectorAll('[data-lead]').forEach((row) => row.addEventListener('click', () => leadDetailView(user, row.getAttribute('data-lead')!)));
    if (canManage) bindRuleManagement(user, rules, salespeople);
  } catch (error) {
    errorView((error as Error).message);
  }
}

function bindRuleManagement(user: User, rules: AssignmentRule[], salespeople: SalespersonView[]) {
  const form = document.querySelector('#add-rule-form');
  if (form) form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const data = Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement)) as Record<string, string>;
      const value = String(data.value || '').includes(',') ? String(data.value).split(',').map((part) => part.trim()).filter(Boolean) : String(data.value || '');
      await api('/api/assignment', { method: 'POST', body: JSON.stringify({ ...data, priority: Number(data.priority || 1), value, assignTo: data.assignTo || null }) });
      assignmentView(user);
    } catch (error) { alert((error as Error).message); }
  });
  const apply = document.querySelector('#apply-rules');
  if (apply) apply.addEventListener('click', async () => {
    if (!window.confirm('Reassign open leads now based on the active rules? This writes to the shared CRM demo data.')) return;
    try {
      const { applied } = await api<{ applied: number }>('/api/assignment/apply', { method: 'POST' });
      alert(`Rules applied — ${applied} lead(s) reassigned.`);
      assignmentView(user);
    } catch (error) { alert((error as Error).message); }
  });
  document.querySelectorAll('[data-delete-rule]').forEach((button) => button.addEventListener('click', async () => {
    const id = button.getAttribute('data-delete-rule')!;
    try { await api(`/api/assignment/rules/${id}`, { method: 'DELETE' }); assignmentView(user); } catch (error) { alert((error as Error).message); }
  }));
  document.querySelectorAll('[data-edit-rule]').forEach((button) => button.addEventListener('click', () => {
    const rule = rules.find((entry) => entry.id === button.getAttribute('data-edit-rule'));
    if (!rule) return;
    let value = rule.value;
    try { const parsed = JSON.parse(rule.value); if (Array.isArray(parsed)) value = parsed.join(', '); } catch { /* plain */ }
    const details = document.createElement('details');
    details.className = 'lead-edit';
    details.innerHTML = `<summary>Edit “${escape(rule.name)}”</summary><form class="rule-edit-form"><label>Rule name<input name="name" value="${escape(rule.name)}" required></label><label>Priority<input name="priority" type="number" min="1" value="${rule.priority}"></label><label>Field<select name="field">${Object.entries(ruleFields).map(([fieldValue, label]) => `<option value="${fieldValue}" ${fieldValue === rule.field ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>Operator<select name="operator">${Object.entries(ruleOperators).map(([opValue, label]) => `<option value="${opValue}" ${opValue === rule.operator ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>Value<input name="value" value="${escape(value)}"></label><label>Assign to<select name="assignTo">${['<option value="">Unassigned</option>', ...salespeople.map((sp) => `<option value="${sp.id}" ${sp.id === rule.assignTo ? 'selected' : ''}>${escape(sp.name)}</option>`)].join('')}</select></label><label class="check"><input type="checkbox" name="enabled" ${rule.enabled ? 'checked' : ''}> Enabled</label><button>Save rule</button></form></details>`;
    const existing = document.querySelector(`[data-rule-edit-host="${rule.id}"]`);
    if (existing) { existing.replaceWith(details); return; }
    button.closest('tr')!.after(details);
    details.querySelector('form')!.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const data = Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement)) as Record<string, string>;
        const nextValue = String(data.value || '').includes(',') ? String(data.value).split(',').map((part) => part.trim()).filter(Boolean) : String(data.value || '');
        await api(`/api/assignment/rules/${rule.id}`, { method: 'PUT', body: JSON.stringify({ name: data.name, priority: Number(data.priority || 1), field: data.field, operator: data.operator, value: nextValue, assignTo: data.assignTo || null, enabled: data.enabled === 'on' }) });
        assignmentView(user);
      } catch (error) { alert((error as Error).message); }
    });
  }));
}

async function workflowsView(user: User) {
  try {
    const { workflows } = await api<{ workflows: WorkflowView[] }>('/api/workflows');
    const cards = workflows.map((workflow) => `<section class="workflow-card"><h2>${escape(workflow.name)}</h2><p class="muted">${escape(workflow.description)}</p><ol class="workflow-steps">${workflow.steps.map((step) => `<li><div class="step-head"><strong>${escape(step.name)}</strong><span class="badge badge-normal">${escape(step.actor)}</span></div><p>${escape(step.description)}</p><small class="muted">Condition: ${escape(step.condition)}</small></li>`).join('')}</ol></section>`).join('');
    document.querySelector('#workflow-content')!.innerHTML = `<section class="state"><strong>How leads move through NexaFlow:</strong> validation → assignment → follow-up → escalation. Read each workflow left to right; the condition on every step is what the system checks before it can proceed.</section><div class="workflow-grid">${cards}</div>`;
  } catch (error) {
    errorView((error as Error).message);
  }
}

async function alertsView(user: User) {
  try {
    const { stale, unassigned, overdue } = await api<{ stale: Array<{ id: string; contactName: string; companyName: string; ownerName: string | null; staleBucket: string; daysSinceLastActivity: number | null }>; unassigned: Array<{ id: string; contactName: string; companyName: string; score: number }>; overdue: Array<{ id: string; contactName: string; companyName: string; nextActionAt: string | null }> }>('/api/alerts');
    const list = <T extends { id: string; contactName: string; companyName: string }>(rows: T[], extra: (row: T) => string, empty: string) => rows.length ? `<ul class="alert-list">${rows.map((row) => `<li data-lead="${row.id}">${escape(row.contactName)} — ${escape(row.companyName)} <small>${extra(row)}</small></li>`).join('')}</ul>` : `<p class="muted">${empty}</p>`;
    const staleRows = list(stale, (row) => `${escape(row.ownerName || 'Unassigned')} · no activity in ${row.daysSinceLastActivity} days`, 'No stale or at-risk leads.');
    const unassignedRows = list(unassigned, (row) => `score ${row.score} · no owner`, 'Every open lead has an owner.');
    const overdueRows = list(overdue, (row) => `next action was ${formatDate(row.nextActionAt)}`, 'No overdue next actions.');
    document.querySelector('#workflow-content')!.innerHTML = `<div class="alert-grid">${[
      ['Stale & at-risk leads', `${stale.length}`, 'Open leads with no recent activity. Follow up or escalate.', 'badge-stale', staleRows],
      ['Unassigned leads', `${unassigned.length}`, 'Open leads with no owner. Route them with the assignment rules.', 'badge-attention', unassignedRows],
      ['Overdue next actions', `${overdue.length}`, 'Promised follow-ups that have passed their next action date.', 'badge-at_risk', overdueRows],
    ].map(([title, count, tip, badge, rows]) => `<section class="alert-card"><div class="alert-head"><h2>${escape(String(title))}</h2><span class="badge ${badge}">${count}</span></div><p class="muted">${escape(String(tip))}</p>${rows}</section>`).join('')}</div>`;
    document.querySelectorAll('[data-lead]').forEach((row) => row.addEventListener('click', () => leadDetailView(user, row.getAttribute('data-lead')!)));
  } catch (error) {
    errorView((error as Error).message);
  }
}

async function sandboxView(user: User) {
  try {
    const { runs } = await api<{ runs: SandboxRun[] }>('/api/sandbox/runs');
    const canManage = ['ADMIN', 'INSTRUCTOR'].includes(user.role);
    const runRows = runs.length ? `<div class="table-wrap"><table class="crm-table"><thead><tr><th>Experiment</th>${canManage ? '<th>Creator</th>' : ''}<th>Date</th><th>Score up</th><th>Score down</th><th>Reassigned</th></tr></thead><tbody>${runs.map((run) => `<tr data-sandbox="${run.id}" class="lead-row"><td>${escape(run.name)}</td>${canManage ? `<td>${escape(run.creatorName)}</td>` : ''}<td>${formatDate(run.createdAt)}</td><td>+${run.summary.scoreUp}</td><td>-${run.summary.scoreDown}</td><td>${run.summary.reassigned}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No sandbox experiments yet.</p>';
    document.querySelector('#workflow-content')!.innerHTML = `<section class="state"><strong>Safe sandbox:</strong> change the scoring factors or assignment rules below and run an experiment. The outcome is computed on a demo copy of the CRM — your changes never touch the shared lead data.</section><section class="analytics-card"><h2>Run a new experiment</h2><form id="sandbox-form" class="sandbox-form"><label>Experiment name<input name="name" placeholder="e.g. What if we weight decision makers higher?" required></label><h3>Scoring factors (override points or switch off)</h3><div class="sandbox-factors"></div><h3>Assignment rules (switch off or re-route)</h3><div class="sandbox-rules"></div><button>Run experiment</button></form></section><section class="analytics-card"><h2>Past experiments</h2>${runRows}</section>`;
    const [config, salespeople, rulesData] = await Promise.all([
      api<{ factors: ScoringFactor[] }>('/api/scoring'),
      api<{ salespeople: SalespersonView[] }>('/api/assignment'),
      api<{ rules: AssignmentRule[] }>('/api/assignment'),
    ]);
    const rules = rulesData.rules;
    document.querySelector('.sandbox-factors')!.innerHTML = config.factors.map((factor) => `<div class="sandbox-row"><label class="check"><input type="checkbox" name="factor-${factor.id}" ${factor.enabled ? 'checked' : ''}> ${escape(factor.label)}</label><input type="number" name="points-${factor.id}" min="0" max="100" value="${factor.points}" class="points-input" title="Points"></div>`).join('');
    document.querySelector('.sandbox-rules')!.innerHTML = rules.map((rule) => `<div class="sandbox-row"><label class="check"><input type="checkbox" name="rule-${rule.id}" ${rule.enabled ? 'checked' : ''}> ${escape(rule.name)} <small>(${escape(ruleCondition(rule))})</small></label><select name="assign-${rule.id}">${['<option value="">Unassigned</option>', ...salespeople.salespeople.map((sp) => `<option value="${sp.id}" ${sp.id === rule.assignTo ? 'selected' : ''}>${escape(sp.name)}</option>`)].join('')}</select></div>`).join('');
    document.querySelector('#sandbox-form')!.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const data = Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement)) as Record<string, string>;
        const body = {
          name: data.name,
          factors: config.factors.map((factor) => ({ id: factor.id, enabled: data[`factor-${factor.id}`] === 'on', points: Number(data[`points-${factor.id}`] || factor.points) })),
          rules: rules.map((rule) => ({ id: rule.id, enabled: data[`rule-${rule.id}`] === 'on', assignTo: data[`assign-${rule.id}`] || null })),
        };
        const { run } = await api<{ run: SandboxRun }>('/api/sandbox/runs', { method: 'POST', body: JSON.stringify(body) });
        sandboxResultView(user, run.id);
      } catch (error) { alert((error as Error).message); }
    });
    document.querySelectorAll('[data-sandbox]').forEach((row) => row.addEventListener('click', () => sandboxResultView(user, row.getAttribute('data-sandbox')!)));
  } catch (error) {
    errorView((error as Error).message);
  }
}

async function sandboxResultView(user: User, runId: string) {
  try {
    const { run } = await api<{ run: SandboxRunDetail }>(`/api/sandbox/runs/${runId}`);
    const rows = run.results.results.map((row) => `<tr data-lead="${row.id}" class="lead-row"><td>${escape(row.contactName)}</td><td>${escape(row.companyName)}</td><td>${row.baseScore}</td><td class="${row.newScore > row.baseScore ? 'diff-up' : row.newScore < row.baseScore ? 'diff-down' : ''}"><strong>${row.newScore}</strong>${row.newScore !== row.baseScore ? ` <small>(${row.newScore > row.baseScore ? '+' : ''}${row.newScore - row.baseScore})</small>` : ''}</td><td>${escape(row.baseOwnerName || 'Unassigned')}</td><td class="${row.newOwnerName && row.newOwnerName !== row.baseOwnerName ? 'diff-up' : ''}">${escape(row.newOwnerName || 'Unassigned')}</td><td>${escape(row.ruleName || '—')}</td></tr>`).join('');
    document.querySelector('#workflow-content')!.innerHTML = `<button id="sandbox-back" class="secondary">← Back to sandbox</button><section class="analytics-card"><span class="eyebrow">Experiment</span><h1>${escape(run.name)}</h1><p class="muted">${formatDate(run.createdAt)} · ${run.results.summary.scoreUp} leads scored higher, ${run.results.summary.scoreDown} lower, ${run.results.summary.reassigned} would change owner. This ran on a demo copy — no shared data changed.</p><div class="table-wrap"><table class="crm-table"><thead><tr><th>Contact</th><th>Company</th><th>Base score</th><th>New score</th><th>Base owner</th><th>New owner</th><th>Rule</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
    document.querySelector('#sandbox-back')!.addEventListener('click', () => sandboxView(user));
    document.querySelectorAll('[data-lead]').forEach((row) => row.addEventListener('click', () => leadDetailView(user, row.getAttribute('data-lead')!)));
  } catch (error) {
    errorView((error as Error).message);
  }
}
