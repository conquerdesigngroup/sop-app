import React, { useState, useEffect } from 'react';
import { JobTask, TaskTemplate, TaskPriority, RecurrencePattern } from '../types';
import { theme } from '../theme';
import { useResponsive } from '../hooks/useResponsive';
import TemplateSelector from './TemplateSelector';
import { CustomCheckbox } from './CustomCheckbox';

interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  requiresPhoto: boolean;
  sopId?: string;
}

interface UnifiedJobTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingTask?: JobTask | null;
  onSuccess?: () => void;
  onCreate: (taskData: {
    title: string;
    description: string;
    department: string;
    category: string;
    priority: TaskPriority;
    estimatedDuration: number;
    steps: {
      title: string;
      description?: string;
      requiresPhoto: boolean;
      sopId?: string;
    }[];
    assignedTo: string[];
    scheduledDate: string;
    dueTime?: string;
    isRecurring?: boolean;
    recurrencePattern?: RecurrencePattern;
    templateId?: string;
  }, saveAsTemplate: boolean) => void;
  taskTemplates: TaskTemplate[];
  users: any[];
  sops: any[];
  currentUserId: string;
  initialTemplateId?: string | null;
}

export const UnifiedJobTaskModal: React.FC<UnifiedJobTaskModalProps> = ({
  isOpen,
  onClose,
  editingTask,
  onSuccess,
  onCreate,
  taskTemplates,
  users,
  sops,
  currentUserId,
  initialTemplateId = null,
}) => {
  const { isMobile } = useResponsive();

  // Template Selection
  const [selectedTemplate, setSelectedTemplate] = useState<TaskTemplate | null>(null);

  // Task Details
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [department, setDepartment] = useState('');
  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [estimatedDuration, setEstimatedDuration] = useState(30);

  // Checklist Items
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([
    { id: '1', title: '', description: '', requiresPhoto: false }
  ]);

  // Recurrence
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>([]);

  // Assignment
  const [assignedTo, setAssignedTo] = useState<string[]>([]);
  const [scheduledDate, setScheduledDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('all');

  // Save as Template
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);

  // Get unique departments and categories
  const departments = Array.from(new Set(users.map((u: any) => u.department)));
  const categories = ['Opening Duties', 'Closing Duties', 'Maintenance', 'Administrative', 'Cleaning', 'Safety', 'Other'];
  const weekDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  // Filter users by department
  const filteredUsers = filterDepartment === 'all'
    ? users
    : users.filter((u: any) => u.department === filterDepartment);

  // Initialize with editing task or initial template
  useEffect(() => {
    if (editingTask) {
      setTitle(editingTask.title);
      setDescription(editingTask.description);
      setDepartment(editingTask.department);
      setCategory(editingTask.category);
      setPriority(editingTask.priority);
      setEstimatedDuration(editingTask.estimatedDuration);
      setAssignedTo(editingTask.assignedTo);
      setScheduledDate(editingTask.scheduledDate);
      setDueTime(editingTask.dueTime || '');
      setIsRecurring(editingTask.isRecurring || false);
      if (editingTask.recurrencePattern) {
        setRecurrenceFrequency(editingTask.recurrencePattern.frequency);
        setRecurrenceDays(editingTask.recurrencePattern.daysOfWeek || []);
      }

      // Convert task steps to checklist items
      const items: ChecklistItem[] = editingTask.steps.map(step => ({
        id: step.id,
        title: step.title,
        description: step.description || '',
        requiresPhoto: step.requiresPhoto || false,
        sopId: step.sopId,
      }));
      setChecklistItems(items.length > 0 ? items : [{ id: '1', title: '', description: '', requiresPhoto: false }]);
    } else if (initialTemplateId) {
      const template = taskTemplates.find(t => t.id === initialTemplateId);
      if (template) {
        handleTemplateSelect(template);
      }
    }
  }, [editingTask, initialTemplateId, taskTemplates]);

  // Set default date to today
  useEffect(() => {
    if (!editingTask) {
      const today = new Date().toISOString().split('T')[0];
      setScheduledDate(today);
    }
  }, [editingTask]);

  // Handle template selection
  const handleTemplateSelect = (template: TaskTemplate | null) => {
    setSelectedTemplate(template);

    if (template) {
      setTitle(template.title);
      setDescription(template.description);
      setDepartment(template.department);
      setCategory(template.category);
      setPriority(template.priority);
      setEstimatedDuration(template.estimatedDuration);
      setIsRecurring(template.isRecurring);

      if (template.recurrencePattern) {
        setRecurrenceFrequency(template.recurrencePattern.frequency);
        setRecurrenceDays(template.recurrencePattern.daysOfWeek || []);
      }

      // Convert template steps to checklist items
      const items: ChecklistItem[] = template.steps.map(step => ({
        id: step.id,
        title: step.title,
        description: step.description || '',
        requiresPhoto: step.requiresPhoto || false,
        sopId: step.sopId,
      }));
      setChecklistItems(items.length > 0 ? items : [{ id: '1', title: '', description: '', requiresPhoto: false }]);

      // IMPORTANT: Uncheck "Save as template" when using an existing template
      // to prevent duplicating templates unintentionally
      setSaveAsTemplate(false);
    }
  };

  const handleUserToggle = (userId: string) => {
    setAssignedTo(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleSelectAll = () => {
    const allUserIds = filteredUsers.map((u: any) => u.id);
    setAssignedTo(allUserIds);
  };

  const handleDeselectAll = () => {
    setAssignedTo([]);
  };

  const handleAddChecklistItem = () => {
    const newItem: ChecklistItem = {
      id: Date.now().toString(),
      title: '',
      description: '',
      requiresPhoto: false,
    };
    setChecklistItems([...checklistItems, newItem]);
  };

  const handleRemoveChecklistItem = (id: string) => {
    if (checklistItems.length === 1) {
      alert('At least one checklist item is required');
      return;
    }
    setChecklistItems(checklistItems.filter(item => item.id !== id));
  };

  const handleUpdateChecklistItem = (id: string, field: keyof ChecklistItem, value: any) => {
    setChecklistItems(checklistItems.map(item =>
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const handleDayToggle = (dayIndex: number) => {
    setRecurrenceDays(prev =>
      prev.includes(dayIndex)
        ? prev.filter(d => d !== dayIndex)
        : [...prev, dayIndex].sort()
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!title.trim()) {
      alert('Please enter a task title');
      return;
    }
    if (!department) {
      alert('Please select a department');
      return;
    }
    if (!category) {
      alert('Please select a category');
      return;
    }
    if (assignedTo.length === 0) {
      alert('Please assign to at least one team member');
      return;
    }
    if (!scheduledDate) {
      alert('Please select a scheduled date');
      return;
    }

    // Check that all checklist items have titles
    const invalidItems = checklistItems.filter(item => !item.title.trim());
    if (invalidItems.length > 0) {
      alert('Please enter a title for all checklist items');
      return;
    }

    // Validate recurrence
    if (isRecurring && recurrenceFrequency !== 'daily' && recurrenceDays.length === 0) {
      alert('Please select at least one day for recurring tasks');
      return;
    }

    const recurrencePattern: RecurrencePattern | undefined = isRecurring
      ? {
          frequency: recurrenceFrequency,
          daysOfWeek: recurrenceFrequency === 'daily' ? [] : recurrenceDays,
        }
      : undefined;

    onCreate(
      {
        title,
        description,
        department,
        category,
        priority,
        estimatedDuration,
        steps: checklistItems.map(item => ({
          title: item.title,
          description: item.description,
          requiresPhoto: item.requiresPhoto,
          sopId: item.sopId,
        })),
        assignedTo,
        scheduledDate,
        dueTime: dueTime || undefined,
        isRecurring,
        recurrencePattern,
        templateId: selectedTemplate?.id,
      },
      saveAsTemplate
    );

    if (onSuccess) {
      onSuccess();
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{...styles.modalOverlay, ...(isMobile && styles.modalOverlayMobile)}} onClick={onClose}>
      <div style={{...styles.modal, ...(isMobile && styles.modalMobile)}} onClick={(e) => e.stopPropagation()}>
        <div style={{...styles.modalHeader, ...(isMobile && styles.modalHeaderMobile)}}>
          <h2 style={{...styles.modalTitle, ...(isMobile && styles.modalTitleMobile)}}>
            {editingTask ? 'Edit Job Task' : 'Create Job Task'}
          </h2>
          <button style={{...styles.closeButton, ...(isMobile && styles.closeButtonMobile)}} onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{...styles.modalForm, ...(isMobile && styles.modalFormMobile)}}>
          {/* Template Selector */}
          {!editingTask && (
            <div style={{...styles.section, ...(isMobile && styles.sectionMobile)}}>
              <TemplateSelector
                templates={taskTemplates}
                selectedTemplateId={selectedTemplate?.id || null}
                onSelect={handleTemplateSelect}
                department={department || undefined}
              />
            </div>
          )}

          {/* Task Details Section */}
          <div style={{...styles.section, ...(isMobile && styles.sectionMobile)}}>
            <h3 style={styles.sectionTitle}>Task Details</h3>

            <div style={styles.formGroup}>
              <label style={styles.label}>Task Title *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Daily Opening Checklist"
                required
                style={{...styles.input, ...(isMobile && styles.inputMobile)}}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of the task..."
                rows={3}
                style={{...styles.textarea, ...(isMobile && styles.textareaMobile)}}
              />
            </div>

            {/* Department and Category */}
            <div style={{...styles.formRow, ...(isMobile && styles.formRowMobile)}}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Department *</label>
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  required
                  style={{...styles.select, ...(isMobile && styles.selectMobile)}}
                >
                  <option value="">-- Select Department --</option>
                  {departments.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Category *</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  required
                  style={{...styles.select, ...(isMobile && styles.selectMobile)}}
                >
                  <option value="">-- Select Category --</option>
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Priority and Duration */}
            <div style={{...styles.formRow, ...(isMobile && styles.formRowMobile)}}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Priority *</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TaskPriority)}
                  required
                  style={{...styles.select, ...(isMobile && styles.selectMobile)}}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Est. Duration (min) *</label>
                <input
                  type="number"
                  value={estimatedDuration}
                  onChange={(e) => setEstimatedDuration(Number(e.target.value))}
                  min={1}
                  required
                  style={{...styles.input, ...(isMobile && styles.inputMobile)}}
                />
              </div>
            </div>
          </div>

          {/* Checklist Items Section */}
          <div style={{...styles.section, ...(isMobile && styles.sectionMobile)}}>
            <div style={styles.checklistHeader}>
              <h3 style={styles.sectionTitle}>Checklist Steps</h3>
              <button
                type="button"
                onClick={handleAddChecklistItem}
                style={styles.addItemButton}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add Step
              </button>
            </div>

            <div style={styles.checklistItems}>
              {checklistItems.map((item, index) => (
                <div key={item.id} style={styles.checklistItem}>
                  <div style={styles.checklistItemHeader}>
                    <span style={styles.checklistItemNumber}>Step {index + 1}</span>
                    {checklistItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveChecklistItem(item.id)}
                        style={styles.removeItemButton}
                        title="Remove step"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  <div style={styles.formGroup}>
                    <input
                      type="text"
                      value={item.title}
                      onChange={(e) => handleUpdateChecklistItem(item.id, 'title', e.target.value)}
                      placeholder="Step title (e.g., Unlock main entrance)"
                      required
                      style={{...styles.input, ...(isMobile && styles.inputMobile)}}
                    />
                  </div>

                  <div style={styles.formGroup}>
                    <textarea
                      value={item.description}
                      onChange={(e) => handleUpdateChecklistItem(item.id, 'description', e.target.value)}
                      placeholder="Step description (optional)"
                      rows={2}
                      style={{...styles.textarea, ...(isMobile && styles.textareaMobile)}}
                    />
                  </div>

                  <div style={styles.checklistItemOptions}>
                    <CustomCheckbox
                      checked={item.requiresPhoto}
                      onChange={(checked) => handleUpdateChecklistItem(item.id, 'requiresPhoto', checked)}
                      label="Requires Photo"
                    />

                    <div style={styles.sopSelect}>
                      <label style={styles.smallLabel}>Link SOP:</label>
                      <select
                        value={item.sopId || ''}
                        onChange={(e) => handleUpdateChecklistItem(item.id, 'sopId', e.target.value || undefined)}
                        style={styles.smallSelect}
                      >
                        <option value="">-- No SOP --</option>
                        {sops.map((sop: any) => (
                          <option key={sop.id} value={sop.id}>
                            {sop.title} ({sop.department})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recurrence Section */}
          <div style={{...styles.section, ...(isMobile && styles.sectionMobile)}}>
            <h3 style={styles.sectionTitle}>Recurrence (Optional)</h3>

            <CustomCheckbox
              checked={isRecurring}
              onChange={setIsRecurring}
              label="Make this a recurring task"
            />

            {isRecurring && (
              <div style={styles.recurrenceOptions}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Frequency *</label>
                  <div style={styles.radioGroup}>
                    <label style={styles.radioLabel}>
                      <input
                        type="radio"
                        value="daily"
                        checked={recurrenceFrequency === 'daily'}
                        onChange={(e) => setRecurrenceFrequency(e.target.value as 'daily' | 'weekly' | 'monthly')}
                        style={styles.radio}
                      />
                      Daily
                    </label>
                    <label style={styles.radioLabel}>
                      <input
                        type="radio"
                        value="weekly"
                        checked={recurrenceFrequency === 'weekly'}
                        onChange={(e) => setRecurrenceFrequency(e.target.value as 'daily' | 'weekly' | 'monthly')}
                        style={styles.radio}
                      />
                      Weekly
                    </label>
                    <label style={styles.radioLabel}>
                      <input
                        type="radio"
                        value="monthly"
                        checked={recurrenceFrequency === 'monthly'}
                        onChange={(e) => setRecurrenceFrequency(e.target.value as 'daily' | 'weekly' | 'monthly')}
                        style={styles.radio}
                      />
                      Monthly
                    </label>
                  </div>
                </div>

                {recurrenceFrequency !== 'daily' && (
                  <div style={styles.formGroup}>
                    <label style={styles.label}>
                      Select Days {recurrenceFrequency === 'weekly' && '*'}
                    </label>
                    <div style={styles.daysGrid}>
                      {weekDays.map((day, index) => {
                        // Map Monday=0 to Sunday=6 -> 1-6,0 for RecurrencePattern (Sunday=0)
                        const dayIndex = index === 6 ? 0 : index + 1;
                        return (
                          <CustomCheckbox
                            key={day}
                            checked={recurrenceDays.includes(dayIndex)}
                            onChange={() => handleDayToggle(dayIndex)}
                            label={day.substring(0, 3)}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Schedule & Assignment Section */}
          <div style={{...styles.section, ...(isMobile && styles.sectionMobile)}}>
            <h3 style={styles.sectionTitle}>Schedule & Assignment</h3>

            <div style={{...styles.formRow, ...(isMobile && styles.formRowMobile)}}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Scheduled Date *</label>
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  required
                  style={{...styles.input, ...(isMobile && styles.inputMobile)}}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Due Time (Optional)</label>
                <input
                  type="time"
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
                  style={{...styles.input, ...(isMobile && styles.inputMobile)}}
                />
              </div>
            </div>

            <div style={styles.assignHeaderRow}>
              <label style={styles.label}>Assign to Team Members *</label>
              <div style={styles.assignActions}>
                <button type="button" onClick={handleSelectAll} style={styles.selectAllButton}>
                  Select All
                </button>
                <button type="button" onClick={handleDeselectAll} style={styles.selectAllButton}>
                  Deselect All
                </button>
              </div>
            </div>

            <div style={styles.departmentFilter}>
              <label style={styles.smallLabel}>Filter by Department:</label>
              <select
                value={filterDepartment}
                onChange={(e) => setFilterDepartment(e.target.value)}
                style={styles.smallSelect}
              >
                <option value="all">All Departments</option>
                {departments.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>

            <div style={styles.usersList}>
              {filteredUsers.length === 0 ? (
                <p style={styles.noUsersText}>No users found in this department</p>
              ) : (
                filteredUsers.map((user: any) => (
                  <div key={user.id} style={styles.userCheckbox}>
                    <CustomCheckbox
                      checked={assignedTo.includes(user.id)}
                      onChange={() => handleUserToggle(user.id)}
                      label=""
                    />
                    <div style={styles.userInfo}>
                      <div style={styles.userAvatar}>
                        {user.firstName.charAt(0)}{user.lastName.charAt(0)}
                      </div>
                      <div style={styles.userDetails}>
                        <span style={styles.userFullName}>
                          {user.firstName} {user.lastName}
                        </span>
                        <span style={styles.userDepartment}>{user.department}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {assignedTo.length > 0 && (
              <div style={styles.selectedCount}>
                Selected: {assignedTo.length} team member{assignedTo.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>

          {/* Save to Task Library */}
          {!editingTask && (
            <div style={{...styles.section, ...(isMobile && styles.sectionMobile)}}>
              <CustomCheckbox
                checked={saveAsTemplate}
                onChange={setSaveAsTemplate}
                label="Save to Task Library for future use"
              />
            </div>
          )}

          {/* Form Actions */}
          <div style={{...styles.modalActions, ...(isMobile && styles.modalActionsMobile)}}>
            <button type="button" onClick={onClose} style={{...styles.cancelButton, ...(isMobile && styles.buttonMobile)}}>
              Cancel
            </button>
            <button type="submit" style={{...styles.saveButton, ...(isMobile && styles.buttonMobile)}}>
              {editingTask ? 'Update Task' : 'Create Job Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Styles
const styles: { [key: string]: React.CSSProperties } = {
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px',
  },
  modalOverlayMobile: {
    padding: 0,
  },
  modal: {
    backgroundColor: theme.colors.bg.secondary,
    borderRadius: theme.borderRadius.lg,
    width: '100%',
    maxWidth: '900px',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    border: `2px solid ${theme.colors.bdr.primary}`,
  },
  modalMobile: {
    maxWidth: '100%',
    maxHeight: '100vh',
    borderRadius: 0,
    border: 'none',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '24px',
    borderBottom: `2px solid ${theme.colors.bdr.primary}`,
  },
  modalHeaderMobile: {
    padding: '16px',
  },
  modalTitle: {
    fontSize: '24px',
    fontWeight: 700,
    color: theme.colors.txt.primary,
    margin: 0,
  },
  modalTitleMobile: {
    fontSize: '20px',
  },
  closeButton: {
    background: 'none',
    border: 'none',
    color: theme.colors.txt.secondary,
    cursor: 'pointer',
    padding: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '4px',
    transition: 'all 0.2s ease',
  },
  closeButtonMobile: {
    padding: '4px',
  },
  modalForm: {
    overflowY: 'auto',
    padding: '24px',
  },
  modalFormMobile: {
    padding: '16px',
  },
  section: {
    marginBottom: '32px',
  },
  sectionMobile: {
    marginBottom: '24px',
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  formGroup: {
    marginBottom: '16px',
  },
  formRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
  },
  formRowMobile: {
    gridTemplateColumns: '1fr',
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: 500,
    color: theme.colors.txt.primary,
    marginBottom: '8px',
  },
  input: {
    width: '100%',
    padding: '12px',
    fontSize: '15px',
    color: theme.colors.txt.primary,
    backgroundColor: theme.colors.bg.tertiary,
    border: `2px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    outline: 'none',
    transition: 'border-color 0.2s ease',
  },
  inputMobile: {
    fontSize: '16px',
  },
  textarea: {
    width: '100%',
    padding: '12px',
    fontSize: '15px',
    color: theme.colors.txt.primary,
    backgroundColor: theme.colors.bg.tertiary,
    border: `2px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'inherit',
    transition: 'border-color 0.2s ease',
  },
  textareaMobile: {
    fontSize: '16px',
  },
  select: {
    width: '100%',
    padding: '12px',
    fontSize: '15px',
    color: theme.colors.txt.primary,
    backgroundColor: theme.colors.bg.tertiary,
    border: `2px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    outline: 'none',
    cursor: 'pointer',
  },
  selectMobile: {
    fontSize: '16px',
  },
  smallLabel: {
    fontSize: '13px',
    fontWeight: 500,
    color: theme.colors.txt.secondary,
    marginRight: '8px',
  },
  smallSelect: {
    padding: '6px 8px',
    fontSize: '13px',
    color: theme.colors.txt.primary,
    backgroundColor: theme.colors.bg.tertiary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.sm,
    cursor: 'pointer',
  },
  checklistHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  addItemButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    color: theme.colors.primary,
    backgroundColor: 'transparent',
    border: `2px solid ${theme.colors.primary}`,
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  checklistItems: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  checklistItem: {
    padding: '16px',
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.md,
    border: `1px solid ${theme.colors.bdr.primary}`,
  },
  checklistItemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  checklistItemNumber: {
    fontSize: '12px',
    fontWeight: 600,
    color: theme.colors.txt.secondary,
    textTransform: 'uppercase',
  },
  removeItemButton: {
    background: 'none',
    border: 'none',
    color: theme.colors.status.error,
    fontSize: '14px',
    cursor: 'pointer',
    padding: '4px 8px',
  },
  checklistItemOptions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '16px',
    alignItems: 'center',
    marginTop: '12px',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    color: theme.colors.txt.primary,
    cursor: 'pointer',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    cursor: 'pointer',
  },
  sopSelect: {
    display: 'flex',
    alignItems: 'center',
    flex: 1,
  },
  recurrenceOptions: {
    marginTop: '16px',
    padding: '16px',
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.md,
  },
  radioGroup: {
    display: 'flex',
    gap: '16px',
    flexWrap: 'wrap',
  },
  radioLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '14px',
    color: theme.colors.txt.primary,
    cursor: 'pointer',
  },
  radio: {
    width: '16px',
    height: '16px',
    cursor: 'pointer',
  },
  daysGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
    gap: '8px',
  },
  dayCheckbox: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '13px',
    color: theme.colors.txt.primary,
    cursor: 'pointer',
  },
  assignHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  assignActions: {
    display: 'flex',
    gap: '8px',
  },
  selectAllButton: {
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: 500,
    color: theme.colors.primary,
    backgroundColor: 'transparent',
    border: `1px solid ${theme.colors.primary}`,
    borderRadius: theme.borderRadius.sm,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  departmentFilter: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: '12px',
    gap: '8px',
  },
  usersList: {
    maxHeight: '250px',
    overflowY: 'auto',
    padding: '12px',
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.md,
    border: `1px solid ${theme.colors.bdr.primary}`,
  },
  userCheckbox: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px',
    cursor: 'pointer',
    borderRadius: theme.borderRadius.md,
    transition: 'background-color 0.2s ease',
  },
  userInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flex: 1,
  },
  userAvatar: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    backgroundColor: theme.colors.primary,
    color: '#FFFFFF',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: 600,
  },
  userDetails: {
    display: 'flex',
    flexDirection: 'column',
  },
  userFullName: {
    fontSize: '14px',
    fontWeight: 500,
    color: theme.colors.txt.primary,
  },
  userDepartment: {
    fontSize: '12px',
    color: theme.colors.txt.tertiary,
  },
  noUsersText: {
    textAlign: 'center',
    fontSize: '14px',
    color: theme.colors.txt.tertiary,
    fontStyle: 'italic',
  },
  selectedCount: {
    marginTop: '12px',
    fontSize: '13px',
    fontWeight: 500,
    color: theme.colors.primary,
  },
  modalActions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
    paddingTop: '24px',
    borderTop: `2px solid ${theme.colors.bdr.primary}`,
  },
  modalActionsMobile: {
    flexDirection: 'column-reverse',
  },
  cancelButton: {
    padding: '12px 24px',
    fontSize: '15px',
    fontWeight: 600,
    color: theme.colors.txt.secondary,
    backgroundColor: 'transparent',
    border: `2px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  saveButton: {
    padding: '12px 24px',
    fontSize: '15px',
    fontWeight: 600,
    color: '#FFFFFF',
    backgroundColor: theme.colors.primary,
    border: 'none',
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  buttonMobile: {
    width: '100%',
  },
};

export default UnifiedJobTaskModal;
