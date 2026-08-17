import { describe, it, expect } from 'vitest';
import { parseGlossary } from '../api/course.js';
import { withServer, signIn } from './helpers';

describe('parseGlossary — markdown table to structured terms', () => {
  it('parses the sales-metrics glossary into structured terms', () => {
    const content = `# Sales Metrics Glossary — NexaFlow Training

| Metric | Definition | Why it matters |
| Lead volume | Leads created in a period | Shows pipeline health at the top of the funnel |
| Conversion rate | % of leads advancing between two stages | Finds the bottleneck in the funnel |
| Win rate | Won ÷ (won + lost) | How often the team wins decided deals |
| Follow-up compliance | % of next actions completed on time | Whether the team does what it commits to |`;
    const terms = parseGlossary(content);
    expect(terms.length).toBe(4);
    expect(terms[0]).toEqual({ term: 'Lead volume', definition: 'Leads created in a period', whyItMatters: 'Shows pipeline health at the top of the funnel' });
    expect(terms[3].term).toBe('Follow-up compliance');
    expect(terms[3].definition).toBe('% of next actions completed on time');
  });

  it('skips the heading and separator rows and tolerates a missing trailing pipe', () => {
    const content = '| Metric | Definition | Why it matters |\n| --- | --- | --- |\n| TAT (turnaround time) | Days from lead creation to first contact | Long TAT kills deals';
    const terms = parseGlossary(content);
    expect(terms.length).toBe(1);
    expect(terms[0].term).toBe('TAT (turnaround time)');
    expect(terms[0].whyItMatters).toBe('Long TAT kills deals');
  });

  it('returns an empty array for empty or non-table content', () => {
    expect(parseGlossary('')).toEqual([]);
    expect(parseGlossary('just a paragraph')).toEqual([]);
    expect(parseGlossary(null)).toEqual([]);
  });
});

describe('glossary API', () => {
  it('requires authentication', async () => {
    await withServer(async (base) => {
      expect((await fetch(`${base}/api/glossary`)).status).toBe(401);
    });
  });

  it('serves the 11 metrics parsed from the bundled sales-metrics glossary to any signed-in user', async () => {
    await withServer(async (base) => {
      const student = (await signIn(base, 'student@nexaflow.demo')).cookie;
      const instructor = (await signIn(base, 'instructor@nexaflow.demo')).cookie;
      for (const cookie of [student, instructor]) {
        const response = await fetch(`${base}/api/glossary`, { headers: { Cookie: cookie } });
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.source).toBe('sales-metrics-glossary.md');
        expect(data.termCount).toBe(11);
        expect(data.terms.length).toBe(11);
        expect(data.terms[0].term).toBe('Lead volume');
        expect(data.terms.some((term: { term: string }) => term.term === 'Win rate')).toBe(true);
        expect(data.terms.some((term: { term: string }) => term.term === 'TAT (turnaround time)')).toBe(true);
        expect(data.terms.every((term: { term: string; definition: string; whyItMatters: string }) => term.term && term.definition && term.whyItMatters)).toBe(true);
      }
    });
  });
});
