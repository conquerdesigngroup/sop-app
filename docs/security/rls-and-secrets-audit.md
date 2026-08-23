# Security audit — RLS, grants and secrets

**Scope** The migration stack (`supabase-schema.sql` → `v9`) composed in apply order, the
client's use of the anon key, and secrets reachable from the browser bundle.
**Method** Static. Every `CREATE POLICY` / `DROP POLICY` in the stack was replayed in order,
including the three `DO` blocks that drop policies dynamically via `pg_policies`, to derive
the policy set that is actually live. No queries were run against production.
**Date** 2026-08-22 · **Commit** `ebc6fcf` · **Auditor** Claude (cloud session)

> This is a paper audit. Four of the seven findings can be confirmed or dismissed in about
> ten minutes against the live database (`pg_policies`, `information_schema.role_table_grants`,
> and the Vercel env var list). Those checks are listed under each finding.

---

## Summary

| # | Finding | Severity | Confidence |
|---|---------|----------|------------|
| 1 | Google OAuth **client secret** is compiled into the public JS bundle | **High** | Certain (if the env var is set) |
| 2 | Portal document **files** are readable regardless of `is_published` | **Medium** | Certain |
| 3 | `anon` keeps table-level grants on 9 staff tables; RLS is the only layer | **Medium-low** | High |
| 4 | `verify_portal_code` has no rate limiting | **Low** | Certain |
| 5 | "Short-lived" signed URLs actually live one hour | **Low** | Certain |
| 6 | `activity_logs` SELECT still uses the v2 inline subquery, not `is_admin()` | Info | Certain |
| 7 | Configuration state is `console.log`ged in production | Info | Certain |

**The big one is #1, and it is not a database problem.** The RLS model itself is in good
shape — see *What holds up* at the end, which is most of this document.

---

## 1. The Google OAuth client secret ships to every visitor — **High**

`src/services/googleCalendar.ts:96` and `:165` exchange the authorization code by POSTing
directly to Google from the browser:

```ts
client_secret: process.env.REACT_APP_GOOGLE_CLIENT_SECRET || '',
```

Create React App **inlines every `REACT_APP_*` variable into the bundle at build time**.
It is not read at runtime from a server — it is a literal string in
`build/static/js/main.*.js`, served to anyone who loads the app, signed in or not. The file
carries a comment conceding the point: *"In a production app, this should be done
server-side."*

**Impact** depends on one thing you can check in a minute:

- **If `REACT_APP_GOOGLE_CLIENT_SECRET` is set in Vercel** — the secret for that OAuth client
  is public. Anyone can extract it, and combined with the client ID (also public, and
  necessarily so) impersonate this application in OAuth flows: build a convincing consent
  screen carrying your app's name, and mint tokens against your quota. It does not by itself
  expose any user's calendar — an authorization code is still needed per user — but the
  client identity is no longer yours alone.
- **If it is not set** — the string is empty, Google rejects the exchange, and the Calendar
  connect flow has simply never worked in production. No leak; a broken feature instead.

**Check first** Vercel → project → Settings → Environment Variables. Search for
`REACT_APP_GOOGLE_CLIENT_SECRET`. Or: `curl -s <prod-url>/static/js/main.*.js | grep -o 'GOCSPX-[A-Za-z0-9_-]*'`
— a Google client secret starts with `GOCSPX-`.

**Fix** — the correct one is PKCE, which exists precisely so browser apps need no secret:

1. Rotate the secret in Google Cloud Console immediately if it is set. Assume it is burned.
2. Switch the client to **PKCE** (`code_challenge` / `code_verifier`). A "Web application"
   OAuth client can use PKCE without a secret; the verifier is generated per-flow in the
   browser and never stored.
3. Delete `REACT_APP_GOOGLE_CLIENT_SECRET` from Vercel and from the code.

If PKCE is more than you want to take on, the alternative is a Supabase Edge Function that
holds the secret and performs the exchange — more moving parts, same outcome. PKCE is less
work and is what Google recommends for this shape of app.

---

## 2. Document files ignore `is_published` — **Medium**

The metadata row and the file itself are protected by two different rules, and only one of
them checks whether the document is published.

`portal_documents` (v9:523):
```sql
CREATE POLICY portal_documents_read ON public.portal_documents
  FOR SELECT TO anon USING (is_published);
```

`storage.objects` (v9:582):
```sql
CREATE POLICY portal_docs_read ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'portal-documents');     -- no is_published, no class, no program
```

The bucket is private (`public = false`), so this is not an open directory. But `anon` holds
blanket SELECT on every object in it, which is what lets an unauthenticated visitor call
`createSignedUrl` — and that permission is not conditioned on anything. So `anon` can mint a
working URL for **any** object in the bucket: a draft not yet published, a document belonging
to a program whose access code they never entered, a file whose `portal_documents` row was
deleted while the object remained.

**What stops it in practice** is that storage paths are not enumerable through the API — you
would have to know or guess the path, and paths only reach the client through the
`is_published`-filtered metadata query. So this is *unguessable path as access control*, not
a policy. It also means the `is_published` toggle in the admin UI does not do what its name
implies: unpublishing hides the document from the list while leaving the file reachable to
anyone who saw it earlier.

**Impact is bounded by the design note in the v9 header** — nothing private is supposed to
live in portal content. It matters if a staff member ever stages a document before it should
be visible, or assumes unpublishing retracts it.

**Check** In Supabase Studio: upload a file, leave its row `is_published = false`, then from a
signed-out browser call `supabase.storage.from('portal-documents').createSignedUrl(<path>, 60)`.
If a URL comes back, this is confirmed.

**Fix** — tie the object policy to the metadata row:

```sql
DROP POLICY IF EXISTS portal_docs_read ON storage.objects;

CREATE POLICY portal_docs_read ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (
    bucket_id = 'portal-documents'
    AND EXISTS (
      SELECT 1 FROM public.portal_documents d
      WHERE d.storage_path = storage.objects.name
        AND (d.is_published OR public.can_edit_portal_class(d.class_id))
    )
  );
```

This costs one indexed lookup per signed-URL request. Add
`CREATE INDEX IF NOT EXISTS idx_portal_documents_storage_path ON public.portal_documents(storage_path);`
if there isn't one. Verify `storage_path` is stored exactly as `storage.objects.name`
(no bucket prefix) before applying — if it differs, the policy silently denies everything and
documents stop loading.

---

## 3. `anon` keeps table-level grants on nine staff tables — **Medium-low**

The repo states its own rule, in the v7 migration header:

> *"Supabase grants SELECT/INSERT/UPDATE/DELETE to `anon` automatically on every new table in
> `public`. […] two independent things have to be wrong before anon can write, instead of one."*

That rule is applied to four tables and not to the rest. Revoked from `anon`:
`work_categories`, `employee_pay_rates`, `work_hours_pay` (v7), `portal_access_codes` (v9).

**Not revoked**, and with no `TO authenticated` clause on their policies either:

`job_tasks` · `jobs` · `task_templates` · `work_hours` · `work_days` ·
`work_schedule_templates` · `activity_logs`

`profiles` and `sops` are a step safer — v8 gave their policies `TO authenticated`, so the
role clause excludes `anon` before any predicate runs — but the table grant itself is still
there.

**Is anything exposed today? No.** Every one of those policies resolves false for `anon`:
`auth.uid() IS NOT NULL` is false with no JWT, and `is_admin()` was revoked from `anon` in v6.
This is a defence-in-depth finding, not a live hole. It matters because it makes one editing
mistake sufficient: a future policy written without a role clause, or a predicate that is
true when `auth.uid()` is NULL, becomes an anon-readable table immediately. v8 exists because
exactly that happened to `profiles` and `sops`.

**Check** 
```sql
SELECT table_name, privilege_type FROM information_schema.role_table_grants
WHERE grantee = 'anon' AND table_schema = 'public' ORDER BY table_name;
```

**Fix** — one statement, no behaviour change for signed-in users:

```sql
REVOKE ALL ON public.job_tasks, public.jobs, public.task_templates,
              public.work_hours, public.work_days, public.work_schedule_templates,
              public.activity_logs, public.profiles, public.sops
  FROM anon;
```

Do **not** include the `portal_*` tables — those are anon-readable by design.
Worth pairing with `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;`
so the next table created starts closed rather than open.

---

## 4. `verify_portal_code` has no rate limiting — **Low**

`v9:314`, granted to `anon` by design. bcrypt at cost 8 is roughly 10ms per attempt, which the
migration notes makes brute force "unattractive". It does not make it impractical: ~100
attempts/second on a single connection, more in parallel, with no lockout, no attempt counter
and no logging. A 4–6 character code falls in minutes to hours.

The hash never leaves the database and a wrong guess reveals nothing — that part is sound.
The gap is that nothing notices ten thousand wrong guesses.

**Fix, cheapest first**
1. Make the codes long enough that the rate doesn't matter — three random words, or 10+ mixed
   characters. Costs nothing and is the biggest single improvement.
2. Log failures: an `INSERT` into a small `portal_code_attempts` table inside the function, so
   there is something to look at.
3. Rate-limit properly (attempts per program per hour) if the portal ever holds anything
   worth guessing at.

Given the design note that nothing private belongs in portal content, **(1) alone is a
reasonable stopping point.**

---

## 5. "Short-lived" signed URLs last an hour — **Low**

`src/contexts/PortalContext.tsx:335` — `createSignedUrl(storagePath, 60 * 60)`. The doc
comment above it reads *"short enough that a copied link does not become a permanent handle on
the file."* An hour is not a permanent handle, but it is long enough to forward, paste into a
group chat, or index if it lands somewhere crawlable.

**Fix** `60 * 5` is ample for opening or downloading a handout, and makes a leaked link a
five-minute problem. One-character change; combine it with finding 2.

*(Correction: an earlier architecture diagram I produced for this repo described these as
60-second URLs. That was wrong — the code says 3600 seconds. The diagram has been corrected.)*

---

## 6. `activity_logs` SELECT predates `is_admin()` — Info

The live read policy is still v2's:

```sql
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
```

Correct, and admin-only as intended. But it is the only policy in the stack that inlines the
admin check instead of calling `public.is_admin()`. `is_admin()` is `SECURITY DEFINER` with a
pinned `search_path`; this subquery reads `profiles` as the calling user and therefore through
`profiles`' own RLS — the shape of coupling that made v3 necessary. It works today because
`profiles_select_authenticated` lets any signed-in user read the table. Tighten that policy
some day and this one changes meaning silently.

**Fix** `USING (public.is_admin())`. Behaviourally identical now, and it stops being a
dependency between two policies that nobody will remember.

---

## 7. Production console logging — Info

`src/lib/supabase.ts:13-16` logs the build timestamp, whether a Supabase URL is configured,
and whether the key is longer than 20 characters, on every load. Across `src/` there are 29
`console.log` calls. None print a key or a token — this is noise and a small amount of
fingerprinting, not a leak. Worth stripping from production builds when convenient.

---

## What holds up

Recording this because the stack is better than its history suggests, and the parts that are
right should not be re-litigated later:

- **All 19 tables have RLS enabled.** No exceptions.
- **The leftover-permissive-policy trap is genuinely closed.** Postgres ORs permissive
  policies, so a forgotten broad policy silently defeats every narrow one added after it. v6,
  v7 and v9 each drop *all* existing policies on the tables they touch via `pg_policies` loops
  rather than by name — which is what makes the narrow policies mean what they say. Replaying
  the whole stack in order produces no stale broad policy anywhere. This is the single most
  common way an RLS model rots, and it was handled deliberately.
- **Every `SECURITY DEFINER` function pins `search_path`** — all seven live ones. The two
  older `handle_new_user` definitions that did not are superseded by v6's, which does.
- **`portal_access_codes` is properly unreachable**: RLS enabled, zero policies (deny-all),
  and `REVOKE ALL … FROM anon, authenticated`. Only the definer functions can see it. Textbook.
- **Pay data is gated in one place** — `is_admin()` on both tables, with `anon` revoked. The
  client does no filtering and does not need to.
- **No secrets are committed.** `.env*` is gitignored, no key literals in `src/` or `public/`,
  and the Supabase anon key is supplied at build time. The anon key being public is correct —
  that is what it is for.
- **The trigger model is sound.** `prevent_privilege_escalation` stops a user promoting
  themselves, and pay is frozen by trigger at approval rather than computed in the client.
- **`work_hours` write rules are asymmetric on purpose** and correctly so: `USING` admits
  `pending` *or* `rejected`, `WITH CHECK` demands the row written back be `pending`, so editing
  a sent-back entry necessarily re-submits it.

---

## Suggested order

1. **Check whether `REACT_APP_GOOGLE_CLIENT_SECRET` is set in Vercel.** Minutes. Determines
   whether finding 1 is a live incident or a broken feature.
2. **Finding 3's `REVOKE`** — one statement, no behaviour change, closes the whole class.
3. **Findings 2 and 5 together** — one migration plus a one-character change.
4. **Finding 4 step 1** — lengthen the portal codes.
5. **Findings 6 and 7** whenever something else is being touched nearby.

Findings 2, 3 and 6 are migrations, and no migration has been written or applied as part of
this audit.
