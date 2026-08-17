import { createAuth } from '../middleware/auth.js';
import { daysSince, readFactors } from '../scoring.js';

export const STAGES = ['NEW', 'MQL', 'SQL', 'OPPORTUNITY', 'PROPOSAL', 'CLOSED_WON', 'CLOSED_LOST'];

export const dashboardData = {
  ADMIN: {
    heading: 'Platform overview', description: 'Monitor the fictional NexaFlow beta cohort and keep learning delivery on track.', metrics: [['Active learners', '10'], ['Course completion', '34%'], ['Reviews awaiting action', '4']],
    nextSteps: ['Check the Reports page for cohort and progress health', 'Review pending quiz, assignment and capstone work', 'Enroll new students or open a cohort for the next intake'],
  },
  INSTRUCTOR: {
    heading: 'Teaching workspace', description: 'Guide your cohort through practical Sales Intelligence training.', metrics: [['Learners in cohort', '10'], ['Work awaiting review', '4'], ['Lessons published', '10']],
    nextSteps: ['Review submissions and capstone deliverables in the queues', 'Use Cohorts to check enrollment and student status', 'Run the workflow lab sandbox for the scoring exercise'],
  },
  STUDENT: {
    heading: 'Your learning dashboard', description: 'Build your Sales Intelligence portfolio one practical step at a time.', metrics: [['Course progress', '0%'], ['Next activity', 'Orientation'], ['Submitted work', '0']],
    nextSteps: ['Open My Learning to complete the 10 modules', 'Practise in the CRM Lab and Workflow Lab', 'Take quizzes, submit assignments, then build the Capstone', 'Meet all three criteria to earn your Certificate'],
  },
};

const privacyNotice = '<details class="crm-help"><summary>Privacy &amp; demo data notice</summary><p>This is a <strong>training environment</strong>. Every company, person, email address and commercial detail is fictional NexaFlow demo data — never enter real customer information here. The AI Practice Lab is simulated: outputs are generated locally, contain no external AI provider calls, and must be verified before use. No message is ever sent automatically, and no data leaves this local application.</p></details>';
export { privacyNotice };

export function sendJson(response, status, payload, headers = {}) { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers }); response.end(JSON.stringify(payload)); }
export function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; if (body.length > 50_000) request.destroy(); });
    request.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error('Invalid JSON')); } });
    request.on('error', reject);
  });
}
export function parseUrl(request) { return new URL(request.url, 'http://localhost'); }
export function pageParams(url) { return { page: Math.max(1, Number(url.searchParams.get('page') || 1)), pageSize: Math.min(50, Math.max(1, Number(url.searchParams.get('pageSize') || 10))) }; }

export function createApiContext({ db, secret, referenceDate }) {
  const auth = createAuth({ db, secret, sendJson });

  const LEAD_JOIN = `
    SELECT l.*, c.name AS company_name, c.industry, c.employee_size,
      COALESCE(u.name, sp.name) AS owner_name
    FROM leads l
    JOIN companies c ON c.id = l.company_id
    LEFT JOIN salespeople sp ON sp.id = l.owner_id
    LEFT JOIN users u ON u.id = sp.user_id`;
  function companyById(id) { return db.prepare('SELECT * FROM companies WHERE id = ?').get(id); }
  function serializeRuleValue(value) { return Array.isArray(value) ? JSON.stringify(value) : String(value); }
  function scoringFactorsView() { return readFactors(db).map(({ value, ...factor }) => factor); }
  function staleBucket(row) {
    if (['CLOSED_WON', 'CLOSED_LOST'].includes(row.stage)) return 'CLOSED';
    if (!row.last_activity_at) return 'STALE';
    const days = daysSince(referenceDate, row.last_activity_at);
    if (days <= 3) return 'NORMAL';
    if (days <= 7) return 'ATTENTION';
    if (days <= 15) return 'AT_RISK';
    return 'STALE';
  }
  function decorateLead(row) {
    return {
      id: row.id, companyId: row.company_id, contactName: row.contact_name, jobTitle: row.job_title, email: row.email, source: row.source,
      ownerId: row.owner_id, stage: row.stage, score: row.score, createdAt: row.created_at, lastActivityAt: row.last_activity_at, nextActionAt: row.next_action_at, expectedValue: row.expected_value,
      companyName: row.company_name || 'Unknown company', industry: row.industry || '', employeeSize: row.employee_size || '', ownerName: row.owner_name || null,
      staleBucket: staleBucket(row), daysSinceLastActivity: row.last_activity_at ? daysSince(referenceDate, row.last_activity_at) : null
    };
  }
  function decorateCompany(row) { return { id: row.id, name: row.name, industry: row.industry, employeeSize: row.employee_size, region: row.region, website: row.website, leadCount: row.lead_count }; }
  function decorateOpportunity(row) {
    return { id: row.id, companyId: row.company_id, leadId: row.lead_id, ownerId: row.owner_id, stage: row.stage, amount: row.amount, currency: row.currency, expectedCloseDate: row.expected_close_date, closedAt: row.closed_at, lostReason: row.lost_reason, companyName: row.company_name || 'Unknown company', leadContact: row.lead_contact || null, ownerName: row.owner_name || null };
  }
  function leadActivities(leadId) {
    return db.prepare('SELECT * FROM activities WHERE lead_id = ? ORDER BY occurred_at DESC').all(leadId).map((row) => ({ id: row.id, leadId: row.lead_id, type: row.type, subject: row.subject, occurredAt: row.occurred_at, ownerId: row.owner_id, notes: row.notes }));
  }
  function leadHistory(leadId) {
    return db.prepare('SELECT * FROM stage_history WHERE lead_id = ? ORDER BY changed_at DESC').all(leadId).map((row) => ({ id: row.id, leadId: row.lead_id, fromStage: row.from_stage, toStage: row.to_stage, changedById: row.changed_by_id, changedAt: row.changed_at, reason: row.reason }));
  }
  function allLeads() { return db.prepare(`${LEAD_JOIN} ORDER BY l.created_at DESC`).all().map(decorateLead); }
  function leadById(id) { const row = db.prepare(`${LEAD_JOIN} WHERE l.id = ?`).get(id); return row ? decorateLead(row) : null; }
  function firstContact(leadId) {
    const activity = db.prepare('SELECT occurred_at FROM activities WHERE lead_id = ? ORDER BY occurred_at ASC LIMIT 1').get(leadId);
    const history = db.prepare('SELECT changed_at FROM stage_history WHERE lead_id = ? ORDER BY changed_at ASC LIMIT 1').get(leadId);
    const candidates = [activity?.occurred_at, history?.changed_at].filter(Boolean).map((value) => new Date(value)).sort((a, b) => a - b);
    return candidates[0] || null;
  }
  function analyticsPeriod(url) {
    const period = url.searchParams.get('period') || 'all';
    return ['all', '30', '60', '90'].includes(period) ? period : 'all';
  }
  function analyticsLeads(period) {
    if (period === 'all') return allLeads();
    const cutoff = referenceDate - Number(period) * 86_400_000;
    return allLeads().filter((lead) => new Date(lead.createdAt) >= cutoff);
  }
  function segmentFor(company) {
    const size = company?.employee_size || '';
    if (['11-50', '51-200'].includes(size)) return 'SMB';
    if (['201-500', '501-1000'].includes(size)) return 'Mid-market';
    if (size) return 'Enterprise';
    return 'Unknown';
  }

  return {
    db, secret, referenceDate, STAGES, dashboardData, LEAD_JOIN,
    sendJson, readJson, parseUrl, pageParams,
    companyById, serializeRuleValue, scoringFactorsView, staleBucket,
    decorateLead, decorateCompany, decorateOpportunity, leadActivities, leadHistory,
    allLeads, leadById, firstContact, analyticsPeriod, analyticsLeads, segmentFor,
    ...auth,
  };
}
