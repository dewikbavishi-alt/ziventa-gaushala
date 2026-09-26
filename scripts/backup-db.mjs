#!/usr/bin/env node
/**
 * Take a restorable backup of the live database.
 *
 *   npm run backup
 *
 * Supabase's free tier keeps no automated backups at all - daily ones begin on
 * Pro - so until that changes this script is the only copy of the orders,
 * customers, memberships and sign-ins that exists anywhere but the one
 * database. Run it before every migration, and on a schedule once real orders
 * are arriving.
 *
 * Why pg_dump rather than something written here: a dump has to restore, not
 * just read. pg_dump carries constraints, sequences, generated columns, RLS
 * policies and the auth schema; a hand-rolled export of table rows looks like
 * a backup right up to the day you need it and find the accounts missing.
 *
 * DIRECT_URL, never DATABASE_URL. DATABASE_URL goes through pgbouncer in
 * transaction mode, which cannot hold the session-level state pg_dump needs -
 * it fails, and can fail in ways that produce a partial file rather than an
 * error.
 */
import { spawn } from 'node:child_process';
import { mkdir, readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * public  - everything this application owns.
 * auth    - Supabase's user accounts and identities. Without it a restore
 *           brings the orders back but nobody can sign in to see them.
 *
 * Deliberately not storage/realtime/vault/extensions: those are managed by
 * the platform, are not restorable into a fresh project by hand, and only
 * produce permission errors that hide the real ones.
 */
const SCHEMAS = ['public', 'auth'];

const OUT_DIR = path.resolve('backups');
const KEEP_DAYS = 14;
const KEEP_AT_LEAST = 7;
const NAME = /^ziventa-\d{4}-\d{2}-\d{2}-\d{4}\.dump$/;

const die = (msg) => {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
};

/** Never let the URL reach a log, a console or an error message. */
function describe(url) {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || 5432}${u.pathname}`;
  } catch {
    return '(unparseable DIRECT_URL)';
  }
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { ...opts, shell: false });
    let stderr = '';
    child.stderr?.on('data', (d) => (stderr += d.toString()));
    child.on('error', (err) => resolve({ code: -1, stderr: err.message }));
    child.on('close', (code) => resolve({ code, stderr }));
  });
}

async function pgDumpMajor() {
  const probe = await run('pg_dump', ['--version']);
  if (probe.code === -1) return null;
  const out = await new Promise((resolve) => {
    let buf = '';
    const c = spawn('pg_dump', ['--version']);
    c.stdout.on('data', (d) => (buf += d.toString()));
    c.on('close', () => resolve(buf));
    c.on('error', () => resolve(''));
  });
  const m = /\b(\d+)\./.exec(out);
  return m ? Number(m[1]) : null;
}

async function main() {
  const url = process.env.DIRECT_URL?.trim();
  if (!url) {
    die(
      'DIRECT_URL is not set.\n' +
        '  Run it as: npm run backup\n' +
        '  (that loads .env.local; in CI, set DIRECT_URL in the environment)',
    );
  }

  const major = await pgDumpMajor();
  if (major === null) {
    die(
      'pg_dump is not installed, or not on PATH.\n\n' +
        '  It ships with the PostgreSQL client tools. The server is PostgreSQL 17,\n' +
        '  and pg_dump must be version 17 or newer - an older one refuses to dump a\n' +
        '  newer server rather than producing a broken file.\n\n' +
        '    Windows  winget install PostgreSQL.PostgreSQL.17\n' +
        '             (then reopen the terminal so PATH picks it up)\n' +
        '    macOS    brew install postgresql@17\n' +
        '    Linux    sudo apt install postgresql-client-17\n',
    );
  }
  if (major < 17) {
    die(
      `pg_dump is version ${major}, but the server is PostgreSQL 17.\n` +
        '  pg_dump refuses to dump a server newer than itself. Install the 17 client\n' +
        '  tools and make sure they come first on PATH.',
    );
  }

  await mkdir(OUT_DIR, { recursive: true });

  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  const file = path.join(OUT_DIR, `ziventa-${stamp}.dump`);

  console.log(`  server   ${describe(url)}`);
  console.log(`  pg_dump  ${major}`);
  console.log(`  schemas  ${SCHEMAS.join(', ')}`);
  console.log(`  writing  ${path.relative(process.cwd(), file)}`);

  const args = [
    // Custom format: compressed, and restorable selectively with pg_restore.
    '--format=custom',
    '--file', file,
    // A restore into a fresh Supabase project has different role names, and
    // grants referencing roles that do not exist there abort the restore.
    '--no-owner',
    '--no-privileges',
    // Supabase manages extensions itself; dumping them collides on restore.
    '--extension', 'none',
    '--quote-all-identifiers',
    '--verbose',
    ...SCHEMAS.flatMap((s) => ['--schema', s]),
    url,
  ];

  const started = Date.now();
  const { code, stderr } = await run('pg_dump', args, { stdio: ['ignore', 'inherit', 'pipe'] });

  if (code !== 0) {
    // stderr can echo the connection string back; scrub before printing.
    die(`pg_dump failed (exit ${code}):\n${stderr.split(url).join('[DIRECT_URL]').trim()}`);
  }

  const { size } = await stat(file);
  if (size < 4096) {
    die(
      `the dump is only ${size} bytes, which is too small to be real.\n` +
        '  Left in place so you can look at it. Nothing was pruned.',
    );
  }

  console.log(
    `\n  done: ${(size / 1024 / 1024).toFixed(2)} MB in ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );

  await prune();

  console.log('\n  to restore into a fresh database:');
  console.log(`    pg_restore --clean --if-exists --no-owner --no-privileges -d "<DIRECT_URL>" ${path.relative(process.cwd(), file)}`);
  console.log('\n  a dump you have never restored is a guess. Try it once against a');
  console.log('  scratch Supabase project, before you need it to work.');
}

/**
 * Old dumps go, but never the last few.
 *
 * A date rule on its own deletes everything when the script has not run for a
 * fortnight - exactly the situation where the remaining copies matter most.
 */
export async function prune(dir = OUT_DIR, now = Date.now()) {
  // Only files this script made. A stray .sql someone dropped in here by hand
  // is not ours to delete.
  const names = (await readdir(dir)).filter((f) => NAME.test(f)).sort();
  const cutoff = now - KEEP_DAYS * 86_400_000;

  const removable = names.slice(0, Math.max(0, names.length - KEEP_AT_LEAST));
  const removed = [];
  for (const name of removable) {
    const full = path.join(dir, name);
    const { mtimeMs } = await stat(full);
    if (mtimeMs < cutoff) {
      await unlink(full);
      removed.push(name);
    }
  }
  const kept = names.length - removed.length;
  console.log(
    `  kept ${kept} backup${kept === 1 ? '' : 's'}` +
      (removed.length ? `, removed ${removed.length} older than ${KEEP_DAYS} days` : ''),
  );
  return { kept, removed };
}

export const _policy = { KEEP_DAYS, KEEP_AT_LEAST, NAME };

// Only when run directly, so the pruning above can be imported and tested
// without the import itself trying to back up the production database.
// pathToFileURL, not string concatenation: a Windows path is C:\... and hand
// -built file:// URLs never match there.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => die(err?.message ?? String(err)));
}
