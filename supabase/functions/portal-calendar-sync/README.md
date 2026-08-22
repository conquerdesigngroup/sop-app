# portal-calendar-sync

Mirrors a Google calendar into `portal_events` so the parent portal calendar is
current without anyone opening the staff app.

Deploy to project `sgppeenmvskwztaszkgn` with `verify_jwt: true`.
Needs migration **v12** applied first.

## The rule

The sync owns `source = 'google'` rows and nothing else. It never reads, alters
or deletes a `'manual'` row — the ones staff type into the portal manager. v9
built the shape for this: `portal_events_google_uniq`, a partial unique index on
`(google_calendar_id, google_event_id) WHERE source = 'google'`.

## Setup

1. **Service account.** Google Cloud → IAM & Admin → Service Accounts → create
   one → Keys → Add key → JSON. Nothing else needs enabling except the Google
   Calendar API on the project.
2. **Share the calendar.** Google Calendar → the studio calendar → Settings and
   sharing → Share with specific people → the service account's
   `…@….iam.gserviceaccount.com` address → **See all event details**.
   Skipping this is the single most common failure and shows up as
   `Calendar not found or not shared with the service account`.
3. **Secret.** Set `GOOGLE_SERVICE_ACCOUNT_JSON` on this function to the entire
   contents of the key file.
4. **Point a program at it.** Portal manager → Calendar → *Connect a calendar*,
   or v12 section 3 by hand. The Calendar ID is on the same Google settings page
   under "Integrate calendar".
5. **Schedule it.** v12 section 4. Runs twice an hour.

### Why a service account and not the staff OAuth tokens

An unattended job cannot depend on a person's refresh token: it breaks when they
leave, when they revoke access, and — if the OAuth consent screen is still in
*Testing* — silently every seven days. A service account belongs to the studio
and does not expire.

## What it does per run

For each enabled row in `portal_calendar_sources`:

1. Mint an access token by signing a JWT with the service account key (RS256).
2. Fetch events in `[now - days_back, now + days_ahead]` with
   `singleEvents=true` (recurring events expanded into instances) and
   `showDeleted=true` (so cancellations arrive as tombstones rather than as
   absences), paging until done.
3. Map them, and call `portal_sync_google_events()` — one transaction that
   upserts, removes tombstones, and prunes anything that vanished from the
   window.
4. Record the outcome on the row. Failures go to
   `portal_record_sync_failure()`, which is what the manager's status line
   reads.

### Two mapping details that are easy to get wrong

- **All-day `end.date` is exclusive.** A one-day event on the 30th arrives with
  `end.date = 2026-10-01`. It is shifted back a day, and a single-day event ends
  up with no end at all — matching what the manual event editor stores.
- **Descriptions are HTML.** The portal renders event text as escaped plain
  text, so tags are stripped here. Rendering them instead would make the portal
  emit HTML from an external source, which is the thing phase 2 deliberately
  avoided.

## Callers

| caller | token | reaches |
|---|---|---|
| cron | service role key from Vault | every enabled source |
| admin, "Sync now" | their own JWT | one program |

Anything else is refused here, and refused again inside
`portal_sync_google_events()`, which checks `auth.role()` and `is_admin()` for
itself.

## When it looks broken

```sql
SELECT program_id, is_enabled, last_status, last_run_at, last_message,
       last_upserted, last_removed
FROM public.portal_calendar_sources;

SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
```

`cron.job_run_details` says the HTTP call was made. `last_status` says whether
Google answered. A sync that quietly stops looks exactly like a quiet week, which
is why the manager shows the last run time whether or not anything is wrong.
