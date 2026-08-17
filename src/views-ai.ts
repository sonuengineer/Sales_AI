import { api, type User } from './api/client';
import { escape, formatDate } from './format';
import { shell } from './shell';
import { errorView } from './views';
import type { AiFollowup, AiRunDetail, AiRunSummary, AiTemplate, CompanyView, LeadView } from './types/index';

const aiHelp = () => '<details class="crm-help"><summary>How the AI Practice Lab works</summary><p>This lab simulates AI-assisted sales work with <strong>no AI provider and no API key</strong>. Pick a template, add company or lead context, and the platform returns a clearly-labelled simulated output you can copy, verify and reuse. Follow-up drafts always need your human approval before they are marked sent. Every claim is fictional demo content — verify anything before acting on it.</p></details>';

function copyText(text: string) {
  navigator.clipboard?.writeText(text).catch(() => { /* clipboard unavailable */ });
  alert('Copied to clipboard.');
}

export function aiLabView(user: User, tab = 'assistant') {
  const tabs = [['assistant', 'AI Assistant'], ['followups', 'Follow-up review'], ['history', 'History']].map(([key, label]) => `<button class="tab ${tab === key ? 'active' : ''}" data-ai-tab="${key}">${label}</button>`).join('');
  shell(user, `<section class="page-header"><div><span class="eyebrow">AI practice — no provider required</span><h1>AI Practice Lab</h1><p>Practise safe, simulated AI-assisted sales work on fictional NexaFlow data.</p></div></section>${aiHelp()}<nav class="tabs">${tabs}</nav><div id="ai-content"><div class="loading">Loading…</div></div>`, 'AI Practice Lab');
  document.querySelectorAll('[data-ai-tab]').forEach((button) => button.addEventListener('click', () => aiLabView(user, button.getAttribute('data-ai-tab')!)));
  if (tab === 'followups') return followupsView(user);
  if (tab === 'history') return historyView(user);
  return assistantView(user);
}

async function assistantView(user: User) {
  try {
    const [{ templates, disclaimer }, companies, leads] = await Promise.all([
      api<{ templates: AiTemplate[]; disclaimer: string }>('/api/ai/templates'),
      api<{ companies: CompanyView[] }>('/api/crm/companies?pageSize=50'),
      api<{ leads: LeadView[] }>('/api/crm/leads?pageSize=50'),
    ]);
    const templateOptions = templates.map((template) => `<option value="${template.id}">${escape(template.name)} — ${escape(template.description)}</option>`).join('');
    document.querySelector('#ai-content')!.innerHTML = `<section class="analytics-card"><h2>Run a simulated AI request</h2><form id="ai-form"><label>Template<select name="templateId">${templateOptions}</select></label><div id="ai-fields"></div><button>Run simulated AI</button></form><p class="notice">${escape(disclaimer)}</p></section><section class="analytics-card"><h2>Output</h2><div id="ai-output"><p class="muted">Choose a template, add context, then run the request. The simulated output appears here, clearly labelled, with the exact prompt you used so you can copy and reuse it.</p></div></section>`;
    const templateSelect = document.querySelector<HTMLSelectElement>('[name="templateId"]')!;
    const renderFields = () => {
      const template = templates.find((entry) => entry.id === templateSelect.value) || templates[0];
      const companyOptions = companies.companies.map((company) => `<option value="${company.id}">${escape(company.name)}</option>`).join('');
      const leadOptions = leads.leads.map((lead) => `<option value="${lead.id}">${escape(lead.contactName)} — ${escape(lead.companyName)}</option>`).join('');
      let fields = '';
      if (template.requires.includes('companyId')) fields += `<label>Company<select name="companyId" required>${companyOptions}</select></label>`;
      if (template.requires.includes('leadId')) fields += `<label>Lead<select name="leadId" required>${leadOptions}</select></label>`;
      if (template.id === 'meeting-summary') fields += `<label>Meeting notes (optional)<textarea name="text" rows="5" placeholder="Paste rough notes from the call…"></textarea></label>`;
      if (template.id === 'reporting') fields += `<label>Focus (optional)<input name="text" placeholder="e.g. This month vs last month"></label>`;
      document.querySelector('#ai-fields')!.innerHTML = fields;
    };
    templateSelect.addEventListener('change', renderFields);
    renderFields();
    document.querySelector('#ai-form')!.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const data = Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement)) as Record<string, string>;
        const output = await api<{ run: AiRunSummary; prompt: string; output: Record<string, unknown>; disclaimer: string }>('/api/ai/run', { method: 'POST', body: JSON.stringify({ templateId: data.templateId, companyId: data.companyId || undefined, leadId: data.leadId || undefined, text: data.text || undefined }) });
        const pretty = JSON.stringify(output.output, null, 2);
        document.querySelector('#ai-output')!.innerHTML = `<span class="badge badge-normal">Simulated AI output — ${escape(output.run.templateName)}</span><pre class="ai-output">${escape(pretty)}</pre><h3>Prompt used (copy and reuse)</h3><pre class="ai-output">${escape(output.prompt)}</pre><button id="copy-prompt" class="secondary">Copy prompt</button><p class="notice">${escape(output.disclaimer)}</p>`;
        document.querySelector('#copy-prompt')!.addEventListener('click', () => copyText(output.prompt));
      } catch (error) { alert((error as Error).message); }
    });
  } catch (error) {
    errorView((error as Error).message);
  }
}

async function followupsView(user: User) {
  try {
    const [{ followups }, { leads }] = await Promise.all([
      api<{ followups: AiFollowup[] }>('/api/ai/followups'),
      api<{ leads: LeadView[] }>('/api/crm/leads?pageSize=50'),
    ]);
    const leadOptions = leads.leads.map((lead) => `<option value="${lead.id}">${escape(lead.contactName)} — ${escape(lead.companyName)}</option>`).join('');
    const statusBadge = (status: string) => ({ DRAFT: 'badge-attention', APPROVED: 'badge-normal', SENT: 'badge-stale' }[status] || 'badge-normal');
    const cards = followups.length ? followups.map((followup) => `<section class="analytics-card"><div class="alert-head"><h2>${escape(followup.contactName)} — ${escape(followup.companyName)}</h2><span class="badge ${statusBadge(followup.status)}">${followup.status}</span></div><p class="muted">Created ${formatDate(followup.createdAt)}${followup.sentAt ? ` · marked sent ${formatDate(followup.sentAt)}` : ''}</p><label>Draft message (edit before sending)<textarea data-fup-draft="${followup.id}" rows="6">${escape(followup.draft)}</textarea></label><div class="inline-actions">${followup.status === 'DRAFT' ? '<button class="secondary" data-fup-save="' + followup.id + '">Save draft</button><button data-fup-approve="' + followup.id + '">Approve for sending</button>' : ''}${followup.status === 'APPROVED' ? '<button data-fup-send="' + followup.id + '">Mark sent (simulated)</button>' : ''}</div></section>`).join('') : '<p class="muted">No follow-up drafts yet. Create one for a lead below.</p>';
    document.querySelector('#ai-content')!.innerHTML = `<section class="state"><strong>Human review required:</strong> drafts are never sent automatically. Edit the message, approve it, then mark it sent in the simulation.</section><section class="analytics-card"><h2>Create a draft for a lead</h2><form id="fup-create"><label>Lead<select name="leadId" required>${leadOptions}</select></label><button>Create draft</button></form></section><section class="fup-list">${cards}</section>`;
    document.querySelector('#fup-create')!.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const data = Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement)) as Record<string, string>;
        await api('/api/ai/followups', { method: 'POST', body: JSON.stringify({ leadId: data.leadId }) });
        followupsView(user);
      } catch (error) { alert((error as Error).message); }
    });
    document.querySelectorAll('[data-fup-save]').forEach((button) => button.addEventListener('click', async () => {
      const id = button.getAttribute('data-fup-save')!;
      try { await api(`/api/ai/followups/${id}`, { method: 'PUT', body: JSON.stringify({ draft: (document.querySelector(`[data-fup-draft="${id}"]`) as HTMLTextAreaElement).value }) }); followupsView(user); } catch (error) { alert((error as Error).message); }
    }));
    document.querySelectorAll('[data-fup-approve]').forEach((button) => button.addEventListener('click', async () => {
      try { await api(`/api/ai/followups/${button.getAttribute('data-fup-approve')}/approve`, { method: 'POST' }); followupsView(user); } catch (error) { alert((error as Error).message); }
    }));
    document.querySelectorAll('[data-fup-send]').forEach((button) => button.addEventListener('click', async () => {
      try { await api(`/api/ai/followups/${button.getAttribute('data-fup-send')}/send`, { method: 'POST' }); followupsView(user); } catch (error) { alert((error as Error).message); }
    }));
    document.querySelectorAll('[data-fup-draft]').forEach((textarea) => textarea.addEventListener('focus', () => textarea.closest('section')?.classList.add('editing')));
  } catch (error) {
    errorView((error as Error).message);
  }
}

async function historyView(user: User) {
  try {
    const { runs } = await api<{ runs: AiRunSummary[] }>('/api/ai/runs');
    const rows = runs.length ? `<div class="table-wrap"><table class="crm-table"><thead><tr><th>Template</th><th>Date</th></tr></thead><tbody>${runs.map((run) => `<tr data-ai-run="${run.id}" class="lead-row"><td>${escape(run.templateName)}</td><td>${formatDate(run.createdAt)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No AI runs yet.</p>';
    document.querySelector('#ai-content')!.innerHTML = `<section class="analytics-card"><h2>Your AI experiments</h2>${rows}</section>`;
    document.querySelectorAll('[data-ai-run]').forEach((row) => row.addEventListener('click', () => runDetailView(user, row.getAttribute('data-ai-run')!)));
  } catch (error) {
    errorView((error as Error).message);
  }
}

async function runDetailView(user: User, runId: string) {
  try {
    const { run } = await api<{ run: AiRunDetail }>(`/api/ai/runs/${runId}`);
    document.querySelector('#ai-content')!.innerHTML = `<button id="ai-back" class="secondary">← Back to history</button><section class="analytics-card"><span class="eyebrow">${formatDate(run.createdAt)}</span><h1>${escape(run.input.leadId ? 'Lead context' : run.input.companyId ? 'Company context' : 'Freeform input')}</h1><pre class="ai-output">${escape(JSON.stringify(run.output, null, 2))}</pre></section>`;
    document.querySelector('#ai-back')!.addEventListener('click', () => historyView(user));
  } catch (error) {
    errorView((error as Error).message);
  }
}
