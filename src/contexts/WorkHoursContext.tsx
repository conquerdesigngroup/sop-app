import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useMemo } from 'react';
import { WorkHoursEntry, WorkHoursSummary, WorkDay } from '../types';
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
  // Working Days (simple day marking)
  workDays: WorkDay[];
  addWorkDay: (employeeId: string, date: string, notes?: string) => Promise<void>;
  addWorkDays: (employeeId: string, dates: string[], notes?: string) => Promise<void>;
  updateWorkDay: (id: string, updates: Partial<WorkDay>) => Promise<void>;
  deleteWorkDay: (id: string) => Promise<void>;
  getWorkDaysByEmployee: (employeeId: string) => WorkDay[];
  getWorkDaysByDateRange: (startDate: string, endDate: string) => WorkDay[];
  loading: boolean;
}

const WorkHoursContext = createContext<WorkHoursContextType | undefined>(undefined);

const STORAGE_KEY = 'sop_app_work_hours';
const WORK_DAYS_STORAGE_KEY = 'sop_app_work_days';

// Generate unique ID
const generateId = (prefix: string = 'wh') => {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Map Supabase data to WorkDay type
const mapSupabaseWorkDay = (dbEntry: any): WorkDay => {
  return {
    id: dbEntry.id,
    employeeId: dbEntry.employee_id,
    workDate: dbEntry.work_date,
    status: dbEntry.status,
    notes: dbEntry.notes,
    createdBy: dbEntry.created_by,
    createdAt: dbEntry.created_at,
    updatedAt: dbEntry.updated_at,
  };
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
  const [workDays, setWorkDays] = useState<WorkDay[]>([]);
  const [loading, setLoading] = useState(true);
  const { currentUser, users } = useAuth();
  const useSupabase = isSupabaseConfigured();

  // Load work hours and work days
  useEffect(() => {
    const loadData = async () => {
      if (useSupabase) {
        try {
          // Load work hours
          const { data: hoursData, error: hoursError } = await supabase
            .from('work_hours')
            .select('*')
            .order('work_date', { ascending: false });

          if (hoursData && !hoursError) {
            setWorkHours(hoursData.map(mapSupabaseWorkHours));
          }

          // Load work days
          const { data: daysData, error: daysError } = await supabase
            .from('work_days')
            .select('*')
            .order('work_date', { ascending: false });

          if (daysData && !daysError) {
            setWorkDays(daysData.map(mapSupabaseWorkDay));
          }
        } catch (error) {
          console.error('Error loading work data:', error);
        }
      } else {
        // localStorage fallback
        try {
          const storedHours = localStorage.getItem(STORAGE_KEY);
          if (storedHours) {
            setWorkHours(JSON.parse(storedHours));
          }
          const storedDays = localStorage.getItem(WORK_DAYS_STORAGE_KEY);
          if (storedDays) {
            setWorkDays(JSON.parse(storedDays));
          }
        } catch (error) {
          console.error('Error loading work data from localStorage:', error);
        }
      }
      setLoading(false);
    };

    loadData();
  }, [useSupabase]);

  // Save to localStorage when using localStorage mode
  useEffect(() => {
    if (!loading && !useSupabase) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(workHours));
      localStorage.setItem(WORK_DAYS_STORAGE_KEY, JSON.stringify(workDays));
    }
  }, [workHours, workDays, loading, useSupabase]);

  // Subscribe to real-time changes if using Supabase
  useEffect(() => {
    if (!useSupabase) return;

    const channel = supabase
      .channel('work_data_changes')
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
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'work_days' },
        async () => {
          // Reload work days when changes detected
          const { data } = await supabase
            .from('work_days')
            .select('*')
            .order('work_date', { ascending: false });
          if (data) {
            setWorkDays(data.map(mapSupabaseWorkDay));
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

  // ==================== WORK DAYS FUNCTIONS ====================

  const addWorkDay = useCallback(async (employeeId: string, date: string, notes?: string) => {
    if (!currentUser) return;

    const newWorkDay: WorkDay = {
      id: generateId('wd'),
      employeeId,
      workDate: date,
      status: 'scheduled',
      notes,
      createdBy: currentUser.id,
      createdAt: new Date().toISOString(),
    };

    if (useSupabase) {
      try {
        const { data, error } = await supabase
          .from('work_days')
          .insert([{
            employee_id: newWorkDay.employeeId,
            work_date: newWorkDay.workDate,
            status: newWorkDay.status,
            notes: newWorkDay.notes,
            created_by: newWorkDay.createdBy,
          }])
          .select()
          .single();

        if (data && !error) {
          setWorkDays(prev => [mapSupabaseWorkDay(data), ...prev]);
        }
      } catch (error) {
        console.error('Error adding work day:', error);
      }
    } else {
      setWorkDays(prev => [newWorkDay, ...prev]);
    }
  }, [currentUser, useSupabase]);

  const addWorkDays = useCallback(async (employeeId: string, dates: string[], notes?: string) => {
    if (!currentUser) {
      throw new Error('No current user');
    }

    // Remove duplicates from the dates array
    const uniqueDates = Array.from(new Set(dates));

    const newWorkDays: WorkDay[] = uniqueDates.map(date => ({
      id: generateId('wd'),
      employeeId,
      workDate: date,
      status: 'scheduled' as const,
      notes,
      createdBy: currentUser.id,
      createdAt: new Date().toISOString(),
    }));

    if (useSupabase) {
      const insertData = newWorkDays.map(wd => ({
        employee_id: wd.employeeId,
        work_date: wd.workDate,
        status: wd.status,
        notes: wd.notes,
        created_by: wd.createdBy,
      }));

      // Use upsert with onConflict to ignore duplicates instead of throwing errors
      // The unique constraint is on (employee_id, work_date)
      const { data, error } = await supabase
        .from('work_days')
        .upsert(insertData, {
          onConflict: 'employee_id,work_date',
          ignoreDuplicates: true
        })
        .select();

      if (error) {
        throw error;
      }

      if (data) {
        setWorkDays(prev => [...data.map(mapSupabaseWorkDay), ...prev]);
      }
    } else {
      // For localStorage, filter out any dates that already exist
      setWorkDays(prev => {
        const existingDates = prev
          .filter(wd => wd.employeeId === employeeId)
          .map(wd => wd.workDate);
        const filteredNewWorkDays = newWorkDays.filter(
          wd => !existingDates.includes(wd.workDate)
        );
        return [...filteredNewWorkDays, ...prev];
      });
    }
  }, [currentUser, useSupabase]);

  const updateWorkDay = useCallback(async (id: string, updates: Partial<WorkDay>) => {
    if (useSupabase) {
      try {
        const mapped: any = {};
        if (updates.status !== undefined) mapped.status = updates.status;
        if (updates.notes !== undefined) mapped.notes = updates.notes;
        mapped.updated_at = new Date().toISOString();

        const { error } = await supabase
          .from('work_days')
          .update(mapped)
          .eq('id', id);

        if (!error) {
          setWorkDays(prev => prev.map(wd =>
            wd.id === id ? { ...wd, ...updates, updatedAt: new Date().toISOString() } : wd
          ));
        }
      } catch (error) {
        console.error('Error updating work day:', error);
      }
    } else {
      setWorkDays(prev => prev.map(wd =>
        wd.id === id ? { ...wd, ...updates, updatedAt: new Date().toISOString() } : wd
      ));
    }
  }, [useSupabase]);

  const deleteWorkDay = useCallback(async (id: string) => {
    if (useSupabase) {
      try {
        const { error } = await supabase
          .from('work_days')
          .delete()
          .eq('id', id);

        if (!error) {
          setWorkDays(prev => prev.filter(wd => wd.id !== id));
        }
      } catch (error) {
        console.error('Error deleting work day:', error);
      }
    } else {
      setWorkDays(prev => prev.filter(wd => wd.id !== id));
    }
  }, [useSupabase]);

  const getWorkDaysByEmployee = useCallback((employeeId: string) => {
    return workDays.filter(wd => wd.employeeId === employeeId);
  }, [workDays]);

  const getWorkDaysByDateRange = useCallback((startDate: string, endDate: string) => {
    return workDays.filter(wd => wd.workDate >= startDate && wd.workDate <= endDate);
  }, [workDays]);

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
    // Work Days
    workDays,
    addWorkDay,
    addWorkDays,
    updateWorkDay,
    deleteWorkDay,
    getWorkDaysByEmployee,
    getWorkDaysByDateRange,
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
    workDays,
    addWorkDay,
    addWorkDays,
    updateWorkDay,
    deleteWorkDay,
    getWorkDaysByEmployee,
    getWorkDaysByDateRange,
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
