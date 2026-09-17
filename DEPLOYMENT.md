# Deployment notes

Notes that used to live inside `vercel.json`. They cannot go back there.

## Never put comments in `vercel.json`

JSON has no comment syntax, and the usual workaround is a `"//"` key. **Vercel
rejects it.** The file is validated against a strict schema that forbids
unknown properties, and a failure there happens before anything is compiled:

```
Build Failed
The `vercel.json` schema validation failed with the following message:
should NOT have additional property `//`
```

This cost several days of failed production builds. Every push was deploying
correctly; every build was thrown out on that one key. Symptoms were
misleading - the live site kept working (an older, valid deployment was still
being served), so it looked like the pushes were not arriving at all.

Anything explanatory goes in this file instead.

## Migrations are deliberately out of the build command

The build is plain `next build`, not `prisma migrate deploy && next build`.

The migrate step needs `DIRECT_URL` at **build** time. Use the Supabase
**session pooler**:

```
postgresql://postgres.<ref>:<password>@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
```

Do **not** use the `db.<ref>.supabase.co` direct connection. That host has no
IPv4 address and Vercel is IPv4-only, so it can never connect - and the
timeout it produces looks like a wrong password, which sends you hunting in
the wrong place.

Until a build is confirmed to read `DIRECT_URL`, run migrations by hand after
any schema change:

```bash
npm run db:deploy
```

Then restore the build command so schema changes ship with the code that needs
them.

## Environment variables

`DATABASE_URL` must be the Supabase **transaction pooler** (port 6543) with
`pgbouncer=true`. Serverless functions open a connection per instance and
would exhaust a direct pool.

Two separate moments read these variables, and they can disagree:

- **Build** - `next build`, and `prisma migrate deploy` if it is restored
- **Runtime** - a visitor loading a page

A variable marked **Sensitive** in Vercel is withheld from builds and supplied
only at runtime. If the site serves data correctly but builds fail on a
missing variable, check that first.

The application no longer fails its build over a missing `DATABASE_URL` - see
`src/lib/prisma.ts`. Queries still fail at request time, which is correct: a
database that is not configured should not appear to work.

## Checking a deployment

`/api/health` reports which settings a deployment actually has. It reports
presence only - never a value, never a key, never a connection string - so it
is safe to leave public:

```bash
curl -s https://ziventag.vercel.app/api/health
```

It is also the quickest way to tell whether new code reached production: the
route did not exist before September 2026, so a 404 means production is still
serving an older build.
