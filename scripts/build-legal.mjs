#!/usr/bin/env node
/**
 * Builds the public legal site from the markdown in `legal/`.
 *
 *   node scripts/build-legal.mjs          # writes legal/site/
 *
 * The markdown files are the single source of truth: the Terms, the Privacy
 * Policy and the disclosure are edited there, and this script renders them to
 * styled HTML for `vercel deploy`. Entity details live in legal/site.config.json
 * so they only have to be filled in once.
 *
 * No dependencies: the documents use a small, fixed set of markdown constructs
 * (headings, paragraphs, blockquotes, lists, tables, rules, and inline
 * bold/italic/code/links), so a purpose-built converter is smaller and safer
 * than pulling in a parser at build time.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const legalDir = path.join(root, 'legal');
const outDir = path.join(legalDir, 'site');

const config = JSON.parse(fs.readFileSync(path.join(legalDir, 'site.config.json'), 'utf8'));

/** Placeholder tokens used in the markdown → config values. Missing values stay bracketed. */
const TOKENS = {
  '[COMPANY LEGAL NAME]': config.companyName,
  '[RC NUMBER]': config.registrationNumber,
  '[REGISTERED ADDRESS]': config.address,
  '[SUPPORT EMAIL]': config.supportEmail,
  '[PRIVACY EMAIL]': config.privacyEmail,
  '[DPO NAME]': config.dpoName,
  '[DPO EMAIL]': config.dpoEmail,
  '[WEBSITE]': config.website,
  '[EFFECTIVE DATE]': config.effectiveDate,
  '[LAST UPDATED]': config.lastUpdated,
  '[NGN CAP AMOUNT]': config.liabilityCap,
};

const missing = Object.entries(TOKENS)
  .filter(([, value]) => !value)
  .map(([token]) => token);

const fill = (text) =>
  Object.entries(TOKENS).reduce((acc, [token, value]) => acc.split(token).join(value || token), text);

// ---------------------------------------------------------------- inline ----

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function inline(text) {
  const code = [];
  let s = escapeHtml(text).replace(/`([^`]+)`/g, (_, c) => {
    code.push(`<code>${c}</code>`);
    return `\u0000${code.length - 1}\u0000`;
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
    const external = /^https?:/i.test(href);
    return `<a href="${href}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => code[Number(i)]);
}

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[`*_[\]()]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

// ----------------------------------------------------------------- block ----

function renderMarkdown(markdown, headings) {
  const lines = markdown.split(/\r?\n/);
  const out = [];
  let i = 0;

  const flushParagraph = (buf) => {
    if (buf.length) out.push(`<p>${inline(buf.join(' '))}</p>`);
    return [];
  };

  let para = [];

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      para = flushParagraph(para);
      i += 1;
      continue;
    }

    // Horizontal rule.
    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      para = flushParagraph(para);
      out.push('<hr />');
      i += 1;
      continue;
    }

    // Heading.
    const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed);
    if (heading) {
      para = flushParagraph(para);
      const level = heading[1].length;
      const text = heading[2].replace(/\*\*/g, '');
      const id = slug(text);
      if (level === 2) headings.push({ id, text });
      out.push(`<h${level} id="${id}">${inline(heading[2].replace(/^\*\*|\*\*$/g, ''))}</h${level}>`);
      i += 1;
      continue;
    }

    // Blockquote: consume consecutive "> " lines.
    if (/^>\s?/.test(trimmed)) {
      para = flushParagraph(para);
      const body = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        body.push(lines[i].trim().replace(/^>\s?/, ''));
        i += 1;
      }
      const inner = [];
      let chunk = [];
      for (const bl of body) {
        if (!bl.trim()) {
          if (chunk.length) inner.push(`<p>${inline(chunk.join(' '))}</p>`);
          chunk = [];
        } else {
          chunk.push(bl);
        }
      }
      if (chunk.length) inner.push(`<p>${inline(chunk.join(' '))}</p>`);
      out.push(`<blockquote>${inner.join('')}</blockquote>`);
      continue;
    }

    // Table.
    if (trimmed.startsWith('|') && /^\|[\s:|-]+\|$/.test((lines[i + 1] || '').trim())) {
      para = flushParagraph(para);
      const cells = (row) =>
        row
          .trim()
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((c) => c.trim());
      const head = cells(trimmed);
      i += 2;
      const body = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        body.push(cells(lines[i].trim()));
        i += 1;
      }
      out.push(
        `<div class="table-wrap"><table><thead><tr>${head
          .map((c) => `<th>${inline(c)}</th>`)
          .join('')}</tr></thead><tbody>${body
          .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
          .join('')}</tbody></table></div>`
      );
      continue;
    }

    // Lists.
    const isUl = /^[-*]\s+/.test(trimmed);
    const isOl = /^\d+\.\s+/.test(trimmed);
    if (isUl || isOl) {
      para = flushParagraph(para);
      const tag = isUl ? 'ul' : 'ol';
      const items = [];
      while (i < lines.length) {
        const t = lines[i].trim();
        const m = isUl ? /^[-*]\s+(.*)$/.exec(t) : /^\d+\.\s+(.*)$/.exec(t);
        if (!m) break;
        items.push(`<li>${inline(m[1])}</li>`);
        i += 1;
      }
      out.push(`<${tag}>${items.join('')}</${tag}>`);
      continue;
    }

    // Indented continuation lines belong to the current paragraph.
    para.push(trimmed);
    i += 1;
  }

  flushParagraph(para);
  return out.join('\n');
}

// ------------------------------------------------------------------ page ----

const DOCS = [
  {
    file: 'terms-of-service.md',
    out: 'terms.html',
    nav: 'Terms of Service',
    title: 'Terms of Service',
    blurb: 'The agreement between you and WASSAA: eligibility, credits and refunds, acceptable use, liability.',
  },
  {
    file: 'privacy-policy.md',
    out: 'privacy.html',
    nav: 'Privacy Policy',
    title: 'Privacy Policy',
    blurb: 'What we collect, why, who we share it with, how long we keep it, and the rights you can exercise.',
  },
  {
    file: 'synthetic-profiles-and-automated-messaging-disclosure.md',
    out: 'automated-profiles.html',
    nav: 'Automated profiles',
    title: 'Synthetic Profiles and Automated Messaging Disclosure',
    blurb: 'Which profiles are not real people, how they are marked, and what a message to one costs.',
  },
];

const CSS = `
:root {
  --canvas: #f7f5f0;
  --surface: #ffffff;
  --ink: #1a1816;
  --muted: #6b665f;
  --faint: #9c958d;
  --line: #e8e4dc;
  --brand: #b85a3c;
  --brand-wash: #f5eae5;
  --radius: 16px;
}
@media (prefers-color-scheme: dark) {
  :root {
    --canvas: #14110f;
    --surface: #1c1917;
    --ink: #f3efe9;
    --muted: #a8a099;
    --faint: #837c75;
    --line: #2e2a27;
    --brand: #d9795a;
    --brand-wash: #2a201c;
  }
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: var(--canvas);
  color: var(--ink);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 16px;
  line-height: 1.65;
  -webkit-font-smoothing: antialiased;
}
a { color: var(--brand); text-decoration-thickness: 1px; text-underline-offset: 2px; }
a:hover { text-decoration-thickness: 2px; }
header.site {
  position: sticky; top: 0; z-index: 10;
  background: color-mix(in srgb, var(--canvas) 92%, transparent);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--line);
}
.site-inner {
  max-width: 1080px; margin: 0 auto; padding: 14px 20px;
  display: flex; align-items: center; gap: 18px; flex-wrap: wrap;
}
.wordmark {
  font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase;
  font-size: 0.9rem; color: var(--ink); text-decoration: none;
}
.wordmark span { color: var(--brand); }
nav.site { display: flex; gap: 18px; margin-left: auto; flex-wrap: wrap; }
nav.site a { font-size: 0.86rem; color: var(--muted); text-decoration: none; padding: 4px 0; }
nav.site a:hover { color: var(--ink); }
nav.site a[aria-current="page"] { color: var(--ink); font-weight: 600; box-shadow: inset 0 -2px 0 var(--brand); }
main { max-width: 1080px; margin: 0 auto; padding: 32px 20px 80px; }
.doc { max-width: 760px; }
.eyebrow {
  font-size: 0.72rem; letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--faint); margin: 0 0 10px;
}
h1 {
  font-size: clamp(1.7rem, 4vw, 2.35rem); line-height: 1.15; letter-spacing: -0.02em;
  margin: 0 0 14px; font-weight: 650;
}
h2 {
  font-size: 1.22rem; line-height: 1.3; margin: 2.4em 0 0.7em;
  padding-top: 1.1em; border-top: 1px solid var(--line); font-weight: 650;
}
h3 { font-size: 1.02rem; margin: 1.8em 0 0.4em; font-weight: 650; }
h4 { font-size: 0.95rem; margin: 1.4em 0 0.3em; }
p { margin: 0 0 1em; }
hr { border: 0; border-top: 1px solid var(--line); margin: 2em 0; }
ul, ol { margin: 0 0 1em; padding-left: 1.35em; }
li { margin: 0.3em 0; }
li > strong:first-child { color: var(--ink); }
code {
  font-family: ui-monospace, SFMono-Regular, "Space Mono", Menlo, monospace;
  font-size: 0.86em; background: var(--brand-wash); color: var(--ink);
  padding: 0.12em 0.4em; border-radius: 5px;
}
blockquote {
  margin: 1.6em 0; padding: 18px 20px;
  background: var(--surface); border: 1px solid var(--line);
  border-left: 3px solid var(--brand); border-radius: 12px;
}
blockquote p { margin: 0 0 0.7em; font-size: 0.95rem; }
blockquote p:last-child { margin-bottom: 0; }
.blockquote-label {
  display: block; font-size: 0.7rem; letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--brand); font-weight: 700; margin-bottom: 8px;
}
.table-wrap { overflow-x: auto; margin: 1.4em 0; border: 1px solid var(--line); border-radius: 12px; }
table { border-collapse: collapse; width: 100%; font-size: 0.88rem; background: var(--surface); }
th, td { text-align: left; padding: 10px 14px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { background: var(--brand-wash); font-weight: 600; white-space: nowrap; }
tbody tr:last-child td { border-bottom: 0; }
.meta { color: var(--muted); font-size: 0.85rem; margin: 0 0 26px; }
.meta strong { color: var(--ink); font-weight: 600; }
.draft {
  max-width: 1080px; margin: 14px auto 0; padding: 12px 16px;
  border: 1px solid var(--brand); border-radius: 12px; background: var(--brand-wash);
  font-size: 0.85rem; color: var(--ink);
}
.draft strong { color: var(--brand); }
.draft code { background: transparent; padding: 0; }
.cards { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); margin-top: 28px; }
.card-link {
  display: block; padding: 22px; border-radius: var(--radius);
  background: var(--surface); border: 1px solid var(--line); text-decoration: none; color: inherit;
}
.card-link:hover { border-color: var(--brand); }
.card-link h2 { border: 0; padding: 0; margin: 0 0 6px; font-size: 1.02rem; }
.card-link p { margin: 0; color: var(--muted); font-size: 0.88rem; }
footer.site {
  border-top: 1px solid var(--line); margin-top: 40px;
  color: var(--faint); font-size: 0.8rem;
}
footer.site .site-inner { display: block; padding: 24px 20px; }
footer.site a { color: var(--muted); }
@media print {
  header.site, footer.site, .draft { display: none; }
  body { background: #fff; }
  a { color: inherit; text-decoration: none; }
  h2 { break-after: avoid; }
}
`;

function shell({ title, nav, body, active }) {
  const links = DOCS.map(
    (d) =>
      `<a href="./${d.out}"${d.out === active ? ' aria-current="page"' : ''}>${d.nav}</a>`
  ).join('');
  const draft = missing.length
    ? `<div class="draft"><strong>Draft.</strong> Not ready to accept members' consent. Complete ${missing
        .map((m) => `<code>${escapeHtml(m)}</code>`)
        .join(', ')} in <code>legal/site.config.json</code> and rebuild.</div>`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)} — WASSAA</title>
<meta name="description" content="${escapeHtml(nav)} for WASSAA." />
<meta name="robots" content="index, follow" />
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='78' font-size='78' font-family='serif' fill='%23b85a3c'>W</text></svg>" />
<style>${CSS}</style>
</head>
<body>
<header class="site">
  <div class="site-inner">
    <a class="wordmark" href="./index.html">WASSAA<span>.</span>legal</a>
    <nav class="site">${links}</nav>
  </div>
</header>
${draft}
<main>${body}</main>
<footer class="site">
  <div class="site-inner">
    <p>${escapeHtml(config.companyName || 'WASSAA')} · ${escapeHtml(config.website)}</p>
    <p>Questions about these documents? <a href="mailto:${config.supportEmail}">${escapeHtml(
      config.supportEmail
    )}</a></p>
  </div>
</footer>
</body>
</html>
`;
}

// ----------------------------------------------------------------- write ----

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const doc of DOCS) {
  const raw = fs.readFileSync(path.join(legalDir, doc.file), 'utf8');
  const headings = [];
  const html = renderMarkdown(fill(raw), headings);
  const body = `<article class="doc">
  <p class="eyebrow">${escapeHtml(doc.nav)}</p>
  ${html.replace(/^<h1[^>]*>.*?<\/h1>\s*/s, '')}
</article>`;
  fs.writeFileSync(path.join(outDir, doc.out), shell({ title: doc.title, nav: doc.nav, body, active: doc.out }));
}

const index = `<article class="doc">
  <h1>WASSAA — policies</h1>
  <p class="meta">Effective <strong>${escapeHtml(config.effectiveDate)}</strong> · Last updated <strong>${escapeHtml(
    config.lastUpdated
  )}</strong></p>
  <p>These are the documents that govern your use of WASSAA. By creating an account, or by continuing to use the app, you accept them.</p>
  <p>Read at least the <strong>Automated profiles</strong> disclosure before spending anything: some profiles on WASSAA are not real people, and messages to them consume credits exactly as messages to members do.</p>
  <div class="cards">
    ${DOCS.map(
      (d) =>
        `<a class="card-link" href="./${d.out}"><h2>${d.title}</h2><p>${d.blurb}</p></a>`
    ).join('')}
  </div>
</article>`;
fs.writeFileSync(
  path.join(outDir, 'index.html'),
  shell({ title: 'Policies', nav: 'Policies', body: index, active: 'index.html' })
);

// Static hosts prefer an explicit config; keeps this output framework-agnostic.
fs.writeFileSync(
  path.join(outDir, 'vercel.json'),
  JSON.stringify(
    {
      $schema: 'https://openapi.vercel.sh/vercel.json',
      cleanUrls: false,
      headers: [
        {
          source: '/(.*)',
          headers: [
            { key: 'X-Content-Type-Options', value: 'nosniff' },
            { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
            { key: 'X-Frame-Options', value: 'DENY' },
          ],
        },
      ],
    },
    null,
    2
  ) + '\n'
);

console.log(`Built ${DOCS.length + 1} pages into legal/site/`);
if (missing.length) console.warn(`Still placeholders: ${missing.join(', ')}`);
