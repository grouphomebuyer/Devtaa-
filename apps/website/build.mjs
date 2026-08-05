#!/usr/bin/env node
/**
 * Devtaa Developers — static site builder.
 *
 * Reads src/pages/*.html (body markup + a JSON front-matter block), wraps each
 * one in the shared partials, and writes plain static HTML to the site root.
 * No dependencies, no framework — the output is ordinary HTML you can upload
 * to any host.
 *
 *   node build.mjs
 */

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const srcDir = join(root, 'src');
const pagesDir = join(srcDir, 'pages');
const partialsDir = join(srcDir, 'partials');

const SITE_URL = 'https://www.devtaadevelopers.com';

/** Load every partial once. */
async function loadPartials() {
  const files = await readdir(partialsDir);
  const out = {};
  for (const f of files) {
    if (!f.endsWith('.html')) continue;
    out[basename(f, '.html')] = await readFile(join(partialsDir, f), 'utf8');
  }
  return out;
}

/**
 * Split `{ ...json... }` front matter from the body markup.
 * The file must start with a JSON object on its own lines, then `---`.
 */
function parsePage(raw) {
  const marker = raw.indexOf('\n---\n');
  if (marker === -1) throw new Error('Page is missing its `---` front-matter separator');
  const meta = JSON.parse(raw.slice(0, marker));
  const body = raw.slice(marker + 5);
  return { meta, body };
}

/** Replace {{key}} tokens, then {{> partial}} includes, until nothing is left. */
function render(template, vars, partials) {
  let out = template;
  for (let pass = 0; pass < 6; pass++) {
    const before = out;
    out = out.replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (m, name) => {
      if (!(name in partials)) throw new Error(`Unknown partial: ${name}`);
      return partials[name];
    });
    out = out.replace(/\{\{\s*([\w-]+)\s*\}\}/g, (m, key) =>
      key in vars ? String(vars[key]) : ''
    );
    if (out === before) break;
  }
  return out;
}

const SHELL = `<!DOCTYPE html>
<html lang="en">
<head>
{{> head}}
</head>
<body>
{{> header}}

<main id="main">
{{body}}
</main>

{{> footer}}
</body>
</html>
`;

async function build() {
  const partials = await loadPartials();
  const files = (await readdir(pagesDir)).filter((f) => f.endsWith('.html')).sort();
  const built = [];

  for (const file of files) {
    const raw = await readFile(join(pagesDir, file), 'utf8');
    const { meta, body } = parsePage(raw);

    const slug = meta.slug ?? (file === 'index.html' ? '' : file);
    const vars = {
      siteUrl: SITE_URL,
      slug,
      ogImage: 'art-skyline.svg',
      jsonld: '',
      formSource: meta.title,
      projectName: meta.projectName ?? '',
      configOptions: (meta.configs ?? ['1 BHK', '2 BHK', '3 BHK'])
        .map((c) => `<option>${c}</option>`)
        .join(''),
      ...meta,
      body
    };

    const html = render(SHELL, vars, partials);
    await writeFile(join(root, file), html, 'utf8');
    built.push({ file, slug, priority: meta.priority ?? '0.7' });
  }

  // sitemap.xml
  const urls = built
    .map(
      (p) =>
        `  <url>\n    <loc>${SITE_URL}/${p.slug}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`
    )
    .join('\n');
  await writeFile(
    join(root, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    'utf8'
  );

  await writeFile(
    join(root, 'robots.txt'),
    `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`,
    'utf8'
  );

  console.log(`Built ${built.length} pages:`);
  built.forEach((p) => console.log('  ' + p.file));
  console.log('  sitemap.xml\n  robots.txt');
}

build().catch((err) => {
  console.error('Build failed:', err.message);
  process.exit(1);
});
