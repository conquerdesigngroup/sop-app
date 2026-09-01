# portal-calendar-feed

Serves a programme's published events as one subscribable `text/calendar` file,
so a parent taps **Subscribe** once and every date the studio adds after that
arrives on its own.

Deploy to project `sgppeenmvskwztaszkgn` with **`verify_jwt: false`**.
No migration needed — it reads tables that have existed since v9.

```bash
supabase functions deploy portal-calendar-feed --no-verify-jwt
```

## `verify_jwt` must be false

Apple Calendar, Google Calendar and Outlook fetch this URL with no
`Authorization` header and no `apikey`, and there is no way to give them one.
With JWT verification on, every subscription returns 401 and a parent sees a
link that simply does not work.

That is safe here because of what the function reads with — see below — and it
is the only function in this project deployed that way. Do not copy the flag
anywhere else.

## What it can expose

It queries with the **anon key**, not the service role, so RLS answers it
exactly as it answers a parent's browser: published events belonging to an
active programme, and nothing else. This endpoint cannot serve anything the
portal page would not already show an anonymous visitor.

The access code does not gate it and could not — the code is a per-device
convenience flag (`lib/portal.ts`), portal content is anon-readable by design,
and a calendar client has no way to present a code. So the portal's standing
rule applies with more force here: **keep private information out of portal
content.** If the studio ever needs the feed locked down, the mechanism is a
per-account token in the path, not a secret in the query string.

## Request

```
GET /functions/v1/portal-calendar-feed?program=allstars
```

`program` is a portal programme slug. Anything that is not an active programme
gets a 404, so a programme added in the database works without redeploying.
`HEAD` is answered too — some clients probe before subscribing.

| window | |
|---|---|
| back | 3 months |
| forward | 18 months |

Wider than the in-app calendar's month-back/year-forward on purpose: the app
refetches every time the page opens, while a subscription has to still be right
between the phone's own refreshes.

## The four things that must match `src/lib/portalIcs.ts`

The browser builds one VEVENT; this builds hundreds. They cannot share a module
across the two runtimes, so the primitives are duplicated deliberately. If you
change one, change both:

1. **`UID` is `<row id>@didc.app`.** This is what makes a parent who subscribed
   *and* pressed Add on a single date end up with one event instead of two.
2. **All-day `DTEND` is exclusive.** Stored last-day-inclusive, +1 on the way
   out. Wrong here means every closure ends a day early.
3. **CRLF, folded at 75 octets**, never mid-character. Outlook is the one that
   minds; an emoji in a title is four octets.
4. **Timed events are absolute UTC instants.** A floating local time becomes
   5pm in whatever zone the reader's phone is set to.

## Alarms

Every event carries a `VALARM` — two hours before a timed event, 10am the day
before an all-day one (`DTSTART` is midnight for a `DATE` value, so `-PT14H`
lands there).

Expect this to be **best-effort in a subscription**: iOS offers "Remove Alarms"
when subscribing, and Google applies the viewer's own default notifications to a
feed. It is honoured properly on the single-event Add path, which imports a real
event. Sending it costs nothing and some clients keep it.

## When it looks broken

```bash
# Should answer 200 text/calendar, with no auth header at all.
curl -sI "https://sgppeenmvskwztaszkgn.supabase.co/functions/v1/portal-calendar-feed?program=allstars"

# Eyeball the file.
curl -s "https://sgppeenmvskwztaszkgn.supabase.co/functions/v1/portal-calendar-feed?program=allstars" | head -30
```

| symptom | cause |
|---|---|
| 401 | deployed without `--no-verify-jwt` |
| 404 | slug is not an active programme |
| 200 with no `VEVENT`s | nothing published in the window — check `is_published` |
| a date is a day early on the phone | the exclusive-`DTEND` rule above |

A subscription that quietly stops updating looks exactly like a quiet term,
which is the failure worth checking for deliberately rather than waiting to be
told about.
