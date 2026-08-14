const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const seed = require('./data/nexaflow.seed.json');

const root = path.join(__dirname, 'public');
const sessions = new Map();
const contentTypes = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const dashboardData = {
  ADMIN: { heading: 'Platform overview', description: 'Monitor the fictional NexaFlow beta cohort and keep learning delivery on track.', metrics: [['Active learners', '10'], ['Course completion', '34%'], ['Reviews awaiting action', '4']] },
  INSTRUCTOR: { heading: 'Teaching workspace', description: 'Guide your cohort through practical Sales Intelligence training.', metrics: [['Learners in cohort', '10'], ['Work awaiting review', '4'], ['Lessons published', '0']] },
  STUDENT: { heading: 'Your learning dashboard', description: 'Build your Sales Intelligence portfolio one practical step at a time.', metrics: [['Course progress', '0%'], ['Next activity', 'Orientation'], ['Submitted work', '0']] }
};

function parseCookies(value = '') {
  return Object.fromEntries(value.split(';').filter(Boolean).map((part) => {
    const index = part.indexOf('=');
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(([key]) => key));
}
function getSession(request) { return sessions.get(parseCookies(request.headers.cookie).session); }
function publicUser(user) { return { id: user.id, name: user.name, email: user.email, role: user.role }; }
function sendJson(response, status, payload, headers = {}) { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers }); response.end(JSON.stringify(payload)); }
function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; if (body.length > 10_000) request.destroy(); });
    request.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error('Invalid JSON')); } });
    request.on('error', reject);
  });
}
function requireRole(request, response, role) {
  const user = getSession(request);
  if (!user) { sendJson(response, 401, { error: 'Please sign in to continue.' }); return null; }
  if (user.role !== role) { sendJson(response, 403, { error: 'You do not have access to this area.' }); return null; }
  return user;
}
async function handleApi(request, response, pathname) {
  if (request.method === 'GET' && pathname === '/api/session') return sendJson(response, 200, { user: getSession(request) ? publicUser(getSession(request)) : null });
  if (request.method === 'POST' && pathname === '/api/login') {
    try {
      const { email, password } = await readJson(request);
      const user = seed.users.find((entry) => entry.email === String(email).toLowerCase());
      if (!user || password !== 'demo123') return sendJson(response, 401, { error: 'Use one of the supplied demo accounts and password.' });
      const token = crypto.randomBytes(32).toString('hex'); sessions.set(token, user);
      return sendJson(response, 200, { user: publicUser(user) }, { 'Set-Cookie': `session=${token}; HttpOnly; SameSite=Strict; Path=/` });
    } catch { return sendJson(response, 400, { error: 'Please provide valid sign-in details.' }); }
  }
  if (request.method === 'POST' && pathname === '/api/logout') {
    const token = parseCookies(request.headers.cookie).session; if (token) sessions.delete(token);
    return sendJson(response, 200, { ok: true }, { 'Set-Cookie': 'session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
  }
  const match = pathname.match(/^\/api\/dashboard\/(admin|instructor|student)$/);
  if (request.method === 'GET' && match) {
    const role = match[1].toUpperCase(); const user = requireRole(request, response, role);
    if (!user) return; return sendJson(response, 200, { user: publicUser(user), dashboard: dashboardData[role] });
  }
  return sendJson(response, 404, { error: 'Not found.' });
}
function serveStatic(response, pathname) {
  const requested = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.resolve(root, `.${requested}`);
  if (!filePath.startsWith(root + path.sep) && filePath !== path.join(root, 'index.html')) { response.writeHead(403); return response.end('Forbidden'); }
  fs.readFile(filePath, (error, file) => {
    if (error) { response.writeHead(error.code === 'ENOENT' ? 404 : 500); return response.end(error.code === 'ENOENT' ? 'Not found' : 'Server error'); }
    response.writeHead(200, { 'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream' }); response.end(file);
  });
}
function createServer() {
  return http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname.startsWith('/api/')) return handleApi(request, response, pathname);
    return serveStatic(response, pathname);
  });
}
if (require.main === module) { const port = Number(process.env.PORT || 3000); createServer().listen(port, () => console.log(`Sales Intelligence platform running at http://localhost:${port}`)); }
module.exports = { createServer, parseCookies };
