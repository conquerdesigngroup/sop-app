import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from './AuthContext';

export type EntityType = 'sop' | 'task' | 'job' | 'template' | 'user' | 'system';

export type ActionType =
  // SOP actions
  | 'sop_created'
  | 'sop_updated'
  | 'sop_deleted'
  | 'sop_published'
  | 'sop_archived'
  | 'sop_restored'
  | 'sop_imported'
  // Task actions
  | 'task_created'
  | 'task_updated'
  | 'task_deleted'
  | 'task_assigned'
  | 'task_completed'
  | 'task_started'
  | 'task_archived'
  | 'task_restored'
  | 'task_step_completed'
  // Job actions
  | 'job_created'
  | 'job_updated'
  | 'job_deleted'
  | 'job_completed'
  | 'job_archived'
  | 'job_restored'
  // Template actions
  | 'template_created'
  | 'template_updated'
  | 'template_deleted'
  // User actions
  | 'user_login'
  | 'user_logout'
  | 'user_created'
  | 'user_updated'
  | 'user_deleted'
  | 'user_role_changed'
  | 'user_password_changed'
  // System actions
  | 'system_backup'
  | 'system_restore';

export interface ActivityLog {
  id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  action: ActionType;
  entity_type: EntityType;
  entity_id?: string;
  entity_title?: string;
  details?: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

interface ActivityLogContextType {
  logs: ActivityLog[];
  loading: boolean;
  totalCount: number;
  logActivity: (
    action: ActionType,
    entityType: EntityType,
    entityId?: string,
    entityTitle?: string,
    details?: Record<string, any>
  ) => Promise<void>;
  fetchLogs: (options?: FetchLogsOptions) => Promise<void>;
  fetchMoreLogs: () => Promise<void>;
  clearFilters: () => void;
}

interface FetchLogsOptions {
  userId?: string;
  entityType?: EntityType;
  action?: string;
  startDate?: string;
  endDate?: string;
  searchQuery?: string;
  limit?: number;
  offset?: number;
}

const ActivityLogContext = createContext<ActivityLogContextType | undefined>(undefined);

export const useActivityLog = () => {
  const context = useContext(ActivityLogContext);
  if (!context) {
    throw new Error('useActivityLog must be used within an ActivityLogProvider');
  }
  return context;
};

interface ActivityLogProviderProps {
  children: ReactNode;
}

const LOGS_PER_PAGE = 50;

export const ActivityLogProvider: React.FC<ActivityLogProviderProps> = ({ children }) => {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [currentFilters, setCurrentFilters] = useState<FetchLogsOptions>({});
  const { currentUser } = useAuth();
  const useSupabase = isSupabaseConfigured();

  // Log an activity
  const logActivity = useCallback(async (
    action: ActionType,
    entityType: EntityType,
    entityId?: string,
    entityTitle?: string,
    details?: Record<string, any>
  ) => {
    if (!useSupabase || !currentUser) {
      // Fallback to localStorage for demo mode
      const localLogs = JSON.parse(localStorage.getItem('mediamaple_activity_logs') || '[]');
      const newLog: ActivityLog = {
        id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        user_id: currentUser?.id || 'unknown',
        user_email: currentUser?.email || 'unknown',
        user_name: currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : 'Unknown User',
        action,
        entity_type: entityType,
        entity_id: entityId,
        entity_title: entityTitle,
        details,
        user_agent: navigator.userAgent,
        created_at: new Date().toISOString(),
      };
      localLogs.unshift(newLog);
      // Keep only last 1000 logs in localStorage
      if (localLogs.length > 1000) {
        localLogs.pop();
      }
      localStorage.setItem('mediamaple_activity_logs', JSON.stringify(localLogs));
      return;
    }

    try {
      const { error } = await supabase.from('activity_logs').insert({
        user_id: currentUser.id,
        user_email: currentUser.email,
        user_name: `${currentUser.firstName} ${currentUser.lastName}`,
        action,
        entity_type: entityType,
        entity_id: entityId,
        entity_title: entityTitle,
        details,
        user_agent: navigator.userAgent,
      });

      if (error) {
        console.error('Error logging activity:', error);
      }
    } catch (error) {
      console.error('Error logging activity:', error);
    }
  }, [useSupabase, currentUser]);

  // Fetch logs with filters
  const fetchLogs = useCallback(async (options: FetchLogsOptions = {}) => {
    setLoading(true);
    setCurrentFilters(options);
    setCurrentOffset(0);

    if (!useSupabase) {
      // Fallback to localStorage
      let localLogs: ActivityLog[] = JSON.parse(localStorage.getItem('mediamaple_activity_logs') || '[]');

      // Apply filters
      if (options.userId) {
        localLogs = localLogs.filter(log => log.user_id === options.userId);
      }
      if (options.entityType) {
        localLogs = localLogs.filter(log => log.entity_type === options.entityType);
      }
      if (options.action) {
        localLogs = localLogs.filter(log => log.action.includes(options.action!));
      }
      if (options.searchQuery) {
        const query = options.searchQuery.toLowerCase();
        localLogs = localLogs.filter(log =>
          log.user_name.toLowerCase().includes(query) ||
          log.entity_title?.toLowerCase().includes(query) ||
          log.action.toLowerCase().includes(query)
        );
      }
      if (options.startDate) {
        localLogs = localLogs.filter(log => new Date(log.created_at) >= new Date(options.startDate!));
      }
      if (options.endDate) {
        localLogs = localLogs.filter(log => new Date(log.created_at) <= new Date(options.endDate!));
      }

      setTotalCount(localLogs.length);
      setLogs(localLogs.slice(0, options.limit || LOGS_PER_PAGE));
      setLoading(false);
      return;
    }

    try {
      let query = supabase
        .from('activity_logs')
        .select('*', { count: 'exact' });

      // Apply filters
      if (options.userId) {
        query = query.eq('user_id', options.userId);
      }
      if (options.entityType) {
        query = query.eq('entity_type', options.entityType);
      }
      if (options.action) {
        query = query.ilike('action', `%${options.action}%`);
      }
      if (options.searchQuery) {
        query = query.or(`user_name.ilike.%${options.searchQuery}%,entity_title.ilike.%${options.searchQuery}%`);
      }
      if (options.startDate) {
        query = query.gte('created_at', options.startDate);
      }
      if (options.endDate) {
        query = query.lte('created_at', options.endDate);
      }

      // Order and pagination
      query = query
        .order('created_at', { ascending: false })
        .range(0, (options.limit || LOGS_PER_PAGE) - 1);

      const { data, error, count } = await query;

      if (error) {
        console.error('Error fetching activity logs:', error);
        setLoading(false);
        return;
      }

      setLogs(data || []);
      setTotalCount(count || 0);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching activity logs:', error);
      setLoading(false);
    }
  }, [useSupabase]);

  // Fetch more logs (pagination)
  const fetchMoreLogs = useCallback(async () => {
    if (loading || logs.length >= totalCount) return;

    setLoading(true);
    const newOffset = currentOffset + LOGS_PER_PAGE;

    if (!useSupabase) {
      let localLogs: ActivityLog[] = JSON.parse(localStorage.getItem('mediamaple_activity_logs') || '[]');
      // Apply same filters as current
      // ... (simplified for localStorage mode)
      const moreLogs = localLogs.slice(newOffset, newOffset + LOGS_PER_PAGE);
      setLogs(prev => [...prev, ...moreLogs]);
      setCurrentOffset(newOffset);
      setLoading(false);
      return;
    }

    try {
      let query = supabase
        .from('activity_logs')
        .select('*');

      // Apply same filters
      if (currentFilters.userId) {
        query = query.eq('user_id', currentFilters.userId);
      }
      if (currentFilters.entityType) {
        query = query.eq('entity_type', currentFilters.entityType);
      }
      if (currentFilters.action) {
        query = query.ilike('action', `%${currentFilters.action}%`);
      }
      if (currentFilters.searchQuery) {
        query = query.or(`user_name.ilike.%${currentFilters.searchQuery}%,entity_title.ilike.%${currentFilters.searchQuery}%`);
      }
      if (currentFilters.startDate) {
        query = query.gte('created_at', currentFilters.startDate);
      }
      if (currentFilters.endDate) {
        query = query.lte('created_at', currentFilters.endDate);
      }

      query = query
        .order('created_at', { ascending: false })
        .range(newOffset, newOffset + LOGS_PER_PAGE - 1);

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching more logs:', error);
        setLoading(false);
        return;
      }

      setLogs(prev => [...prev, ...(data || [])]);
      setCurrentOffset(newOffset);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching more logs:', error);
      setLoading(false);
    }
  }, [useSupabase, loading, logs.length, totalCount, currentOffset, currentFilters]);

  const clearFilters = useCallback(() => {
    setCurrentFilters({});
    fetchLogs({});
  }, [fetchLogs]);

  const value: ActivityLogContextType = {
    logs,
    loading,
    totalCount,
    logActivity,
    fetchLogs,
    fetchMoreLogs,
    clearFilters,
  };

  return (
    <ActivityLogContext.Provider value={value}>
      {children}
    </ActivityLogContext.Provider>
  );
};
