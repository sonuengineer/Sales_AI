import { describe, it, expect } from 'vitest';
import { withServer, signIn } from './helpers';

describe('authentication and role access', () => {
  it('each demo role can sign in and access only its dashboard', async () => {
    await withServer(async (base) => {
      const cases: [string, string][] = [['admin@nexaflow.demo', 'admin'], ['instructor@nexaflow.demo', 'instructor'], ['student@nexaflow.demo', 'student']];
      for (const [email, area] of cases) {
        const { response, cookie } = await signIn(base, email);
        expect(response.status).toBe(200);
        const permitted = await fetch(`${base}/api/dashboard/${area}`, { headers: { Cookie: cookie } });
        expect(permitted.status).toBe(200);
        const forbidden = await fetch(`${base}/api/dashboard/admin`, { headers: { Cookie: cookie } });
        expect(forbidden.status).toBe(area === 'admin' ? 200 : 403);
      }
    });
  });

  it('protected routes reject unauthenticated access and invalid credentials', async () => {
    await withServer(async (base) => {
      expect((await fetch(`${base}/api/dashboard/student`)).status).toBe(401);
      const invalid = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'student@nexaflow.demo', password: 'wrong' }) });
      expect(invalid.status).toBe(401);
    });
  });
});
