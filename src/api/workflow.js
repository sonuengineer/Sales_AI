import crypto from 'node:crypto';
import { z } from 'zod';
import { readJson } from './context.js';
import { applyAssignments, computeScoreForAll, mergedFactorConfig, mergedRuleConfig, readFactors, readRules, readTargetIndustries, readWorkflows, sandboxResults, scoreForLead, simulateAssignments } from '../scoring.js';

const scoringSchema = z.object({
  targetIndustries: z.array(z.string().trim().min(1)).optional(),
  factors: z.array(z.object({ id: z.string().min(1), points: z.coerce.number().int().min(0).max(100).optional(), enabled: z.boolean().optional() })).optional()
});
const RULE_FIELDS = ['employeeSize', 'industry', 'region', 'source', 'stage', 'score'];
const RULE_OPERATORS = ['IN', 'NOT_IN', 'EQUALS', 'GTE', 'LTE', 'CONTAINS_ANY'];
const ruleSchema = z.object({ name: z.string().trim().min(1), priority: z.coerce.number().int().min(1), field: z.enum(RULE_FIELDS), operator: z.enum(RULE_OPERATORS), value: z.union([z.string(), z.array(z.string())]), assignTo: z.string().nullable().optional() });
const sandboxSchema = z.object({
  name: z.string().trim().min(1),
  factors: z.array(z.object({ id: z.string().min(1), points: z.coerce.number().int().min(0).max(100).optional(), enabled: z.boolean().optional() })).optional(),
  rules: z.array(z.object({ id: z.string().min(1), enabled: z.boolean().optional(), assignTo: z.string().nullable().optional() })).optional()
});

export function createWorkflowRoutes(ctx) {
  const { db, referenceDate, sendJson, LEAD_JOIN, allLeads, serializeRuleValue, scoringFactorsView, requireUser, requireCrmManager } = ctx;
  return async function workflowRoutes(request, response, pathname) {
    if (request.method === 'GET' && pathname === '/api/scoring') {
      const user = requireUser(request, response); if (!user) return true;
      return sendJson(response, 200, { factors: scoringFactorsView(), targetIndustries: readTargetIndustries(db), definition: 'Lead score = the sum of points from every matching factor, capped at 100. Factors cover company fit, industry fit, decision-maker role, engagement and intent.' });
    }
    if (request.method === 'PUT' && pathname === '/api/scoring') {
      const user = requireCrmManager(request, response); if (!user) return true;
      const body = scoringSchema.parse(await readJson(request));
      if (body.targetIndustries) db.prepare('UPDATE platform_settings SET value = ? WHERE key = ?').run(JSON.stringify(body.targetIndustries), 'targetIndustries');
      if (body.factors) {
        const update = db.prepare('UPDATE scoring_factors SET points = ?, enabled = ? WHERE id = ?');
        for (const override of body.factors) {
          const factor = db.prepare('SELECT points, enabled FROM scoring_factors WHERE id = ?').get(override.id);
          if (!factor) continue;
          update.run(override.points ?? factor.points, override.enabled === undefined ? factor.enabled : (override.enabled ? 1 : 0), override.id);
        }
      }
      computeScoreForAll(db, referenceDate);
      return sendJson(response, 200, { factors: scoringFactorsView(), targetIndustries: readTargetIndustries(db) });
    }
    if (request.method === 'GET' && pathname === '/api/scoring/leads') {
      const user = requireUser(request, response); if (!user) return true;
      const factors = readFactors(db);
      const leads = db.prepare(`${LEAD_JOIN} WHERE l.stage NOT IN ('CLOSED_WON', 'CLOSED_LOST') ORDER BY l.created_at DESC`).all();
      const rows = leads.map((lead) => { const { score, matched } = scoreForLead(lead, lead, factors, referenceDate); return { id: lead.id, contactName: lead.contact_name, companyName: lead.company_name, stage: lead.stage, score, matched }; });
      return sendJson(response, 200, { leads: rows });
    }
    if (request.method === 'GET' && pathname === '/api/assignment') {
      const user = requireUser(request, response); if (!user) return true;
      const rules = readRules(db);
      const salespeople = db.prepare('SELECT sp.id, COALESCE(u.name, sp.name) AS name, sp.capacity FROM salespeople sp LEFT JOIN users u ON u.id = sp.user_id ORDER BY name').all();
      const openCounts = db.prepare("SELECT owner_id, COUNT(*) AS count FROM leads WHERE owner_id IS NOT NULL AND stage NOT IN ('CLOSED_WON', 'CLOSED_LOST') GROUP BY owner_id").all();
      const counts = Object.fromEntries(openCounts.map((row) => [row.owner_id, row.count]));
      return sendJson(response, 200, { rules, salespeople: salespeople.map((sp) => ({ id: sp.id, name: sp.name, capacity: sp.capacity, openLeads: counts[sp.id] || 0 })) });
    }
    if (request.method === 'POST' && pathname === '/api/assignment') {
      const user = requireCrmManager(request, response); if (!user) return true;
      const body = ruleSchema.parse(await readJson(request));
      const rule = { id: `rule-${crypto.randomUUID()}`, name: body.name, priority: body.priority, field: body.field, operator: body.operator, value: serializeRuleValue(body.value), assignTo: body.assignTo || null, enabled: true };
      db.prepare('INSERT INTO assignment_rules (id, name, priority, field, operator, value, assign_to, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, 1)').run(rule.id, rule.name, rule.priority, rule.field, rule.operator, rule.value, rule.assignTo);
      return sendJson(response, 201, { rule });
    }
    const assignmentRuleMatch = pathname.match(/^\/api\/assignment\/rules\/([^/]+)$/);
    if (request.method === 'PUT' && assignmentRuleMatch) {
      const user = requireCrmManager(request, response); if (!user) return true;
      const existing = db.prepare('SELECT * FROM assignment_rules WHERE id = ?').get(assignmentRuleMatch[1]);
      if (!existing) return sendJson(response, 404, { error: 'Assignment rule not found.' });
      const body = ruleSchema.partial().parse(await readJson(request));
      if (body.name) db.prepare('UPDATE assignment_rules SET name = ? WHERE id = ?').run(body.name, existing.id);
      if (body.priority !== undefined) db.prepare('UPDATE assignment_rules SET priority = ? WHERE id = ?').run(body.priority, existing.id);
      if (body.field) db.prepare('UPDATE assignment_rules SET field = ? WHERE id = ?').run(body.field, existing.id);
      if (body.operator) db.prepare('UPDATE assignment_rules SET operator = ? WHERE id = ?').run(body.operator, existing.id);
      if (body.value !== undefined) db.prepare('UPDATE assignment_rules SET value = ? WHERE id = ?').run(serializeRuleValue(body.value), existing.id);
      if (body.assignTo !== undefined) db.prepare('UPDATE assignment_rules SET assign_to = ? WHERE id = ?').run(body.assignTo || null, existing.id);
      return sendJson(response, 200, { rule: db.prepare('SELECT * FROM assignment_rules WHERE id = ?').get(existing.id) });
    }
    if (request.method === 'DELETE' && assignmentRuleMatch) {
      const user = requireCrmManager(request, response); if (!user) return true;
      const existing = db.prepare('SELECT id FROM assignment_rules WHERE id = ?').get(assignmentRuleMatch[1]);
      if (!existing) return sendJson(response, 404, { error: 'Assignment rule not found.' });
      db.prepare('DELETE FROM assignment_rules WHERE id = ?').run(existing.id);
      return sendJson(response, 200, { ok: true });
    }
    if (request.method === 'GET' && pathname === '/api/assignment/simulate') {
      const user = requireUser(request, response); if (!user) return true;
      const simulation = simulateAssignments(db, referenceDate);
      const ownerNames = new Map(db.prepare('SELECT sp.id, COALESCE(u.name, sp.name) AS name FROM salespeople sp LEFT JOIN users u ON u.id = sp.user_id').all().map((row) => [row.id, row.name]));
      return sendJson(response, 200, { ...simulation, results: simulation.results.map((row) => ({ ...row, currentOwnerName: ownerNames.get(row.currentOwnerId) || null, suggestedOwnerName: row.suggestedOwnerId ? ownerNames.get(row.suggestedOwnerId) || null : null })) });
    }
    if (request.method === 'POST' && pathname === '/api/assignment/apply') {
      const user = requireCrmManager(request, response); if (!user) return true;
      const { applied } = applyAssignments(db, referenceDate, user.id);
      return sendJson(response, 200, { applied });
    }
    if (request.method === 'GET' && pathname === '/api/workflows') {
      const user = requireUser(request, response); if (!user) return true;
      return sendJson(response, 200, { workflows: readWorkflows(db) });
    }
    if (request.method === 'GET' && pathname === '/api/alerts') {
      const user = requireUser(request, response); if (!user) return true;
      const open = allLeads().filter((lead) => !['CLOSED_WON', 'CLOSED_LOST'].includes(lead.stage));
      const stale = open.filter((lead) => ['AT_RISK', 'STALE'].includes(lead.staleBucket));
      const unassigned = open.filter((lead) => !lead.ownerId);
      const overdue = open.filter((lead) => lead.nextActionAt && new Date(lead.nextActionAt) < referenceDate);
      return sendJson(response, 200, { stale, unassigned, overdue });
    }
    if (request.method === 'GET' && pathname === '/api/sandbox/runs') {
      const user = requireUser(request, response); if (!user) return true;
      const isManager = ['ADMIN', 'INSTRUCTOR'].includes(user.role);
      const rows = isManager
        ? db.prepare('SELECT r.*, u.name AS creator_name FROM sandbox_runs r LEFT JOIN users u ON u.id = r.user_id ORDER BY r.created_at DESC').all()
        : db.prepare('SELECT r.*, u.name AS creator_name FROM sandbox_runs r LEFT JOIN users u ON u.id = r.user_id WHERE r.user_id = ? ORDER BY r.created_at DESC').all(user.id);
      return sendJson(response, 200, { runs: rows.map((row) => ({ id: row.id, name: row.name, creatorName: row.creator_name || '—', createdAt: row.created_at, summary: JSON.parse(row.results).summary })) });
    }
    if (request.method === 'POST' && pathname === '/api/sandbox/runs') {
      const user = requireUser(request, response); if (!user) return true;
      const body = sandboxSchema.parse(await readJson(request));
      const factors = mergedFactorConfig(db, body.factors);
      const rules = mergedRuleConfig(db, body.rules);
      const results = sandboxResults(db, referenceDate, { factors, rules });
      const run = { id: `run-${crypto.randomUUID()}`, userId: user.id, name: body.name, factors: JSON.stringify(factors.map(({ value, ...factor }) => factor)), rules: JSON.stringify(rules), results: JSON.stringify(results), createdAt: new Date().toISOString() };
      db.prepare('INSERT INTO sandbox_runs (id, user_id, name, factors, rules, results, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(run.id, run.userId, run.name, run.factors, run.rules, run.results, run.createdAt);
      return sendJson(response, 201, { run: { id: run.id, name: run.name, creatorName: user.name, createdAt: run.createdAt, summary: results.summary } });
    }
    const sandboxRunMatch = pathname.match(/^\/api\/sandbox\/runs\/([^/]+)$/);
    if (request.method === 'GET' && sandboxRunMatch) {
      const user = requireUser(request, response); if (!user) return true;
      const row = db.prepare('SELECT * FROM sandbox_runs WHERE id = ?').get(sandboxRunMatch[1]);
      if (!row) return sendJson(response, 404, { error: 'Sandbox run not found.' });
      if (!['ADMIN', 'INSTRUCTOR'].includes(user.role) && row.user_id !== user.id) return sendJson(response, 403, { error: 'You can only view your own sandbox experiments.' });
      return sendJson(response, 200, { run: { id: row.id, name: row.name, createdAt: row.created_at, factors: JSON.parse(row.factors), rules: JSON.parse(row.rules), results: JSON.parse(row.results) } });
    }
    return false;
  };
}
