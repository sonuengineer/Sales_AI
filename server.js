import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openDb } from './dist/db/index.js';
import { createApiContext } from './src/api/context.js';
import { createAuthRoutes } from './src/api/auth.js';
import { createCourseRoutes } from './src/api/course.js';
import { createCrmRoutes } from './src/api/crm.js';
import { createAnalyticsRoutes } from './src/api/analytics.js';
import { createWorkflowRoutes } from './src/api/workflow.js';
import { createAiRoutes } from './src/api/ai.js';
import { createActivitiesRoutes } from './src/api/activities.js';
import { createCapstoneRoutes } from './src/api/capstone.js';
import { createCohortRoutes } from './src/api/cohorts.js';
import { createCertificateRoutes } from './src/api/certificates.js';
import { createReportRoutes } from './src/api/reports.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_SECRET = process.env.SESSION_SECRET || 'nexaflow-demo-secret';
const contentTypes = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };

export function createServer({ db: database } = {}) {
  const db = database || openDb();
  const meta = db.prepare('SELECT value FROM platform_meta WHERE key = ?');
  const referenceDate = new Date(meta.get('referenceDate')?.value || Date.now());
  const ctx = createApiContext({ db, secret: SESSION_SECRET, referenceDate });
  const routeHandlers = [
    createAuthRoutes(ctx),
    createCourseRoutes(ctx),
    createCrmRoutes(ctx),
    createAnalyticsRoutes(ctx),
    createWorkflowRoutes(ctx),
    createAiRoutes(ctx),
    createActivitiesRoutes(ctx),
    createCapstoneRoutes(ctx),
    createCohortRoutes(ctx),
    createCertificateRoutes(ctx),
    createReportRoutes(ctx),
  ];

  async function handleApi(request, response, pathname) {
    for (const handler of routeHandlers) {
      if (await handler(request, response, pathname)) return;
    }
    return ctx.sendJson(response, 404, { error: 'Not found.' });
  }

  function serveStatic(response, pathname) {
    const root = fs.existsSync(path.join(__dirname, 'dist')) ? path.join(__dirname, 'dist') : path.join(__dirname, 'public');
    const requested = pathname === '/' ? '/index.html' : pathname;
    const filePath = path.resolve(root, `.${requested}`);
    if (!filePath.startsWith(root + path.sep) && filePath !== path.join(root, 'index.html')) { response.writeHead(403); return response.end('Forbidden'); }
    fs.readFile(filePath, (error, file) => {
      if (error) { response.writeHead(error.code === 'ENOENT' ? 404 : 500); return response.end(error.code === 'ENOENT' ? 'Not found' : 'Server error'); }
      response.writeHead(200, { 'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream' }); response.end(file);
    });
  }

  return http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname.startsWith('/api/')) {
      return handleApi(request, response, pathname).catch(() => { if (!response.headersSent) ctx.sendJson(response, 400, { error: 'The request could not be processed.' }); });
    }
    return serveStatic(response, pathname);
  });
}

async function ensureSeeded(db) {
  const count = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  if (count === 0) { const { seedDatabase } = await import('./scripts/seed.js'); seedDatabase(db); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = openDb();
  ensureSeeded(db).then(() => {
    const port = Number(process.env.PORT || 3000);
    createServer({ db }).listen(port, () => console.log(`Sales Intelligence platform running at http://localhost:${port}`));
  });
}

export { parseCookies } from './src/middleware/auth.js';
