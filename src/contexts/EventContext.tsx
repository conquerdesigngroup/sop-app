import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { CalendarEvent, RecurrencePattern } from '../types';
import { useAuth } from './AuthContext';

interface EventContextType {
  events: CalendarEvent[];
  addEvent: (event: Omit<CalendarEvent, 'id' | 'createdAt' | 'createdBy'>) => Promise<void>;
  updateEvent: (id: string, event: Partial<CalendarEvent>) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;
  getEventById: (id: string) => CalendarEvent | undefined;
  getEventsByDate: (date: string) => CalendarEvent[];
  getEventsByDateRange: (startDate: string, endDate: string) => CalendarEvent[];
  loading: boolean;
}

const EventContext = createContext<EventContextType | undefined>(undefined);

const STORAGE_KEY = 'mediamaple_calendar_events';

// Generate unique ID
const generateId = () => {
  return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

export const EventProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const { currentUser } = useAuth();

  // Load events from localStorage on mount
  useEffect(() => {
    const loadEvents = () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          setEvents(parsed);
        }
      } catch (error) {
        console.error('Error loading events from localStorage:', error);
      } finally {
        setLoading(false);
      }
    };

    loadEvents();
  }, []);

  // Save events to localStorage whenever they change
  useEffect(() => {
    if (!loading) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
    }
  }, [events, loading]);

  const addEvent = useCallback(async (eventData: Omit<CalendarEvent, 'id' | 'createdAt' | 'createdBy'>) => {
    const newEvent: CalendarEvent = {
      ...eventData,
      id: generateId(),
      createdBy: currentUser?.id || '',
      createdAt: new Date().toISOString(),
    };

    setEvents(prev => [...prev, newEvent]);
  }, [currentUser]);

  const updateEvent = useCallback(async (id: string, updates: Partial<CalendarEvent>) => {
    setEvents(prev => prev.map(event =>
      event.id === id
        ? { ...event, ...updates, updatedAt: new Date().toISOString() }
        : event
    ));
  }, []);

  const deleteEvent = useCallback(async (id: string) => {
    setEvents(prev => prev.filter(event => event.id !== id));
  }, []);

  const getEventById = useCallback((id: string) => {
    return events.find(event => event.id === id);
  }, [events]);

  const getEventsByDate = useCallback((date: string) => {
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    return events.filter(event => {
      const eventStartDate = new Date(event.startDate);
      eventStartDate.setHours(0, 0, 0, 0);

      const eventEndDate = event.endDate ? new Date(event.endDate) : eventStartDate;
      eventEndDate.setHours(0, 0, 0, 0);

      // Check if the target date falls within the event's date range
      return targetDate >= eventStartDate && targetDate <= eventEndDate;
    });
  }, [events]);

  const getEventsByDateRange = useCallback((startDate: string, endDate: string) => {
    const rangeStart = new Date(startDate);
    rangeStart.setHours(0, 0, 0, 0);

    const rangeEnd = new Date(endDate);
    rangeEnd.setHours(23, 59, 59, 999);

    return events.filter(event => {
      const eventStart = new Date(event.startDate);
      const eventEnd = event.endDate ? new Date(event.endDate) : eventStart;

      // Check if event overlaps with the range
      return eventStart <= rangeEnd && eventEnd >= rangeStart;
    });
  }, [events]);

  const value: EventContextType = {
    events,
    addEvent,
    updateEvent,
    deleteEvent,
    getEventById,
    getEventsByDate,
    getEventsByDateRange,
    loading,
  };

  return (
    <EventContext.Provider value={value}>
      {children}
    </EventContext.Provider>
  );
};

export const useEvent = () => {
  const context = useContext(EventContext);
  if (context === undefined) {
    throw new Error('useEvent must be used within an EventProvider');
  }
  return context;
};
