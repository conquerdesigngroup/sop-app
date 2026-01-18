/**
 * Custom hook for Google Calendar integration
 */

import { useState, useEffect, useCallback } from 'react';
import {
  isGoogleAuthenticated,
  getGoogleUserInfo,
  initiateGoogleAuth,
  disconnectGoogleCalendar,
  createGoogleCalendarEvent,
  convertToGoogleEvent,
  GoogleUserInfo,
} from '../services/googleCalendar';
import { CalendarEvent, JobTask } from '../types';

interface UseGoogleCalendarReturn {
  isConnected: boolean;
  isLoading: boolean;
  userInfo: GoogleUserInfo | null;
  connect: () => void;
  disconnect: () => void;
  syncEventToGoogle: (event: CalendarEvent) => Promise<boolean>;
  syncTaskToGoogle: (task: JobTask) => Promise<boolean>;
  checkConnection: () => Promise<void>;
}

export const useGoogleCalendar = (): UseGoogleCalendarReturn => {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [userInfo, setUserInfo] = useState<GoogleUserInfo | null>(null);

  const checkConnection = useCallback(async () => {
    setIsLoading(true);
    try {
      const authenticated = isGoogleAuthenticated();
      setIsConnected(authenticated);

      if (authenticated) {
        const info = await getGoogleUserInfo();
        setUserInfo(info);
      } else {
        setUserInfo(null);
      }
    } catch (error) {
      console.error('Error checking Google Calendar connection:', error);
      setIsConnected(false);
      setUserInfo(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  const connect = useCallback(() => {
    initiateGoogleAuth();
  }, []);

  const disconnect = useCallback(() => {
    disconnectGoogleCalendar();
    setIsConnected(false);
    setUserInfo(null);
  }, []);

  const syncEventToGoogle = useCallback(async (event: CalendarEvent): Promise<boolean> => {
    if (!isConnected) return false;

    try {
      const googleEvent = convertToGoogleEvent({
        title: event.title,
        description: event.description,
        location: event.location,
        startDate: event.startDate,
        startTime: event.startTime,
        endDate: event.endDate,
        endTime: event.endTime,
        isAllDay: event.isAllDay,
      });

      const result = await createGoogleCalendarEvent(googleEvent);
      return result !== null;
    } catch (error) {
      console.error('Error syncing event to Google Calendar:', error);
      return false;
    }
  }, [isConnected]);

  const syncTaskToGoogle = useCallback(async (task: JobTask): Promise<boolean> => {
    if (!isConnected) return false;

    try {
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
      if (task.steps && task.steps.length > 0) {
        description += '\nSteps:\n';
        task.steps.forEach((step, index) => {
          const isCompleted = task.completedSteps.includes(step.id);
          description += `${isCompleted ? '✓' : '○'} ${index + 1}. ${step.title}\n`;
        });
      }

      const googleEvent = convertToGoogleEvent({
        title: `[Task] ${task.title}`,
        description: description.trim(),
        startDate: task.scheduledDate,
        startTime: task.dueTime,
        isAllDay: !task.dueTime,
      });

      // Set duration based on estimated time
      if (task.dueTime && task.estimatedDuration) {
        const start = new Date(`${task.scheduledDate}T${task.dueTime}:00`);
        const end = new Date(start.getTime() + task.estimatedDuration * 60000);
        googleEvent.end = {
          dateTime: end.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
      }

      const result = await createGoogleCalendarEvent(googleEvent);
      return result !== null;
    } catch (error) {
      console.error('Error syncing task to Google Calendar:', error);
      return false;
    }
  }, [isConnected]);

  return {
    isConnected,
    isLoading,
    userInfo,
    connect,
    disconnect,
    syncEventToGoogle,
    syncTaskToGoogle,
    checkConnection,
  };
};

export default useGoogleCalendar;
