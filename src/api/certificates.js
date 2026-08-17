import crypto from 'node:crypto';
import { z } from 'zod';
import { readJson } from './context.js';

const LESSON_REQUIRED = 80;
const ASSESSMENT_REQUIRED = 70;
const verifySchema = z.object({ verificationId: z.string().trim().min(1) });

// Simple in-memory fixed-window rate limiter keyed by client address.
// Resets whenever the server restarts — fine for a local demo; in production
// this can be replaced with a shared store (e.g. Redis) or a proxy rule.
function createRateLimiter({ windowMs = 60_000, max = 10 } = {}) {
  const hits = new Map();
  return function check(ip) {
    const now = Date.now();
    const entry = hits.get(ip);
    if (!entry || entry.resetAt <= now) {
      hits.set(ip, { count: 1, resetAt: now + windowMs });
      return { allowed: true };
    }
    entry.count += 1;
    if (entry.count > max) {
      return { allowed: false, retryAfter: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
    }
    return { allowed: true };
  };
}

export function createCertificateRoutes(ctx) {
  const { db, sendJson, requireUser, requireRole, requireContentManager } = ctx;
  const rateLimit = createRateLimiter();

  function enrollmentFor(user) {
    let enrollment = db.prepare('SELECT * FROM enrollments WHERE student_id = ? ORDER BY rowid LIMIT 1').get(user.id);
    if (!enrollment) {
      db.prepare('INSERT OR IGNORE INTO enrollments (id, cohort_id, student_id, progress_percent, status) VALUES (?, ?, ?, 0, ?)').run(`enroll-${user.id}`, 'cohort-beta-001', user.id, 'active');
      enrollment = db.prepare('SELECT * FROM enrollments WHERE id = ?').get(`enroll-${user.id}`);
    }
    return enrollment;
  }
  function lessonProgressPercent(userId) {
    const total = db.prepare('SELECT COUNT(*) AS count FROM lessons').get().count;
    if (!total) return 0;
    const completed = db.prepare('SELECT COUNT(*) AS count FROM lesson_completions WHERE user_id = ?').get(userId).count;
    return Math.round((completed / total) * 100);
  }
  function assessmentScore(enrollmentId) {
    const quizzes = db.prepare('SELECT id FROM quizzes').all();
    const assignments = db.prepare('SELECT id FROM assignments').all();
    let total = 0;
    for (const quiz of quizzes) {
      const best = db.prepare('SELECT MAX(score) AS score FROM quiz_attempts WHERE quiz_id = ? AND enrollment_id = ?').get(quiz.id, enrollmentId).score;
      total += best ?? 0;
    }
    for (const assignment of assignments) {
      const graded = db.prepare("SELECT score FROM submissions WHERE assignment_id = ? AND enrollment_id = ? AND status = 'graded' ORDER BY submitted_at DESC LIMIT 1").get(assignment.id, enrollmentId);
      total += graded?.score ?? 0;
    }
    const count = quizzes.length + assignments.length;
    return count ? Math.round(total / count) : 0;
  }
  function capstoneApproved(enrollmentId) {
    return !!db.prepare("SELECT id FROM capstones WHERE enrollment_id = ? AND status = 'approved'").get(enrollmentId);
  }
  function criteriaFor(user) {
    const enrollment = enrollmentFor(user);
    const lessons = lessonProgressPercent(user.id);
    const assessment = assessmentScore(enrollment.id);
    const capstone = capstoneApproved(enrollment.id);
    return {
      lessons: { value: lessons, required: LESSON_REQUIRED, met: lessons >= LESSON_REQUIRED },
      assessment: { value: assessment, required: ASSESSMENT_REQUIRED, met: assessment >= ASSESSMENT_REQUIRED },
      capstone: { value: capstone ? 100 : 0, required: 100, met: capstone },
      eligible: lessons >= LESSON_REQUIRED && assessment >= ASSESSMENT_REQUIRED && capstone,
    };
  }
  function certificateFor(enrollmentId) {
    const row = db.prepare('SELECT * FROM certificates WHERE enrollment_id = ? ORDER BY issued_at DESC LIMIT 1').get(enrollmentId);
    return row ? decorateCertificate(row) : null;
  }
  function decorateCertificate(row) {
    return { id: row.id, verificationId: row.verification_id, issuedAt: row.issued_at };
  }
  function generateVerificationId() {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const id = `NF-${crypto.randomBytes(6).toString('hex').toUpperCase().replace(/(.{4})/g, '$1-').slice(0, -1)}`;
      if (!db.prepare('SELECT id FROM certificates WHERE verification_id = ?').get(id)) return id;
    }
    throw new Error('Could not generate a unique verification ID.');
  }
  function printHtml(certificate) {
    const { learnerName, courseName, issuedAt, verificationId } = certificate;
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Certificate of Completion — ${learnerName}</title><style>body{font-family:Georgia,serif;display:grid;place-items:center;min-height:100vh;background:#f4f6fb;margin:0;padding:24px}.cert{max-width:820px;width:100%;background:#fff;border:6px double #102a56;padding:52px 60px;text-align:center;box-shadow:0 18px 40px #172b4d22}.brand{font-size:.8rem;letter-spacing:.25em;text-transform:uppercase;color:#155eef;font-weight:700}.title{font-size:2.2rem;margin:22px 0 4px;color:#102a56}h1{font-size:2.8rem;margin:10px 0 4px;color:#102a56}.body{font-size:1rem;color:#52647c;line-height:1.7;max-width:560px;margin:18px auto}.course{font-size:1.15rem;font-weight:700;color:#172b4d}.meta{display:flex;justify-content:space-between;gap:18px;margin-top:34px;font-size:.85rem;color:#52647c;border-top:1px solid #e4e8f0;padding-top:18px;text-align:left}.meta strong{display:block;color:#172b4d;margin-bottom:2px}.verify{font-family:monospace;font-weight:700;color:#155eef}.print{margin-top:24px;font-family:system-ui,sans-serif}.print button{padding:11px 20px;border:0;border-radius:8px;background:#155eef;color:#fff;font-weight:700;cursor:pointer}@media print{body{background:#fff;padding:0}.print{display:none}.cert{border-width:3px;box-shadow:none}}</style></head><body><section class="cert"><div class="brand">NexaFlow Training Platform</div><div class="title">Certificate of Completion</div><h1>${learnerName}</h1><p class="body">has successfully completed the course</p><div class="course">${courseName}</div><p class="body">by meeting the completion criteria: 80% course completion, 70% assessment score and an approved capstone project.</p><div class="meta"><div><strong>Date issued</strong>${new Date(issuedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</div><div><strong>Verification ID</strong><span class="verify">${verificationId}</span></div></div></section><div class="print"><button onclick="window.print()">Print / Save as PDF</button></div></body></html>`;
  }

  return async function certificateRoutes(request, response, pathname) {
    if (request.method === 'GET' && pathname === '/api/certificates/eligibility') {
      const user = requireUser(request, response); if (!user) return true;
      const enrollment = enrollmentFor(user);
      return sendJson(response, 200, { criteria: criteriaFor(user), certificate: certificateFor(enrollment.id) });
    }
    if (request.method === 'POST' && pathname === '/api/certificates/issue') {
      const user = requireRole(request, response, 'STUDENT'); if (!user) return true;
      const enrollment = enrollmentFor(user);
      const existing = certificateFor(enrollment.id);
      if (existing) return sendJson(response, 409, { error: 'A certificate has already been issued for this enrollment.', certificate: existing });
      const criteria = criteriaFor(user);
      if (!criteria.eligible) return sendJson(response, 400, { error: 'Complete the criteria before requesting a certificate.', criteria });
      const certificate = { id: `cert-${crypto.randomUUID()}`, enrollmentId: enrollment.id, verificationId: generateVerificationId(), issuedAt: new Date().toISOString() };
      db.prepare('INSERT INTO certificates (id, enrollment_id, verification_id, issued_at) VALUES (?, ?, ?, ?)').run(certificate.id, certificate.enrollmentId, certificate.verificationId, certificate.issuedAt);
      db.prepare("UPDATE enrollments SET status = 'completed', completed_at = ? WHERE id = ?").run(certificate.issuedAt, enrollment.id);
      return sendJson(response, 201, { certificate: { id: certificate.id, verificationId: certificate.verificationId, issuedAt: certificate.issuedAt } });
    }
    if (request.method === 'GET' && pathname === '/api/certificates') {
      const user = requireUser(request, response); if (!user) return true;
      if (['ADMIN', 'INSTRUCTOR'].includes(user.role)) {
        const rows = db.prepare('SELECT c.*, u.name AS learner_name, cu.title AS course_name FROM certificates c JOIN enrollments e ON e.id = c.enrollment_id JOIN users u ON u.id = e.student_id JOIN cohorts ch ON ch.id = e.cohort_id JOIN courses cu ON cu.id = ch.course_id ORDER BY c.issued_at DESC').all();
        return sendJson(response, 200, { certificates: rows.map((row) => ({ ...decorateCertificate(row), learnerName: row.learner_name, courseName: row.course_name })) });
      }
      const enrollment = enrollmentFor(user);
      const certificates = db.prepare('SELECT * FROM certificates WHERE enrollment_id = ? ORDER BY issued_at DESC').all(enrollment.id).map(decorateCertificate);
      return sendJson(response, 200, { certificates });
    }
    const certificateMatch = pathname.match(/^\/api\/certificates\/([^/]+)$/);
    if (request.method === 'GET' && certificateMatch) {
      const user = requireUser(request, response); if (!user) return true;
      const row = db.prepare('SELECT c.*, u.name AS learner_name, cu.title AS course_name, e.student_id FROM certificates c JOIN enrollments e ON e.id = c.enrollment_id JOIN users u ON u.id = e.student_id JOIN cohorts ch ON ch.id = e.cohort_id JOIN courses cu ON cu.id = ch.course_id WHERE c.id = ?').get(certificateMatch[1]);
      if (!row) return sendJson(response, 404, { error: 'Certificate not found.' });
      if (!['ADMIN', 'INSTRUCTOR'].includes(user.role) && row.student_id !== user.id) return sendJson(response, 403, { error: 'You can only view your own certificate.' });
      return sendJson(response, 200, { certificate: { ...decorateCertificate(row), learnerName: row.learner_name, courseName: row.course_name } });
    }
    const printMatch = pathname.match(/^\/api\/certificates\/([^/]+)\/print$/);
    if (request.method === 'GET' && printMatch) {
      const user = requireUser(request, response); if (!user) return true;
      const row = db.prepare('SELECT c.*, u.name AS learner_name, cu.title AS course_name, e.student_id FROM certificates c JOIN enrollments e ON e.id = c.enrollment_id JOIN users u ON u.id = e.student_id JOIN cohorts ch ON ch.id = e.cohort_id JOIN courses cu ON cu.id = ch.course_id WHERE c.id = ?').get(printMatch[1]);
      if (!row) return sendJson(response, 404, { error: 'Certificate not found.' });
      if (!['ADMIN', 'INSTRUCTOR'].includes(user.role) && row.student_id !== user.id) return sendJson(response, 403, { error: 'You can only print your own certificate.' });
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(printHtml({ learnerName: row.learner_name, courseName: row.course_name, issuedAt: row.issued_at, verificationId: row.verification_id }));
      return true;
    }
    if (request.method === 'POST' && pathname === '/api/certificates/verify') {
      // Public endpoint — anyone can verify a certificate by its verification ID.
      // Rate-limit by client address so the endpoint cannot be scanned for valid IDs.
      const ip = request.socket.remoteAddress || 'unknown';
      const limit = rateLimit(ip);
      if (!limit.allowed) {
        return sendJson(response, 429, { error: 'Too many verification attempts — try again in a minute.' }, { 'Retry-After': String(limit.retryAfter) });
      }
      const body = verifySchema.parse(await readJson(request));
      const row = db.prepare('SELECT c.*, u.name AS learner_name, cu.title AS course_name FROM certificates c JOIN enrollments e ON e.id = c.enrollment_id JOIN users u ON u.id = e.student_id JOIN cohorts ch ON ch.id = e.cohort_id JOIN courses cu ON cu.id = ch.course_id WHERE c.verification_id = ?').get(body.verificationId);
      if (!row) return sendJson(response, 404, { error: 'No certificate matches that verification ID.' });
      return sendJson(response, 200, { certificate: { learnerName: row.learner_name, courseName: row.course_name, issuedAt: row.issued_at, verificationId: row.verification_id, verified: true } });
    }
    return false;
  };
}
