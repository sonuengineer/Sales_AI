import type { AddressInfo } from 'node:net';
import { createServer } from '../../server.js';
import { openDb } from '../../dist/db/index.js';
import { seedDatabase } from '../../scripts/seed.js';

export async function withServer(run: (base: string) => Promise<void>) {
  const db = openDb(':memory:');
  seedDatabase(db);
  const server = createServer({ db });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await run(base);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
  }
}

export async function signIn(base: string, email: string) {
  const response = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'demo123' }) });
  return { response, cookie: response.headers.get('set-cookie')!.split(';')[0] };
}
