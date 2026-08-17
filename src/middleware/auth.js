import jwt from 'jsonwebtoken';

export function parseCookies(value = '') {
  return Object.fromEntries(value.split(';').filter(Boolean).map((part) => {
    const index = part.indexOf('=');
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(([key]) => key));
}

export function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

export function createAuth({ db, secret, sendJson }) {
  function getSessionUser(request) {
    const token = parseCookies(request.headers.cookie).session;
    if (!token) return null;
    try {
      const payload = jwt.verify(token, secret);
      return db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub) || null;
    } catch {
      return null;
    }
  }
  function requireUser(request, response) {
    const user = getSessionUser(request);
    if (!user) { sendJson(response, 401, { error: 'Please sign in to continue.' }); return null; }
    return user;
  }
  function requireRole(request, response, role) {
    const user = requireUser(request, response);
    if (!user) return null;
    if (user.role !== role) { sendJson(response, 403, { error: 'You do not have access to this area.' }); return null; }
    return user;
  }
  function requireContentManager(request, response) {
    const user = requireUser(request, response);
    if (!user) return null;
    if (!['ADMIN', 'INSTRUCTOR'].includes(user.role)) { sendJson(response, 403, { error: 'Only administrators and instructors can manage course content.' }); return null; }
    return user;
  }
  function requireCrmManager(request, response) {
    const user = requireUser(request, response);
    if (!user) return null;
    if (!['ADMIN', 'INSTRUCTOR'].includes(user.role)) { sendJson(response, 403, { error: 'Only administrators and instructors can manage CRM records.' }); return null; }
    return user;
  }
  return { publicUser, getSessionUser, requireUser, requireRole, requireContentManager, requireCrmManager };
}
