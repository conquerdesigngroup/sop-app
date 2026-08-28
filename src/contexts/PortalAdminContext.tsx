import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode,
} from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from './AuthContext';
import {
  PortalProgram, PortalClass, PortalClassCategory, PortalUpdate, PortalEvent, PortalDocument,
  PortalProgramSlug, PortalCalendarSource,
} from '../types';
import {
  mapProgram, mapClass, mapUpdate, mapEvent, mapDocument, mapCalendarSource,
} from '../lib/portalMappers';
import { buildStoragePath } from '../lib/portalAdmin';
import { signDocumentUrls, removeStorageObject } from '../lib/portalStorage';

/**
 * Authoring for the parent portal — the staff half of the portal_* tables.
 *
 * WHY THIS IS SEPARATE FROM PortalContext
 *
 * PortalContext reads as `anon`, is mounted only under /portal, and has no
 * write path at all. That is deliberate: it is the code a signed-out parent
 * runs. This context is its opposite — every call here is authenticated, and
 * every one of them is authorised by RLS rather than by anything in this file.
 *
 * They share the row mappers (src/lib/portalMappers.ts) and nothing else.
 *
 * WHAT THIS COSTS A PARENT: NOTHING
 *
 * It is mounted at the app root so the nav can decide whether to show the
 * Portal link, which means it mounts for signed-out visitors too. Every fetch
 * below is behind `isAuthenticated`, so a parent's device issues zero requests
 * from it — the same discipline that got a portal page down to 3 requests, and
 * worth re-measuring if that number ever climbs.
 *
 * WHO MAY WRITE WHAT
 *
 * Not decided here. v9 put it in policies:
 *
 *   admins             — everything, every program
 *   class instructors  — rows whose class_id is a class they hold, and no other
 *
 * `canEdit` and `canEditClass` mirror can_edit_portal() and
 * can_edit_portal_class() so the UI can hide what would be refused, but the
 * refusal itself happens in Postgres. A teacher who forges a request gets a
 * row-level security error, not a published announcement.
 *
 * Note the NULL case: can_edit_portal_class(NULL) is false for anyone who is
 * not an admin, which is what stops a teacher publishing program-wide.
 */

// --------------------------------------------------------------------- inputs

export interface UpdateInput {
  id?: string;
  programId: string;
  classId: string | null;
  title: string;
  body: string;
  isPinned: boolean;
  isPublished: boolean;
  /** Set the first time it is published; never cleared, so it stays stable. */
  publishedAt: string | null;
}

export interface EventInput {
  id?: string;
  programId: string;
  classId: string | null;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string | null;
  isAllDay: boolean;
  location: string | null;
  isPublished: boolean;
}

export interface DocumentInput {
  id?: string;
  programId: string;
  classId: string | null;
  title: string;
  description: string;
  category: string | null;
  sortOrder: number;
  isPublished: boolean;
}

export interface ClassInput {
  id?: string;
  programId: string;
  /** Which schedules list it. See PROGRAM_CLASS_CATEGORIES. */
  category: PortalClassCategory;
  name: string;
  dayOfWeek: number | null;
  startTime: string | null;
  endTime: string | null;
  level: string | null;
  location: string | null;
  description: string;
  instructorName: string | null;
  sortOrder: number;
  isActive: boolean;

  // The catalogue fields an admin would plausibly change. The billing
  // plumbing that came in with the import — registration and costume fee,
  // billing cycle, billing day, registration_opens, source_title — is
  // deliberately absent: it belongs to Enrollio, nobody would maintain it in
  // two places, and saveClass leaves those columns untouched rather than
  // writing NULL over them.
  style: string | null;
  ageGroup: string | null;
  ageMinYears: number | null;
  ageMaxYears: number | null;
  capacity: number | null;
  tuitionFee: number | null;
  season: string | null;
  seasonStart: string | null;
  seasonEnd: string | null;
}

export interface CalendarSourceInput {
  programId: string;
  googleCalendarId: string;
  isEnabled: boolean;
  daysBack: number;
  daysAhead: number;
  publishImported: boolean;
}

export interface SyncRunResult {
  programId: string;
  /** Which of the program's calendars this result is about (v23). */
  calendarId?: string;
  fetched?: number;
  upserted?: number;
  removed?: number;
  error?: string;
}

interface PortalAdminContextValue {
  /** May this account author portal content at all? Drives the nav entry. */
  canEdit: boolean;
  /** True until can_edit_portal() has answered, so nothing flashes. */
  checking: boolean;
  /** Admins hold every class implicitly; this lists only granted ones. */
  editableClassIds: string[];
  canEditClass: (classId: string | null) => boolean;

  programs: PortalProgram[];
  programsLoading: boolean;
  reload: () => Promise<void>;

  fetchClasses: (programId: string) => Promise<PortalClass[]>;
  fetchUpdates: (programId: string) => Promise<PortalUpdate[]>;
  fetchEvents: (programId: string) => Promise<PortalEvent[]>;
  fetchDocuments: (programId: string) => Promise<PortalDocument[]>;

  saveUpdate: (input: UpdateInput) => Promise<void>;
  deleteUpdate: (id: string) => Promise<void>;

  saveEvent: (input: EventInput) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;

  uploadDocument: (
    file: File,
    programSlug: PortalProgramSlug,
    meta: DocumentInput,
    onProgress?: (stage: 'uploading' | 'saving') => void,
  ) => Promise<void>;
  saveDocumentMeta: (input: DocumentInput & { id: string }) => Promise<void>;
  /**
   * Removes the stored file first, then the row. Throws if the file cannot be
   * removed, leaving the row intact so it can be retried.
   */
  deleteDocument: (doc: PortalDocument) => Promise<void>;
  getDocumentUrl: (storagePath: string) => Promise<string | null>;
  /** Batched signing, so a list can show thumbnails without a request each. */
  getDocumentUrls: (storagePaths: string[]) => Promise<Record<string, string>>;

  /** Returns the class id, so a brand-new class can have its grants set. */
  saveClass: (input: ClassInput) => Promise<string>;
  deleteClass: (id: string) => Promise<void>;
  fetchClassInstructors: (classId: string) => Promise<string[]>;
  setClassInstructors: (classId: string, profileIds: string[]) => Promise<void>;

  /** Every calendar feeding this program, oldest first. Empty when none. */
  fetchCalendarSources: (programId: string) => Promise<PortalCalendarSource[]>;
  /**
   * `originalGoogleCalendarId` identifies the row being edited. Omit it to add
   * a calendar; pass it to change one, including changing its id.
   */
  saveCalendarSource: (
    input: CalendarSourceInput,
    originalGoogleCalendarId?: string,
  ) => Promise<void>;
  removeCalendarSource: (programId: string, googleCalendarId: string) => Promise<void>;
  /** Runs the sync now, for every calendar the program reads. */
  runCalendarSync: (programId: string) => Promise<SyncRunResult[]>;

  setRequiresCode: (programId: string, requiresCode: boolean) => Promise<void>;
  setAccessCode: (slug: PortalProgramSlug, code: string) => Promise<void>;
  /** True/false, or null when v11 is not applied yet — the screen degrades. */
  programHasCode: (slug: PortalProgramSlug) => Promise<boolean | null>;
}

const PortalAdminContext = createContext<PortalAdminContextValue | undefined>(undefined);

export const usePortalAdmin = () => {
  const ctx = useContext(PortalAdminContext);
  if (!ctx) throw new Error('usePortalAdmin must be used within a PortalAdminProvider');
  return ctx;
};

/**
 * Turn a PostgREST error into something a teacher can act on.
 *
 * The one that matters is 42501 — an RLS refusal, which in this area almost
 * always means "that class is not yours" rather than anything the person can
 * fix by retrying.
 */
export const describeWriteError = (e: any): string => {
  const code = e?.code;
  const msg: string = e?.message ?? '';
  if (code === '42501' || /row-level security/i.test(msg)) {
    return 'You can only publish to your own classes. Ask an admin if this should be studio-wide.';
  }
  if (code === '23505') return 'That already exists.';
  if (/violates check constraint/i.test(msg)) return 'Something in that form is out of range — check the dates and times.';
  return msg || 'That did not save. Please try again.';
};

export const PortalAdminProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated, currentUser, isAdmin } = useAuth();

  const [canEdit, setCanEdit] = useState(false);
  const [checking, setChecking] = useState(true);
  const [editableClassIds, setEditableClassIds] = useState<string[]>([]);
  const [programs, setPrograms] = useState<PortalProgram[]>([]);
  const [programsLoading, setProgramsLoading] = useState(false);

  const authorId = currentUser?.id ?? null;

  /**
   * Ask the database, rather than inferring from role.
   *
   * An instructor is a plain 'team' member; what makes them an author is a row
   * in portal_class_instructors. Deriving this from `isAdmin` would hide the
   * area from exactly the people it was built for.
   */
  const load = useCallback(async () => {
    if (!isAuthenticated || !isSupabaseConfigured() || !supabase) {
      setCanEdit(false);
      setEditableClassIds([]);
      setPrograms([]);
      setChecking(false);
      return;
    }

    setChecking(true);
    try {
      const [{ data: allowed, error: allowedErr }, { data: grants, error: grantsErr }] =
        await Promise.all([
          supabase.rpc('can_edit_portal'),
          supabase
            .from('portal_class_instructors')
            .select('class_id')
            .eq('profile_id', authorId ?? ''),
        ]);

      if (allowedErr) throw allowedErr;
      if (grantsErr) throw grantsErr;

      setCanEdit(allowed === true);
      setEditableClassIds((grants ?? []).map((g: any) => g.class_id));
    } catch (e) {
      // Fail closed: no portal entry rather than a link into a screen that
      // cannot save anything.
      console.error('Could not determine portal authoring rights:', e);
      setCanEdit(false);
      setEditableClassIds([]);
    } finally {
      setChecking(false);
    }
  }, [isAuthenticated, authorId]);

  useEffect(() => { load(); }, [load]);

  // Programs are only needed once the area is reachable.
  useEffect(() => {
    if (!canEdit || !supabase) return;
    let cancelled = false;
    setProgramsLoading(true);

    (async () => {
      const { data, error } = await supabase
        .from('portal_programs')
        .select('*')
        .order('sort_order', { ascending: true });

      if (cancelled) return;
      if (error) console.error('Could not load portal programs:', error);
      else setPrograms((data ?? []).map(mapProgram));
      setProgramsLoading(false);
    })();

    return () => { cancelled = true; };
  }, [canEdit]);

  const reload = useCallback(async () => {
    await load();
    if (!supabase) return;
    const { data } = await supabase
      .from('portal_programs')
      .select('*')
      .order('sort_order', { ascending: true });
    setPrograms((data ?? []).map(mapProgram));
  }, [load]);

  /** Mirrors can_edit_portal_class(): NULL is admins-only, by design. */
  const canEditClass = useCallback(
    (classId: string | null) =>
      isAdmin || (classId !== null && editableClassIds.includes(classId)),
    [isAdmin, editableClassIds]
  );

  // ------------------------------------------------------------------ reads
  // No is_published filter anywhere here. The staff read policies already
  // return drafts to whoever may edit them, and filtering again in the client
  // would hide a teacher's own unpublished work from them.

  const fetchClasses = useCallback(async (programId: string) => {
    const { data, error } = await supabase
      .from('portal_classes')
      .select('*')
      .eq('program_id', programId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapClass);
  }, []);

  const fetchUpdates = useCallback(async (programId: string) => {
    const { data, error } = await supabase
      .from('portal_updates')
      .select('*')
      .eq('program_id', programId)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapUpdate);
  }, []);

  /**
   * Every event, not the parent view's one-month-back window: staff edit last
   * season's recital as often as next month's, and the table holds tens of
   * rows per program, not thousands.
   */
  const fetchEvents = useCallback(async (programId: string) => {
    const { data, error } = await supabase
      .from('portal_events')
      .select('*')
      .eq('program_id', programId)
      .order('starts_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapEvent);
  }, []);

  const fetchDocuments = useCallback(async (programId: string) => {
    const { data, error } = await supabase
      .from('portal_documents')
      .select('*')
      .eq('program_id', programId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapDocument);
  }, []);

  // ---------------------------------------------------------------- updates

  const saveUpdate = useCallback(async (input: UpdateInput) => {
    const row = {
      program_id: input.programId,
      class_id: input.classId,
      title: input.title.trim(),
      body: input.body,
      is_pinned: input.isPinned,
      is_published: input.isPublished,
      // Stamped on first publish and kept afterwards, because the parent feed
      // sorts on it — re-saving a typo should not jump the post back to the top.
      published_at: input.isPublished ? (input.publishedAt ?? new Date().toISOString()) : null,
    };

    if (input.id) {
      const { error } = await supabase.from('portal_updates').update(row).eq('id', input.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('portal_updates')
        .insert({ ...row, author_id: authorId });
      if (error) throw error;
    }
  }, [authorId]);

  const deleteUpdate = useCallback(async (id: string) => {
    const { error } = await supabase.from('portal_updates').delete().eq('id', id);
    if (error) throw error;
  }, []);

  // ----------------------------------------------------------------- events

  const saveEvent = useCallback(async (input: EventInput) => {
    const row = {
      program_id: input.programId,
      class_id: input.classId,
      title: input.title.trim(),
      description: input.description,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      is_all_day: input.isAllDay,
      location: input.location,
      is_published: input.isPublished,
    };

    if (input.id) {
      const { error } = await supabase.from('portal_events').update(row).eq('id', input.id);
      if (error) throw error;
    } else {
      // source stays at its 'manual' default. The phase-4 Google sync owns
      // 'google' rows and overwrites them; it must never touch these.
      const { error } = await supabase.from('portal_events').insert(row);
      if (error) throw error;
    }
  }, []);

  const deleteEvent = useCallback(async (id: string) => {
    const { error } = await supabase.from('portal_events').delete().eq('id', id);
    if (error) throw error;
  }, []);

  // -------------------------------------------------------------- documents

  /**
   * Upload the file, then record it.
   *
   * The two can fail independently and the failure modes are not symmetric:
   *
   *   object, no row  — invisible to everyone. Wasted bytes, nothing worse.
   *   row, no object  — a download that 404s for every parent who taps it.
   *
   * So the object goes first and is deleted again if the row insert is refused
   * (which is what an instructor uploading to someone else's class hits, since
   * the storage policy only asks can_edit_portal() while the row asks
   * can_edit_portal_class()).
   */
  const uploadDocument = useCallback(async (
    file: File,
    programSlug: PortalProgramSlug,
    meta: DocumentInput,
    onProgress?: (stage: 'uploading' | 'saving') => void,
  ) => {
    const storagePath = buildStoragePath(programSlug, file.name);

    onProgress?.('uploading');
    const { error: uploadErr } = await supabase.storage
      .from('portal-documents')
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || undefined,
      });
    if (uploadErr) throw uploadErr;

    onProgress?.('saving');
    const { error: rowErr } = await supabase.from('portal_documents').insert({
      program_id: meta.programId,
      class_id: meta.classId,
      title: meta.title.trim(),
      description: meta.description,
      category: meta.category,
      storage_path: storagePath,
      file_name: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
      sort_order: meta.sortOrder,
      is_published: meta.isPublished,
      uploaded_by: authorId,
    });

    if (rowErr) {
      await supabase.storage.from('portal-documents').remove([storagePath])
        .catch(() => { /* leaves an invisible object; the row is what matters */ });
      throw rowErr;
    }
  }, [authorId]);

  /** Title, class, category and visibility. The file itself is immutable. */
  const saveDocumentMeta = useCallback(async (input: DocumentInput & { id: string }) => {
    const { error } = await supabase
      .from('portal_documents')
      .update({
        class_id: input.classId,
        title: input.title.trim(),
        description: input.description,
        category: input.category,
        sort_order: input.sortOrder,
        is_published: input.isPublished,
      })
      .eq('id', input.id);
    if (error) throw error;
  }, []);

  /**
   * OBJECT FIRST, ROW SECOND. This used to be the other way round.
   *
   * The old order deleted the row, then tried the file, and reported a failed
   * file delete as housekeeping — the reasoning being that the parent-facing
   * outcome was already correct, since nothing linked to the file any more.
   *
   * That reasoning was half right and the missing half is expensive. Nothing
   * links to the file, but the file is still THERE: still billed, still
   * counting against a 1 GB quota, and now unreachable by every route the app
   * has, because the app only ever lists the bucket by row. Supabase blocks
   * direct DELETEs on storage.objects (trigger storage.protect_delete,
   * "This prevents accidental data loss from orphaned objects"), so the only
   * way back is the Supabase dashboard. Two files sat stranded like that for
   * two days before anyone noticed, and only because someone went looking.
   *
   * Reversing it makes the failure recoverable instead. If the file cannot be
   * deleted, the row stays, the entry stays in the manager, and it can be tried
   * again. The worst case is a visible thing that still works.
   *
   * "Already gone" is not a failure — see removeStorageObject.
   */
  const deleteDocument = useCallback(async (doc: PortalDocument) => {
    await removeStorageObject('portal-documents', doc.storagePath);

    const { error } = await supabase.from('portal_documents').delete().eq('id', doc.id);
    if (error) throw error;
  }, []);

  const getDocumentUrl = useCallback(async (storagePath: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('portal-documents')
        .createSignedUrl(storagePath, 60 * 60);
      if (error) throw error;
      return data?.signedUrl ?? null;
    } catch (e) {
      console.error('Could not sign document URL:', e);
      return null;
    }
  }, []);

  const getDocumentUrls = useCallback(
    (storagePaths: string[]) => signDocumentUrls(storagePaths),
    []
  );

  // ---------------------------------------------------------------- classes

  const saveClass = useCallback(async (input: ClassInput) => {
    const row = {
      program_id: input.programId,
      category: input.category,
      name: input.name.trim(),
      day_of_week: input.dayOfWeek,
      start_time: input.startTime,
      end_time: input.endTime,
      level: input.level,
      location: input.location,
      description: input.description,
      instructor_name: input.instructorName,
      sort_order: input.sortOrder,
      is_active: input.isActive,
      style: input.style,
      age_group: input.ageGroup,
      age_min_years: input.ageMinYears,
      age_max_years: input.ageMaxYears,
      capacity: input.capacity,
      tuition_fee: input.tuitionFee,
      season: input.season,
      season_start: input.seasonStart,
      season_end: input.seasonEnd,
    };

    if (input.id) {
      const { error } = await supabase.from('portal_classes').update(row).eq('id', input.id);
      if (error) throw error;
      return input.id;
    }

    // Ask for the id back: instructor grants are a second write against this
    // row, and a new class would otherwise have no way to receive them without
    // re-fetching the whole list and guessing which one is new.
    const { data, error } = await supabase
      .from('portal_classes')
      .insert(row)
      .select('id')
      .single();
    if (error) throw error;
    return data.id as string;
  }, []);

  const deleteClass = useCallback(async (id: string) => {
    const { error } = await supabase.from('portal_classes').delete().eq('id', id);
    if (error) throw error;
  }, []);

  const fetchClassInstructors = useCallback(async (classId: string) => {
    const { data, error } = await supabase
      .from('portal_class_instructors')
      .select('profile_id')
      .eq('class_id', classId);
    if (error) throw error;
    return (data ?? []).map((r: any) => r.profile_id);
  }, []);

  /**
   * Diffed rather than delete-all-then-reinsert: a failure halfway through the
   * second half of that would strip a teacher of a class they still teach.
   */
  const setClassInstructors = useCallback(async (classId: string, profileIds: string[]) => {
    const current: string[] = await fetchClassInstructors(classId);
    const added = profileIds.filter(id => !current.includes(id));
    const removed = current.filter(id => !profileIds.includes(id));

    if (added.length) {
      const { error } = await supabase.from('portal_class_instructors').insert(
        added.map(profileId => ({
          class_id: classId,
          profile_id: profileId,
          granted_by: authorId,
        }))
      );
      if (error) throw error;
    }

    if (removed.length) {
      const { error } = await supabase
        .from('portal_class_instructors')
        .delete()
        .eq('class_id', classId)
        .in('profile_id', removed);
      if (error) throw error;
    }

    // The signed-in admin may have just granted or revoked their own access.
    await load();
  }, [authorId, fetchClassInstructors, load]);

  // -------------------------------------------------------- calendar sync

  /**
   * A program reads several calendars since v23 — All-Stars takes the All-Stars
   * calendar and the Studio one. This was .maybeSingle() and would now throw
   * the moment a second row appeared.
   */
  const fetchCalendarSources = useCallback(async (programId: string) => {
    const { data, error } = await supabase
      .from('portal_calendar_sources')
      .select('*')
      .eq('program_id', programId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapCalendarSource);
  }, []);

  /**
   * Add a calendar, or change one.
   *
   * The key is (program_id, google_calendar_id) since v23, which makes an
   * upsert alone wrong for an edit: changing the id would leave the old row
   * behind and the program would then sync both the old calendar and the new
   * one. So a rename is an UPDATE of the identified row, and everything else is
   * an upsert.
   */
  const saveCalendarSource = useCallback(async (
    input: CalendarSourceInput,
    originalGoogleCalendarId?: string,
  ) => {
    const googleCalendarId = input.googleCalendarId.trim();
    const row = {
      google_calendar_id: googleCalendarId,
      is_enabled: input.isEnabled,
      days_back: input.daysBack,
      days_ahead: input.daysAhead,
      publish_imported: input.publishImported,
    };

    if (originalGoogleCalendarId && originalGoogleCalendarId !== googleCalendarId) {
      const { error } = await supabase
        .from('portal_calendar_sources')
        .update(row)
        .eq('program_id', input.programId)
        .eq('google_calendar_id', originalGoogleCalendarId);
      if (error) throw error;
      return;
    }

    const { error } = await supabase
      .from('portal_calendar_sources')
      .upsert(
        { program_id: input.programId, ...row },
        { onConflict: 'program_id,google_calendar_id' },
      );
    if (error) throw error;
  }, []);

  /**
   * Disconnecting leaves the events behind on purpose. They are real dates a
   * studio published; silently emptying the parent calendar because someone
   * changed a setting would be worse than leaving rows that no longer refresh.
   * Delete them in the calendar list if they are not wanted.
   */
  const removeCalendarSource = useCallback(async (
    programId: string,
    googleCalendarId: string,
  ) => {
    const { error } = await supabase
      .from('portal_calendar_sources')
      .delete()
      .eq('program_id', programId)
      // Scoped to the one calendar. Without this it would disconnect every
      // calendar the program reads, which is a much bigger button than the one
      // the admin thought they were pressing.
      .eq('google_calendar_id', googleCalendarId);
    if (error) throw error;
  }, []);

  const runCalendarSync = useCallback(async (programId: string) => {
    const { data, error } = await supabase.functions.invoke('portal-calendar-sync', {
      body: { programId },
    });
    if (error) throw error;
    // The function answers 200 with per-calendar outcomes even when one failed,
    // so a run that reached Google but found nothing readable still lands here.
    return (data?.synced ?? []) as SyncRunResult[];
  }, []);

  // ------------------------------------------------------------ access code

  const setRequiresCode = useCallback(async (programId: string, requiresCode: boolean) => {
    const { error } = await supabase
      .from('portal_programs')
      .update({ requires_code: requiresCode })
      .eq('id', programId);
    if (error) throw error;
    setPrograms(prev => prev.map(p => (p.id === programId ? { ...p, requiresCode } : p)));
  }, []);

  /**
   * The code is hashed inside Postgres and never comes back out. This function
   * can set one; nothing can read one.
   */
  const setAccessCode = useCallback(async (slug: PortalProgramSlug, code: string) => {
    const { error } = await supabase.rpc('set_portal_code', { p_slug: slug, p_code: code });
    if (error) throw error;
  }, []);

  const programHasCode = useCallback(async (slug: PortalProgramSlug) => {
    try {
      const { data, error } = await supabase.rpc('portal_program_has_code', { p_slug: slug });
      if (error) throw error;
      return data === true;
    } catch {
      // v11 not applied, or not an admin. Unknown is a valid answer here and
      // the screen says so rather than guessing.
      return null;
    }
  }, []);

  const value = useMemo<PortalAdminContextValue>(() => ({
    canEdit, checking, editableClassIds, canEditClass,
    programs, programsLoading, reload,
    fetchClasses, fetchUpdates, fetchEvents, fetchDocuments,
    saveUpdate, deleteUpdate,
    saveEvent, deleteEvent,
    uploadDocument, saveDocumentMeta, deleteDocument, getDocumentUrl, getDocumentUrls,
    saveClass, deleteClass, fetchClassInstructors, setClassInstructors,
    fetchCalendarSources, saveCalendarSource, removeCalendarSource, runCalendarSync,
    setRequiresCode, setAccessCode, programHasCode,
  }), [
    canEdit, checking, editableClassIds, canEditClass,
    programs, programsLoading, reload,
    fetchClasses, fetchUpdates, fetchEvents, fetchDocuments,
    saveUpdate, deleteUpdate, saveEvent, deleteEvent,
    uploadDocument, saveDocumentMeta, deleteDocument, getDocumentUrl, getDocumentUrls,
    saveClass, deleteClass, fetchClassInstructors, setClassInstructors,
    fetchCalendarSources, saveCalendarSource, removeCalendarSource, runCalendarSync,
    setRequiresCode, setAccessCode, programHasCode,
  ]);

  return <PortalAdminContext.Provider value={value}>{children}</PortalAdminContext.Provider>;
};
