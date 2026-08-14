const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../server');

async function withServer(run) {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await run(base); } finally { await new Promise((resolve) => server.close(resolve)); }
}
async function signIn(base, email) {
  const response = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'demo123' }) });
  return { response, cookie: response.headers.get('set-cookie').split(';')[0] };
}

test('each demo role can sign in and access only its dashboard', async () => {
  await withServer(async (base) => {
    const cases = [['admin@nexaflow.demo', 'admin'], ['instructor@nexaflow.demo', 'instructor'], ['student@nexaflow.demo', 'student']];
    for (const [email, area] of cases) {
      const { response, cookie } = await signIn(base, email);
      assert.equal(response.status, 200);
      const permitted = await fetch(`${base}/api/dashboard/${area}`, { headers: { Cookie: cookie } });
      assert.equal(permitted.status, 200);
      const forbidden = await fetch(`${base}/api/dashboard/admin`, { headers: { Cookie: cookie } });
      assert.equal(forbidden.status, area === 'admin' ? 200 : 403);
    }
  });
});

test('protected dashboard rejects unauthenticated access and invalid credentials', async () => {
  await withServer(async (base) => {
    assert.equal((await fetch(`${base}/api/dashboard/student`)).status, 401);
    const invalid = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'student@nexaflow.demo', password: 'wrong' }) });
    assert.equal(invalid.status, 401);
  });
});
