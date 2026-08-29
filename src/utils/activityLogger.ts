import { logActivity as logViaRpc } from '../lib/activityLog';

/**
 * Legacy logging entry point, kept for its call sites (AuthContext, SOPContext,
 * TaskContext). Since v29 every entry goes through the log_activity() RPC — see
 * src/lib/activityLog.ts, which is the canonical helper new code should import.
 *
 * The identity parameters (userId/userEmail/userName) are accepted and
 * DISCARDED: the RPC resolves the actor from the JWT precisely so that no
 * caller can attribute an action to someone else. They stay in the signature
 * only so a dozen existing call sites did not need editing in the same change
 * that moved the write path.
 *
 * The old localStorage fallback is gone with the direct insert: it predates the
 * activity_logs table existing, and a browser-local log that only that browser
 * can see is not an audit trail. Supabase-less demo mode simply does not log.
 */

export type EntityType = 'sop' | 'task' | 'job' | 'template' | 'user' | 'system' | 'roster' | 'document' | 'class';

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

interface LogActivityParams {
  userId: string;
  userEmail: string;
  userName: string;
  action: ActionType;
  entityType: EntityType;
  entityId?: string;
  entityTitle?: string;
  details?: Record<string, any>;
}

export const logActivity = async ({
  action,
  entityType,
  entityId,
  entityTitle,
  details,
}: LogActivityParams): Promise<void> => {
  await logViaRpc({
    action,
    entityType,
    entityId,
    entityTitle,
    details,
  });
};
