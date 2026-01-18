/**
 * Google Calendar OAuth Service
 * Handles authentication and calendar sync with Google Calendar API
 */

// Google OAuth configuration
const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || '';
const GOOGLE_REDIRECT_URI = process.env.REACT_APP_GOOGLE_REDIRECT_URI ||
  (window.location.origin + '/auth/callback');

// Google Calendar API scopes
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
];

// Token storage keys
const TOKEN_STORAGE_KEY = 'google_calendar_tokens';
const USER_INFO_KEY = 'google_user_info';

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  token_type: string;
}

export interface GoogleUserInfo {
  email: string;
  name: string;
  picture?: string;
}

export interface GoogleCalendarEvent {
  id?: string;
  summary: string;
  description?: string;
  location?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  attendees?: Array<{ email: string }>;
  reminders?: {
    useDefault: boolean;
    overrides?: Array<{ method: string; minutes: number }>;
  };
}

/**
 * Generate the Google OAuth authorization URL
 */
export const getAuthUrl = (): string => {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
};

/**
 * Start the OAuth flow by opening the authorization URL
 */
export const initiateGoogleAuth = (): void => {
  const authUrl = getAuthUrl();
  window.location.href = authUrl;
};

/**
 * Exchange authorization code for tokens
 * Note: In a production app, this should be done server-side
 */
export const exchangeCodeForTokens = async (code: string): Promise<GoogleTokens | null> => {
  try {
    // For client-side apps, we use the implicit flow or a backend proxy
    // This is a simplified version - in production, use a backend server
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: process.env.REACT_APP_GOOGLE_CLIENT_SECRET || '',
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    if (!response.ok) {
      console.error('Failed to exchange code for tokens');
      return null;
    }

    const data = await response.json();
    const tokens: GoogleTokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in * 1000),
      token_type: data.token_type,
    };

    // Store tokens
    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokens));

    return tokens;
  } catch (error) {
    console.error('Error exchanging code for tokens:', error);
    return null;
  }
};

/**
 * Get stored tokens
 */
export const getStoredTokens = (): GoogleTokens | null => {
  const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (!stored) return null;

  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
};

/**
 * Check if the user is authenticated with Google
 */
export const isGoogleAuthenticated = (): boolean => {
  const tokens = getStoredTokens();
  if (!tokens) return false;

  // Check if token is expired
  return tokens.expires_at > Date.now();
};

/**
 * Refresh access token using refresh token
 */
export const refreshAccessToken = async (): Promise<GoogleTokens | null> => {
  const tokens = getStoredTokens();
  if (!tokens?.refresh_token) return null;

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: process.env.REACT_APP_GOOGLE_CLIENT_SECRET || '',
        refresh_token: tokens.refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      console.error('Failed to refresh token');
      return null;
    }

    const data = await response.json();
    const newTokens: GoogleTokens = {
      access_token: data.access_token,
      refresh_token: tokens.refresh_token, // Keep the old refresh token
      expires_at: Date.now() + (data.expires_in * 1000),
      token_type: data.token_type,
    };

    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(newTokens));
    return newTokens;
  } catch (error) {
    console.error('Error refreshing token:', error);
    return null;
  }
};

/**
 * Get valid access token (refresh if needed)
 */
export const getValidAccessToken = async (): Promise<string | null> => {
  let tokens = getStoredTokens();
  if (!tokens) return null;

  // Refresh if token is expired or about to expire (within 5 minutes)
  if (tokens.expires_at < Date.now() + 5 * 60 * 1000) {
    tokens = await refreshAccessToken();
    if (!tokens) return null;
  }

  return tokens.access_token;
};

/**
 * Disconnect Google Calendar (logout)
 */
export const disconnectGoogleCalendar = (): void => {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(USER_INFO_KEY);
};

/**
 * Get Google user info
 */
export const getGoogleUserInfo = async (): Promise<GoogleUserInfo | null> => {
  // Check cache first
  const cached = localStorage.getItem(USER_INFO_KEY);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {
      // Continue to fetch
    }
  }

  const accessToken = await getValidAccessToken();
  if (!accessToken) return null;

  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) return null;

    const data = await response.json();
    const userInfo: GoogleUserInfo = {
      email: data.email,
      name: data.name,
      picture: data.picture,
    };

    localStorage.setItem(USER_INFO_KEY, JSON.stringify(userInfo));
    return userInfo;
  } catch (error) {
    console.error('Error fetching user info:', error);
    return null;
  }
};

/**
 * List calendars
 */
export const listCalendars = async (): Promise<any[]> => {
  const accessToken = await getValidAccessToken();
  if (!accessToken) return [];

  try {
    const response = await fetch(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) return [];

    const data = await response.json();
    return data.items || [];
  } catch (error) {
    console.error('Error listing calendars:', error);
    return [];
  }
};

/**
 * Create event in Google Calendar
 */
export const createGoogleCalendarEvent = async (
  event: GoogleCalendarEvent,
  calendarId: string = 'primary'
): Promise<GoogleCalendarEvent | null> => {
  const accessToken = await getValidAccessToken();
  if (!accessToken) return null;

  try {
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      }
    );

    if (!response.ok) {
      console.error('Failed to create event');
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Error creating event:', error);
    return null;
  }
};

/**
 * Update event in Google Calendar
 */
export const updateGoogleCalendarEvent = async (
  eventId: string,
  event: GoogleCalendarEvent,
  calendarId: string = 'primary'
): Promise<GoogleCalendarEvent | null> => {
  const accessToken = await getValidAccessToken();
  if (!accessToken) return null;

  try {
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      }
    );

    if (!response.ok) {
      console.error('Failed to update event');
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Error updating event:', error);
    return null;
  }
};

/**
 * Delete event from Google Calendar
 */
export const deleteGoogleCalendarEvent = async (
  eventId: string,
  calendarId: string = 'primary'
): Promise<boolean> => {
  const accessToken = await getValidAccessToken();
  if (!accessToken) return false;

  try {
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    return response.ok || response.status === 204;
  } catch (error) {
    console.error('Error deleting event:', error);
    return false;
  }
};

/**
 * List events from Google Calendar
 */
export const listGoogleCalendarEvents = async (
  calendarId: string = 'primary',
  timeMin?: string,
  timeMax?: string,
  maxResults: number = 100
): Promise<GoogleCalendarEvent[]> => {
  const accessToken = await getValidAccessToken();
  if (!accessToken) return [];

  try {
    const params = new URLSearchParams({
      maxResults: maxResults.toString(),
      orderBy: 'startTime',
      singleEvents: 'true',
    });

    if (timeMin) params.set('timeMin', timeMin);
    if (timeMax) params.set('timeMax', timeMax);

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?${params}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) return [];

    const data = await response.json();
    return data.items || [];
  } catch (error) {
    console.error('Error listing events:', error);
    return [];
  }
};

/**
 * Convert SOP App event to Google Calendar event format
 */
export const convertToGoogleEvent = (
  event: {
    title: string;
    description?: string;
    location?: string;
    startDate: string;
    startTime?: string;
    endDate?: string;
    endTime?: string;
    isAllDay?: boolean;
  }
): GoogleCalendarEvent => {
  const googleEvent: GoogleCalendarEvent = {
    summary: event.title,
    description: event.description,
    location: event.location,
    start: {},
    end: {},
  };

  if (event.isAllDay || !event.startTime) {
    // All-day event
    googleEvent.start = { date: event.startDate };
    googleEvent.end = { date: event.endDate || event.startDate };
  } else {
    // Timed event
    const startDateTime = `${event.startDate}T${event.startTime}:00`;
    googleEvent.start = { dateTime: startDateTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };

    if (event.endTime) {
      const endDateTime = `${event.endDate || event.startDate}T${event.endTime}:00`;
      googleEvent.end = { dateTime: endDateTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
    } else {
      // Default to 1 hour duration
      const start = new Date(startDateTime);
      start.setHours(start.getHours() + 1);
      googleEvent.end = { dateTime: start.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
    }
  }

  return googleEvent;
};
