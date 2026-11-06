import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useToast } from '../contexts/ToastContext';
import { JobTask, TaskTemplate, TaskPriority, RecurrencePattern, TaskFile } from '../types';
import { theme } from '../theme';
import { isManagementRole, roleLabel } from '../lib/roles';
import { useResponsive } from '../hooks/useResponsive';
import TemplateSelector from './TemplateSelector';
import { CustomCheckbox } from './CustomCheckbox';
import { studioToday } from '../lib/studioDate';
import StaffAvatar from './StaffAvatar';
import { RecurrenceFields, defaultRecurrence, recurrenceProblems } from './RecurrenceFields';
import TaskFilesEditor from './tasks/TaskFilesEditor';
import { discardUnsaved } from '../lib/taskFiles';

interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  requiresPhoto: boolean;
  images: TaskFile[];
}

interface UnifiedJobTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingTask?: JobTask | null;
  onSuccess?: () => void;
  onCreate: (taskData: {
    title: string;
    description: string;
    category: string;
    priority: TaskPriority;
    estimatedDuration: number;
    steps: {
      title: string;
      description?: string;
      requiresPhoto: boolean;
      images?: TaskFile[];
    }[];
    assignedTo: string[];
    scheduledDate: string;
    dueTime?: string;
    isRecurring?: boolean;
    recurrencePattern?: RecurrencePattern;
    templateId?: string;
    sopId?: string;
    files?: TaskFile[];
  }, saveAsTemplate: boolean) => void | Promise<void>;
  taskTemplates: TaskTemplate[];
  users: any[];
  sops: any[];
  currentUserId: string;
  initialTemplateId?: string | null;
  initialScheduledDate?: string | null;
  /** Open a new task with "repeats" already switched on (the Recurring tab's button). */
  initialRecurring?: boolean;
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
  initialScheduledDate = null,
  initialRecurring = false,
}) => {
  const { isMobile } = useResponsive();
  const { error: showError } = useToast();

  // Template Selection
  const [selectedTemplate, setSelectedTemplate] = useState<TaskTemplate | null>(null);

  // Task Details
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [estimatedDuration, setEstimatedDuration] = useState(30);
  const [linkedSopId, setLinkedSopId] = useState<string>('');

  // Checklist Items (optional)
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);

  // Recurrence
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrence, setRecurrence] = useState<RecurrencePattern>(() => defaultRecurrence(studioToday()));
  // A series' rule is edited here; an occurrence of one is not (it would turn
  // that single day into a second series).
  const isSeries = !!editingTask?.isRecurring;
  const isOccurrence = !!editingTask?.seriesId;

  // Assignment
  const [assignedTo, setAssignedTo] = useState<string[]>([]);
  const [scheduledDate, setScheduledDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('all');

  // Save as Template
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);

  // Category (used for grouping in the Task Library and on tasks)
  const [category, setCategory] = useState('General');
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  // Submission state to prevent duplicates
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Photos and files on the task itself; step pictures live on each item.
  const [files, setFiles] = useState<TaskFile[]>([]);
  // How many editors (task + each step) are mid-upload. Saving waits for 0.
  const [uploadsInFlight, setUploadsInFlight] = useState(0);
  // Everything uploaded since this form opened. Whatever is not in the saved
  // task when it closes is deleted from storage — nothing else can point at
  // it yet. See "REMOVING IS NOT DELETING" in lib/taskFiles.
  const sessionUploads = useRef<Map<string, TaskFile>>(new Map());
  const openRef = useRef(isOpen);
  openRef.current = isOpen;

  const handleUploaded = useCallback((file: TaskFile) => {
    if (!openRef.current) {
      // Landed after the form was closed: nothing will ever save it.
      void discardUnsaved([file]);
      return;
    }
    sessionUploads.current.set(file.path, file);
  }, []);

  const handleRemoved = useCallback((file: TaskFile) => {
    if (sessionUploads.current.has(file.path)) {
      sessionUploads.current.delete(file.path);
      void discardUnsaved([file]);
    }
  }, []);

  const handleBusyChange = useCallback((busy: boolean) => {
    setUploadsInFlight(n => Math.max(0, n + (busy ? 1 : -1)));
  }, []);

  /** Close without saving: drop anything this form uploaded. */
  const handleClose = () => {
    const unsaved = Array.from(sessionUploads.current.values());
    sessionUploads.current.clear();
    if (unsaved.length) void discardUnsaved(unsaved);
    onClose();
  };

  // Existing categories from the library, plus whatever is currently selected
  const categoryOptions = Array.from(new Set([
    'General',
    ...taskTemplates.map((t: TaskTemplate) => t.category),
    ...(editingTask?.category ? [editingTask.category] : []),
    category,
  ].filter(Boolean))).sort();

  // Get unique departments for user filtering
  const departments = Array.from(new Set(users.map((u: any) => u.department)));

  // Filter users by department
  const filteredUsers = filterDepartment === 'all'
    ? users
    : users.filter((u: any) => u.department === filterDepartment);

  // Reset form when modal opens (for new tasks)
  useEffect(() => {
    if (isOpen && !editingTask && !initialTemplateId) {
      // Reset all form state for new task creation
      setSelectedTemplate(null);
      setTitle('');
      setDescription('');
      setPriority('medium');
      setEstimatedDuration(30);
      setLinkedSopId('');
      setChecklistItems([]);
      setIsRecurring(initialRecurring);
      setRecurrence(defaultRecurrence(initialScheduledDate || studioToday()));
      setAssignedTo([]);
      setDueTime('');
      setFilterDepartment('all');
      setSaveAsTemplate(false);
      setCategory('General');
      setIsAddingCategory(false);
      setNewCategoryName('');
      setIsSubmitting(false);
      setFiles([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editingTask, initialTemplateId]);

  // A fresh form starts with no uploads of its own.
  useEffect(() => {
    if (isOpen) {
      sessionUploads.current.clear();
      setUploadsInFlight(0);
    }
  }, [isOpen]);

  // Initialize with editing task or initial template
  useEffect(() => {
    if (editingTask) {
      setTitle(editingTask.title);
      setDescription(editingTask.description);
      setPriority(editingTask.priority);
      setEstimatedDuration(editingTask.estimatedDuration);
      setAssignedTo(editingTask.assignedTo);
      setScheduledDate(editingTask.scheduledDate);
      setDueTime(editingTask.dueTime || '');
      setIsRecurring(editingTask.isRecurring || false);
      setLinkedSopId(editingTask.sopIds?.[0] || '');
      setCategory(editingTask.category || 'General');
      if (editingTask.recurrencePattern) {
        const { generatedThrough, paused, ...rule } = editingTask.recurrencePattern;
        setRecurrence({ interval: 1, ...rule, paused });
      }

      setFiles(editingTask.files || []);

      // Convert task steps to checklist items
      const items: ChecklistItem[] = editingTask.steps.map(step => ({
        id: step.id,
        title: step.title,
        description: step.description || '',
        requiresPhoto: step.requiresPhoto || false,
        images: step.images || [],
      }));
      setChecklistItems(items);
    } else if (initialTemplateId) {
      const template = taskTemplates.find(t => t.id === initialTemplateId);
      if (template) {
        handleTemplateSelect(template);
      }
    }
  }, [editingTask, initialTemplateId, taskTemplates]);

  // Set default date to today at the studio, or use initialScheduledDate.
  // This becomes a scheduledDate, which every overdue rule reads in the
  // studio's timezone — see src/lib/studioDate.ts.
  useEffect(() => {
    if (!editingTask) {
      const defaultDate = initialScheduledDate || studioToday();
      setScheduledDate(defaultDate);
    }
  }, [editingTask, initialScheduledDate]);

  // Handle template selection
  const handleTemplateSelect = (template: TaskTemplate | null) => {
    setSelectedTemplate(template);

    if (template) {
      setTitle(template.title);
      setDescription(template.description);
      setPriority(template.priority);
      setEstimatedDuration(template.estimatedDuration);
      setIsRecurring(template.isRecurring);
      setLinkedSopId(template.sopIds?.[0] || '');
      setCategory(template.category || 'General');

      if (template.recurrencePattern) {
        const { generatedThrough, paused, ...rule } = template.recurrencePattern;
        setRecurrence({ interval: 1, ...rule });
      }

      setFiles(template.files || []);

      // Convert template steps to checklist items
      const items: ChecklistItem[] = template.steps.map(step => ({
        id: step.id,
        title: step.title,
        description: step.description || '',
        requiresPhoto: step.requiresPhoto || false,
        images: step.images || [],
      }));
      setChecklistItems(items);

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
    // Select only the currently filtered/visible users
    const filteredUserIds = filteredUsers.map((u: any) => u.id);
    // Merge with existing selections (to preserve selections from other departments)
    setAssignedTo(prev => {
      const combined = new Set([...prev, ...filteredUserIds]);
      return Array.from(combined);
    });
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
      images: [],
    };
    setChecklistItems([...checklistItems, newItem]);
  };

  const handleRemoveChecklistItem = (id: string) => {
    setChecklistItems(checklistItems.filter(item => item.id !== id));
  };

  const handleUpdateChecklistItem = (id: string, field: keyof ChecklistItem, value: any) => {
    setChecklistItems(checklistItems.map(item =>
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  // Functional, because a step's pictures finish uploading one at a time and
  // the person may be typing in another step while they do.
  const updateStepImages = (id: string, update: (prev: TaskFile[]) => TaskFile[]) => {
    setChecklistItems(prev => prev.map(item =>
      item.id === id ? { ...item, images: update(item.images || []) } : item
    ));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Prevent double submission
    if (isSubmitting) {
      return;
    }

    if (uploadsInFlight > 0) {
      showError('Wait for the photos and files to finish uploading, then save.');
      return;
    }

    // Validation
    if (!title.trim()) {
      showError('Please enter a task title');
      return;
    }
    if (assignedTo.length === 0) {
      showError('Please assign to at least one team member');
      return;
    }
    if (!scheduledDate) {
      showError('Please select a scheduled date');
      return;
    }

    // Check that all checklist items have titles (if any exist)
    const invalidItems = checklistItems.filter(item => !item.title.trim());
    if (invalidItems.length > 0) {
      showError('Please enter a title for all checklist steps');
      return;
    }

    // Validate recurrence
    const repeats = isRecurring && !isOccurrence;
    const recurrenceProblem = repeats ? recurrenceProblems(recurrence, scheduledDate) : null;
    if (recurrenceProblem) {
      showError(recurrenceProblem);
      return;
    }

    // Set submitting state to prevent duplicates
    setIsSubmitting(true);

    // Only the fields the chosen frequency uses, so a rule switched from
    // weekly to monthly does not carry stale weekdays around.
    const recurrencePattern: RecurrencePattern | undefined = repeats
      ? {
          frequency: recurrence.frequency,
          interval: recurrence.interval || 1,
          ...(recurrence.frequency === 'weekly' ? { daysOfWeek: recurrence.daysOfWeek || [] } : {}),
          ...(recurrence.frequency === 'monthly' ? { dayOfMonth: recurrence.dayOfMonth } : {}),
          ...(recurrence.endDate ? { endDate: recurrence.endDate } : {}),
          ...(recurrence.paused ? { paused: true } : {}),
        }
      : undefined;

    try {
      await onCreate(
        {
          title,
          description,
          category,
          priority,
          estimatedDuration,
          steps: checklistItems.map(item => ({
            title: item.title,
            description: item.description,
            requiresPhoto: item.requiresPhoto,
            ...(item.images?.length ? { images: item.images } : {}),
          })),
          assignedTo,
          scheduledDate,
          dueTime: dueTime || undefined,
          isRecurring: repeats,
          recurrencePattern,
          templateId: selectedTemplate?.id,
          sopId: linkedSopId || undefined,
          files,
        },
        saveAsTemplate
      );

      // Saved. Anything uploaded here and then removed (or left on a step
      // that was deleted) is in nobody's list, so it goes now.
      const kept = new Set<string>([
        ...files.map(f => f.path),
        ...checklistItems.flatMap(item => (item.images || []).map(f => f.path)),
      ]);
      const orphans = Array.from(sessionUploads.current.values()).filter(f => !kept.has(f.path));
      sessionUploads.current.clear();
      if (orphans.length) void discardUnsaved(orphans);

      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      // Reset submitting state on error so user can try again
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{...styles.modalOverlay, ...(isMobile && styles.modalOverlayMobile)}} onClick={handleClose}>
      <div style={{...styles.modal, ...(isMobile && styles.modalMobile)}} onClick={(e) => e.stopPropagation()}>
        <div style={{...styles.modalHeader, ...(isMobile && styles.modalHeaderMobile)}}>
          <h2 style={{...styles.modalTitle, ...(isMobile && styles.modalTitleMobile)}}>
            {editingTask ? 'Edit Job Task' : 'Create Job Task'}
          </h2>
          <button type="button" style={{...styles.closeButton, ...(isMobile && styles.closeButtonMobile)}} onClick={handleClose}>
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

            {/* Photos & files */}
            <div style={styles.formGroup}>
              <label style={styles.label}>Photos &amp; Files</label>
              <TaskFilesEditor
                files={files}
                onChange={setFiles}
                uid={currentUserId}
                variant="task"
                onUploaded={handleUploaded}
                onRemoved={handleRemoved}
                onBusyChange={handleBusyChange}
                disabled={isSubmitting}
              />
            </div>

            {/* Category */}
            <div style={styles.formGroup}>
              <label style={styles.label}>Category</label>
              {isAddingCategory ? (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="New category name (e.g., Competitions)"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const name = newCategoryName.trim();
                        if (name) {
                          setCategory(name);
                          setIsAddingCategory(false);
                          setNewCategoryName('');
                        }
                      } else if (e.key === 'Escape') {
                        setIsAddingCategory(false);
                        setNewCategoryName('');
                      }
                    }}
                    style={{...styles.input, ...(isMobile && styles.inputMobile), flex: 1}}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const name = newCategoryName.trim();
                      if (name) {
                        setCategory(name);
                        setIsAddingCategory(false);
                        setNewCategoryName('');
                      }
                    }}
                    style={styles.selectAllButton}
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIsAddingCategory(false); setNewCategoryName(''); }}
                    style={styles.selectAllButton}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <select
                  value={category}
                  onChange={(e) => {
                    if (e.target.value === '__add_new__') {
                      setIsAddingCategory(true);
                    } else {
                      setCategory(e.target.value);
                    }
                  }}
                  style={{...styles.select, ...(isMobile && styles.selectMobile)}}
                >
                  {categoryOptions.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                  <option value="__add_new__">+ Add new category…</option>
                </select>
              )}
            </div>

            {/* Scheduled Date & Due Time */}
            <div style={{...styles.formRow, ...(isMobile && styles.formRowMobile)}}>
              <div style={styles.formGroup}>
                <label style={styles.label}>{isRecurring && !isOccurrence ? 'Starts on *' : 'Scheduled Date *'}</label>
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

            {/* Link SOP (Task Level) */}
            <div style={styles.formGroup}>
              <label style={styles.label}>Link SOP (Optional)</label>
              <select
                value={linkedSopId}
                onChange={(e) => setLinkedSopId(e.target.value)}
                style={{...styles.select, ...(isMobile && styles.selectMobile)}}
              >
                <option value="">-- No SOP Linked --</option>
                {sops.map((sop: any) => (
                  <option key={sop.id} value={sop.id}>
                    {sop.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Assign to Team Members */}
            <div style={styles.assignHeaderRow}>
              <label style={styles.label}>Assign to Team Members *</label>
              <div style={styles.assignControlsRow}>
                <select
                  value={filterDepartment}
                  onChange={(e) => setFilterDepartment(e.target.value)}
                  style={styles.departmentSelect}
                >
                  <option value="all">All Departments</option>
                  {departments.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
                <button type="button" onClick={handleSelectAll} style={styles.selectAllButton}>
                  All
                </button>
                <button type="button" onClick={handleDeselectAll} style={styles.selectAllButton}>
                  Clear
                </button>
              </div>
            </div>

            <div style={styles.usersList}>
              {filteredUsers.length === 0 ? (
                <p style={styles.noUsersText}>No users found in this department</p>
              ) : (
                <div style={styles.usersGrid}>
                  {filteredUsers.map((user: any) => {
                    const isSelected = assignedTo.includes(user.id);
                    return (
                      <div
                        key={user.id}
                        style={{
                          ...styles.userCard,
                          ...(isSelected ? styles.userCardSelected : {}),
                        }}
                        onClick={() => handleUserToggle(user.id)}
                      >
                        <div style={styles.userCardCheckbox}>
                          <CustomCheckbox
                            checked={isSelected}
                            onChange={() => handleUserToggle(user.id)}
                            label=""
                          />
                        </div>
                        <StaffAvatar
                          firstName={user.firstName}
                          lastName={user.lastName}
                          avatarPath={user.avatarPath}
                          size={36}
                          style={styles.userCardAvatar}
                        />
                        <div style={styles.userCardInfo}>
                          <span style={styles.userCardName}>
                            {user.firstName} {user.lastName}
                          </span>
                          <span style={styles.userCardRole}>{isManagementRole(user.role) ? roleLabel(user.role) : user.department}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {assignedTo.length > 0 && (
              <div style={styles.selectedCount}>
                Selected: {assignedTo.length} team member{assignedTo.length !== 1 ? 's' : ''}
              </div>
            )}

            {/* Priority and Duration */}
            <div style={{...styles.formRow, ...(isMobile && styles.formRowMobile)}}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TaskPriority)}
                  style={{...styles.select, ...(isMobile && styles.selectMobile)}}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Est. Duration (min)</label>
                <input
                  type="number"
                  value={estimatedDuration}
                  onChange={(e) => setEstimatedDuration(Number(e.target.value))}
                  min={0}
                  placeholder="Optional"
                  style={{...styles.input, ...(isMobile && styles.inputMobile)}}
                />
              </div>
            </div>
          </div>

          {/* Checklist Steps Section (Optional) */}
          <div style={{...styles.section, ...(isMobile && styles.sectionMobile)}}>
            <div style={styles.checklistHeader}>
              <h3 style={{...styles.sectionTitle, marginBottom: 0}}>Checklist Steps (Optional)</h3>
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

            {checklistItems.length === 0 ? (
              <p style={styles.emptyStepsText}>
                No checklist steps added. Click "Add Step" to add steps that team members can check off.
              </p>
            ) : (
              <div style={styles.checklistItems}>
                {checklistItems.map((item, index) => (
                  <div key={item.id} style={styles.checklistItem}>
                    <div style={styles.checklistItemHeader}>
                      <span style={styles.checklistItemNumber}>Step {index + 1}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveChecklistItem(item.id)}
                        style={styles.removeItemButton}
                        title="Remove step"
                      >
                        ✕
                      </button>
                    </div>

                    <div style={styles.formGroup}>
                      <input
                        type="text"
                        value={item.title}
                        onChange={(e) => handleUpdateChecklistItem(item.id, 'title', e.target.value)}
                        placeholder="Step title (e.g., Unlock main entrance)"
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
                    </div>

                    <div style={{ marginTop: '12px' }}>
                      <TaskFilesEditor
                        files={item.images || []}
                        onChange={(update) => updateStepImages(item.id, update)}
                        uid={currentUserId}
                        variant="step"
                        onUploaded={handleUploaded}
                        onRemoved={handleRemoved}
                        onBusyChange={handleBusyChange}
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recurrence Section */}
          <div style={{...styles.section, ...(isMobile && styles.sectionMobile)}}>
            <h3 style={styles.sectionTitle}>Repeat</h3>

            {isOccurrence ? (
              <p style={styles.emptyStepsText}>
                This is one day of a recurring task. Changes here apply to this day only. To change
                every day it repeats, edit it on the Recurring tab.
              </p>
            ) : (
              <>
                {isSeries ? (
                  <p style={{ ...styles.emptyStepsText, margin: 0, textAlign: 'left' }}>
                    Changes apply from today. Days already started or done keep what they had.
                    To stop it, use Pause or End on the Recurring tab.
                  </p>
                ) : (
                  <CustomCheckbox
                    checked={isRecurring}
                    onChange={(on) => {
                      setIsRecurring(on);
                      if (on) setRecurrence(r => (r.frequency === 'weekly' && scheduledDate ? defaultRecurrence(scheduledDate) : r));
                    }}
                    label="Repeat this task"
                  />
                )}

                {isRecurring && (
                  <RecurrenceFields value={recurrence} onChange={setRecurrence} startDate={scheduledDate} />
                )}
              </>
            )}
          </div>

          {/* Save to Task Library — available for new AND edited tasks */}
          <div style={{...styles.section, ...(isMobile && styles.sectionMobile)}}>
            <CustomCheckbox
              checked={saveAsTemplate}
              onChange={setSaveAsTemplate}
              label={editingTask
                ? 'Also save a copy to the Task Library'
                : 'Save to Task Library for future use'}
            />
          </div>

          {/* Form Actions */}
          <div style={{...styles.modalActions, ...(isMobile && styles.modalActionsMobile)}}>
            <button
              type="button"
              onClick={handleClose}
              style={{...styles.cancelButton, ...(isMobile && styles.buttonMobile)}}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                ...styles.saveButton,
                ...(isMobile && styles.buttonMobile),
                ...((isSubmitting || uploadsInFlight > 0) && { opacity: 0.6, cursor: 'not-allowed' })
              }}
              disabled={isSubmitting || uploadsInFlight > 0}
            >
              {isSubmitting
                ? 'Saving...'
                : uploadsInFlight > 0
                  ? 'Uploading...'
                  : (editingTask ? 'Update Task' : 'Create Job Task')}
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
    backgroundColor: theme.colors.overlay,
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
    maxHeight: '90dvh',
    display: 'flex',
    flexDirection: 'column',
    border: `2px solid ${theme.colors.bdr.primary}`,
  },
  modalMobile: {
    maxWidth: '100%',
    maxHeight: '100dvh',
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
    marginBottom: '20px',
  },
  formRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
    gap: '20px',
    marginBottom: '20px',
  },
  formRowMobile: {
    gridTemplateColumns: 'minmax(0, 1fr)',
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
  emptyStepsText: {
    fontSize: '14px',
    color: theme.colors.txt.tertiary,
    fontStyle: 'italic',
    textAlign: 'center' as const,
    padding: '24px 16px',
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.md,
    margin: '16px 0 0 0',
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
    gridTemplateColumns: 'repeat(auto-fill, minmax(min(80px, 100%), 1fr))',
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
    marginTop: '8px',
    marginBottom: '12px',
    flexWrap: 'wrap',
    gap: '8px',
  },
  assignControlsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  departmentSelect: {
    padding: '6px 10px',
    fontSize: '12px',
    fontWeight: 500,
    color: theme.colors.textSecondary,
    backgroundColor: theme.colors.bg.tertiary,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.sm,
    cursor: 'pointer',
    outline: 'none',
  },
  selectAllButton: {
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: 500,
    color: theme.colors.textSecondary,
    backgroundColor: 'transparent',
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.sm,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  usersList: {
    maxHeight: '300px',
    overflowY: 'auto',
    padding: '16px',
    marginBottom: '20px',
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.md,
    border: `1px solid ${theme.colors.bdr.primary}`,
  },
  usersGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(min(220px, 100%), 1fr))',
    gap: '12px',
  },
  userCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 14px',
    backgroundColor: theme.colors.bg.secondary,
    borderRadius: theme.borderRadius.md,
    border: `2px solid ${theme.colors.bdr.primary}`,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  userCardSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: `${theme.colors.primary}15`,
  },
  userCardCheckbox: {
    flexShrink: 0,
  },
  userCardAvatar: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    backgroundColor: theme.colors.primary,
    color: '#FFFFFF',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '13px',
    fontWeight: 600,
    flexShrink: 0,
  },
  userCardInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    minWidth: 0,
    flex: 1,
  },
  userCardName: {
    fontSize: '14px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  userCardRole: {
    fontSize: '12px',
    color: theme.colors.txt.tertiary,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  noUsersText: {
    textAlign: 'center',
    fontSize: '14px',
    color: theme.colors.txt.tertiary,
    fontStyle: 'italic',
  },
  selectedCount: {
    marginTop: '-8px',
    marginBottom: '20px',
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
