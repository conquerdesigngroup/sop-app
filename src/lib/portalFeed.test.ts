import {
  feedAvailable,
  feedUrl,
  googleSubscribeUrl,
  outlookSubscribeUrl,
  webcalUrl,
} from './portalFeed';

/**
 * The subscribe links, which are the one artefact here that no amount of
 * looking at the app will verify — a wrong one fails silently in somebody
 * else's calendar app, months later.
 *
 * Since v56 every link carries the account's token in its path. The old
 * `?program=` form named no one, and served an empty calendar for ten days
 * before anyone noticed.
 *
 * Run with: npx react-scripts test --testPathPattern portalFeed
 */

const ORIGINAL = process.env.REACT_APP_SUPABASE_URL;

/** The shape portal_calendar_token() returns: 32 random bytes, hex. */
const TOKEN = '0123456789abcdef'.repeat(4);

const FEED = `https://example.supabase.co/functions/v1/portal-calendar-feed/${TOKEN}`;

beforeEach(() => {
  process.env.REACT_APP_SUPABASE_URL = 'https://example.supabase.co';
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.REACT_APP_SUPABASE_URL;
  else process.env.REACT_APP_SUPABASE_URL = ORIGINAL;
});

describe('feed url', () => {
  it("puts the account's token and the section in the path", () => {
    expect(feedUrl('allstars', TOKEN)).toBe(`${FEED}/allstars.ics`);
  });

  it('is empty without a token, rather than a link that names no one', () => {
    // The pre-v56 link was exactly this: a section and nothing else. It is the
    // one a calendar app must never be handed again.
    expect(feedUrl('allstars', '')).toBe('');
    expect(webcalUrl('allstars', '')).toBe('');
    expect(googleSubscribeUrl('allstars', '')).toBe('');
    expect(outlookSubscribeUrl('allstars', '', 'DIDC')).toBe('');
  });

  it('never carries the old query-string form', () => {
    expect(feedUrl('academy', TOKEN)).not.toContain('?program=');
  });

  it('does not double the slash when the configured url has a trailing one', () => {
    process.env.REACT_APP_SUPABASE_URL = 'https://example.supabase.co/';
    expect(feedUrl('academy', TOKEN)).toBe(`${FEED}/academy.ics`);
  });

  it('survives a trailing newline on the configured url', () => {
    // Not hypothetical. Vercel's REACT_APP_SUPABASE_URL has one, and it shipped:
    // every fetch worked (the URL parser drops newlines when it parses) while
    // Google was handed cid=webcal://…supabase.co%0A/functions/… and could not
    // resolve it. Encoding the URL into someone else's query string is the one
    // place the newline survives.
    process.env.REACT_APP_SUPABASE_URL = 'https://example.supabase.co\n';
    expect(feedUrl('allstars', TOKEN)).toBe(`${FEED}/allstars.ics`);
    expect(googleSubscribeUrl('allstars', TOKEN)).not.toContain('%0A');
    expect(outlookSubscribeUrl('allstars', TOKEN, 'DIDC')).not.toContain('%0A');
  });

  it('survives surrounding spaces too', () => {
    process.env.REACT_APP_SUPABASE_URL = '  https://example.supabase.co  ';
    expect(feedUrl('academy', TOKEN)).toBe(`${FEED}/academy.ics`);
    expect(webcalUrl('academy', TOKEN)).toBe(`${FEED.replace('https:', 'webcal:')}/academy.ics`);
  });

  it('is empty when supabase is not configured, rather than a broken url', () => {
    // The sheet checks feedAvailable and says so. A half-built
    // "undefined/functions" link would look subscribable and fail in the
    // calendar app instead.
    delete process.env.REACT_APP_SUPABASE_URL;
    expect(feedAvailable()).toBe(false);
    expect(feedUrl('allstars', TOKEN)).toBe('');
    expect(webcalUrl('allstars', TOKEN)).toBe('');
    expect(googleSubscribeUrl('allstars', TOKEN)).toBe('');
    expect(outlookSubscribeUrl('allstars', TOKEN, 'DIDC')).toBe('');
  });
});

describe('webcal', () => {
  it('swaps only the scheme — the server never sees the difference', () => {
    expect(webcalUrl('allstars', TOKEN)).toBe(`${FEED.replace('https:', 'webcal:')}/allstars.ics`);
  });

  it('rewrites http too, for a local supabase', () => {
    process.env.REACT_APP_SUPABASE_URL = 'http://localhost:54321';
    expect(webcalUrl('allstars', TOKEN)).toMatch(/^webcal:\/\/localhost:54321\//);
  });
});

describe('google', () => {
  it('hands over the webcal form, encoded', () => {
    // The https form has been known to make Google offer a one-off import
    // instead of a subscription, which is the whole distinction here.
    const feed = `${FEED.replace('https:', 'webcal:')}/allstars.ics`;
    expect(googleSubscribeUrl('allstars', TOKEN)).toBe(
      `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feed)}`
    );
  });

  it('encodes the path so no part of the link can be read as google’s own', () => {
    const url = googleSubscribeUrl('allstars', TOKEN);
    expect(url.split('?')).toHaveLength(2);
    expect(url).toContain(`%2F${TOKEN}%2Fallstars.ics`);
  });
});

describe('outlook', () => {
  it('sends the https url and a name for the calendar it creates', () => {
    const url = outlookSubscribeUrl('academy', TOKEN, 'DIDC — Academy');
    expect(url).toContain('https://outlook.live.com/calendar/0/addfromweb?');
    expect(url).toContain(`url=${encodeURIComponent(feedUrl('academy', TOKEN))}`);
    expect(url).toContain(`name=${encodeURIComponent('DIDC — Academy')}`);
  });

  it('does not send webcal, which outlook.com will not fetch', () => {
    expect(outlookSubscribeUrl('academy', TOKEN, 'DIDC')).not.toContain('webcal');
  });
});
