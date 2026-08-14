# Master Prompt: Build the Sales Intelligence Training Platform

## How to Use This Prompt

Use this document as the master instruction for building this project phase by phase. Complete and test one phase before starting the next. Do not add future-phase features early unless they are required for the current phase.

---

## Product Vision

Build a self-contained web platform named **Sales Intelligence, CRM & AI Automation Mastery**.

It must be both:

1. A learning management system for instructors and students.
2. A built-in simulated Sales CRM and Sales Intelligence lab where students practice with realistic data.

The platform must let students learn, practice, submit work and complete a capstone without needing paid HubSpot, Salesforce, Make, Zapier or other CRM subscriptions.

The core learning journey is:

```text
Learn → practice with data → use training CRM → analyse dashboard
→ make a decision → complete assignment → build capstone → earn certificate
```

## Primary Users and Permissions

| Role | Main permissions |
| --- | --- |
| Admin | Manage all users, courses, cohorts, content, reports, certificates and settings |
| Instructor | Create lessons, labs, quizzes, datasets and assignments; review student work |
| Student | Learn lessons, use assigned CRM lab, take quizzes, submit assignments and view progress |

## Product Rules

- Keep the user interface simple, professional and beginner friendly.
- Use fictional/demo data by default. Never expose real customer information.
- Explain business terms in plain language inside the application.
- Design mobile-responsive pages, but prioritize desktop for CRM and dashboard work.
- Keep paid third-party tools optional. Core teaching must work within this platform.
- Require human review before a simulated AI follow-up is marked as sent.
- Build with reusable components and clear documentation.

---

# Phase 0 — Planning and Foundation

## Goal

Define the technical foundation and a small, testable Version 1 scope before building features.

## Build Requirements

1. Inspect the existing repository and identify the current stack.
2. Create a concise `README.md` covering setup, run commands, project structure and roles.
3. Create a data model/design document for users, courses, lessons, cohorts, leads, companies, activities, opportunities, assignments, submissions, quizzes and certificates.
4. Define application navigation for Admin, Instructor and Student.
5. Seed one fictional B2B SaaS company called `NexaFlow` with realistic demo data.

## Initial Data Entities

```text
User, Role, Course, Module, Lesson, Cohort, Enrollment,
Company, Lead, Activity, Opportunity, Salesperson,
Assignment, Submission, Quiz, QuizQuestion, QuizAttempt,
Dataset, Workflow, SOP, Certificate
```

## Acceptance Criteria

- Project setup is documented.
- The app runs locally.
- The data model is documented.
- Demo data is clearly fictional.
- No unrelated functionality is added.

---

# Phase 1 — Authentication, Roles and Application Shell

## Goal

Create the secure base experience for Admin, Instructor and Student users.

## Build Requirements

1. Implement sign in, sign out and role-based access control.
2. Provide demo accounts for Admin, Instructor and Student in local development.
3. Create role-specific dashboards.
4. Create a consistent navigation shell, page headers, loading states, empty states and error states.
5. Prevent users from accessing pages outside their assigned role.

## Screens

- Sign-in page
- Admin dashboard
- Instructor dashboard
- Student dashboard
- Profile/settings page

## Acceptance Criteria

- Each role can sign in and see only authorized navigation/actions.
- Student cannot access admin or instructor actions.
- Dashboards display meaningful demo information.
- UI works on desktop and mobile.

---

# Phase 2 — Course, Module and Lesson Management

## Goal

Allow instructors to deliver the complete 10-module program inside the platform.

## Build Requirements

1. Admin/Instructor can create and edit courses, modules and lessons.
2. Lessons support title, summary, learning objectives, text content, video URL/embed placeholder, downloadable files and estimated duration.
3. Student can browse modules, open lessons and mark a lesson complete.
4. Display progress by course and module.
5. Seed the 10 modules from `MasterPrompt.md`.

## Seed Modules

1. Sales Operations & Sales Intelligence
2. Excel for Sales Intelligence
3. Power BI Sales Dashboard Mastery
4. CRM Fundamentals & Governance
5. Lead Management & Funnel Optimization
6. Generative AI for Sales Intelligence
7. AI Automation & No-Code Sales Operations
8. Market & Competitive Intelligence
9. SOPs, Requirements & Stakeholder Management
10. AI-Powered Sales Intelligence Capstone

## Acceptance Criteria

- Instructor can manage course content without changing code.
- Student sees module sequence, lesson details and completion status.
- Progress percentages update correctly.

---

# Phase 3 — Built-In Training CRM

## Goal

Build the core practice environment that teaches transferable CRM concepts without requiring external CRM software.

## Build Requirements

1. Create CRM pages for Companies, Leads, Activities and Opportunities.
2. Provide table view, detail view, filters, search and pagination.
3. Leads must include: ID, company, industry, employee size, source, owner, stage/status, score, created date, last activity, next action and expected value.
4. Allow permitted users to create/edit leads, assign an owner, change stage and add activities.
5. Implement stage history and an activity timeline for each lead.
6. Provide clear help text explaining CRM terms.

## Lead Lifecycle

```text
New Lead → MQL → SQL → Opportunity → Proposal → Closed Won / Closed Lost
```

## Acceptance Criteria

- A student can work safely with assigned demo records.
- A lead can be updated, assigned and progressed through stages.
- Every update appears in lead history/timeline.
- Filters support industry, source, owner, stage and stale status.

---

# Phase 4 — Sales Intelligence Dashboard and Reports

## Goal

Show students how CRM data becomes management insight.

## Build Requirements

1. Create dashboard KPIs: Total Leads, MQL, SQL, Opportunities, Proposals, Won Deals, Pipeline Value, Revenue and Win Rate.
2. Create funnel visualization for the lead lifecycle.
3. Create TAT (turnaround time) and stale lead reports.
4. Create views by salesperson, source, industry, campaign and employee-size segment.
5. Add date filters and explanatory KPI definitions.
6. Let students export a filtered dataset for Excel/Power BI exercises if supported by the stack.

## Stale Lead Rules

```text
0–3 days: Normal
4–7 days: Attention
8–15 days: At Risk
15+ days: Stale
```

## Acceptance Criteria

- All KPIs use the seeded CRM data accurately.
- Filters update dashboard values and charts.
- Stale leads can be opened directly from the report.
- TAT definition is visible and consistent.

---

# Phase 5 — Lead Scoring, Assignment and Workflow Lab

## Goal

Let students practice the logic behind sales operations automation.

## Build Requirements

1. Implement configurable lead-score factors: company fit, industry fit, decision-maker role, engagement and intent.
2. Show the score breakdown and qualification reason on every lead.
3. Create assignment rules based on region, industry, employee size, score and salesperson workload.
4. Create a visual/readable workflow page for lead validation, assignment, follow-up and escalation.
5. Create stale-lead alerts inside the app.
6. Provide instructor exercises where students change rules and observe outcomes using a safe sandbox/demo copy.

## Acceptance Criteria

- Lead score calculation is transparent and reproducible.
- Assignment rules produce clear results and explanations.
- Alerts identify stale or unassigned leads correctly.
- Student experiments cannot corrupt shared base demo data.

---

# Phase 6 — AI Practice Lab (No Paid AI Required)

## Goal

Teach safe AI-assisted sales work while keeping the core platform usable without an AI subscription.

## Build Requirements

1. Create prompt templates for company research, lead qualification, follow-up, meeting summary, reporting and competitor research.
2. Provide a form where a student enters lead/company context and receives a structured simulated AI response.
3. The simulated response must include: score, qualification, reason, potential pain point, suggested questions and next action.
4. Provide an optional future provider adapter/API configuration; do not require it for local demos.
5. Create an AI follow-up review page: draft message, student edits it, then marks it approved/sent in the simulation.
6. Display data-privacy and verification reminders.

## Acceptance Criteria

- All AI lab activities work without an external API key.
- AI outputs are clearly labelled as simulated when no provider is connected.
- No automated message is sent without student/instructor approval.
- Prompt templates can be copied and reused.

---

# Phase 7 — Learning Activities, Quizzes and Assignments

## Goal

Turn learning content into measurable, reviewable student work.

## Build Requirements

1. Add quizzes with multiple-choice questions, score calculation and review feedback.
2. Add practical assignments with instructions, starter files, due date and rubric.
3. Enable file/link/text submission.
4. Allow instructor feedback, score and resubmission.
5. Add student progress view showing pending, submitted, reviewed and overdue work.
6. Seed at least one lab/assignment for each course module.

## Acceptance Criteria

- Student can take a quiz and see results.
- Student can submit a practical assignment.
- Instructor can review, score and comment.
- Progress updates after passing work.

---

# Phase 8 — Capstone Workspace and Portfolio

## Goal

Guide the student to build the complete AI-Powered Sales Intelligence & CRM Operations Platform portfolio project.

## Build Requirements

1. Create a capstone dashboard with all ten required deliverables.
2. Show instructions, templates, deadlines, rubric and submission state for each deliverable.
3. Link to relevant CRM records, dashboard pages, AI lab and SOP templates.
4. Enable a final management report/presentation submission.
5. Give instructor a capstone review queue and final feedback workflow.

## Required Deliverables

1. Data cleaning
2. CRM data model
3. Lead scoring
4. Lead assignment
5. Sales dashboard
6. AI lead qualification
7. AI follow-up assistant
8. Competitive intelligence
9. SOP library
10. Management report

## Acceptance Criteria

- Student can see exactly what remains to complete the capstone.
- Instructor can assess each deliverable against a rubric.
- A completed capstone produces a portfolio-ready summary.

---

# Phase 9 — Certificates, Cohorts and Admin Operations

## Goal

Make the platform usable for real course delivery.

## Build Requirements

1. Create cohorts with start/end dates, instructor and enrolled students.
2. Provide enrollment management and student status.
3. Generate a certificate only when criteria are met: 80% course completion, 70% assessment score and approved capstone.
4. Create admin reports for enrollment, lesson progress, quiz results, submission status and capstone completion.
5. Provide a downloadable/printable certificate view.

## Acceptance Criteria

- Admin can create a cohort and enroll students.
- Completion rules are enforced automatically.
- Certificate includes learner name, course name, completion date and unique verification ID.

---

# Phase 10 — Quality, Security and Launch Readiness

## Goal

Prepare a stable and credible Version 1 for a beta cohort.

## Build Requirements

1. Test all role permissions and core student workflows.
2. Validate calculations for KPI, score, TAT and stale-lead logic.
3. Add input validation, error handling and empty states.
4. Add a privacy notice for demo data and AI practice.
5. Create instructor onboarding and student onboarding guides.
6. Create seed/demo reset instructions so every cohort starts with clean training data.
7. Document deployment, backup and recovery steps appropriate to the chosen stack.

## Beta Launch Definition of Done

- One instructor can manage one cohort.
- Ten students can complete the full learning journey.
- Demo CRM and dashboard use only fictional data.
- Students can complete a quiz, assignment and capstone submission.
- The system can issue a test certificate.
- No paid CRM or automation subscription is required for core learning.

---

# Development Instructions for Every Phase

When implementing a phase:

1. Inspect existing code before changing it.
2. State the files/features that will be changed.
3. Keep changes limited to the active phase.
4. Reuse existing project conventions and components.
5. Add or update seed data when needed for visible testing.
6. Test the primary user flow for the phase.
7. Report what is complete, what was tested and what belongs to the next phase.

## Do Not Build Yet

Do not add these until the core beta platform works:

- Payments and subscriptions
- Live video streaming
- Real email sending
- WhatsApp integration
- Full Salesforce/HubSpot synchronization
- AI agent autonomy
- Complex multi-tenant enterprise controls
- Advanced public certificate verification portal

These can be added after students successfully use the core learning platform.
