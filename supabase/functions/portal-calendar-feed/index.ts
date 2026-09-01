// =============================================================================
// portal-calendar-feed — the whole programme calendar, as one subscribable file
// =============================================================================
//
// WHY THIS EXISTS
//
// The portal could already hand a parent ONE date at a time: press Add, pick
// Google or Apple, done. That is a snapshot, and it is the wrong shape for the
// thing parents actually need. A family who dutifully added all fourteen
// September dates gets NOTHING for the competition added in November, and if a
// call time moves their phone keeps the old one. The work is per-event,
// forever, and the calendar silently rots between visits.
//
// A subscription inverts that. One tap in September, and every event the studio
// adds, edits or cancels arrives on its own — in the calendar app the parent
// already lives in, with their own alerts, next to their work meetings. It is
// the only thing on this page that keeps working after the app is closed.
//
// THIS IS EGRESS, NOT THE FEEDS THAT WERE REMOVED IN v21
//
// The iCal feeds killed in v21 were INBOUND: us polling Google's secret
// addresses for the studio's own calendars, which Google rate-limited hard
// enough that one scheduled run in five came back 429. That reasoning is about
// being a *client* of somebody else's feed and does not apply here — this is
// us SERVING one. No rate limit, nothing to poll, and the freshness ceiling is
// ours to set. See the calendar-sync notes before assuming otherwise.
//
// WHAT IT MAY EXPOSE — read this before adding anything to portal_events
//
// The function reads with the ANON KEY, not the service role, so RLS answers it
// exactly as it answers a parent's browser: published rows of an active
// programme and nothing else. It is not possible for this endpoint to serve
// something the portal page would not already show to an anonymous visitor,
// which is the property that makes an unauthenticated URL defensible.
//
// The access code does not gate it, and could not: the code is a convenience
// flag on the device (see lib/portal.ts), portal content is anon-readable by
// design, and a calendar client cannot present a code anyway. So the standing
// rule the portal already has applies here with more force — KEEP PRIVATE
// INFORMATION OUT OF PORTAL CONTENT. If that ever has to change, the mechanism
// is a per-account token in the path, not a secret in the query string.
//
// verify_jwt MUST be false. Apple Calendar, Google and Outlook fetch this URL
// with no Authorization header and no apikey, and there is no way to give them
// one. A 401 here looks to a parent like "the link is broken".
//
// ITS TWIN IS src/lib/portalIcs.ts
//
// That one builds a single VEVENT in the browser; this one builds hundreds in
// Deno. They cannot share a module across the two runtimes, so the primitives
// below are duplicated on purpose. Four things MUST stay identical or a parent
// who both subscribed and pressed Add gets two of every event:
//
//   1. UID is `<row id>@didc.app`. This is what makes the two paths collapse
//      into one event instead of duplicating.
//   2. All-day DTEND is EXCLUSIVE — stored last-day-inclusive, +1 on the way
//      out. Get this wrong and every closure ends a day early.
//   3. CRLF line endings, folded at 75 octets. Outlook is the one that minds.
//   4. Timed events are absolute UTC instants, never floating local times.
// =============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
};

/**
 * How much of the season the file carries.
 *
 * Wider than the in-app calendar's month-back/year-forward on purpose. The app
 * is refetched every time a parent opens the page; a subscription is refreshed
 * on the phone's own schedule and has to still be right in between, so the past
 * edge keeps a term of history for anyone scrolling back and the future edge
 * covers next season being published before this one ends.
 */
const MONTHS_BACK = 3;
const MONTHS_AHEAD = 18;

/**
 * Slug shape only. The real check is the lookup below, which 404s on anything
 * that is not an active programme — so a programme added in the database works
 * here without redeploying this function.
 */
const SLUG_RE = /^[a-z0-9-]{1,40}$/;

const text = (status: number, body: string) =>
  new Response(body, {
    status,
    headers: { ...cors, 'Content-Type': 'text/plain; charset=utf-8' },
  });

// --------------------------------------------------------------- formatting

const pad = (n: number): string => String(n).padStart(2, '0');

/** 20260831T170000Z — an absolute instant, which is what portal events are. */
const utcStamp = (d: Date): string =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
  `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

/**
 * 20260831 — read in UTC deliberately. All-day events are stored at UTC
 * midnight, the same convention iCal uses for DATE values, so reading them
 * locally names the previous day west of Greenwich.
 */
const dateStamp = (d: Date): string =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;

const addDaysUtc = (d: Date, days: number): Date => {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
};

/** RFC 5545 TEXT escaping. Backslash first, or it escapes its own output. */
const escapeText = (value: string): string =>
  String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');

/** UTF-8 length of one code point. The fold limit is octets, not characters. */
const utf8Len = (codePoint: number): number => {
  if (codePoint < 0x80) return 1;
  if (codePoint < 0x800) return 2;
  if (codePoint < 0x10000) return 3;
  return 4;
};

/**
 * Fold a content line to 75 octets, continuing with CRLF + one space.
 *
 * Never mid-character: an emoji in an event title is four octets and splitting
 * one produces a file the phone refuses rather than a slightly wide line.
 */
const fold = (line: string): string => {
  const parts: string[] = [];
  let current = '';
  let octets = 0;

  // Array.from, not a for..of over the string, so a surrogate pair counts once.
  for (const ch of Array.from(line)) {
    const size = utf8Len(ch.codePointAt(0) ?? 0);
    if (octets + size > 73) {
      parts.push(current);
      current = ' ';
      octets = 1;
    }
    current += ch;
    octets += size;
  }

  parts.push(current);
  return parts.join('\r\n');
};

// ------------------------------------------------------------------ events

interface EventRow {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  is_all_day: boolean;
  location: string | null;
  updated_at: string | null;
}

/**
 * Start, and the EXCLUSIVE end — the same two-part convention every reader
 * wants, and the same one src/lib/portalIcs.ts produces.
 *
 * All-day events are stored LAST-DAY-INCLUSIVE by portal-calendar-sync, which
 * shifts Google's exclusive end back a day on the way in. It goes forward again
 * here. An hour is the conventional default for a timed event with no end.
 */
const boundsOf = (row: EventRow): { start: Date; end: Date } => {
  const start = new Date(row.starts_at);
  const stored = row.ends_at ? new Date(row.ends_at) : null;

  if (row.is_all_day) {
    const lastDay = stored && stored > start ? stored : start;
    return { start, end: addDaysUtc(lastDay, 1) };
  }

  return { start, end: stored ?? new Date(start.getTime() + 60 * 60 * 1000) };
};

/**
 * A reminder the parent did not have to set.
 *
 * Two hours before a timed event is the leave-the-house nudge; 10am the day
 * before an all-day one — DTSTART is midnight for a DATE value, so -PT14H
 * lands there — is when there is still time to wash a costume.
 *
 * Best-effort in a SUBSCRIBED calendar and that is fine: iOS offers "Remove
 * Alarms" when subscribing and Google applies the viewer's own defaults to a
 * feed. It is honoured properly on the single-event Add path, which imports a
 * real event. Nothing is lost by sending it and something is gained when the
 * client keeps it.
 */
const alarm = (row: EventRow): string[] => [
  'BEGIN:VALARM',
  'ACTION:DISPLAY',
  `DESCRIPTION:${escapeText(row.title)}`,
  `TRIGGER:${row.is_all_day ? '-PT14H' : '-PT2H'}`,
  'END:VALARM',
];

const vevent = (row: EventRow, stamp: string): string[] => {
  const { start, end } = boundsOf(row);

  const lines: string[] = [
    'BEGIN:VEVENT',
    // Identical to the single-event builder's, so a parent who subscribed AND
    // pressed Add on one date ends up with one event, not two.
    `UID:${row.id}@didc.app`,
    `DTSTAMP:${stamp}`,
  ];

  if (row.is_all_day) {
    lines.push(`DTSTART;VALUE=DATE:${dateStamp(start)}`);
    lines.push(`DTEND;VALUE=DATE:${dateStamp(end)}`);
  } else {
    lines.push(`DTSTART:${utcStamp(start)}`);
    lines.push(`DTEND:${utcStamp(end)}`);
  }

  lines.push(`SUMMARY:${escapeText(row.title)}`);
  if (row.description) lines.push(`DESCRIPTION:${escapeText(row.description)}`);
  if (row.location) lines.push(`LOCATION:${escapeText(row.location)}`);

  // How a client notices an event CHANGED rather than appeared. Without it a
  // moved call time can sit unnoticed behind a cached copy.
  if (row.updated_at) lines.push(`LAST-MODIFIED:${utcStamp(new Date(row.updated_at))}`);

  lines.push(...alarm(row));
  lines.push('END:VEVENT');

  return lines;
};

/**
 * The whole calendar.
 *
 * X-WR-CALNAME is not in RFC 5545 but every reader that matters honours it, and
 * without it the subscription lands in a parent's calendar list named after the
 * URL. REFRESH-INTERVAL and X-PUBLISHED-TTL are the polite way to ask for a
 * re-fetch cadence; clients treat them as a hint, not an instruction.
 */
const buildFeed = (name: string, description: string, rows: EventRow[]): string => {
  const stamp = utcStamp(new Date());

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DIDC//Parent Portal//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name)}`,
    `NAME:${escapeText(name)}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
  ];

  if (description) {
    lines.push(`X-WR-CALDESC:${escapeText(description)}`);
    lines.push(`DESCRIPTION:${escapeText(description)}`);
  }

  for (const row of rows) lines.push(...vevent(row, stamp));

  lines.push('END:VCALENDAR');

  return lines.map(fold).join('\r\n') + '\r\n';
};

// ----------------------------------------------------------------- handler

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return text(405, 'Method not allowed');
  }

  const slug = new URL(req.url).searchParams.get('program')?.trim().toLowerCase() ?? '';
  if (!SLUG_RE.test(slug)) return text(400, 'Unknown calendar.');

  const url = Deno.env.get('SUPABASE_URL');
  // The ANON key, deliberately — see the header. The service role would read
  // unpublished drafts and inactive programmes straight onto a public URL.
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !anonKey) return text(500, 'Calendar is not available right now.');

  const supabase = createClient(url, anonKey);

  try {
    const { data: program, error: programError } = await supabase
      .from('portal_programs')
      .select('id, name, blurb')
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle();

    if (programError) throw programError;
    if (!program) return text(404, 'Unknown calendar.');

    const from = new Date();
    from.setMonth(from.getMonth() - MONTHS_BACK);
    const to = new Date();
    to.setMonth(to.getMonth() + MONTHS_AHEAD);

    const { data: rows, error: eventsError } = await supabase
      .from('portal_events')
      .select('id, title, description, starts_at, ends_at, is_all_day, location, updated_at')
      .eq('program_id', program.id)
      .eq('is_published', true)
      .gte('starts_at', from.toISOString())
      .lte('starts_at', to.toISOString())
      .order('starts_at', { ascending: true });

    if (eventsError) throw eventsError;

    const body = buildFeed(
      `DIDC — ${program.name}`,
      program.blurb ?? '',
      (rows ?? []) as EventRow[]
    );

    return new Response(req.method === 'HEAD' ? null : body, {
      status: 200,
      headers: {
        ...cors,
        'Content-Type': 'text/calendar; charset=utf-8',
        // inline, not attachment: a phone that fetched this by subscribing
        // should read it, and the browser download path sets its own filename.
        'Content-Disposition': `inline; filename="didc-${slug}.ics"`,
        // Short and public. A calendar client refetches on its own schedule
        // anyway, and this only decides how stale two clients a minute apart
        // may be from each other.
        'Cache-Control': 'public, max-age=900',
      },
    });
  } catch (err) {
    console.error('portal-calendar-feed failed:', err);
    // Deliberately not the database's words. This response is read by parents
    // and by calendar clients, neither of which can act on a Postgres error.
    return text(500, 'Calendar is not available right now.');
  }
});
