import React, { useState } from 'react';
import { useTask } from '../contexts/TaskContext';
import { useAuth } from '../contexts/AuthContext';
import { useSOPs } from '../contexts/SOPContext';
import { JobTask, TaskTemplate, TaskStep, TaskPriority } from '../types';
import { theme } from '../theme';

const JobTasksPage: React.FC = () => {
  const { jobTasks, taskTemplates, createJobTaskFromTemplate, addJobTask, updateJobTask, deleteJobTask } = useTask();
  const { currentUser, users } = useAuth();
  const { sops } = useSOPs();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TaskTemplate | null>(null);
  const [selectedTask, setSelectedTask] = useState<JobTask | null>(null);
  const [showTaskDetailModal, setShowTaskDetailModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterDepartment, setFilterDepartment] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Get unique departments from job tasks
  const departments = Array.from(new Set(jobTasks.map(t => t.department)));

  // Filter job tasks
  const filteredTasks = jobTasks.filter(task => {
    const matchesSearch = task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         task.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'all' || task.status === filterStatus;
    const matchesDepartment = filterDepartment === 'all' || task.department === filterDepartment;
    return matchesSearch && matchesStatus && matchesDepartment;
  });

  // Sort by scheduled date (upcoming first)
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    return new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime();
  });

  const handleCreateFromTemplate = (template: TaskTemplate) => {
    setSelectedTemplate(template);
    setShowCreateModal(true);
  };

  const handleDeleteTask = (id: string) => {
    if (window.confirm('Are you sure you want to delete this job task?')) {
      deleteJobTask(id);
    }
  };

  const handleCloseModal = () => {
    setShowCreateModal(false);
    setSelectedTemplate(null);
  };

  const handleTaskClick = (task: JobTask) => {
    setSelectedTask(task);
    setShowTaskDetailModal(true);
  };

  const handleCloseTaskDetail = () => {
    setShowTaskDetailModal(false);
    setSelectedTask(null);
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke={theme.colors.primary}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ marginRight: '12px' }}
            >
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
            Job Tasks
          </h1>
          <p style={styles.subtitle}>Create and assign tasks to team members</p>
        </div>
        <button style={styles.createButton} onClick={() => setShowCreateModal(true)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Create Job Task
        </button>
      </div>

      {/* Quick Template Buttons */}
      {taskTemplates.length > 0 && (
        <div style={styles.quickTemplatesSection}>
          <h3 style={styles.quickTemplatesTitle}>Quick Create from Template:</h3>
          <div style={styles.quickTemplatesGrid}>
            {taskTemplates.slice(0, 6).map(template => (
              <button
                key={template.id}
                style={styles.quickTemplateButton}
                onClick={() => handleCreateFromTemplate(template)}
              >
                <span style={styles.quickTemplateIcon}>📋</span>
                <span style={styles.quickTemplateText}>{template.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={styles.filtersContainer}>
        <div style={styles.searchContainer}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={styles.searchIcon}>
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={styles.searchInput}
          />
        </div>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={styles.filterSelect}
        >
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="in-progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="overdue">Overdue</option>
        </select>

        <select
          value={filterDepartment}
          onChange={(e) => setFilterDepartment(e.target.value)}
          style={styles.filterSelect}
        >
          <option value="all">All Departments</option>
          {departments.map(dept => (
            <option key={dept} value={dept}>{dept}</option>
          ))}
        </select>
      </div>

      {/* Job Tasks List */}
      <div style={styles.tasksList}>
        {sortedTasks.length === 0 ? (
          <div style={styles.emptyState}>
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke={theme.colors.txt.tertiary} strokeWidth="1.5">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
            <p style={styles.emptyText}>No job tasks found</p>
            <p style={styles.emptySubtext}>Create your first task to get started</p>
          </div>
        ) : (
          sortedTasks.map(task => (
            <JobTaskCard
              key={task.id}
              task={task}
              users={users}
              onDelete={() => handleDeleteTask(task.id)}
              onClick={() => handleTaskClick(task)}
            />
          ))
        )}
      </div>

      {/* Task Detail Modal for Admins */}
      {showTaskDetailModal && selectedTask && (
        <JobTaskDetailModal
          task={selectedTask}
          users={users}
          sops={sops}
          onClose={handleCloseTaskDetail}
          onUpdate={(updatedTask: Partial<JobTask>) => {
            updateJobTask(selectedTask.id, updatedTask);
            handleCloseTaskDetail();
          }}
        />
      )}

      {/* Create Job Task Modal */}
      {showCreateModal && (
        <CreateJobTaskModal
          template={selectedTemplate}
          onClose={handleCloseModal}
          onCreate={(taskData) => {
            // Convert checklist items to TaskStep format
            const taskSteps: TaskStep[] = taskData.checklistItems.map((item, index) => ({
              id: item.id,
              order: index + 1,
              title: item.title,
              description: item.description,
              isCompleted: false,
              requiresPhoto: item.requiresPhoto,
              sopId: item.sopId,
            }));

            // Create the job task
            addJobTask({
              title: taskData.title,
              description: taskData.description,
              assignedTo: taskData.assignedTo,
              assignedBy: currentUser?.id || 'unknown',
              department: taskData.department,
              category: taskData.category,
              scheduledDate: taskData.scheduledDate,
              dueTime: taskData.dueTime,
              estimatedDuration: taskData.estimatedDuration,
              status: 'pending',
              priority: taskData.priority as TaskPriority,
              steps: taskSteps,
              completedSteps: [],
              sopIds: taskSteps.filter(s => s.sopId).map(s => s.sopId!),
              comments: [],
            });

            handleCloseModal();
          }}
          taskTemplates={taskTemplates}
          users={users.filter(u => u.isActive)}
          sops={sops}
          currentUserId={currentUser?.id || ''}
        />
      )}
    </div>
  );
};

// Job Task Card Component
interface JobTaskCardProps {
  task: JobTask;
  users: any[];
  onDelete: () => void;
  onClick: () => void;
}

const JobTaskCard: React.FC<JobTaskCardProps> = ({ task, users, onDelete, onClick }) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return theme.colors.status.success;
      case 'in-progress': return theme.colors.status.info;
      case 'overdue': return theme.colors.status.error;
      case 'pending': return theme.colors.status.warning;
      default: return theme.colors.txt.tertiary;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return theme.colors.status.error;
      case 'high': return theme.colors.status.warning;
      case 'medium': return theme.colors.status.info;
      default: return theme.colors.txt.tertiary;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const assignedUsers = users.filter(u => task.assignedTo.includes(u.id));

  return (
    <div style={styles.taskCard} onClick={onClick}>
      <div style={styles.taskCardHeader}>
        <div style={styles.taskCardHeaderLeft}>
          <h3 style={styles.taskCardTitle}>{task.title}</h3>
          <p style={styles.taskCardDescription}>{task.description}</p>
        </div>
        <div style={styles.taskCardActions}>
          <button
            style={styles.deleteButton}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      </div>

      <div style={styles.taskCardMeta}>
        <div style={styles.taskCardBadges}>
          <span style={{...styles.statusBadge, backgroundColor: getStatusColor(task.status) + '20', color: getStatusColor(task.status)}}>
            {task.status.replace('-', ' ').toUpperCase()}
          </span>
          <span style={{...styles.priorityBadge, color: getPriorityColor(task.priority)}}>
            {task.priority.toUpperCase()}
          </span>
          <span style={styles.departmentBadge}>
            {task.department}
          </span>
        </div>

        <div style={styles.taskCardDate}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          {formatDate(task.scheduledDate)}
          {task.dueTime && ` at ${task.dueTime}`}
        </div>
      </div>

      {/* Progress Bar */}
      <div style={styles.progressSection}>
        <div style={styles.progressHeader}>
          <span style={styles.progressText}>Progress: {task.progressPercentage}%</span>
          <span style={styles.progressSteps}>{task.completedSteps.length} / {task.steps.length} steps</span>
        </div>
        <div style={styles.progressBar}>
          <div style={{...styles.progressFill, width: `${task.progressPercentage}%`}} />
        </div>
      </div>

      {/* Assigned Users */}
      {assignedUsers.length > 0 && (
        <div style={styles.assignedSection}>
          <span style={styles.assignedLabel}>Assigned to:</span>
          <div style={styles.assignedUsers}>
            {assignedUsers.map(user => (
              <div key={user.id} style={styles.assignedUser}>
                <div style={styles.assignedUserAvatar}>
                  {user.firstName.charAt(0)}{user.lastName.charAt(0)}
                </div>
                <span style={styles.assignedUserName}>
                  {user.firstName} {user.lastName}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Task Stats */}
      <div style={styles.taskCardStats}>
        <div style={styles.stat}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span>{task.estimatedDuration} min</span>
        </div>
        {task.sopIds.length > 0 && (
          <div style={styles.stat}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <span>{task.sopIds.length} SOPs</span>
          </div>
        )}
        {task.category && (
          <div style={styles.stat}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 7h-9M14 17H5M17 12H3" />
            </svg>
            <span>{task.category}</span>
          </div>
        )}
      </div>
    </div>
  );
};

// Create Job Task Modal Component
interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  requiresPhoto: boolean;
  sopId?: string;
}

interface CreateJobTaskModalProps {
  template: TaskTemplate | null;
  onClose: () => void;
  onCreate: (taskData: {
    title: string;
    description: string;
    department: string;
    category: string;
    priority: string;
    estimatedDuration: number;
    checklistItems: ChecklistItem[];
    assignedTo: string[];
    scheduledDate: string;
    dueTime?: string;
  }) => void;
  taskTemplates: TaskTemplate[];
  users: any[];
  sops: any[];
  currentUserId: string;
}

const CreateJobTaskModal: React.FC<CreateJobTaskModalProps> = ({
  template,
  onClose,
  onCreate,
  taskTemplates,
  users,
  sops,
  currentUserId,
}) => {
  // Task Details
  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [department, setDepartment] = useState<string>('');
  const [category, setCategory] = useState<string>('');
  const [priority, setPriority] = useState<string>('medium');
  const [estimatedDuration, setEstimatedDuration] = useState<number>(30);

  // Checklist Items
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([
    { id: '1', title: '', description: '', requiresPhoto: false }
  ]);

  // Assignment
  const [assignedTo, setAssignedTo] = useState<string[]>([]);
  const [scheduledDate, setScheduledDate] = useState<string>('');
  const [dueTime, setDueTime] = useState<string>('');
  const [filterDepartment, setFilterDepartment] = useState<string>('all');

  // Get unique departments and categories from users
  const departments = Array.from(new Set(users.map(u => u.department)));
  const categories = ['Opening Duties', 'Closing Duties', 'Maintenance', 'Administrative', 'Cleaning', 'Safety', 'Other'];

  // Filter users by department
  const filteredUsers = filterDepartment === 'all'
    ? users
    : users.filter(u => u.department === filterDepartment);

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

    onCreate({
      title,
      description,
      department,
      category,
      priority,
      estimatedDuration,
      checklistItems,
      assignedTo,
      scheduledDate,
      dueTime: dueTime || undefined,
    });
  };

  // Set default date to today
  React.useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    setScheduledDate(today);
  }, []);

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Create Job Task</h2>
          <button style={styles.closeButton} onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} style={styles.modalForm}>
          {/* Task Basic Info */}
          <div style={styles.formGroup}>
            <label style={styles.label}>Task Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Daily Opening Checklist"
              required
              style={styles.input}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of the task..."
              rows={3}
              style={styles.textarea}
            />
          </div>

          {/* Department and Category */}
          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Department *</label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                required
                style={styles.select}
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
                style={styles.select}
              >
                <option value="">-- Select Category --</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Priority and Duration */}
          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Priority *</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                required
                style={styles.select}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
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
                style={styles.input}
              />
            </div>
          </div>

          {/* Checklist Items Builder */}
          <div style={styles.formGroup}>
            <div style={styles.checklistHeader}>
              <label style={styles.label}>Checklist Items *</label>
              <button
                type="button"
                onClick={handleAddChecklistItem}
                style={styles.addItemButton}
              >
                + Add Item
              </button>
            </div>

            <div style={styles.checklistItems}>
              {checklistItems.map((item, index) => (
                <div key={item.id} style={styles.checklistItem}>
                  <div style={styles.checklistItemHeader}>
                    <span style={styles.checklistItemNumber}>#{index + 1}</span>
                    {checklistItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveChecklistItem(item.id)}
                        style={styles.removeItemButton}
                        title="Remove item"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div style={styles.formGroup}>
                    <input
                      type="text"
                      value={item.title}
                      onChange={(e) => handleUpdateChecklistItem(item.id, 'title', e.target.value)}
                      placeholder="Item title (e.g., Unlock main entrance)"
                      required
                      style={styles.input}
                    />
                  </div>

                  <div style={styles.formGroup}>
                    <textarea
                      value={item.description}
                      onChange={(e) => handleUpdateChecklistItem(item.id, 'description', e.target.value)}
                      placeholder="Item description (optional)"
                      rows={2}
                      style={styles.textarea}
                    />
                  </div>

                  <div style={styles.checklistItemOptions}>
                    <label style={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={item.requiresPhoto}
                        onChange={(e) => handleUpdateChecklistItem(item.id, 'requiresPhoto', e.target.checked)}
                        style={styles.checkbox}
                      />
                      <span>Requires Photo</span>
                    </label>

                    <div style={styles.sopSelect}>
                      <label style={styles.smallLabel}>Link SOP (optional):</label>
                      <select
                        value={item.sopId || ''}
                        onChange={(e) => handleUpdateChecklistItem(item.id, 'sopId', e.target.value || undefined)}
                        style={styles.smallSelect}
                      >
                        <option value="">-- No SOP --</option>
                        {sops.map(sop => (
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

          {/* Schedule Date & Time */}
          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Scheduled Date *</label>
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                required
                style={styles.input}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Due Time (Optional)</label>
              <input
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                style={styles.input}
              />
            </div>
          </div>

          {/* Assign to Team Members */}
          <div style={styles.formGroup}>
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
                filteredUsers.map(user => (
                  <label key={user.id} style={styles.userCheckbox}>
                    <input
                      type="checkbox"
                      checked={assignedTo.includes(user.id)}
                      onChange={() => handleUserToggle(user.id)}
                      style={styles.checkbox}
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
                  </label>
                ))
              )}
            </div>
          </div>

          {assignedTo.length > 0 && (
            <div style={styles.selectedCount}>
              Selected: {assignedTo.length} team member{assignedTo.length !== 1 ? 's' : ''}
            </div>
          )}

          {/* Form Actions */}
          <div style={styles.modalActions}>
            <button type="button" onClick={onClose} style={styles.cancelButton}>
              Cancel
            </button>
            <button type="submit" style={styles.saveButton}>
              Create Job Task
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Job Task Detail Modal for Admins
interface JobTaskDetailModalProps {
  task: JobTask;
  users: any[];
  sops: any[];
  onClose: () => void;
  onUpdate: (task: Partial<JobTask>) => void;
}

const JobTaskDetailModal: React.FC<JobTaskDetailModalProps> = ({ task, users, sops, onClose, onUpdate }) => {
  const [editedTask, setEditedTask] = useState<JobTask>({ ...task });
  const [isEditing, setIsEditing] = useState(false);

  const handleToggleStep = (stepId: string) => {
    const isCompleted = editedTask.completedSteps.includes(stepId);
    const newCompletedSteps = isCompleted
      ? editedTask.completedSteps.filter(id => id !== stepId)
      : [...editedTask.completedSteps, stepId];

    const updatedTask: JobTask = {
      ...editedTask,
      completedSteps: newCompletedSteps,
      progressPercentage: Math.round((newCompletedSteps.length / editedTask.steps.length) * 100),
      status: newCompletedSteps.length === editedTask.steps.length ? 'completed' as const :
              newCompletedSteps.length > 0 ? 'in-progress' as const : 'pending' as const,
    };

    setEditedTask(updatedTask);
  };

  const handleMarkAllComplete = () => {
    const allStepIds = editedTask.steps.map(s => s.id);
    const updatedTask = {
      ...editedTask,
      completedSteps: allStepIds,
      progressPercentage: 100,
      status: 'completed' as const,
    };
    setEditedTask(updatedTask);
  };

  const handleSave = () => {
    onUpdate(editedTask);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return theme.colors.status.success;
      case 'in-progress': return theme.colors.status.info;
      case 'overdue': return theme.colors.status.error;
      case 'pending': return theme.colors.status.warning;
      default: return theme.colors.txt.tertiary;
    }
  };

  const assignedUsers = users.filter(u => task.assignedTo.includes(u.id));

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={{...styles.modal, maxWidth: '900px'}} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <div>
            <h2 style={styles.modalTitle}>{editedTask.title}</h2>
            <p style={{fontSize: '14px', color: theme.colors.txt.secondary, marginTop: '4px'}}>
              {editedTask.description}
            </p>
          </div>
          <button style={styles.closeButton} onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div style={styles.modalForm}>
          {/* Task Meta Info */}
          <div style={styles.taskDetailMeta}>
            <div style={styles.taskDetailMetaItem}>
              <span style={styles.taskDetailMetaLabel}>Status:</span>
              <span style={{...styles.statusBadge, backgroundColor: getStatusColor(editedTask.status) + '20', color: getStatusColor(editedTask.status)}}>
                {editedTask.status.replace('-', ' ').toUpperCase()}
              </span>
            </div>
            <div style={styles.taskDetailMetaItem}>
              <span style={styles.taskDetailMetaLabel}>Priority:</span>
              <span style={styles.taskDetailMetaValue}>{editedTask.priority.toUpperCase()}</span>
            </div>
            <div style={styles.taskDetailMetaItem}>
              <span style={styles.taskDetailMetaLabel}>Department:</span>
              <span style={styles.taskDetailMetaValue}>{editedTask.department}</span>
            </div>
            <div style={styles.taskDetailMetaItem}>
              <span style={styles.taskDetailMetaLabel}>Category:</span>
              <span style={styles.taskDetailMetaValue}>{editedTask.category}</span>
            </div>
            <div style={styles.taskDetailMetaItem}>
              <span style={styles.taskDetailMetaLabel}>Due Date:</span>
              <span style={styles.taskDetailMetaValue}>
                {new Date(editedTask.scheduledDate).toLocaleDateString()}
                {editedTask.dueTime && ` at ${editedTask.dueTime}`}
              </span>
            </div>
            <div style={styles.taskDetailMetaItem}>
              <span style={styles.taskDetailMetaLabel}>Duration:</span>
              <span style={styles.taskDetailMetaValue}>{editedTask.estimatedDuration} min</span>
            </div>
          </div>

          {/* Assigned Users */}
          {assignedUsers.length > 0 && (
            <div style={styles.formGroup}>
              <label style={styles.label}>Assigned To:</label>
              <div style={styles.assignedUsers}>
                {assignedUsers.map(user => (
                  <div key={user.id} style={styles.assignedUser}>
                    <div style={styles.assignedUserAvatar}>
                      {user.firstName.charAt(0)}{user.lastName.charAt(0)}
                    </div>
                    <span style={styles.assignedUserName}>
                      {user.firstName} {user.lastName}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Progress */}
          <div style={styles.formGroup}>
            <div style={styles.progressHeader}>
              <label style={styles.label}>Progress</label>
              <span style={styles.progressText}>{editedTask.progressPercentage}%</span>
            </div>
            <div style={styles.progressBar}>
              <div style={{...styles.progressFill, width: `${editedTask.progressPercentage}%`}} />
            </div>
            <div style={{fontSize: '13px', color: theme.colors.txt.secondary, marginTop: '8px'}}>
              {editedTask.completedSteps.length} of {editedTask.steps.length} steps completed
            </div>
          </div>

          {/* Task Steps Checklist */}
          <div style={styles.formGroup}>
            <div style={styles.checklistHeader}>
              <label style={styles.label}>Task Steps</label>
              {editedTask.completedSteps.length < editedTask.steps.length && (
                <button
                  type="button"
                  onClick={handleMarkAllComplete}
                  style={styles.addItemButton}
                >
                  Mark All Complete
                </button>
              )}
            </div>

            <div style={styles.taskStepsList}>
              {editedTask.steps.map((step, index) => {
                const isCompleted = editedTask.completedSteps.includes(step.id);
                const linkedSOP = step.sopId ? sops.find(s => s.id === step.sopId) : null;

                return (
                  <div key={step.id} style={styles.taskStepItem}>
                    <div style={styles.taskStepHeader}>
                      <label style={styles.taskStepCheckbox}>
                        <input
                          type="checkbox"
                          checked={isCompleted}
                          onChange={() => handleToggleStep(step.id)}
                          style={styles.checkbox}
                        />
                        <span style={{...styles.taskStepTitle, textDecoration: isCompleted ? 'line-through' : 'none', opacity: isCompleted ? 0.6 : 1}}>
                          {index + 1}. {step.title}
                        </span>
                      </label>
                      {step.requiresPhoto && (
                        <span style={styles.photoRequiredBadge}>
                          📷 Photo Required
                        </span>
                      )}
                    </div>

                    {step.description && (
                      <p style={styles.taskStepDescription}>{step.description}</p>
                    )}

                    {linkedSOP && (
                      <div style={styles.linkedSOPBadge}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                        <span>Linked SOP: {linkedSOP.title}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Comments Section (if exists) */}
          {editedTask.comments && editedTask.comments.length > 0 && (
            <div style={styles.formGroup}>
              <label style={styles.label}>Comments ({editedTask.comments.length})</label>
              <div style={styles.commentsList}>
                {editedTask.comments.map((comment, index) => (
                  <div key={index} style={styles.commentItem}>
                    <div style={styles.commentHeader}>
                      <span style={styles.commentAuthor}>{comment.userName}</span>
                      <span style={styles.commentDate}>
                        {new Date(comment.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p style={styles.commentText}>{comment.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div style={styles.modalActions}>
            <button onClick={onClose} style={styles.cancelButton}>
              Close
            </button>
            <button onClick={handleSave} style={styles.saveButton}>
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '40px',
    maxWidth: '1400px',
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '32px',
    gap: '24px',
  },
  title: {
    fontSize: '36px',
    fontWeight: '800',
    color: theme.colors.textPrimary,
    marginBottom: '8px',
    display: 'flex',
    alignItems: 'center',
  },
  subtitle: {
    fontSize: '16px',
    color: theme.colors.textSecondary,
    marginTop: '8px',
  },
  createButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '14px 24px',
    backgroundColor: theme.colors.primary,
    color: theme.colors.background,
    border: 'none',
    borderRadius: theme.borderRadius.md,
    fontSize: '15px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
  },
  quickTemplatesSection: {
    marginBottom: theme.spacing.xl,
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.bg.secondary,
    borderRadius: theme.borderRadius.lg,
    border: `1px solid ${theme.colors.bdr.primary}`,
  },
  quickTemplatesTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: theme.colors.txt.secondary,
    marginBottom: theme.spacing.md,
  },
  quickTemplatesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: theme.spacing.sm,
  },
  quickTemplateButton: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.bg.tertiary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.txt.primary,
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  quickTemplateIcon: {
    fontSize: '20px',
  },
  quickTemplateText: {
    flex: 1,
    textAlign: 'left',
  },
  filtersContainer: {
    display: 'flex',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.xl,
  },
  searchContainer: {
    position: 'relative',
    flex: 1,
  },
  searchIcon: {
    position: 'absolute',
    left: '14px',
    top: '50%',
    transform: 'translateY(-50%)',
    color: theme.colors.txt.tertiary,
    pointerEvents: 'none',
  },
  searchInput: {
    width: '100%',
    padding: `${theme.spacing.md} ${theme.spacing.md} ${theme.spacing.md} 44px`,
    backgroundColor: theme.colors.bg.secondary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.txt.primary,
    fontSize: '15px',
    outline: 'none',
    boxSizing: 'border-box',
  },
  filterSelect: {
    padding: `${theme.spacing.md} ${theme.spacing.lg}`,
    backgroundColor: theme.colors.bg.secondary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.txt.primary,
    fontSize: '15px',
    cursor: 'pointer',
    outline: 'none',
  },
  tasksList: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.lg,
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xxl,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: '18px',
    fontWeight: 600,
    color: theme.colors.txt.secondary,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.xs,
  },
  emptySubtext: {
    fontSize: '14px',
    color: theme.colors.txt.tertiary,
  },
  taskCard: {
    backgroundColor: theme.colors.cardBackground,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.lg,
    padding: '24px',
    transition: 'all 0.2s',
    cursor: 'pointer',
  },
  taskCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.md,
  },
  taskCardHeaderLeft: {
    flex: 1,
  },
  taskCardTitle: {
    fontSize: '18px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
    marginBottom: theme.spacing.xs,
  },
  taskCardDescription: {
    fontSize: '14px',
    color: theme.colors.txt.secondary,
    lineHeight: '1.5',
  },
  taskCardActions: {
    display: 'flex',
    gap: theme.spacing.xs,
  },
  deleteButton: {
    padding: theme.spacing.xs,
    backgroundColor: 'rgba(239, 35, 60, 0.1)',
    border: `1px solid rgba(239, 35, 60, 0.3)`,
    borderRadius: theme.borderRadius.sm,
    color: theme.colors.status.error,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskCardMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  taskCardBadges: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  statusBadge: {
    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
    borderRadius: theme.borderRadius.sm,
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.5px',
  },
  priorityBadge: {
    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.5px',
  },
  departmentBadge: {
    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
    backgroundColor: 'rgba(239, 35, 60, 0.15)',
    color: theme.colors.primary,
    borderRadius: theme.borderRadius.sm,
    fontSize: '11px',
    fontWeight: 600,
  },
  taskCardDate: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.xs,
    fontSize: '13px',
    color: theme.colors.txt.tertiary,
  },
  progressSection: {
    marginBottom: theme.spacing.lg,
  },
  progressHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.xs,
  },
  progressText: {
    fontSize: '13px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
  },
  progressSteps: {
    fontSize: '13px',
    color: theme.colors.txt.secondary,
  },
  progressBar: {
    width: '100%',
    height: '8px',
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.colors.primary,
    transition: 'width 0.3s ease',
  },
  assignedSection: {
    marginBottom: theme.spacing.lg,
  },
  assignedLabel: {
    fontSize: '13px',
    fontWeight: 600,
    color: theme.colors.txt.secondary,
    display: 'block',
    marginBottom: theme.spacing.sm,
  },
  assignedUsers: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  assignedUser: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.xs,
    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.md,
  },
  assignedUserAvatar: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    backgroundColor: theme.colors.primary,
    color: theme.colors.txt.primary,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '10px',
    fontWeight: 600,
  },
  assignedUserName: {
    fontSize: '13px',
    color: theme.colors.txt.primary,
    fontWeight: 500,
  },
  taskCardStats: {
    display: 'flex',
    gap: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    borderTop: `1px solid ${theme.colors.bdr.primary}`,
  },
  stat: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.xs,
    fontSize: '13px',
    color: theme.colors.txt.tertiary,
  },
  modalOverlay: {
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
    padding: theme.spacing.lg,
  },
  modal: {
    backgroundColor: theme.colors.bg.secondary,
    borderRadius: theme.borderRadius.lg,
    width: '100%',
    maxWidth: '700px',
    maxHeight: '90vh',
    overflow: 'auto',
    border: `1px solid ${theme.colors.bdr.primary}`,
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.xl,
    borderBottom: `1px solid ${theme.colors.bdr.primary}`,
    position: 'sticky',
    top: 0,
    backgroundColor: theme.colors.bg.secondary,
    zIndex: 10,
  },
  modalTitle: {
    fontSize: '24px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
  },
  closeButton: {
    backgroundColor: 'transparent',
    border: 'none',
    color: theme.colors.txt.tertiary,
    cursor: 'pointer',
    padding: theme.spacing.xs,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalForm: {
    padding: theme.spacing.xl,
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.lg,
  },
  formRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: theme.spacing.lg,
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.sm,
  },
  label: {
    fontSize: '14px',
    fontWeight: 500,
    color: theme.colors.txt.primary,
  },
  input: {
    padding: theme.spacing.md,
    backgroundColor: theme.colors.bg.tertiary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.txt.primary,
    fontSize: '15px',
    outline: 'none',
    boxSizing: 'border-box',
  },
  select: {
    padding: theme.spacing.md,
    backgroundColor: theme.colors.bg.tertiary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.txt.primary,
    fontSize: '15px',
    cursor: 'pointer',
    outline: 'none',
  },
  templatePreview: {
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.md,
    border: `1px solid ${theme.colors.bdr.primary}`,
  },
  templatePreviewTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
    marginBottom: theme.spacing.sm,
  },
  templatePreviewDescription: {
    fontSize: '14px',
    color: theme.colors.txt.secondary,
    marginBottom: theme.spacing.md,
    lineHeight: '1.5',
  },
  templatePreviewStats: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  templatePreviewStat: {
    fontSize: '13px',
    color: theme.colors.txt.tertiary,
  },
  assignHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  assignActions: {
    display: 'flex',
    gap: theme.spacing.xs,
  },
  selectAllButton: {
    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
    backgroundColor: theme.colors.bg.tertiary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.sm,
    color: theme.colors.txt.secondary,
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  departmentFilter: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  smallLabel: {
    fontSize: '13px',
    color: theme.colors.txt.secondary,
  },
  smallSelect: {
    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
    backgroundColor: theme.colors.bg.tertiary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.sm,
    color: theme.colors.txt.primary,
    fontSize: '13px',
    cursor: 'pointer',
    outline: 'none',
  },
  usersList: {
    maxHeight: '300px',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.xs,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.md,
    border: `1px solid ${theme.colors.bdr.primary}`,
  },
  noUsersText: {
    fontSize: '14px',
    color: theme.colors.txt.tertiary,
    textAlign: 'center',
    padding: theme.spacing.lg,
  },
  userCheckbox: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.bg.secondary,
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    cursor: 'pointer',
  },
  userInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flex: 1,
  },
  userAvatar: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    backgroundColor: theme.colors.primary,
    color: theme.colors.txt.primary,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: 600,
  },
  userDetails: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
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
  selectedCount: {
    fontSize: '13px',
    fontWeight: 600,
    color: theme.colors.primary,
    padding: theme.spacing.sm,
    backgroundColor: 'rgba(239, 35, 60, 0.1)',
    borderRadius: theme.borderRadius.md,
    textAlign: 'center',
  },
  modalActions: {
    display: 'flex',
    gap: theme.spacing.md,
    justifyContent: 'flex-end',
    paddingTop: theme.spacing.lg,
    borderTop: `1px solid ${theme.colors.bdr.primary}`,
    marginTop: theme.spacing.lg,
  },
  cancelButton: {
    padding: `${theme.spacing.md} ${theme.spacing.xl}`,
    backgroundColor: theme.colors.bg.tertiary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.txt.secondary,
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  saveButton: {
    padding: `${theme.spacing.md} ${theme.spacing.xl}`,
    backgroundColor: theme.colors.primary,
    color: theme.colors.txt.primary,
    border: 'none',
    borderRadius: theme.borderRadius.md,
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  textarea: {
    width: '100%',
    padding: theme.spacing.md,
    backgroundColor: theme.colors.bg.tertiary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.txt.primary,
    fontSize: '15px',
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  checklistHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  addItemButton: {
    padding: `${theme.spacing.xs} ${theme.spacing.md}`,
    backgroundColor: theme.colors.primary,
    color: theme.colors.txt.primary,
    border: 'none',
    borderRadius: theme.borderRadius.sm,
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  checklistItems: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.md,
  },
  checklistItem: {
    padding: theme.spacing.md,
    backgroundColor: theme.colors.bg.tertiary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
  },
  checklistItemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  checklistItemNumber: {
    fontSize: '12px',
    fontWeight: 700,
    color: theme.colors.primary,
  },
  removeItemButton: {
    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
    backgroundColor: 'transparent',
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.sm,
    color: theme.colors.txt.tertiary,
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  checklistItemOptions: {
    display: 'flex',
    gap: theme.spacing.md,
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.xs,
    fontSize: '13px',
    color: theme.colors.txt.secondary,
    cursor: 'pointer',
  },
  sopSelect: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.xs,
    flex: 1,
  },
  taskDetailMeta: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.md,
    border: `1px solid ${theme.colors.bdr.primary}`,
  },
  taskDetailMetaItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.xs,
  },
  taskDetailMetaLabel: {
    fontSize: '12px',
    fontWeight: 600,
    color: theme.colors.txt.tertiary,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  taskDetailMetaValue: {
    fontSize: '14px',
    fontWeight: 500,
    color: theme.colors.txt.primary,
  },
  taskStepsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.sm,
  },
  taskStepItem: {
    padding: theme.spacing.md,
    backgroundColor: theme.colors.bg.tertiary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    transition: 'all 0.2s',
  },
  taskStepHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  taskStepCheckbox: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.sm,
    cursor: 'pointer',
    flex: 1,
  },
  taskStepTitle: {
    fontSize: '15px',
    fontWeight: 500,
    color: theme.colors.txt.primary,
  },
  taskStepDescription: {
    fontSize: '13px',
    color: theme.colors.txt.secondary,
    marginLeft: '30px',
    marginTop: theme.spacing.xs,
    lineHeight: '1.5',
  },
  photoRequiredBadge: {
    fontSize: '11px',
    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    color: theme.colors.status.info,
    borderRadius: theme.borderRadius.sm,
    fontWeight: 600,
  },
  linkedSOPBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.xs,
    fontSize: '12px',
    color: theme.colors.primary,
    marginLeft: '30px',
    marginTop: theme.spacing.xs,
    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
    backgroundColor: 'rgba(239, 35, 60, 0.1)',
    borderRadius: theme.borderRadius.sm,
    width: 'fit-content',
  },
  commentsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.sm,
  },
  commentItem: {
    padding: theme.spacing.md,
    backgroundColor: theme.colors.bg.tertiary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
  },
  commentHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  commentAuthor: {
    fontSize: '13px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
  },
  commentDate: {
    fontSize: '12px',
    color: theme.colors.txt.tertiary,
  },
  commentText: {
    fontSize: '14px',
    color: theme.colors.txt.secondary,
    lineHeight: '1.5',
  },
};

export default JobTasksPage;
