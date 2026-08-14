# Sales Intelligence, CRM & AI Automation Mastery

Self-contained training platform for learning sales intelligence, CRM operations and AI-assisted sales workflows using fictional data.

## Phase 0 status

The current implementation is the project foundation. It provides a runnable local starter, system design documents and a fictional `NexaFlow` seed dataset. Authentication and product screens begin in Phase 1.

## Requirements

- Node.js 20 or newer

## Run locally

```powershell
npm start
```

Open `http://localhost:3000`. No package installation is required for this Phase 0 starter.

## Test

```powershell
npm test
```

## Project structure

```text
public/                 Runnable Phase 0 starter page
data/nexaflow.seed.json Fictional B2B SaaS training data
docs/data-model.md      Entity design, relationships and governing rules
docs/navigation.md      Role-specific navigation and route protection design
test/                   Foundation seed-data checks
server.js               Dependency-free local static server
```

## Roles

- **Admin:** manages users, courses, cohorts, reports, certificates and settings.
- **Instructor:** creates content and labs, manages assigned cohorts and reviews student work.
- **Student:** completes learning, works with assigned demo CRM records and submits work.

## Demo data

`NexaFlow` is a fictional B2B SaaS company. Every person, company, email address and commercial detail in the seed file is fictional and must be kept as training data only.

## Planned technical direction

Phase 1 will replace the static foundation with a TypeScript web application and server-side authentication/role checks. A relational database will persist learning and CRM records; the data model is intentionally database-agnostic at this stage to avoid committing to implementation details before the first working user flows.

## Next phase

Phase 1: authentication, demo accounts, role-based dashboards and the application shell.
