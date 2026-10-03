# Deployment notes

Notes that used to live inside `vercel.json`. They cannot go back there.

## `vercel.json` must keep `framework: "nextjs"`

It says almost nothing, and the one line it does say is load bearing.

This project started life as a plain static site, so the Framework Preset in
the Vercel dashboard is set to something other than Next.js. `framework` here
overrides that. Delete the line and Vercel stops treating the repo as a Next
app: the build still succeeds and still reports Ready, but the deployment
serves nothing at all. Every route - the landing page, the API, everything -
returns 404.

That happened. The file was deleted while hunting a separate failure, builds
went green, and nobody noticed for two days because the domain was still
pinned to an older deployment. The moment that deployment was replaced, the
whole site went dark. A green Ready badge is not evidence that a deployment
serves anything.

Either keep this file, or set the Framework Preset to Next.js under Project
Settings > Build and Development Settings. Doing both is safer than either.

What is deliberately NOT here:

- `buildCommand: "next build"` - already the default for a Next project
- `regions: ["bom1"]` - Mumbai, worth roughly 200ms per request for an Indian
  customer. Set it in the dashboard instead, under Project Settings >
  Functions; see "Function region" below. Keeping it in one place only means
  there is nothing to disagree with the dashboard.

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

**It happened a second time.** Commit `8d36368` reintroduced the same mistake
under a different name, `"//regions"`, and every build from there to `60c87ee`
failed on it - including the Reply-To fix, the invalid From address fix and
the Razorpay groundwork, all of which sat unshipped while the site served an
older deployment. The rule is the key itself, not the word after the slashes:
**`vercel.json` may contain only keys Vercel's schema defines.**

Two things make this hard to notice, so check for both:

- A failed build leaves the previous deployment serving, so the live site
  looks healthy and nothing about it hints that a push was thrown away.
- Vercel refuses to redeploy a failed deployment - "This deployment can not be
  redeployed. Please try again from a fresh commit." Hitting that message is
  itself a sign the last build errored, not a quirk of the Redeploy button.

After any push that matters, confirm the deployment went green rather than
assuming it did. See "Checking a deployment" at the end of this file.

## Function region

Functions default to Washington DC (`iad1`) while the database is in Mumbai
(`ap-south-1`), so every query crosses the planet twice. `X-Vercel-Id` reads
`<edge>::<function region>::<id>`, so `bom1::iad1` means a request arrived in
Mumbai and was executed in Washington.

Set it in the dashboard, not in code:

1. Open the **project** settings, not the team settings
2. **Functions** in the left sidebar
3. Expand the **Function Regions** accordion, then the **Asia Pacific** group
   inside it - Mumbai is invisible until both are open
4. Tick Mumbai `bom1` and untick Washington. Hobby allows exactly one region,
   and asking for more fails the deployment before the build step
5. Push a commit. The setting only applies to deployments made after it is
   saved, and Redeploy on an existing build is refused

Next's `preferredRegion` export cannot do this - it is deprecated in this
version of Next and accepts only `auto`, `global` and `home` on Vercel.

The Function Regions panel under CDN is a report of where functions ran over
the last 12 hours, not a setting. It keeps saying Washington for hours after a
successful change.

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

Sign-in emails go through Nodemailer too, via `/api/auth/send-link`. Supabase
still mints the link - `generateLink()` produces a real single-use credential
and, unlike `signInWithOtp`, sends nothing - and we post it ourselves. So every
email the site sends leaves through one mail server, with one set of limits and
one place to look when something does not arrive.

Nothing needs configuring in Supabase's own SMTP settings for this. Supabase's
built-in sender allows only a handful of messages an hour, which is what
repeatedly locked this site out during testing.

**`generateLink` creates the account if it does not exist.** This is not
documented prominently and it is easy to miss: during testing, two addresses
that had never signed up became real accounts the moment a link was generated
for them. `/api/auth/send-link` therefore checks `accountExists()` first and
refuses to mint a link for an unknown address on the sign-in path. Without
that check, one mistyped address gives someone a new empty account and the
impression that their orders have vanished.

That endpoint will mail any address it is handed, so it is rate limited to 5
messages per address per 15 minutes, counted in the `email_throttle` table.
The count is written *before* the send, so an attempt that hangs still counts
- counting only successes would let a stream of timeouts through. It answers
identically whether the address is known, unknown or throttled, because
whether someone has an account here is private.

## Checking a deployment

`/api/health` answers everyone with just `{"status":"ok"}` (or
`"degraded"` and a 503 when the database is unreachable) - enough for an
uptime monitor, and enough to tell a deployment is serving:

```bash
curl -s https://girbyziventa.com/api/health
```

The details - database, email, mail host, From address, admin count,
Supabase, site URL, payments and the payments webhook secret - are shown
only to the owner. Open https://girbyziventa.com/api/health in a browser
that is signed in to the admin dashboard. They used to be public; none of it
was a secret, but naming the mail server and counting admin accounts is the
kind of reconnaissance an attacker starts with, so it is no longer handed
out. It still never reports a key, a password or a connection string.

Use the real domain. `ziventag.vercel.app` still resolves, but every page on
it now 308s to girbyziventa.com, so checking there tells you about the
redirect rather than about the deployment.

It is also the quickest way to tell whether new code reached production: the
route did not exist before September 2026, so a 404 means production is still
serving an older build.
