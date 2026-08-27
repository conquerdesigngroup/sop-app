import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { CalendarEvent, CalendarSource } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

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
 * NO WRITE METHODS, ON PURPOSE
 *
 * There is no addEvent/updateEvent/deleteEvent here any more. A write would be
 * silently reverted by the next sync — the prune deletes any 'google' row the
 * feed no longer contains — so offering one would be offering a button that
 * quietly does nothing. Events are created in Google Calendar.
 *
 * The three legacy 'manual' rows from the old build are still read and still
 * shown. They are from May and long past; deleting a colleague's data to tidy a
 * migration is not a trade worth making.
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
}

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
});

const mapSource = (row: any): CalendarSource => ({
  id: row.id,
  googleCalendarId: row.google_calendar_id,
  label: row.label,
  slug: row.slug,
  color: row.color,
  sortOrder: row.sort_order ?? 0,
  isEnabled: Boolean(row.is_enabled),
  lastSuccessAt: row.last_success_at ?? null,
  lastStatus: row.last_status ?? null,
  lastMessage: row.last_message ?? null,
});

export const EventProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
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
        supabase.from('calendar_sources').select('*').order('sort_order', { ascending: true }),
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
