import { parseUrl } from './context.js';

export function createAnalyticsRoutes(ctx) {
  const { db, STAGES, sendJson, companyById, firstContact, analyticsPeriod, analyticsLeads, segmentFor, requireUser } = ctx;
  return async function analyticsRoutes(request, response, pathname) {
    if (request.method === 'GET' && pathname === '/api/analytics') {
      const user = requireUser(request, response); if (!user) return true;
      const url = parseUrl(request); const period = analyticsPeriod(url);
      const leads = analyticsLeads(period);
      const stageCount = (stage) => leads.filter((lead) => lead.stage === stage).length;
      const value = (list) => list.reduce((sum, lead) => sum + Number(lead.expectedValue || 0), 0);
      const won = leads.filter((lead) => lead.stage === 'CLOSED_WON');
      const lost = leads.filter((lead) => lead.stage === 'CLOSED_LOST');
      const decided = won.length + lost.length;
      const kpis = { totalLeads: leads.length, mql: stageCount('MQL'), sql: stageCount('SQL'), opportunities: stageCount('OPPORTUNITY'), proposals: stageCount('PROPOSAL'), wonDeals: won.length, pipelineValue: value(leads.filter((lead) => ['OPPORTUNITY', 'PROPOSAL'].includes(lead.stage))), revenue: value(won), winRate: decided ? Math.round((won.length / decided) * 100) : 0 };
      const funnel = STAGES.filter((stage) => stage !== 'CLOSED_LOST').map((stage) => ({ stage, count: stageCount(stage) }));
      const groupBy = (list, keyFn, labelFn) => { const map = new Map(); for (const lead of list) { const key = keyFn(lead); const entry = map.get(key) || { label: labelFn(lead), leads: 0, value: 0 }; entry.leads += 1; entry.value += Number(lead.expectedValue || 0); map.set(key, entry); } return [...map.values()].sort((a, b) => b.leads - a.leads || b.value - a.value); };
      const bySalesperson = groupBy(leads, (lead) => lead.ownerId || 'unassigned', (lead) => lead.ownerName || 'Unassigned');
      const bySource = groupBy(leads, (lead) => lead.source || 'Unknown', (lead) => lead.source || 'Unknown');
      const byIndustry = groupBy(leads, (lead) => lead.industry || 'Unknown', (lead) => lead.industry || 'Unknown');
      const bySegment = groupBy(leads, (lead) => segmentFor(companyById(lead.companyId)), (lead) => segmentFor(companyById(lead.companyId)));
      return sendJson(response, 200, { period, kpis, funnel, bySalesperson, bySource, byIndustry, bySegment });
    }
    if (request.method === 'GET' && pathname === '/api/analytics/tat') {
      const user = requireUser(request, response); if (!user) return true;
      const url = parseUrl(request); const period = analyticsPeriod(url);
      const rows = analyticsLeads(period).map((lead) => {
        const first = firstContact(lead.id);
        const tatDays = first ? Math.max(0, Math.round((first - new Date(lead.createdAt)) / 86_400_000)) : null;
        return { leadId: lead.id, contactName: lead.contactName, companyName: lead.companyName, ownerName: lead.ownerName || 'Unassigned', stage: lead.stage, tatDays };
      }).sort((a, b) => (b.tatDays ?? -1) - (a.tatDays ?? -1));
      const withTat = rows.filter((row) => row.tatDays !== null);
      const averageDays = withTat.length ? Math.round((withTat.reduce((sum, row) => sum + row.tatDays, 0) / withTat.length) * 10) / 10 : null;
      return sendJson(response, 200, { period, definition: 'TAT (turnaround time) measures the days from lead creation to the first logged activity or stage movement — how quickly the team makes first contact.', averageDays, rows });
    }
    if (request.method === 'GET' && pathname === '/api/analytics/stale') {
      const user = requireUser(request, response); if (!user) return true;
      const url = parseUrl(request); const period = analyticsPeriod(url);
      const rows = analyticsLeads(period).filter((lead) => lead.staleBucket !== 'CLOSED').sort((a, b) => (b.daysSinceLastActivity ?? 0) - (a.daysSinceLastActivity ?? 0));
      return sendJson(response, 200, { period, definition: 'Stale leads have had no activity for several days. 0–3 days: Normal · 4–7 days: Attention · 8–15 days: At risk · 15+ days: Stale.', rows });
    }
    return false;
  };
}
