// SOP Types for the new app

export interface SOPStep {
  id: string;
  order: number;
  title: string;
  description: string;
  imageUrl?: string;
}

export type SOPStatus = 'published' | 'draft' | 'archived';

export interface SOP {
  id: string;
  title: string;
  description: string;
  department: string; // Department this SOP belongs to (e.g., "Admin", "Staff")
  category: string;
  icon?: string;
  imageUrl?: string;
  steps: SOPStep[];
  tags?: string[];
  status: SOPStatus;
  isTemplate: boolean;
  templateOf?: string; // ID of the template this was created from
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
}

// User & Auth Types

/**
 * Ordered most privileged first. super_admin was added in v13; see
 * src/lib/roles.ts for what each one means and supabase-migration-v13 for
 * what the database enforces.
 *
 * 'client' (v28) is a parent account for the portal, not a staff tier: it
 * never appears in staff pickers (AuthContext.loadUsers excludes it) and every
 * staff policy tests is_active_staff(), which is false for it. Managed in
 * Client Accounts, not Team Management.
 */
export type UserRole = 'super_admin' | 'admin' | 'team' | 'client';

export interface User {
  id: string;
  email: string;
  password: string; // In production, this should be hashed
  firstName: string;
  lastName: string;
  role: UserRole;
  department: string;
  avatar?: string;
  notificationPreferences?: NotificationPreferences;
  createdAt: string;
  isActive: boolean;
  invitedBy?: string; // Admin user ID who invited this user
}

export interface NotificationPreferences {
  pushEnabled: boolean;
  emailEnabled: boolean;
  calendarSyncEnabled: boolean;
  taskReminders: boolean;
  overdueAlerts: boolean;
}

// Task Template Types (Task Library)

export interface TaskTemplateStep {
  id: string;
  order: number;
  title: string;
  description: string;
  requiresPhoto?: boolean;
  sopId?: string; // Link to specific SOP for this step
}

export interface RecurrencePattern {
  frequency: 'daily' | 'weekly' | 'monthly';
  daysOfWeek?: number[]; // 0-6 (Sunday-Saturday)
  dayOfMonth?: number; // 1-31
  endDate?: string; // When to stop recurring
}

export interface TaskTemplate {
  id: string;
  title: string;
  description: string;
  category: string; // e.g., "Opening Duties", "Closing Duties", "Weekly Maintenance"
  department: string;
  estimatedDuration: number; // minutes
  priority: 'low' | 'medium' | 'high' | 'urgent';
  sopIds: string[]; // Attached SOPs for reference
  steps: TaskTemplateStep[];
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
  isRecurring: boolean;
  recurrencePattern?: RecurrencePattern;
}

// Task Types (Individual Tasks)

export type TaskStatus = 'pending' | 'in-progress' | 'completed' | 'overdue' | 'skipped' | 'draft' | 'archived';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface TaskStep {
  id: string;
  order: number;
  title: string;
  description: string;
  isCompleted: boolean;
  completedAt?: string;
  requiresPhoto?: boolean;
  photoUrl?: string;
  sopId?: string;
}

export interface TaskComment {
  id: string;
  userId: string;
  userName: string;
  text: string;
  createdAt: string;
}

// JobTask - Current implementation (will be refactored to Task + Job)
export interface JobTask {
  id: string;
  templateId?: string; // Reference to TaskTemplate (if created from template)
  title: string;
  description: string;
  assignedTo: string[]; // User IDs (can assign to multiple people)
  assignedBy: string; // Admin User ID
  department: string;
  category: string;

  // Scheduling
  scheduledDate: string; // ISO date
  dueTime?: string; // e.g., "14:00"
  estimatedDuration: number; // minutes

  // Recurrence
  isRecurring?: boolean;
  recurrencePattern?: RecurrencePattern;

  // Status
  status: TaskStatus;
  priority: TaskPriority;

  // Progress
  steps: TaskStep[];
  completedSteps: string[]; // Array of step IDs
  progressPercentage: number;

  // SOPs attached to this job task
  sopIds: string[];

  // Completion
  startedAt?: string;
  completedAt?: string;
  completedBy?: string;
  completionNotes?: string;
  completionPhotos?: string[];

  // Comments
  comments: TaskComment[];

  createdAt: string;
  updatedAt?: string;
}

// Calendar Event Types

export interface EventReminder {
  id: string;
  type: 'notification' | 'email';
  time: number; // Minutes before event
}

export interface EventTag {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
}

export interface EventTemplate {
  id: string;
  name: string;           // Template display name
  title: string;          // Pre-filled event title
  description: string;
  duration?: number;      // Minutes (to calculate endTime from startTime)
  location?: string;
  isAllDay: boolean;
  color: string;
  attendees: string[];
  reminders?: EventReminder[];
  isRecurring: boolean;
  recurrencePattern?: RecurrencePattern;
  notes?: string;
  tags?: string[];        // Tag IDs
  createdBy: string;
  createdAt: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  startDate: string; // ISO date
  startTime?: string; // HH:MM format
  endDate?: string; // ISO date (for multi-day events)
  endTime?: string; // HH:MM format
  location?: string;
  isAllDay: boolean;
  color: string; // Default: blue for events
  attendees: string[]; // User IDs
  reminders?: EventReminder[];
  isRecurring: boolean;
  recurrencePattern?: RecurrencePattern;
  notes?: string;
  tags?: string[]; // Tag IDs for categorization
  createdBy: string;
  createdAt: string;
  updatedAt?: string;

  // v15. 'google' rows are a mirror of a subscribed calendar and are owned by
  // the sync — editing one in the app would be undone on the next run, which is
  // why the Calendar page offers no editing at all. 'manual' is only the three
  // legacy rows an older build wrote before the calendar became read-only.
  source?: 'manual' | 'google';
  googleCalendarId?: string;
  /**
   * The iCal UID, which is what the ICS feed reports and what the sync keys on.
   * Looks like `<api id>@google.com`, and is NOT valid in a Calendar API URL.
   */
  googleEventId?: string;
  /**
   * Google's API event id — the only form a Calendar API URL accepts.
   *
   * Null on every row the sync imported, because the feed does not carry it.
   * The push derives one by stripping the UID's suffix in that case.
   */
  googleApiEventId?: string;
}

/**
 * A Google calendar the staff Calendar subscribes to.
 *
 * One Google account, several calendars under it, each a category with its own
 * colour. The colour lives here rather than on the event so that recolouring a
 * category is one row, not a re-sync of every event in it.
 */
export interface CalendarSource {
  id: string;
  googleCalendarId: string;
  label: string;
  slug: string;
  color: string;
  sortOrder: number;
  isEnabled: boolean;
  /**
   * The calendar's own zone, e.g. 'America/Los_Angeles'.
   *
   * Needed to write a timed event back: start_time is a zoneless TEXT column,
   * so Google has to be told which wall clock '16:30' belongs to.
   */
  timeZone: string;
  lastSuccessAt?: string | null;
  lastStatus?: string | null;
  lastMessage?: string | null;
}

// Work Hours Types

export type WorkHoursStatus = 'pending' | 'approved' | 'rejected';

// Admin-managed list backing the "What did you work on?" dropdown on
// the Hours Input page. Categories are retired (isActive = false)
// rather than deleted, so historical entries keep their label.
export interface WorkCategory {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

/**
 * What one employee is paid per hour in one category.
 *
 * Admin-only at the database level (migration v7 §11) — employees can
 * neither read nor write these, including their own. Any UI touching
 * this type must be behind an isAdmin check.
 */
export interface EmployeePayRate {
  id: string;
  employeeId: string;
  categoryId: string;
  hourlyRate: number;
  createdAt: string;
  updatedAt?: string;
}

/**
 * The frozen pay for one approved entry.
 *
 * Kept in its own admin-only table rather than on WorkHoursEntry: RLS is
 * row-level, so an employee reading their own hours row would otherwise
 * receive the pay columns too. See migration v7 §12.
 */
export interface WorkHoursPay {
  workHoursId: string;
  rateSnapshot: number;
  payAmount: number;
  /** No rate was configured for that employee+category when it was approved. */
  rateMissing: boolean;
  frozenAt: string;
}

export interface WorkHoursEntry {
  id: string;
  employeeId: string;
  workDate: string; // ISO date format (YYYY-MM-DD)
  startTime: string; // HH:MM format (e.g., "09:00")
  endTime: string; // HH:MM format (e.g., "17:00")
  breakMinutes: number; // Break duration in minutes
  totalHours: number; // Recomputed server-side on write (migration v7)
  // The three nullable fields below accept `null` as well as `undefined`,
  // and the difference matters on update: mapToSupabase omits any key that
  // is `undefined`, so passing `undefined` leaves the column as it was.
  // Pass `null` to actually clear one.
  categoryId?: string | null; // FK to WorkCategory; null on pre-v7 entries
  notes?: string | null;
  status: WorkHoursStatus;
  approvedBy?: string; // Admin user ID who approved
  approvedAt?: string; // ISO timestamp
  rejectionReason?: string | null; // Why an admin sent it back
  createdBy: string; // User who created (can be employee or admin)
  createdAt: string;
  updatedAt?: string;
  /**
   * True while this entry exists only in the browser's offline queue.
   *
   * Set by WorkHoursContext for hours logged with no connection, and never
   * present on a row read back from Postgres. Such an entry has a
   * client-side id rather than a UUID, so it cannot be edited, deleted or
   * approved until it has synced.
   */
  pendingSync?: boolean;
}

export interface WorkScheduleTemplate {
  id: string;
  employeeId: string;
  dayOfWeek: number; // 0-6 (Sunday-Saturday)
  startTime: string; // Default start time
  endTime: string; // Default end time
  breakMinutes: number;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface WorkHoursSummary {
  employeeId: string;
  employeeName: string;
  periodStart: string;
  periodEnd: string;
  totalHours: number;
  approvedHours: number;
  pendingHours: number;
  daysWorked: number;
}

// Working Days Types (simple day marking without hours)

export type WorkDayStatus = 'scheduled' | 'confirmed' | 'cancelled';

export interface WorkDay {
  id: string;
  employeeId: string;
  workDate: string; // ISO date format (YYYY-MM-DD)
  status: WorkDayStatus;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}

// ============================================================================
// Parent Portal Types
// ============================================================================
//
// These map to the portal_* tables added in migration v9 — the only tables the
// `anon` role can read, because the portal has no login.
//
// Column names come back snake_case from PostgREST and are mapped by hand in
// PortalContext, same as SOPContext and WorkHoursContext do. There is no
// generated Supabase types file in this project.

/**
 * Slugs are a closed set because routes are typed against them and the value
 * reaches the database as a filter. Validate with isProgramSlug() in
 * src/lib/portal.ts rather than trusting a URL segment.
 */
export type PortalProgramSlug = 'allstars' | 'academy';

export interface PortalProgram {
  id: string;
  slug: PortalProgramSlug;
  name: string;
  blurb: string;
  /** False opens the section with no code at all. */
  requiresCode: boolean;
  sortOrder: number;
  isActive: boolean;
}

/**
 * Which schedule a class appears on.
 *
 * Not the same question as programId. programId is where a class is FILED and
 * therefore who owns its updates and files; category is where it is SHOWN. The
 * All-Star schedule lists all three, because an All-Star dancer takes Academy
 * technique too; the Academy/TNT schedule lists academy and tnt only. See
 * PROGRAM_CLASS_CATEGORIES in lib/portal.ts.
 */
export type PortalClassCategory = 'allstars' | 'academy' | 'tnt';

export interface PortalClass {
  id: string;
  programId: string;
  category: PortalClassCategory;
  name: string;
  /** 0 = Sunday, matching Date.getDay(). Null for classes with no fixed day. */
  dayOfWeek: number | null;
  /** 'HH:MM:SS' from a Postgres `time` column. */
  startTime: string | null;
  endTime: string | null;
  level: string | null;
  location: string | null;
  description: string;
  /** Display name only. Who may EDIT the class is portal_class_instructors. */
  instructorName: string | null;
  sortOrder: number;
  isActive: boolean;

  // --- the catalogue, added in v25 -----------------------------------------
  // Everything below came from the studio's Enrollio export. Nulls are normal:
  // a class added by hand in the manager has none of it until somebody fills
  // it in, and every screen treats each field as optional.

  /** Dance discipline — 'Ballet', 'Hip Hop', 'Turns & Jumps'. */
  style: string | null;
  /** Audience band — 'Mini', 'Junior / Teen', 'Tiny Tots', 'Company'. */
  ageGroup: string | null;
  ageMinYears: number | null;
  ageMaxYears: number | null;
  capacity: number | null;
  /** Dollars. numeric(10,2) arrives as a string, so the mapper coerces it. */
  tuitionFee: number | null;
  registrationFee: number | null;
  costumeFee: number | null;
  billingCycle: string | null;
  billingDay: number | null;
  /** '2026-2027'. */
  season: string | null;
  /** 'YYYY-MM-DD'. Bounds the weekly recurrence the month view draws. */
  seasonStart: string | null;
  seasonEnd: string | null;
  registrationOpens: string | null;
  /** The class's title in Enrollio, kept as the join key for a re-import. */
  sourceTitle: string | null;
}

export interface PortalUpdate {
  id: string;
  programId: string;
  /** Null means program-wide rather than tied to one class. */
  classId: string | null;
  /**
   * Set = a note to ONE family; only that household can read it (v36 RLS).
   * Mutually exclusive with classId — a note is addressed to a class or to a
   * family, never both.
   */
  householdId: string | null;
  title: string;
  body: string;
  isPinned: boolean;
  isPublished: boolean;
  publishedAt: string | null;
  authorId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PortalEvent {
  id: string;
  programId: string;
  classId: string | null;
  title: string;
  description: string;
  /** Real ISO timestamps — not the text dates used by the staff calendar. */
  startsAt: string;
  endsAt: string | null;
  isAllDay: boolean;
  location: string | null;
  /** 'google' rows are owned by the phase-4 sync and will be overwritten. */
  source: 'manual' | 'google';
  isPublished: boolean;
  /**
   * How this event is named on the Google side. Null on 'manual' rows.
   *
   * Carried through so the portal can find the event's attachments, which hang
   * off the (calendar, event) pair rather than off a row id — the staff
   * calendar and the portal are different tables and that pair is the only
   * identity they share. See the v22 migration.
   */
  googleCalendarId: string | null;
  googleEventId: string | null;
}

/**
 * Which Google calendar feeds a program's portal calendar, and what the last
 * sync did. Staff-only: deliberately its own table rather than columns on
 * portal_programs, which is anon-readable.
 */
export interface PortalCalendarSource {
  programId: string;
  googleCalendarId: string;
  isEnabled: boolean;
  daysBack: number;
  daysAhead: number;
  /** False lands imported events as drafts for review instead of publishing. */
  publishImported: boolean;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastStatus: 'ok' | 'error' | null;
  lastMessage: string | null;
  lastUpserted: number | null;
  lastRemoved: number | null;
}

export interface PortalDocument {
  id: string;
  programId: string;
  classId: string | null;
  title: string;
  description: string;
  category: string | null;
  /** Object key in the private `portal-documents` bucket; read via signed URL. */
  storagePath: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  sortOrder: number;
  isPublished: boolean;
  createdAt: string;
}
