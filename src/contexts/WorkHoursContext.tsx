import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useMemo } from 'react';
import { WorkHoursEntry, WorkHoursSummary, WorkDay, WorkCategory, EmployeePayRate, WorkHoursPay } from '../types';
import { useAuth } from './AuthContext';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

interface WorkHoursContextType {
  workHours: WorkHoursEntry[];
  addWorkHours: (entry: Omit<WorkHoursEntry, 'id' | 'createdAt' | 'createdBy' | 'status'>) => Promise<void>;
  updateWorkHours: (id: string, entry: Partial<WorkHoursEntry>) => Promise<void>;
  deleteWorkHours: (id: string) => Promise<void>;
  approveWorkHours: (id: string) => Promise<void>;
  rejectWorkHours: (id: string, reason?: string) => Promise<void>;
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
  // Work Categories (admin-managed; backs the Hours Input dropdown)
  workCategories: WorkCategory[];
  addWorkCategory: (name: string) => Promise<void>;
  updateWorkCategory: (id: string, updates: Partial<WorkCategory>) => Promise<void>;
  deleteWorkCategory: (id: string) => Promise<void>;
  getWorkCategoryName: (categoryId?: string | null) => string | undefined;
  // Pay — ADMIN ONLY. Both tables are gated on is_admin() by RLS, so for a
  // team member these arrays are simply empty; there is no client-side
  // filtering to forget. Never surface any of this in employee-facing UI.
  employeePayRates: EmployeePayRate[];
  workHoursPay: WorkHoursPay[];
  setEmployeePayRate: (employeeId: string, categoryId: string, hourlyRate: number) => Promise<void>;
  getEmployeePayRate: (employeeId: string, categoryId?: string | null) => number | undefined;
  getPayForEntry: (workHoursId: string) => WorkHoursPay | undefined;
  loading: boolean;
  /** Set when the initial fetch failed, so pages can say so instead of rendering an empty list. */
  loadError: string | null;
  /** False when migration v7 has not been applied; categories are unavailable. */
  hasV7Schema: boolean;
}

const WorkHoursContext = createContext<WorkHoursContextType | undefined>(undefined);

const STORAGE_KEY = 'sop_app_work_hours';
const WORK_DAYS_STORAGE_KEY = 'sop_app_work_days';
const WORK_CATEGORIES_STORAGE_KEY = 'sop_app_work_categories';
const PAY_RATES_STORAGE_KEY = 'sop_app_pay_rates';

/**
 * Turn a Supabase error into something a catch block can surface.
 *
 * Every mutation in this file used to do `if (!error) { ...update state }`
 * with no else branch, so a rejected write left the caller's `await`
 * resolving normally and the page showed a success toast for data that
 * never landed. RLS rejections are the common case — they are the whole
 * point of migration v6 — so this was losing real entries silently.
 */
const raise = (error: { message?: string } | null, action: string): void => {
  if (!error) return;
  throw new Error(error.message ? `${action}: ${error.message}` : action);
};

// Map Supabase data to WorkCategory type
const mapSupabaseWorkCategory = (dbEntry: any): WorkCategory => ({
  id: dbEntry.id,
  name: dbEntry.name,
  sortOrder: dbEntry.sort_order ?? 0,
  isActive: dbEntry.is_active !== false,
  createdAt: dbEntry.created_at,
  updatedAt: dbEntry.updated_at,
});

const mapSupabasePayRate = (d: any): EmployeePayRate => ({
  id: d.id,
  employeeId: d.employee_id,
  categoryId: d.category_id,
  hourlyRate: Number(d.hourly_rate) || 0,
  createdAt: d.created_at,
  updatedAt: d.updated_at,
});

const mapSupabaseWorkHoursPay = (d: any): WorkHoursPay => ({
  workHoursId: d.work_hours_id,
  rateSnapshot: Number(d.rate_snapshot) || 0,
  payAmount: Number(d.pay_amount) || 0,
  rateMissing: d.rate_missing === true,
  frozenAt: d.frozen_at,
});

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
    categoryId: dbEntry.category_id || undefined,
    notes: dbEntry.notes,
    status: dbEntry.status,
    approvedBy: dbEntry.approved_by,
    approvedAt: dbEntry.approved_at,
    rejectionReason: dbEntry.rejection_reason || undefined,
    createdBy: dbEntry.created_by,
    createdAt: dbEntry.created_at,
    updatedAt: dbEntry.updated_at,
  };
};

/**
 * Map app type to Supabase format.
 *
 * `hasV7` gates the two columns migration v7 adds. PostgREST rejects the
 * whole request with PGRST204 if the body names a column the table does
 * not have, so sending category_id to a database that has not run v7 would
 * break hours logging outright — on the older WorkHoursPage too, which
 * never asked for categories. Gating them keeps the frontend deployable
 * before, during, or after the migration.
 */
const mapToSupabase = (entry: Partial<WorkHoursEntry>, hasV7: boolean) => {
  const mapped: any = {};
  if (entry.employeeId !== undefined) mapped.employee_id = entry.employeeId;
  if (entry.workDate !== undefined) mapped.work_date = entry.workDate;
  if (entry.startTime !== undefined) mapped.start_time = entry.startTime;
  if (entry.endTime !== undefined) mapped.end_time = entry.endTime;
  if (entry.breakMinutes !== undefined) mapped.break_minutes = entry.breakMinutes;
  if (entry.totalHours !== undefined) mapped.total_hours = entry.totalHours;
  if (hasV7 && entry.categoryId !== undefined) mapped.category_id = entry.categoryId || null;
  if (entry.notes !== undefined) mapped.notes = entry.notes;
  if (entry.status !== undefined) mapped.status = entry.status;
  if (entry.approvedBy !== undefined) mapped.approved_by = entry.approvedBy;
  if (entry.approvedAt !== undefined) mapped.approved_at = entry.approvedAt;
  if (hasV7 && entry.rejectionReason !== undefined) mapped.rejection_reason = entry.rejectionReason || null;
  if (entry.createdBy !== undefined) mapped.created_by = entry.createdBy;
  mapped.updated_at = new Date().toISOString();
  return mapped;
};

export const WorkHoursProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [workHours, setWorkHours] = useState<WorkHoursEntry[]>([]);
  const [workDays, setWorkDays] = useState<WorkDay[]>([]);
  const [workCategories, setWorkCategories] = useState<WorkCategory[]>([]);
  // Admin-only. RLS returns zero rows to a team member, so an empty array
  // here is the expected state for them, not an error.
  const [employeePayRates, setEmployeePayRates] = useState<EmployeePayRate[]>([]);
  const [workHoursPay, setWorkHoursPay] = useState<WorkHoursPay[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Whether migration v7 (work_categories, work_hours.category_id,
  // work_hours.rejection_reason) has been applied to the connected
  // database. Probed on load; see mapToSupabase.
  const [hasV7Schema, setHasV7Schema] = useState(true);
  const { currentUser, users } = useAuth();
  const useSupabase = isSupabaseConfigured();

  // Load work hours and work days
  useEffect(() => {
    const loadData = async () => {
      setLoadError(null);
      if (useSupabase) {
        try {
          // Load work hours
          const { data: hoursData, error: hoursError } = await supabase
            .from('work_hours')
            .select('*')
            .order('work_date', { ascending: false });

          if (hoursData && !hoursError) {
            setWorkHours(hoursData.map(mapSupabaseWorkHours));
          } else if (hoursError) {
            // supabase-js returns query errors in the result rather than
            // throwing, so the surrounding try/catch never sees this. Left
            // unreported it looks identical to "you have logged no hours".
            console.error('Failed to load work hours:', hoursError.message);
            setLoadError('Could not load your hours. Check your connection and refresh.');
          }

          // Load work days
          const { data: daysData, error: daysError } = await supabase
            .from('work_days')
            .select('*')
            .order('work_date', { ascending: false });

          if (daysData && !daysError) {
            setWorkDays(daysData.map(mapSupabaseWorkDay));
          } else if (daysError) {
            console.error('Failed to load work days:', daysError.message);
          }

          // Load work categories. Tolerated as optional: on a database
          // where migration v7 has not been applied yet the table does
          // not exist, and the rest of the page must still work.
          const { data: catData, error: catError } = await supabase
            .from('work_categories')
            .select('*')
            .order('sort_order', { ascending: true });

          if (catData && !catError) {
            setWorkCategories(catData.map(mapSupabaseWorkCategory));
            setHasV7Schema(true);
            // Pay tables. A team member gets an empty result from RLS rather
            // than an error, so nothing here needs to branch on role.
            const [{ data: rateData }, { data: payData }] = await Promise.all([
              supabase.from('employee_pay_rates').select('*'),
              supabase.from('work_hours_pay').select('*'),
            ]);
            if (rateData) setEmployeePayRates(rateData.map(mapSupabasePayRate));
            if (payData) setWorkHoursPay(payData.map(mapSupabaseWorkHoursPay));
          } else if (catError) {
            // Doubles as the v7 probe: if work_categories is missing then
            // category_id and rejection_reason are missing too, and we must
            // stop sending them or every write fails.
            console.warn(
              'Migration v7 does not appear to be applied — work categories are disabled. ' +
              'Run supabase-migration-v7-hours-input.sql. Details:',
              catError.message
            );
            setWorkCategories([]);
            setEmployeePayRates([]);
            setWorkHoursPay([]);
            setHasV7Schema(false);
          }
        } catch (error: any) {
          console.error('Error loading work data:', error);
          setLoadError('Could not load your hours. Check your connection and refresh.');
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
          const storedCats = localStorage.getItem(WORK_CATEGORIES_STORAGE_KEY);
          if (storedCats) {
            setWorkCategories(JSON.parse(storedCats));
          }
          const storedRates = localStorage.getItem(PAY_RATES_STORAGE_KEY);
          if (storedRates) {
            setEmployeePayRates(JSON.parse(storedRates));
          }
        } catch (error) {
          console.error('Error loading work data from localStorage:', error);
        }
      }
      setLoading(false);
    };

    loadData();
    // currentUser?.id is a dependency because RLS scopes these tables by
    // auth.uid(): the rows a signed-out or previous user could see are not
    // the rows this user can see. Without it, switching accounts kept the
    // old user's (now unauthorised, hence empty) result set.
  }, [useSupabase, currentUser?.id]);

  // Save to localStorage when using localStorage mode
  useEffect(() => {
    if (!loading && !useSupabase) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(workHours));
      localStorage.setItem(WORK_DAYS_STORAGE_KEY, JSON.stringify(workDays));
      localStorage.setItem(WORK_CATEGORIES_STORAGE_KEY, JSON.stringify(workCategories));
      localStorage.setItem(PAY_RATES_STORAGE_KEY, JSON.stringify(employeePayRates));
    }
  }, [workHours, workDays, workCategories, employeePayRates, loading, useSupabase]);

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
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'work_categories' },
        async () => {
          // Reload categories when an admin edits the list
          const { data } = await supabase
            .from('work_categories')
            .select('*')
            .order('sort_order', { ascending: true });
          if (data) {
            setWorkCategories(data.map(mapSupabaseWorkCategory));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [useSupabase]);

  const addWorkHours = useCallback(async (entryData: Omit<WorkHoursEntry, 'id' | 'createdAt' | 'createdBy' | 'status'>) => {
    if (!currentUser) throw new Error('You are not signed in.');

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
      const { data, error } = await supabase
        .from('work_hours')
        .insert([{
          employee_id: newEntry.employeeId,
          work_date: newEntry.workDate,
          start_time: newEntry.startTime,
          end_time: newEntry.endTime,
          break_minutes: newEntry.breakMinutes,
          ...(hasV7Schema ? { category_id: newEntry.categoryId || null } : {}),
          notes: newEntry.notes,
          status: newEntry.status,
          created_by: newEntry.createdBy,
          // total_hours is deliberately not sent: a trigger added in
          // migration v7 computes it from the times and the break.
        }])
        .select()
        .single();

      raise(error, 'Could not save these hours');
      if (!data) {
        throw new Error(
          'Could not save these hours: the database returned no row. ' +
          'This usually means a security policy rejected the write.'
        );
      }
      setWorkHours(prev => [mapSupabaseWorkHours(data), ...prev]);
    } else {
      setWorkHours(prev => [newEntry, ...prev]);
    }
  }, [currentUser, useSupabase, hasV7Schema]);

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

    // Editing a sent-back entry re-submits it for review.
    //
    // This lives here rather than in a page because v7's RLS is asymmetric:
    // USING lets an employee touch a 'pending' OR 'rejected' row, but
    // WITH CHECK demands the row they write back be 'pending'. Any caller
    // that edits a rejected entry without flipping the status gets a bare
    // "no matching entry" rejection. Doing it centrally means the older
    // WorkHoursPage gets the same behaviour for free, and it reads the
    // status from live state rather than from a snapshot a modal captured
    // minutes ago.
    if (existing?.status === 'rejected' && finalUpdates.status === undefined) {
      finalUpdates.status = 'pending';
      finalUpdates.rejectionReason = null;
    }

    if (useSupabase) {
      // .select() matters here beyond convenience: an UPDATE blocked by
      // RLS is not an error, it simply matches zero rows. Without asking
      // for the changed rows back there is no way to tell "saved" from
      // "silently refused", and the caller would report success either way.
      const { data, error } = await supabase
        .from('work_hours')
        .update(mapToSupabase(finalUpdates, hasV7Schema))
        .eq('id', id)
        .select();

      raise(error, 'Could not update these hours');
      if (!data || data.length === 0) {
        throw new Error(
          'Could not update these hours: no matching entry. ' +
          'Approved entries are locked, and you can only change your own.'
        );
      }
      // Trust the returned row over the local guess — total_hours is
      // recomputed by the database, not by us.
      setWorkHours(prev => prev.map(wh =>
        wh.id === id ? mapSupabaseWorkHours(data[0]) : wh
      ));
    } else {
      const updated = existing ? { ...existing, ...finalUpdates } : undefined;
      setWorkHours(prev => prev.map(wh =>
        wh.id === id ? { ...wh, ...finalUpdates, updatedAt: new Date().toISOString() } : wh
      ));

      // localStorage mode has no database, so work_hours_freeze_pay from
      // migration v7 §12 never runs. Mirror it here, or the fallback
      // silently reports every approved entry as $0.00.
      if (updated) {
        if (updated.status === 'approved') {
          setWorkHoursPay(prev => {
            const already = prev.find(pp => pp.workHoursId === id);
            if (already) {
              // Re-multiply against the SAME frozen rate, as the trigger
              // does — never re-look-up a rate that may have changed since.
              return prev.map(pp => pp.workHoursId === id
                ? { ...pp, payAmount: Math.round(updated.totalHours * pp.rateSnapshot * 100) / 100 }
                : pp);
            }
            const rate = employeePayRates.find(
              r => r.employeeId === updated.employeeId && r.categoryId === updated.categoryId
            )?.hourlyRate;
            return [...prev, {
              workHoursId: id,
              rateSnapshot: rate ?? 0,
              payAmount: Math.round(updated.totalHours * (rate ?? 0) * 100) / 100,
              rateMissing: rate === undefined,
              frozenAt: new Date().toISOString(),
            }];
          });
        } else {
          setWorkHoursPay(prev => prev.filter(pp => pp.workHoursId !== id));
        }
      }
    }
  }, [useSupabase, workHours, hasV7Schema, employeePayRates]);

  const deleteWorkHours = useCallback(async (id: string) => {
    if (useSupabase) {
      const { data, error } = await supabase
        .from('work_hours')
        .delete()
        .eq('id', id)
        .select();

      raise(error, 'Could not delete this entry');
      if (!data || data.length === 0) {
        throw new Error(
          'Could not delete this entry: no matching entry. ' +
          'Approved entries are locked, and you can only delete your own.'
        );
      }
      setWorkHours(prev => prev.filter(wh => wh.id !== id));
    } else {
      setWorkHours(prev => prev.filter(wh => wh.id !== id));
    }
  }, [useSupabase]);

  // Approving locks the entry: migration v7's RLS policy lets an employee
  // touch only their own 'pending' or 'rejected' rows, so once this lands
  // the employee can no longer edit or delete it.
  const approveWorkHours = useCallback(async (id: string) => {
    if (!currentUser) throw new Error('You are not signed in.');

    await updateWorkHours(id, {
      status: 'approved',
      approvedBy: currentUser.id,
      approvedAt: new Date().toISOString(),
      // null, not undefined — mapToSupabase omits undefined keys, so
      // undefined would leave a stale reason on a now-approved entry.
      rejectionReason: null,
    });
  }, [currentUser, updateWorkHours]);

  // Rejecting sends it back for correction rather than locking it — the
  // employee can edit a rejected entry, and saving returns it to 'pending'.
  const rejectWorkHours = useCallback(async (id: string, reason?: string) => {
    if (!currentUser) throw new Error('You are not signed in.');

    await updateWorkHours(id, {
      status: 'rejected',
      approvedBy: currentUser.id,
      approvedAt: new Date().toISOString(),
      rejectionReason: reason?.trim() || null,
    });
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
    if (!currentUser) throw new Error('You are not signed in.');

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

      raise(error, 'Could not add this working day');
      if (!data) throw new Error('Could not add this working day: the database returned no row.');
      setWorkDays(prev => [mapSupabaseWorkDay(data), ...prev]);
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
      const mapped: any = {};
      if (updates.status !== undefined) mapped.status = updates.status;
      if (updates.notes !== undefined) mapped.notes = updates.notes;
      mapped.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from('work_days')
        .update(mapped)
        .eq('id', id)
        .select();

      raise(error, 'Could not update this working day');
      if (!data || data.length === 0) {
        throw new Error('Could not update this working day: no matching day, or you do not have permission.');
      }
      setWorkDays(prev => prev.map(wd =>
        wd.id === id ? mapSupabaseWorkDay(data[0]) : wd
      ));
    } else {
      setWorkDays(prev => prev.map(wd =>
        wd.id === id ? { ...wd, ...updates, updatedAt: new Date().toISOString() } : wd
      ));
    }
  }, [useSupabase]);

  const deleteWorkDay = useCallback(async (id: string) => {
    if (useSupabase) {
      const { data, error } = await supabase
        .from('work_days')
        .delete()
        .eq('id', id)
        .select();

      raise(error, 'Could not remove this working day');
      if (!data || data.length === 0) {
        throw new Error('Could not remove this working day: no matching day, or you do not have permission.');
      }
      setWorkDays(prev => prev.filter(wd => wd.id !== id));
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

  // ==================== WORK CATEGORIES ====================
  // Writes are admin-only, enforced by the "work_categories_write" policy
  // in migration v7. A non-admin calling these gets a rejection, not a
  // silent no-op.

  const addWorkCategory = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Give the category a name.');

    const clash = workCategories.some(
      c => c.isActive && c.name.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (clash) throw new Error(`"${trimmed}" already exists.`);

    // Append to the end of the list.
    const sortOrder = workCategories.reduce((max, c) => Math.max(max, c.sortOrder), 0) + 10;

    if (useSupabase) {
      const { data, error } = await supabase
        .from('work_categories')
        .insert([{ name: trimmed, sort_order: sortOrder }])
        .select()
        .single();

      raise(error, 'Could not add this category');
      if (!data) throw new Error('Could not add this category: only admins can change the list.');
      setWorkCategories(prev => [...prev, mapSupabaseWorkCategory(data)]);
    } else {
      setWorkCategories(prev => [...prev, {
        id: generateId('wc'),
        name: trimmed,
        sortOrder,
        isActive: true,
        createdAt: new Date().toISOString(),
      }]);
    }
  }, [useSupabase, workCategories]);

  const updateWorkCategory = useCallback(async (id: string, updates: Partial<WorkCategory>) => {
    if (useSupabase) {
      const mapped: any = {};
      if (updates.name !== undefined) mapped.name = updates.name.trim();
      if (updates.sortOrder !== undefined) mapped.sort_order = updates.sortOrder;
      if (updates.isActive !== undefined) mapped.is_active = updates.isActive;

      const { data, error } = await supabase
        .from('work_categories')
        .update(mapped)
        .eq('id', id)
        .select();

      raise(error, 'Could not update this category');
      if (!data || data.length === 0) {
        throw new Error('Could not update this category: only admins can change the list.');
      }
      setWorkCategories(prev => prev.map(c =>
        c.id === id ? mapSupabaseWorkCategory(data[0]) : c
      ));
    } else {
      setWorkCategories(prev => prev.map(c => (c.id === id ? { ...c, ...updates } : c)));
    }
  }, [useSupabase]);

  /**
   * Retires a category rather than deleting the row.
   *
   * Hours already logged against it keep their category_id, so historical
   * entries still show a label. A hard DELETE would set those to NULL
   * (ON DELETE SET NULL) and silently strip the category off past payroll.
   */
  const deleteWorkCategory = useCallback(async (id: string) => {
    await updateWorkCategory(id, { isActive: false });
  }, [updateWorkCategory]);

  // ==================== PAY (ADMIN ONLY) ====================
  // Every write below is refused by RLS for a non-admin. That is the real
  // guard; the UI hides these controls as a courtesy, not as security.

  /** Upsert one employee's rate for one category. */
  const setEmployeePayRate = useCallback(async (
    employeeId: string,
    categoryId: string,
    hourlyRate: number,
  ) => {
    if (!Number.isFinite(hourlyRate) || hourlyRate < 0) {
      throw new Error('Enter a rate of 0 or more.');
    }
    // NUMERIC(10,2): round rather than let Postgres reject or silently
    // truncate a third decimal place.
    const rate = Math.round(hourlyRate * 100) / 100;

    if (useSupabase) {
      const { data, error } = await supabase
        .from('employee_pay_rates')
        .upsert(
          { employee_id: employeeId, category_id: categoryId, hourly_rate: rate },
          { onConflict: 'employee_id,category_id' }
        )
        .select()
        .single();

      raise(error, 'Could not save this rate');
      if (!data) throw new Error('Could not save this rate: only admins can change pay rates.');

      const mapped = mapSupabasePayRate(data);
      setEmployeePayRates(prev => {
        const without = prev.filter(r => !(r.employeeId === employeeId && r.categoryId === categoryId));
        return [...without, mapped];
      });
    } else {
      setEmployeePayRates(prev => {
        const without = prev.filter(r => !(r.employeeId === employeeId && r.categoryId === categoryId));
        return [...without, {
          id: generateId('pr'),
          employeeId,
          categoryId,
          hourlyRate: rate,
          createdAt: new Date().toISOString(),
        }];
      });
    }
  }, [useSupabase]);

  /** The configured rate, or undefined when none is set (which pays 0). */
  const getEmployeePayRate = useCallback((employeeId: string, categoryId?: string | null) => {
    if (!categoryId) return undefined;
    return employeePayRates.find(r => r.employeeId === employeeId && r.categoryId === categoryId)?.hourlyRate;
  }, [employeePayRates]);

  /** Frozen pay for an approved entry; undefined while it is not approved. */
  const getPayForEntry = useCallback((workHoursId: string) => {
    return workHoursPay.find(p => p.workHoursId === workHoursId);
  }, [workHoursPay]);

  const getWorkCategoryName = useCallback((categoryId?: string | null) => {
    if (!categoryId) return undefined;
    return workCategories.find(c => c.id === categoryId)?.name;
  }, [workCategories]);

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
    // Work Categories
    workCategories,
    addWorkCategory,
    updateWorkCategory,
    deleteWorkCategory,
    getWorkCategoryName,
    employeePayRates,
    workHoursPay,
    setEmployeePayRate,
    getEmployeePayRate,
    getPayForEntry,
    loading,
    loadError,
    hasV7Schema,
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
    workCategories,
    addWorkCategory,
    updateWorkCategory,
    deleteWorkCategory,
    getWorkCategoryName,
    employeePayRates,
    workHoursPay,
    setEmployeePayRate,
    getEmployeePayRate,
    getPayForEntry,
    loading,
    loadError,
    hasV7Schema,
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
