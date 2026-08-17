import { api, type User } from './api/client';
import { escape, formatDate } from './format';
import { navigate, shell } from './shell';
import type { DashboardData } from './types/index';

export function loginView(message = '') {
  const app = document.querySelector('#app') as HTMLElement;
  app.innerHTML = `<main class="auth"><section class="card"><div class="eyebrow">Fictional training environment</div><h1>Welcome back</h1><p>Sign in to your Sales Intelligence learning workspace.</p><form id="login-form"><label>Email<input name="email" type="email" required autocomplete="email"></label><label>Password<input name="password" type="password" required autocomplete="current-password"></label><button type="submit" style="margin-top:20px;width:100%">Sign in</button></form>${message ? `<div class="error">${message}</div>` : ''}<div class="demo"><strong>Local demo accounts</strong><br>admin@nexaflow.demo · instructor@nexaflow.demo · student@nexaflow.demo<br>Password: <code>demo123</code></div></section><section class="card verify-card"><div class="eyebrow">Public verification</div><h1>Check a certificate</h1><p>Anyone can verify a certificate with its unique ID — no sign-in needed.</p><form id="public-verify-form"><label>Verification ID<input name="verificationId" placeholder="NF-XXXX-XXXX-XXXX" required></label><button type="submit" style="margin-top:20px;width:100%">Verify certificate</button></form><div id="public-verify-result"></div></section></main>`;
  document.querySelector('#login-form')!.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api('/api/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement))) });
      const { render } = await import('./app');
      render();
    } catch (error) {
      loginView((error as Error).message);
    }
  });
  document.querySelector('#public-verify-form')!.addEventListener('submit', async (event) => {
    event.preventDefault();
    const result = document.querySelector('#public-verify-result')!;
    try {
      const data = Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement)) as Record<string, string>;
      const { certificate } = await api<{ certificate: { learnerName: string; courseName: string; issuedAt: string; verificationId: string } }>('/api/certificates/verify', { method: 'POST', body: JSON.stringify({ verificationId: data.verificationId }) });
      result.innerHTML = `<section class="state"><strong>✓ Verified</strong><p>${escape(certificate.learnerName)} — ${escape(certificate.courseName)}<br><small class="muted">Issued ${formatDate(certificate.issuedAt)} · <code>${escape(certificate.verificationId)}</code></small></p></section>`;
    } catch (error) {
      result.innerHTML = `<div class="error">${escape((error as Error).message)}</div>`;
    }
  });
}

export async function dashboardView(user: User) {
  try {
    const { dashboard, privacyNotice } = await api<{ dashboard: DashboardData & { nextSteps?: string[] }; privacyNotice?: string }>(`/api/dashboard/${user.role.toLowerCase()}`);
    const cards = dashboard.metrics.map(([label, value]) => `<article class="metric"><span>${escape(label)}</span><strong>${escape(value)}</strong></article>`).join('');
    const steps = (dashboard.nextSteps || []).map((step) => `<li>${escape(step)}</li>`).join('');
    const coverageLink = user.role === 'STUDENT'
      ? '<button id="coverage-link" class="secondary" style="margin-top:16px">📚 Track curriculum coverage</button>'
      : user.role === 'INSTRUCTOR'
        ? '<button id="coverage-link" class="secondary" style="margin-top:16px">👥 View cohort curriculum coverage</button>'
        : '';
    shell(user, `<section class="page-header"><div><h1>${escape(dashboard.heading)}</h1><p>${escape(dashboard.description)}</p></div></section><section class="grid">${cards}</section>${coverageLink}${steps ? `<section class="state"><strong>Getting started</strong><ul>${steps}</ul></section>` : ''}<p class="notice">All NexaFlow records and results in this environment are fictional demo data.</p>${privacyNotice || ''}`);
    const coverage = document.querySelector('#coverage-link');
    if (coverage) coverage.addEventListener('click', () => navigate(user, user.role === 'STUDENT' ? 'Curriculum' : 'Coverage'));
  } catch (error) {
    errorView((error as Error).message);
  }
}

export function errorView(message: string) {
  const app = document.querySelector('#app') as HTMLElement;
  app.innerHTML = `<main class="auth"><section class="card"><h1>We couldn’t load your workspace</h1><p>${escape(message)}</p><button onclick="location.reload()">Try again</button></section></main>`;
}
