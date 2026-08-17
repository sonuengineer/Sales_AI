import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { readJson, privacyNotice } from './context.js';

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

export function createAuthRoutes(ctx) {
  const { db, sendJson, getSessionUser, publicUser, requireRole, dashboardData } = ctx;
  return async function authRoutes(request, response, pathname) {
    if (request.method === 'GET' && pathname === '/api/session') {
      const user = getSessionUser(request);
      return sendJson(response, 200, { user: user ? publicUser(user) : null });
    }
    if (request.method === 'POST' && pathname === '/api/login') {
      try {
        const body = loginSchema.parse(await readJson(request));
        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(body.email).toLowerCase());
        if (!user || !bcrypt.compareSync(body.password, user.password_hash)) return sendJson(response, 401, { error: 'Use one of the supplied demo accounts and password.' });
        const token = jwt.sign({ sub: user.id }, ctx.secret, { expiresIn: '7d' });
        return sendJson(response, 200, { user: publicUser(user) }, { 'Set-Cookie': `session=${token}; HttpOnly; SameSite=Strict; Path=/` });
      } catch { return sendJson(response, 400, { error: 'Please provide valid sign-in details.' }); }
    }
    if (request.method === 'POST' && pathname === '/api/logout') {
      return sendJson(response, 200, { ok: true }, { 'Set-Cookie': 'session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
    }
    const match = pathname.match(/^\/api\/dashboard\/(admin|instructor|student)$/);
    if (request.method === 'GET' && match) {
      const role = match[1].toUpperCase(); const user = requireRole(request, response, role);
      if (!user) return true;
      return sendJson(response, 200, { user: publicUser(user), dashboard: dashboardData[role], privacyNotice });
    }
    return false;
  };
}
