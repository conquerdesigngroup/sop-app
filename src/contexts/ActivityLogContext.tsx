import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

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
const STORAGE_KEY = 'mediamaple_activity_logs';

// Initialize sample logs if localStorage is empty
const initializeSampleLogs = () => {
  const existingLogs = localStorage.getItem(STORAGE_KEY);
  if (!existingLogs || existingLogs === '[]') {
    const sampleLogs: ActivityLog[] = [
      {
        id: 'sample_1',
        user_id: 'system',
        user_email: 'system@mediamaple.com',
        user_name: 'System',
        action: 'system_restore',
        entity_type: 'system',
        entity_title: 'Activity Log System',
        details: { message: 'Activity logging initialized' },
        created_at: new Date().toISOString(),
      },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sampleLogs));
  }
};

export const ActivityLogProvider: React.FC<ActivityLogProviderProps> = ({ children }) => {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [currentFilters, setCurrentFilters] = useState<FetchLogsOptions>({});
  const { currentUser } = useAuth();

  // Initialize sample logs on first load
  useEffect(() => {
    initializeSampleLogs();
  }, []);

  // Log an activity (using Supabase with localStorage fallback)
  const logActivity = useCallback(async (
    action: ActionType,
    entityType: EntityType,
    entityId?: string,
    entityTitle?: string,
    details?: Record<string, any>
  ) => {
    const newLog: ActivityLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
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

    // Try to save to Supabase first
    if (isSupabaseConfigured() && supabase) {
      try {
        const { error } = await supabase.from('activity_logs').insert({
          user_id: currentUser?.id,
          user_email: newLog.user_email,
          user_name: newLog.user_name,
          action: newLog.action,
          entity_type: newLog.entity_type,
          entity_id: newLog.entity_id,
          entity_title: newLog.entity_title,
          details: newLog.details || {},
          user_agent: newLog.user_agent,
        });
        if (error) {
          console.error('Failed to log activity to Supabase:', error);
          // Fall back to localStorage
          saveToLocalStorage(newLog);
        }
      } catch (err) {
        console.error('Error logging activity to Supabase:', err);
        saveToLocalStorage(newLog);
      }
    } else {
      // Use localStorage as fallback
      saveToLocalStorage(newLog);
    }
  }, [currentUser]);

  // Helper to save to localStorage
  const saveToLocalStorage = (newLog: ActivityLog) => {
    const localLogs = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    localLogs.unshift(newLog);
    // Keep only last 1000 logs in localStorage
    if (localLogs.length > 1000) {
      localLogs.pop();
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(localLogs));
  };

  // Fetch logs with filters (from Supabase with localStorage fallback)
  const fetchLogs = useCallback(async (options: FetchLogsOptions = {}) => {
    setLoading(true);
    setCurrentFilters(options);
    setCurrentOffset(0);

    // Try Supabase first
    if (isSupabaseConfigured() && supabase) {
      try {
        // Build the query
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
        if (options.action && options.action !== 'all') {
          query = query.ilike('action', `%${options.action}%`);
        }
        if (options.searchQuery) {
          // Search across multiple fields using OR
          query = query.or(`user_name.ilike.%${options.searchQuery}%,entity_title.ilike.%${options.searchQuery}%,action.ilike.%${options.searchQuery}%`);
        }
        if (options.startDate) {
          query = query.gte('created_at', options.startDate);
        }
        if (options.endDate) {
          // Add time to include the full end date
          query = query.lte('created_at', `${options.endDate}T23:59:59.999Z`);
        }

        // Order by created_at descending and apply pagination
        query = query
          .order('created_at', { ascending: false })
          .range(0, (options.limit || LOGS_PER_PAGE) - 1);

        const { data, error, count } = await query;

        if (error) {
          console.error('Failed to fetch logs from Supabase:', error);
          // Fall back to localStorage
          fetchLogsFromLocalStorage(options);
        } else {
          setTotalCount(count || 0);
          setLogs(data || []);
          setLoading(false);
        }
      } catch (err) {
        console.error('Error fetching logs from Supabase:', err);
        fetchLogsFromLocalStorage(options);
      }
    } else {
      // Use localStorage as fallback
      fetchLogsFromLocalStorage(options);
    }
  }, []);

  // Helper to fetch from localStorage
  const fetchLogsFromLocalStorage = (options: FetchLogsOptions) => {
    const rawLogs = localStorage.getItem(STORAGE_KEY);
    let localLogs: ActivityLog[] = JSON.parse(rawLogs || '[]');

    // Apply filters
    if (options.userId) {
      localLogs = localLogs.filter(log => log.user_id === options.userId);
    }
    if (options.entityType) {
      localLogs = localLogs.filter(log => log.entity_type === options.entityType);
    }
    if (options.action && options.action !== 'all') {
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
  };

  // Fetch more logs (pagination)
  const fetchMoreLogs = useCallback(async () => {
    if (loading || logs.length >= totalCount) return;

    setLoading(true);
    const newOffset = currentOffset + LOGS_PER_PAGE;

    // Try Supabase first
    if (isSupabaseConfigured() && supabase) {
      try {
        let query = supabase
          .from('activity_logs')
          .select('*');

        // Apply same filters as current
        if (currentFilters.userId) {
          query = query.eq('user_id', currentFilters.userId);
        }
        if (currentFilters.entityType) {
          query = query.eq('entity_type', currentFilters.entityType);
        }
        if (currentFilters.action && currentFilters.action !== 'all') {
          query = query.ilike('action', `%${currentFilters.action}%`);
        }
        if (currentFilters.searchQuery) {
          query = query.or(`user_name.ilike.%${currentFilters.searchQuery}%,entity_title.ilike.%${currentFilters.searchQuery}%,action.ilike.%${currentFilters.searchQuery}%`);
        }
        if (currentFilters.startDate) {
          query = query.gte('created_at', currentFilters.startDate);
        }
        if (currentFilters.endDate) {
          query = query.lte('created_at', `${currentFilters.endDate}T23:59:59.999Z`);
        }

        query = query
          .order('created_at', { ascending: false })
          .range(newOffset, newOffset + LOGS_PER_PAGE - 1);

        const { data, error } = await query;

        if (error) {
          console.error('Failed to fetch more logs from Supabase:', error);
          fetchMoreLogsFromLocalStorage(newOffset);
        } else {
          setLogs(prev => [...prev, ...(data || [])]);
          setCurrentOffset(newOffset);
          setLoading(false);
        }
      } catch (err) {
        console.error('Error fetching more logs from Supabase:', err);
        fetchMoreLogsFromLocalStorage(newOffset);
      }
    } else {
      fetchMoreLogsFromLocalStorage(newOffset);
    }
  }, [loading, logs.length, totalCount, currentOffset, currentFilters]);

  // Helper to fetch more from localStorage
  const fetchMoreLogsFromLocalStorage = (newOffset: number) => {
    let localLogs: ActivityLog[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');

    // Apply same filters as current
    if (currentFilters.userId) {
      localLogs = localLogs.filter(log => log.user_id === currentFilters.userId);
    }
    if (currentFilters.entityType) {
      localLogs = localLogs.filter(log => log.entity_type === currentFilters.entityType);
    }
    if (currentFilters.action && currentFilters.action !== 'all') {
      localLogs = localLogs.filter(log => log.action.includes(currentFilters.action!));
    }
    if (currentFilters.searchQuery) {
      const query = currentFilters.searchQuery.toLowerCase();
      localLogs = localLogs.filter(log =>
        log.user_name.toLowerCase().includes(query) ||
        log.entity_title?.toLowerCase().includes(query) ||
        log.action.toLowerCase().includes(query)
      );
    }
    if (currentFilters.startDate) {
      localLogs = localLogs.filter(log => new Date(log.created_at) >= new Date(currentFilters.startDate!));
    }
    if (currentFilters.endDate) {
      localLogs = localLogs.filter(log => new Date(log.created_at) <= new Date(currentFilters.endDate!));
    }

    const moreLogs = localLogs.slice(newOffset, newOffset + LOGS_PER_PAGE);
    setLogs(prev => [...prev, ...moreLogs]);
    setCurrentOffset(newOffset);
    setLoading(false);
  };

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
