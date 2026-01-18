import React, { useState, useEffect } from 'react';
import { theme } from '../theme';
import { CalendarEvent, User } from '../types';
import { useResponsive } from '../hooks/useResponsive';
import { useEvent } from '../contexts/EventContext';

interface EventFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (event: Omit<CalendarEvent, 'id' | 'createdAt' | 'createdBy'>) => void;
  editingEvent?: CalendarEvent | null;
  users: User[];
  initialDate?: string;
}

const EVENT_COLORS = [
  { name: 'Blue', value: '#3B82F6' },
  { name: 'Green', value: '#10B981' },
  { name: 'Orange', value: '#F59E0B' },
  { name: 'Purple', value: '#8B5CF6' },
  { name: 'Pink', value: '#EC4899' },
  { name: 'Cyan', value: '#06B6D4' },
];

const REMINDER_OPTIONS = [
  { label: 'None', value: 0 },
  { label: '5 minutes before', value: 5 },
  { label: '10 minutes before', value: 10 },
  { label: '15 minutes before', value: 15 },
  { label: '30 minutes before', value: 30 },
  { label: '1 hour before', value: 60 },
  { label: '2 hours before', value: 120 },
  { label: '1 day before', value: 1440 },
  { label: '2 days before', value: 2880 },
  { label: '1 week before', value: 10080 },
];

const EventFormModal: React.FC<EventFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingEvent,
  users,
  initialDate,
}) => {
  const { isMobileOrTablet } = useResponsive();
  const { tags, addTag, templates, addTemplate } = useEvent();

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('10:00');
  const [isAllDay, setIsAllDay] = useState(false);
  const [location, setLocation] = useState('');
  const [color, setColor] = useState('#3B82F6');
  const [attendees, setAttendees] = useState<string[]>([]);
  const [reminderTime, setReminderTime] = useState(30);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>([]);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('');
  const [notes, setNotes] = useState('');

  // Tags state
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [newTagName, setNewTagName] = useState('');
  const [showTagInput, setShowTagInput] = useState(false);

  // Template state
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [templateName, setTemplateName] = useState('');

  // Reset form when modal opens/closes or editing event changes
  useEffect(() => {
    if (isOpen) {
      if (editingEvent) {
        setTitle(editingEvent.title);
        setDescription(editingEvent.description);
        setStartDate(editingEvent.startDate);
        setStartTime(editingEvent.startTime || '09:00');
        setEndDate(editingEvent.endDate || editingEvent.startDate);
        setEndTime(editingEvent.endTime || '10:00');
        setIsAllDay(editingEvent.isAllDay);
        setLocation(editingEvent.location || '');
        setColor(editingEvent.color);
        setAttendees(editingEvent.attendees);
        setReminderTime(editingEvent.reminders?.[0]?.time || 0);
        setIsRecurring(editingEvent.isRecurring);
        if (editingEvent.recurrencePattern) {
          setRecurrenceFrequency(editingEvent.recurrencePattern.frequency);
          setRecurrenceDays(editingEvent.recurrencePattern.daysOfWeek || []);
          setRecurrenceEndDate(editingEvent.recurrencePattern.endDate || '');
        }
        setNotes(editingEvent.notes || '');
        setSelectedTags(editingEvent.tags || []);
      } else {
        // Reset to defaults
        const today = initialDate || new Date().toISOString().split('T')[0];
        setTitle('');
        setDescription('');
        setStartDate(today);
        setStartTime('09:00');
        setEndDate(today);
        setEndTime('10:00');
        setIsAllDay(false);
        setLocation('');
        setColor('#3B82F6');
        setAttendees([]);
        setReminderTime(30);
        setIsRecurring(false);
        setRecurrenceFrequency('weekly');
        setRecurrenceDays([]);
        setRecurrenceEndDate('');
        setNotes('');
        setSelectedTags([]);
      }
      // Reset template/tag input state
      setSelectedTemplate('');
      setShowTagInput(false);
      setNewTagName('');
      setShowSaveTemplateModal(false);
      setTemplateName('');
    }
  }, [isOpen, editingEvent, initialDate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim() || !startDate) {
      return;
    }

    const eventData: Omit<CalendarEvent, 'id' | 'createdAt' | 'createdBy'> = {
      title: title.trim(),
      description: description.trim(),
      startDate,
      startTime: isAllDay ? undefined : startTime,
      endDate: endDate || startDate,
      endTime: isAllDay ? undefined : endTime,
      isAllDay,
      location: location.trim() || undefined,
      color,
      attendees,
      reminders: reminderTime > 0 ? [{ id: '1', type: 'notification', time: reminderTime }] : undefined,
      isRecurring,
      recurrencePattern: isRecurring ? {
        frequency: recurrenceFrequency,
        daysOfWeek: recurrenceFrequency === 'weekly' ? recurrenceDays : undefined,
        endDate: recurrenceEndDate || undefined,
      } : undefined,
      notes: notes.trim() || undefined,
      tags: selectedTags.length > 0 ? selectedTags : undefined,
      updatedAt: editingEvent ? new Date().toISOString() : undefined,
    };

    onSave(eventData);
    onClose();
  };

  // Tag handlers
  const toggleTag = (tagId: string) => {
    setSelectedTags(prev =>
      prev.includes(tagId)
        ? prev.filter(id => id !== tagId)
        : [...prev, tagId]
    );
  };

  const handleAddNewTag = async () => {
    if (newTagName.trim()) {
      const newTag = await addTag(newTagName.trim());
      setSelectedTags(prev => [...prev, newTag.id]);
      setNewTagName('');
      setShowTagInput(false);
    }
  };

  // Template handlers
  const handleSelectTemplate = (templateId: string) => {
    setSelectedTemplate(templateId);
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setTitle(template.title);
      setDescription(template.description);
      setLocation(template.location || '');
      setIsAllDay(template.isAllDay);
      setColor(template.color);
      setAttendees(template.attendees);
      setReminderTime(template.reminders?.[0]?.time || 0);
      setIsRecurring(template.isRecurring);
      if (template.recurrencePattern) {
        setRecurrenceFrequency(template.recurrencePattern.frequency);
        setRecurrenceDays(template.recurrencePattern.daysOfWeek || []);
        setRecurrenceEndDate(template.recurrencePattern.endDate || '');
      }
      setNotes(template.notes || '');
      setSelectedTags(template.tags || []);
    }
  };

  const handleSaveAsTemplate = async () => {
    if (templateName.trim()) {
      await addTemplate({
        name: templateName.trim(),
        title: title.trim(),
        description: description.trim(),
        duration: undefined, // Could calculate from start/end times
        location: location.trim() || undefined,
        isAllDay,
        color,
        attendees,
        reminders: reminderTime > 0 ? [{ id: '1', type: 'notification', time: reminderTime }] : undefined,
        isRecurring,
        recurrencePattern: isRecurring ? {
          frequency: recurrenceFrequency,
          daysOfWeek: recurrenceFrequency === 'weekly' ? recurrenceDays : undefined,
          endDate: recurrenceEndDate || undefined,
        } : undefined,
        notes: notes.trim() || undefined,
        tags: selectedTags.length > 0 ? selectedTags : undefined,
      });
      setShowSaveTemplateModal(false);
      setTemplateName('');
    }
  };

  const toggleAttendee = (userId: string) => {
    setAttendees(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const toggleRecurrenceDay = (day: number) => {
    setRecurrenceDays(prev =>
      prev.includes(day)
        ? prev.filter(d => d !== day)
        : [...prev, day].sort()
    );
  };

  if (!isOpen) return null;

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div
        style={isMobileOrTablet ? styles.modalMobile : styles.modal}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.headerTitle}>
            {editingEvent ? 'Edit Event' : 'Add Event'}
          </h2>
          <button onClick={onClose} style={styles.closeButton}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.scrollContent}>
            {/* Template Selector */}
            {templates.length > 0 && !editingEvent && (
              <div style={styles.formGroup}>
                <label style={styles.label}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '8px', verticalAlign: 'middle' }}>
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <line x1="3" y1="9" x2="21" y2="9" />
                    <line x1="9" y1="21" x2="9" y2="9" />
                  </svg>
                  Use Template
                </label>
                <select
                  value={selectedTemplate}
                  onChange={(e) => handleSelectTemplate(e.target.value)}
                  style={styles.select}
                >
                  <option value="">Select a template...</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Title */}
            <div style={styles.formGroup}>
              <label style={styles.label}>Event Title *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Add title"
                style={styles.input}
                required
              />
            </div>

            {/* Date & Time Row */}
            <div style={styles.dateTimeSection}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Start Date *</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    if (!endDate || endDate < e.target.value) {
                      setEndDate(e.target.value);
                    }
                  }}
                  style={styles.input}
                  required
                />
              </div>

              {!isAllDay && (
                <div style={styles.formGroup}>
                  <label style={styles.label}>Start Time</label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    style={styles.input}
                  />
                </div>
              )}
            </div>

            <div style={styles.dateTimeSection}>
              <div style={styles.formGroup}>
                <label style={styles.label}>End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={startDate}
                  style={styles.input}
                />
              </div>

              {!isAllDay && (
                <div style={styles.formGroup}>
                  <label style={styles.label}>End Time</label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    style={styles.input}
                  />
                </div>
              )}
            </div>

            {/* All Day Toggle */}
            <div style={styles.checkboxGroup}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={isAllDay}
                  onChange={(e) => setIsAllDay(e.target.checked)}
                  style={styles.checkbox}
                />
                <span style={styles.checkboxText}>All day</span>
              </label>
            </div>

            {/* Location */}
            <div style={styles.formGroup}>
              <label style={styles.label}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '8px', verticalAlign: 'middle' }}>
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                Location
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Add location"
                style={styles.input}
              />
            </div>

            {/* Description */}
            <div style={styles.formGroup}>
              <label style={styles.label}>Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add description"
                style={styles.textarea}
                rows={3}
              />
            </div>

            {/* Color Picker */}
            <div style={styles.formGroup}>
              <label style={styles.label}>Event Color</label>
              <div style={styles.colorPicker}>
                {EVENT_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setColor(c.value)}
                    style={{
                      ...styles.colorOption,
                      backgroundColor: c.value,
                      ...(color === c.value ? styles.colorOptionSelected : {}),
                    }}
                    title={c.name}
                  />
                ))}
              </div>
            </div>

            {/* Tags */}
            <div style={styles.formGroup}>
              <label style={styles.label}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '8px', verticalAlign: 'middle' }}>
                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                  <line x1="7" y1="7" x2="7.01" y2="7" />
                </svg>
                Tags
              </label>
              <div style={styles.tagsList}>
                {tags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    style={{
                      ...styles.tagChip,
                      ...(selectedTags.includes(tag.id) ? styles.tagChipSelected : {}),
                    }}
                  >
                    <span>{tag.name}</span>
                    {selectedTags.includes(tag.id) && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                ))}
                {!showTagInput ? (
                  <button
                    type="button"
                    onClick={() => setShowTagInput(true)}
                    style={styles.addTagButton}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    <span>Add Tag</span>
                  </button>
                ) : (
                  <div style={styles.newTagInput}>
                    <input
                      type="text"
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      placeholder="Tag name"
                      style={styles.tagInput}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddNewTag();
                        } else if (e.key === 'Escape') {
                          setShowTagInput(false);
                          setNewTagName('');
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleAddNewTag}
                      style={styles.tagSaveButton}
                      disabled={!newTagName.trim()}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowTagInput(false);
                        setNewTagName('');
                      }}
                      style={styles.tagCancelButton}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Attendees */}
            <div style={styles.formGroup}>
              <label style={styles.label}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '8px', verticalAlign: 'middle' }}>
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                Attendees
              </label>
              <div style={styles.attendeesList}>
                {users.filter(u => u.isActive).map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => toggleAttendee(user.id)}
                    style={{
                      ...styles.attendeeChip,
                      ...(attendees.includes(user.id) ? styles.attendeeChipSelected : {}),
                    }}
                  >
                    <span style={styles.attendeeInitials}>
                      {user.firstName.charAt(0)}{user.lastName.charAt(0)}
                    </span>
                    <span>{user.firstName} {user.lastName}</span>
                    {attendees.includes(user.id) && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Reminder */}
            <div style={styles.formGroup}>
              <label style={styles.label}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '8px', verticalAlign: 'middle' }}>
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                Reminder
              </label>
              <select
                value={reminderTime}
                onChange={(e) => setReminderTime(Number(e.target.value))}
                style={styles.select}
              >
                {REMINDER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Recurring */}
            <div style={styles.formGroup}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={isRecurring}
                  onChange={(e) => setIsRecurring(e.target.checked)}
                  style={styles.checkbox}
                />
                <span style={styles.checkboxText}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '8px', verticalAlign: 'middle' }}>
                    <polyline points="17 1 21 5 17 9" />
                    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                    <polyline points="7 23 3 19 7 15" />
                    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                  </svg>
                  Repeat
                </span>
              </label>
            </div>

            {isRecurring && (
              <div style={styles.recurrenceOptions}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Repeat</label>
                  <select
                    value={recurrenceFrequency}
                    onChange={(e) => setRecurrenceFrequency(e.target.value as 'daily' | 'weekly' | 'monthly')}
                    style={styles.select}
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>

                {recurrenceFrequency === 'weekly' && (
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Repeat on</label>
                    <div style={styles.daysOfWeek}>
                      {dayNames.map((day, index) => (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleRecurrenceDay(index)}
                          style={{
                            ...styles.dayButton,
                            ...(recurrenceDays.includes(index) ? styles.dayButtonSelected : {}),
                          }}
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div style={styles.formGroup}>
                  <label style={styles.label}>End repeat</label>
                  <input
                    type="date"
                    value={recurrenceEndDate}
                    onChange={(e) => setRecurrenceEndDate(e.target.value)}
                    min={startDate}
                    style={styles.input}
                    placeholder="Never"
                  />
                </div>
              </div>
            )}

            {/* Notes */}
            <div style={styles.formGroup}>
              <label style={styles.label}>Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes"
                style={styles.textarea}
                rows={2}
              />
            </div>
          </div>

          {/* Footer */}
          <div style={styles.footer}>
            <button
              type="button"
              onClick={() => setShowSaveTemplateModal(true)}
              style={styles.templateButton}
              disabled={!title.trim()}
              title="Save current settings as a reusable template"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              Save as Template
            </button>
            <div style={styles.footerActions}>
              <button type="button" onClick={onClose} style={styles.cancelButton}>
                Cancel
              </button>
              <button type="submit" style={styles.saveButton}>
                {editingEvent ? 'Save Changes' : 'Create Event'}
              </button>
            </div>
          </div>
        </form>

        {/* Save as Template Modal */}
        {showSaveTemplateModal && (
          <div style={styles.templateModalOverlay} onClick={() => setShowSaveTemplateModal(false)}>
            <div style={styles.templateModal} onClick={(e) => e.stopPropagation()}>
              <h3 style={styles.templateModalTitle}>Save as Template</h3>
              <p style={styles.templateModalDescription}>
                Give your template a name to identify it later.
              </p>
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Template name (e.g., Weekly Team Meeting)"
                style={styles.templateNameInput}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && templateName.trim()) {
                    handleSaveAsTemplate();
                  } else if (e.key === 'Escape') {
                    setShowSaveTemplateModal(false);
                    setTemplateName('');
                  }
                }}
              />
              <div style={styles.templateModalActions}>
                <button
                  type="button"
                  onClick={() => {
                    setShowSaveTemplateModal(false);
                    setTemplateName('');
                  }}
                  style={styles.cancelButton}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveAsTemplate}
                  style={styles.saveButton}
                  disabled={!templateName.trim()}
                >
                  Save Template
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px',
  },
  modal: {
    backgroundColor: theme.colors.backgroundLight,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.lg,
    width: '100%',
    maxWidth: '600px',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  modalMobile: {
    backgroundColor: theme.colors.backgroundLight,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.lg,
    width: '100%',
    maxWidth: '100%',
    maxHeight: '95vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 24px',
    borderBottom: `2px solid ${theme.colors.border}`,
  },
  headerTitle: {
    fontSize: '20px',
    fontWeight: 700,
    color: theme.colors.textPrimary,
    margin: 0,
  },
  closeButton: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: theme.colors.textMuted,
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borderRadius.sm,
    transition: 'all 0.2s',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    overflow: 'hidden',
  },
  scrollContent: {
    flex: 1,
    overflowY: 'auto',
    padding: '24px',
  },
  formGroup: {
    marginBottom: '20px',
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: 600,
    color: theme.colors.textSecondary,
    marginBottom: '8px',
  },
  input: {
    width: '100%',
    padding: '12px 16px',
    fontSize: '15px',
    backgroundColor: theme.colors.inputBackground,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.textPrimary,
    outline: 'none',
    transition: 'border-color 0.2s',
    boxSizing: 'border-box',
  },
  textarea: {
    width: '100%',
    padding: '12px 16px',
    fontSize: '15px',
    backgroundColor: theme.colors.inputBackground,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.textPrimary,
    outline: 'none',
    transition: 'border-color 0.2s',
    resize: 'vertical',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  select: {
    width: '100%',
    padding: '12px 16px',
    fontSize: '15px',
    backgroundColor: theme.colors.inputBackground,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.textPrimary,
    outline: 'none',
    cursor: 'pointer',
    boxSizing: 'border-box',
  },
  dateTimeSection: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
  },
  checkboxGroup: {
    marginBottom: '20px',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    marginRight: '10px',
    cursor: 'pointer',
    accentColor: theme.colors.primary,
  },
  checkboxText: {
    fontSize: '15px',
    color: theme.colors.textPrimary,
    display: 'flex',
    alignItems: 'center',
  },
  colorPicker: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  colorOption: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    border: '2px solid transparent',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  colorOptionSelected: {
    border: `2px solid ${theme.colors.textPrimary}`,
    transform: 'scale(1.1)',
  },
  attendeesList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  attendeeChip: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    backgroundColor: theme.colors.inputBackground,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.full,
    cursor: 'pointer',
    transition: 'all 0.2s',
    fontSize: '13px',
    color: theme.colors.textPrimary,
  },
  attendeeChipSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
    color: '#FFFFFF',
  },
  attendeeInitials: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    backgroundColor: theme.colors.bg.tertiary,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '10px',
    fontWeight: 700,
  },
  recurrenceOptions: {
    padding: '16px',
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.md,
    marginBottom: '20px',
  },
  daysOfWeek: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  dayButton: {
    padding: '8px 12px',
    backgroundColor: theme.colors.inputBackground,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
    color: theme.colors.textSecondary,
    transition: 'all 0.2s',
  },
  dayButtonSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
    color: '#FFFFFF',
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    padding: '20px 24px',
    borderTop: `2px solid ${theme.colors.border}`,
  },
  footerActions: {
    display: 'flex',
    gap: '12px',
  },
  cancelButton: {
    padding: '12px 24px',
    fontSize: '15px',
    fontWeight: 600,
    backgroundColor: 'transparent',
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.textSecondary,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  saveButton: {
    padding: '12px 24px',
    fontSize: '15px',
    fontWeight: 600,
    backgroundColor: theme.colors.primary,
    border: 'none',
    borderRadius: theme.borderRadius.md,
    color: '#FFFFFF',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  templateButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    fontSize: '14px',
    fontWeight: 500,
    backgroundColor: 'transparent',
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.textSecondary,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  // Tags styles
  tagsList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  tagChip: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    backgroundColor: theme.colors.inputBackground,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.full,
    cursor: 'pointer',
    transition: 'all 0.2s',
    fontSize: '13px',
    color: theme.colors.textPrimary,
  },
  tagChipSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
    color: '#FFFFFF',
  },
  addTagButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    backgroundColor: 'transparent',
    border: `2px dashed ${theme.colors.border}`,
    borderRadius: theme.borderRadius.full,
    cursor: 'pointer',
    transition: 'all 0.2s',
    fontSize: '13px',
    color: theme.colors.textMuted,
  },
  newTagInput: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  tagInput: {
    padding: '6px 12px',
    fontSize: '13px',
    backgroundColor: theme.colors.inputBackground,
    border: `2px solid ${theme.colors.primary}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.textPrimary,
    outline: 'none',
    width: '120px',
  },
  tagSaveButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '6px',
    backgroundColor: theme.colors.primary,
    border: 'none',
    borderRadius: theme.borderRadius.sm,
    cursor: 'pointer',
    color: '#FFFFFF',
  },
  tagCancelButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '6px',
    backgroundColor: 'transparent',
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.sm,
    cursor: 'pointer',
    color: theme.colors.textMuted,
  },
  // Template modal styles
  templateModalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    borderRadius: theme.borderRadius.lg,
  },
  templateModal: {
    backgroundColor: theme.colors.backgroundLight,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.lg,
    padding: '24px',
    width: '90%',
    maxWidth: '400px',
  },
  templateModalTitle: {
    fontSize: '18px',
    fontWeight: 700,
    color: theme.colors.textPrimary,
    margin: 0,
    marginBottom: '8px',
  },
  templateModalDescription: {
    fontSize: '14px',
    color: theme.colors.textSecondary,
    margin: 0,
    marginBottom: '16px',
  },
  templateNameInput: {
    width: '100%',
    padding: '12px 16px',
    fontSize: '15px',
    backgroundColor: theme.colors.inputBackground,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.textPrimary,
    outline: 'none',
    marginBottom: '16px',
    boxSizing: 'border-box',
  },
  templateModalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
  },
};

export default EventFormModal;
