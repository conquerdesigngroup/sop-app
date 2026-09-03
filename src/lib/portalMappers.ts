import {
  PortalProgram,
  PortalClass,
  PortalUpdate,
  PortalEvent,
  PortalDocument,
  PortalCalendarSource,
} from '../types';

/**
 * Row -> model for every portal_* table.
 *
 * The only place snake_case column names appear. Both sides of the portal read
 * the same tables — PortalContext as `anon` for parents, PortalAdminContext as
 * a signed-in author — and a column renamed in one mapper but not the other
 * would show up as a silently empty field on one side only.
 *
 * There is no generated Supabase types file, hence `any` and hand-written
 * mappers, matching the idiom in SOPContext and WorkHoursContext.
 */

export const mapProgram = (r: any): PortalProgram => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  blurb: r.blurb ?? '',
  requiresCode: r.requires_code,
  sortOrder: r.sort_order ?? 0,
  isActive: r.is_active,
});

/**
 * PostgREST returns `numeric` as a STRING, not a number — 77.50 arrives as
 * "77.50". Left alone it compares and formats as text, so a price sorts
 * "100" < "77.50" and `.toFixed` throws. Every numeric column goes through
 * here.
 */
const num = (v: any): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export const mapClass = (r: any): PortalClass => ({
  id: r.id,
  programId: r.program_id,
  // Rows written before v25 have the column default rather than a considered
  // value, which is the right fallback: the Academy schedule is the general one.
  category: r.category ?? 'academy',
  name: r.name,
  dayOfWeek: r.day_of_week,
  startTime: r.start_time,
  endTime: r.end_time,
  level: r.level,
  location: r.location,
  description: r.description ?? '',
  instructorName: r.instructor_name,
  sortOrder: r.sort_order ?? 0,
  isActive: r.is_active,

  style: r.style ?? null,
  ageGroup: r.age_group ?? null,
  ageMinYears: num(r.age_min_years),
  ageMaxYears: num(r.age_max_years),
  capacity: num(r.capacity),
  tuitionFee: num(r.tuition_fee),
  registrationFee: num(r.registration_fee),
  costumeFee: num(r.costume_fee),
  billingCycle: r.billing_cycle ?? null,
  billingDay: num(r.billing_day),
  season: r.season ?? null,
  seasonStart: r.season_start ?? null,
  seasonEnd: r.season_end ?? null,
  registrationOpens: r.registration_opens ?? null,
  sourceTitle: r.source_title ?? null,
});

export const mapUpdate = (r: any): PortalUpdate => ({
  id: r.id,
  programId: r.program_id,
  classId: r.class_id,
  householdId: r.household_id ?? null,
  title: r.title,
  body: r.body ?? '',
  isPinned: r.is_pinned,
  isPublished: r.is_published,
  publishedAt: r.published_at,
  authorId: r.author_id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export const mapEvent = (r: any): PortalEvent => ({
  id: r.id,
  programId: r.program_id,
  classId: r.class_id,
  title: r.title,
  description: r.description ?? '',
  startsAt: r.starts_at,
  endsAt: r.ends_at,
  isAllDay: r.is_all_day,
  location: r.location,
  source: r.source,
  isPublished: r.is_published,
  googleCalendarId: r.google_calendar_id ?? null,
  googleEventId: r.google_event_id ?? null,
});

export const mapDocument = (r: any): PortalDocument => ({
  id: r.id,
  programId: r.program_id,
  classId: r.class_id,
  title: r.title,
  description: r.description ?? '',
  category: r.category,
  storagePath: r.storage_path ?? null,
  streamUid: r.stream_uid ?? null,
  streamPlaybackUrl: r.stream_playback_url ?? null,
  streamStatus: r.stream_status ?? null,
  durationSeconds: r.duration_seconds ?? null,
  fileName: r.file_name,
  mimeType: r.mime_type,
  sizeBytes: r.size_bytes,
  sortOrder: r.sort_order ?? 0,
  isPublished: r.is_published,
  createdAt: r.created_at,
});

export const mapCalendarSource = (r: any): PortalCalendarSource => ({
  programId: r.program_id,
  googleCalendarId: r.google_calendar_id,
  isEnabled: r.is_enabled,
  daysBack: r.days_back ?? 30,
  daysAhead: r.days_ahead ?? 365,
  publishImported: r.publish_imported,
  lastRunAt: r.last_run_at,
  lastSuccessAt: r.last_success_at,
  lastStatus: r.last_status,
  lastMessage: r.last_message,
  lastUpserted: r.last_upserted,
  lastRemoved: r.last_removed,
});
