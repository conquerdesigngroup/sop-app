# Parent Push Notifications — Spec

Push for families, and a per-parent on/off switch on the profile.

## Status

| § | What | State |
|---|---|---|
| 1 | The toggle — `NotificationsCard` + registry entry | **built**, tested, mobile-audited |
| 2 | Preference shape — `src/lib/portalNotifications.ts` | **built**, tested |
| 3 | Audience resolution — `portal_push_payload()` | **built** in v42; agreement with `loadMyUpdates` verified against live data |
| 4 | Outbox, trigger, cron drain | **built** in `supabase-migration-v42-parent-push.sql` — **not applied** |
| 5 | `supabase/functions/portal-push` | **built** — **not deployed** |
| 6 | Service worker tag | no change needed; `portal-push` sends a per-notice tag |

Nothing is live. The migration has not been applied and the function has not
been deployed, so no trigger exists and no cron job runs. There are also **zero
rows in `push_subscriptions`** today, so the first thing applying this changes
is nothing at all — the sender has nowhere to send until a family turns the
switch on, which needs the client-auth launch.

The rest of this document is the design, written before the build. Where it
says a thing already exists, that was read in the working copy, not
remembered.

---

## Why this exists

The portal only talks outward, and only when someone opens it. A cancelled
class, a changed call time, a note addressed to one family — all of it sits
there until a parent happens to look. The messages that matter most are exactly
the ones that cannot wait for someone to check.

`sendHouseholdNote` says it plainly in its own comment
(`src/components/portal-admin/viewer/HouseholdPanel.tsx:45`): *"It is NOT a
message: there is no reply."* Right now it is not even a delivery — it is a
row that hopes to be read.

---

## What is already built

This is the surprising part, and it changes the size of the job. Most of the
push stack exists and was built role-agnostic by accident of good design.

**`push_subscriptions` needs no schema change.** It is
`user_id uuid references public.profiles(id)` — and clients *have* profiles
rows. `handle_new_user()` in v28 branches on
`raw_app_meta_data->>'account_type' = 'client'` and inserts
`role='client', department='Client', is_active=true`. The RLS policy is:

```sql
create policy push_subscriptions_own on public.push_subscriptions
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
```

A signed-in parent is `authenticated`. **They can already insert their own
subscription row today.** Nothing about the storage layer needs to move.

**`src/lib/push.ts` is already role-agnostic.** `enablePush(userId)`,
`disablePush()`, `hasPushSubscription()`, and `pushSupport()` make no
assumption about staff. `pushSupport()` already returns the four states that
matter — `ok`, `unsupported`, `needs-install` (iOS not on the Home Screen),
`blocked` (permission denied earlier) — with error strings already written for
a non-technical reader.

**The VAPID keypair is already reachable by a client.** `enablePush` fetches
the public key through `alert-push`'s `{ action: 'public-key' }`, which gates
on *"has an active profile"*, not on role. A client profile is
`is_active = true` from birth, so this call already succeeds for a parent. The
keys live in `push_vapid` + Vault (v38) and are shared, correctly, by any
sender.

**The service worker already handles push and clicks.**
`public/service-worker.js:160` parses `{ title, body, url, tag }` and
`:186` focuses an open tab and navigates it, or opens a new one. Portal URLs
work with no change.

**`notification_preferences` already exists on `profiles`** as JSONB
defaulting `pushEnabled: true`, and every client profile gets one.

**The audience rule is already written, in the other direction.**
`loadMyUpdates` (`src/lib/attendanceQueries.ts`) and `UpdatesCard` already
decide *which updates apply to this family*:

```
.filter(u => u.isPublished)
.filter(u => u.classId === null || enrolledClassIds.includes(u.classId))
```

plus RLS, which decides whether a `household_id` row is returned at all. The
push audience query is the inverse of that filter and must stay in step with
it.

### So what is actually missing

Three things, and one of them is the reason the other two are not trivial:

1. Nobody resolves *"who should be told about this row"* server-side.
2. There is no server-side moment at which to send. **Every write to
   `portal_updates` is a direct client-side table insert** —
   `PortalAdminContext.tsx:396` for program and class updates,
   `portalViewer.ts:391` for household notes. No Edge Function is involved in
   publishing anything.
3. There is no parent-facing switch.

---

## §1 — The toggle

The thing to build first, because it is the part a parent touches, and because
it is honest to ship the switch before the sending.

**Where it goes.** `src/components/profile/NotificationsCard.tsx`, plus one
entry in `PROFILE_CARDS` (`src/lib/profileCards.ts`). Per CLAUDE.md that is the
whole change — the profile page itself is not edited. Suggested entry:

```ts
{
  id: 'notifications',
  title: 'Notifications',
  component: NotificationsCard,
  visible: ctx => !ctx.isStaff,   // staff keep the Settings page toggle
  defaultOrder: 80,               // above Account, below the content cards
}
```

**Three levels, and the card must not conflate them.** This is the whole
design problem of the card, and getting it wrong is what makes notification
settings feel broken everywhere else:

| Level | Where it lives | Scope | Who controls it |
|---|---|---|---|
| OS / browser permission | the phone | this browser | the parent, in system settings — **the app cannot change or read this beyond granted/denied/default** |
| Device subscription | `push_subscriptions` row | this browser | the toggle, via `enablePush` / `disablePush` |
| Account preference | `profiles.notification_preferences` | every device | the category switches |

A parent who turns it on the phone and then opens the portal on an iPad must
see *"on for your account, off on this device"* — not a lie in either
direction. `hasPushSubscription()` answers the middle row; the profile answers
the bottom one.

**The states the card has to render**, all of them reachable and all of them
worth designing:

- `support === 'needs-install'` — **the common case, and the biggest adoption
  risk.** iPhone Safari delivers Web Push only to a site installed to the Home
  Screen. Most of this audience is on an iPhone. Do not render a dead toggle:
  render the Add-to-Home-Screen instruction, and reuse `useInstallPrompt.ts`
  rather than writing a second copy of that logic.
- `support === 'blocked'` — permission was denied at some earlier point and
  only the browser's own site settings can undo it. Say that, with where to
  go. A toggle that silently refuses to move is the worst possible answer.
- `support === 'unsupported'` — say so once, plainly, and stop.
- `support === 'ok'`, no subscription — the master switch, off.
- `support === 'ok'`, subscribed — master on, plus the category switches.

**Slow-tap rules apply** (CLAUDE.md §Slow taps). Turning it on is a permission
prompt plus a function call plus an insert. Disable the control, hold a busy
ref so a second tap starts nothing, and end in a state that says what happened
— `"On for this phone"`, not a toggle that quietly springs back.

**Reduced motion**: no spinner-only feedback; the words carry it.

---

## §2 — Preference shape

Extend the existing JSONB rather than adding a column. Staff keys and parent
keys can share the object because they never share a row.

```jsonc
{
  "pushEnabled": true,        // master, already exists and already honoured
  // new, parent-facing:
  "studioNotices": true,      // program-wide announcements
  "classNotices": true,       // notices for a class this family is in
  "familyNotes": true,        // a note addressed to this household
  "newFiles": false           // photos/videos/documents posted to a class
}
```

`newFiles` defaults **off**. A class with fifty photos posted at once is fifty
reasons to turn everything off forever.

**Absent means yes**, matching the rule `alert-push` already uses
(`p.pushEnabled !== false`). A profile created before this ships must not go
silent, and must not need a backfill.

**The card must merge, not replace.** `SettingsPage.savePrefs` writes the whole
object; a parent card that does the same is fine today (different rows) but is
a trap the moment anything else writes a key. Read, spread, write.

---

## §3 — Audience resolution

Given a `portal_updates` row, who gets told:

| Row | Audience |
|---|---|
| `household_id` set | the guardians of that household |
| `class_id` set | guardians whose household has an **active** enrollment in that class |
| both null | guardians with an active enrollment in that **program** |

The join, all of which exists as of v33/v35:

```
portal_updates.class_id
  → portal_enrollments (status = 'active')
  → portal_students
  → portal_households
  → portal_household_members (member_type = 'guardian')
  → profiles.id  → push_subscriptions.user_id
```

**Guardians only, in v1.** `portal_household_members` pins a `student` member
to exactly one child by CHECK constraint; a guardian is pinned to none and sees
the whole household. Notifying student logins is a separate decision with its
own consent question — see Decisions.

**This filter must stay in step with `loadMyUpdates`.** If push says a notice
applies and the Updates card disagrees, a parent gets a notification that opens
a page where the notice is not there. Worth a shared test fixture asserting
both answer the same for the same row.

---

## §4 — Delivery: outbox, trigger, drain (migration v42)

**Why not just call the function from the browser after the insert.** Because
a super admin who sends a family note from the Viewer and then closes the
laptop would send nothing, and nobody would ever know. It also puts send
authority in a client. Notification delivery cannot depend on a tab staying
open.

**Why not poll `portal_updates` for rows published since the last run.** It
works, but "last run" is state that has to live somewhere anyway, and a
backdated `published_at` or a row edited from `is_published=false` to `true`
either double-sends or never sends. The outbox makes "has this been sent" an
explicit fact instead of an inference.

**So: an AFTER trigger enqueues, and pg_cron drains.**

```sql
create table public.push_outbox (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('update','document')),
  source_id    uuid not null,
  created_at   timestamptz not null default now(),
  sent_at      timestamptz,
  attempts     integer not null default 0,
  last_error   text,
  unique (kind, source_id)          -- an edit must not re-notify
);
```

The trigger fires on `insert or update of is_published` on `portal_updates`,
and enqueues only on the `false → true` transition (or an insert already
published). The `unique (kind, source_id)` is what makes a later typo fix
silent rather than a second buzz.

The drain follows the shape already established by `run_alert_push()` (v38)
and `run_calendar_syncs()` (v18): service-role key out of Vault,
fire-and-forget `net.http_post`, so a slow function never holds a cron worker.

```sql
select cron.schedule('portal-push-drain', '* * * * *',
  $$select public.run_portal_push()$$);
```

**Every minute, not on the second.** A notice is not a chat message, and a
minute of latency buys a coalescing window that is worth far more than the
latency costs — see quiet hours below.

---

## §5 — `supabase/functions/portal-push`

**A new function, not an extension of `alert-push`.** They share the VAPID
keys (`push_vapid` + `push_vapid_private_key()`) and should share nothing else.
`alert-push` is management-shaped: it checks for `admin`/`super_admin`, builds
a daily digest, and throttles each subscription to once per 20 hours. A
cancelled class at 4pm cannot wait 20 hours, and a parent is not an admin.
Bending one function to serve both is how the role checks end up wrong.

Lift and reuse the parts that are already right, ideally into
`supabase/functions/_shared/`:

- the `send()` loop, including the **404/410 → delete the row** handling, which
  is the thing that stops a dead endpoint failing forever;
- `ensureKeys()`;
- the service-role detection **by JWT role claim, not by string-comparing the
  key to `Deno.env`** — a trailing newline in the Vercel copy of that value has
  already cost this project once (`alert-push` carries the scar and the
  comment).

Payload, matching what the service worker already parses:

```ts
{ title, body, url, tag }
```

- `url` deep-links to where the notice actually is —
  `/portal/:program/updates`, or `/portal/profile` for a family note.
- **`tag` must be unique per notice**, e.g. `didc-update-<id>`. See §6.

**Rate limiting and quiet hours.** Not optional; this is the difference between
a feature parents keep and one they disable in week two.

- **Coalesce**: more than one notice for the same person in a drain becomes one
  notification — *"3 new notices from All Stars"*.
- **Cap**: at most N per household per day, N ≈ 3.
- **Quiet hours**: hold anything resolved outside ~08:00–21:00
  `America/Los_Angeles` until the window opens. The studio timezone is Pacific
  and `alert-push` already has the `todayIso()` / `Intl.DateTimeFormat` idiom
  for doing this correctly rather than with a UTC offset.
- **Pinned bypasses quiet hours.** `is_pinned` is the studio saying *this one
  matters*, and it is the closest thing to an urgency flag that exists today.

---

## §6 — The service worker: one change, one trap

The push and click handlers work as-is. But the current options are:

```js
tag: data.tag || 'didc-alert',
renotify: true,
```

A `tag` **replaces** any notification already showing with the same tag. That
is right for a daily digest — the second one should supersede the first. It is
**wrong for parent notices**: two different announcements would collapse into
one, and the first would vanish unread from the tray.

So `portal-push` must send a per-notice tag (`didc-update-<id>`). No service
worker change is strictly required — but it is worth a comment there recording
why the two senders use tags differently, because the next person to read that
line will otherwise "fix" it.

**Do not hand-bump `CACHE_VERSION`** if the worker is touched. It is stamped at
build time; that is already solved.

---

## Decisions to make before building

1. **Do student logins get notified?** They have accounts and are pinned to one
   child. A teenager getting *"class cancelled"* is genuinely useful; it is
   also a message to a minor that the guardian did not send. Recommendation:
   guardians only in v1, student notifications as a separate decision.
2. **Do new files notify at all?** Recommendation: yes, but default off, and
   coalesced hard — one *"7 new photos in Ballet 3"*, never seven.
3. **Is there an urgent path?** Today `is_pinned` is the only signal that a
   notice is important. A dedicated `is_urgent` on `portal_updates` would be
   cleaner, but adds a field the admin UI has to explain. Recommendation: use
   `is_pinned` for v1 and see whether the studio reaches for it.
4. **Events.** This spec covers `portal_updates` and (optionally) documents. A
   changed or cancelled *event* is arguably the highest-value notification of
   all, but `portal_events` rows are also written by the Google sync, so
   "changed" needs to distinguish a real change from a sync rewrite. Worth its
   own pass; deliberately out of scope here.

---

## Traps

- **iOS Home Screen.** Web Push does not reach iPhone Safari otherwise. Design
  for it in the card; it is the default case, not the edge case.
- **A permission prompt needs a real click.** `enablePush` must stay
  gesture-initiated. Never call it from an effect.
- **Push is per-browser, not per-person.** Phone and iPad are two rows. The
  card must say which one it is talking about.
- **`user_id` is the profile id.** Not the household id — a household with two
  guardians is two subscriptions, and both should get the note.
- **Audience drift.** §3 and `loadMyUpdates` must agree. Test them together.
- **Do not weaken any `is_active_staff()` policy** to make an audience query
  work. The drain runs as `service_role` and bypasses RLS; it has no need.
- **A note deleted before the drain runs** must not send. Join to the row and
  re-check `is_published` at send time, not just at enqueue time.
- **Registering the fetch.** Anything the card loads goes through
  `useRefreshable` (CLAUDE.md §Data refresh), silent, throwing on failure.

---

## Verification

- `npm test -- --maxWorkers=2` — the full suite times out on iCloud in
  parallel; that is contention, not failure.
- `AUDIT_ROUTES=/portal/profile AUDIT_DEVICES='iPhone 15' npm run audit:mobile`
  while iterating, then the full sweep before shipping. Signed-in routes need
  `AUDIT_EMAIL` / `AUDIT_PASSWORD` or the run silently checks four public
  routes.
- **Verify against a build, not `npm start`** — and push in particular *cannot*
  be tested under `npm start`: the service worker only registers on a
  production build, which `getRegistration()` already explains in its timeout
  message.
- Each of the five card states wants a screenshot. `needs-install` and
  `blocked` cannot be reached by clicking around; drive them with a stubbed
  `pushSupport` in a component harness.

---

## Sequencing

This ships **dark**, like the profile did: the card is `visible: !isStaff` on
a page that only renders behind `CLIENT_AUTH_ENABLED`, which is still off.

1. §1 + §2 — the card and the preference shape. Ships alone, harmless, and is
   the honest first half: a parent can express a wish before anything acts on
   it.
2. §3 + §4 + §5 — audience, outbox, sender. Test with a household note, which
   has the smallest and most verifiable audience of the three.
3. Widen to class and program notices once the family-note path has been seen
   working end to end on a real phone.

Nothing here depends on the Enrollio work that attendance is parked behind —
§3 reads `portal_enrollments`, which exists and is populated by the same import
either way. It **does** depend on the client-auth launch, since every recipient
is a signed-in family.
