const test = require('node:test');
const assert = require('node:assert/strict');
const seed = require('../data/nexaflow.seed.json');

test('NexaFlow seed data is explicitly fictional and has all primary roles', () => {
  assert.equal(seed.metadata.isDemoData, true);
  assert.match(seed.metadata.notice, /fictional/i);
  assert.deepEqual(seed.users.map((user) => user.role).sort(), ['ADMIN', 'INSTRUCTOR', 'STUDENT']);
});

test('NexaFlow leads use valid lifecycle stages and reference known companies', () => {
  const stages = new Set(['NEW', 'MQL', 'SQL', 'OPPORTUNITY', 'PROPOSAL', 'CLOSED_WON', 'CLOSED_LOST']);
  const companyIds = new Set(seed.companies.map((company) => company.id));
  for (const lead of seed.leads) {
    assert.ok(stages.has(lead.stage));
    assert.ok(companyIds.has(lead.companyId));
  }
});
