import { describe, it, expect } from 'vitest';
import { withServer, signIn } from './helpers';

async function json(base: string, path: string, cookie?: string, init: RequestInit = {}) {
  const response = await fetch(`${base}${path}`, { ...init, headers: { Cookie: cookie || '', ...(init.headers || {}) } });
  return { response, body: await response.json() as Record<string, unknown> };
}
const postJson = (base: string, path: string, cookie: string, body: unknown) => json(base, path, cookie, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

describe('AI practice lab — templates and runs', () => {
  it('requires authentication for all AI lab endpoints', async () => {
    await withServer(async (base) => {
      expect((await fetch(`${base}/api/ai/templates`)).status).toBe(401);
      expect((await fetch(`${base}/api/ai/runs`)).status).toBe(401);
      expect((await fetch(`${base}/api/ai/followups`)).status).toBe(401);
    });
  });

  it('lists six templates clearly labelled as simulated', async () => {
    await withServer(async (base) => {
      const { cookie } = await signIn(base, 'student@nexaflow.demo');
      const { body } = await json(base, '/api/ai/templates', cookie);
      const templates = body.templates as Array<{ id: string; name: string; requires: string[] }>;
      expect(templates.length).toBe(6);
      const ids = templates.map((template) => template.id);
      for (const id of ['company-research', 'lead-qualification', 'follow-up', 'meeting-summary', 'reporting', 'competitor-research']) expect(ids).toContain(id);
      expect(String(body.disclaimer)).toContain('Simulated');
    });
  });

  it('qualifies a lead with score, reason, pain points, questions and next action', async () => {
    await withServer(async (base) => {
      const { cookie } = await signIn(base, 'student@nexaflow.demo');
      const created = await postJson(base, '/api/ai/run', cookie, { templateId: 'lead-qualification', leadId: 'lead-001' });
      expect(created.response.status).toBe(201);
      const output = created.body.output as { score: number; qualification: string; reason: string; painPoints: string[]; suggestedQuestions: string[]; nextAction: string };
      expect(output.score).toBe(100);
      expect(output.qualification).toContain('Qualified');
      expect(output.reason).toContain('100');
      expect(output.painPoints.length).toBeGreaterThan(0);
      expect(output.suggestedQuestions.length).toBe(3);
      expect(output.nextAction.length).toBeGreaterThan(0);
    });
  });

  it('generates a personalised follow-up draft from CRM data', async () => {
    await withServer(async (base) => {
      const { cookie } = await signIn(base, 'student@nexaflow.demo');
      const created = await postJson(base, '/api/ai/run', cookie, { templateId: 'follow-up', leadId: 'lead-001' });
      const output = created.body.output as { draft: string; lead: { companyName: string } };
      expect(output.draft).toContain('AtlasHR');
      expect(output.draft).toContain('Maya');
      expect(created.body.prompt).toContain('follow-up email');
    });
  });

  it('runs are saved to history for the owner with the prompt for reuse', async () => {
    await withServer(async (base) => {
      const { cookie } = await signIn(base, 'student@nexaflow.demo');
      const created = await postJson(base, '/api/ai/run', cookie, { templateId: 'company-research', companyId: 'cmp-001' });
      expect(created.response.status).toBe(201);
      expect((created.body.output as { company: { name: string } }).company.name).toBe('AtlasHR');
      expect(String(created.body.prompt)).toContain('AtlasHR');
      const { body } = await json(base, '/api/ai/runs', cookie);
      const runs = body.runs as Array<{ templateId: string; templateName: string }>;
      expect(runs.length).toBe(1);
      expect(runs[0].templateName).toBe('Company research');
    });
  });
});

describe('AI practice lab — follow-up review', () => {
  it('enforces the human-approval rule: draft → approve → send', async () => {
    await withServer(async (base) => {
      const { cookie } = await signIn(base, 'student@nexaflow.demo');
      const created = await postJson(base, '/api/ai/followups', cookie, { leadId: 'lead-001' });
      expect(created.response.status).toBe(201);
      const id = (created.body.followup as { id: string }).id;
      // A draft can never be sent without approval
      const premature = await postJson(base, `/api/ai/followups/${id}/send`, cookie, {});
      expect(premature.response.status).toBe(400);
      // Drafts can be edited before approval
      const edit = await json(base, `/api/ai/followups/${id}`, cookie, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draft: 'Edited draft message.' }) });
      expect(edit.response.status).toBe(200);
      const approve = await postJson(base, `/api/ai/followups/${id}/approve`, cookie, {});
      expect(approve.response.status).toBe(200);
      // Approved drafts can no longer be edited, but can be marked sent (simulated)
      const lateEdit = await json(base, `/api/ai/followups/${id}`, cookie, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draft: 'Too late.' }) });
      expect(lateEdit.response.status).toBe(400);
      const send = await postJson(base, `/api/ai/followups/${id}/send`, cookie, {});
      expect(send.response.status).toBe(200);
      const { body } = await json(base, '/api/ai/followups', cookie);
      const followups = body.followups as Array<{ id: string; status: string; draft: string }>;
      expect(followups[0].status).toBe('SENT');
      expect(followups[0].draft).toBe('Edited draft message.');
    });
  });

  it('users cannot edit or approve someone else’s draft', async () => {
    await withServer(async (base) => {
      const admin = (await signIn(base, 'admin@nexaflow.demo')).cookie;
      const student = (await signIn(base, 'student@nexaflow.demo')).cookie;
      const created = await postJson(base, '/api/ai/followups', admin, { leadId: 'lead-001' });
      const id = (created.body.followup as { id: string }).id;
      const edit = await json(base, `/api/ai/followups/${id}`, student, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draft: 'hijack' }) });
      expect(edit.response.status).toBe(403);
      const approve = await postJson(base, `/api/ai/followups/${id}/approve`, student, {});
      expect(approve.response.status).toBe(403);
    });
  });
});
