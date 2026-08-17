# Sales Intelligence, CRM & AI Automation Mastery

Self-contained training platform for learning sales intelligence, CRM operations and AI-assisted sales workflows using fictional data.

## Phase 10 status — beta ready

The platform is feature-complete through Phase 9 (foundation, auth/shell, course delivery, training CRM, analytics, workflow lab, AI practice lab, quizzes/assignments, capstone, cohorts/certificates/admin) and hardened in Phase 10 for a beta cohort. It provides local demo sign-in with server-enforced role checks, role dashboards with onboarding steps and a privacy notice, a seeded 10-module learning programme with full lesson content (worked examples, practice questions with answers and downloadable starter files per lesson) plus role-allowed editing and progress tracking, a CRM lab (filters, search, pagination, stage history, activity timelines), Analytics (KPIs, funnel, breakdowns, TAT, stale leads, period filters, CSV export), a Workflow Lab (scoring, assignment rules, simulation, alerts, sandbox), an AI Practice Lab (six simulated templates, approval-gated follow-ups — no API key), per-module quizzes and assignments with grading and resubmission, a ten-deliverable Capstone with an instructor review queue, cohort management, admin reports, and certificates with unique verification IDs, printable views and a rate-limited public verification endpoint anyone can call without signing in (also available on the sign-in page). Ten fictional students are seeded into a beta cohort. A comprehensive permission sweep and calculation-validation suite guards every API route and the KPI/score/TAT/stale logic. All records are fictional `NexaFlow` demo data stored in SQLite.

## Stack

- **Server:** Node.js 20+ (ESM) with `better-sqlite3`, `bcrypt` password hashing, JWT session cookies (`jsonwebtoken`) and `zod` request validation.
- **Frontend:** Vite + TypeScript in `src/`, built with `vite build`.
- **Tests:** Vitest (Node environment) in `src/tests/`.
- No paid CRM, database or AI subscription is required to run the platform.

## Setup

```bash
npm install          # install dependencies
npm run db:init      # create data/platform.db and tables
npm run db:seed      # load demo users, NexaFlow CRM data and the 10-module course
npm start            # http://localhost:3000
```

The server also auto-seeds an empty database on first start, so `npm start` works even before running the seed scripts.

### Development

```bash
npm run dev          # Vite dev server on :5173 (proxies /api to :3000) — run `npm start` too
```

### Build

```bash
npm run build        # tsc typecheck + vite build → dist/ (served by `npm start`)
```

### Test

```bash
npm test             # vitest run
```

## Local demo sign-in

Use any account below with password `demo123`:

- `admin@nexaflow.demo`
- `instructor@nexaflow.demo`
- `student@nexaflow.demo`
- `student2@nexaflow.demo` … `student10@nexaflow.demo` (additional demo learners)

These credentials are for local development only. Passwords are stored as bcrypt hashes and sessions are JWT cookies.

## Project structure

```text
index.html              Vite entry page
src/                    TypeScript frontend modules (shell, course, CRM, analytics views)
public/styles.css       Shared stylesheet (copied into the build)
server.js               ESM server: auth, course/CRM/analytics/workflow/AI/activities/capstone/cohorts/certificates/reports APIs, static serving
src/db/                 SQLite schema (src/db/schema.ts) and connection factory
scripts/init-db.js      Creates the database and tables
scripts/seed.js         Seed logic shared by the CLI and tests
scripts/seed-db.js      Loads all seed files
src/ai.js               Phase 6 simulated AI generation engine (six templates, follow-up drafts)
data/nexaflow.seed.json Fictional B2B SaaS training data (users, companies, leads, activities, opportunities, stage history)
data/course.seed.json   Seeded 10-module learning programme: full lesson content, worked examples, practice questions and downloadable starter files
data/activities.seed.json Seeded quiz + practical assignment for every module
data/capstone.seed.json  Seeded 10 capstone deliverables with rubric, deadlines and related links
docs/data-model.md      Entity design, relationships and governing rules
docs/curriculum-coverage.md  Maps every MasterPrompt.md module and topic to lessons, files, assessments and capstone deliverables
docs/navigation.md      Role-specific navigation and route protection design
docs/student-onboarding.md   Step-by-step guide for students (course → labs → capstone → certificate)
docs/instructor-onboarding.md Guide for instructors (content, reviews, cohorts, reports)
docs/operations.md      Deployment, backup, recovery and demo-reset instructions
src/tests/              Vitest suites: auth, foundation, course, CRM, analytics, workflow, AI lab, activities, capstone, cohorts, certificates, permissions and calculations
```

## Roles

- **Admin:** manages users, courses, cohorts, reports, certificates and settings.
- **Instructor:** creates content and labs, manages assigned cohorts and reviews student work.
- **Student:** completes learning, works with assigned demo CRM records and submits work.

## Demo data

`NexaFlow` is a fictional B2B SaaS company. Every person, company, email address and commercial detail in the seed files is fictional and must be kept as training data only. The database resets whenever you run `npm run db:seed`.

## Launch readiness

- Full role/permission sweep in `src/tests/permissions.test.ts` (11 API areas, unauthenticated/role checks, input validation).
- Calculation validation in `src/tests/calculations.test.ts` (KPIs, funnel, win rate, TAT, stale buckets).
- Privacy notice on every dashboard; simulated AI outputs labelled and never sent automatically.
- Onboarding guides and operations documentation (see `docs/`).
- One command resets all data: `npm run db:seed`.

## Next phase

The beta platform is complete — next: real cohort delivery and optional paid add-ons (payments, live video, real email) listed in `PLATFORM_BUILD_MASTER_PROMPT.md`.
