import React, { useState, useEffect } from 'react';
import { useTask } from '../contexts/TaskContext';
import { useAuth } from '../contexts/AuthContext';
import { useSOPs } from '../contexts/SOPContext';
import { theme } from '../theme';
import { TaskTemplate, TaskTemplateStep, TaskPriority, TaskStep, JobTask } from '../types';
import { useResponsive } from '../hooks/useResponsive';

interface JobTaskFormProps {
  template?: TaskTemplate | null;
  existingTask?: JobTask | null;
  onClose: () => void;
}

interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  requiresPhoto: boolean;
  sopId?: string;
}

const JobTaskForm: React.FC<JobTaskFormProps> = ({ template, existingTask, onClose }) => {
  const { addJobTask, updateJobTask } = useTask();
  const { users, currentUser } = useAuth();
  const { sops } = useSOPs();
  const { isMobile } = useResponsive();

  const isEditMode = !!existingTask;

  // Get unique departments and categories from users
  const departments = Array.from(new Set(users.filter(u => u.isActive).map(u => u.department)));
  const categories = ['Opening Duties', 'Closing Duties', 'Maintenance', 'Administrative', 'Cleaning', 'Safety', 'Other'];

  // Task Details - Initialize from existingTask if editing, otherwise from template
  const [title, setTitle] = useState<string>(existingTask?.title || template?.title || '');
  const [description, setDescription] = useState<string>(existingTask?.description || template?.description || '');
  const [department, setDepartment] = useState<string>(existingTask?.department || template?.department || '');
  const [category, setCategory] = useState<string>(existingTask?.category || template?.category || '');
  const [priority, setPriority] = useState<TaskPriority>(existingTask?.priority || template?.priority || 'medium');
  const [estimatedDuration, setEstimatedDuration] = useState<number>(existingTask?.estimatedDuration || template?.estimatedDuration || 30);

  // Checklist Items - Initialize from existingTask if editing
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>(
    existingTask?.steps?.map(step => ({
      id: step.id,
      title: step.title,
      description: step.description,
      requiresPhoto: step.requiresPhoto || false,
      sopId: step.sopId,
    })) || template?.steps?.map(step => ({
      id: step.id,
      title: step.title,
      description: step.description,
      requiresPhoto: step.requiresPhoto || false,
      sopId: step.sopId,
    })) || [
      { id: '1', title: '', description: '', requiresPhoto: false }
    ]
  );

  // Assignment - Initialize from existingTask if editing
  const [assignedTo, setAssignedTo] = useState<string[]>(existingTask?.assignedTo || []);
  const [scheduledDate, setScheduledDate] = useState<string>(
    existingTask?.scheduledDate || new Date().toISOString().split('T')[0]
  );
  const [dueTime, setDueTime] = useState<string>(existingTask?.dueTime || '');
  const [filterDepartment, setFilterDepartment] = useState<string>('all');

  // Filter users by department
  const filteredUsers = filterDepartment === 'all'
    ? users.filter(u => u.isActive)
    : users.filter(u => u.isActive && u.department === filterDepartment);

  const handleUserToggle = (userId: string) => {
    setAssignedTo(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleSelectAll = () => {
    const allUserIds = filteredUsers.map(u => u.id);
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

  const moveStepUp = (index: number) => {
    if (index === 0) return;
    const newItems = [...checklistItems];
    [newItems[index - 1], newItems[index]] = [newItems[index], newItems[index - 1]];
    setChecklistItems(newItems);
  };

  const moveStepDown = (index: number) => {
    if (index === checklistItems.length - 1) return;
    const newItems = [...checklistItems];
    [newItems[index], newItems[index + 1]] = [newItems[index + 1], newItems[index]];
    setChecklistItems(newItems);
  };

  const handleSubmit = async (e: React.FormEvent) => {
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

    // Convert checklist items to task steps
    const taskSteps: TaskStep[] = checklistItems.map((item, index) => ({
      id: item.id,
      order: index + 1,
      title: item.title,
      description: item.description,
      isCompleted: existingTask?.completedSteps?.includes(item.id) || false,
      requiresPhoto: item.requiresPhoto,
      sopId: item.sopId,
    }));

    const taskData = {
      title,
      description,
      assignedTo,
      assignedBy: existingTask?.assignedBy || currentUser?.id || 'admin',
      department,
      category,
      scheduledDate,
      dueTime: dueTime || undefined,
      estimatedDuration,
      status: 'pending' as const,
      priority,
      steps: taskSteps,
      completedSteps: existingTask?.completedSteps || [],
      progressPercentage: 0,
      sopIds: taskSteps.filter(s => s.sopId).map(s => s.sopId!),
      comments: existingTask?.comments || [],
    };

    if (isEditMode && existingTask) {
      // Update existing task
      await updateJobTask(existingTask.id, taskData);
    } else {
      // Create new task
      await addJobTask(taskData);
    }

    onClose();
  };

  const handleSaveAsDraft = async () => {
    // Simple validation for drafts - only require title
    if (!title.trim()) {
      alert('Please enter a task title');
      return;
    }

    const taskSteps: TaskStep[] = checklistItems.map((item, index) => ({
      id: item.id,
      order: index + 1,
      title: item.title,
      description: item.description,
      isCompleted: existingTask?.completedSteps?.includes(item.id) || false,
      requiresPhoto: item.requiresPhoto,
      sopId: item.sopId,
    }));

    const draftData = {
      title,
      description,
      assignedTo: assignedTo.length > 0 ? assignedTo : [],
      assignedBy: existingTask?.assignedBy || currentUser?.id || 'admin',
      department: department || 'Unassigned',
      category: category || 'Other',
      scheduledDate: scheduledDate || new Date().toISOString().split('T')[0],
      dueTime: dueTime || undefined,
      estimatedDuration,
      status: 'draft' as const,
      priority,
      steps: taskSteps,
      completedSteps: existingTask?.completedSteps || [],
      progressPercentage: 0,
      sopIds: taskSteps.filter(s => s.sopId).map(s => s.sopId!),
      comments: existingTask?.comments || [],
    };

    if (isEditMode && existingTask) {
      await updateJobTask(existingTask.id, draftData);
    } else {
      await addJobTask(draftData);
    }

    onClose();
  };

  return (
    <div style={{ ...styles.container, ...(isMobile && styles.containerMobile) }}>
      <div style={{ ...styles.header, ...(isMobile && styles.headerMobile) }}>
        <h1 style={{ ...styles.title, ...(isMobile && styles.titleMobile) }}>
          {isEditMode ? 'Edit Job Task' : template ? `Create Job Task from: ${template.title}` : 'Create Job Task'}
        </h1>
        <button onClick={onClose} style={styles.closeButton}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <form onSubmit={handleSubmit} style={styles.form}>
        {/* Assign to Team Members */}
        <div style={{ ...styles.section, ...(isMobile && styles.sectionMobile) }}>
          <div style={{ ...styles.sectionHeader, ...(isMobile && styles.sectionHeaderMobile) }}>
            <h3 style={styles.sectionTitle}>Assign to Team Members</h3>
            <div style={styles.assignActions}>
              <button type="button" onClick={handleSelectAll} style={styles.selectButton}>
                Select All
              </button>
              <button type="button" onClick={handleDeselectAll} style={styles.selectButton}>
                Clear
              </button>
            </div>
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Filter by Department</label>
            <select
              value={filterDepartment}
              onChange={(e) => setFilterDepartment(e.target.value)}
              style={{ ...styles.input, ...(isMobile && styles.inputMobile) }}
            >
              <option value="all">All Departments</option>
              {departments.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>

          <div style={styles.userGrid}>
            {filteredUsers.length === 0 ? (
              <p style={styles.emptyText}>No team members found</p>
            ) : (
              filteredUsers.map(user => (
                <div
                  key={user.id}
                  style={{
                    ...styles.userCard,
                    ...(isMobile && styles.userCardMobile),
                    ...(assignedTo.includes(user.id) ? styles.userCardSelected : {}),
                  }}
                  onClick={() => handleUserToggle(user.id)}
                >
                  <div style={styles.userInfo}>
                    <div style={{
                      ...styles.avatar,
                      backgroundColor: assignedTo.includes(user.id) ? theme.colors.primary : theme.colors.bg.secondary,
                    }}>
                      {user.firstName[0]}{user.lastName[0]}
                    </div>
                    <div>
                      <div style={styles.userName}>{user.firstName} {user.lastName}</div>
                      <div style={styles.userRole}>{user.department}</div>
                    </div>
                  </div>
                  <div style={{
                    ...styles.checkbox,
                    ...(assignedTo.includes(user.id) ? styles.checkboxChecked : {}),
                  }}>
                    {assignedTo.includes(user.id) && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Task Details */}
        <div style={{ ...styles.section, ...(isMobile && styles.sectionMobile) }}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>
              Task Title <span style={styles.required}>*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Daily Opening Checklist"
              style={{ ...styles.input, ...(isMobile && styles.inputMobile) }}
              required
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of the task..."
              rows={3}
              style={{ ...styles.input, ...styles.textarea, ...(isMobile && styles.inputMobile) }}
            />
          </div>

          <div style={styles.formRow}>
            <div style={styles.inputGroup}>
              <label style={styles.label}>
                Department <span style={styles.required}>*</span>
              </label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                required
                style={{ ...styles.input, ...(isMobile && styles.inputMobile) }}
              >
                <option value="">-- Select Department --</option>
                {departments.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>

            <div style={styles.inputGroup}>
              <label style={styles.label}>
                Category <span style={styles.required}>*</span>
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                required
                style={{ ...styles.input, ...(isMobile && styles.inputMobile) }}
              >
                <option value="">-- Select Category --</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={styles.formRow}>
            <div style={styles.inputGroup}>
              <label style={styles.label}>
                Priority <span style={styles.required}>*</span>
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                required
                style={{ ...styles.input, ...(isMobile && styles.inputMobile) }}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            <div style={styles.inputGroup}>
              <label style={styles.label}>
                Est. Duration (min) <span style={styles.required}>*</span>
              </label>
              <input
                type="number"
                value={estimatedDuration}
                onChange={(e) => setEstimatedDuration(Number(e.target.value))}
                min={1}
                required
                style={{ ...styles.input, ...(isMobile && styles.inputMobile) }}
              />
            </div>
          </div>
        </div>

        {/* Task Steps / Checklist */}
        <div style={{ ...styles.section, ...(isMobile && styles.sectionMobile) }}>
          <div style={{ ...styles.sectionHeader, ...(isMobile && styles.sectionHeaderMobile) }}>
            <h3 style={styles.sectionTitle}>Task Steps</h3>
            <button type="button" onClick={handleAddChecklistItem} style={styles.addStepButton}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add Step
            </button>
          </div>

          <div style={styles.stepsContainer}>
            {checklistItems.map((item, index) => (
              <div key={item.id} style={{ ...styles.stepCard, ...(isMobile && styles.stepCardMobile) }}>
                <div style={styles.stepHeader}>
                  <span style={styles.stepNumber}>Step {index + 1}</span>
                  <div style={styles.stepActions}>
                    <button
                      type="button"
                      onClick={() => moveStepUp(index)}
                      disabled={index === 0}
                      style={{
                        ...styles.stepActionButton,
                        opacity: index === 0 ? 0.3 : 1,
                        cursor: index === 0 ? 'not-allowed' : 'pointer',
                      }}
                      title="Move up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveStepDown(index)}
                      disabled={index === checklistItems.length - 1}
                      style={{
                        ...styles.stepActionButton,
                        opacity: index === checklistItems.length - 1 ? 0.3 : 1,
                        cursor: index === checklistItems.length - 1 ? 'not-allowed' : 'pointer',
                      }}
                      title="Move down"
                    >
                      ↓
                    </button>
                    {checklistItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveChecklistItem(item.id)}
                        style={styles.removeStepButton}
                        title="Remove step"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                <div style={styles.inputGroup}>
                  <input
                    type="text"
                    value={item.title}
                    onChange={(e) => handleUpdateChecklistItem(item.id, 'title', e.target.value)}
                    placeholder="Step title (e.g., Unlock main entrance)"
                    required
                    style={{ ...styles.input, ...(isMobile && styles.inputMobile) }}
                  />
                </div>

                <div style={styles.inputGroup}>
                  <textarea
                    value={item.description}
                    onChange={(e) => handleUpdateChecklistItem(item.id, 'description', e.target.value)}
                    placeholder="Step description (optional)"
                    rows={2}
                    style={{ ...styles.input, ...styles.textarea, ...(isMobile && styles.inputMobile) }}
                  />
                </div>

                <div style={styles.stepOptions}>
                  <label style={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={item.requiresPhoto}
                      onChange={(e) => handleUpdateChecklistItem(item.id, 'requiresPhoto', e.target.checked)}
                      style={styles.checkbox}
                    />
                    <span>Requires Photo</span>
                  </label>

                  <div style={styles.sopLinkContainer}>
                    <label style={styles.smallLabel}>Link SOP (optional):</label>
                    <select
                      value={item.sopId || ''}
                      onChange={(e) => handleUpdateChecklistItem(item.id, 'sopId', e.target.value || undefined)}
                      style={styles.smallSelect}
                    >
                      <option value="">-- No SOP --</option>
                      {sops.filter(s => !s.isTemplate).map(sop => (
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

        {/* Schedule */}
        <div style={{ ...styles.section, ...(isMobile && styles.sectionMobile) }}>
          <h3 style={styles.sectionTitle}>Schedule</h3>

          <div style={styles.formRow}>
            <div style={styles.inputGroup}>
              <label style={styles.label}>
                Scheduled Date <span style={styles.required}>*</span>
              </label>
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                required
                style={{ ...styles.input, ...(isMobile && styles.inputMobile) }}
              />
            </div>

            <div style={styles.inputGroup}>
              <label style={styles.label}>Due Time (Optional)</label>
              <input
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                style={{ ...styles.input, ...(isMobile && styles.inputMobile) }}
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ ...styles.actions, ...(isMobile && styles.actionsMobile) }}>
          <button type="button" onClick={onClose} style={{ ...styles.cancelButton, ...(isMobile && styles.buttonMobile) }}>
            Cancel
          </button>
          <button type="button" onClick={handleSaveAsDraft} style={{ ...styles.draftButton, ...(isMobile && styles.buttonMobile) }}>
            Save as Draft
          </button>
          <button type="submit" style={{ ...styles.saveButton, ...(isMobile && styles.buttonMobile) }}>
            {isEditMode ? 'Update Task' : 'Create Job Task'}
          </button>
        </div>
      </form>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '40px',
    maxWidth: '900px',
    margin: '0 auto',
  },
  containerMobile: {
    padding: '16px',
    maxWidth: '100%',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '32px',
  },
  headerMobile: {
    marginBottom: '20px',
  },
  title: {
    fontSize: '32px',
    fontWeight: '800',
    color: theme.colors.textPrimary,
    lineHeight: '1.2',
  },
  titleMobile: {
    fontSize: '24px',
  },
  closeButton: {
    backgroundColor: 'transparent',
    border: 'none',
    color: theme.colors.textSecondary,
    cursor: 'pointer',
    padding: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borderRadius.md,
    transition: 'all 0.2s',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  section: {
    backgroundColor: theme.colors.cardBackground,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.lg,
    padding: '32px',
  },
  sectionMobile: {
    padding: '20px',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  },
  sectionHeaderMobile: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '16px',
  },
  sectionTitle: {
    fontSize: '20px',
    fontWeight: '700',
    color: theme.colors.textPrimary,
    margin: 0,
    marginBottom: '24px',
  },
  inputGroup: {
    marginBottom: '20px',
  },
  formRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '20px',
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginBottom: '8px',
  },
  required: {
    color: theme.colors.error,
  },
  input: {
    width: '100%',
    padding: '12px 16px',
    fontSize: '15px',
    backgroundColor: theme.colors.background,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.textPrimary,
    outline: 'none',
    transition: 'border-color 0.2s',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  inputMobile: {
    fontSize: '16px',
    padding: '14px 16px',
  },
  textarea: {
    resize: 'vertical',
    minHeight: '80px',
  },
  addStepButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '10px 20px',
    backgroundColor: theme.colors.primary,
    color: theme.colors.background,
    border: 'none',
    borderRadius: theme.borderRadius.md,
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  stepsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  stepCard: {
    backgroundColor: theme.colors.background,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    padding: '20px',
  },
  stepCardMobile: {
    padding: '16px',
  },
  stepHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  stepNumber: {
    fontSize: '14px',
    fontWeight: '700',
    color: theme.colors.primary,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  stepActions: {
    display: 'flex',
    gap: '8px',
  },
  stepActionButton: {
    backgroundColor: theme.colors.background,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.sm,
    padding: '4px 12px',
    fontSize: '16px',
    fontWeight: '700',
    color: theme.colors.textSecondary,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  removeStepButton: {
    backgroundColor: 'transparent',
    border: `2px solid ${theme.colors.error}`,
    borderRadius: theme.borderRadius.sm,
    padding: '4px 8px',
    color: theme.colors.error,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
  },
  stepOptions: {
    display: 'flex',
    gap: '20px',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: '12px',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    fontWeight: '500',
    color: theme.colors.textSecondary,
    cursor: 'pointer',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    cursor: 'pointer',
  },
  sopLinkContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flex: 1,
  },
  smallLabel: {
    fontSize: '13px',
    fontWeight: '500',
    color: theme.colors.textSecondary,
  },
  smallSelect: {
    padding: '8px 12px',
    fontSize: '13px',
    backgroundColor: theme.colors.background,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.sm,
    color: theme.colors.textPrimary,
    cursor: 'pointer',
    outline: 'none',
    flex: 1,
  },
  assignActions: {
    display: 'flex',
    gap: '8px',
  },
  selectButton: {
    padding: '8px 16px',
    backgroundColor: theme.colors.background,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    fontSize: '13px',
    fontWeight: '600',
    color: theme.colors.textSecondary,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  usersList: {
    maxHeight: '300px',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '16px',
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.md,
    border: `2px solid ${theme.colors.border}`,
  },
  noUsersText: {
    fontSize: '14px',
    color: theme.colors.textMuted,
    textAlign: 'center',
    padding: '20px',
  },
  userCheckbox: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px',
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    transition: 'all 0.2s',
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
    color: theme.colors.background,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: '700',
  },
  userDetails: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  userName: {
    fontSize: '14px',
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  userDepartment: {
    fontSize: '12px',
    color: theme.colors.textMuted,
  },
  selectedCount: {
    fontSize: '13px',
    fontWeight: '600',
    color: theme.colors.primary,
    padding: '12px',
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderRadius: theme.borderRadius.md,
    textAlign: 'center',
    marginTop: '12px',
  },
  actions: {
    display: 'flex',
    gap: '16px',
    justifyContent: 'flex-end',
    paddingTop: '8px',
  },
  actionsMobile: {
    flexDirection: 'column-reverse',
  },
  cancelButton: {
    padding: '14px 32px',
    backgroundColor: theme.colors.background,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    fontSize: '15px',
    fontWeight: '600',
    color: theme.colors.textSecondary,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  draftButton: {
    padding: '14px 32px',
    backgroundColor: 'rgba(168, 85, 247, 0.1)',
    border: `2px solid rgba(168, 85, 247, 0.3)`,
    borderRadius: theme.borderRadius.md,
    fontSize: '15px',
    fontWeight: '600',
    color: '#a855f7',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  saveButton: {
    padding: '14px 32px',
    backgroundColor: theme.colors.primary,
    color: theme.colors.background,
    border: 'none',
    borderRadius: theme.borderRadius.md,
    fontSize: '15px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  buttonMobile: {
    width: '100%',
    padding: '16px',
  },
};

export default JobTaskForm;
