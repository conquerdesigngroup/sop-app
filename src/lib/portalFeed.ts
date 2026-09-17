import { ProgramSlug } from './portal';

/**
 * "Subscribe to this calendar" — the links, and only the links.
 *
 * WHY SUBSCRIBING IS A DIFFERENT FEATURE FROM ADDING
 *
 * portalIcs.ts hands a parent ONE date. That is a snapshot: the family who
 * added all fourteen September dates gets nothing for the competition added in
 * November, and a moved call time never reaches the phone that already saved
 * the old one. The work is per-event and never ends.
 *
 * A subscription is one tap, once, and then the studio's edits arrive on their
 * own — in the calendar app the parent already lives in. Everything here points
 * at the same `portal-calendar-feed` function; the four builders differ only in
 * how each vendor wants to be handed a URL.
 *
 * WHY THE URL IS BUILT HERE AND NOT READ FROM A CONSTANT
 *
 * It is derived from REACT_APP_SUPABASE_URL, which differs between local, the
 * preview builds and production. A hardcoded host would subscribe every parent
 * to whichever project the constant named on the day it was written, and — this
 * being a subscription — it would keep doing so silently for a year.
 */

/**
 * Empty when Supabase is unconfigured; every builder below returns '' too.
 *
 * ALL whitespace is stripped, not just trailing slashes.
 *
 * Vercel's REACT_APP_SUPABASE_URL carries a trailing newline. Nothing else in
 * the app has ever noticed, because the URL parser drops tabs and newlines when
 * it parses — so every fetch supabase-js makes works fine and always has. It
 * only becomes visible HERE, because these builders percent-ENCODE the URL into
 * somebody else's query string, where a newline survives as a literal %0A and
 * Google is handed a cid it cannot resolve.
 *
 * Caught on production, not in a test: a local .env.local has no newline, so
 * every check up to and including the live smoke test of the feed itself passed
 * while the Google and Outlook links were broken.
 *
 * A URL can never legally contain raw whitespace, so removing all of it is
 * always safe and does not depend on the newline being at the end.
 */
const functionsBase = (): string => {
  const url = process.env.REACT_APP_SUPABASE_URL;
  if (!url) return '';
  return `${url.replace(/\s+/g, '').replace(/\/+$/, '')}/functions/v1`;
};

/** Whether a link can be built at all. The sheet says so when it cannot. */
export const feedAvailable = (): boolean => !!functionsBase();

/**
 * The canonical https URL for ONE ACCOUNT's subscription to one section. This
 * is the one to copy, to download, and to hand to Google and Outlook.
 *
 * WHY THE LINK CARRIES A TOKEN  (v56)
 *
 * It used to be `?program=<section>`, which named no one. That stopped working
 * silently when v30 closed anonymous reads — every subscriber got an empty
 * calendar from 2026-09-07 — and it could not simply be reopened, because
 * since v55 the All-Star calendar belongs to All-Star families and a URL that
 * names only the section is one anybody can guess.
 *
 * The token is the account's own, from portal_calendar_token(), and it is the
 * whole credential: a calendar app has no way to sign in. It goes in the PATH,
 * as the feed function's header always said it would, which also gives the
 * file the `.ics` name some calendar apps look for.
 *
 * Empty without a token or without Supabase, rather than a link that looks
 * subscribable and fails inside somebody's calendar app.
 */
export const feedUrl = (slug: ProgramSlug, token: string): string => {
  const base = functionsBase();
  if (!base || !token) return '';
  return `${base}/portal-calendar-feed/${encodeURIComponent(token)}/${encodeURIComponent(slug)}.ics`;
};

/**
 * The same URL under the `webcal` scheme, which is what makes a phone offer to
 * SUBSCRIBE rather than a browser offer to download.
 *
 * iOS registers webcal:// to Calendar, so tapping this opens the subscribe
 * confirmation directly. Not a different endpoint — the scheme is the entire
 * difference, and the server never sees it.
 */
export const webcalUrl = (slug: ProgramSlug, token: string): string =>
  feedUrl(slug, token).replace(/^https?:/, 'webcal:');

/**
 * Google Calendar's "add by URL", prefilled.
 *
 * `cid` takes the whole feed URL, encoded. Google wants the webcal form here —
 * handed the https one it has been known to offer an import (a one-off copy of
 * today's events) instead of a subscription, which is the exact distinction
 * this feature exists to make.
 */
export const googleSubscribeUrl = (slug: ProgramSlug, token: string): string => {
  const feed = webcalUrl(slug, token);
  return feed
    ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feed)}`
    : '';
};

/**
 * Outlook.com's "subscribe from web", prefilled.
 *
 * outlook.live.com is the personal-account host, which is what a parent has; a
 * work account lives on outlook.office.com and would have to sign in again.
 * `name` is sent because Outlook's dialog leaves the field blank otherwise and
 * the parent has to invent one.
 */
export const outlookSubscribeUrl = (slug: ProgramSlug, token: string, name: string): string => {
  const feed = feedUrl(slug, token);
  if (!feed) return '';
  return 'https://outlook.live.com/calendar/0/addfromweb?' +
    `url=${encodeURIComponent(feed)}&name=${encodeURIComponent(name)}`;
};

/**
 * Download the whole season as one file.
 *
 * The escape hatch for a parent who will not subscribe to anything — it is the
 * same bytes, saved once, and it goes stale the moment the studio edits
 * anything. Offered last and labelled as a snapshot for that reason.
 *
 * A plain navigation rather than fetch-then-Blob: the response already carries
 * Content-Type and Content-Disposition, and routing it through JavaScript would
 * add a CORS dependency to the one path that has no reason to need it.
 */
export const downloadFeed = (slug: ProgramSlug, token: string): void => {
  const url = feedUrl(slug, token);
  if (!url) return;

  const link = document.createElement('a');
  link.href = url;
  link.download = `didc-${slug}.ics`;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
