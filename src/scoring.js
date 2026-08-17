import crypto from 'node:crypto';

export function daysSince(referenceDate, dateString) {
  return Math.floor((referenceDate - new Date(dateString)) / 86_400_000);
}

const ARRAY_OPERATORS = ['IN', 'NOT_IN', 'CONTAINS_ANY'];
const CLOSED = ['CLOSED_WON', 'CLOSED_LOST'];

function parseValue(stored, operator) {
  if (ARRAY_OPERATORS.includes(operator)) {
    try { const parsed = JSON.parse(stored); return Array.isArray(parsed) ? parsed : [String(stored)]; } catch { return [String(stored)]; }
  }
  return String(stored);
}

export function fieldValue(field, lead, company, score) {
  switch (field) {
    case 'employeeSize': return company?.employee_size || '';
    case 'industry': return company?.industry || '';
    case 'region': return company?.region || '';
    case 'jobTitle': return lead.job_title || '';
    case 'source': return lead.source || '';
    case 'stage': return lead.stage || '';
    case 'score': return score ?? 0;
    case 'lastActivityAt': return lead.last_activity_at || null;
    default: return '';
  }
}

export function matchOperator(operator, value, stored) {
  const target = parseValue(stored, operator);
  switch (operator) {
    case 'IN': return target.includes(String(value));
    case 'NOT_IN': return !target.includes(String(value));
    case 'CONTAINS_ANY': return target.some((keyword) => String(value).toLowerCase().includes(String(keyword).toLowerCase()));
    case 'GTE': return Number(value) >= Number(target);
    case 'LTE': return Number(value) <= Number(target);
    case 'EQUALS': return String(value) === target;
    default: return false;
  }
}

export function evaluateFactor(factor, lead, company, referenceDate) {
  if (factor.field === 'lastActivityAt') {
    if (factor.operator !== 'WITHIN_DAYS' || !lead.last_activity_at) return false;
    return daysSince(referenceDate, lead.last_activity_at) <= Number(factor.value);
  }
  return matchOperator(factor.operator, fieldValue(factor.field, lead, company), factor.value);
}

export function scoreForLead(lead, company, factors, referenceDate) {
  const matched = factors.filter((factor) => factor.enabled && evaluateFactor(factor, lead, company, referenceDate));
  const score = Math.min(100, matched.reduce((sum, factor) => sum + factor.points, 0));
  return { score, matched: matched.map((factor) => ({ id: factor.id, category: factor.category, label: factor.label, points: factor.points })) };
}

export function readTargetIndustries(db) {
  const row = db.prepare("SELECT value FROM platform_settings WHERE key = 'targetIndustries'").get();
  try { return row ? JSON.parse(row.value) : []; } catch { return []; }
}

export function readFactors(db) {
  const targetIndustries = readTargetIndustries(db);
  return db.prepare('SELECT * FROM scoring_factors ORDER BY position').all().map((row) => ({
    id: row.id, category: row.category, label: row.label, field: row.field, operator: row.operator,
    value: row.value === '<targetIndustries>' ? JSON.stringify(targetIndustries) : row.value,
    points: row.points, position: row.position, enabled: !!row.enabled,
  }));
}

export function readRules(db) {
  return db.prepare('SELECT * FROM assignment_rules ORDER BY priority').all().map((row) => ({
    id: row.id, name: row.name, priority: row.priority, field: row.field, operator: row.operator,
    value: row.value, assignTo: row.assign_to, enabled: !!row.enabled,
  }));
}

export function mergedFactorConfig(db, overrides = []) {
  const factors = readFactors(db);
  for (const override of overrides) {
    const factor = factors.find((entry) => entry.id === override.id);
    if (!factor) continue;
    if (override.points !== undefined) factor.points = Number(override.points);
    if (override.enabled !== undefined) factor.enabled = Boolean(override.enabled);
  }
  return factors;
}

export function mergedRuleConfig(db, overrides = []) {
  const rules = readRules(db);
  for (const override of overrides) {
    const rule = rules.find((entry) => entry.id === override.id);
    if (!rule) continue;
    if (override.enabled !== undefined) rule.enabled = Boolean(override.enabled);
    if (override.assignTo !== undefined) rule.assignTo = override.assignTo || null;
  }
  return rules;
}

const LEAD_COMPANY_JOIN = `SELECT l.id, l.company_id, l.contact_name, l.job_title, l.email, l.source, l.owner_id, l.stage, l.score, l.created_at, l.last_activity_at, l.next_action_at, l.expected_value, c.name AS company_name, c.industry, c.employee_size, c.region FROM leads l JOIN companies c ON c.id = l.company_id`;

export function computeScoreForAll(db, referenceDate) {
  const factors = readFactors(db);
  const leads = db.prepare(LEAD_COMPANY_JOIN).all();
  const update = db.prepare('UPDATE leads SET score = ? WHERE id = ?');
  for (const lead of leads) {
    const { score } = scoreForLead(lead, lead, factors, referenceDate);
    update.run(score, lead.id);
  }
  return leads.length;
}

function salespersonWorkload(db) {
  const salespeople = db.prepare('SELECT sp.id, COALESCE(u.name, sp.name) AS name, sp.capacity FROM salespeople sp LEFT JOIN users u ON u.id = sp.user_id').all();
  const workload = new Map(salespeople.map((sp) => [sp.id, { id: sp.id, name: sp.name, capacity: Number(sp.capacity || 0), openLeads: 0 }]));
  const openCounts = db.prepare('SELECT owner_id, COUNT(*) AS count FROM leads WHERE owner_id IS NOT NULL AND stage NOT IN (\'CLOSED_WON\', \'CLOSED_LOST\') GROUP BY owner_id').all();
  for (const row of openCounts) if (workload.has(row.owner_id)) workload.get(row.owner_id).openLeads += row.count;
  return workload;
}

export function assignLead(lead, rules, workload, score) {
  const skipped = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (!matchOperator(rule.operator, fieldValue(rule.field, lead, lead, score), rule.value)) continue;
    const target = rule.assignTo;
    const entry = target ? workload.get(target) : null;
    if (entry && entry.openLeads >= entry.capacity) {
      skipped.push(`“${rule.name}” skipped — ${entry.name} is at capacity`);
      continue;
    }
    if (entry) entry.openLeads += 1;
    const note = skipped.length ? ` — ${skipped.join('; ')}` : '';
    return { suggestedOwnerId: target, ruleName: rule.name, rulePriority: rule.priority, reason: `Matched rule “${rule.name}” (priority ${rule.priority})${note}` };
  }
  return { suggestedOwnerId: null, ruleName: null, rulePriority: null, reason: skipped.length ? `No rule applied — ${skipped.join('; ')}` : 'No rule matched — leave unassigned' };
}

export function simulateAssignments(db, referenceDate, { factors = readFactors(db), rules = readRules(db) } = {}) {
  const workload = salespersonWorkload(db);
  const leads = db.prepare(`${LEAD_COMPANY_JOIN} WHERE l.stage NOT IN ('CLOSED_WON', 'CLOSED_LOST')`).all();
  const results = leads.map((lead) => {
    const { score } = scoreForLead(lead, lead, factors, referenceDate);
    const outcome = assignLead(lead, rules, workload, score);
    return { leadId: lead.id, contactName: lead.contact_name, companyName: lead.company_name, currentOwnerId: lead.owner_id, suggestedOwnerId: outcome.suggestedOwnerId, ruleName: outcome.ruleName, reason: outcome.reason };
  });
  return {
    results,
    workload: [...workload.values()],
    summary: {
      assigned: results.filter((row) => row.suggestedOwnerId).length,
      unassigned: results.filter((row) => !row.suggestedOwnerId).length,
      changed: results.filter((row) => row.suggestedOwnerId && row.suggestedOwnerId !== row.currentOwnerId).length,
    },
  };
}

export function applyAssignments(db, referenceDate, userId) {
  const { results } = simulateAssignments(db, referenceDate);
  const update = db.prepare('UPDATE leads SET owner_id = ? WHERE id = ?');
  const insertActivity = db.prepare('INSERT INTO activities (id, lead_id, type, subject, occurred_at, owner_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const now = new Date().toISOString();
  let applied = 0;
  for (const result of results) {
    if (!result.suggestedOwnerId || result.suggestedOwnerId === result.currentOwnerId) continue;
    update.run(result.suggestedOwnerId, result.leadId);
    insertActivity.run(`act-${crypto.randomUUID()}`, result.leadId, 'NOTE', `Assigned by rules — ${result.ruleName}`, now, userId, 'Auto-assignment from the workflow lab.');
    applied += 1;
  }
  return { applied, results };
}

export function sandboxResults(db, referenceDate, { factors, rules }) {
  const baseFactors = readFactors(db);
  const workload = salespersonWorkload(db);
  const ownerNames = new Map(db.prepare('SELECT sp.id, COALESCE(u.name, sp.name) AS name FROM salespeople sp LEFT JOIN users u ON u.id = sp.user_id').all().map((row) => [row.id, row.name]));
  const leads = db.prepare(`${LEAD_COMPANY_JOIN} WHERE l.stage NOT IN ('CLOSED_WON', 'CLOSED_LOST')`).all();
  const results = leads.map((lead) => {
    const base = scoreForLead(lead, lead, baseFactors, referenceDate);
    const custom = scoreForLead(lead, lead, factors, referenceDate);
    const outcome = assignLead(lead, rules, workload, custom.score);
    const newOwnerId = outcome.suggestedOwnerId;
    return {
      id: lead.id, contactName: lead.contact_name, companyName: lead.company_name,
      baseScore: base.score, newScore: custom.score,
      baseOwnerId: lead.owner_id, baseOwnerName: ownerNames.get(lead.owner_id) || null,
      newOwnerId, newOwnerName: newOwnerId ? ownerNames.get(newOwnerId) || null : null,
      ruleName: outcome.ruleName, reason: outcome.reason,
    };
  });
  return {
    results,
    summary: {
      scoreUp: results.filter((row) => row.newScore > row.baseScore).length,
      scoreDown: results.filter((row) => row.newScore < row.baseScore).length,
      reassigned: results.filter((row) => row.newOwnerId && row.newOwnerId !== row.baseOwnerId).length,
    },
  };
}

export function readWorkflows(db) {
  const steps = db.prepare('SELECT * FROM workflow_steps ORDER BY workflow, position').all();
  const groups = [
    ['VALIDATION', 'Lead validation', 'Make sure every lead is real, enriched and ready to score.'],
    ['ASSIGNMENT', 'Lead assignment', 'Score every lead, match assignment rules and route to the right rep.'],
    ['FOLLOW_UP', 'Follow-up', 'Structured outreach that keeps leads moving and measures response TAT.'],
    ['ESCALATION', 'Escalation', 'Catch stale leads before they go cold and route them to a manager.'],
  ];
  return groups.map(([id, name, description]) => ({
    id, name, description,
    steps: steps.filter((step) => step.workflow === id).map((step) => ({ id: step.id, workflow: step.workflow, position: step.position, name: step.name, description: step.description || '', actor: step.actor || '', condition: step.condition || '' })),
  }));
}

export { CLOSED };
