# Curriculum Coverage — MasterPrompt.md → Platform

This document maps every module and topic in `PLATFORM_BUILD_MASTER_PROMPT.md` to where it is taught and practised inside the platform. Use it to verify nothing from the planned curriculum is missing, and as the index for learners and instructors.

**How to read it:** each module lists the MasterPrompt topics, the lesson that teaches them, the supporting starter files (downloaded from the lesson page), the assessment, and the capstone deliverable it feeds. The verdict column summarises coverage: ✅ full, ⚠️ partial (details in "Known gaps").

## Coverage at a glance

| MasterPrompt module | Lesson | Verdict |
|---|---|---|
| 1 · Sales Operations & Sales Intelligence | `lesson-01` · From sales data to action | ✅ |
| 2 · Excel for Sales Intelligence | `lesson-02` · Clean data for analysis | ✅ |
| 3 · Power BI Sales Dashboard Mastery | `lesson-03` · Define sales KPIs | ✅ |
| 4 · CRM Fundamentals & Governance | `lesson-04` · CRM field governance | ✅ |
| 5 · Lead Management & Funnel Optimization | `lesson-05` · Lead lifecycle basics | ✅ |
| 6 · Generative AI for Sales Intelligence | `lesson-06` · Verify AI-assisted research | ✅ |
| 7 · AI Automation & No-Code Sales Operations | `lesson-07` · Workflow design | ✅ |
| 8 · Market & Competitive Intelligence | `lesson-08` · Research competitor positioning | ✅ |
| 9 · SOPs, Requirements & Stakeholder Management | `lesson-09` · Write a usable SOP | ✅ |
| 10 · Capstone | `lesson-10` · Plan the capstone | ✅ |

All 10 modules are taught in order (`mod-01`…`mod-10` in `data/course.seed.json`), each with one quiz and one graded assignment, and each capstone deliverable links back to its supporting lesson.

---

## The 7-Step Learning Framework

The MasterPrompt prescribes the same 7-step structure per module; the platform implements it directly:

| Step | Platform equivalent |
|---|---|
| 1. Learn | Lesson content (structured sections, headings and bullets) |
| 2. Understand | Learning objectives at the top of every lesson |
| 3. See Real Example | **Worked example** section in every lesson |
| 4. Build | **Starter files** downloadable from every lesson |
| 5. Practice | **Practice questions** with a "Check your answers" section |
| 6. Test | Per-module quiz (`quiz-01`…`quiz-10`) + practical assignment (`asg-01`…`asg-10`) |
| 7. Apply to Capstone | Each deliverable's "Supporting lesson" section links to the lesson |

---

## Module 1 — Sales Operations & Sales Intelligence (lesson-01)

| MasterPrompt topic | Where covered |
|---|---|
| Sales organisation: funnel, Lead, MQL, SQL, Opportunity, Deal, Account, Customer, Pipeline, Closed Won/Lost | Lesson content → "The sales organisation" (lifecycle object list) |
| Sales lifecycle: Lead → Qualification → Assignment → First Contact → Discovery → Proposal → Negotiation → Closed | Lesson content → "The sales lifecycle" |
| Key metrics: lead volume, conversion, lead-to-opportunity, opportunity-to-deal, win rate, pipeline value, average deal size, sales cycle, TAT, stale leads, follow-up compliance | Lesson content → "Key sales metrics" (all 11 listed) |
| Sales intelligence: what it is, descriptive / diagnostic / predictive / prescriptive | Lesson content → "The analytics ladder" |

**Starter files:** `nexaflow-leads-sample.csv` (20-row sample export) · `sales-metrics-glossary.md`
**Worked example:** reading a funnel (conversion rates + TAT diagnosis)
**Assessment:** `quiz-01` · `asg-01` Map your sales funnel
**Capstone:** deliverable 10 (Management report — insight + recommendation)

## Module 2 — Excel for Sales Intelligence (lesson-02)

| MasterPrompt topic | Where covered |
|---|---|
| Excel fundamentals: tables, sorting, filtering, conditional formatting, data validation, named ranges | Lesson content → "Excel fundamentals for analysts" |
| Formulas: COUNTIF/COUNTIFS, SUMIF/SUMIFS, IF, IFERROR, XLOOKUP, TEXT, TODAY, NETWORKDAYS | Lesson content → "The formulas that matter" + `excel-formula-cheatsheet.md` (adds COUNTIF, SUMIF, TRIM, UPPER/LOWER, ISBLANK, IF) |
| Sales analysis: funnel conversion, TAT, ageing, lead scoring, stale leads, monthly / salesperson / campaign performance | Lesson content → "Pivot tables" + "Putting it together"; practised on the Analytics page |
| Pivot tables: salesperson, industry, source, employee size, campaign | Lesson content → "Pivot tables" |
| Labs 1–5 (clean dataset, TAT, stale leads, funnel, salesperson report) | Enabled by `dirty-crm-export.csv` + `nexaflow-leads-sample.csv`; concepts taught, run at small scale (see Known gaps) |

**Starter files:** `dirty-crm-export.csv` (deliberately messy — duplicates, inconsistent values, missing owners, negative value) · `excel-formula-cheatsheet.md`
**Worked example:** cleaning a real export (4-step process)
**Assessment:** `quiz-02` · `asg-02` Clean a demo dataset
**Capstone:** deliverable 1 (Data cleaning)

## Module 3 — Power BI Sales Dashboard Mastery (lesson-03)

| MasterPrompt topic | Where covered |
|---|---|
| Power BI fundamentals: interface, importing, data types, Power Query, cleaning, relationships, data model | Lesson content → "The data model" (Power Query + relationships taught conceptually) |
| Executive dashboard: leads, MQL, SQL, opportunities, won, pipeline, win rate | Lesson content → "The executive dashboard" + Analytics KPI cards |
| Funnel dashboard: Lead → MQL → SQL → Opportunity → Proposal → Won | Lesson content → "The funnel dashboard" + Analytics funnel |
| TAT dashboard: average, by salesperson, by stage | Lesson content → "TAT and stale-lead dashboards" + Analytics TAT report |
| Stale lead dashboard: 7 / 15 / 30+ days | Lesson content + Analytics stale report (buckets 0–3, 4–7, 8–15, 15+) |
| Campaign dashboard: leads, qualified, opportunities, conversion, revenue | ⚠️ Taught as a KPI concept only — see Known gaps |
| Data model | Lesson content → "The data model" |

**Starter files:** `kpi-definitions.md` (measure definitions + formulas + the four dashboards + data-model notes)
**Worked example:** writing KPI definitions before the dashboard
**Assessment:** `quiz-03` · `asg-03` Define five sales KPIs
**Capstone:** deliverable 5 (Sales dashboard) — Analytics page is the reference implementation

## Module 4 — CRM Fundamentals & Governance (lesson-04)

| MasterPrompt topic | Where covered |
|---|---|
| CRM fundamentals: Lead, Contact, Account, Opportunity, Activity, Campaign, Deal | Lesson content → "CRM architecture" |
| CRM architecture: Lead → Contact → Account → Opportunity → Deal | Lesson content → "CRM architecture" |
| Governance: data ownership, standards, required fields, validation, duplicate management, data quality, field governance, user permissions | Lesson content → "What field governance means" |
| Field mapping table (company → Account Name, industry, employee size, source, owner, status, deal value) | Lesson content → "Field mapping" + `crm-field-mapping-template.csv` |
| Workflow design: New Lead → Validate → Assign → Notify → Follow-up → Qualification → Opportunity | Lesson content → "The governance workflow" + CRM Lab stage history |

**Starter files:** `crm-field-mapping-template.csv`
**Worked example:** one field, one standard
**Assessment:** `quiz-04` · `asg-04` CRM field standards
**Capstone:** deliverable 2 (CRM data model)

## Module 5 — Lead Management & Funnel Optimization (lesson-05)

| MasterPrompt topic | Where covered |
|---|---|
| Lead management: sources, scoring, qualification, routing, ownership, follow-up | Lesson content throughout |
| Lead scoring (company +20, industry +20, decision maker +25, engagement +15, intent +15) | Lesson content → "Lead scoring" + `lead-scoring-factors.csv` + Workflow Lab |
| Lead assignment: geography, industry, company size, score, capacity | Lesson content → "Lead assignment" + `assignment-rules.csv` + Workflow Lab |
| TAT management | Lesson content → "TAT and stale leads" + Analytics TAT report |
| Stale buckets: 0–3 Normal / 4–7 Attention / 8–15 At Risk / 15+ Stale | Lesson content (exact match) + Analytics stale report + Workflow alerts |

**Starter files:** `lead-scoring-factors.csv` · `assignment-rules.csv`
**Worked example:** scoring and routing a new lead (score 95 → senior rep)
**Assessment:** `quiz-05` · `asg-05` Lead routing plan
**Capstone:** deliverables 3 (Lead scoring) + 4 (Lead assignment)

## Module 6 — Generative AI for Sales Intelligence (lesson-06)

| MasterPrompt topic | Where covered |
|---|---|
| AI fundamentals: GenAI, LLM basics, prompting, context, hallucinations, verification, confidential data | Lesson content → "How AI works, and why it errs" |
| AI for research: companies, industries, competitors, decision makers, market trends | Lesson content → "The highest-value use cases" + AI Practice Lab templates |
| AI lead qualification: inputs (company, industry, employee size, job title, problem) → outputs (score, qualification, reason, need, questions) | Lesson content + `sample-research-prompt.md` + AI Practice Lab + capstone deliverable 6 |
| AI follow-up: email, LinkedIn, meeting summary, next action, objection response | Lesson content + AI Practice Lab follow-up drafts (approval-gated) |
| AI reporting: raw numbers → management summary + key issues + reasons + actions | Lesson content → "Reporting" + capstone deliverable 10 |
| AI Prompt Framework: Role + Context + Data + Task + Constraints + Output Format + Examples | Lesson content → "The prompt framework" + `ai-prompt-framework.md` (exact 7 parts) |

**Starter files:** `ai-prompt-framework.md` · `sample-research-prompt.md`
**Worked example:** a prompt, and a hallucination caught
**Assessment:** `quiz-06` · `asg-06` AI research prompt set
**Capstone:** deliverable 6 (AI lead qualification)

## Module 7 — AI Automation & No-Code Sales Operations (lesson-07)

| MasterPrompt topic | Where covered |
|---|---|
| Automation concepts: trigger, condition, action, workflow, webhook, API, human approval, exception handling | Lesson content → "The building blocks" |
| Example workflow: New Lead → CRM → AI Qualification → Score → High Score? → Sales / Nurture | Lesson content → "The flagship example" (exact match) + Workflow Lab |
| Automation 1: new lead → AI qualification → CRM score | Lesson content + Workflow Lab |
| Automation 2: stale lead → reminder | Lesson content + Workflow alerts |
| Automation 3: meeting → AI summary → next actions | Lesson content |
| Automation 4: weekly data → AI management summary | Lesson content |
| Automation 5: competitor news → AI summary → repository | Lesson content |

**Starter files:** `workflow-map-template.md`
**Worked example:** mapping the AI lead-qualification workflow
**Assessment:** `quiz-07` · `asg-07` Automation workflow map
**Capstone:** deliverable 7 (AI follow-up assistant) — Workflow Lab is the reference implementation

## Module 8 — Market & Competitive Intelligence (lesson-08)

| MasterPrompt topic | Where covered |
|---|---|
| Market research: industry, TAM/SAM/SOM, trends, pain points, challenges | Lesson content → "Market research structure" |
| Competitive intelligence: competitors, products, pricing, positioning, strengths, weaknesses, segments | Lesson content → "Evidence over opinion" + battle cards |
| Battle cards: competitor, offer, strengths, weaknesses, advantage, objection, response | Lesson content → "Battle cards" (exact 6-section structure) + `battle-card-template.md` |
| Sales enablement repository: case studies, reports, battle cards, scripts, objection handling, conversation starters | Lesson content → "The sales enablement repository" |

**Starter files:** `battle-card-template.md`
**Worked example:** building one battle card from evidence (FluxDesk)
**Assessment:** `quiz-08` · `asg-08` Competitor brief
**Capstone:** deliverable 8 (Competitive intelligence — 5 fictional profiles)

## Module 9 — SOPs, Requirements & Stakeholder Management (lesson-09)

| MasterPrompt topic | Where covered |
|---|---|
| SOP writing: CRM, lead assignment, dashboard, follow-up, data-cleaning SOPs | Lesson content → "The SOP structure" + `sop-template.md` (7 core SOPs listed) |
| Requirement chain: problem → process → pain point → requirement → solution → acceptance → testing → deployment | Lesson content → "Requirement gathering" (exact chain) |
| BRD contents: problem, current/future state, functional requirements, business rules, acceptance criteria, dependencies, risks | Lesson content → "Requirement gathering" |
| Issue tracker: issue, owner, priority, raised, dependency, status, expected/actual closure | Lesson content → "Issue management" (exact columns) |
| Stakeholders: Sales, Marketing, Technology, Finance, Operations | Lesson content → "Working with stakeholders" (all five) |

**Starter files:** `sop-template.md`
**Worked example:** the lead assignment SOP
**Assessment:** `quiz-09` · `asg-09` Write a usable SOP
**Capstone:** deliverable 9 (SOP library)

## Module 10 — Capstone (lesson-10)

| MasterPrompt topic | Where covered |
|---|---|
| Project: AI-Powered Sales Intelligence & CRM Operations Platform | Capstone workspace — title matches |
| Business scenario (fictional B2B company) | Fictional NexaFlow dataset (see Known gaps on scale) |
| Architecture: raw data → cleaning → CRM → scoring/assignment → data model → dashboard → AI → automation → actions | Lesson 10 + Capstone architecture flows through the 10 deliverables |
| Deliverables 1–10: data cleaning, CRM model, scoring, assignment, dashboard, AI qualification, AI follow-up, competitive intel, SOP library, management report | `capstone.seed.json` — all 10, in order, each with rubric + deadline + related tools + supporting lesson |
| Final portfolio (10 items) | Portfolio summary shown once the capstone is approved |

**Starter files:** `capstone-plan-template.md` (deliverables, 4-week plan, tracking table)
**Worked example:** a four-week capstone plan
**Assessment:** `quiz-10` · `asg-10` Capstone delivery plan
**Output:** approved capstone → portfolio + certificate eligibility

---

## Cheat-sheet library (MasterPrompt → starter file)

| MasterPrompt cheat sheet | Starter file |
|---|---|
| Excel (sales formulas, TAT formulas, funnel formulas) | `excel-formula-cheatsheet.md` (lesson-02) |
| Power BI (KPI definitions, dashboard layout, data model) | `kpi-definitions.md` (lesson-03) |
| CRM (field mapping, governance) | `crm-field-mapping-template.csv` (lesson-04) |
| AI (prompt framework) | `ai-prompt-framework.md` (lesson-06) |
| Business analysis (workflow mapping) | `workflow-map-template.md` (lesson-07) |
| SOP (template + example) | `sop-template.md` (lesson-09) |

## Assessment strategy vs MasterPrompt

| MasterPrompt | Platform |
|---|---|
| Quiz per module (5–10 questions) | ✅ `quiz-01`…`quiz-10` — ⚠️ **3 questions each** (see Known gaps) |
| Practical assignment per module | ✅ `asg-01`…`asg-10`, graded with feedback + resubmission |
| Capstone evaluation weights (concept/practical/analysis/presentation/documentation) | ⚠️ Rubrics exist per deliverable; the exact 20/40/20/10/10 weight split is not applied — grading is per-deliverable + final average |

---

## Known gaps

These are the deliberate deltas between the MasterPrompt and the shipped platform. None removes a whole topic, but several are worth knowing before launch:

1. **Quiz depth** — MasterPrompt asks for 5–10 questions per module; the platform ships 3 per quiz. Expanding to 5+ is a small seed change.
2. **Dataset scale** — the prompt's scenario is 10,000 leads and a 5,000-row lab dataset; the platform seed has 12 leads and a 20-row sample CSV. Labs are taught and runnable at small scale; the capstone works, but not at the promised volume.
3. **Named topics not yet in lesson text** — INDEX/MATCH, DATE functions, COUNTA (module 2); "operational vs analytical reporting" (module 1); median TAT, "no follow-up" stale category, and the **Campaign dashboard** (module 3); routing by **product** (module 5).
4. **External tools are simulated, not connected** — the MasterPrompt assumes real Excel/Power BI, Make.com/Zapier, HubSpot/Salesforce and ChatGPT/Claude. The platform teaches the concepts and provides simulated practice (Analytics = Power BI reference, AI Practice Lab = simulated AI, Workflow Lab = automation reference). Students export the CSVs and build in real tools themselves — by design, since the platform runs with no paid services.
5. **Assessment weights** — the MasterPrompt's 20/40/20/10/10 evaluation split is not applied; grading is per-deliverable score + quiz pass + final average.

## How to keep this document accurate

- Lesson content and starter files live in `data/course.seed.json`; quizzes/assignments in `data/activities.seed.json`; capstone in `data/capstone.seed.json`.
- When a lesson, starter file, quiz or deliverable changes, update the matching module section above.
- After a curriculum change, rerun `npm test` (the course/capstone suites assert lesson count, files per lesson, worked examples and deliverable→lesson links).
