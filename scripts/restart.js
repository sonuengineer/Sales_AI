// One-command restart: stops whatever is running on the port, rebuilds the
// frontend, reseeds the demo data, then starts the server.
// Usage: npm run restart   (or: node scripts/restart.js)
import { execSync, spawn } from 'node:child_process';
import process from 'node:process';

const PORT = process.env.PORT || '3000';
const isWin = process.platform === 'win32';

function killPort(port) {
  let pids = [];
  try {
    if (isWin) {
      const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
      pids = [...new Set(out.split(/\r?\n/).filter((line) => /LISTENING/i.test(line)).map((line) => line.trim().split(/\s+/).pop()).filter((pid) => /^\d+$/.test(pid)))];
      for (const pid of pids) { try { execSync(`taskkill /F /PID ${pid}`); } catch { /* already gone */ } }
    } else {
      const out = execSync(`lsof -ti tcp:${port}`, { encoding: 'utf8' }).trim();
      pids = out ? out.split(/\n/) : [];
      for (const pid of pids) { try { process.kill(Number(pid), 'SIGKILL'); } catch { /* already gone */ } }
    }
  } catch { /* nothing was listening */ }
  if (pids.length) console.log(`Stopped stale process(es) on port ${port}.`);
}

function run(cmd) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
}

killPort(PORT);
run('npm run build');
run('npm run db:seed');
console.log(`\nStarting server on http://localhost:${PORT} (Ctrl+C to stop)...`);
const child = spawn(process.execPath, ['server.js'], { stdio: 'inherit', env: { ...process.env, PORT } });
child.on('error', (error) => { console.error('Failed to start server:', error.message); process.exit(1); });
process.on('SIGINT', () => { child.kill('SIGINT'); process.exit(0); });
