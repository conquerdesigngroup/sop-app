import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTask } from '../contexts/TaskContext';
import { studioToday } from '../lib/studioDate';
import { JobTask } from '../types';

/**
 * The numbers the navigation shows as badges.
 *
 * WHY THIS EXISTS
 *
 * Overdue is computed client-side in three places already — the Job Tasks
 * filter, the Alerts page and the dashboard — each with the same rule written
 * out by hand: the scheduled date is before today and the task is not done.
 * A badge that counted it a fourth way would disagree with the page it links
 * to, which is worse than no badge. This is the rule the Alerts page uses,
 * lifted out so the bottom bar and the menu sheet count exactly what the
 * Alerts page lists.
 *
 * Deliberately NOT the stored `status === 'overdue'` alone. That is set by a
 * background sweep, so for the first part of every day a task that fell due
 * yesterday still reads 'pending' in the database.
 *
 * "Today" here is the STUDIO's date, not the viewer's — studioToday() pins
 * America/Los_Angeles. A scheduledDate is a bare calendar date chosen in the
 * studio's frame, and the push digest in supabase/functions/alert-push runs
 * this identical predicate against the studio's date. A badge resolved in the
 * viewer's zone would disagree with the notification landing on the same
 * phone. See src/lib/studioDate.ts for the full reasoning.
 */

export const isTaskOverdue = (task: JobTask, today: string = studioToday()): boolean => {
  if (task.status === 'archived' || task.status === 'draft' || task.status === 'completed') {
    return false;
  }
  return task.status === 'overdue' || task.scheduledDate < today;
};

export interface TaskCounts {
  /** Overdue tasks assigned to the signed-in person. Drives the My Tasks badge. */
  myOverdue: number;
  /** Overdue tasks across the whole team. Drives Job Tasks and Alerts. Zero for non-management. */
  allOverdue: number;
}

export const useTaskCounts = (): TaskCounts => {
  const { currentUser, isAdmin } = useAuth();
  const { jobTasks } = useTask();

  return useMemo(() => {
    const today = studioToday();
    let myOverdue = 0;
    let allOverdue = 0;
    for (const task of jobTasks) {
      if (!isTaskOverdue(task, today)) continue;
      if (isAdmin) allOverdue++;
      if (currentUser && task.assignedTo.includes(currentUser.id)) myOverdue++;
    }
    return { myOverdue, allOverdue };
  }, [jobTasks, currentUser, isAdmin]);
};
