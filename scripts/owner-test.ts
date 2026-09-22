/**
 * Checks the one-owner rule.
 *
 *   npm run test:owner
 *
 * The admin dashboard belongs to exactly one person. These are the ways that
 * could quietly stop being true.
 */
import fs from 'node:fs';
import path from 'node:path';

let failures = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = got === want;
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `  got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
}

async function main() {
  const { ownerEmail } = await import('../src/lib/admin');
  const quiet = console.error;

  const withEnv = (v: string | undefined) => {
    if (v === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = v;
    console.error = () => {}; // the two-owner case logs; expected here
    try {
      return ownerEmail();
    } finally {
      console.error = quiet;
    }
  };

  console.log('ADMIN_EMAILS decides the one owner');
  eq('one address -> that owner', withEnv('owner@example.com'), 'owner@example.com');
  eq('case and spaces ignored', withEnv('  Owner@Example.COM  '), 'owner@example.com');
  eq('trailing comma is still one owner', withEnv('owner@example.com,'), 'owner@example.com');

  console.log('\nFails closed');
  eq('unset -> nobody', withEnv(undefined), null);
  eq('empty -> nobody', withEnv(''), null);
  eq('only commas -> nobody', withEnv(' , , '), null);
  eq('TWO addresses -> nobody', withEnv('a@example.com,b@example.com'), null);
  eq('three addresses -> nobody', withEnv('a@x.com,b@x.com,c@x.com'), null);

  console.log('\nNo other way in exists');
  const root = path.resolve(__dirname, '..');
  const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
  const schema = read('prisma/schema.prisma');
  eq('no Role enum in the schema', /^\s*enum\s+Role\b/m.test(schema), false);
  eq('no role column on Customer', /^\s+role\s+/m.test(schema.split('model Customer')[1].split('}')[0]), false);
  const admin = read('src/lib/admin.ts');
  eq('admin check never reads the database', admin.includes('prisma'), false);
  eq('admin check requires a verified email', admin.includes('email_confirmed_at'), true);

  console.log('\nEvery Server Action checks for itself');
  const actions = [
    'src/app/admin/orders/actions.ts',
    'src/app/admin/inventory/actions.ts',
    'src/app/admin/membership/actions.ts',
  ];
  for (const file of actions) {
    const src = read(file);
    const fns = [...src.matchAll(/export async function (\w+)\s*\([^)]*\)[^{]*\{([\s\S]*?)\n\}/g)];
    for (const [, name, body] of fns) {
      // requireAdmin must be the first thing the function does.
      const first = body.trim().split('\n').slice(0, 3).join(' ');
      eq(`${path.basename(path.dirname(file))}/${name} starts with requireAdmin()`, first.includes('requireAdmin()'), true);
    }
  }

  console.log('\nEvery admin page checks for itself');
  const pagesDir = path.join(root, 'src/app/admin');
  const pages: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === 'page.tsx') pages.push(p);
    }
  };
  walk(pagesDir);
  for (const p of pages) {
    const src = fs.readFileSync(p, 'utf8');
    eq(`${path.relative(pagesDir, p)} calls getAdminUser()`, src.includes('getAdminUser()'), true);
  }

  console.log('');
  if (failures) {
    console.log(`${failures} FAILED`);
    process.exit(1);
  }
  console.log('The dashboard has exactly one owner.');
}

main();
