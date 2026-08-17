// Full browser walkthrough: drives headless Chrome over the DevTools Protocol
// (no dependencies), signs in as each role, clicks every nav item and reports
// whether each page rendered or showed the error state.
// Usage: node scripts/browser-walkthrough.js  (server must be running)
import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = process.env.BASE || 'http://localhost:3000';
const PASSWORD = 'demo123';
const ROLES = [
  { name: 'student', email: 'student@nexaflow.demo', nav: null },
  { name: 'instructor', email: 'instructor@nexaflow.demo', nav: null },
  { name: 'admin', email: 'admin@nexaflow.demo', nav: null },
];
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  `${process.env.LOCALAPPDATA || ''}/Google/Chrome/Application/chrome.exe`,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

// --- minimal WebSocket client -------------------------------------------------
class WsClient {
  constructor(socket) { this.socket = socket; this.buffer = Buffer.alloc(0); this.onMessage = null; }
  static async connect(host, port, pathname) {
    const key = crypto.randomBytes(16).toString('base64');
    const socket = net.connect(port, host);
    await new Promise((resolve, reject) => {
      let headerBuffer = '';
      socket.once('connect', () => socket.write(`GET ${pathname} HTTP/1.1\r\nHost: ${host}:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`));
      socket.once('error', reject);
      socket.on('data', function onHeader(chunk) {
        headerBuffer += chunk.toString('latin1');
        const end = headerBuffer.indexOf('\r\n\r\n');
        if (end === -1) return; // wait for the full header block
        const expected = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
        if (!headerBuffer.startsWith('HTTP/1.1 101') || !headerBuffer.includes(expected)) return reject(new Error('Bad WebSocket handshake'));
        socket.off('data', onHeader);
        resolve();
      });
    });
    const client = new WsClient(socket);
    socket.on('data', (chunk) => client._feed(chunk));
    socket.on('close', () => client.onMessage?.({ method: '__closed' }));
    return client;
  }
  _feed(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (true) {
      if (this.buffer.length < 2) return;
      const opcode = this.buffer[0] & 0x0f;
      const masked = (this.buffer[1] & 0x80) !== 0;
      let len = this.buffer[1] & 0x7f;
      let offset = 2;
      if (len === 126) { if (this.buffer.length < 4) return; len = this.buffer.readUInt16BE(2); offset = 4; }
      else if (len === 127) { if (this.buffer.length < 10) return; len = Number(this.buffer.readBigUInt64BE(2)); offset = 10; }
      if (masked) offset += 4;
      if (this.buffer.length < offset + len) return;
      let payload = this.buffer.subarray(offset, offset + len);
      if (masked) { const mask = this.buffer.subarray(offset - 4, offset); payload = Buffer.from(payload.map((byte, i) => byte ^ mask[i % 4])); }
      this.buffer = this.buffer.subarray(offset + len);
      if (opcode === 0x8) return; // close
      if (opcode === 0x9) { this._send(0xa, Buffer.alloc(0)); continue; } // ping → pong
      if (opcode === 0x1) this.onMessage?.(JSON.parse(payload.toString('utf8')));
    }
  }
  _send(opcode, payload) {
    // client → server frames must be masked (RFC 6455 §5.3)
    const mask = crypto.randomBytes(4);
    const masked = Buffer.from(payload.map((byte, i) => byte ^ mask[i % 4]));
    let header;
    if (payload.length < 126) header = Buffer.from([0x80 | opcode, 0x80 | payload.length]);
    else if (payload.length < 65536) { header = Buffer.alloc(4); header[0] = 0x80 | opcode; header[1] = 0x80 | 126; header.writeUInt16BE(payload.length, 2); }
    else { header = Buffer.alloc(10); header[0] = 0x80 | opcode; header[1] = 0x80 | 127; header.writeBigUInt64BE(BigInt(payload.length), 2); }
    this.socket.write(Buffer.concat([header, mask, masked]));
  }
  send(json) { this._send(0x1, Buffer.from(JSON.stringify(json), 'utf8')); }
}

function httpJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => { let data = ''; res.on('data', (c) => data += c); res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } }); }).on('error', reject);
  });
}

async function findChrome() {
  for (const candidate of CHROME_CANDIDATES) if (candidate && fs.existsSync(candidate)) return candidate;
  throw new Error('Chrome not found. Set CHROME_PATH to the chrome executable.');
}

async function waitFor(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

// --- main ---------------------------------------------------------------------
let chrome, ws, nextId = 0, pending = new Map();
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send({ id, method, params });
  });
}
async function evaluate(expression) {
  const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'evaluation failed');
  return result.result.value;
}
async function waitForSelector(expr, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await evaluate(expr);
    if (value) return value;
    await waitFor(150);
  }
  throw new Error(`Timed out waiting for: ${expr}`);
}
async function loginCookie(email) {
  const body = JSON.stringify({ email, password: PASSWORD });
  const response = await fetch(`${BASE}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  if (!response.ok) throw new Error(`Login failed for ${email}: ${response.status}`);
  const setCookie = response.headers.get('set-cookie') || '';
  return setCookie.split(';')[0];
}
async function visit(pathname) {
  await cdp('Page.navigate', { url: `${BASE}${pathname}` });
  await waitForSelector(`document.querySelector('#app')?.innerText.includes('Loading') === false || !document.querySelector('#app')`, 10000);
  await waitFor(400);
}
async function clickNav(label) {
  const clicked = await evaluate(`(() => { const b = [...document.querySelectorAll('[data-nav]')].find(x => x.textContent.trim() === ${JSON.stringify(label)}); if (!b) return false; b.click(); return true; })()`);
  if (!clicked) return 'nav button missing';
  await waitFor(700);
  const text = await evaluate(`document.querySelector('#app')?.innerText || ''`);
  return text;
}

async function main() {
  const chromePath = await findChrome();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-walkthrough-'));
  chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${userDataDir}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });

  // find the DevTools port from the user-data-dir
  const portFile = path.join(userDataDir, 'DevToolsActivePort');
  let port;
  for (let i = 0; i < 50; i += 1) {
    if (fs.existsSync(portFile)) { port = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]); break; }
    await waitFor(200);
  }
  if (!port) throw new Error('Chrome did not open a DevTools port.');

  // find the page target websocket url
  let wsUrl;
  for (let i = 0; i < 20 && !wsUrl; i += 1) {
    try { const targets = await httpJson(`http://127.0.0.1:${port}/json/list`); wsUrl = targets.find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch { /* retry */ }
    if (!wsUrl) await waitFor(200);
  }
  if (!wsUrl) throw new Error('Could not connect to the Chrome page target.');

  ws = await WsClient.connect('127.0.0.1', port, new URL(wsUrl).pathname);
  ws.onMessage = (message) => {
    if (message.id && pending.has(message.id)) { const p = pending.get(message.id); pending.delete(message.id); message.error ? p.reject(new Error(JSON.stringify(message.error))) : p.resolve(message.result); }
  };
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Network.enable');

  const results = [];
  for (const role of ROLES) {
    console.log(`\nSigning in as ${role.email}…`);
    const cookie = await loginCookie(role.email);
    await cdp('Network.setCookie', { name: 'session', value: cookie.split('=')[1], url: BASE, path: '/' });
    await visit('/');
    // The shell (sidebar nav) only renders after a valid session — its presence
    // means the role dashboard loaded. Login page has no nav buttons.
    await waitForSelector(`document.querySelector('[data-nav]') !== null`, 10000).catch(async (error) => {
      const text = await evaluate(`document.querySelector('#app')?.innerText || ''`).catch(() => '');
      throw new Error(`${error.message} — page shows: ${text.replace(/\s+/g, ' ').slice(0, 160)}`);
    });
    const navLabels = await evaluate(`[...document.querySelectorAll('[data-nav]')].map(x => x.textContent.trim())`);
    role.nav = navLabels;
    const pageResults = [];
    for (const label of navLabels) {
      const text = await Promise.race([clickNav(label), waitFor(12000).then(() => 'WALKTHROUGH_TIMEOUT')]);
      const failed = text === 'WALKTHROUGH_TIMEOUT' || /couldn'?t load|could not load/i.test(text) || text.trim() === '' || text.includes('Loading');
      pageResults.push({ page: label, ok: !failed, snippet: text.replace(/\s+/g, ' ').slice(0, 90) });
    }
    results.push({ role: role.name, email: role.email, pages: pageResults });
  }

  console.log('\n=== Browser walkthrough ===\n');
  let allOk = true;
  for (const role of results) {
    console.log(`\n[${role.role}] ${role.email} — ${role.pages.length} nav items`);
    for (const page of role.pages) {
      if (!page.ok) allOk = false;
      console.log(`  ${page.ok ? '✓' : '✗'} ${page.page}${page.ok ? '' : `  →  ${page.snippet}`}`);
    }
  }
  console.log(`\n${allOk ? 'ALL PAGES RENDERED OK' : 'SOME PAGES FAILED'}`);
  chrome.kill();
  process.exit(allOk ? 0 : 1);
}

main().catch((error) => { console.error('Walkthrough failed:', error.message); try { chrome?.kill(); } catch { /* noop */ } process.exit(1); });
