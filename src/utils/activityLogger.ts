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
  userId,
  userEmail,
  userName,
  action,
  entityType,
  entityId,
  entityTitle,
  details,
}: LogActivityParams): Promise<void> => {
  const useSupabase = isSupabaseConfigured();

  if (!useSupabase) {
    // Fallback to localStorage for demo mode
    const localLogs = JSON.parse(localStorage.getItem('mediamaple_activity_logs') || '[]');
    const newLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      user_id: userId,
      user_email: userEmail,
      user_name: userName,
      action,
      entity_type: entityType,
      entity_id: entityId,
      entity_title: entityTitle,
      details,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
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
      user_id: userId,
      user_email: userEmail,
      user_name: userName,
      action,
      entity_type: entityType,
      entity_id: entityId,
      entity_title: entityTitle,
      details,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    });

    if (error) {
      console.error('Error logging activity:', error);
    }
  } catch (error) {
    console.error('Error logging activity:', error);
  }
};
