/**
 * Shift reports: the opening or closing note each member of staff leaves for
 * the general manager, with tags and a chat thread. Tables and rules are in
 * supabase-migration-v77-shift-reports.sql; this file is the shapes and the
 * pure helpers the page, the dashboard card and the archive tab share.
 */

export type ShiftType = 'opening' | 'closing';

export interface ShiftReportTag {
  reportId: string;
  userId: string;
  taggedBy: string;
  createdAt: string;
  seenAt: string | null;
}

export interface ShiftReport {
  id: string;
  authorId: string;
  shiftType: ShiftType;
  /** The studio day the report is for, YYYY-MM-DD. */
  shiftDate: string;
  body: string;
  archivedAt: string | null;
  archivedBy: string | null;
  createdAt: string;
  updatedAt: string;
  tags: ShiftReportTag[];
  commentCount: number;
}

export interface ShiftReportComment {
  id: string;
  reportId: string;
  authorId: string;
  body: string;
  createdAt: string;
}

export const SHIFT_TYPE_LABEL: Record<ShiftType, string> = {
  opening: 'Opening',
  closing: 'Closing',
};

/** Longest report and chat message the database accepts (v77). */
export const MAX_REPORT_LENGTH = 20000;
export const MAX_COMMENT_LENGTH = 4000;

/* eslint-disable @typescript-eslint/no-explicit-any */
export const mapTag = (row: any): ShiftReportTag => ({
  reportId: row.report_id,
  userId: row.user_id,
  taggedBy: row.tagged_by,
  createdAt: row.created_at,
  seenAt: row.seen_at ?? null,
});

export const mapReport = (row: any, tags: ShiftReportTag[] = [], commentCount = 0): ShiftReport => ({
  id: row.id,
  authorId: row.author_id,
  shiftType: row.shift_type === 'opening' ? 'opening' : 'closing',
  shiftDate: row.shift_date,
  body: row.body ?? '',
  archivedAt: row.archived_at ?? null,
  archivedBy: row.archived_by ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at ?? row.created_at,
  tags,
  commentCount,
});

export const mapComment = (row: any): ShiftReportComment => ({
  id: row.id,
  reportId: row.report_id,
  authorId: row.author_id,
  body: row.body ?? '',
  createdAt: row.created_at,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Reports this person has been tagged on and has not opened yet, newest
 * first. An archived report is no longer asking for anyone's attention, so it
 * drops off the dashboard even if the tag was never opened.
 */
export const unseenTaggedReports = (reports: ShiftReport[], userId: string | undefined): ShiftReport[] => {
  if (!userId) return [];
  return reports
    .filter(r => !r.archivedAt && r.tags.some(t => t.userId === userId && !t.seenAt))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

/** Whether this person is tagged on this report and has not opened it. */
export const isUnseenFor = (report: ShiftReport, userId: string | undefined): boolean =>
  !!userId && report.tags.some(t => t.userId === userId && !t.seenAt);

export interface ShiftReportFilter {
  shiftType: 'all' | ShiftType;
  authorId: 'all' | string;
  search: string;
  /** Only reports I am tagged on. */
  taggedMe: boolean;
}

export const DEFAULT_FILTER: ShiftReportFilter = { shiftType: 'all', authorId: 'all', search: '', taggedMe: false };

export const filterReports = (
  reports: ShiftReport[],
  filter: ShiftReportFilter,
  userId: string | undefined,
  nameOf: (id: string) => string,
): ShiftReport[] => {
  const q = filter.search.trim().toLowerCase();
  return reports.filter(r => {
    if (filter.shiftType !== 'all' && r.shiftType !== filter.shiftType) return false;
    if (filter.authorId !== 'all' && r.authorId !== filter.authorId) return false;
    if (filter.taggedMe && !r.tags.some(t => t.userId === userId)) return false;
    if (q && !r.body.toLowerCase().includes(q) && !nameOf(r.authorId).toLowerCase().includes(q)) return false;
    return true;
  });
};

/** "Thu, Nov 5" for a YYYY-MM-DD studio day. Parsed at local noon so no zone can shift it. */
export const formatShiftDate = (ymd: string): string => {
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

/** "Nov 5, 9:42 PM" — the timestamp printed on every report and message. */
export const formatTimestamp = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

/** A guess at which report someone is writing, from the time of day: before 2pm it is the opening. */
export const guessShiftType = (now: Date = new Date()): ShiftType => (now.getHours() < 14 ? 'opening' : 'closing');
