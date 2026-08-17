import crypto from 'node:crypto';
import { z } from 'zod';
import { readJson } from './context.js';
import { AI_DISCLAIMER, readTemplates, runTemplate } from '../ai.js';

const runSchema = z.object({ templateId: z.string().min(1), companyId: z.string().optional(), leadId: z.string().optional(), text: z.string().optional() });
const followupSchema = z.object({ leadId: z.string().min(1) });
const draftSchema = z.object({ draft: z.string().trim().min(1) });

export function createAiRoutes(ctx) {
  const { db, sendJson, referenceDate, requireUser } = ctx;

  return async function aiRoutes(request, response, pathname) {
    if (request.method === 'GET' && pathname === '/api/ai/templates') {
      const user = requireUser(request, response); if (!user) return true;
      return sendJson(response, 200, { templates: readTemplates(), label: 'Simulated AI practice — no external AI provider is connected.', disclaimer: AI_DISCLAIMER });
    }
    if (request.method === 'POST' && pathname === '/api/ai/run') {
      const user = requireUser(request, response); if (!user) return true;
      const body = runSchema.parse(await readJson(request));
      const { templateId, templateName, prompt, output } = runTemplate(db, referenceDate, body.templateId, { companyId: body.companyId, leadId: body.leadId, text: body.text });
      const run = { id: `run-${crypto.randomUUID()}`, userId: user.id, templateId, input: JSON.stringify({ companyId: body.companyId || null, leadId: body.leadId || null, text: body.text || '' }), output: JSON.stringify(output), createdAt: new Date().toISOString() };
      db.prepare('INSERT INTO ai_runs (id, user_id, template_id, input, output, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(run.id, run.userId, run.templateId, run.input, run.output, run.createdAt);
      return sendJson(response, 201, { run: { id: run.id, templateId: run.templateId, templateName, createdAt: run.createdAt }, label: 'Simulated AI output', disclaimer: AI_DISCLAIMER, prompt, output });
    }
    if (request.method === 'GET' && pathname === '/api/ai/runs') {
      const user = requireUser(request, response); if (!user) return true;
      const rows = db.prepare('SELECT id, template_id, created_at FROM ai_runs WHERE user_id = ? ORDER BY created_at DESC').all(user.id);
      const templateNames = Object.fromEntries(readTemplates().map((template) => [template.id, template.name]));
      return sendJson(response, 200, { runs: rows.map((row) => ({ id: row.id, templateId: row.template_id, templateName: templateNames[row.template_id] || row.template_id, createdAt: row.created_at })) });
    }
    const runMatch = pathname.match(/^\/api\/ai\/runs\/([^/]+)$/);
    if (request.method === 'GET' && runMatch) {
      const user = requireUser(request, response); if (!user) return true;
      const row = db.prepare('SELECT * FROM ai_runs WHERE id = ?').get(runMatch[1]);
      if (!row) return sendJson(response, 404, { error: 'AI run not found.' });
      if (row.user_id !== user.id && !['ADMIN', 'INSTRUCTOR'].includes(user.role)) return sendJson(response, 403, { error: 'You can only view your own AI experiments.' });
      return sendJson(response, 200, { run: { id: row.id, templateId: row.template_id, createdAt: row.created_at, input: JSON.parse(row.input), output: JSON.parse(row.output) }, disclaimer: AI_DISCLAIMER });
    }
    if (request.method === 'GET' && pathname === '/api/ai/followups') {
      const user = requireUser(request, response); if (!user) return true;
      const rows = db.prepare('SELECT f.*, l.contact_name, c.name AS company_name FROM ai_followups f JOIN leads l ON l.id = f.lead_id JOIN companies c ON c.id = l.company_id WHERE f.user_id = ? ORDER BY f.created_at DESC').all(user.id);
      return sendJson(response, 200, { followups: rows.map((row) => ({ id: row.id, leadId: row.lead_id, contactName: row.contact_name, companyName: row.company_name, draft: row.draft, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at, approvedAt: row.approved_at, sentAt: row.sent_at })) });
    }
    if (request.method === 'POST' && pathname === '/api/ai/followups') {
      const user = requireUser(request, response); if (!user) return true;
      const body = followupSchema.parse(await readJson(request));
      const lead = db.prepare('SELECT id FROM leads WHERE id = ?').get(body.leadId);
      if (!lead) return sendJson(response, 404, { error: 'Lead not found.' });
      const { output } = runTemplate(db, referenceDate, 'follow-up', { leadId: body.leadId });
      const now = new Date().toISOString();
      const followup = { id: `fup-${crypto.randomUUID()}`, userId: user.id, leadId: body.leadId, draft: output.draft || '', status: 'DRAFT', createdAt: now, updatedAt: now };
      db.prepare('INSERT INTO ai_followups (id, user_id, lead_id, draft, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(followup.id, followup.userId, followup.leadId, followup.draft, followup.status, followup.createdAt, followup.updatedAt);
      return sendJson(response, 201, { followup: { id: followup.id, leadId: followup.leadId, draft: followup.draft, status: followup.status, createdAt: followup.createdAt, updatedAt: followup.updatedAt }, notice: 'Draft created for human review. Approve it, then mark it sent in the simulation — nothing is ever sent automatically.' });
    }
    const followupMatch = pathname.match(/^\/api\/ai\/followups\/([^/]+)$/);
    if (request.method === 'PUT' && followupMatch) {
      const user = requireUser(request, response); if (!user) return true;
      const row = db.prepare('SELECT * FROM ai_followups WHERE id = ?').get(followupMatch[1]);
      if (!row) return sendJson(response, 404, { error: 'Follow-up not found.' });
      if (row.user_id !== user.id) return sendJson(response, 403, { error: 'You can only edit your own follow-up drafts.' });
      if (row.status !== 'DRAFT') return sendJson(response, 400, { error: 'Only draft follow-ups can be edited.' });
      const body = draftSchema.parse(await readJson(request));
      db.prepare('UPDATE ai_followups SET draft = ?, updated_at = ? WHERE id = ?').run(body.draft, new Date().toISOString(), row.id);
      return sendJson(response, 200, { followup: { id: row.id, draft: body.draft, status: 'DRAFT', updatedAt: new Date().toISOString() } });
    }
    const followupActionMatch = pathname.match(/^\/api\/ai\/followups\/([^/]+)\/(approve|send)$/);
    if (request.method === 'POST' && followupActionMatch) {
      const user = requireUser(request, response); if (!user) return true;
      const row = db.prepare('SELECT * FROM ai_followups WHERE id = ?').get(followupActionMatch[1]);
      if (!row) return sendJson(response, 404, { error: 'Follow-up not found.' });
      if (row.user_id !== user.id) return sendJson(response, 403, { error: 'You can only review your own follow-up drafts.' });
      const action = followupActionMatch[2];
      const now = new Date().toISOString();
      if (action === 'approve') {
        if (row.status !== 'DRAFT') return sendJson(response, 400, { error: 'Only draft follow-ups can be approved.' });
        db.prepare('UPDATE ai_followups SET status = ?, approved_at = ?, updated_at = ? WHERE id = ?').run('APPROVED', now, now, row.id);
        return sendJson(response, 200, { followup: { id: row.id, status: 'APPROVED', approvedAt: now }, notice: 'Approved for simulated sending. The message is not sent until you mark it sent.' });
      }
      if (row.status !== 'APPROVED') return sendJson(response, 400, { error: 'Approve the draft before marking it sent — no message is ever sent without human approval.' });
      db.prepare('UPDATE ai_followups SET status = ?, sent_at = ?, updated_at = ? WHERE id = ?').run('SENT', now, now, row.id);
      return sendJson(response, 200, { followup: { id: row.id, status: 'SENT', sentAt: now }, notice: 'Marked sent in the simulation. No real message was delivered.' });
    }
    return false;
  };
}
