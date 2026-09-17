# The dev backend

A fake Supabase that serves invented data, so the app can be run, clicked
through and audited on a phone without a real project and without a login.

```bash
npm run dev:backend    # terminal 1 — :3099
npm start              # terminal 2 — :3002
```

with `.env.local`:

```
REACT_APP_SUPABASE_URL=http://localhost:3099
REACT_APP_SUPABASE_ANON_KEY=dev-backend-anon-key
```

Sign in as **`dev@localhost`** with **any password**. That account is a
`super_admin`, which is deliberate: a lesser role is redirected away from the
super-admin-only pages, and an audit then measures the redirect and calls the
route clean.

## Why

Two pages of this app can be seen without a backend. Everything else — every
staff route, and every portal page below a section — reads Supabase before it
renders, so with no credentials it draws an error card.

That is not a hypothetical cost. `npm run audit:mobile` says in its own output
that without `AUDIT_EMAIL` it skipped 20 of its 35 rows, and CLAUDE.md records
that all four bugs found by the first full run were on management-only pages,
two of them super-admin-only. Those are the pages where a layout bug survives
longest, because the handful of people who can see it are the same people who
would have to report it. With this running, the whole sweep is available to
anyone:

```bash
AUDIT_EMAIL=dev@localhost AUDIT_PASSWORD=anything npm run audit:mobile
```

The considered alternative was a test login on the real roster. That is 349 real
households and 395 real children, in whose class lists, attendance screens and
staff counts an invented dancer would sit unmarked. This does the same job with
none of that, and it needs no network at all.

## What it proves, and what it cannot

**Proves:** layout at every width, navigation, empty states, loading states, and
the hand-written snake_case→camelCase mappers in `PortalContext` and friends —
the half of these pages most likely to break, and the half a hand-written mock
usually gets wrong, so the seed's column names were read off the real schema.

**Cannot prove:** anything about **RLS**. Every row here is served to whoever
asks. The policies that decide who may actually see what live in the migrations
and can only be tested against a real database — so "an Academy family is
refused All-Star content" is not a question this can answer. Use the SQL seed
and a real project for that.

It also cannot check `env(safe-area-inset-*)`, but nothing in Chromium can; see
the audit's own notes.

## Files

| | |
|---|---|
| `index.js` | the server: `/rest/v1`, `/auth/v1`, `/storage/v1`, `/functions/v1` |
| `pgrest.js` | the slice of PostgREST the app speaks — filters, order, limit, `.single()`, one-level embeds |
| `seed.js` | the data. All invented; none of it copied from production |

## Adding to it

The server **tells you what is missing**. A table with no seed logs

```
! no seed for work_days -> [] (add it to scripts/dev-backend/seed.js)
```

and returns `[]` rather than inventing rows, so the page draws its empty state.
That warning is the useful part: it names the screen you have not actually
seen. Unmapped RPCs and edge functions announce themselves the same way.

Writes are accepted and held in memory so a form's save does not appear to
fail. They are gone on restart. This is a fixture, not a database.

## Relationship to the in-repo fixture

`src/lib/attendanceFixture.ts` is a different thing and still does its job: it
stands in for the **family dashboard cards** with no backend at all, driven by
the scenario picker on `/portal` in a development build, and it covers the
states that are hard to produce on demand — no children linked, no classes, a
fresh studio. It is *in* the bundle, which is why it carries the careful
`NODE_ENV !== 'production'` guard in `usePortalCards`.

This backend covers what that one does not: the portal's section pages and the
entire staff side. It is a script, so there is nothing in the bundle to guard.

The one app-side concession is in `src/lib/supabase.ts`, where
`isSupabaseConfigured()` accepts a loopback URL **in non-production builds
only** — it otherwise requires `supabase.co` and would reject this.
