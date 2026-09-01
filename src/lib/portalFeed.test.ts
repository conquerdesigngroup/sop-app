import {
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
 * Run with: npx react-scripts test --testPathPattern portalFeed
 */

const ORIGINAL = process.env.REACT_APP_SUPABASE_URL;

beforeEach(() => {
  process.env.REACT_APP_SUPABASE_URL = 'https://example.supabase.co';
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.REACT_APP_SUPABASE_URL;
  else process.env.REACT_APP_SUPABASE_URL = ORIGINAL;
});

describe('feed url', () => {
  it('points at the function with the programme as a query parameter', () => {
    expect(feedUrl('allstars')).toBe(
      'https://example.supabase.co/functions/v1/portal-calendar-feed?program=allstars'
    );
  });

  it('does not double the slash when the configured url has a trailing one', () => {
    process.env.REACT_APP_SUPABASE_URL = 'https://example.supabase.co/';
    expect(feedUrl('academy')).toBe(
      'https://example.supabase.co/functions/v1/portal-calendar-feed?program=academy'
    );
  });

  it('is empty when supabase is not configured, rather than a broken url', () => {
    // The sheet checks for this and says so. A half-built "undefined/functions"
    // link would look subscribable and fail in the calendar app instead.
    delete process.env.REACT_APP_SUPABASE_URL;
    expect(feedUrl('allstars')).toBe('');
    expect(webcalUrl('allstars')).toBe('');
    expect(googleSubscribeUrl('allstars')).toBe('');
    expect(outlookSubscribeUrl('allstars', 'DIDC')).toBe('');
  });
});

describe('webcal', () => {
  it('swaps only the scheme — the server never sees the difference', () => {
    expect(webcalUrl('allstars')).toBe(
      'webcal://example.supabase.co/functions/v1/portal-calendar-feed?program=allstars'
    );
  });

  it('rewrites http too, for a local supabase', () => {
    process.env.REACT_APP_SUPABASE_URL = 'http://localhost:54321';
    expect(webcalUrl('allstars')).toMatch(/^webcal:\/\/localhost:54321\//);
  });
});

describe('google', () => {
  it('hands over the webcal form, encoded', () => {
    // The https form has been known to make Google offer a one-off import
    // instead of a subscription, which is the whole distinction here.
    const feed = 'webcal://example.supabase.co/functions/v1/portal-calendar-feed?program=allstars';
    expect(googleSubscribeUrl('allstars')).toBe(
      `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feed)}`
    );
  });

  it('encodes the query separator so it cannot be read as google’s own', () => {
    // The bug this guards: an unencoded `?program=` would terminate at cid and
    // Google would subscribe to the function with no programme at all.
    expect(googleSubscribeUrl('allstars')).not.toContain('?program=');
    expect(googleSubscribeUrl('allstars')).toContain('%3Fprogram%3Dallstars');
  });
});

describe('outlook', () => {
  it('sends the https url and a name for the calendar it creates', () => {
    const url = outlookSubscribeUrl('academy', 'DIDC — Academy');
    expect(url).toContain('https://outlook.live.com/calendar/0/addfromweb?');
    expect(url).toContain(`url=${encodeURIComponent(feedUrl('academy'))}`);
    expect(url).toContain(`name=${encodeURIComponent('DIDC — Academy')}`);
  });

  it('does not send webcal, which outlook.com will not fetch', () => {
    expect(outlookSubscribeUrl('academy', 'DIDC')).not.toContain('webcal');
  });
});
