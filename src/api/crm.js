import crypto from 'node:crypto';
import { z } from 'zod';
import { readJson } from './context.js';
import { readFactors, scoreForLead } from '../scoring.js';

const leadCreateSchema = z.object({
  companyId: z.string().min(1), contactName: z.string().trim().min(1), jobTitle: z.string().optional(), email: z.string().optional(),
  source: z.string().optional(), ownerId: z.string().nullable().optional(), stage: z.string().optional(),
  expectedValue: z.coerce.number().int().min(0).optional(), nextActionAt: z.string().nullable().optional()
});
const leadUpdateSchema = z.object({
  contactName: z.string().trim().min(1).optional(), jobTitle: z.string().optional(), email: z.string().optional(), source: z.string().optional(),
  ownerId: z.string().nullable().optional(), stage: z.string().optional(), reason: z.string().optional(),
  expectedValue: z.coerce.number().int().min(0).optional(), nextActionAt: z.string().nullable().optional()
});
const activitySchema = z.object({ type: z.string().optional(), subject: z.string().trim().min(1), notes: z.string().optional() });
const capacitySchema = z.object({ capacity: z.coerce.number().int().min(0) });

export function createCrmRoutes(ctx) {
  const { db, referenceDate, STAGES, sendJson, readJson: _readJson, parseUrl, pageParams, LEAD_JOIN, companyById, decorateLead, decorateCompany, decorateOpportunity, leadActivities, leadHistory, leadById, allLeads, requireUser, requireCrmManager } = ctx;
  const readBody = readJson;

  return async function crmRoutes(request, response, pathname) {
    if (request.method === 'GET' && pathname === '/api/crm/companies') {
      const user = requireUser(request, response); if (!user) return true;
      const url = parseUrl(request); const { page, pageSize } = pageParams(url);
      const search = String(url.searchParams.get('search') || '').toLowerCase();
      let rows = db.prepare('SELECT c.*, (SELECT COUNT(*) FROM leads l WHERE l.company_id = c.id) AS lead_count FROM companies c').all();
      if (search) rows = rows.filter((company) => company.name.toLowerCase().includes(search) || (company.industry || '').toLowerCase().includes(search));
      const total = rows.length; const start = (page - 1) * pageSize;
      return sendJson(response, 200, { companies: rows.slice(start, start + pageSize).map(decorateCompany), total, page, pageSize });
    }
    const companyMatch = pathname.match(/^\/api\/crm\/companies\/([^/]+)$/);
    if (request.method === 'GET' && companyMatch) {
      const user = requireUser(request, response); if (!user) return true;
      const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(companyMatch[1]);
      if (!company) return sendJson(response, 404, { error: 'Company not found.' });
      const leads = db.prepare(`${LEAD_JOIN} WHERE l.company_id = ? ORDER BY l.created_at DESC`).all(company.id).map(decorateLead);
      return sendJson(response, 200, { company: decorateCompany({ ...company, lead_count: leads.length }), leads });
    }
    if (request.method === 'GET' && pathname === '/api/crm/leads') {
      const user = requireUser(request, response); if (!user) return true;
      const url = parseUrl(request); const { page, pageSize } = pageParams(url);
      const search = String(url.searchParams.get('search') || '').toLowerCase();
      const industry = url.searchParams.get('industry') || ''; const source = url.searchParams.get('source') || ''; const owner = url.searchParams.get('owner') || ''; const stage = url.searchParams.get('stage') || ''; const stale = url.searchParams.get('stale') || '';
      let leads = allLeads();
      if (search) leads = leads.filter((lead) => [lead.contactName, lead.companyName, lead.jobTitle, lead.email].some((value) => String(value || '').toLowerCase().includes(search)));
      if (industry) leads = leads.filter((lead) => lead.industry === industry);
      if (source) leads = leads.filter((lead) => lead.source === source);
      if (owner) leads = leads.filter((lead) => (lead.ownerId || 'unassigned') === owner);
      if (stage) leads = leads.filter((lead) => lead.stage === stage);
      if (stale) leads = leads.filter((lead) => lead.staleBucket === stale);
      const total = leads.length; const start = (page - 1) * pageSize;
      const filterOptions = {
        industries: db.prepare('SELECT DISTINCT c.industry AS industry FROM leads l JOIN companies c ON c.id = l.company_id WHERE c.industry IS NOT NULL ORDER BY c.industry').all().map((row) => row.industry),
        sources: db.prepare('SELECT DISTINCT source AS source FROM leads WHERE source IS NOT NULL ORDER BY source').all().map((row) => row.source),
        owners: [{ id: 'unassigned', name: 'Unassigned' }, ...db.prepare('SELECT sp.id AS id, COALESCE(u.name, sp.name) AS name FROM salespeople sp LEFT JOIN users u ON u.id = sp.user_id ORDER BY name').all()],
        stages: STAGES,
        stale: ['NORMAL', 'ATTENTION', 'AT_RISK', 'STALE']
      };
      return sendJson(response, 200, { leads: leads.slice(start, start + pageSize), total, page, pageSize, filterOptions });
    }
    const leadMatch = pathname.match(/^\/api\/crm\/leads\/([^/]+)$/);
    if (request.method === 'GET' && leadMatch) {
      const user = requireUser(request, response); if (!user) return true;
      const lead = leadById(leadMatch[1]);
      if (!lead) return sendJson(response, 404, { error: 'Lead not found.' });
      const raw = db.prepare(`${LEAD_JOIN} WHERE l.id = ?`).get(leadMatch[1]);
      const owners = db.prepare('SELECT sp.id AS id, COALESCE(u.name, sp.name) AS name FROM salespeople sp LEFT JOIN users u ON u.id = sp.user_id ORDER BY name').all();
      return sendJson(response, 200, { lead, owners, stageHistory: leadHistory(leadMatch[1]), activities: leadActivities(leadMatch[1]), scoreBreakdown: scoreForLead(raw, raw, readFactors(db), referenceDate) });
    }
    const leadActivityMatch = pathname.match(/^\/api\/crm\/leads\/([^/]+)\/activities$/);
    if (request.method === 'POST' && leadActivityMatch) {
      const user = requireUser(request, response); if (!user) return true;
      if (!db.prepare('SELECT id FROM leads WHERE id = ?').get(leadActivityMatch[1])) return sendJson(response, 404, { error: 'Lead not found.' });
      const body = activitySchema.parse(await readBody(request));
      const activity = { id: `act-${crypto.randomUUID()}`, leadId: leadActivityMatch[1], type: ['CALL', 'EMAIL', 'MEETING', 'NOTE'].includes(body.type) ? body.type : 'NOTE', subject: body.subject, occurredAt: new Date().toISOString(), ownerId: user.id, notes: String(body.notes || '').trim() };
      db.prepare('INSERT INTO activities (id, lead_id, type, subject, occurred_at, owner_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?)').run(activity.id, activity.leadId, activity.type, activity.subject, activity.occurredAt, activity.ownerId, activity.notes);
      db.prepare('UPDATE leads SET last_activity_at = ? WHERE id = ?').run(activity.occurredAt, activity.leadId);
      const touched = db.prepare(`${LEAD_JOIN} WHERE l.id = ?`).get(activity.leadId);
      db.prepare('UPDATE leads SET score = ? WHERE id = ?').run(scoreForLead(touched, touched, readFactors(db), referenceDate).score, activity.leadId);
      return sendJson(response, 201, { activity });
    }
    if (request.method === 'POST' && pathname === '/api/crm/leads') {
      const user = requireCrmManager(request, response); if (!user) return true;
      const body = leadCreateSchema.parse(await readBody(request));
      if (!companyById(body.companyId)) return sendJson(response, 400, { error: 'A valid company is required.' });
      const stage = STAGES.includes(body.stage) ? body.stage : 'NEW';
      const company = companyById(body.companyId);
      const lead = { id: `lead-${crypto.randomUUID()}`, companyId: body.companyId, contactName: body.contactName, jobTitle: String(body.jobTitle || '').trim(), email: String(body.email || '').trim(), source: String(body.source || 'Inbound').trim(), ownerId: body.ownerId || null, stage, score: 0, createdAt: new Date().toISOString(), lastActivityAt: null, nextActionAt: body.nextActionAt || null, expectedValue: Number(body.expectedValue || 0) };
      lead.score = scoreForLead({ job_title: lead.jobTitle, source: lead.source, stage: lead.stage, last_activity_at: null }, company, readFactors(db), referenceDate).score;
      db.prepare('INSERT INTO leads (id, company_id, contact_name, job_title, email, source, owner_id, stage, score, created_at, last_activity_at, next_action_at, expected_value) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(lead.id, lead.companyId, lead.contactName, lead.jobTitle, lead.email, lead.source, lead.ownerId, lead.stage, lead.score, lead.createdAt, lead.lastActivityAt, lead.nextActionAt, lead.expectedValue);
      db.prepare('INSERT INTO activities (id, lead_id, type, subject, occurred_at, owner_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?)').run(`act-${crypto.randomUUID()}`, lead.id, 'NOTE', 'Lead created', lead.createdAt, user.id, 'Record created in the training CRM.');
      db.prepare('INSERT INTO stage_history (id, lead_id, from_stage, to_stage, changed_by_id, changed_at, reason) VALUES (?, ?, ?, ?, ?, ?, ?)').run(`hist-${crypto.randomUUID()}`, lead.id, null, lead.stage, user.id, lead.createdAt, 'Lead created');
      return sendJson(response, 201, { lead: leadById(lead.id) });
    }
    if (request.method === 'PUT' && leadMatch) {
      const user = requireUser(request, response); if (!user) return true;
      const existing = db.prepare('SELECT * FROM leads WHERE id = ?').get(leadMatch[1]);
      if (!existing) return sendJson(response, 404, { error: 'Lead not found.' });
      const body = leadUpdateSchema.parse(await readBody(request));
      const isManager = ['ADMIN', 'INSTRUCTOR'].includes(user.role);
      if (!isManager && body.ownerId !== undefined && (body.ownerId || null) !== existing.owner_id) return sendJson(response, 403, { error: 'Only administrators and instructors can reassign a lead owner.' });
      const changes = [];
      if (body.stage && STAGES.includes(body.stage) && body.stage !== existing.stage) {
        db.prepare('INSERT INTO stage_history (id, lead_id, from_stage, to_stage, changed_by_id, changed_at, reason) VALUES (?, ?, ?, ?, ?, ?, ?)').run(`hist-${crypto.randomUUID()}`, existing.id, existing.stage, body.stage, user.id, new Date().toISOString(), String(body.reason || ''));
        db.prepare('UPDATE leads SET stage = ? WHERE id = ?').run(body.stage, existing.id);
        changes.push(`Stage changed from ${existing.stage} to ${body.stage}`);
      }
      if (isManager) {
        const fields = { contactName: 'contact_name', jobTitle: 'job_title', email: 'email', source: 'source', expectedValue: 'expected_value', nextActionAt: 'next_action_at', ownerId: 'owner_id' };
        for (const [key, column] of Object.entries(fields)) {
          if (body[key] === undefined) continue;
          const next = key === 'ownerId' ? (body[key] || null) : String(body[key]);
          if (String(next) !== String(existing[column] ?? '')) { db.prepare(`UPDATE leads SET ${column} = ? WHERE id = ?`).run(next, existing.id); changes.push(`${key} updated`); }
        }
      }
      if (changes.length) db.prepare('INSERT INTO activities (id, lead_id, type, subject, occurred_at, owner_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?)').run(`act-${crypto.randomUUID()}`, existing.id, 'NOTE', `Lead updated — ${changes.join(', ')}`, new Date().toISOString(), user.id, '');
      const refreshed = db.prepare(`${LEAD_JOIN} WHERE l.id = ?`).get(existing.id);
      db.prepare('UPDATE leads SET score = ? WHERE id = ?').run(scoreForLead(refreshed, refreshed, readFactors(db), referenceDate).score, existing.id);
      return sendJson(response, 200, { lead: leadById(existing.id) });
    }
    if (request.method === 'GET' && pathname === '/api/crm/opportunities') {
      const user = requireUser(request, response); if (!user) return true;
      const rows = db.prepare(`SELECT o.*, c.name AS company_name, l.contact_name AS lead_contact, COALESCE(u.name, sp.name) AS owner_name FROM opportunities o JOIN companies c ON c.id = o.company_id LEFT JOIN leads l ON l.id = o.lead_id LEFT JOIN salespeople sp ON sp.id = o.owner_id LEFT JOIN users u ON u.id = sp.user_id ORDER BY o.expected_close_date`).all();
      return sendJson(response, 200, { opportunities: rows.map(decorateOpportunity) });
    }
    const opportunityMatch = pathname.match(/^\/api\/crm\/opportunities\/([^/]+)$/);
    if (request.method === 'GET' && opportunityMatch) {
      const user = requireUser(request, response); if (!user) return true;
      const row = db.prepare(`SELECT o.*, c.name AS company_name, l.contact_name AS lead_contact, COALESCE(u.name, sp.name) AS owner_name FROM opportunities o JOIN companies c ON c.id = o.company_id LEFT JOIN leads l ON l.id = o.lead_id LEFT JOIN salespeople sp ON sp.id = o.owner_id LEFT JOIN users u ON u.id = sp.user_id WHERE o.id = ?`).get(opportunityMatch[1]);
      if (!row) return sendJson(response, 404, { error: 'Opportunity not found.' });
      return sendJson(response, 200, { opportunity: decorateOpportunity(row) });
    }
    const salespersonMatch = pathname.match(/^\/api\/crm\/salespeople\/([^/]+)$/);
    if (request.method === 'PUT' && salespersonMatch) {
      const user = requireCrmManager(request, response); if (!user) return true;
      const salesperson = db.prepare('SELECT id FROM salespeople WHERE id = ?').get(salespersonMatch[1]);
      if (!salesperson) return sendJson(response, 404, { error: 'Salesperson not found.' });
      const body = capacitySchema.parse(await readBody(request));
      db.prepare('UPDATE salespeople SET capacity = ? WHERE id = ?').run(body.capacity, salesperson.id);
      return sendJson(response, 200, { ok: true });
    }
    return false;
  };
}
