import { describe, it, expect } from 'vitest';
import { withServer, signIn } from './helpers';

describe('training CRM', () => {
  it('requires authentication for CRM pages', async () => {
    await withServer(async (base) => {
      expect((await fetch(`${base}/api/crm/leads`)).status).toBe(401);
      expect((await fetch(`${base}/api/crm/companies`)).status).toBe(401);
      expect((await fetch(`${base}/api/crm/opportunities`)).status).toBe(401);
    });
  });

  it('browses decorated leads with filters, search and pagination', async () => {
    await withServer(async (base) => {
      const { cookie } = await signIn(base, 'student@nexaflow.demo');
      const response = await fetch(`${base}/api/crm/leads`, { headers: { Cookie: cookie } });
      expect(response.status).toBe(200);
      const { leads, total, page, pageSize, filterOptions } = await response.json();
      expect(total).toBe(12);
      expect(page).toBe(1);
      expect(leads.length).toBe(pageSize);
      expect(leads.every((lead: { companyName: string; ownerName: string; staleBucket: string }) => lead.companyName && lead.ownerName !== undefined && lead.staleBucket)).toBe(true);
      expect(filterOptions.industries.length).toBeGreaterThanOrEqual(4);
      expect(filterOptions.owners.some((owner: { id: string }) => owner.id === 'unassigned')).toBe(true);
      const byStage = await (await fetch(`${base}/api/crm/leads?stage=PROPOSAL`, { headers: { Cookie: cookie } })).json();
      expect(byStage.leads.every((lead: { stage: string }) => lead.stage === 'PROPOSAL')).toBe(true);
      const byStale = await (await fetch(`${base}/api/crm/leads?stale=STALE`, { headers: { Cookie: cookie } })).json();
      expect(byStale.leads.every((lead: { staleBucket: string }) => lead.staleBucket === 'STALE')).toBe(true);
      expect(byStale.total).toBe(1);
      const byOwner = await (await fetch(`${base}/api/crm/leads?owner=unassigned`, { headers: { Cookie: cookie } })).json();
      expect(byOwner.leads.every((lead: { ownerId: string | null }) => !lead.ownerId)).toBe(true);
      const searched = await (await fetch(`${base}/api/crm/leads?search=meridian`, { headers: { Cookie: cookie } })).json();
      expect(searched.total).toBe(2);
      const paginated = await (await fetch(`${base}/api/crm/leads?page=2&pageSize=5`, { headers: { Cookie: cookie } })).json();
      expect(paginated.leads.length).toBe(5);
      expect(paginated.page).toBe(2);
      expect(paginated.total).toBe(12);
    });
  });

  it('students add activities and move leads through stages with history, but cannot manage records', async () => {
    await withServer(async (base) => {
      const { cookie } = await signIn(base, 'student@nexaflow.demo');
      const activity = await fetch(`${base}/api/crm/leads/lead-003/activities`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ type: 'CALL', subject: 'Intro call', notes: 'Went well' }) });
      expect(activity.status).toBe(201);
      const stage = await fetch(`${base}/api/crm/leads/lead-003`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ stage: 'SQL', reason: 'Qualified in call' }) });
      expect(stage.status).toBe(200);
      const detail = await (await fetch(`${base}/api/crm/leads/lead-003`, { headers: { Cookie: cookie } })).json();
      expect(detail.lead.stage).toBe('SQL');
      expect(detail.activities.length).toBe(3); // seeded email + new call + stage-change note
      expect(detail.activities.some((entry: { subject: string; type: string }) => entry.subject === 'Intro call' && entry.type === 'CALL')).toBe(true);
      expect(detail.activities[0].subject).toMatch(/Stage changed from MQL to SQL/);
      expect(detail.stageHistory[0].fromStage).toBe('MQL');
      expect(detail.stageHistory[0].toStage).toBe('SQL');
      const create = await fetch(`${base}/api/crm/leads`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ companyId: 'cmp-001', contactName: 'Not allowed' }) });
      expect(create.status).toBe(403);
      const reassign = await fetch(`${base}/api/crm/leads/lead-003`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ ownerId: 'sales-001' }) });
      expect(reassign.status).toBe(403);
    });
  });

  it('instructors create and edit leads, and activity updates the last-activity timestamp', async () => {
    await withServer(async (base) => {
      const { cookie } = await signIn(base, 'instructor@nexaflow.demo');
      const created = await fetch(`${base}/api/crm/leads`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ companyId: 'cmp-004', contactName: 'New Contact', jobTitle: 'Ops Lead', source: 'Inbound', ownerId: 'sales-001', stage: 'NEW', expectedValue: 15000 }) });
      expect(created.status).toBe(201);
      const { lead } = await created.json();
      expect(lead.companyName).toBe('Meridian Health');
      expect(lead.ownerName).toBe('Jordan Lee');
      expect(lead.lastActivityAt).toBeNull();
      const edited = await fetch(`${base}/api/crm/leads/${lead.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ contactName: 'Renamed Contact', score: 66, ownerId: 'sales-002' }) });
      expect(edited.status).toBe(200);
      const detail = await (await fetch(`${base}/api/crm/leads/${lead.id}`, { headers: { Cookie: cookie } })).json();
      expect(detail.lead.contactName).toBe('Renamed Contact');
      expect(detail.lead.ownerName).toBe('Priya Menon');
      // Score is now model-computed from the scoring factors (Enterprise +30, Inbound source +15)
      expect(detail.lead.score).toBe(45);
      await fetch(`${base}/api/crm/leads/${lead.id}/activities`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ type: 'EMAIL', subject: 'Intro email' }) });
      const refreshed = await (await fetch(`${base}/api/crm/leads/${lead.id}`, { headers: { Cookie: cookie } })).json();
      expect(refreshed.lead.lastActivityAt).toBeTruthy();
      const list = await (await fetch(`${base}/api/crm/leads`, { headers: { Cookie: cookie } })).json();
      expect(list.total).toBe(13);
    });
  });

  it('companies and opportunities pages return decorated records', async () => {
    await withServer(async (base) => {
      const { cookie } = await signIn(base, 'admin@nexaflow.demo');
      const companies = await (await fetch(`${base}/api/crm/companies`, { headers: { Cookie: cookie } })).json();
      expect(companies.total).toBe(8);
      expect(companies.companies.every((company: { leadCount: number }) => typeof company.leadCount === 'number')).toBe(true);
      const companyDetail = await (await fetch(`${base}/api/crm/companies/cmp-001`, { headers: { Cookie: cookie } })).json();
      expect(companyDetail.leads.length).toBe(2);
      const opportunities = await (await fetch(`${base}/api/crm/opportunities`, { headers: { Cookie: cookie } })).json();
      expect(opportunities.opportunities.length).toBe(4);
      expect(opportunities.opportunities.every((opportunity: { companyName: string }) => opportunity.companyName)).toBe(true);
    });
  });
});
