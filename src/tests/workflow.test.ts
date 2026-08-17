import { describe, it, expect } from 'vitest';
import { withServer, signIn } from './helpers';

async function json(base: string, path: string, cookie?: string, init: RequestInit = {}) {
  const response = await fetch(`${base}${path}`, { ...init, headers: { Cookie: cookie || '', ...(init.headers || {}) } });
  return { response, body: await response.json() as Record<string, unknown> };
}

describe('workflow lab — lead scoring', () => {
  it('requires authentication for all workflow lab endpoints', async () => {
    await withServer(async (base) => {
      expect((await fetch(`${base}/api/scoring`)).status).toBe(401);
      expect((await fetch(`${base}/api/assignment`)).status).toBe(401);
      expect((await fetch(`${base}/api/assignment/simulate`)).status).toBe(401);
      expect((await fetch(`${base}/api/workflows`)).status).toBe(401);
      expect((await fetch(`${base}/api/alerts`)).status).toBe(401);
      expect((await fetch(`${base}/api/sandbox/runs`)).status).toBe(401);
    });
  });

  it('seeds the scoring model and workflow definitions', async () => {
    await withServer(async (base) => {
      const { cookie } = await signIn(base, 'student@nexaflow.demo');
      const scoring = await json(base, '/api/scoring', cookie);
      const factors = scoring.body.factors as Array<{ category: string; enabled: boolean }>;
      expect(factors.length).toBe(9);
      expect(factors.every((factor) => factor.enabled)).toBe(true);
      const categories = new Set(factors.map((factor) => factor.category));
      for (const category of ['COMPANY_FIT', 'INDUSTRY_FIT', 'DECISION_MAKER', 'ENGAGEMENT', 'INTENT']) expect(categories.has(category)).toBe(true);
      expect((scoring.body.targetIndustries as string[]).length).toBe(4);
      const workflows = (await json(base, '/api/workflows', cookie)).body.workflows as Array<{ id: string; steps: unknown[] }>;
      expect(workflows.length).toBe(4);
      expect(workflows.every((workflow) => workflow.steps.length === 4)).toBe(true);
    });
  });

  it('computes transparent, reproducible scores that match the stored lead score', async () => {
    await withServer(async (base) => {
      const { cookie } = await signIn(base, 'student@nexaflow.demo');
      const { body } = await json(base, '/api/scoring/leads', cookie);
      const leads = body.leads as Array<{ id: string; contactName: string; companyName: string; score: number; matched: Array<{ label: string; points: number }> }>;
      const maya = leads.find((lead) => lead.contactName === 'Maya Rivera')!;
      expect(maya.score).toBe(100);
      expect(maya.matched.length).toBe(6); // company fit + industry fit + decision maker + engagement + intent source + intent stage
      expect(maya.matched.some((factor) => factor.label.includes('Mid-market') && factor.points === 20)).toBe(true);
      expect(maya.matched.some((factor) => factor.label.includes('Decision-maker') && factor.points === 25)).toBe(true);
      const jordan = leads.find((lead) => lead.contactName === 'Jordan Blake')!;
      expect(jordan.score).toBe(35);
      // The breakdown matches the score the CRM displays for the same lead
      const detail = (await json(base, '/api/crm/leads/lead-001', cookie)).body;
      const breakdown = detail.scoreBreakdown as { score: number; matched: unknown[] };
      expect(breakdown.score).toBe(100);
      expect(breakdown.matched.length).toBe(6);
    });
  });

  it('recalculates every lead score when an instructor changes the model', async () => {
    await withServer(async (base) => {
      const { cookie } = await signIn(base, 'instructor@nexaflow.demo');
      const student = (await signIn(base, 'student@nexaflow.demo')).cookie;
      const before = (await json(base, '/api/scoring/leads', student)).body.leads as Array<{ contactName: string; score: number }>;
      expect(before.find((lead) => lead.contactName === 'Maya Rivera')!.score).toBe(100);
      // Turn off the high-intent-source factor (+15) and add Retail as a target industry
      const update = await json(base, '/api/scoring', cookie, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetIndustries: ['Human Resources', 'Retail'], factors: [{ id: 'fac-007', enabled: false }] }) });
      expect(update.response.status).toBe(200);
      const after = (await json(base, '/api/scoring/leads', student)).body.leads as Array<{ contactName: string; score: number }>;
      expect(after.find((lead) => lead.contactName === 'Maya Rivera')!.score).toBe(90); // 105 raw - 15 (source factor off)
      expect(after.find((lead) => lead.contactName === 'Elena Brooks')!.score).toBe(45); // 25 + 20 (Retail now a target industry)
      const denied = await json(base, '/api/scoring', student, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ factors: [{ id: 'fac-001', enabled: false }] }) });
      expect(denied.response.status).toBe(403);
    });
  });

  it('shows the score breakdown on the CRM lead detail', async () => {
    await withServer(async (base) => {
      const { cookie } = await signIn(base, 'student@nexaflow.demo');
      const { body } = await json(base, '/api/crm/leads/lead-005', cookie);
      const breakdown = body.scoreBreakdown as { score: number; matched: Array<{ category: string }> };
      expect(breakdown.score).toBe(100);
      expect(breakdown.matched.some((factor) => factor.category === 'DECISION_MAKER')).toBe(true);
    });
  });
});

describe('workflow lab — assignment rules', () => {
  it('lists rules and rep workload', async () => {
    await withServer(async (base) => {
      const { cookie } = await signIn(base, 'student@nexaflow.demo');
      const { body } = await json(base, '/api/assignment', cookie);
      expect((body.rules as unknown[]).length).toBe(5);
      const salespeople = body.salespeople as Array<{ id: string; name: string; capacity: number | null; openLeads: number }>;
      const taylor = salespeople.find((sp) => sp.name === 'Taylor Shah')!;
      expect(taylor.openLeads).toBe(3);
      expect(taylor.capacity).toBe(20);
    });
  });

  it('simulates assignment with clear explanations, without changing the CRM', async () => {
    await withServer(async (base) => {
      const { cookie } = await signIn(base, 'student@nexaflow.demo');
      const { body } = await json(base, '/api/assignment/simulate', cookie);
      const results = body.results as Array<{ contactName: string; currentOwnerName: string | null; suggestedOwnerName: string | null; ruleName: string | null; reason: string }>;
      expect(results.length).toBe(10); // 12 seeded leads minus 2 closed
      const summary = body.summary as { assigned: number; unassigned: number; changed: number };
      expect(summary.changed).toBe(5);
      const liam = results.find((row) => row.contactName === 'Liam O\'Connor')!;
      expect(liam.suggestedOwnerName).toBe('Priya Menon');
      expect(liam.reason).toMatch(/Europe region → Priya/);
      const elena = results.find((row) => row.contactName === 'Elena Brooks')!;
      expect(elena.suggestedOwnerName).toBe('Taylor Shah');
      expect(elena.reason).toMatch(/SMB accounts → Taylor/);
      // Simulation is read-only: the CRM still shows the seeded owners
      const detail = (await json(base, '/api/crm/leads/lead-003', cookie)).body;
      expect((detail.lead as { ownerId: string | null }).ownerId).toBeNull();
    });
  });

  it('skips rules targeting a rep at capacity', async () => {
    await withServer(async (base) => {
      const { cookie } = await signIn(base, 'instructor@nexaflow.demo');
      // Taylor already owns 3 open leads; set her capacity to 2 so she is at capacity
      const capacity = await json(base, '/api/crm/salespeople/sales-003', cookie, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ capacity: 2 }) });
      expect(capacity.response.status).toBe(200);
      const { body } = await json(base, '/api/assignment/simulate', cookie);
      const results = body.results as Array<{ contactName: string; suggestedOwnerName: string | null; reason: string }>;
      const elena = results.find((row) => row.contactName === 'Elena Brooks')!;
      expect(elena.suggestedOwnerName).toBe('Priya Menon'); // falls through to the catch-all rule
      expect(elena.reason).toMatch(/at capacity/);
    });
  });

  it('instructors can create, edit and delete rules, and apply them to the CRM', async () => {
    await withServer(async (base) => {
      const { cookie } = await signIn(base, 'instructor@nexaflow.demo');
      const created = await json(base, '/api/assignment', cookie, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Education → Taylor', priority: 6, field: 'industry', operator: 'IN', value: ['Education'], assignTo: 'sales-003' }) });
      expect(created.response.status).toBe(201);
      const rule = created.body.rule as { id: string };
      const edited = await json(base, `/api/assignment/rules/${rule.id}`, cookie, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Education & SMB → Taylor', priority: 6, field: 'industry', operator: 'IN', value: ['Education', 'Retail'], assignTo: 'sales-003', enabled: true }) });
      expect(edited.response.status).toBe(200);
      const denied = await json(base, '/api/assignment', (await signIn(base, 'student@nexaflow.demo')).cookie, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Nope', priority: 9, field: 'score', operator: 'GTE', value: '0', assignTo: null }) });
      expect(denied.response.status).toBe(403);
      const apply = await json(base, '/api/assignment/apply', cookie, { method: 'POST' });
      expect(apply.body.applied).toBe(5);
      const assigned = (await json(base, '/api/crm/leads/lead-008', cookie)).body;
      expect((assigned.lead as { ownerName: string }).ownerName).toBe('Taylor Shah');
      const deleted = await json(base, `/api/assignment/rules/${rule.id}`, cookie, { method: 'DELETE' });
      expect(deleted.response.status).toBe(200);
    });
  });
});

describe('workflow lab — alerts and sandbox', () => {
  it('alerts identify stale, unassigned and overdue leads', async () => {
    await withServer(async (base) => {
      const { cookie } = await signIn(base, 'admin@nexaflow.demo');
      const { body } = await json(base, '/api/alerts', cookie);
      const stale = body.stale as Array<{ contactName: string; staleBucket: string }>;
      const unassigned = body.unassigned as unknown[];
      const overdue = body.overdue as unknown[];
      expect(stale.length).toBe(3);
      expect(stale.every((lead) => ['AT_RISK', 'STALE'].includes(lead.staleBucket))).toBe(true);
      expect(stale.some((lead) => lead.contactName === 'Jordan Blake' && lead.staleBucket === 'STALE')).toBe(true);
      expect(unassigned.length).toBe(3);
      expect(overdue.length).toBe(3);
    });
  });

  it('sandbox experiments run on a copy and never mutate shared data', async () => {
    await withServer(async (base) => {
      const { cookie } = await signIn(base, 'student@nexaflow.demo');
      const before = (await json(base, '/api/scoring/leads', cookie)).body.leads as Array<{ contactName: string; score: number }>;
      // Experiment: turn off the decision-maker factor (+25) and the high-score assignment rule
      const created = await json(base, '/api/sandbox/runs', cookie, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'No DM weighting', factors: [{ id: 'fac-005', enabled: false }], rules: [{ id: 'rule-03', enabled: false }] }) });
      expect(created.response.status).toBe(201);
      const run = created.body.run as { id: string; summary: { scoreUp: number; scoreDown: number; reassigned: number } };
      expect(run.summary.scoreDown).toBeGreaterThan(0);
      const detail = (await json(base, `/api/sandbox/runs/${run.id}`, cookie)).body.run as { results: { results: Array<{ contactName: string; baseScore: number; newScore: number; baseOwnerName: string | null; newOwnerName: string | null }> } };
      const maya = detail.results.results.find((row) => row.contactName === 'Maya Rivera')!;
      expect(maya.baseScore).toBe(100);
      expect(maya.newScore).toBe(80); // 105 raw points minus 25 (decision-maker factor off)
      // Shared data is untouched
      const after = (await json(base, '/api/scoring/leads', cookie)).body.leads as Array<{ contactName: string; score: number }>;
      expect(after.find((lead) => lead.contactName === 'Maya Rivera')!.score).toBe(100);
      // Instructors can see the student's experiment; students see only their own
      const instructor = (await signIn(base, 'instructor@nexaflow.demo')).cookie;
      const instructorRuns = (await json(base, '/api/sandbox/runs', instructor)).body.runs as Array<{ creatorName: string }>;
      expect(instructorRuns.some((entry) => entry.creatorName === 'Taylor Shah')).toBe(true);
    });
  });
});
