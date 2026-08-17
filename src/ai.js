import { readFactors, scoreForLead } from './scoring.js';

export const AI_DISCLAIMER = 'Simulated AI output — no AI provider is connected. Treat everything below as fictional demo content and verify any claim before acting on it.';

const PAIN_POINTS = {
  'Human Resources': ['Manual onboarding workflows spread across spreadsheets', 'No single view of headcount and hiring data'],
  Manufacturing: ['Production data trapped in disconnected systems', 'Manual quality reporting that lags the shop floor'],
  Retail: ['Stock and demand signals that do not reach the sales team', 'Manual reconciliation across sales channels'],
  Healthcare: ['Patient operations data siloed across departments', 'Manual compliance reporting'],
  'Financial Services': ['Slow manual client onboarding', 'Reporting assembled by hand each month'],
  Logistics: ['Shipment updates that require manual chasing', 'No shared view of delivery exceptions'],
  Software: ['Trial-to-paid conversion tracked in spreadsheets', 'Feature usage not linked to sales follow-up'],
  Education: ['Enrollment follow-up handled ad hoc', 'No shared view of applicant journeys'],
};
const DEFAULT_PAIN_POINTS = ['Manual data entry that slows the team down', 'No shared view of pipeline and activity data'];

const INITIATIVES = {
  'Human Resources': ['Centralising HR data into one system', 'Automating onboarding workflows'],
  Manufacturing: ['Connecting shop-floor data to reporting', 'Automating supplier communication'],
  Retail: ['Unifying sales channel reporting', 'Automating inventory alerts'],
  Healthcare: ['Streamlining patient operations reporting', 'Automating compliance checks'],
  'Financial Services': ['Automating client onboarding steps', 'Centralising deal and reporting data'],
  Logistics: ['Automating shipment exception alerts', 'Building a single operations dashboard'],
  Software: ['Connecting product usage to sales workflows', 'Automating trial follow-up cadence'],
  Education: ['Automating applicant follow-up', 'Building a single admissions dashboard'],
};
const DEFAULT_INITIATIVES = ['Centralising operational data into one system', 'Automating repeatable follow-up workflows'];

const COMPETITOR_NAMES = ['FlowBridge', 'OpsCore', 'PipelineOS'];
const FOLLOW_UP_SUBJECTS = ['Quick thought for', 'Idea for', 'Following up on'];

function companyById(db, id) { return db.prepare('SELECT * FROM companies WHERE id = ?').get(id); }
function leadWithCompany(db, id) {
  return db.prepare('SELECT l.*, c.name AS company_name, c.industry, c.employee_size, c.region FROM leads l JOIN companies c ON c.id = l.company_id WHERE l.id = ?').get(id);
}
function painPointsFor(industry) { return PAIN_POINTS[industry] || DEFAULT_PAIN_POINTS; }
function initiativesFor(industry) { return INITIATIVES[industry] || DEFAULT_INITIATIVES; }
function firstWord(name = 'there') { return String(name).trim().split(/\s+/)[0] || 'there'; }

function qualificationFromScore(score) {
  if (score >= 70) return { verdict: 'Qualified — pursue now', strength: 'HIGH' };
  if (score >= 40) return { verdict: 'Nurture — build engagement before pursuing', strength: 'MEDIUM' };
  return { verdict: 'Not now — revisit later', strength: 'LOW' };
}

export const AI_TEMPLATES = [
  { id: 'company-research', name: 'Company research', description: 'Research a company before your first outreach.', requires: ['companyId'], verb: 'Research' },
  { id: 'lead-qualification', name: 'Lead qualification', description: 'Score and qualify a lead with suggested questions.', requires: ['leadId'], verb: 'Qualify' },
  { id: 'follow-up', name: 'Follow-up draft', description: 'Draft a personalised follow-up message for a lead.', requires: ['leadId'], verb: 'Draft' },
  { id: 'meeting-summary', name: 'Meeting summary', description: 'Turn meeting notes into a structured summary.', requires: [], verb: 'Summarise' },
  { id: 'reporting', name: 'Reporting', description: 'Suggest a management report from the current pipeline.', requires: [], verb: 'Report' },
  { id: 'competitor-research', name: 'Competitor research', description: 'Build a competitive intelligence brief.', requires: ['companyId'], verb: 'Brief' },
];

export function readTemplates() {
  return AI_TEMPLATES.map((template) => ({ id: template.id, name: template.name, description: template.description, requires: template.requires }));
}

export function buildPrompt(db, referenceDate, templateId, input = {}) {
  const template = AI_TEMPLATES.find((entry) => entry.id === templateId) || AI_TEMPLATES[1];
  const lead = input.leadId ? leadWithCompany(db, input.leadId) : null;
  const company = input.companyId ? companyById(db, input.companyId) : (lead ? { id: lead.company_id, name: lead.company_name, industry: lead.industry, employee_size: lead.employee_size, region: lead.region } : null);
  const context = company ? `${company.name} (${company.industry || 'unknown industry'}, ${company.employee_size || 'unknown size'} employees, ${company.region || 'unknown region'})` : 'the selected company';
  switch (templateId) {
    case 'company-research': return `Research the company ${context}. Summarise what they do, likely business initiatives, and three questions for a first call.`;
    case 'lead-qualification': return `Qualify the lead ${lead ? `${lead.contact_name} at ${lead.company_name}` : 'at this company'} using the lead score and context. State a verdict, the reason, likely pain points, suggested questions and a next action.`;
    case 'follow-up': return `Draft a short follow-up email for ${lead ? `${firstWord(lead.contact_name)} at ${lead.company_name}` : 'the lead'} referencing their industry context and a likely pain point. Keep it friendly and specific.`;
    case 'meeting-summary': return input.text ? `Summarise these meeting notes into key points, decisions and action items:\n\n${input.text}` : `Summarise a sales meeting for ${lead ? `${lead.contact_name} at ${lead.company_name}` : 'the selected lead'} into key points, decisions and action items.`;
    case 'reporting': return 'Suggest a management report from the current NexaFlow pipeline: which KPIs to include, what they mean, and one recommendation for the sales leadership team.';
    case 'competitor-research': return `Build a competitive intelligence brief for ${context}: compare three competitors on consistent criteria and list actionable takeaways for sales.`;
    default: return '';
  }
}

export function generateOutput(db, referenceDate, templateId, input = {}) {
  const lead = input.leadId ? leadWithCompany(db, input.leadId) : null;
  const company = input.companyId ? companyById(db, input.companyId) : (lead ? { id: lead.company_id, name: lead.company_name, industry: lead.industry, employee_size: lead.employee_size, region: lead.region } : null);
  const industry = company?.industry || lead?.industry || '';
  const painPoints = painPointsFor(industry);
  const initiatives = initiativesFor(industry);

  if (templateId === 'company-research') {
    return {
      company: company ? { name: company.name, industry: company.industry, employeeSize: company.employee_size, region: company.region } : null,
      overview: company ? `${company.name} is a fictional ${company.employee_size || 'mid-sized'} ${company.industry || 'B2B'} company operating in ${company.region || 'an undefined region'}. Their operations team is the likely buyer for workflow automation.` : 'No company selected.',
      likelyInitiatives: initiatives,
      suggestedQuestions: [
        `What is ${company?.name || 'the company'}'s biggest operational bottleneck today?`,
        'Which systems hold the data your team most needs access to?',
        'How do you currently measure follow-up and response times?',
      ],
      nextAction: `Send a personalised first message referencing one initiative and ask about ${company?.name || 'their'} current process.`,
    };
  }

  if (templateId === 'lead-qualification') {
    const factors = readFactors(db);
    const { score, matched } = lead ? scoreForLead(lead, lead, factors, referenceDate) : { score: 0, matched: [] };
    const qualification = qualificationFromScore(score);
    return {
      lead: lead ? { contactName: lead.contact_name, companyName: lead.company_name, jobTitle: lead.job_title, stage: lead.stage, source: lead.source } : null,
      score,
      qualification: qualification.verdict,
      strength: qualification.strength,
      reason: matched.length ? `The lead earned ${score} points from: ${matched.map((factor) => factor.label).join('; ')}.` : 'No scoring factors matched, so the score is 0.',
      painPoints,
      suggestedQuestions: [
        `What would make ${lead?.company_name || 'the company'} invest in a change this quarter?`,
        `Who else is involved in deciding on ${lead?.company_name || 'the company'}'s sales operations tools?`,
        `What happened the last time ${lead?.company_name || 'the company'} tried to solve ${painPoints[0]?.toLowerCase() || 'this'}?`,
      ],
      nextAction: qualification.strength === 'HIGH' ? 'Book a discovery call within 24 hours referencing the scoring reason.' : qualification.strength === 'MEDIUM' ? 'Send one nurture touch and set a next action date to follow up.' : 'Set a revisit date and stop active outreach for now.',
    };
  }

  if (templateId === 'follow-up') {
    const subject = FOLLOW_UP_SUBJECTS[Math.floor(lead?.created_at ? Date.parse(lead.created_at) % FOLLOW_UP_SUBJECTS.length : 0)];
    const draft = lead
      ? `Subject: ${subject} ${lead.company_name}\n\nHi ${firstWord(lead.contact_name)},\n\nI noticed ${lead.company_name} operates in the ${lead.industry || 'B2B'} space and teams like yours often tell us ${painPoints[0]?.toLowerCase() || 'manual follow-up slows the pipeline down'}.\n\nWould a 20-minute call this week be useful to compare how you handle that today? Happy to share what other teams do.\n\nBest,\n[Your name]`
      : 'Subject: Quick thought\n\nHi [First name],\n\nI came across [Company] and thought of a challenge your operations team may be working on. Would a short call this week be useful?\n\nBest,\n[Your name]';
    return { lead: lead ? { contactName: lead.contact_name, companyName: lead.company_name, jobTitle: lead.job_title } : null, subject: subject || 'Quick thought', draft };
  }

  if (templateId === 'meeting-summary') {
    const lines = String(input.text || '').split('\n').map((line) => line.trim()).filter(Boolean);
    const keyPoints = (lines.length >= 2 ? lines : [`Met ${lead ? `with ${lead.contact_name} at ${lead.company_name}` : 'with the prospect'} to discuss sales operations priorities.`, 'Discussed current process and pain points.', 'Agreed on the next step for the evaluation.']).slice(0, 6);
    const decisions = (lines.length >= 2 ? lines.filter((line) => /decide|decision|agreed|confirm/i.test(line)) : ['Next step agreed: follow up with the champion.']).slice(0, 4);
    const actionItems = (lines.length >= 2 ? lines.filter((line) => /^(action|todo|-|•)|will |send |share /i.test(line)) : ['Share the ROI one-pager.', 'Book the follow-up call.']).slice(0, 5);
    return { lead: lead ? { contactName: lead.contact_name, companyName: lead.company_name } : null, keyPoints, decisions, actionItems, nextAction: 'Log the summary in the CRM and set a next action date.' };
  }

  if (templateId === 'reporting') {
    const rows = db.prepare("SELECT stage, COUNT(*) AS count, SUM(expected_value) AS value FROM leads WHERE stage NOT IN ('CLOSED_WON', 'CLOSED_LOST') GROUP BY stage").all();
    const won = db.prepare("SELECT COUNT(*) AS count, SUM(expected_value) AS value FROM leads WHERE stage = 'CLOSED_WON'").get();
    const lost = db.prepare("SELECT COUNT(*) AS count FROM leads WHERE stage = 'CLOSED_LOST'").get();
    const total = db.prepare('SELECT COUNT(*) AS count FROM leads').get().count;
    const openValue = rows.reduce((sum, row) => sum + (row.value || 0), 0);
    const winRate = total ? Math.round(((won.count || 0) / ((won.count || 0) + (lost.count || 0) || 1)) * 100) : 0;
    return {
      metrics: [
        { kpi: 'Open leads', value: rows.reduce((sum, row) => sum + row.count, 0) },
        { kpi: 'Pipeline value', value: `$${Number(openValue).toLocaleString()}` },
        { kpi: 'Won deals', value: won.count || 0 },
        { kpi: 'Revenue', value: `$${Number(won.value || 0).toLocaleString()}` },
        { kpi: 'Win rate', value: `${winRate}%` },
      ],
      funnel: rows.map((row) => ({ stage: row.stage, count: row.count })),
      recommendation: 'Add a pipeline review to the weekly cadence, focusing on leads with a next action date in the past and high-score leads with no recent activity.',
      nextAction: 'Export the filtered dataset to Excel and build the KPI table for management review.',
    };
  }

  if (templateId === 'competitor-research') {
    return {
      context: company ? { name: company.name, industry: company.industry, segment: company.employee_size } : { name: 'NexaFlow', industry: industry || 'workflow automation' },
      competitors: COMPETITOR_NAMES.map((name, index) => ({
        name,
        positioning: `${name} targets ${industry ? `${industry.toLowerCase()} teams` : 'operations teams'} with an automation platform${index === 0 ? ', positioned on enterprise scale' : index === 1 ? ', positioned on ease of use' : ', positioned on price'}.`,
        strength: index === 0 ? 'Broad integration catalogue' : index === 1 ? 'Very short time to value' : 'Aggressive pricing for SMBs',
        gap: index === 0 ? 'Longer implementation time' : index === 1 ? 'Fewer workflow templates' : 'Limited reporting depth',
      })),
      takeaways: [
        'Lead with the pain point your segment feels most, not with features.',
        'Prepare one comparison table using the same criteria for every competitor.',
        'Verify pricing and capabilities on each competitor\'s public pages before a demo.',
      ],
      verificationNote: 'Competitor names and details are fictional demo placeholders. Replace them with verified public information before using this brief.',
    };
  }

  return { note: 'Unknown template. Choose one of the six available templates.' };
}

export function runTemplate(db, referenceDate, templateId, input = {}) {
  const template = AI_TEMPLATES.find((entry) => entry.id === templateId) || AI_TEMPLATES[1];
  const output = generateOutput(db, referenceDate, template.id, input);
  return { templateId: template.id, templateName: template.name, prompt: buildPrompt(db, referenceDate, template.id, input), output };
}
