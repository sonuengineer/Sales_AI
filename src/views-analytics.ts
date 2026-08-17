import { api, type User } from './api/client';
import { escape, formatDate, formatMoney, staleLabels } from './format';
import { shell } from './shell';
import { errorView } from './views';
import { leadDetailView } from './views-crm';
import type { BreakdownRow, FunnelEntry, Kpis, LeadView, TatRow } from './types/index';

export function analyticsView(user: User, tab = 'summary', period = 'all') {
  const periodSelect = `<select id="analytics-period"><option value="all" ${period === 'all' ? 'selected' : ''}>All time</option><option value="30" ${period === '30' ? 'selected' : ''}>Last 30 days</option><option value="60" ${period === '60' ? 'selected' : ''}>Last 60 days</option><option value="90" ${period === '90' ? 'selected' : ''}>Last 90 days</option></select>`;
  const tabs = [['summary', 'Summary'], ['tat', 'TAT report'], ['stale', 'Stale leads']].map(([key, label]) => `<button class="tab ${tab === key ? 'active' : ''}" data-atab="${key}">${label}</button>`).join('');
  shell(user, `<section class="page-header"><div><span class="eyebrow">Sales intelligence</span><h1>Analytics</h1><p>Turn the training CRM data into management insight.</p></div><label class="period-label">Period${periodSelect}</label></section><nav class="tabs">${tabs}</nav><div id="analytics-content"><div class="loading">Loading…</div></div>`, 'Analytics');
  document.querySelectorAll('[data-atab]').forEach((button) => button.addEventListener('click', () => analyticsView(user, button.getAttribute('data-atab')!, (document.querySelector('#analytics-period') as HTMLSelectElement).value)));
  document.querySelector('#analytics-period')!.addEventListener('change', (event) => analyticsView(user, tab, (event.currentTarget as HTMLSelectElement).value));
  if (tab === 'tat') return analyticsTat(user, period);
  if (tab === 'stale') return analyticsStale(user, period);
  return analyticsSummary(period);
}

async function analyticsSummary(period: string) {
  try {
    const { kpis, funnel, bySalesperson, bySource, byIndustry, bySegment } = await api<{ kpis: Kpis; funnel: FunnelEntry[]; bySalesperson: BreakdownRow[]; bySource: BreakdownRow[]; byIndustry: BreakdownRow[]; bySegment: BreakdownRow[] }>(`/api/analytics?period=${period}`);
    const kpiCards = [['Total leads', String(kpis.totalLeads), 'All leads in the selected period'], ['MQL', String(kpis.mql), 'Marketing-qualified leads'], ['SQL', String(kpis.sql), 'Sales-qualified leads'], ['Opportunities', String(kpis.opportunities), 'Qualified deals being pursued'], ['Proposals', String(kpis.proposals), 'Pricing shared with the buyer'], ['Won deals', String(kpis.wonDeals), 'Closed won outcomes'], ['Pipeline value', `$${kpis.pipelineValue.toLocaleString()}`, 'Expected value of open opportunities and proposals'], ['Revenue', `$${kpis.revenue.toLocaleString()}`, 'Value of closed won deals'], ['Win rate', `${kpis.winRate}%`, 'Closed won divided by all closed deals']].map(([label, value, tip]) => `<article class="metric" title="${escape(tip)}"><span>${escape(label)}</span><strong>${value}</strong><small class="kpi-tip">${escape(tip)}</small></article>`).join('');
    const maxFunnel = Math.max(...funnel.map((entry) => entry.count), 1);
    const funnelHtml = funnel.map((entry, index) => {
      const width = Math.round((entry.count / maxFunnel) * 100);
      const conversion = index > 0 && funnel[index - 1].count ? `${Math.round((entry.count / funnel[index - 1].count) * 100)}%` : '—';
      return `<div class="funnel-row"><span class="funnel-stage">${escape(entry.stage)} <small>(${entry.count})</small></span><div class="progress funnel-bar"><span style="width:${width}%"></span></div><span class="funnel-conversion">${conversion}</span></div>`;
    }).join('');
    const breakdown = (rows: BreakdownRow[]) => rows.length ? rows.map((row) => `<tr><td>${escape(row.label)}</td><td>${row.leads}</td><td>${formatMoney(row.value)}</td></tr>`).join('') : '<tr><td colspan="3" class="muted">No data.</td></tr>';
    const breakdownTable = (title: string, rows: BreakdownRow[]) => `<article class="analytics-card"><h2>${title}</h2><div class="table-wrap"><table class="crm-table"><thead><tr><th>Group</th><th>Leads</th><th>Expected value</th></tr></thead><tbody>${breakdown(rows)}</tbody></table></div></article>`;
    document.querySelector('#analytics-content')!.innerHTML = `<section class="grid kpi-grid">${kpiCards}</section><section class="analytics-card"><h2>Lead funnel</h2><p class="muted">Leads at each lifecycle stage; the percentage shows conversion from the previous stage.</p><div class="funnel">${funnelHtml}</div></section><section class="breakdown-grid">${breakdownTable('By salesperson', bySalesperson)}${breakdownTable('By source', bySource)}${breakdownTable('By industry', byIndustry)}${breakdownTable('By company segment', bySegment)}</section>`;
  } catch (error) {
    errorView((error as Error).message);
  }
}

async function analyticsTat(user: User, period: string) {
  try {
    const { definition, averageDays, rows } = await api<{ definition: string; averageDays: number | null; rows: TatRow[] }>(`/api/analytics/tat?period=${period}`);
    const tableRows = rows.map((row) => `<tr data-lead="${row.leadId}" class="lead-row"><td>${escape(row.contactName)}</td><td>${escape(row.companyName)}</td><td>${escape(row.ownerName)}</td><td>${escape(row.stage)}</td><td>${row.tatDays === null ? '—' : `${row.tatDays} days`}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No leads in this period.</td></tr>';
    document.querySelector('#analytics-content')!.innerHTML = `<section class="state"><strong>TAT definition:</strong> ${escape(definition)}</section><section class="analytics-card"><h2>Average response TAT — ${escape(averageDays === null ? '—' : `${averageDays} days`)}</h2><div class="table-wrap"><table class="crm-table"><thead><tr><th>Contact</th><th>Company</th><th>Owner</th><th>Stage</th><th>Days to first contact</th></tr></thead><tbody>${tableRows}</tbody></table></div></section>`;
    document.querySelectorAll('[data-lead]').forEach((row) => row.addEventListener('click', () => leadDetailView(user, row.getAttribute('data-lead')!)));
  } catch (error) {
    errorView((error as Error).message);
  }
}

async function analyticsStale(user: User, period: string) {
  try {
    const { definition, rows } = await api<{ definition: string; rows: LeadView[] }>(`/api/analytics/stale?period=${period}`);
    const tableRows = rows.map((lead) => `<tr data-lead="${lead.id}" class="lead-row"><td>${escape(lead.contactName)}</td><td>${escape(lead.companyName)}</td><td>${escape(lead.ownerName || 'Unassigned')}</td><td>${escape(lead.stage)}</td><td><span class="badge badge-${lead.staleBucket.toLowerCase()}">${escape(staleLabels[lead.staleBucket] || lead.staleBucket)}</span></td><td>${lead.daysSinceLastActivity === null ? '—' : `${lead.daysSinceLastActivity} days`}</td><td>${formatDate(lead.nextActionAt)}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">No leads in this period.</td></tr>';
    document.querySelector('#analytics-content')!.innerHTML = `<section class="state"><strong>Stale rule:</strong> ${escape(definition)}</section><section class="analytics-card"><div class="table-wrap"><table class="crm-table"><thead><tr><th>Contact</th><th>Company</th><th>Owner</th><th>Stage</th><th>Status</th><th>Days since activity</th><th>Next action</th></tr></thead><tbody>${tableRows}</tbody></table></div></section>`;
    document.querySelectorAll('[data-lead]').forEach((row) => row.addEventListener('click', () => leadDetailView(user, row.getAttribute('data-lead')!)));
  } catch (error) {
    errorView((error as Error).message);
  }
}
