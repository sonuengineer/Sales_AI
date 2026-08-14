# Sales Intelligence, CRM & AI Automation Mastery

Self-contained training platform for learning sales intelligence, CRM operations and AI-assisted sales workflows using fictional data.

## Phase 1 status

The current implementation includes the Phase 0 foundation and Phase 1 authentication/application shell. It provides local demo sign-in, server-enforced role checks, role dashboards, system design documents and a fictional `NexaFlow` seed dataset.

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

## Local demo sign-in

Use any account below with password `demo123`:

- `admin@nexaflow.demo`
- `instructor@nexaflow.demo`
- `student@nexaflow.demo`

These credentials are for local development only. Sessions are held in memory and reset whenever the server restarts.

## Project structure

```text
public/                 Sign-in page, responsive application shell and role dashboards
data/nexaflow.seed.json Fictional B2B SaaS training data
docs/data-model.md      Entity design, relationships and governing rules
docs/navigation.md      Role-specific navigation and route protection design
test/                   Foundation seed-data checks
server.js               Dependency-free server, local authentication and role checks
```

## Roles

- **Admin:** manages users, courses, cohorts, reports, certificates and settings.
- **Instructor:** creates content and labs, manages assigned cohorts and reviews student work.
- **Student:** completes learning, works with assigned demo CRM records and submits work.

## Demo data

`NexaFlow` is a fictional B2B SaaS company. Every person, company, email address and commercial detail in the seed file is fictional and must be kept as training data only.

## Planned technical direction

Phase 1 uses a small dependency-free Node server to keep the local demo runnable. It enforces dashboard access server-side with a session cookie. Before production, migrate users, password hashes and sessions to a relational database and production-grade identity provider.

## Next phase

Phase 2: course, module and lesson management.
