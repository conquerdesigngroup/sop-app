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

export type UserRole = 'admin' | 'team';

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

// Task - Individual task that can be part of a Job or standalone
export interface Task {
  id: string;
  templateId?: string; // Reference to TaskTemplate (if created from template)
  title: string;
  description: string;
  department: string;
  category: string;

  // Scheduling (only for standalone tasks)
  scheduledDate?: string; // ISO date
  dueTime?: string; // e.g., "14:00"
  estimatedDuration: number; // minutes

  // Status
  status: TaskStatus;
  priority: TaskPriority;

  // Progress
  steps: TaskStep[];
  completedSteps: string[]; // Array of step IDs
  progressPercentage: number;

  // SOPs attached to this task
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

// Job Types (Container for multiple tasks)

export type JobStatus = 'pending' | 'in-progress' | 'completed' | 'overdue' | 'draft' | 'archived';

export interface Job {
  id: string;
  title: string;
  description: string;
  assignedTo: string[]; // User IDs (can assign to multiple people)
  assignedBy: string; // Admin User ID
  department: string;

  // Scheduling
  scheduledDate: string; // ISO date
  dueTime?: string; // e.g., "14:00"

  // Status
  status: JobStatus;
  priority: TaskPriority;

  // Tasks in this job
  tasks: Task[]; // Array of tasks that make up this job

  // Progress tracking
  completedTasksCount: number;
  totalTasksCount: number;
  progressPercentage: number;

  // Completion
  startedAt?: string;
  completedAt?: string;
  completedBy?: string;
  completionNotes?: string;

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
}
