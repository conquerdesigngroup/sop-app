import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { useRefreshable } from './RefreshContext';
import {
  ShiftReport,
  ShiftReportComment,
  ShiftReportTag,
  ShiftType,
  mapComment,
  mapReport,
  mapTag,
} from '../lib/shiftReports';

/**
 * Every shift report, its tags and how many chat messages it has, for the
 * Reports page, the dashboard's "tagged on a report" card and the archive tab.
 *
 * One fetch serves all three so the dashboard card and the page can never
 * disagree about whether you still have a report to read. Registered with the
 * app-wide refresh, silent, and throws on failure (CLAUDE.md, DATA REFRESH).
 *
 * WRITES ARE MADE AS THE SIGNED-IN SESSION, NOT AS currentUser
 *
 * While an admin is using "View as", currentUser is the person being viewed,
 * but the Supabase session — and so auth.uid() in every policy — is still the
 * admin. v77 checks author_id = auth.uid(), so writing currentUser.id there
 * would be refused. The id comes from the session instead.
 */

interface NewReport {
  shiftType: ShiftType;
  shiftDate: string;
  body: string;
  tagUserIds: string[];
}

interface ShiftReportContextType {
  reports: ShiftReport[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  createReport: (input: NewReport) => Promise<ShiftReport>;
  updateReport: (id: string, patch: { shiftType: ShiftType; shiftDate: string; body: string; tagUserIds: string[] }) => Promise<void>;
  setArchived: (id: string, archived: boolean) => Promise<void>;
  markSeen: (id: string) => Promise<void>;
  loadComments: (reportId: string) => Promise<ShiftReportComment[]>;
  addComment: (reportId: string, body: string) => Promise<ShiftReportComment>;
  deleteComment: (comment: ShiftReportComment) => Promise<void>;
}

const ShiftReportContext = createContext<ShiftReportContextType | undefined>(undefined);

const sessionUserId = async (): Promise<string> => {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user?.id;
  if (!id) throw new Error('You are signed out. Sign in again and retry.');
  return id;
};

export const ShiftReportProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, currentUser } = useAuth();
  const [reports, setReports] = useState<ShiftReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const enabled = !!(isAuthenticated && isSupabaseConfigured() && currentUser && currentUser.role !== 'client');

  const load = useCallback(async (silent = false) => {
    const request = ++requestRef.current;
    if (!silent) setLoading(true);
    try {
      const { data: rows, error: reportsError } = await supabase
        .from('shift_reports')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (reportsError) throw reportsError;

      const ids = (rows || []).map((r: { id: string }) => r.id);
      let tags: ShiftReportTag[] = [];
      const counts = new Map<string, number>();
      if (ids.length > 0) {
        const [{ data: tagRows, error: tagsError }, { data: commentRows, error: commentsError }] = await Promise.all([
          supabase.from('shift_report_tags').select('*').in('report_id', ids),
          supabase.from('shift_report_comments').select('report_id').in('report_id', ids),
        ]);
        if (tagsError) throw tagsError;
        if (commentsError) throw commentsError;
        tags = (tagRows || []).map(mapTag);
        for (const c of commentRows || []) counts.set(c.report_id, (counts.get(c.report_id) || 0) + 1);
      }

      if (request !== requestRef.current) return;
      setReports((rows || []).map((row: { id: string }) =>
        mapReport(row, tags.filter(t => t.reportId === row.id), counts.get(row.id) || 0)));
      setError(null);
    } catch (e) {
      if (request !== requestRef.current) return;
      const message = e instanceof Error ? e.message : (e as { message?: string })?.message || 'Unknown error';
      // Before v77 is applied the table does not exist. Say so plainly
      // rather than leaving the page empty with no reason.
      setError(/shift_report/.test(message) || /does not exist|schema cache/i.test(message)
        ? 'Shift reports are not set up on the server yet.'
        : `Couldn't load shift reports. ${message}`);
      throw e;
    } finally {
      if (request === requestRef.current && !silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setReports([]);
      setLoading(false);
      return;
    }
    load().catch(() => { /* error state already set */ });
  }, [enabled, load]);

  const reload = useCallback(() => load(true), [load]);
  useRefreshable(reload, enabled);

  const replaceTags = async (reportId: string, wanted: string[], me: string, current: ShiftReportTag[]) => {
    const have = new Set(current.map(t => t.userId));
    const want = new Set(wanted);
    const toAdd = wanted.filter(id => !have.has(id));
    const toRemove = current.filter(t => !want.has(t.userId)).map(t => t.userId);
    if (toAdd.length > 0) {
      const { error: e } = await supabase
        .from('shift_report_tags')
        .insert(toAdd.map(userId => ({ report_id: reportId, user_id: userId, tagged_by: me })));
      if (e) throw e;
    }
    if (toRemove.length > 0) {
      const { error: e } = await supabase
        .from('shift_report_tags')
        .delete()
        .eq('report_id', reportId)
        .in('user_id', toRemove);
      if (e) throw e;
    }
  };

  const createReport = useCallback(async (input: NewReport): Promise<ShiftReport> => {
    const me = await sessionUserId();
    const { data, error: e } = await supabase
      .from('shift_reports')
      .insert({
        author_id: me,
        shift_type: input.shiftType,
        shift_date: input.shiftDate,
        body: input.body.trim(),
      })
      .select('*')
      .single();
    if (e) throw e;
    const tagIds = Array.from(new Set(input.tagUserIds));
    let tagError: unknown = null;
    try {
      await replaceTags(data.id, tagIds, me, []);
    } catch (err) {
      // The report itself is saved; losing it because a tag failed would be
      // worse. Reported to the caller after the list is updated.
      tagError = err;
    }
    const now = new Date().toISOString();
    const created = mapReport(data, tagError ? [] : tagIds.map(userId => ({
      reportId: data.id, userId, taggedBy: me, createdAt: now, seenAt: null,
    })));
    setReports(prev => [created, ...prev.filter(r => r.id !== created.id)]);
    if (tagError) throw new Error('The report was saved, but tagging failed. Open it and tag them again.');
    return created;
  }, []);

  const updateReport = useCallback(async (
    id: string,
    patch: { shiftType: ShiftType; shiftDate: string; body: string; tagUserIds: string[] },
  ) => {
    const me = await sessionUserId();
    const current = reports.find(r => r.id === id);
    const { data, error: e } = await supabase
      .from('shift_reports')
      .update({ shift_type: patch.shiftType, shift_date: patch.shiftDate, body: patch.body.trim() })
      .eq('id', id)
      .select('*');
    if (e) throw e;
    if (!data || data.length === 0) throw new Error('This report can no longer be edited.');
    await replaceTags(id, Array.from(new Set(patch.tagUserIds)), me, current?.tags || []);
    await load(true);
  }, [reports, load]);

  const setArchived = useCallback(async (id: string, archived: boolean) => {
    const { error: e } = await supabase.rpc('set_shift_report_archived', { p_report: id, p_archived: archived });
    if (e) throw e;
    const now = new Date().toISOString();
    const me = await sessionUserId().catch(() => null);
    setReports(prev => prev.map(r => (r.id === id
      ? { ...r, archivedAt: archived ? now : null, archivedBy: archived ? me : null }
      : r)));
  }, []);

  const markSeen = useCallback(async (id: string) => {
    const me = await sessionUserId().catch(() => null);
    if (!me) return;
    const report = reports.find(r => r.id === id);
    if (!report || !report.tags.some(t => t.userId === me && !t.seenAt)) return;
    const { error: e } = await supabase.rpc('mark_shift_report_seen', { p_report: id });
    if (e) throw e;
    const now = new Date().toISOString();
    setReports(prev => prev.map(r => (r.id === id
      ? { ...r, tags: r.tags.map(t => (t.userId === me && !t.seenAt ? { ...t, seenAt: now } : t)) }
      : r)));
  }, [reports]);

  const loadComments = useCallback(async (reportId: string) => {
    const { data, error: e } = await supabase
      .from('shift_report_comments')
      .select('*')
      .eq('report_id', reportId)
      .order('created_at', { ascending: true });
    if (e) throw e;
    const comments = (data || []).map(mapComment);
    setReports(prev => prev.map(r => (r.id === reportId ? { ...r, commentCount: comments.length } : r)));
    return comments;
  }, []);

  const addComment = useCallback(async (reportId: string, body: string) => {
    const me = await sessionUserId();
    const { data, error: e } = await supabase
      .from('shift_report_comments')
      .insert({ report_id: reportId, author_id: me, body: body.trim() })
      .select('*')
      .single();
    if (e) throw e;
    setReports(prev => prev.map(r => (r.id === reportId ? { ...r, commentCount: r.commentCount + 1 } : r)));
    return mapComment(data);
  }, []);

  const deleteComment = useCallback(async (comment: ShiftReportComment) => {
    const { data, error: e } = await supabase
      .from('shift_report_comments')
      .delete()
      .eq('id', comment.id)
      .select('id');
    if (e) throw e;
    if (!data || data.length === 0) throw new Error('That message could not be deleted.');
    setReports(prev => prev.map(r => (r.id === comment.reportId
      ? { ...r, commentCount: Math.max(0, r.commentCount - 1) }
      : r)));
  }, []);

  const value = useMemo<ShiftReportContextType>(() => ({
    reports, loading, error, reload, createReport, updateReport, setArchived, markSeen,
    loadComments, addComment, deleteComment,
  }), [reports, loading, error, reload, createReport, updateReport, setArchived, markSeen,
    loadComments, addComment, deleteComment]);

  return <ShiftReportContext.Provider value={value}>{children}</ShiftReportContext.Provider>;
};

const notMounted = () => Promise.reject(new Error('Shift reports are not available here.'));

/**
 * Outside the provider — a component test that mounts the nav or the
 * dashboard on its own — this is an empty, inert list rather than a throw:
 * the header's badge and the dashboard card have nothing to show, and that is
 * the right answer when there is no data.
 */
const INERT: ShiftReportContextType = {
  reports: [],
  loading: false,
  error: null,
  reload: () => Promise.resolve(),
  createReport: notMounted,
  updateReport: notMounted,
  setArchived: notMounted,
  markSeen: () => Promise.resolve(),
  loadComments: () => Promise.resolve([]),
  addComment: notMounted,
  deleteComment: notMounted,
};

export const useShiftReports = (): ShiftReportContextType => useContext(ShiftReportContext) ?? INERT;
