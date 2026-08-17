import { api, type User } from './api/client';
import { escape } from './format';
import { shell } from './shell';
import { errorView } from './views';

interface GlossaryTerm { term: string; definition: string; whyItMatters: string; }

export function glossaryView(user: User) {
  shell(user, `<section class="page-header"><div><span class="eyebrow">Course glossary</span><h1>Sales intelligence glossary</h1><p>Every term from the sales-metrics glossary — searchable, with a plain-English definition and why it matters for the funnel.</p></div></section><section class="analytics-card"><h2>Search glossary</h2><input id="glossary-search" placeholder="Search terms, definitions or why-it-matters…" style="width:100%;margin-bottom:14px"><div id="glossary-count" class="muted"></div><div id="glossary-list"><div class="loading">Loading…</div></div></section>`, 'Glossary');
  loadGlossary();
}

async function loadGlossary() {
  try {
    const data = await api<{ source: string | null; termCount: number; terms: GlossaryTerm[] }>('/api/glossary');
    const terms = data.terms;
    if (!terms.length) {
      document.querySelector('#glossary-list')!.innerHTML = '<p class="muted">No glossary terms available yet.</p>';
      return;
    }
    renderGlossary(terms);
    document.querySelector('#glossary-search')!.addEventListener('input', (event) => {
      renderGlossary(terms, String((event.target as HTMLInputElement).value).trim().toLowerCase());
    });
  } catch (error) {
    errorView((error as Error).message);
  }
}

function renderGlossary(terms: GlossaryTerm[], query = '') {
  const filtered = query
    ? terms.filter((term) => [term.term, term.definition, term.whyItMatters].join(' ').toLowerCase().includes(query))
    : terms;
  const sorted = [...filtered].sort((a, b) => a.term.localeCompare(b.term));
  const count = document.querySelector('#glossary-count');
  if (count) count.textContent = query ? `${filtered.length} of ${terms.length} terms match` : `${terms.length} terms in the glossary`;
  document.querySelector('#glossary-list')!.innerHTML = sorted.length
    ? sorted.map((term) => `<div class="glossary-term"><h3>${escape(term.term)}</h3><p>${escape(term.definition)}</p><p class="muted"><strong>Why it matters:</strong> ${escape(term.whyItMatters)}</p></div>`).join('')
    : '<p class="muted">No terms match that search.</p>';
}
