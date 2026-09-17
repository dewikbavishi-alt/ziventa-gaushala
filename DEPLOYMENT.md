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

## Email

Nodemailer over SMTP. Nodemailer is a client, not a mail service - it needs a
server to hand messages to, and which one is purely configuration:
`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, plus `MAIL_FROM` and
`MAIL_TO`. No provider is named anywhere in the code, so switching is an
environment change and nothing else.

Test settings before trusting them to customers:

```bash
npm run email:test -- you@example.com
```

It checks two things separately, because they fail for different reasons:
whether the server can be reached and logged into, and whether it will
actually accept a message from `MAIL_FROM`. A server will happily let you sign
in and then refuse to send as an address that is not yours.

`MAIL_FROM` normally has to match `SMTP_USER` or be an alias on the same
domain. This is the second surprise after a wrong password.

Sending failures never propagate. `sendEmail` returns `{delivered, reason}` and
never throws, because by the time it runs the order or enquiry is already in
the database - losing a real order because a mail server hiccuped would be the
worse failure. Check `delivered` if the caller needs to know.

The transporter is cached per process but deliberately **not** pooled. A pool
holds connections open between sends, which suits a long-lived server and not a
serverless function that can be frozen at any moment - the idle sockets die
with it and the next send times out. Three timeouts are set for the same
reason: a server that accepts a connection and then goes silent would
otherwise hold the function open until the platform kills it.

Sign-in emails are **not** sent by this code. Those come from Supabase, which
has its own SMTP settings under Project Settings > Authentication. Supabase's
built-in sender allows only a handful of messages per hour, so it needs the
same SMTP details configured there.

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
