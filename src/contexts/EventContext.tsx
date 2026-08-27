import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { CalendarEvent, CalendarSource } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { buildEventPayload } from '../lib/googleEventMap';

/**
 * The staff Calendar, as a read-only mirror of Google.
 *
 * WHAT CHANGED AND WHY
 *
 * This context used to keep every event in localStorage and never spoke to
 * Supabase at all. That meant each person had their own private calendar:
 * nothing was shared between staff, nothing survived moving to another device,
 * and clearing site data wiped it. It looked like a shared calendar and was
 * not one, which is the worst version of that to have.
 *
 * It is now a subscription. Three Google calendars under one studio account are
 * mirrored into calendar_events by the staff-calendar-sync Edge Function, and
 * this reads them. Google is the source of truth.
 *
 * WRITES CAME BACK IN v19, GOING THE OTHER WAY
 *
 * For a while there were no write methods here at all, and that was right: a
 * row written straight to calendar_events is silently reverted by the next
 * sync, because the prune deletes any 'google' row the feed no longer
 * contains. A save button doing that is a button that quietly does nothing.
 *
 * saveEvent and removeEvent do not write the table. They go through the
 * staff-calendar-push Edge Function, which writes to GOOGLE first and only
 * records the row once Google has accepted it. So the sync and the editor
 * agree, because both take Google's word.
 *
 * Only admins and super admins get this far — the function refuses anyone
 * else, and the Calendar page hides the controls. Both, deliberately: a
 * hidden button is a courtesy, and the function is the actual boundary.
 *
 * The three legacy 'manual' rows from the old build are still read and still
 * shown. They are from May and long past; deleting a colleague's data to tidy a
 * migration is not a trade worth making. They have no google_event_id, so the
 * editor leaves them alone.
 */

interface EventContextType {
  events: CalendarEvent[];
  /** The subscribed calendars, in sort order. Drives the legend and filter. */
  sources: CalendarSource[];
  /** The calendar an event came from, or undefined for a legacy manual row. */
  getSourceFor: (event: CalendarEvent) => CalendarSource | undefined;
  /** The colour to draw an event in. Falls back to the row's own colour. */
  colorFor: (event: CalendarEvent) => string;
  getEventById: (id: string) => CalendarEvent | undefined;
  getEventsByDate: (date: string) => CalendarEvent[];
  getEventsByDateRange: (startDate: string, endDate: string) => CalendarEvent[];
  loading: boolean;
  error: string | null;
  /** Re-read what is already in the database. Cheap; does not call Google. */
  refresh: () => Promise<void>;
  /**
   * Pull from Google now, then re-read.
   *
   * Super admins only — the Edge Function and staff_sync_google_events() both
   * refuse anyone else. There is no pg_cron in this project yet, so until one
   * exists this is the only thing that makes a pull happen; the calendar would
   * otherwise show whatever the last manual sync left behind.
   */
  syncNow: () => Promise<SyncRunResult[]>;

  // ------------------------------------------------------------- writing
  /**
   * Create or update in Google, then record the row. Admins only.
   *
   * Resolves to a warning when Google accepted the change but the app copy did
   * not follow — a half-completed save the caller must not report as a plain
   * success. Null when everything landed.
   */
  saveEvent: (draft: EventDraft, existing?: CalendarEvent) => Promise<string | null>;
  /** Delete from Google, then drop the row. Admins only. Same warning contract. */
  removeEvent: (event: CalendarEvent) => Promise<string | null>;

  // -------------------------------------------------- the Google connection
  googleConnection: GoogleConnection;
  refreshGoogleStatus: () => Promise<void>;
  /** Returns the URL to send the admin to; the caller navigates. */
  beginGoogleConnect: () => Promise<string>;
  disconnectGoogle: () => Promise<void>;
}

/** What the editor collects. Mirrors calendar_events' own shape. */
export interface EventDraft {
  /** Which of the studio's three Google calendars this belongs on. */
  calendarId: string;
  title: string;
  description: string;
  location: string;
  startDate: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  isAllDay: boolean;
}

export interface GoogleStatus {
  connected: boolean;
  email: string | null;
  connectedAt: string | null;
  lastUsedAt: string | null;
  /** Set when Google last refused the stored token — usually a revoked grant. */
  lastError: string | null;
}

/**
 * Four states, because collapsing them hid a real failure.
 *
 * This was `GoogleStatus | null`, and every failure set null — which the
 * banner rendered as nothing at all. An admin whose status call failed saw no
 * Connect button, went looking for one elsewhere, and found the old per-user
 * flow on Settings, which could not work from production. The invisible error
 * was what sent them there.
 *
 * 'forbidden' is the only one that should render nothing: a team member does
 * not manage this and does not need telling.
 */
export type GoogleConnection =
  | { state: 'loading' }
  | { state: 'forbidden' }
  | { state: 'failed'; message: string }
  | { state: 'ready'; status: GoogleStatus };

/** One entry per calendar, whether it succeeded or not. */
export interface SyncRunResult {
  calendar?: string;
  fetched?: number;
  upserted?: number;
  removed?: number;
  error?: string;
}

const EventContext = createContext<EventContextType | undefined>(undefined);

/** Colour for a manual row that has none — matches theme.colors.status.info. */
const FALLBACK_COLOR = '#3B82F6';

const mapEvent = (row: any): CalendarEvent => ({
  id: row.id,
  title: row.title ?? '',
  description: row.description ?? '',
  startDate: row.start_date,
  startTime: row.start_time ?? undefined,
  endDate: row.end_date ?? undefined,
  endTime: row.end_time ?? undefined,
  location: row.location ?? undefined,
  isAllDay: Boolean(row.is_all_day),
  color: row.color ?? FALLBACK_COLOR,
  attendees: row.attendees ?? [],
  reminders: row.reminders ?? undefined,
  isRecurring: Boolean(row.is_recurring),
  recurrencePattern: row.recurrence_pattern ?? undefined,
  notes: row.notes ?? undefined,
  tags: row.tags ?? undefined,
  createdBy: row.created_by ?? '',
  createdAt: row.created_at,
  updatedAt: row.updated_at ?? undefined,
  source: row.source ?? 'manual',
  googleCalendarId: row.google_calendar_id ?? undefined,
  googleEventId: row.google_event_id ?? undefined,
  googleApiEventId: row.google_api_event_id ?? undefined,
});

const mapSource = (row: any): CalendarSource => ({
  id: row.id,
  googleCalendarId: row.google_calendar_id,
  label: row.label,
  slug: row.slug,
  color: row.color,
  sortOrder: row.sort_order ?? 0,
  isEnabled: Boolean(row.is_enabled),
  // Defaulted rather than left undefined: a missing zone would send a timed
  // event to Google with no timeZone, which it reads as the calendar's
  // default and silently moves the class.
  timeZone: row.time_zone || 'America/Los_Angeles',
  lastSuccessAt: row.last_success_at ?? null,
  lastStatus: row.last_status ?? null,
  lastMessage: row.last_message ?? null,
});

export const EventProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [googleConnection, setGoogleConnection] = useState<GoogleConnection>({ state: 'loading' });
  const [sources, setSources] = useState<CalendarSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured() || !supabase) {
      setLoading(false);
      setError('The calendar needs a database connection.');
      return;
    }

    setLoading(true);
    try {
      // Both in flight together: neither is large and the page cannot draw an
      // event without knowing which calendar's colour it takes.
      const [eventsRes, sourcesRes] = await Promise.all([
        supabase.from('calendar_events').select('*').order('start_date', { ascending: true }),
        // Named columns, not '*'. calendar_sources.ics_url can hold a SECRET
        // feed address — v16 tells operators to paste one there to keep a
        // calendar private — and its RLS policy is USING (true), so '*' handed
        // that credential to every signed-in employee. mapSource never read it.
        supabase.from('calendar_sources')
          .select('id, google_calendar_id, label, slug, color, sort_order, is_enabled, time_zone, last_success_at, last_status, last_message')
          .order('sort_order', { ascending: true }),
      ]);

      if (eventsRes.error) throw eventsRes.error;
      if (sourcesRes.error) throw sourcesRes.error;

      setEvents((eventsRes.data ?? []).map(mapEvent));
      setSources((sourcesRes.data ?? []).map(mapSource));
      setError(null);
    } catch (e: any) {
      console.error('Could not load the calendar:', e);
      // Deliberately not falling back to a cached or empty calendar without
      // saying so. A calendar that silently shows nothing reads as "no events
      // today", which is a different and much worse message than "this failed".
      setError(e?.message || 'Could not load the calendar.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const syncNow = useCallback(async (): Promise<SyncRunResult[]> => {
    if (!isSupabaseConfigured() || !supabase) return [];
    const { data, error: fnError } = await supabase.functions.invoke('staff-calendar-sync', {
      body: { source: 'manual' },
    });
    // invoke surfaces a non-2xx as an error whose BODY holds the real message;
    // dig it out so the user sees "GOOGLE_SERVICE_ACCOUNT_JSON is not set"
    // rather than "Edge Function returned a non-2xx status code". The function
    // answers 200 with per-calendar outcomes even when one calendar failed, so
    // a partial run lands in `data`, not here.
    if (fnError) {
      let message = fnError.message || 'The calendar sync failed.';
      try {
        const body = await (fnError as any).context?.json?.();
        if (body?.error) message = body.error;
      } catch {
        /* keep the generic message */
      }
      throw new Error(message);
    }
    await load();
    return (data?.synced ?? []) as SyncRunResult[];
  }, [load]);

  // ---------------------------------------------------------------- writing

  /**
   * Dig the real message out of a failed function call.
   *
   * supabase.functions.invoke reports any non-2xx as "Edge Function returned a
   * non-2xx status code" and puts the actual sentence in the response body.
   * Showing the wrapper instead of the body is how "That is not one of the
   * studio calendars" becomes an unactionable shrug.
   */
  const invokeOrThrow = useCallback(async (name: string, body: unknown) => {
    if (!isSupabaseConfigured() || !supabase) {
      throw new Error('The app is not connected to its database.');
    }
    const { data, error: fnError } = await supabase.functions.invoke(name, { body });
    if (fnError) {
      let message = fnError.message || 'That did not work.';
      try {
        const payload = await (fnError as any).context?.json?.();
        if (payload?.error) {
          message = payload.description
            ? `${payload.error} ${payload.description}`
            : payload.error;
        }
      } catch {
        /* keep the generic message */
      }
      // The HTTP status rides along: 403 means "not your job" and should be
      // silent, anything else is a fault worth surfacing. Without it the two
      // are indistinguishable and both end up hidden.
      const err = new Error(message) as Error & { status?: number };
      err.status = (fnError as any).context?.status;
      throw err;
    }
    return data;
  }, []);

  const saveEvent = useCallback(async (draft: EventDraft, existing?: CalendarEvent) => {
    const source = sources.find(c => c.googleCalendarId === draft.calendarId);
    if (!source) throw new Error('Pick which calendar this belongs on.');

    // Both shapes from one normalisation. They used to be built separately —
    // this call for Google, a hand-rolled object below for the row — and an
    // audit found three ways they could disagree. The worst put an event on no
    // day at all while reporting success.
    //
    // Throws with a sentence worth showing when the event cannot be
    // represented: an end before its start, or an end date with no end time.
    const { googleEvent, row } = buildEventPayload(draft, source.timeZone);

    const data = await invokeOrThrow('staff-calendar-push', {
      action: existing ? 'update' : 'create',
      calendarId: draft.calendarId,
      eventId: existing?.id,
      googleEventId: existing?.googleEventId,
      // The API id when the row has one. Rows the sync imported do not, and
      // the function strips the UID's suffix for those.
      googleApiEventId: existing?.googleApiEventId,
      googleEvent,
      row,
    });

    await load();
    // Returned rather than console.warn'd. The push deliberately answers 200
    // with a warning when Google took the change but the app copy did not, and
    // swallowing it here meant the studio saw an unqualified green toast for a
    // half-completed save.
    return (data?.warning as string | undefined) ?? null;
  }, [sources, invokeOrThrow, load]);

  const removeEvent = useCallback(async (event: CalendarEvent) => {
    if (!event.googleEventId || !event.googleCalendarId) {
      // A legacy 'manual' row from the old localStorage build. It exists in no
      // Google calendar, so there is nothing to delete there and the editor
      // does not offer to.
      throw new Error('That event is not in Google Calendar, so it cannot be changed here.');
    }
    const data = await invokeOrThrow('staff-calendar-push', {
      action: 'delete',
      calendarId: event.googleCalendarId,
      eventId: event.id,
      googleEventId: event.googleEventId,
      googleApiEventId: event.googleApiEventId,
    });
    await load();
    return (data?.warning as string | undefined) ?? null;
  }, [invokeOrThrow, load]);

  // ------------------------------------------------------ Google connection

  const refreshGoogleStatus = useCallback(async () => {
    try {
      const data = await invokeOrThrow('google-oauth', { action: 'status' });
      setGoogleConnection({ state: 'ready', status: data as GoogleStatus });
    } catch (e: any) {
      // A team member gets 403 and should see nothing — they do not manage
      // this. Anything else is a real fault, and swallowing it is what left an
      // admin with no Connect button and no reason why.
      setGoogleConnection(
        e?.status === 403
          ? { state: 'forbidden' }
          : { state: 'failed', message: e?.message || 'Could not check the Google connection.' }
      );
    }
  }, [invokeOrThrow]);

  const beginGoogleConnect = useCallback(async () => {
    // Minted here, kept in sessionStorage, and checked by AuthCallback against
    // what Google hands back. It is what stops a code from somebody else's
    // OAuth flow being walked into our callback and exchanged as though the
    // studio had just consented.
    //
    // randomUUID needs a secure context, which production and localhost both
    // are. The fallback exists so a stray http:// origin degrades to the old
    // behaviour rather than throwing where the connect button used to work.
    let state = '';
    try {
      state = crypto.randomUUID().replace(/-/g, '');
      sessionStorage.setItem('didc_google_state', state);
    } catch {
      state = '';
    }

    const data = await invokeOrThrow('google-oauth', {
      action: 'auth_url',
      redirectUri: `${window.location.origin}/auth/callback`,
      ...(state ? { state } : {}),
    });
    if (!data?.url) throw new Error('Could not start the Google connection.');
    return data.url as string;
  }, [invokeOrThrow]);

  const disconnectGoogle = useCallback(async () => {
    await invokeOrThrow('google-oauth', { action: 'disconnect' });
    await refreshGoogleStatus();
  }, [invokeOrThrow, refreshGoogleStatus]);

  const sourcesByCalendarId = useMemo(() => {
    const m = new Map<string, CalendarSource>();
    sources.forEach(s => m.set(s.googleCalendarId, s));
    return m;
  }, [sources]);

  const getSourceFor = useCallback(
    (event: CalendarEvent) =>
      event.googleCalendarId ? sourcesByCalendarId.get(event.googleCalendarId) : undefined,
    [sourcesByCalendarId]
  );

  const colorFor = useCallback(
    (event: CalendarEvent) => getSourceFor(event)?.color || event.color || FALLBACK_COLOR,
    [getSourceFor]
  );

  const getEventById = useCallback(
    (id: string) => events.find(e => e.id === id),
    [events]
  );

  const getEventsByDate = useCallback(
    (date: string) => events.filter(e => {
      const end = e.endDate || e.startDate;
      return date >= e.startDate && date <= end;
    }),
    [events]
  );

  const getEventsByDateRange = useCallback(
    (startDate: string, endDate: string) => events.filter(e => {
      const end = e.endDate || e.startDate;
      return end >= startDate && e.startDate <= endDate;
    }),
    [events]
  );

  return (
    <EventContext.Provider value={{
      events, sources, getSourceFor, colorFor,
      getEventById, getEventsByDate, getEventsByDateRange,
      loading, error, refresh: load, syncNow,
      saveEvent, removeEvent,
      googleConnection, refreshGoogleStatus, beginGoogleConnect, disconnectGoogle,
    }}>
      {children}
    </EventContext.Provider>
  );
};

export const useEvent = () => {
  const ctx = useContext(EventContext);
  if (!ctx) throw new Error('useEvent must be used within an EventProvider');
  return ctx;
};
