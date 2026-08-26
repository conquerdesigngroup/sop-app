import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  PortalProgram,
  PortalClass,
  PortalUpdate,
  PortalEvent,
  PortalDocument,
} from '../types';
import {
  ProgramSlug,
  hasPortalAccess,
  grantPortalAccess,
  revokePortalAccess,
} from '../lib/portal';
// Shared with PortalAdminContext, which reads the same tables as a signed-in
// author. One mapper per table, so the two sides cannot drift.
import {
  mapProgram,
  mapClass,
  mapUpdate,
  mapEvent,
  mapDocument,
} from '../lib/portalMappers';

/**
 * Data for the parent portal.
 *
 * Mounted around /portal routes (see App.tsx) rather than at the app root, so
 * the portal owns its own fetching and nothing here runs for staff pages.
 *
 * WHAT A PARENT'S DEVICE ACTUALLY REQUESTS
 *
 * Mounting this narrowly does not, on its own, stop the staff contexts from
 * firing: DataProvider sits above the Router in App.tsx, so its children mount
 * regardless of route. That used to cost a parent 13 Supabase requests per cold
 * load, 6 of them to staff tables RLS returns nothing for, plus two failures.
 *
 * WorkHoursContext now short-circuits its load and its realtime subscription
 * when there is no session, which closed the bulk of it. Measured in production
 * on /portal/:program:
 *
 *     3 requests — portal_programs, portal_updates, portal_events
 *     0 staff-table requests
 *     0 failures
 *
 * If that number climbs again, the cause is a staff context fetching on mount
 * without a session guard; AuthProvider is above DataProvider, so any of them
 * can check first.
 *
 * Every read here goes through the `anon` role. The portal_* tables are the only
 * ones that permit it, and only for published rows — so nothing in this file
 * filters for access-control reasons. The filtering that IS here is for
 * ordering and grouping.
 */

interface PortalContextValue {
  programs: PortalProgram[];
  loading: boolean;
  error: string | null;
  getProgramBySlug: (slug: string) => PortalProgram | undefined;

  /** Has this device cleared the access code for this program? */
  hasAccess: (slug: ProgramSlug) => boolean;
  /** Verify a code against the database. Returns true on success and records it. */
  verifyCode: (slug: ProgramSlug, code: string) => Promise<boolean>;
  forgetAccess: (slug: ProgramSlug) => void;

  fetchClasses: (programId: string) => Promise<PortalClass[]>;
  fetchUpdates: (programId: string, classId?: string | null) => Promise<PortalUpdate[]>;
  fetchEvents: (programId: string) => Promise<PortalEvent[]>;
  fetchDocuments: (programId: string, classId?: string | null) => Promise<PortalDocument[]>;
  /** Short-lived signed URL for a document in the private bucket. */
  getDocumentUrl: (storagePath: string) => Promise<string | null>;
}

const PortalContext = createContext<PortalContextValue | undefined>(undefined);

export const usePortal = () => {
  const ctx = useContext(PortalContext);
  if (!ctx) throw new Error('usePortal must be used within a PortalProvider');
  return ctx;
};

// ------------------------------------------------------------- provider

export const PortalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [programs, setPrograms] = useState<PortalProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Bumped by verifyCode so components re-read hasAccess, which is backed by
  // localStorage rather than state and would not otherwise trigger a render.
  const [accessVersion, setAccessVersion] = useState(0);

  const loadPrograms = useCallback(async () => {
    if (!isSupabaseConfigured() || !supabase) {
      setError('The portal is not available right now.');
      setLoading(false);
      return;
    }

    try {
      const { data, error: err } = await supabase
        .from('portal_programs')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (err) throw err;
      setPrograms((data ?? []).map(mapProgram));
      setError(null);
    } catch (e: any) {
      console.error('Failed to load portal programs:', e);
      setError('Could not load the portal. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPrograms();
  }, [loadPrograms]);

  const getProgramBySlug = useCallback(
    (slug: string) => programs.find(p => p.slug === slug),
    [programs]
  );

  // ------------------------------------------------------------ access

  const hasAccess = useCallback(
    (slug: ProgramSlug) => {
      const program = programs.find(p => p.slug === slug);
      // A program that does not require a code is open to everyone. While the
      // list is still loading, program is undefined and this returns the stored
      // flag — the gate shows a spinner until loading finishes, so an
      // ungated program is never briefly gated.
      if (program && !program.requiresCode) return true;
      return hasPortalAccess(slug);
    },
    // accessVersion is a deliberate dependency: it is how a successful
    // verifyCode propagates to components reading this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [programs, accessVersion]
  );

  /**
   * Check a code against verify_portal_code().
   *
   * The comparison happens inside Postgres against a bcrypt hash that has no
   * grants and no RLS policy, so the hash is never sent to the browser and the
   * browser never learns anything but true/false.
   */
  const verifyCode = useCallback(async (slug: ProgramSlug, code: string) => {
    if (!isSupabaseConfigured() || !supabase) return false;

    try {
      const { data, error: err } = await supabase.rpc('verify_portal_code', {
        p_slug: slug,
        p_code: code,
      });

      if (err) {
        console.error('verify_portal_code failed:', err);
        return false;
      }

      if (data === true) {
        grantPortalAccess(slug);
        setAccessVersion(v => v + 1);
        return true;
      }
      return false;
    } catch (e) {
      console.error('verify_portal_code threw:', e);
      return false;
    }
  }, []);

  const forgetAccess = useCallback((slug: ProgramSlug) => {
    revokePortalAccess(slug);
    setAccessVersion(v => v + 1);
  }, []);

  // ----------------------------------------------------------- content

  const fetchClasses = useCallback(async (programId: string) => {
    const { data, error: err } = await supabase
      .from('portal_classes')
      .select('*')
      .eq('program_id', programId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('day_of_week', { ascending: true, nullsFirst: false })
      .order('start_time', { ascending: true, nullsFirst: false });

    if (err) throw err;
    return (data ?? []).map(mapClass);
  }, []);

  const fetchUpdates = useCallback(
    async (programId: string, classId?: string | null) => {
      let query = supabase
        .from('portal_updates')
        .select('*')
        .eq('program_id', programId)
        .eq('is_published', true);

      // undefined = everything for the program; null = program-wide only;
      // a string = that class only.
      if (classId === null) query = query.is('class_id', null);
      else if (typeof classId === 'string') query = query.eq('class_id', classId);

      const { data, error: err } = await query
        .order('is_pinned', { ascending: false })
        .order('published_at', { ascending: false, nullsFirst: false });

      if (err) throw err;
      return (data ?? []).map(mapUpdate);
    },
    []
  );

  const fetchEvents = useCallback(async (programId: string) => {
    // A month back so a calendar opened on the 1st still shows the tail of the
    // previous month; a year forward covers a full competition season.
    const from = new Date();
    from.setMonth(from.getMonth() - 1);
    const to = new Date();
    to.setFullYear(to.getFullYear() + 1);

    const { data, error: err } = await supabase
      .from('portal_events')
      .select('*')
      .eq('program_id', programId)
      .eq('is_published', true)
      .gte('starts_at', from.toISOString())
      .lte('starts_at', to.toISOString())
      .order('starts_at', { ascending: true });

    if (err) throw err;
    return (data ?? []).map(mapEvent);
  }, []);

  /**
   * `classId` mirrors fetchUpdates: omitted means every file in the program,
   * null means studio-wide only, a string means that one class. Undefined and
   * null are deliberately different here — `.is('class_id', null)` and no filter
   * at all are not the same query.
   */
  const fetchDocuments = useCallback(async (programId: string, classId?: string | null) => {
    let query = supabase
      .from('portal_documents')
      .select('*')
      .eq('program_id', programId)
      .eq('is_published', true);

    if (classId === null) query = query.is('class_id', null);
    else if (typeof classId === 'string') query = query.eq('class_id', classId);

    const { data, error: err } = await query
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (err) throw err;
    return (data ?? []).map(mapDocument);
  }, []);

  /**
   * Sign a URL for a document.
   *
   * The bucket is private, so there is no public URL to link to. One hour is
   * long enough to open or download and short enough that a copied link does
   * not become a permanent handle on the file.
   */
  const getDocumentUrl = useCallback(async (storagePath: string) => {
    try {
      const { data, error: err } = await supabase.storage
        .from('portal-documents')
        .createSignedUrl(storagePath, 60 * 60);

      if (err) throw err;
      return data?.signedUrl ?? null;
    } catch (e) {
      console.error('Could not sign document URL:', e);
      return null;
    }
  }, []);

  const value = useMemo<PortalContextValue>(
    () => ({
      programs,
      loading,
      error,
      getProgramBySlug,
      hasAccess,
      verifyCode,
      forgetAccess,
      fetchClasses,
      fetchUpdates,
      fetchEvents,
      fetchDocuments,
      getDocumentUrl,
    }),
    [
      programs, loading, error, getProgramBySlug, hasAccess, verifyCode,
      forgetAccess, fetchClasses, fetchUpdates, fetchEvents, fetchDocuments,
      getDocumentUrl,
    ]
  );

  return <PortalContext.Provider value={value}>{children}</PortalContext.Provider>;
};
