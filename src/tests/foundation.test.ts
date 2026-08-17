import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const seed = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'nexaflow.seed.json'), 'utf8'));

describe('NexaFlow seed data', () => {
  it('is explicitly fictional and has all primary roles', () => {
    expect(seed.metadata.isDemoData).toBe(true);
    expect(seed.metadata.notice).toMatch(/fictional/i);
    expect([...new Set(seed.users.map((user: { role: string }) => user.role))].sort()).toEqual(['ADMIN', 'INSTRUCTOR', 'STUDENT']);
  });

  it('leads use valid lifecycle stages and reference known companies', () => {
    const stages = new Set(['NEW', 'MQL', 'SQL', 'OPPORTUNITY', 'PROPOSAL', 'CLOSED_WON', 'CLOSED_LOST']);
    const companyIds = new Set(seed.companies.map((company: { id: string }) => company.id));
    for (const lead of seed.leads) {
      expect(stages.has(lead.stage)).toBe(true);
      expect(companyIds.has(lead.companyId)).toBe(true);
    }
  });
});
