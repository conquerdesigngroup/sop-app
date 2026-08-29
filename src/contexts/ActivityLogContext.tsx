import React, { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { logActivity as logViaRpc } from '../lib/activityLog';

/**
 * Audit-log state: the one write path and the super-admin read path.
 *
 * v29 moved both ends into the database. Writes go through the log_activity()
 * RPC (identity comes from the JWT — see src/lib/activityLog.ts); reads go
 * through admin_activity_search() / admin_activity_facets(), which are
 * SECURITY DEFINER and refuse anyone below super_admin, so this context can be
 * mounted app-wide without ever being the thing that protects the data.
 *
 * PAGINATION IS KEYSET, NOT OFFSET
 *
 * The cursor is (created_at, id) of the last row. Offset pagination
 * double-counts and skips on a table that is being written to constantly —
 * which a live audit log is, by definition. fetchMore() can therefore be
 * pressed forever without repeating or losing a row.
 *
 * The old localStorage mirror is gone: it predated the activity_logs table and
 * a browser-local "audit log" that only that browser can read is not an audit
 * log. Without Supabase, reads return nothing and writes are dropped.
 */

export type EntityType = 'sop' | 'task' | 'job' | 'template' | 'user' | 'system' | 'roster' | 'document' | 'class';

export type ActionType = string;

export interface ActivityLog {
  id: string;
  user_id: string;
  user_email: string | null;
  user_name: string | null;
  actor_kind: 'staff' | 'client' | 'system';
  actor_role: string | null;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  entity_title?: string | null;
  details?: Record<string, any> | null;
  result: 'success' | 'failure';
  request_id?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  created_at: string;
}

export interface LogFilters {
  /** ISO timestamps. `to` is exclusive. */
  from?: string;
  to?: string;
  actorIds?: string[];
  actorKinds?: string[];
  actions?: string[];
  entityTypes?: string[];
  entityId?: string;
  result?: 'success' | 'failure';
  search?: string;
}

export interface LogFacets {
  actions: { action: string; count: number }[];
  entity_types: { entity_type: string; count: number }[];
  actors: { id: string; name: string | null; email: string | null; kind: string; count: number }[];
}

interface ActivityLogContextType {
  logs: ActivityLog[];
  loading: boolean;
  hasMore: boolean;
  error: string | null;
  facets: LogFacets | null;

  logActivity: (
    action: string,
    entityType: EntityType,
    entityId?: string,
    entityTitle?: string,
    details?: Record<string, any>
  ) => Promise<void>;

  fetchLogs: (filters: LogFilters) => Promise<void>;
  fetchMoreLogs: () => Promise<void>;
  /** One page of rows for the current filters WITHOUT touching state — export. */
  fetchPage: (filters: LogFilters, cursor: { ts: string; id: string } | null, limit: number) => Promise<ActivityLog[]>;
  refreshFacets: (from?: string, to?: string) => Promise<void>;
}

const ActivityLogContext = createContext<ActivityLogContextType | undefined>(undefined);

export const useActivityLog = () => {
  const context = useContext(ActivityLogContext);
  if (!context) {
    throw new Error('useActivityLog must be used within an ActivityLogProvider');
  }
  return context;
};

const LOGS_PER_PAGE = 50;

const toRpcArgs = (filters: LogFilters, cursor: { ts: string; id: string } | null, limit: number) => ({
  p_from: filters.from ?? null,
  p_to: filters.to ?? null,
  p_actor_ids: filters.actorIds?.length ? filters.actorIds : null,
  p_actor_kinds: filters.actorKinds?.length ? filters.actorKinds : null,
  p_actions: filters.actions?.length ? filters.actions : null,
  p_entity_types: filters.entityTypes?.length ? filters.entityTypes : null,
  p_entity_id: filters.entityId ?? null,
  p_result: filters.result ?? null,
  p_search: filters.search?.trim() || null,
  p_cursor_ts: cursor?.ts ?? null,
  p_cursor_id: cursor?.id ?? null,
  p_limit: limit,
});

export const ActivityLogProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facets, setFacets] = useState<LogFacets | null>(null);

  // Refs rather than state: fetchMore needs the CURRENT filters and cursor,
  // not the ones a stale closure captured.
  const filtersRef = useRef<LogFilters>({});
  const cursorRef = useRef<{ ts: string; id: string } | null>(null);
  // Guards against a slow page-1 response landing after the user has already
  // changed filters (it would overwrite the newer list with the older query).
  const fetchSeq = useRef(0);

  const logActivity = useCallback(async (
    action: string,
    entityType: EntityType,
    entityId?: string,
    entityTitle?: string,
    details?: Record<string, any>
  ) => {
    await logViaRpc({ action, entityType, entityId, entityTitle, details });
  }, []);

  const fetchPage = useCallback(async (
    filters: LogFilters,
    cursor: { ts: string; id: string } | null,
    limit: number
  ): Promise<ActivityLog[]> => {
    if (!isSupabaseConfigured() || !supabase) return [];
    const { data, error: err } = await supabase.rpc('admin_activity_search', toRpcArgs(filters, cursor, limit));
    if (err) throw new Error(err.message);
    return (data ?? []) as ActivityLog[];
  }, []);

  const fetchLogs = useCallback(async (filters: LogFilters) => {
    const seq = ++fetchSeq.current;
    filtersRef.current = filters;
    cursorRef.current = null;
    setLoading(true);
    setError(null);

    try {
      const rows = await fetchPage(filters, null, LOGS_PER_PAGE);
      if (seq !== fetchSeq.current) return;
      setLogs(rows);
      setHasMore(rows.length === LOGS_PER_PAGE);
      const last = rows[rows.length - 1];
      cursorRef.current = last ? { ts: last.created_at, id: last.id } : null;
    } catch (e: any) {
      if (seq !== fetchSeq.current) return;
      setLogs([]);
      setHasMore(false);
      setError(e.message || 'Could not load the activity log');
    } finally {
      if (seq === fetchSeq.current) setLoading(false);
    }
  }, [fetchPage]);

  const fetchMoreLogs = useCallback(async () => {
    if (loading || !cursorRef.current) return;
    const seq = fetchSeq.current;
    setLoading(true);
    try {
      const rows = await fetchPage(filtersRef.current, cursorRef.current, LOGS_PER_PAGE);
      if (seq !== fetchSeq.current) return;
      setLogs(prev => [...prev, ...rows]);
      setHasMore(rows.length === LOGS_PER_PAGE);
      const last = rows[rows.length - 1];
      if (last) cursorRef.current = { ts: last.created_at, id: last.id };
    } catch (e: any) {
      if (seq === fetchSeq.current) setError(e.message || 'Could not load more');
    } finally {
      if (seq === fetchSeq.current) setLoading(false);
    }
  }, [loading, fetchPage]);

  const refreshFacets = useCallback(async (from?: string, to?: string) => {
    if (!isSupabaseConfigured() || !supabase) return;
    try {
      const { data, error: err } = await supabase.rpc('admin_activity_facets', {
        p_from: from ?? null,
        p_to: to ?? null,
      });
      if (!err && data) setFacets(data as LogFacets);
    } catch (e) {
      console.error('admin_activity_facets failed:', e);
    }
  }, []);

  const value: ActivityLogContextType = {
    logs,
    loading,
    hasMore,
    error,
    facets,
    logActivity,
    fetchLogs,
    fetchMoreLogs,
    fetchPage,
    refreshFacets,
  };

  return (
    <ActivityLogContext.Provider value={value}>
      {children}
    </ActivityLogContext.Provider>
  );
};
