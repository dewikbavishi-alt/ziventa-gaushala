/**
 * Assembles the static pages from one shell and one file per page.
 *
 *   npm run build:site
 *
 * Why a build step rather than seven hand-written HTML files: the header,
 * footer, cart, checkout and chat widget are ~86KB that every page needs
 * identically. Kept by hand they drift - one page keeps last month's phone
 * number, another misses a nav link - and nothing catches it. Here there is
 * one copy, and every page is regenerated from it.
 *
 * Input:
 *   site/shell.html      the frame, with {{TITLE}} {{DESCRIPTION}} {{PATH}} {{CONTENT}}
 *   site/pages/NAME.html an HTML comment of front-matter, then the content
 *
 * Output:
 *   public/NAME.html     served at /NAME by the rewrite in next.config.ts
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const ROOT = process.cwd();
const SHELL = join(ROOT, 'site', 'shell.html');
const PAGES_DIR = join(ROOT, 'site', 'pages');
const OUT_DIR = join(ROOT, 'public');

/**
 * Which anchors have graduated to a page of their own.
 *
 * The nav is written once in the shell with hash links. Every link is
 * rewritten on the way out: an anchor listed here becomes a real URL, and
 * everything still living on the landing page becomes "/#anchor" so it works
 * from any page rather than only from the home page. Move an entry here when
 * its section moves, and every page's nav updates together.
 */
const MIGRATED = {
  '#story': '/our-story',
  '#membership': '/gir-gold-club',
  '#gallery': '/gallery',
  '#process': '/bilona-process',
};

function frontMatter(raw) {
  const m = raw.match(/^<!--([\s\S]*?)-->\s*/);
  if (!m) throw new Error('missing front-matter comment');
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^\s*([a-z]+):\s*(.+?)\s*$/);
    if (kv) meta[kv[1]] = kv[2];
  }
  for (const key of ['title', 'description', 'path']) {
    if (!meta[key]) throw new Error(`front-matter is missing "${key}"`);
  }
  return { meta, content: raw.slice(m[0].length) };
}

const escapeAttr = (s) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Point every in-page link at something that works from this URL.
 *
 * On the landing page "#shop" is correct. On /our-story it means "an element
 * called shop on THIS page", which does not exist, so the link silently does
 * nothing. Root-relative "/#shop" works from both.
 */
function rewriteLinks(html, currentPath) {
  return html.replace(/href="#([a-z-]+)"/g, (whole, anchor) => {
    const hash = `#${anchor}`;
    if (MIGRATED[hash]) {
      // A link to the page you are already on would be a no-op; leave it as a
      // real anchor so it still scrolls to the top of the content.
      return MIGRATED[hash] === currentPath ? `href="${hash}"` : `href="${MIGRATED[hash]}"`;
    }
    if (anchor === 'main') return whole; // the skip link, always same-page
    if (anchor === 'top') return currentPath === '/' ? whole : 'href="/"';
    return `href="/${hash}"`;
  });
}

/** Light up the nav item for the page being rendered. */
function markActive(html, navAnchor, currentPath) {
  if (!navAnchor) return html;
  const target = MIGRATED[navAnchor] === currentPath ? navAnchor : MIGRATED[navAnchor] ?? `/${navAnchor}`;
  return html.replace(
    new RegExp(`(<a href="${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" class="nav-link)"`),
    '$1 active"',
  );
}

function build() {
  if (!existsSync(SHELL)) throw new Error(`no shell at ${SHELL}`);
  const shell = readFileSync(SHELL, 'utf8');

  const files = readdirSync(PAGES_DIR).filter((f) => f.endsWith('.html'));
  if (files.length === 0) {
    console.log('no pages in site/pages - nothing to build');
    return;
  }

  for (const file of files) {
    const { meta, content } = frontMatter(readFileSync(join(PAGES_DIR, file), 'utf8'));

    let html = shell
      .replaceAll('{{TITLE}}', escapeAttr(meta.title))
      .replaceAll('{{DESCRIPTION}}', escapeAttr(meta.description))
      .replaceAll('{{PATH}}', meta.path)
      .replace('{{CONTENT}}', content.trimEnd());

    html = rewriteLinks(html, meta.path);
    html = markActive(html, meta.nav, meta.path);

    const out = join(OUT_DIR, basename(file));
    writeFileSync(out, html, 'utf8');
    console.log(`  ${meta.path.padEnd(16)} -> public/${basename(file)}  (${html.length} bytes)`);
  }
}

build();
