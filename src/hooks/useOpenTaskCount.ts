import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTask } from '../contexts/TaskContext';

/**
 * How many tasks are waiting on the signed-in person.
 *
 * "Open" means the same thing My Tasks means by it: assigned to me and not
 * yet done. Draft and archived tasks are left out because that page leaves
 * them out too — a badge that counted work the page then refused to show
 * would read as a bug. Completed and skipped are finished by definition.
 *
 * Overdue is counted as open rather than singled out: the badge is a nudge
 * to look, not a status report. The page itself says which ones are late.
 */
export const useOpenTaskCount = (): number => {
  const { currentUser } = useAuth();
  const { jobTasks } = useTask();

  return useMemo(() => {
    if (!currentUser) return 0;
    return jobTasks.filter(task =>
      task.assignedTo.includes(currentUser.id) &&
      (task.status === 'pending' || task.status === 'in-progress' || task.status === 'overdue')
    ).length;
  }, [jobTasks, currentUser]);
};
