import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { CalendarEvent, EventTag, EventTemplate } from '../types';
import { useAuth } from './AuthContext';

interface EventContextType {
  events: CalendarEvent[];
  addEvent: (event: Omit<CalendarEvent, 'id' | 'createdAt' | 'createdBy'>) => Promise<void>;
  updateEvent: (id: string, event: Partial<CalendarEvent>) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;
  getEventById: (id: string) => CalendarEvent | undefined;
  getEventsByDate: (date: string) => CalendarEvent[];
  getEventsByDateRange: (startDate: string, endDate: string) => CalendarEvent[];
  // Tags
  tags: EventTag[];
  addTag: (name: string) => Promise<EventTag>;
  deleteTag: (id: string) => Promise<void>;
  getTagById: (id: string) => EventTag | undefined;
  // Templates
  templates: EventTemplate[];
  addTemplate: (template: Omit<EventTemplate, 'id' | 'createdAt' | 'createdBy'>) => Promise<EventTemplate>;
  updateTemplate: (id: string, template: Partial<EventTemplate>) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
  getTemplateById: (id: string) => EventTemplate | undefined;
  loading: boolean;
}

const EventContext = createContext<EventContextType | undefined>(undefined);

const STORAGE_KEY = 'mediamaple_calendar_events';
const TAGS_STORAGE_KEY = 'mediamaple_event_tags';
const TEMPLATES_STORAGE_KEY = 'mediamaple_event_templates';

// Generate unique ID
const generateId = () => {
  return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

export const EventProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [tags, setTags] = useState<EventTag[]>([]);
  const [templates, setTemplates] = useState<EventTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const { currentUser } = useAuth();

  // Load events, tags, and templates from localStorage on mount
  useEffect(() => {
    const loadData = () => {
      try {
        // Load events
        const storedEvents = localStorage.getItem(STORAGE_KEY);
        if (storedEvents) {
          setEvents(JSON.parse(storedEvents));
        }

        // Load tags
        const storedTags = localStorage.getItem(TAGS_STORAGE_KEY);
        if (storedTags) {
          setTags(JSON.parse(storedTags));
        }

        // Load templates
        const storedTemplates = localStorage.getItem(TEMPLATES_STORAGE_KEY);
        if (storedTemplates) {
          setTemplates(JSON.parse(storedTemplates));
        }
      } catch (error) {
        console.error('Error loading data from localStorage:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Save events to localStorage whenever they change
  useEffect(() => {
    if (!loading) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
    }
  }, [events, loading]);

  // Save tags to localStorage whenever they change
  useEffect(() => {
    if (!loading) {
      localStorage.setItem(TAGS_STORAGE_KEY, JSON.stringify(tags));
    }
  }, [tags, loading]);

  // Save templates to localStorage whenever they change
  useEffect(() => {
    if (!loading) {
      localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
    }
  }, [templates, loading]);

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

  // Tag CRUD operations
  const addTag = useCallback(async (name: string): Promise<EventTag> => {
    const newTag: EventTag = {
      id: `tag_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: name.trim(),
      createdBy: currentUser?.id || '',
      createdAt: new Date().toISOString(),
    };
    setTags(prev => [...prev, newTag]);
    return newTag;
  }, [currentUser]);

  const deleteTag = useCallback(async (id: string) => {
    setTags(prev => prev.filter(tag => tag.id !== id));
    // Also remove this tag from all events that have it
    setEvents(prev => prev.map(event => ({
      ...event,
      tags: event.tags?.filter(tagId => tagId !== id),
    })));
  }, []);

  const getTagById = useCallback((id: string) => {
    return tags.find(tag => tag.id === id);
  }, [tags]);

  // Template CRUD operations
  const addTemplate = useCallback(async (templateData: Omit<EventTemplate, 'id' | 'createdAt' | 'createdBy'>): Promise<EventTemplate> => {
    const newTemplate: EventTemplate = {
      ...templateData,
      id: `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdBy: currentUser?.id || '',
      createdAt: new Date().toISOString(),
    };
    setTemplates(prev => [...prev, newTemplate]);
    return newTemplate;
  }, [currentUser]);

  const updateTemplate = useCallback(async (id: string, updates: Partial<EventTemplate>) => {
    setTemplates(prev => prev.map(template =>
      template.id === id
        ? { ...template, ...updates }
        : template
    ));
  }, []);

  const deleteTemplate = useCallback(async (id: string) => {
    setTemplates(prev => prev.filter(template => template.id !== id));
  }, []);

  const getTemplateById = useCallback((id: string) => {
    return templates.find(template => template.id === id);
  }, [templates]);

  const value: EventContextType = {
    events,
    addEvent,
    updateEvent,
    deleteEvent,
    getEventById,
    getEventsByDate,
    getEventsByDateRange,
    // Tags
    tags,
    addTag,
    deleteTag,
    getTagById,
    // Templates
    templates,
    addTemplate,
    updateTemplate,
    deleteTemplate,
    getTemplateById,
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
