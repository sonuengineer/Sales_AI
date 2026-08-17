import { api, type User } from './api/client';
import { escape, formatDate } from './format';
import { shell } from './shell';
import { errorView } from './views';
import type { CertificateEligibility, CertificateView } from './types/index';

const certHelp = () => '<details class="crm-help"><summary>How certificates work</summary><p>You earn a certificate when you meet all three criteria: <strong>80% course completion</strong>, <strong>70% assessment score</strong> (average of your quiz scores and graded assignments) and an <strong>approved capstone</strong>. Once issued, the certificate includes a unique verification ID anyone can check.</p></details>';

export function certificatesView(user: User) {
  const isManager = ['ADMIN', 'INSTRUCTOR'].includes(user.role);
  shell(user, `<section class="page-header"><div><span class="eyebrow">Completion credentials</span><h1>Certificates</h1><p>${isManager ? 'Review and verify certificates issued to learners.' : 'Track your progress toward a certificate of completion.'}</p></div></section>${certHelp()}<div id="certificates-content"><div class="loading">Loading…</div></div>`, 'Certificates');
  if (isManager) return certificatesAdminView(user);
  return certificatesStudentView(user);
}

async function certificatesStudentView(user: User) {
  try {
    const [{ criteria, certificate }, { certificates }] = await Promise.all([
      api<{ criteria: CertificateEligibility; certificate: CertificateView | null }>('/api/certificates/eligibility'),
      api<{ certificates: CertificateView[] }>('/api/certificates'),
    ]);
    const criteriaRows = [
      ['Course completion', `${criteria.lessons.value}% of ${criteria.lessons.required}%`, criteria.lessons.met],
      ['Assessment score', `${criteria.assessment.value}% of ${criteria.assessment.required}%`, criteria.assessment.met],
      ['Capstone approved', criteria.capstone.met ? 'Approved' : 'Not yet', criteria.capstone.met],
    ].map(([label, value, met]) => `<li class="${met ? 'review-correct' : 'review-wrong'}"><strong>${met ? '✓' : '✗'} ${escape(String(label))}</strong> — ${escape(String(value))}</li>`).join('');
    const issueButton = criteria.eligible && !certificate ? '<button id="issue-certificate" style="margin-top:14px">Issue my certificate</button>' : '';
    const certNote = certificate ? `<p class="muted">A certificate was issued on ${formatDate(certificate.issuedAt)} with verification ID <code>${escape(certificate.verificationId)}</code>.</p>` : criteria.eligible ? '<p class="muted">You have met every criterion — issue your certificate below.</p>' : '<p class="muted">Complete all three criteria to unlock your certificate.</p>';
    const certRows = certificates.map((cert) => `<tr><td>Certificate of Completion</td><td><code>${escape(cert.verificationId)}</code></td><td>${formatDate(cert.issuedAt)}</td><td><a href="/api/certificates/${escape(cert.id)}/print" target="_blank" rel="noreferrer">View / print</a></td></tr>`).join('') || '<tr><td colspan="4" class="muted">No certificates yet.</td></tr>';
    document.querySelector('#certificates-content')!.innerHTML = `<section class="state"><strong>Certificate eligibility</strong><ul class="timeline">${criteriaRows}</ul>${certNote}${issueButton}</section><section class="analytics-card"><h2>My certificates</h2><div class="table-wrap"><table class="crm-table"><thead><tr><th>Certificate</th><th>Verification ID</th><th>Issued</th><th></th></tr></thead><tbody>${certRows}</tbody></table></div></section>`;
    const issueButtonEl = document.querySelector('#issue-certificate');
    if (issueButtonEl) issueButtonEl.addEventListener('click', async () => {
      try {
        await api('/api/certificates/issue', { method: 'POST' });
        certificatesStudentView(user);
      } catch (error) { alert((error as Error).message); }
    });
  } catch (error) {
    errorView((error as Error).message);
  }
}

async function certificatesAdminView(user: User) {
  try {
    const { certificates } = await api<{ certificates: (CertificateView & { learnerName: string; courseName: string })[] }>('/api/certificates');
    const rows = certificates.map((cert) => `<tr><td>${escape(cert.learnerName)}</td><td>${escape(cert.courseName)}</td><td><code>${escape(cert.verificationId)}</code></td><td>${formatDate(cert.issuedAt)}</td><td><a href="/api/certificates/${escape(cert.id)}/print" target="_blank" rel="noreferrer">View / print</a></td></tr>`).join('') || '<tr><td colspan="5" class="muted">No certificates issued yet.</td></tr>';
    document.querySelector('#certificates-content')!.innerHTML = `<section class="analytics-card"><h2>Verify a certificate</h2><form id="verify-form" class="editor"><label>Verification ID<input name="verificationId" placeholder="NF-XXXX-XXXX-XXXX"></label><button>Verify</button></form><div id="verify-result"></div></section><section class="analytics-card"><h2>Issued certificates</h2><div class="table-wrap"><table class="crm-table"><thead><tr><th>Learner</th><th>Course</th><th>Verification ID</th><th>Issued</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
    document.querySelector('#verify-form')!.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const data = Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement)) as Record<string, string>;
        const { certificate } = await api<{ certificate: { learnerName: string; courseName: string; issuedAt: string; verificationId: string } }>('/api/certificates/verify', { method: 'POST', body: JSON.stringify({ verificationId: data.verificationId }) });
        document.querySelector('#verify-result')!.innerHTML = `<section class="state"><strong>✓ Verified</strong><p>${escape(certificate.learnerName)} — ${escape(certificate.courseName)} · issued ${formatDate(certificate.issuedAt)} · <code>${escape(certificate.verificationId)}</code></p></section>`;
      } catch (error) {
        document.querySelector('#verify-result')!.innerHTML = `<div class="error">${escape((error as Error).message)}</div>`;
      }
    });
  } catch (error) {
    errorView((error as Error).message);
  }
}
