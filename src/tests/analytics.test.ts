import { describe, it, expect } from 'vitest';
import { withServer, signIn } from './helpers';

describe('sales intelligence analytics', () => {
  it('requires authentication for analytics pages', async () => {
    await withServer(async (base) => {
      expect((await fetch(`${base}/api/analytics`)).status).toBe(401);
      expect((await fetch(`${base}/api/analytics/tat`)).status).toBe(401);
      expect((await fetch(`${base}/api/analytics/stale`)).status).toBe(401);
    });
  });

  it('summary KPIs and funnel match the seeded CRM data', async () => {
    await withServer(async (base) => {
      const { cookie } = await signIn(base, 'student@nexaflow.demo');
      const { kpis, funnel, bySalesperson, bySource, byIndustry, bySegment } = await (await fetch(`${base}/api/analytics`, { headers: { Cookie: cookie } })).json();
      expect(kpis.totalLeads).toBe(12);
      expect(kpis.mql).toBe(3);
      expect(kpis.sql).toBe(2);
      expect(kpis.opportunities).toBe(1);
      expect(kpis.proposals).toBe(1);
      expect(kpis.wonDeals).toBe(1);
      expect(kpis.pipelineValue).toBe(126000);
      expect(kpis.revenue).toBe(48000);
      expect(kpis.winRate).toBe(50);
      const byStage = Object.fromEntries(funnel.map((entry: { stage: string; count: number }) => [entry.stage, entry.count]));
      expect(byStage.NEW).toBe(3);
      expect(byStage.MQL).toBe(3);
      expect(byStage.SQL).toBe(2);
      expect(byStage.OPPORTUNITY).toBe(1);
      expect(byStage.PROPOSAL).toBe(1);
      expect(byStage.CLOSED_WON).toBe(1);
      expect(bySalesperson.some((row: { label: string; leads: number }) => row.label === 'Unassigned' && row.leads === 3)).toBe(true);
      expect(bySalesperson.some((row: { label: string; leads: number }) => row.label === 'Taylor Shah' && row.leads === 3)).toBe(true);
      expect(bySource.some((row: { label: string; leads: number }) => row.label === 'Webinar' && row.leads === 2)).toBe(true);
      expect(byIndustry.some((row: { label: string }) => row.label === 'Human Resources')).toBe(true);
      expect(bySegment.some((row: { label: string; leads: number }) => row.label === 'Mid-market' && row.leads === 6)).toBe(true);
      expect(bySegment.some((row: { label: string }) => row.label === 'SMB')).toBe(true);
    });
  });

  it('period filter restricts the dataset', async () => {
    await withServer(async (base) => {
      const { cookie } = await signIn(base, 'instructor@nexaflow.demo');
      const thirty = await (await fetch(`${base}/api/analytics?period=30`, { headers: { Cookie: cookie } })).json();
      expect(thirty.kpis.totalLeads).toBe(7);
      const ninety = await (await fetch(`${base}/api/analytics?period=90`, { headers: { Cookie: cookie } })).json();
      expect(ninety.kpis.totalLeads).toBe(11);
      const invalid = await (await fetch(`${base}/api/analytics?period=999`, { headers: { Cookie: cookie } })).json();
      expect(invalid.kpis.totalLeads).toBe(12);
    });
  });

  it('TAT report defines response time and computes it from seeded stage history', async () => {
    await withServer(async (base) => {
      const { cookie } = await signIn(base, 'student@nexaflow.demo');
      const { definition, averageDays, rows } = await (await fetch(`${base}/api/analytics/tat`, { headers: { Cookie: cookie } })).json();
      expect(definition).toMatch(/turnaround/i);
      expect(averageDays).toBe(5.3);
      expect(rows.length).toBe(12);
      const byContact = Object.fromEntries(rows.map((row: { contactName: string }) => [row.contactName, row]));
      expect(byContact['Maya Rivera'].tatDays).toBe(8);
      expect(byContact['Elena Brooks'].tatDays).toBe(1);
      expect(byContact['Jordan Blake'].tatDays).toBe(3);
      expect(byContact['Sofia Delgado'].tatDays).toBeNull();
      expect(rows.every((row: { companyName: string; ownerName: string }) => row.companyName && row.ownerName)).toBe(true);
    });
  });

  it('stale report lists open leads sorted by days since last activity', async () => {
    await withServer(async (base) => {
      const { cookie } = await signIn(base, 'admin@nexaflow.demo');
      const { definition, rows } = await (await fetch(`${base}/api/analytics/stale`, { headers: { Cookie: cookie } })).json();
      expect(definition).toMatch(/stale/i);
      expect(rows.length).toBe(10); // 12 leads minus 2 closed
      expect(rows[0].contactName).toBe('Jordan Blake');
      expect(rows[0].daysSinceLastActivity).toBe(24);
      expect(rows[0].staleBucket).toBe('STALE');
      expect(rows.every((lead: { staleBucket: string }) => lead.staleBucket !== 'CLOSED')).toBe(true);
    });
  });
});
