import { supabase } from './supabase';
import { mapDocument } from './portalMappers';
import { PortalDocument } from '../types';

/**
 * The files attached to an info post (v65).
 *
 * WHY A LIB AND NOT A CONTEXT METHOD
 *
 * Four screens need this exact query — the Info manager, the Info page, a
 * class page and the profile's Updates card — and they do not share a context:
 * the manager has PortalAdminContext, two pages have PortalContext, and the
 * profile card reads through attendanceQueries and has neither. Written as a
 * context method it would have to be written twice, and the second copy is the
 * one that forgets a filter.
 *
 * There is nothing to write twice anyway. The query is the same for staff and
 * for a parent; RLS is what differs, and that is in Postgres.
 *
 * WHY THESE ROWS ARE ALWAYS is_published
 *
 * An attachment has no visibility of its own. The v65 read policy returns it
 * only when the POST it hangs on is readable, which for a parent already means
 * the post is published — so a second published flag on the file would be a
 * copy of the post's that has to be kept in step, and the day it drifts a live
 * post shows an attachment list with a hole in it. They are written `true` once
 * and never touched again; the post is the switch.
 */
export const loadUpdateFiles = async (
  updateIds: string[],
): Promise<Record<string, PortalDocument[]>> => {
  if (updateIds.length === 0) return {};

  const { data, error } = await supabase
    .from('portal_documents')
    .select('*')
    .in('update_id', updateIds)
    // The order staff attached them in. Nothing reorders attachments, so
    // created_at is that order and sort_order is along for the ride.
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;

  const byUpdate: Record<string, PortalDocument[]> = {};
  for (const row of data ?? []) {
    const doc = mapDocument(row);
    if (!doc.updateId) continue;
    if (!byUpdate[doc.updateId]) byUpdate[doc.updateId] = [];
    byUpdate[doc.updateId].push(doc);
  }
  return byUpdate;
};

/**
 * The same, for one post, and never throwing.
 *
 * For the parent-facing screens, where a post whose attachments could not be
 * loaded should still show its words. A missing file list is a smaller failure
 * than a card that renders an error where an announcement should be.
 */
export const loadUpdateFilesQuietly = async (
  updateIds: string[],
): Promise<Record<string, PortalDocument[]>> => {
  try {
    return await loadUpdateFiles(updateIds);
  } catch {
    return {};
  }
};
