// SOP Status
export const SOP_STATUS = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
} as const;

export type SOPStatusType = typeof SOP_STATUS[keyof typeof SOP_STATUS];

// Task Status
export const TASK_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in-progress',
  COMPLETED: 'completed',
  BLOCKED: 'blocked',
} as const;

export type TaskStatusType = typeof TASK_STATUS[keyof typeof TASK_STATUS];

// Task Priority
export const TASK_PRIORITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent',
} as const;

export type TaskPriorityType = typeof TASK_PRIORITY[keyof typeof TASK_PRIORITY];

// Recurrence Frequency
export const RECURRENCE_FREQUENCY = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  YEARLY: 'yearly',
} as const;

export type RecurrenceFrequencyType = typeof RECURRENCE_FREQUENCY[keyof typeof RECURRENCE_FREQUENCY];

// User Roles
export const USER_ROLES = {
  ADMIN: 'admin',
  TEAM_MEMBER: 'team member',
} as const;

export type UserRoleType = typeof USER_ROLES[keyof typeof USER_ROLES];

// Departments (These can be customized by organization)
export const DEFAULT_DEPARTMENTS = [
  'Teachers',
  'Admin',
  'Staff',
  'Management',
  'IT',
  'Operations',
  'Finance',
  'HR',
] as const;

// Categories (These can be customized by organization)
export const DEFAULT_CATEGORIES = [
  'Camera Setup',
  'Audio Setup',
  'Lighting',
  'Event Setup',
  'Equipment Maintenance',
  'Safety Procedures',
  'Administrative',
  'Training',
] as const;

// Status Colors
export const STATUS_COLORS = {
  [SOP_STATUS.DRAFT]: '#F59E0B',
  [SOP_STATUS.PUBLISHED]: '#10B981',
  [SOP_STATUS.ARCHIVED]: '#6B7280',
  [TASK_STATUS.PENDING]: '#F59E0B',
  [TASK_STATUS.IN_PROGRESS]: '#3B82F6',
  [TASK_STATUS.COMPLETED]: '#10B981',
  [TASK_STATUS.BLOCKED]: '#EF4444',
} as const;

// Priority Colors
export const PRIORITY_COLORS = {
  [TASK_PRIORITY.LOW]: '#10B981',
  [TASK_PRIORITY.MEDIUM]: '#F59E0B',
  [TASK_PRIORITY.HIGH]: '#F97316',
  [TASK_PRIORITY.URGENT]: '#EF4444',
} as const;

// LocalStorage Keys
export const STORAGE_KEYS = {
  SOPS: 'sops',
  USERS: 'users',
  TASK_TEMPLATES: 'taskTemplates',
  JOB_TASKS: 'jobTasks',
  CURRENT_USER: 'currentUser',
  AUTH_TOKEN: 'authToken',
} as const;

// Validation Constants
export const VALIDATION = {
  TITLE_MIN_LENGTH: 3,
  TITLE_MAX_LENGTH: 100,
  DESCRIPTION_MIN_LENGTH: 10,
  DESCRIPTION_MAX_LENGTH: 1000,
  STEP_TITLE_MIN_LENGTH: 3,
  STEP_TITLE_MAX_LENGTH: 100,
  STEP_DESCRIPTION_MIN_LENGTH: 5,
  STEP_DESCRIPTION_MAX_LENGTH: 2000,
  MIN_STEPS: 1,
  MAX_STEPS: 50,
  TAG_MIN_LENGTH: 2,
  TAG_MAX_LENGTH: 30,
  MAX_TAGS: 10,
} as const;

// Error Messages
export const ERROR_MESSAGES = {
  REQUIRED_FIELD: 'This field is required',
  TITLE_TOO_SHORT: `Title must be at least ${VALIDATION.TITLE_MIN_LENGTH} characters`,
  TITLE_TOO_LONG: `Title must be less than ${VALIDATION.TITLE_MAX_LENGTH} characters`,
  DESCRIPTION_TOO_SHORT: `Description must be at least ${VALIDATION.DESCRIPTION_MIN_LENGTH} characters`,
  DESCRIPTION_TOO_LONG: `Description must be less than ${VALIDATION.DESCRIPTION_MAX_LENGTH} characters`,
  MIN_STEPS_REQUIRED: `At least ${VALIDATION.MIN_STEPS} step is required`,
  INVALID_EMAIL: 'Please enter a valid email address',
  INVALID_PASSWORD: 'Password must be at least 8 characters',
  STORAGE_FULL: 'Storage is full. Please delete some items.',
  STORAGE_ERROR: 'Failed to save data. Please try again.',
} as const;

// Success Messages
export const SUCCESS_MESSAGES = {
  SOP_CREATED: 'SOP created successfully',
  SOP_UPDATED: 'SOP updated successfully',
  SOP_DELETED: 'SOP deleted successfully',
  SOP_ARCHIVED: 'SOP archived successfully',
  TEMPLATE_CREATED: 'Template created successfully',
  TEMPLATE_UPDATED: 'Template updated successfully',
  TEMPLATE_DELETED: 'Template deleted successfully',
  TASK_CREATED: 'Task created successfully',
  TASK_UPDATED: 'Task updated successfully',
  TASK_DELETED: 'Task deleted successfully',
  TASK_COMPLETED: 'Task marked as completed',
  STEP_COMPLETED: 'Step marked as completed',
  LOGIN_SUCCESS: 'Welcome back!',
  LOGOUT_SUCCESS: 'Logged out successfully',
} as const;
