# portal-calendar-feed

Serves a programme's published events as one subscribable `text/calendar` file,
so a parent taps **Subscribe** once and every date the studio adds after that
arrives on its own.

Deploy to project `sgppeenmvskwztaszkgn` with **`verify_jwt: false`**.
Needs v56, which adds the per-account link tokens and the function that decides
what a link may serve.

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

Everything is decided by `portal_calendar_feed()` (v56), which the function
calls with the **anon key** — never the service role. That function resolves the
link's token to an account and serves what the portal pages would serve it:
published events of an active section, and the All-Star calendar only to an
All-Star family or staff (v55).

**The token is the whole credential.** A calendar app cannot sign in, so anyone
holding a link sees that account's calendar; the subscribe sheet says so. A
link to a section the account may not see returns an EMPTY calendar rather than
an error, because a phone keeps the last good copy of a feed that fails and the
point is for those dates to leave the phone.

The old pre-v56 link named only a section, which is why it could not simply be
made to work again: `?program=allstars` is guessable, and that calendar is
private. It now serves a re-subscribe notice — see below.

## Request

```
GET /functions/v1/portal-calendar-feed/<token>/<section>.ics
```

`<token>` is 64 hex characters from `portal_calendar_token()`; `<section>` is a
portal programme slug. An unknown token, or anything that is not an active
programme, gets a 404, so a programme added in the database works without
redeploying. `HEAD` is answered too — some clients probe before subscribing.

### The old link

```
GET /functions/v1/portal-calendar-feed?program=allstars
```

Answers 200 with ONE all-day event, rolling 14 days from today, telling the
family to subscribe again in the portal (`UID: resubscribe-<section>@didc.app`,
so it updates in place rather than piling up). Every subscription made before
2026-09-17 is on this link, and a notice in the calendar they already have is
the only way to reach those phones. Do not repurpose it to serve events.

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
# A link, with no auth header at all. Take a token from a test account:
#   select token from portal_calendar_tokens where profile_id = '<id>';
curl -sI "https://sgppeenmvskwztaszkgn.supabase.co/functions/v1/portal-calendar-feed/$TOKEN/allstars.ics"

# Eyeball the file.
curl -s "https://sgppeenmvskwztaszkgn.supabase.co/functions/v1/portal-calendar-feed/$TOKEN/allstars.ics" | head -30
```

| symptom | cause |
|---|---|
| 401 | deployed without `--no-verify-jwt` |
| 404 | unknown token, or the slug is not an active programme |
| 200 with only the re-subscribe event | the old `?program=` link — subscribe again from the portal |
| 200 with no `VEVENT`s | that account may not see this section (v55), or nothing is published in the window |
| a date is a day early on the phone | the exclusive-`DTEND` rule above |

A subscription that quietly stops updating looks exactly like a quiet term,
which is the failure worth checking for deliberately rather than waiting to be
told about.
