import { describe, it, expect } from 'vitest';
import { withServer, signIn } from './helpers';

async function json(base: string, path: string, cookie: string) {
  const response = await fetch(`${base}${path}`, { headers: { Cookie: cookie } });
  return { response, body: await response.json() as Record<string, unknown> };
}

describe('calculation validation — analytics KPIs', () => {
  it('computes KPI counts, funnel and win rate from the seeded leads', async () => {
    await withServer(async (base) => {
      const { cookie } = await signIn(base, 'student@nexaflow.demo');
      const { body } = await json(base, '/api/analytics', cookie);
      const kpis = body.kpis as { totalLeads: number; mql: number; sql: number; opportunities: number; proposals: number; wonDeals: number; pipelineValue: number; revenue: number; winRate: number };
      // Seed: 12 leads — 3 NEW, 3 MQL, 2 SQL, 1 OPPORTUNITY, 1 PROPOSAL, 1 CLOSED_WON, 1 CLOSED_LOST
      expect(kpis.totalLeads).toBe(12);
      expect(kpis.mql).toBe(3);
      expect(kpis.sql).toBe(2);
      expect(kpis.opportunities).toBe(1);
      expect(kpis.proposals).toBe(1);
      expect(kpis.wonDeals).toBe(1);
      // Pipeline = OPPORTUNITY (54,000) + PROPOSAL (72,000); revenue = CLOSED_WON (48,000)
      expect(kpis.pipelineValue).toBe(126000);
      expect(kpis.revenue).toBe(48000);
      expect(kpis.winRate).toBe(50); // 1 won of 2 decided
      const funnel = body.funnel as Array<{ stage: string; count: number }>;
      const byStage = Object.fromEntries(funnel.map((row) => [row.stage, row.count]));
      expect(byStage.NEW).toBe(3);
      expect(byStage.MQL).toBe(3);
      expect(byStage.SQL).toBe(2);
      expect(byStage.OPPORTUNITY).toBe(1);
      expect(byStage.PROPOSAL).toBe(1);
      expect(byStage.CLOSED_WON).toBe(1);
      expect(byStage.CLOSED_LOST).toBeUndefined(); // closed-lost is excluded from the funnel
    });
  });

  it('breakdowns sum back to the total lead count', async () => {
    await withServer(async (base) => {
      const { cookie } = await signIn(base, 'student@nexaflow.demo');
      const { body } = await json(base, '/api/analytics', cookie);
      const total = (body.kpis as { totalLeads: number }).totalLeads;
      for (const key of ['bySource', 'byIndustry', 'bySegment'] as const) {
        const rows = body[key] as Array<{ leads: number }>;
        expect(rows.reduce((sum, row) => sum + row.leads, 0), key).toBe(total);
      }
      const bySalesperson = body.bySalesperson as Array<{ leads: number }>;
      expect(bySalesperson.reduce((sum, row) => sum + row.leads, 0)).toBe(total);
    });
  });
});

describe('calculation validation — TAT and stale leads', () => {
  it('TAT measures days from creation to first contact using activity or stage history', async () => {
    await withServer(async (base) => {
      const { cookie } = await signIn(base, 'student@nexaflow.demo');
      const { body } = await json(base, '/api/analytics/tat', cookie);
      expect((body.definition as string)).toContain('turnaround time');
      const rows = body.rows as Array<{ leadId: string; tatDays: number | null }>;
      // lead-001 created 2026-07-20; earliest stage movement 2026-07-28 → 8 days
      expect(rows.find((row) => row.leadId === 'lead-001')!.tatDays).toBe(8);
      // lead-003 created 2026-08-03; first activity 2026-08-04 → 1 day
      expect(rows.find((row) => row.leadId === 'lead-003')!.tatDays).toBe(1);
      // lead-008 has no activities or stage history → null
      expect(rows.find((row) => row.leadId === 'lead-008')!.tatDays).toBeNull();
      const averageDays = body.averageDays as number;
      expect(averageDays).toBeGreaterThan(0);
    });
  });

  it('stale-lead buckets follow the documented 0–3 / 4–7 / 8–15 / 15+ rules', async () => {
    await withServer(async (base) => {
      const { cookie } = await signIn(base, 'student@nexaflow.demo');
      const { body } = await json(base, '/api/analytics/stale', cookie);
      const rows = body.rows as Array<{ id: string; staleBucket: string; daysSinceLastActivity: number | null }>;
      const bucket = (id: string) => rows.find((row) => row.id === id)!;
      // Reference date 2026-08-16T00:00Z; days are floored
      expect(bucket('lead-001').staleBucket).toBe('NORMAL');  // last activity 08-12 → 3 days
      expect(bucket('lead-003').staleBucket).toBe('AT_RISK'); // last activity 08-04 → 11 days
      expect(bucket('lead-012').staleBucket).toBe('STALE');   // last activity 07-22 → 24 days
      expect(bucket('lead-011').staleBucket).toBe('ATTENTION'); // last activity 08-08 → 7 days
      // Closed leads are excluded from the stale report
      expect(rows.some((row) => row.id === 'lead-010')).toBe(false);
    });
  });

  it('stale buckets shown in the CRM match the analytics report', async () => {
    await withServer(async (base) => {
      const { cookie } = await signIn(base, 'student@nexaflow.demo');
      const stale = (await json(base, '/api/analytics/stale', cookie)).body.rows as Array<{ id: string; staleBucket: string }>;
      const leads = (await json(base, '/api/crm/leads?pageSize=50', cookie)).body.leads as Array<{ id: string; staleBucket: string }>;
      for (const row of stale) {
        const lead = leads.find((entry) => entry.id === row.id)!;
        expect(lead.staleBucket, row.id).toBe(row.staleBucket);
      }
    });
  });
});
