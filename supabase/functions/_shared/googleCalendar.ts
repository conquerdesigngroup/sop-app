// =============================================================================
// _shared/googleCalendar — reading a calendar through the API, not the feed
// =============================================================================
//
// WHY NOT THE iCal FEED ANY MORE  (v21)
//
// v16 and v17 moved both calendars onto Google's secret iCal addresses, on the
// reasoning that a feed is just a URL and needs no credentials. That was true
// and it worked, but it caps how fresh a calendar can ever be:
//
//   - Google rate-limits those feeds hard. Measured on 27 Aug 2026: fetching
//     the same feed twice inside about twenty minutes reliably returns HTTP
//     429, and one scheduled run in five was rejected outright. Polling faster
//     to get fresher data is exactly what makes it fail more.
//   - A feed is the whole calendar, re-downloaded and re-parsed every time.
//   - There is no way for Google to tell us something changed. Only asking.
//
// The API has none of those limits, and — the reason this exists — supports
// events.watch, so Google can call US the moment something moves instead of us
// asking every half hour and hoping.
//
// The credential is already here: the studio account connected for the staff
// editor holds the `calendar.events` scope, which covers reading and watching,
// not just the writing it was connected for.
//
// WHAT DELIBERATELY DOES NOT CHANGE
//
// The identifier. Rows are keyed on google_event_id, which held the iCal UID,
// and the API returns exactly that as `iCalUID` — so swapping the reader
// renumbers nothing. All 34 portal rows and all 62 staff rows carry a
// '<id>@google.com' UID today and keep it. With singleEvents on, Google gives
// each occurrence of a recurring event its own iCalUID as well, which is what
// the feed path was synthesising by hand as `${uid}::${time}`.
//
// The RPC payloads are untouched too, so nothing here needs a migration.
// =============================================================================

export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CAL_API = 'https://www.googleapis.com/calendar/v3/calendars';

export interface TokenOk {
  token: string;
  error?: undefined;
}
export interface TokenFailed {
  token?: undefined;
  error: string;
  reason: string;
}

/**
 * Trade the stored refresh token for an access token.
 *
 * A failure is recorded on google_credentials rather than only returned, so
 * the Calendar page's banner can say "reconnect" instead of every sync from
 * now on failing with the same opaque message and nobody knowing why.
 */
export const getAccessToken = async (
  admin: any,
  clientId: string,
  clientSecret: string
): Promise<TokenOk | TokenFailed> => {
  const { data: cred } = await admin
    .from('google_credentials')
    .select('refresh_token')
    .eq('id', 'calendar')
    .maybeSingle();

  if (!cred?.refresh_token) {
    return {
      error: 'Google is not connected. Connect the studio account on the Calendar page.',
      reason: 'not_connected',
    };
  }

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: cred.refresh_token,
    }).toString(),
  });
  const payload = await res.json().catch(() => null);

  if (!res.ok || !payload?.access_token) {
    // invalid_grant means the studio revoked the app or changed that account's
    // password. Anything else is worth showing verbatim.
    const reason = payload?.error ?? 'token_refresh_failed';
    await admin
      .from('google_credentials')
      .update({ last_error: reason, updated_at: new Date().toISOString() })
      .eq('id', 'calendar');
    return {
      error:
        reason === 'invalid_grant'
          ? 'The Google connection was revoked. Reconnect the studio account on the Calendar page.'
          : `Google refused the stored connection: ${reason}`,
      reason,
    };
  }

  return { token: payload.access_token as string };
};

const PAGE_SIZE = 2500;
// A year of a studio calendar is a few hundred events, so this is a runaway
// guard rather than a real limit.
const MAX_PAGES = 20;

/**
 * Every event in a window, recurrence already expanded by Google.
 *
 * Throws rather than returning a partial list. That is the important part: the
 * sync prunes anything it did not see inside the window, so half a calendar
 * would be read as "the rest were deleted" and would take a season of real
 * events with it. A failed sync leaves last_success_at alone and retries in
 * thirty minutes; a truncated one quietly destroys data.
 */
export const listEvents = async (
  token: string,
  calendarId: string,
  timeMin: Date,
  timeMax: Date
): Promise<{ items: any[]; timeZone: string | null }> => {
  const items: any[] = [];
  // The calendar's own zone, which the response carries on every page. This is
  // what X-WR-TIMEZONE was in the feed, and the staff calendar needs it to
  // split an instant into the studio's wall-clock date and time.
  let timeZone: string | null = null;
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const qs = new URLSearchParams({
      // Google expands the recurrence for us. This is the whole reason the feed
      // path needed an iterator, an EXDATE dance and a 2000-occurrence guard.
      singleEvents: 'true',
      orderBy: 'startTime',
      // Cancelled events are simply absent, and absence is already how the
      // sync prunes. Asking for them would mean handling two ways to say gone.
      showDeleted: 'false',
      maxResults: String(PAGE_SIZE),
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
    });
    if (pageToken) qs.set('pageToken', pageToken);

    const res = await fetch(
      `${CAL_API}/${encodeURIComponent(calendarId)}/events?${qs.toString()}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 200);
      if (res.status === 404) {
        throw new Error(
          'Google has no calendar with that id, or the connected account cannot see it. Check the calendar id, and that it is shared with the connected Google account.'
        );
      }
      if (res.status === 401 || res.status === 403) {
        throw new Error(
          `Google refused access to this calendar (HTTP ${res.status}). ${detail}`
        );
      }
      throw new Error(`Google Calendar API returned HTTP ${res.status}. ${detail}`);
    }

    const payload = await res.json();
    if (payload.timeZone) timeZone = String(payload.timeZone);
    items.push(...(payload.items ?? []));
    pageToken = payload.nextPageToken;
    if (!pageToken) return { items, timeZone };
  }

  throw new Error(
    `That calendar returned more than ${MAX_PAGES * PAGE_SIZE} events in the window. Refusing to sync a partial list, which would prune everything not read.`
  );
};

/** 'YYYY-MM-DD' plus whole days, with no timezone anywhere near it. */
export const shiftDate = (date: string, days: number): string => {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
};

/**
 * Google descriptions may contain HTML. Both calendars render event text as
 * escaped plain text, so tags left in would show literally — a class note
 * reading `<b>Bring shoes</b>` on the page.
 */
export const toPlainText = (html: string | undefined | null): string => {
  if (!html) return '';
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};
