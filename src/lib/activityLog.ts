import { supabase, isSupabaseConfigured } from './supabase';

/**
 * The one write door to the audit log.
 *
 * Every log entry in the app goes through log_activity() (migration v29), a
 * SECURITY DEFINER RPC. With a session, the function takes the actor's
 * identity FROM THE JWT and ignores anything the caller claims — which is why
 * this helper does not even accept identity fields. Nothing a component can
 * pass here can attribute an action to somebody else.
 *
 * Components never call supabase.from('activity_logs').insert(...) — the
 * INSERT policy would let a signed-in user do it for their own id, but direct
 * inserts skip the actor_kind/actor_role snapshotting and are exactly the kind
 * of side door that rots audit coverage. If you are adding a feature and need
 * a log entry, call this.
 *
 * RULES (from AUDIT-LOG-SPEC.md, and they are the point):
 *
 *  - NEVER throws. A logging failure must not roll back or block the user's
 *    action. Errors go to console.error and life continues.
 *  - NEVER awaited in the UI path. Call it after the mutation resolves and
 *    move on: `void logActivity({...})`.
 *  - `details` is an allowlist, not a dump. Named keys only — what changed as
 *    { field: { from, to } }, counts, filenames, failure reasons. Never a
 *    request body, never a password, an OTP code, a token or a secret URL.
 */

export interface LogActivityInput {
  action: string;
  entityType: string;
  entityId?: string;
  entityTitle?: string;
  details?: Record<string, unknown>;
  result?: 'success' | 'failure';
  requestId?: string;
}

export async function logActivity(input: LogActivityInput): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;

  try {
    const { error } = await supabase.rpc('log_activity', {
      p_action: input.action,
      p_entity_type: input.entityType,
      p_entity_id: input.entityId ?? null,
      p_entity_title: input.entityTitle ?? null,
      p_details: input.details ?? {},
      p_result: input.result ?? 'success',
      p_request_id: input.requestId ?? null,
    });
    if (error) {
      console.error('log_activity failed:', error.message, input.action);
    }
  } catch (e) {
    console.error('log_activity threw:', e, input.action);
  }
}
