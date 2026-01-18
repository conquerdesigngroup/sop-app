/**
 * Data Integrity Agent
 *
 * An automated service that detects and fixes data inconsistencies across the app.
 * Runs checks on tasks, SOPs, users, and system health.
 */

import { supabase, isSupabaseConfigured } from '../lib/supabase';

// Types for integrity check results
export interface IntegrityIssue {
  id: string;
  type: 'error' | 'warning' | 'info';
  category: 'task' | 'sop' | 'user' | 'system';
  title: string;
  description: string;
  affectedRecords: string[];
  autoFixable: boolean;
  fixAction?: () => Promise<void>;
}

export interface IntegrityCheckResult {
  timestamp: string;
  duration: number;
  totalIssues: number;
  errors: number;
  warnings: number;
  infos: number;
  issues: IntegrityIssue[];
  checksRun: string[];
}

// Helper to generate unique IDs
const generateIssueId = () => `issue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

/**
 * Check 1: Task Progress Consistency
 * Verifies that progress percentage matches completed steps
 */
async function checkTaskProgressConsistency(): Promise<IntegrityIssue[]> {
  const issues: IntegrityIssue[] = [];

  if (!isSupabaseConfigured()) return issues;

  try {
    const { data: tasks, error } = await supabase
      .from('job_tasks')
      .select('id, title, steps, completed_steps, progress_percentage, status')
      .neq('status', 'archived');

    if (error || !tasks) return issues;

    for (const task of tasks) {
      const steps = task.steps || [];
      const completedSteps = task.completed_steps || [];
      const totalSteps = steps.length;
      const completedCount = completedSteps.length;

      // Calculate expected progress
      const expectedProgress = totalSteps > 0
        ? Math.round((completedCount / totalSteps) * 100)
        : 0;

      const actualProgress = task.progress_percentage || 0;

      if (expectedProgress !== actualProgress) {
        issues.push({
          id: generateIssueId(),
          type: 'error',
          category: 'task',
          title: 'Progress Mismatch',
          description: `Task "${task.title}" has ${completedCount}/${totalSteps} steps completed but shows ${actualProgress}% (should be ${expectedProgress}%)`,
          affectedRecords: [task.id],
          autoFixable: true,
          fixAction: async () => {
            await supabase
              .from('job_tasks')
              .update({ progress_percentage: expectedProgress })
              .eq('id', task.id);
          },
        });
      }

      // Check for completed tasks that aren't at 100%
      if (task.status === 'completed' && actualProgress !== 100 && totalSteps > 0) {
        issues.push({
          id: generateIssueId(),
          type: 'warning',
          category: 'task',
          title: 'Completed Task Not at 100%',
          description: `Task "${task.title}" is marked completed but progress is only ${actualProgress}%`,
          affectedRecords: [task.id],
          autoFixable: true,
          fixAction: async () => {
            // Mark all steps as completed and set progress to 100%
            const allStepIds = steps.map((s: any) => s.id);
            await supabase
              .from('job_tasks')
              .update({
                progress_percentage: 100,
                completed_steps: allStepIds
              })
              .eq('id', task.id);
          },
        });
      }
    }
  } catch (err) {
    console.error('Error checking task progress consistency:', err);
  }

  return issues;
}

/**
 * Check 2: Orphaned Task Assignments
 * Finds tasks assigned to users who no longer exist
 */
async function checkOrphanedAssignments(): Promise<IntegrityIssue[]> {
  const issues: IntegrityIssue[] = [];

  if (!isSupabaseConfigured()) return issues;

  try {
    // Get all user IDs
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id');

    if (profileError || !profiles) return issues;

    const validUserIds = new Set(profiles.map((p: any) => p.id));

    // Check job_tasks
    const { data: tasks, error: taskError } = await supabase
      .from('job_tasks')
      .select('id, title, assigned_to')
      .neq('status', 'archived');

    if (taskError || !tasks) return issues;

    for (const task of tasks) {
      const assignedTo = task.assigned_to || [];
      const invalidAssignees = assignedTo.filter((userId: string) => !validUserIds.has(userId));

      if (invalidAssignees.length > 0) {
        issues.push({
          id: generateIssueId(),
          type: 'error',
          category: 'task',
          title: 'Orphaned Assignment',
          description: `Task "${task.title}" is assigned to ${invalidAssignees.length} non-existent user(s)`,
          affectedRecords: [task.id, ...invalidAssignees],
          autoFixable: true,
          fixAction: async () => {
            const validAssignees = assignedTo.filter((userId: string) => validUserIds.has(userId));
            await supabase
              .from('job_tasks')
              .update({ assigned_to: validAssignees })
              .eq('id', task.id);
          },
        });
      }
    }
  } catch (err) {
    console.error('Error checking orphaned assignments:', err);
  }

  return issues;
}

/**
 * Check 3: Stale In-Progress Tasks
 * Finds tasks that have been "in-progress" for too long without updates
 */
async function checkStaleTasks(): Promise<IntegrityIssue[]> {
  const issues: IntegrityIssue[] = [];

  if (!isSupabaseConfigured()) return issues;

  try {
    const { data: tasks, error } = await supabase
      .from('job_tasks')
      .select('id, title, status, updated_at, started_at, scheduled_date')
      .eq('status', 'in-progress');

    if (error || !tasks) return issues;

    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    for (const task of tasks) {
      const updatedAt = new Date(task.updated_at);
      const startedAt = task.started_at ? new Date(task.started_at) : updatedAt;

      if (updatedAt < sevenDaysAgo) {
        issues.push({
          id: generateIssueId(),
          type: 'error',
          category: 'task',
          title: 'Stale Task (7+ days)',
          description: `Task "${task.title}" has been in-progress for over 7 days without updates`,
          affectedRecords: [task.id],
          autoFixable: false,
        });
      } else if (updatedAt < threeDaysAgo) {
        issues.push({
          id: generateIssueId(),
          type: 'warning',
          category: 'task',
          title: 'Stale Task (3+ days)',
          description: `Task "${task.title}" has been in-progress for over 3 days without updates`,
          affectedRecords: [task.id],
          autoFixable: false,
        });
      }
    }
  } catch (err) {
    console.error('Error checking stale tasks:', err);
  }

  return issues;
}

/**
 * Check 4: Overdue Tasks Not Marked
 * Finds tasks past their due date that aren't marked as overdue
 */
async function checkOverdueTasks(): Promise<IntegrityIssue[]> {
  const issues: IntegrityIssue[] = [];

  if (!isSupabaseConfigured()) return issues;

  try {
    const { data: tasks, error } = await supabase
      .from('job_tasks')
      .select('id, title, status, scheduled_date, due_time')
      .in('status', ['pending', 'in-progress']);

    if (error || !tasks) return issues;

    const now = new Date();
    const today = now.toISOString().split('T')[0];

    for (const task of tasks) {
      const dueDate = task.scheduled_date;

      if (dueDate < today) {
        issues.push({
          id: generateIssueId(),
          type: 'error',
          category: 'task',
          title: 'Unmarked Overdue Task',
          description: `Task "${task.title}" was due on ${dueDate} but is not marked as overdue`,
          affectedRecords: [task.id],
          autoFixable: true,
          fixAction: async () => {
            await supabase
              .from('job_tasks')
              .update({ status: 'overdue' })
              .eq('id', task.id);
          },
        });
      }
    }
  } catch (err) {
    console.error('Error checking overdue tasks:', err);
  }

  return issues;
}

/**
 * Check 5: Duplicate Tasks
 * Finds potential duplicate tasks created on the same day
 */
async function checkDuplicateTasks(): Promise<IntegrityIssue[]> {
  const issues: IntegrityIssue[] = [];

  if (!isSupabaseConfigured()) return issues;

  try {
    const { data: tasks, error } = await supabase
      .from('job_tasks')
      .select('id, title, scheduled_date, assigned_to, created_at')
      .neq('status', 'archived')
      .order('created_at', { ascending: false });

    if (error || !tasks) return issues;

    // Group tasks by title + scheduled_date
    const taskGroups = new Map<string, typeof tasks>();

    for (const task of tasks) {
      const key = `${task.title.toLowerCase().trim()}_${task.scheduled_date}`;
      if (!taskGroups.has(key)) {
        taskGroups.set(key, []);
      }
      taskGroups.get(key)!.push(task);
    }

    // Find duplicates
    taskGroups.forEach((group, key) => {
      if (group.length > 1) {
        issues.push({
          id: generateIssueId(),
          type: 'warning',
          category: 'task',
          title: 'Potential Duplicate Tasks',
          description: `Found ${group.length} tasks with title "${group[0].title}" scheduled for ${group[0].scheduled_date}`,
          affectedRecords: group.map((t: any) => t.id),
          autoFixable: false,
        });
      }
    });
  } catch (err) {
    console.error('Error checking duplicate tasks:', err);
  }

  return issues;
}

/**
 * Check 6: SOP Step Integrity
 * Verifies SOP steps have proper order and IDs
 */
async function checkSOPIntegrity(): Promise<IntegrityIssue[]> {
  const issues: IntegrityIssue[] = [];

  if (!isSupabaseConfigured()) return issues;

  try {
    const { data: sops, error } = await supabase
      .from('sops')
      .select('id, title, steps, status')
      .neq('status', 'archived');

    if (error || !sops) return issues;

    for (const sop of sops) {
      const steps = sop.steps || [];

      // Check for missing step IDs
      const missingIds = steps.filter((s: any) => !s.id);
      if (missingIds.length > 0) {
        issues.push({
          id: generateIssueId(),
          type: 'error',
          category: 'sop',
          title: 'Missing Step IDs',
          description: `SOP "${sop.title}" has ${missingIds.length} steps without IDs`,
          affectedRecords: [sop.id],
          autoFixable: true,
          fixAction: async () => {
            const fixedSteps = steps.map((s: any, i: number) => ({
              ...s,
              id: s.id || `step_${Date.now()}_${i}`,
              order: i + 1,
            }));
            await supabase
              .from('sops')
              .update({ steps: fixedSteps })
              .eq('id', sop.id);
          },
        });
      }

      // Check for duplicate step orders
      const orders = steps.map((s: any) => s.order);
      const uniqueOrders = new Set(orders);
      if (orders.length !== uniqueOrders.size) {
        issues.push({
          id: generateIssueId(),
          type: 'warning',
          category: 'sop',
          title: 'Duplicate Step Orders',
          description: `SOP "${sop.title}" has steps with duplicate order numbers`,
          affectedRecords: [sop.id],
          autoFixable: true,
          fixAction: async () => {
            const fixedSteps = steps.map((s: any, i: number) => ({
              ...s,
              order: i + 1,
            }));
            await supabase
              .from('sops')
              .update({ steps: fixedSteps })
              .eq('id', sop.id);
          },
        });
      }
    }
  } catch (err) {
    console.error('Error checking SOP integrity:', err);
  }

  return issues;
}

/**
 * Check 7: Inactive User Assignments
 * Finds tasks assigned to deactivated users
 */
async function checkInactiveUserAssignments(): Promise<IntegrityIssue[]> {
  const issues: IntegrityIssue[] = [];

  if (!isSupabaseConfigured()) return issues;

  try {
    // Get inactive users
    const { data: inactiveUsers, error: userError } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name')
      .eq('is_active', false);

    if (userError || !inactiveUsers || inactiveUsers.length === 0) return issues;

    const inactiveUserIds = new Set(inactiveUsers.map((u: any) => u.id));
    const userMap = new Map(inactiveUsers.map((u: any) => [u.id, u]));

    // Check tasks
    const { data: tasks, error: taskError } = await supabase
      .from('job_tasks')
      .select('id, title, assigned_to')
      .in('status', ['pending', 'in-progress']);

    if (taskError || !tasks) return issues;

    for (const task of tasks) {
      const assignedTo = task.assigned_to || [];
      const inactiveAssignees = assignedTo.filter((userId: string) => inactiveUserIds.has(userId));

      if (inactiveAssignees.length > 0) {
        const userNames = inactiveAssignees
          .map((id: string) => {
            const user: any = userMap.get(id);
            return user ? `${user.first_name} ${user.last_name}` : id;
          })
          .join(', ');

        issues.push({
          id: generateIssueId(),
          type: 'warning',
          category: 'user',
          title: 'Inactive User Assignment',
          description: `Task "${task.title}" is assigned to inactive user(s): ${userNames}`,
          affectedRecords: [task.id, ...inactiveAssignees],
          autoFixable: false,
        });
      }
    }
  } catch (err) {
    console.error('Error checking inactive user assignments:', err);
  }

  return issues;
}

/**
 * Check 8: Database Connection Health
 * Verifies Supabase connection and realtime status
 */
async function checkSystemHealth(): Promise<IntegrityIssue[]> {
  const issues: IntegrityIssue[] = [];

  if (!isSupabaseConfigured()) {
    issues.push({
      id: generateIssueId(),
      type: 'error',
      category: 'system',
      title: 'Supabase Not Configured',
      description: 'Supabase is not properly configured. App is running in localStorage fallback mode.',
      affectedRecords: [],
      autoFixable: false,
    });
    return issues;
  }

  try {
    // Test database connection
    const startTime = Date.now();
    const { error } = await supabase.from('profiles').select('id').limit(1);
    const responseTime = Date.now() - startTime;

    if (error) {
      issues.push({
        id: generateIssueId(),
        type: 'error',
        category: 'system',
        title: 'Database Connection Error',
        description: `Failed to connect to database: ${error.message}`,
        affectedRecords: [],
        autoFixable: false,
      });
    } else if (responseTime > 3000) {
      issues.push({
        id: generateIssueId(),
        type: 'warning',
        category: 'system',
        title: 'Slow Database Response',
        description: `Database response time is ${responseTime}ms (should be under 3000ms)`,
        affectedRecords: [],
        autoFixable: false,
      });
    }
  } catch (err) {
    issues.push({
      id: generateIssueId(),
      type: 'error',
      category: 'system',
      title: 'System Error',
      description: `Unexpected error during health check: ${err}`,
      affectedRecords: [],
      autoFixable: false,
    });
  }

  return issues;
}

/**
 * Run all integrity checks
 */
export async function runAllIntegrityChecks(): Promise<IntegrityCheckResult> {
  const startTime = Date.now();
  const allIssues: IntegrityIssue[] = [];
  const checksRun: string[] = [];

  // Run all checks
  const checks = [
    { name: 'Task Progress Consistency', fn: checkTaskProgressConsistency },
    { name: 'Orphaned Assignments', fn: checkOrphanedAssignments },
    { name: 'Stale Tasks', fn: checkStaleTasks },
    { name: 'Overdue Tasks', fn: checkOverdueTasks },
    { name: 'Duplicate Tasks', fn: checkDuplicateTasks },
    { name: 'SOP Integrity', fn: checkSOPIntegrity },
    { name: 'Inactive User Assignments', fn: checkInactiveUserAssignments },
    { name: 'System Health', fn: checkSystemHealth },
  ];

  for (const check of checks) {
    try {
      const issues = await check.fn();
      allIssues.push(...issues);
      checksRun.push(check.name);
    } catch (err) {
      console.error(`Error running check "${check.name}":`, err);
    }
  }

  const duration = Date.now() - startTime;

  return {
    timestamp: new Date().toISOString(),
    duration,
    totalIssues: allIssues.length,
    errors: allIssues.filter(i => i.type === 'error').length,
    warnings: allIssues.filter(i => i.type === 'warning').length,
    infos: allIssues.filter(i => i.type === 'info').length,
    issues: allIssues,
    checksRun,
  };
}

/**
 * Auto-fix all fixable issues
 */
export async function autoFixIssues(issues: IntegrityIssue[]): Promise<{ fixed: number; failed: number }> {
  let fixed = 0;
  let failed = 0;

  const fixableIssues = issues.filter(i => i.autoFixable && i.fixAction);

  for (const issue of fixableIssues) {
    try {
      await issue.fixAction!();
      fixed++;
    } catch (err) {
      console.error(`Failed to fix issue "${issue.title}":`, err);
      failed++;
    }
  }

  return { fixed, failed };
}

/**
 * Run a specific check by name
 */
export async function runSpecificCheck(checkName: string): Promise<IntegrityIssue[]> {
  const checkMap: Record<string, () => Promise<IntegrityIssue[]>> = {
    'task-progress': checkTaskProgressConsistency,
    'orphaned-assignments': checkOrphanedAssignments,
    'stale-tasks': checkStaleTasks,
    'overdue-tasks': checkOverdueTasks,
    'duplicate-tasks': checkDuplicateTasks,
    'sop-integrity': checkSOPIntegrity,
    'inactive-users': checkInactiveUserAssignments,
    'system-health': checkSystemHealth,
  };

  const checkFn = checkMap[checkName];
  if (!checkFn) {
    throw new Error(`Unknown check: ${checkName}`);
  }

  return checkFn();
}
