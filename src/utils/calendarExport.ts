/**
 * Calendar Export Utilities
 * Provides functions to export events/tasks to Google Calendar, .ics files, etc.
 */

import { CalendarEvent, JobTask } from '../types';

// Format date for Google Calendar URL (YYYYMMDDTHHmmssZ format)
const formatDateForGoogle = (dateStr: string, timeStr?: string, isAllDay?: boolean): string => {
  const date = new Date(dateStr);

  if (isAllDay || !timeStr) {
    // For all-day events, use YYYYMMDD format
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  // Parse time and combine with date
  const [hours, minutes] = timeStr.split(':').map(Number);
  date.setHours(hours, minutes, 0, 0);

  // Convert to UTC and format
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  const minute = String(date.getUTCMinutes()).padStart(2, '0');

  return `${year}${month}${day}T${hour}${minute}00Z`;
};

// Format date for ICS file (YYYYMMDDTHHmmss format in local time, or YYYYMMDD for all-day)
const formatDateForICS = (dateStr: string, timeStr?: string, isAllDay?: boolean): string => {
  const date = new Date(dateStr);

  if (isAllDay || !timeStr) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  const [hours, minutes] = timeStr.split(':').map(Number);
  date.setHours(hours, minutes, 0, 0);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(hours).padStart(2, '0');
  const minute = String(minutes).padStart(2, '0');

  return `${year}${month}${day}T${hour}${minute}00`;
};

// Escape special characters for ICS format
const escapeICS = (text: string): string => {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
};

/**
 * Generate a Google Calendar URL for an event
 */
export const generateGoogleCalendarUrl = (event: CalendarEvent): string => {
  const baseUrl = 'https://calendar.google.com/calendar/render?action=TEMPLATE';

  const params = new URLSearchParams();
  params.set('text', event.title);

  if (event.description) {
    params.set('details', event.description);
  }

  if (event.location) {
    params.set('location', event.location);
  }

  // Handle dates
  const startDate = formatDateForGoogle(event.startDate, event.startTime, event.isAllDay);
  let endDate: string;

  if (event.isAllDay) {
    // For all-day events, end date should be the next day
    const end = event.endDate ? new Date(event.endDate) : new Date(event.startDate);
    end.setDate(end.getDate() + 1);
    const year = end.getFullYear();
    const month = String(end.getMonth() + 1).padStart(2, '0');
    const day = String(end.getDate()).padStart(2, '0');
    endDate = `${year}${month}${day}`;
  } else {
    endDate = formatDateForGoogle(
      event.endDate || event.startDate,
      event.endTime || event.startTime,
      false
    );

    // If no end time, default to 1 hour after start
    if (!event.endTime && event.startTime) {
      const date = new Date(event.startDate);
      const [hours, minutes] = event.startTime.split(':').map(Number);
      date.setHours(hours + 1, minutes, 0, 0);
      endDate = formatDateForGoogle(event.startDate, `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`, false);
    }
  }

  params.set('dates', `${startDate}/${endDate}`);

  return `${baseUrl}&${params.toString()}`;
};

/**
 * Generate a Google Calendar URL for a task
 */
export const generateGoogleCalendarUrlForTask = (task: JobTask): string => {
  const baseUrl = 'https://calendar.google.com/calendar/render?action=TEMPLATE';

  const params = new URLSearchParams();
  params.set('text', `[Task] ${task.title}`);

  // Build description with task details
  let description = '';
  if (task.description) {
    description += task.description + '\n\n';
  }
  description += `Status: ${task.status}\n`;
  description += `Priority: ${task.priority}\n`;
  if (task.estimatedDuration) {
    description += `Estimated Duration: ${task.estimatedDuration} minutes\n`;
  }

  params.set('details', description.trim());

  // Handle dates
  const startDate = formatDateForGoogle(task.scheduledDate, task.dueTime, !task.dueTime);
  let endDate: string;

  if (!task.dueTime) {
    // All-day task
    const end = new Date(task.scheduledDate);
    end.setDate(end.getDate() + 1);
    const year = end.getFullYear();
    const month = String(end.getMonth() + 1).padStart(2, '0');
    const day = String(end.getDate()).padStart(2, '0');
    endDate = `${year}${month}${day}`;
  } else {
    // Task with specific time - use estimated duration or default to 30 min
    const duration = task.estimatedDuration || 30;
    const date = new Date(task.scheduledDate);
    const [hours, minutes] = task.dueTime.split(':').map(Number);
    date.setHours(hours, minutes + duration, 0, 0);
    endDate = formatDateForGoogle(
      task.scheduledDate,
      `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`,
      false
    );
  }

  params.set('dates', `${startDate}/${endDate}`);

  return `${baseUrl}&${params.toString()}`;
};

/**
 * Generate ICS file content for an event
 */
export const generateICSForEvent = (event: CalendarEvent): string => {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const uid = `${event.id}@sopapp`;

  const startDate = formatDateForICS(event.startDate, event.startTime, event.isAllDay);
  let endDate: string;

  if (event.isAllDay) {
    const end = event.endDate ? new Date(event.endDate) : new Date(event.startDate);
    end.setDate(end.getDate() + 1);
    const year = end.getFullYear();
    const month = String(end.getMonth() + 1).padStart(2, '0');
    const day = String(end.getDate()).padStart(2, '0');
    endDate = `${year}${month}${day}`;
  } else {
    if (event.endTime) {
      endDate = formatDateForICS(event.endDate || event.startDate, event.endTime, false);
    } else if (event.startTime) {
      // Default to 1 hour
      const date = new Date(event.startDate);
      const [hours, minutes] = event.startTime.split(':').map(Number);
      date.setHours(hours + 1, minutes);
      endDate = formatDateForICS(event.startDate, `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`, false);
    } else {
      endDate = startDate;
    }
  }

  let ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//SOP App//Calendar//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
BEGIN:VEVENT
UID:${uid}
DTSTAMP:${timestamp}
`;

  if (event.isAllDay) {
    ics += `DTSTART;VALUE=DATE:${startDate}\n`;
    ics += `DTEND;VALUE=DATE:${endDate}\n`;
  } else {
    ics += `DTSTART:${startDate}\n`;
    ics += `DTEND:${endDate}\n`;
  }

  ics += `SUMMARY:${escapeICS(event.title)}\n`;

  if (event.description) {
    ics += `DESCRIPTION:${escapeICS(event.description)}\n`;
  }

  if (event.location) {
    ics += `LOCATION:${escapeICS(event.location)}\n`;
  }

  ics += `END:VEVENT
END:VCALENDAR`;

  return ics;
};

/**
 * Generate ICS file content for a task
 */
export const generateICSForTask = (task: JobTask): string => {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const uid = `task-${task.id}@sopapp`;

  const isAllDay = !task.dueTime;
  const startDate = formatDateForICS(task.scheduledDate, task.dueTime, isAllDay);
  let endDate: string;

  if (isAllDay) {
    const end = new Date(task.scheduledDate);
    end.setDate(end.getDate() + 1);
    const year = end.getFullYear();
    const month = String(end.getMonth() + 1).padStart(2, '0');
    const day = String(end.getDate()).padStart(2, '0');
    endDate = `${year}${month}${day}`;
  } else {
    const duration = task.estimatedDuration || 30;
    const date = new Date(task.scheduledDate);
    const [hours, minutes] = task.dueTime!.split(':').map(Number);
    date.setHours(hours, minutes + duration);
    endDate = formatDateForICS(
      task.scheduledDate,
      `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`,
      false
    );
  }

  let description = '';
  if (task.description) {
    description += task.description + '\\n\\n';
  }
  description += `Status: ${task.status}\\n`;
  description += `Priority: ${task.priority}`;
  if (task.estimatedDuration) {
    description += `\\nEstimated Duration: ${task.estimatedDuration} minutes`;
  }

  let ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//SOP App//Calendar//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
BEGIN:VEVENT
UID:${uid}
DTSTAMP:${timestamp}
`;

  if (isAllDay) {
    ics += `DTSTART;VALUE=DATE:${startDate}\n`;
    ics += `DTEND;VALUE=DATE:${endDate}\n`;
  } else {
    ics += `DTSTART:${startDate}\n`;
    ics += `DTEND:${endDate}\n`;
  }

  ics += `SUMMARY:[Task] ${escapeICS(task.title)}\n`;
  ics += `DESCRIPTION:${description}\n`;

  ics += `END:VEVENT
END:VCALENDAR`;

  return ics;
};

/**
 * Download ICS file
 */
export const downloadICS = (content: string, filename: string): void => {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.ics') ? filename : `${filename}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Open Google Calendar with event
 */
export const openGoogleCalendar = (url: string): void => {
  window.open(url, '_blank', 'noopener,noreferrer');
};

/**
 * Copy calendar link to clipboard
 */
export const copyCalendarLink = async (url: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = url;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      document.body.removeChild(textArea);
      return true;
    } catch {
      document.body.removeChild(textArea);
      return false;
    }
  }
};
