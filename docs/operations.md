# Operations Guide

Deployment, backup, recovery and demo-reset instructions for the Sales Intelligence training platform.

## Stack summary

- **Server:** Node.js 20+ (ESM), plain `node:http`, `better-sqlite3`.
- **Database:** a single SQLite file at `data/platform.db` (in-memory in tests).
- **Frontend:** Vite + TypeScript, built to `dist/` and served by the same server.
- **Auth:** bcrypt password hashes, JWT session cookies (`jsonwebtoken`), no external identity provider.
- **AI:** fully simulated generation — no external AI provider or API key is used anywhere.

## Demo reset

The seed scripts are the canonical way to reset every cohort to clean training data:

```bash
npm run db:seed
```

This clears all tables (learning progress, quiz attempts, submissions, capstones, certificates, cohorts, sandbox runs, CRM records) and reloads the fictional NexaFlow dataset, the 10-module course, quizzes/assignments, capstone deliverables and the demo cohort.

- Re-running `db:seed` is safe and idempotent.
- The server also auto-seeds an empty database on first start, so `npm start` works without running the scripts manually.
- To start completely fresh (drop the file): delete `data/platform.db`, then run `npm run db:init && npm run db:seed`.

## Backup

The entire application state lives in one file: `data/platform.db`. Backing up is copying that file.

```bash
# While the server is stopped (recommended for a clean snapshot)
cp data/platform.db backups/platform-$(date +%Y%m%d-%H%M%S).db

# While the server is running (SQLite journal is safe to copy for a point-in-time backup)
sqlite3 data/platform.db ".backup 'backups/platform-$(date +%Y%m%d-%H%M%S).db'"
```

Best practices:

- Back up before any `db:seed` if you need to keep current learner progress.
- Keep the seed files (`data/*.seed.json`) and this repository versioned — they are the source of truth for content.
- There are no secrets in the database beyond demo bcrypt hashes; the JWT secret comes from `SESSION_SECRET` (defaults to a demo value — set it in production).

## Recovery

To restore a backup:

```bash
cp backups/platform-YYYYMMDD-HHMMSS.db data/platform.db
npm start
```

If a database is missing or corrupt, rebuild from seed:

```bash
npm run db:init && npm run db:seed
```

Because all data is fictional training data, the fastest recovery path is usually to reseed rather than restore an old backup.

## Deployment

The app is a single Node process serving both the API and the built frontend — no separate web server is required.

### Build

```bash
npm ci
npm run build        # tsc typecheck + vite build → dist/
```

### Run

```bash
SESSION_SECRET="<a-long-random-string>" PORT=3000 npm start
```

The server:

1. Opens (or creates) `data/platform.db`.
2. Auto-seeds if the database is empty.
3. Serves the API under `/api/*` and the built frontend from `dist/`.

### Production considerations

- **Process manager:** run with a supervisor that restarts on crash and on boot, e.g. `systemd` or PM2 (`pm2 start server.js --name sales-platform`).
- **Reverse proxy:** put Nginx/Caddy in front for TLS and static caching:
  ```nginx
  server {
    listen 443 ssl;
    server_name platform.example.com;
    location / { proxy_pass http://127.0.0.1:3000; }
  }
  ```
- **Environment:** set `SESSION_SECRET` to a long random value and `PORT` as needed.
- **SQLite concurrency:** SQLite handles the write load of a small beta cohort; for heavy concurrency, switch the schema to a networked database (the schema lives in `src/db/schema.ts` and queries are standard SQL).
- **Logging:** the server logs a startup line; add a logger or pipe stdout to a file (`npm start >> logs/app.log 2>&1`).
- **Backups:** schedule a nightly `sqlite3 .backup` via cron to `backups/`.

### Health check

```bash
curl http://localhost:3000/api/session   # → {"user":null} when up
```

## Security checklist

- [ ] `SESSION_SECRET` set to a unique random value in production.
- [ ] Only fictional demo data is stored — never import real customer data.
- [ ] Public certificate verification is rate-limited per client (10 attempts/minute) to prevent ID scanning.
- [ ] Role checks are server-enforced on every API route (see `src/tests/permissions.test.ts`).
- [ ] All request bodies validated with `zod` schemas.
- [ ] HTTPS enabled at the reverse proxy; session cookie is `HttpOnly` + `SameSite=Strict`.
