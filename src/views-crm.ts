import { api, type User } from './api/client';
import { escape, formatDate, formatMoney, staleLabels, CRM_STAGES } from './format';
import { shell } from './shell';
import { errorView } from './views';
import type { ActivityEntry, CompanyView, LeadView, MatchedFactor, OpportunityView, StageHistoryEntry } from './types/index';

interface LeadFilters { search?: string; industry?: string; source?: string; owner?: string; stage?: string; stale?: string; page?: number; }

const crmHelp = () => `<details class="crm-help"><summary>How to use this training CRM</summary><p>All records here are fictional NexaFlow demo data and reset whenever the server restarts. A <strong>lead</strong> is a potential customer; <strong>MQL</strong> and <strong>SQL</strong> are marketing- and sales-qualified leads; an <strong>opportunity</strong> is a qualified deal in progress; <strong>proposal</strong> means pricing has been shared; <strong>closed won/lost</strong> is the outcome. A lead is <strong>stale</strong> when it has had no activity for several days. Add activities and move leads through stages to practise the lifecycle.</p></details>`;
function selectField(name: string, label: string, options: { value: string; label: string }[], selected = '') {
  return `<label>${label}<select name="${name}"><option value="">All</option>${options.map((option) => `<option value="${escape(option.value)}" ${option.value === selected ? 'selected' : ''}>${escape(option.label)}</option>`).join('')}</select></label>`;
}
function crmPager(total: number, page: number, pageSize: number) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return pages > 1 ? `<div class="pager">${Array.from({ length: pages }, (_, index) => `<button class="page-btn ${index + 1 === page ? 'active' : ''}" data-page="${index + 1}">${index + 1}</button>`).join('')}</div>` : '';
}

export function crmView(user: User, tab = 'leads', params: LeadFilters = {}) {
  const tabs = [['leads', 'Leads'], ['companies', 'Companies'], ['opportunities', 'Opportunities']].map(([key, label]) => `<button class="tab ${tab === key ? 'active' : ''}" data-tab="${key}">${label}</button>`).join('');
  shell(user, `<section class="page-header"><div><span class="eyebrow">Training CRM</span><h1>CRM Lab</h1><p>Practise running a sales pipeline on fictional NexaFlow records.</p></div></section>${crmHelp()}<nav class="tabs">${tabs}</nav><div id="crm-tab"><div class="loading">Loading…</div></div>`, 'CRM Lab');
  document.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => crmView(user, button.getAttribute('data-tab')!)));
  if (tab === 'companies') return companiesView(user, params);
  if (tab === 'opportunities') return opportunitiesView(user);
  return leadsView(user, params);
}

async function leadsView(user: User, filters: LeadFilters = {}) {
  try {
    const query = new URLSearchParams();
    for (const key of ['search', 'industry', 'source', 'owner', 'stage', 'stale', 'page'] as const) if (filters[key]) query.set(key, String(filters[key]));
    const { leads, total, page, pageSize, filterOptions } = await api<{ leads: LeadView[]; total: number; page: number; pageSize: number; filterOptions: { industries: string[]; sources: string[]; owners: { id: string; name: string }[]; stages: string[]; stale: string[] } }>(`/api/crm/leads${query.toString() ? `?${query}` : ''}`);
    const canManage = ['ADMIN', 'INSTRUCTOR'].includes(user.role);
    const rows = leads.map((lead) => `<tr data-lead="${lead.id}" class="lead-row"><td>${escape(lead.contactName)}</td><td>${escape(lead.companyName)}</td><td>${escape(lead.industry)}</td><td>${escape(lead.ownerName || 'Unassigned')}</td><td>${escape(lead.stage)}</td><td>${lead.score}</td><td>${escape(staleLabels[lead.staleBucket] || lead.staleBucket)}</td><td>${formatMoney(lead.expectedValue)}</td></tr>`).join('');
    const filterBar = `<form id="lead-filters" class="filters"><input name="search" placeholder="Search contact, company, title…" value="${escape(filters.search || '')}">${selectField('industry', 'Industry', filterOptions.industries.map((value) => ({ value, label: value })), filters.industry)}${selectField('source', 'Source', filterOptions.sources.map((value) => ({ value, label: value })), filters.source)}${selectField('owner', 'Owner', filterOptions.owners.map((owner) => ({ value: owner.id, label: owner.name })), filters.owner)}${selectField('stage', 'Stage', filterOptions.stages.map((value) => ({ value, label: value })), filters.stage)}${selectField('stale', 'Stale status', filterOptions.stale.map((value) => ({ value, label: staleLabels[value] })), filters.stale)}<button>Filter</button>${Object.keys(filters).some((key) => filters[key as keyof LeadFilters]) ? '<button type="button" id="clear-filters" class="secondary">Clear</button>' : ''}${canManage ? '<button type="button" id="new-lead">New lead</button>' : ''}${leads.length ? '<button type="button" id="export-csv" class="secondary">Export CSV</button>' : ''}</form>`;
    const empty = leads.length ? '' : '<tr><td colspan="8" class="muted">No leads match these filters.</td></tr>';
    document.querySelector('#crm-tab')!.innerHTML = `${filterBar}<div class="table-wrap"><table class="crm-table"><thead><tr><th>Contact</th><th>Company</th><th>Industry</th><th>Owner</th><th>Stage</th><th>Score</th><th>Status</th><th>Expected value</th></tr></thead><tbody>${rows || empty}</tbody></table></div>${crmPager(total, page, pageSize)}`;
    document.querySelector('#lead-filters')!.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement)) as Record<string, string>;
      Object.keys(data).forEach((key) => { if (!data[key]) delete data[key]; });
      leadsView(user, { ...filters, ...data, page: 1 });
    });
    const clear = document.querySelector('#clear-filters');
    if (clear) clear.addEventListener('click', () => leadsView(user, {}));
    const newLead = document.querySelector('#new-lead');
    if (newLead) newLead.addEventListener('click', () => leadFormView(user));
    const exportCsv = document.querySelector('#export-csv');
    if (exportCsv) exportCsv.addEventListener('click', () => exportLeadsCsv(filters));
    document.querySelectorAll('[data-lead]').forEach((row) => row.addEventListener('click', () => leadDetailView(user, row.getAttribute('data-lead')!)));
    document.querySelectorAll('[data-page]').forEach((button) => button.addEventListener('click', () => leadsView(user, { ...filters, page: Number(button.getAttribute('data-page')) })));
  } catch (error) {
    errorView((error as Error).message);
  }
}

export async function leadDetailView(user: User, leadId: string) {
  try {
    const { lead, owners, stageHistory, activities, scoreBreakdown } = await api<{ lead: LeadView; owners: { id: string; name: string }[]; stageHistory: StageHistoryEntry[]; activities: ActivityEntry[]; scoreBreakdown: { score: number; matched: MatchedFactor[] } }>(`/api/crm/leads/${leadId}`);
    const canManage = ['ADMIN', 'INSTRUCTOR'].includes(user.role);
    const history = stageHistory.map((entry) => `<li><strong>${escape(entry.fromStage || '—')} → ${escape(entry.toStage)}</strong>${entry.reason ? ` — ${escape(entry.reason)}` : ''} <small>(${formatDate(entry.changedAt)})</small></li>`).join('') || '<li class="muted">No stage changes yet.</li>';
    const timeline = activities.map((activity) => `<li><strong>${escape(activity.type)}</strong> — ${escape(activity.subject)}${activity.notes ? ` — ${escape(activity.notes)}` : ''} <small>(${formatDate(activity.occurredAt)})</small></li>`).join('') || '<li class="muted">No activities yet.</li>';
    const ownerOptions = ['<option value="">Unassigned</option>', ...owners.map((owner) => `<option value="${owner.id}" ${owner.id === lead.ownerId ? 'selected' : ''}>${escape(owner.name)}</option>`)].join('');
    const scoreChips = (scoreBreakdown?.matched || []).map((factor) => `<span class="chip" title="${escape(factor.category)}">${escape(factor.label)} <b>+${factor.points}</b></span>`).join('') || '<p class="muted">No factors matched — score is 0.</p>';
    const editForm = `<details class="lead-edit"><summary>Edit lead details</summary><form id="lead-edit-form"><label>Contact name<input name="contactName" value="${escape(lead.contactName)}" required></label><label>Job title<input name="jobTitle" value="${escape(lead.jobTitle)}"></label><label>Email<input name="email" type="email" value="${escape(lead.email)}"></label><label>Source<input name="source" value="${escape(lead.source)}"></label><label>Expected value (USD)<input name="expectedValue" type="number" min="0" value="${lead.expectedValue}"></label><label>Owner<select name="ownerId">${ownerOptions}</select></label><label>Next action date<input name="nextActionAt" type="date" value="${lead.nextActionAt ? lead.nextActionAt.slice(0, 10) : ''}"></label><button>Save lead</button></form></details>`;
    shell(user, `<button id="back" class="secondary">← Back to CRM</button><article class="lead-detail"><div class="page-header"><div><span class="eyebrow">${escape(lead.stage)} · ${escape(staleLabels[lead.staleBucket] || lead.staleBucket)}</span><h1>${escape(lead.contactName)}</h1><p>${escape(lead.jobTitle || 'No title')} · ${escape(lead.companyName)}</p></div><div class="progress-card"><strong>Score ${scoreBreakdown?.score ?? lead.score}</strong><small>${escape(lead.ownerName || 'Unassigned')} · ${formatMoney(lead.expectedValue)}</small></div></div><dl class="lead-fields"><div><dt>Email</dt><dd>${escape(lead.email || '—')}</dd></div><div><dt>Source</dt><dd>${escape(lead.source || '—')}</dd></div><div><dt>Employee size</dt><dd>${escape(lead.employeeSize || '—')}</dd></div><div><dt>Created</dt><dd>${formatDate(lead.createdAt)}</dd></div><div><dt>Last activity</dt><dd>${formatDate(lead.lastActivityAt)}${lead.daysSinceLastActivity === null ? '' : ` (${lead.daysSinceLastActivity} days ago)`}</dd></div><div><dt>Next action</dt><dd>${formatDate(lead.nextActionAt)}</dd></div></dl><h2>Score breakdown</h2>${scoreChips}<form id="stage-form" class="inline-form"><label>Move to stage<select name="stage">${CRM_STAGES.map((stage) => `<option value="${stage}" ${stage === lead.stage ? 'selected' : ''}>${stage}</option>`).join('')}</select></label><label>Reason (optional)<input name="reason" placeholder="Why is this lead moving?"></label><button>Update stage</button></form><h2>Stage history</h2><ul class="timeline">${history}</ul><h2>Activity timeline</h2><ul class="timeline">${timeline}</ul><form id="activity-form" class="inline-form"><label>Type<select name="type">${['CALL', 'EMAIL', 'MEETING', 'NOTE'].map((type) => `<option value="${type}">${type}</option>`).join('')}</select></label><label>Subject<input name="subject" required placeholder="e.g. Discovery call"></label><label>Notes<textarea name="notes" rows="2"></textarea></label><button>Add activity</button></form>${canManage ? editForm : ''}</article>`, 'CRM Lab');
    document.querySelector('#back')!.addEventListener('click', () => crmView(user, 'leads'));
    document.querySelector('#stage-form')!.addEventListener('submit', async (event) => {
      event.preventDefault();
      try { await api(`/api/crm/leads/${lead.id}`, { method: 'PUT', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement))) }); leadDetailView(user, lead.id); } catch (error) { alert((error as Error).message); }
    });
    document.querySelector('#activity-form')!.addEventListener('submit', async (event) => {
      event.preventDefault();
      try { await api(`/api/crm/leads/${lead.id}/activities`, { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement))) }); leadDetailView(user, lead.id); } catch (error) { alert((error as Error).message); }
    });
    const editFormEl = document.querySelector('#lead-edit-form');
    if (editFormEl) editFormEl.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const data = Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement)) as Record<string, string>;
        data.ownerId = data.ownerId || '';
        await api(`/api/crm/leads/${lead.id}`, { method: 'PUT', body: JSON.stringify({ ...data, ownerId: data.ownerId || null, expectedValue: Number(data.expectedValue || 0), nextActionAt: data.nextActionAt || null }) });
        leadDetailView(user, lead.id);
      } catch (error) { alert((error as Error).message); }
    });
  } catch (error) {
    errorView((error as Error).message);
  }
}

async function leadFormView(user: User) {
  try {
    const [{ companies }, { filterOptions }] = await Promise.all([
      api<{ companies: CompanyView[] }>('/api/crm/companies?pageSize=50'),
      api<{ filterOptions: { owners: { id: string; name: string }[] } }>('/api/crm/leads?pageSize=1'),
    ]);
    const companyOptions = companies.map((company) => `<option value="${company.id}">${escape(company.name)}</option>`).join('');
    const ownerOptions = ['<option value="">Unassigned</option>', ...filterOptions.owners.map((owner) => `<option value="${owner.id}">${escape(owner.name)}</option>`)].join('');
    shell(user, `<button id="back" class="secondary">← Back to CRM</button><article class="editor"><span class="eyebrow">Training CRM</span><h1>New lead</h1><form id="lead-create-form"><label>Company<select name="companyId" required>${companyOptions}</select></label><label>Contact name<input name="contactName" required></label><label>Job title<input name="jobTitle"></label><label>Email<input name="email" type="email"></label><label>Source<input name="source" placeholder="e.g. Webinar"></label><label>Owner<select name="ownerId">${ownerOptions}</select></label><label>Stage<select name="stage">${CRM_STAGES.map((stage) => `<option value="${stage}">${stage}</option>`).join('')}</select></label><label>Expected value (USD)<input name="expectedValue" type="number" min="0"></label><button>Create lead</button></form></article>`, 'CRM Lab');
    document.querySelector('#back')!.addEventListener('click', () => crmView(user, 'leads'));
    document.querySelector('#lead-create-form')!.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const data = Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement)) as Record<string, string>;
        await api('/api/crm/leads', { method: 'POST', body: JSON.stringify({ ...data, ownerId: data.ownerId || null }) });
        crmView(user, 'leads');
      } catch (error) { alert((error as Error).message); }
    });
  } catch (error) {
    errorView((error as Error).message);
  }
}

async function companiesView(user: User, filters: { search?: string; page?: number } = {}) {
  try {
    const query = new URLSearchParams();
    for (const key of ['search', 'page'] as const) if (filters[key]) query.set(key, String(filters[key]));
    const { companies, total, page, pageSize } = await api<{ companies: CompanyView[]; total: number; page: number; pageSize: number }>(`/api/crm/companies${query.toString() ? `?${query}` : ''}`);
    const rows = companies.map((company) => `<tr data-company="${company.id}" class="lead-row"><td>${escape(company.name)}</td><td>${escape(company.industry)}</td><td>${escape(company.employeeSize)}</td><td>${escape(company.region)}</td><td>${company.leadCount}</td></tr>`).join('');
    document.querySelector('#crm-tab')!.innerHTML = `<form id="company-search" class="filters"><input name="search" placeholder="Search companies…" value="${escape(filters.search || '')}"><button>Search</button>${filters.search ? '<button type="button" id="clear-search" class="secondary">Clear</button>' : ''}</form><div class="table-wrap"><table class="crm-table"><thead><tr><th>Company</th><th>Industry</th><th>Employees</th><th>Region</th><th>Leads</th></tr></thead><tbody>${rows}</tbody></table></div>${crmPager(total, page, pageSize)}`;
    document.querySelector('#company-search')!.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement)) as Record<string, string>;
      if (!data.search) delete data.search;
      companiesView(user, { ...filters, ...data, page: 1 });
    });
    const clear = document.querySelector('#clear-search');
    if (clear) clear.addEventListener('click', () => companiesView(user, {}));
    document.querySelectorAll('[data-company]').forEach((row) => row.addEventListener('click', () => companyDetailView(user, row.getAttribute('data-company')!)));
    document.querySelectorAll('[data-page]').forEach((button) => button.addEventListener('click', () => companiesView(user, { ...filters, page: Number(button.getAttribute('data-page')) })));
  } catch (error) {
    errorView((error as Error).message);
  }
}

async function companyDetailView(user: User, companyId: string) {
  try {
    const { company, leads } = await api<{ company: CompanyView; leads: LeadView[] }>(`/api/crm/companies/${companyId}`);
    const rows = leads.map((lead) => `<tr data-lead="${lead.id}" class="lead-row"><td>${escape(lead.contactName)}</td><td>${escape(lead.jobTitle || '—')}</td><td>${escape(lead.stage)}</td><td>${lead.score}</td><td>${escape(lead.ownerName || 'Unassigned')}</td><td>${formatMoney(lead.expectedValue)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">No leads for this company yet.</td></tr>';
    shell(user, `<button id="back" class="secondary">← Back to CRM</button><article class="lead-detail"><span class="eyebrow">${escape(company.industry)} · ${escape(company.employeeSize)} employees</span><h1>${escape(company.name)}</h1><p>${escape(company.region)}${company.website ? ` · <a href="${escape(company.website)}" target="_blank" rel="noreferrer">website</a>` : ''}</p><h2>Leads (${leads.length})</h2><div class="table-wrap"><table class="crm-table"><thead><tr><th>Contact</th><th>Title</th><th>Stage</th><th>Score</th><th>Owner</th><th>Expected value</th></tr></thead><tbody>${rows}</tbody></table></div></article>`, 'CRM Lab');
    document.querySelector('#back')!.addEventListener('click', () => crmView(user, 'companies'));
    document.querySelectorAll('[data-lead]').forEach((row) => row.addEventListener('click', () => leadDetailView(user, row.getAttribute('data-lead')!)));
  } catch (error) {
    errorView((error as Error).message);
  }
}

async function opportunitiesView(user: User) {
  try {
    const { opportunities } = await api<{ opportunities: OpportunityView[] }>('/api/crm/opportunities');
    const rows = opportunities.map((opportunity) => `<tr data-opportunity="${opportunity.id}" class="lead-row"><td>${escape(opportunity.companyName)}</td><td>${escape(opportunity.leadContact || '—')}</td><td>${escape(opportunity.stage)}</td><td>${formatMoney(opportunity.amount)}</td><td>${escape(opportunity.ownerName || 'Unassigned')}</td><td>${escape(opportunity.expectedCloseDate || '—')}</td></tr>`).join('');
    document.querySelector('#crm-tab')!.innerHTML = `<div class="table-wrap"><table class="crm-table"><thead><tr><th>Company</th><th>Contact</th><th>Stage</th><th>Amount</th><th>Owner</th><th>Expected close</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    document.querySelectorAll('[data-opportunity]').forEach((row) => row.addEventListener('click', () => opportunityDetailView(user, row.getAttribute('data-opportunity')!)));
  } catch (error) {
    errorView((error as Error).message);
  }
}

async function opportunityDetailView(user: User, opportunityId: string) {
  try {
    const { opportunity } = await api<{ opportunity: OpportunityView }>(`/api/crm/opportunities/${opportunityId}`);
    shell(user, `<button id="back" class="secondary">← Back to CRM</button><article class="lead-detail"><span class="eyebrow">${escape(opportunity.stage)}</span><h1>${escape(opportunity.companyName)}</h1><p>${escape(opportunity.leadContact || 'No linked contact')} · ${escape(opportunity.ownerName || 'Unassigned')}</p><dl class="lead-fields"><div><dt>Amount</dt><dd>${formatMoney(opportunity.amount)}</dd></div><div><dt>Currency</dt><dd>${escape(opportunity.currency || '—')}</dd></div><div><dt>Expected close</dt><dd>${escape(opportunity.expectedCloseDate || '—')}</dd></div><div><dt>Closed</dt><dd>${formatDate(opportunity.closedAt)}</dd></div><div><dt>Lost reason</dt><dd>${escape(opportunity.lostReason || '—')}</dd></div></dl>${opportunity.leadId ? '<p><a href="#" id="open-lead">Open linked lead</a></p>' : ''}</article>`, 'CRM Lab');
    document.querySelector('#back')!.addEventListener('click', () => crmView(user, 'opportunities'));
    const openLead = document.querySelector('#open-lead');
    if (openLead) openLead.addEventListener('click', (event) => { event.preventDefault(); leadDetailView(user, opportunity.leadId!); });
  } catch (error) {
    errorView((error as Error).message);
  }
}

async function exportLeadsCsv(filters: LeadFilters) {
  try {
    const query = new URLSearchParams();
    for (const key of ['search', 'industry', 'source', 'owner', 'stage', 'stale'] as const) if (filters[key]) query.set(key, String(filters[key]));
    query.set('pageSize', '50');
    const { leads } = await api<{ leads: LeadView[] }>(`/api/crm/leads?${query}`);
    const headers = ['Contact', 'Company', 'Industry', 'Owner', 'Stage', 'Score', 'Status', 'Expected value', 'Created', 'Last activity'];
    const rows = leads.map((lead) => [lead.contactName, lead.companyName, lead.industry, lead.ownerName || 'Unassigned', lead.stage, lead.score, staleLabels[lead.staleBucket] || lead.staleBucket, lead.expectedValue, lead.createdAt, lead.lastActivityAt || '']);
    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'nexaflow-leads.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (error) {
    alert((error as Error).message);
  }
}
