import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useMemo } from 'react';
import { WorkHoursEntry, WorkHoursSummary, User } from '../types';
import { useAuth } from './AuthContext';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

interface WorkHoursContextType {
  workHours: WorkHoursEntry[];
  addWorkHours: (entry: Omit<WorkHoursEntry, 'id' | 'createdAt' | 'createdBy' | 'status'>) => Promise<void>;
  updateWorkHours: (id: string, entry: Partial<WorkHoursEntry>) => Promise<void>;
  deleteWorkHours: (id: string) => Promise<void>;
  approveWorkHours: (id: string) => Promise<void>;
  rejectWorkHours: (id: string) => Promise<void>;
  getWorkHoursById: (id: string) => WorkHoursEntry | undefined;
  getWorkHoursByEmployee: (employeeId: string) => WorkHoursEntry[];
  getWorkHoursByDate: (date: string) => WorkHoursEntry[];
  getWorkHoursByDateRange: (startDate: string, endDate: string) => WorkHoursEntry[];
  getWorkHoursSummary: (employeeId: string, startDate: string, endDate: string) => WorkHoursSummary | null;
  getAllWorkHoursSummaries: (startDate: string, endDate: string) => WorkHoursSummary[];
  loading: boolean;
}

const WorkHoursContext = createContext<WorkHoursContextType | undefined>(undefined);

const STORAGE_KEY = 'sop_app_work_hours';

// Generate unique ID
const generateId = () => {
  return `wh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Calculate total hours from start/end times and break
export const calculateTotalHours = (startTime: string, endTime: string, breakMinutes: number): number => {
  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);

  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  const totalMinutes = endMinutes - startMinutes - breakMinutes;
  return Math.max(0, Math.round((totalMinutes / 60) * 100) / 100); // Round to 2 decimal places
};

// Map Supabase data to app type
const mapSupabaseWorkHours = (dbEntry: any): WorkHoursEntry => {
  return {
    id: dbEntry.id,
    employeeId: dbEntry.employee_id,
    workDate: dbEntry.work_date,
    startTime: dbEntry.start_time,
    endTime: dbEntry.end_time,
    breakMinutes: dbEntry.break_minutes || 0,
    totalHours: dbEntry.total_hours,
    notes: dbEntry.notes,
    status: dbEntry.status,
    approvedBy: dbEntry.approved_by,
    approvedAt: dbEntry.approved_at,
    createdBy: dbEntry.created_by,
    createdAt: dbEntry.created_at,
    updatedAt: dbEntry.updated_at,
  };
};

// Map app type to Supabase format
const mapToSupabase = (entry: Partial<WorkHoursEntry>) => {
  const mapped: any = {};
  if (entry.employeeId !== undefined) mapped.employee_id = entry.employeeId;
  if (entry.workDate !== undefined) mapped.work_date = entry.workDate;
  if (entry.startTime !== undefined) mapped.start_time = entry.startTime;
  if (entry.endTime !== undefined) mapped.end_time = entry.endTime;
  if (entry.breakMinutes !== undefined) mapped.break_minutes = entry.breakMinutes;
  if (entry.totalHours !== undefined) mapped.total_hours = entry.totalHours;
  if (entry.notes !== undefined) mapped.notes = entry.notes;
  if (entry.status !== undefined) mapped.status = entry.status;
  if (entry.approvedBy !== undefined) mapped.approved_by = entry.approvedBy;
  if (entry.approvedAt !== undefined) mapped.approved_at = entry.approvedAt;
  if (entry.createdBy !== undefined) mapped.created_by = entry.createdBy;
  mapped.updated_at = new Date().toISOString();
  return mapped;
};

export const WorkHoursProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [workHours, setWorkHours] = useState<WorkHoursEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const { currentUser, users } = useAuth();
  const useSupabase = isSupabaseConfigured();

  // Load work hours
  useEffect(() => {
    const loadWorkHours = async () => {
      if (useSupabase) {
        try {
          const { data, error } = await supabase
            .from('work_hours')
            .select('*')
            .order('work_date', { ascending: false });

          if (data && !error) {
            setWorkHours(data.map(mapSupabaseWorkHours));
          }
        } catch (error) {
          console.error('Error loading work hours:', error);
        }
      } else {
        // localStorage fallback
        try {
          const stored = localStorage.getItem(STORAGE_KEY);
          if (stored) {
            setWorkHours(JSON.parse(stored));
          }
        } catch (error) {
          console.error('Error loading work hours from localStorage:', error);
        }
      }
      setLoading(false);
    };

    loadWorkHours();
  }, [useSupabase]);

  // Save to localStorage when using localStorage mode
  useEffect(() => {
    if (!loading && !useSupabase) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(workHours));
    }
  }, [workHours, loading, useSupabase]);

  // Subscribe to real-time changes if using Supabase
  useEffect(() => {
    if (!useSupabase) return;

    const channel = supabase
      .channel('work_hours_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'work_hours' },
        async () => {
          // Reload work hours when changes detected
          const { data } = await supabase
            .from('work_hours')
            .select('*')
            .order('work_date', { ascending: false });
          if (data) {
            setWorkHours(data.map(mapSupabaseWorkHours));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [useSupabase]);

  const addWorkHours = useCallback(async (entryData: Omit<WorkHoursEntry, 'id' | 'createdAt' | 'createdBy' | 'status'>) => {
    if (!currentUser) return;

    const totalHours = calculateTotalHours(entryData.startTime, entryData.endTime, entryData.breakMinutes);

    const newEntry: WorkHoursEntry = {
      ...entryData,
      id: generateId(),
      totalHours,
      status: 'pending',
      createdBy: currentUser.id,
      createdAt: new Date().toISOString(),
    };

    if (useSupabase) {
      try {
        const { data, error } = await supabase
          .from('work_hours')
          .insert([{
            employee_id: newEntry.employeeId,
            work_date: newEntry.workDate,
            start_time: newEntry.startTime,
            end_time: newEntry.endTime,
            break_minutes: newEntry.breakMinutes,
            total_hours: newEntry.totalHours,
            notes: newEntry.notes,
            status: newEntry.status,
            created_by: newEntry.createdBy,
          }])
          .select()
          .single();

        if (data && !error) {
          setWorkHours(prev => [mapSupabaseWorkHours(data), ...prev]);
        }
      } catch (error) {
        console.error('Error adding work hours:', error);
      }
    } else {
      setWorkHours(prev => [newEntry, ...prev]);
    }
  }, [currentUser, useSupabase]);

  const updateWorkHours = useCallback(async (id: string, updates: Partial<WorkHoursEntry>) => {
    // Recalculate total hours if time fields changed
    let finalUpdates = { ...updates };

    const existing = workHours.find(wh => wh.id === id);
    if (existing && (updates.startTime || updates.endTime || updates.breakMinutes !== undefined)) {
      const startTime = updates.startTime || existing.startTime;
      const endTime = updates.endTime || existing.endTime;
      const breakMinutes = updates.breakMinutes ?? existing.breakMinutes;
      finalUpdates.totalHours = calculateTotalHours(startTime, endTime, breakMinutes);
    }

    if (useSupabase) {
      try {
        const { error } = await supabase
          .from('work_hours')
          .update(mapToSupabase(finalUpdates))
          .eq('id', id);

        if (!error) {
          setWorkHours(prev => prev.map(wh =>
            wh.id === id ? { ...wh, ...finalUpdates, updatedAt: new Date().toISOString() } : wh
          ));
        }
      } catch (error) {
        console.error('Error updating work hours:', error);
      }
    } else {
      setWorkHours(prev => prev.map(wh =>
        wh.id === id ? { ...wh, ...finalUpdates, updatedAt: new Date().toISOString() } : wh
      ));
    }
  }, [useSupabase, workHours]);

  const deleteWorkHours = useCallback(async (id: string) => {
    if (useSupabase) {
      try {
        const { error } = await supabase
          .from('work_hours')
          .delete()
          .eq('id', id);

        if (!error) {
          setWorkHours(prev => prev.filter(wh => wh.id !== id));
        }
      } catch (error) {
        console.error('Error deleting work hours:', error);
      }
    } else {
      setWorkHours(prev => prev.filter(wh => wh.id !== id));
    }
  }, [useSupabase]);

  const approveWorkHours = useCallback(async (id: string) => {
    if (!currentUser) return;

    const updates: Partial<WorkHoursEntry> = {
      status: 'approved',
      approvedBy: currentUser.id,
      approvedAt: new Date().toISOString(),
    };

    await updateWorkHours(id, updates);
  }, [currentUser, updateWorkHours]);

  const rejectWorkHours = useCallback(async (id: string) => {
    if (!currentUser) return;

    const updates: Partial<WorkHoursEntry> = {
      status: 'rejected',
      approvedBy: currentUser.id,
      approvedAt: new Date().toISOString(),
    };

    await updateWorkHours(id, updates);
  }, [currentUser, updateWorkHours]);

  const getWorkHoursById = useCallback((id: string) => {
    return workHours.find(wh => wh.id === id);
  }, [workHours]);

  const getWorkHoursByEmployee = useCallback((employeeId: string) => {
    return workHours.filter(wh => wh.employeeId === employeeId);
  }, [workHours]);

  const getWorkHoursByDate = useCallback((date: string) => {
    return workHours.filter(wh => wh.workDate === date);
  }, [workHours]);

  const getWorkHoursByDateRange = useCallback((startDate: string, endDate: string) => {
    return workHours.filter(wh => wh.workDate >= startDate && wh.workDate <= endDate);
  }, [workHours]);

  const getWorkHoursSummary = useCallback((employeeId: string, startDate: string, endDate: string): WorkHoursSummary | null => {
    const employee = users.find(u => u.id === employeeId);
    if (!employee) return null;

    const entries = workHours.filter(wh =>
      wh.employeeId === employeeId &&
      wh.workDate >= startDate &&
      wh.workDate <= endDate
    );

    const totalHours = entries.reduce((sum, wh) => sum + wh.totalHours, 0);
    const approvedHours = entries.filter(wh => wh.status === 'approved').reduce((sum, wh) => sum + wh.totalHours, 0);
    const pendingHours = entries.filter(wh => wh.status === 'pending').reduce((sum, wh) => sum + wh.totalHours, 0);
    const uniqueDays = new Set(entries.map(wh => wh.workDate)).size;

    return {
      employeeId,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      periodStart: startDate,
      periodEnd: endDate,
      totalHours: Math.round(totalHours * 100) / 100,
      approvedHours: Math.round(approvedHours * 100) / 100,
      pendingHours: Math.round(pendingHours * 100) / 100,
      daysWorked: uniqueDays,
    };
  }, [workHours, users]);

  const getAllWorkHoursSummaries = useCallback((startDate: string, endDate: string): WorkHoursSummary[] => {
    const employeeIds = new Set(workHours.filter(wh =>
      wh.workDate >= startDate && wh.workDate <= endDate
    ).map(wh => wh.employeeId));

    return Array.from(employeeIds)
      .map(id => getWorkHoursSummary(id, startDate, endDate))
      .filter((summary): summary is WorkHoursSummary => summary !== null)
      .sort((a, b) => b.totalHours - a.totalHours);
  }, [workHours, getWorkHoursSummary]);

  const value = useMemo(() => ({
    workHours,
    addWorkHours,
    updateWorkHours,
    deleteWorkHours,
    approveWorkHours,
    rejectWorkHours,
    getWorkHoursById,
    getWorkHoursByEmployee,
    getWorkHoursByDate,
    getWorkHoursByDateRange,
    getWorkHoursSummary,
    getAllWorkHoursSummaries,
    loading,
  }), [
    workHours,
    addWorkHours,
    updateWorkHours,
    deleteWorkHours,
    approveWorkHours,
    rejectWorkHours,
    getWorkHoursById,
    getWorkHoursByEmployee,
    getWorkHoursByDate,
    getWorkHoursByDateRange,
    getWorkHoursSummary,
    getAllWorkHoursSummaries,
    loading,
  ]);

  return (
    <WorkHoursContext.Provider value={value}>
      {children}
    </WorkHoursContext.Provider>
  );
};

export const useWorkHours = () => {
  const context = useContext(WorkHoursContext);
  if (context === undefined) {
    throw new Error('useWorkHours must be used within a WorkHoursProvider');
  }
  return context;
};
