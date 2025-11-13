import React, { useState } from 'react';
import { useTask } from '../contexts/TaskContext';
import { useAuth } from '../contexts/AuthContext';
import { useSOPs } from '../contexts/SOPContext';
import { TaskTemplate, TaskTemplateStep } from '../types';
import { theme } from '../theme';
import { useResponsive } from '../hooks/useResponsive';

const TaskLibraryPage: React.FC = () => {
  const { taskTemplates, addTaskTemplate, updateTaskTemplate, deleteTaskTemplate, createJobTaskFromTemplate } = useTask();
  const { currentUser } = useAuth();
  const { sops } = useSOPs();
  const { isMobile, isMobileOrTablet } = useResponsive();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TaskTemplate | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [showUseTemplateModal, setShowUseTemplateModal] = useState(false);
  const [selectedTemplateForUse, setSelectedTemplateForUse] = useState<TaskTemplate | null>(null);

  // Get unique departments and categories
  const departments = Array.from(new Set(taskTemplates.map(t => t.department))).sort();
  const categories = Array.from(new Set(taskTemplates.map(t => t.category)));

  // Filter templates by department and search
  const filteredTemplates = taskTemplates.filter(template => {
    const matchesSearch = searchQuery === '' ||
                         template.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         template.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDepartment = selectedDepartment === 'all' || template.department === selectedDepartment;
    return matchesSearch && matchesDepartment;
  });

  // Group templates by category
  const templatesByCategory = filteredTemplates.reduce((acc, template) => {
    if (!acc[template.category]) {
      acc[template.category] = [];
    }
    acc[template.category].push(template);
    return acc;
  }, {} as Record<string, TaskTemplate[]>);

  const handleCreateTemplate = () => {
    setEditingTemplate(null);
    setShowCreateModal(true);
  };

  const handleEditTemplate = (template: TaskTemplate) => {
    setEditingTemplate(template);
    setShowCreateModal(true);
  };

  const handleDeleteTemplate = (id: string) => {
    if (window.confirm('Are you sure you want to delete this task template?')) {
      deleteTaskTemplate(id);
    }
  };

  const handleCloseModal = () => {
    setShowCreateModal(false);
    setEditingTemplate(null);
  };

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  const expandAll = () => {
    setExpandedCategories(new Set(categories));
  };

  const collapseAll = () => {
    setExpandedCategories(new Set());
  };

  const handleUseTemplate = (template: TaskTemplate) => {
    setSelectedTemplateForUse(template);
    setShowUseTemplateModal(true);
  };

  const handleCloseUseTemplateModal = () => {
    setShowUseTemplateModal(false);
    setSelectedTemplateForUse(null);
  };

  return (
    <div style={{...styles.container, ...(isMobile ? styles.containerMobile : {})}}>
      <div style={{...styles.header, ...(isMobile ? styles.headerMobile : {})}}>
        <div>
          <h1 style={{...styles.title, ...(isMobile ? styles.titleMobile : {})}}>
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
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
            </svg>
            Task Library
          </h1>
          <p style={{...styles.subtitle, ...(isMobile ? styles.subtitleMobile : {})}}>Create and manage reusable task templates</p>
        </div>
        <button style={{...styles.createButton, ...(isMobile ? styles.createButtonMobile : {})}} onClick={handleCreateTemplate}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Create Template
        </button>
      </div>

      {/* Department Tabs */}
      <div style={{...styles.departmentTabs, ...(isMobile ? styles.departmentTabsMobile : {})}}>
        <button
          onClick={() => setSelectedDepartment('all')}
          style={{
            ...styles.departmentTab,
            ...(isMobile ? styles.departmentTabMobile : {}),
            ...(selectedDepartment === 'all' ? styles.departmentTabActive : {}),
          }}
        >
          All Departments
        </button>
        {departments.map(dept => (
          <button
            key={dept}
            onClick={() => setSelectedDepartment(dept)}
            style={{
              ...styles.departmentTab,
              ...(isMobile ? styles.departmentTabMobile : {}),
              ...(selectedDepartment === dept ? styles.departmentTabActive : {}),
            }}
          >
            {dept}
          </button>
        ))}
      </div>

      {/* Search and Controls */}
      <div style={{...styles.controls, ...(isMobile ? styles.controlsMobile : {})}}>
        <div style={{...styles.searchContainer, ...(isMobile ? styles.searchContainerMobile : {})}}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={theme.colors.txt.tertiary} strokeWidth="2" style={styles.searchIcon}>
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Search templates by title or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{...styles.searchInput, ...(isMobile ? styles.searchInputMobile : {})}}
          />
        </div>

        <div style={{...styles.expandControls, ...(isMobile ? styles.expandControlsMobile : {})}}>
          <button onClick={expandAll} style={{...styles.expandButton, ...(isMobile ? styles.expandButtonMobile : {})}}>
            Expand All
          </button>
          <button onClick={collapseAll} style={{...styles.expandButton, ...(isMobile ? styles.expandButtonMobile : {})}}>
            Collapse All
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{...styles.stats, ...(isMobile ? styles.statsMobile : {})}}>
        <div style={styles.statCard}>
          <div style={styles.statNumber}>{taskTemplates.length}</div>
          <div style={styles.statLabel}>Total Templates</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statNumber}>{categories.length}</div>
          <div style={styles.statLabel}>Categories</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statNumber}>{filteredTemplates.length}</div>
          <div style={styles.statLabel}>Showing</div>
        </div>
      </div>

      {/* Templates by Category */}
      {filteredTemplates.length === 0 ? (
        <div style={styles.emptyState}>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke={theme.colors.txt.tertiary} strokeWidth="1.5">
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
            <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
          </svg>
          <h3 style={styles.emptyTitle}>
            {searchQuery ? 'No Templates Found' : 'No Templates Created Yet'}
          </h3>
          <p style={styles.emptyText}>
            {searchQuery
              ? 'Try adjusting your search criteria.'
              : 'Create your first template to get started.'}
          </p>
          {!searchQuery && (
            <button onClick={handleCreateTemplate} style={styles.emptyButton}>
              Create First Template
            </button>
          )}
        </div>
      ) : (
        <div style={styles.categoriesContainer}>
          {Object.keys(templatesByCategory).sort().map(category => (
            <div key={category} style={styles.categorySection}>
              <button
                onClick={() => toggleCategory(category)}
                style={styles.categoryHeader}
              >
                <div style={styles.categoryHeaderLeft}>
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    style={{
                      ...styles.categoryChevron,
                      transform: expandedCategories.has(category) ? 'rotate(90deg)' : 'rotate(0deg)',
                    }}
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                  <h2 style={styles.categoryTitle}>{category}</h2>
                  <span style={styles.categoryCount}>
                    {templatesByCategory[category].length} {templatesByCategory[category].length === 1 ? 'TEMPLATE' : 'TEMPLATES'}
                  </span>
                </div>
              </button>

              {expandedCategories.has(category) && (
                <div style={{...styles.templatesGrid, ...(isMobile ? styles.templatesGridMobile : {})}}>
                  {templatesByCategory[category].map(template => (
                    <TaskTemplateCard
                      key={template.id}
                      template={template}
                      onEdit={() => handleEditTemplate(template)}
                      onDelete={() => handleDeleteTemplate(template.id)}
                      onUseTemplate={() => handleUseTemplate(template)}
                      isMobile={isMobile}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <TaskTemplateModal
          template={editingTemplate}
          onClose={handleCloseModal}
          onSave={(templateData) => {
            if (editingTemplate) {
              updateTaskTemplate(editingTemplate.id, templateData);
            } else {
              addTaskTemplate({
                ...templateData,
                createdBy: currentUser?.id || 'unknown',
              });
            }
            handleCloseModal();
          }}
          availableSOPs={sops}
        />
      )}

      {/* Use Template Modal */}
      {showUseTemplateModal && selectedTemplateForUse && (
        <UseTemplateModal
          template={selectedTemplateForUse}
          onClose={handleCloseUseTemplateModal}
          onCreateTask={createJobTaskFromTemplate}
          currentUserId={currentUser?.id || ''}
        />
      )}
    </div>
  );
};

// Task Template Card Component
interface TaskTemplateCardProps {
  template: TaskTemplate;
  onEdit: () => void;
  onDelete: () => void;
  onUseTemplate: () => void;
  isMobile: boolean;
}

const TaskTemplateCard: React.FC<TaskTemplateCardProps> = ({ template, onEdit, onDelete, onUseTemplate, isMobile }) => {
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return theme.colors.status.error;
      case 'high': return theme.colors.status.warning;
      case 'medium': return theme.colors.status.info;
      default: return theme.colors.txt.tertiary;
    }
  };

  return (
    <div style={{...styles.card, ...(isMobile ? styles.cardMobile : {})}}>
      <div style={{...styles.cardHeader, ...(isMobile ? styles.cardHeaderMobile : {})}}>
        <div style={{...styles.cardBadges, ...(isMobile ? styles.cardBadgesMobile : {})}}>
          <span style={{...styles.badge, backgroundColor: 'rgba(239, 35, 60, 0.15)', color: theme.colors.primary}}>
            {template.department}
          </span>
          <span style={{...styles.badge, backgroundColor: 'rgba(33, 150, 243, 0.15)', color: theme.colors.status.info}}>
            {template.category}
          </span>
        </div>
        <span style={{...styles.priorityBadge, color: getPriorityColor(template.priority)}}>
          {template.priority.toUpperCase()}
        </span>
      </div>

      <h3 style={styles.cardTitle}>{template.title}</h3>
      <p style={styles.cardDescription}>{template.description}</p>

      <div style={styles.cardStats}>
        <div style={styles.stat}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span>{template.estimatedDuration} min</span>
        </div>
        <div style={styles.stat}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 3h18v18H3z" />
            <path d="m9 11 3 3L22 4" />
          </svg>
          <span>{template.steps.length} steps</span>
        </div>
        {template.sopIds.length > 0 && (
          <div style={styles.stat}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <span>{template.sopIds.length} SOPs</span>
          </div>
        )}
      </div>

      {template.isRecurring && (
        <div style={styles.recurringBadge}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
          </svg>
          Recurring
        </div>
      )}

      <div style={{...styles.cardActions, ...(isMobile ? styles.cardActionsMobile : {})}}>
        <button style={{...styles.actionButtonUse, ...(isMobile ? styles.actionButtonUseMobile : {})}} onClick={onUseTemplate}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
          Use Template
        </button>
        <button style={{...styles.actionButtonEdit, ...(isMobile ? styles.actionButtonEditMobile : {})}} onClick={onEdit}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          Edit
        </button>
        <button style={{...styles.actionButtonDelete, ...(isMobile ? styles.actionButtonDeleteMobile : {})}} onClick={onDelete}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
          Delete
        </button>
      </div>
    </div>
  );
};

// Task Template Modal Component
interface TaskTemplateModalProps {
  template: TaskTemplate | null;
  onClose: () => void;
  onSave: (template: Omit<TaskTemplate, 'id' | 'createdAt' | 'createdBy'>) => void;
  availableSOPs: any[];
}

const TaskTemplateModal: React.FC<TaskTemplateModalProps> = ({ template, onClose, onSave, availableSOPs }) => {
  const [formData, setFormData] = useState({
    title: template?.title || '',
    description: template?.description || '',
    category: template?.category || '',
    department: template?.department || 'Admin',
    estimatedDuration: template?.estimatedDuration || 30,
    priority: template?.priority || 'medium',
    sopIds: template?.sopIds || [],
    steps: template?.steps || [],
    isRecurring: template?.isRecurring || false,
    recurrencePattern: template?.recurrencePattern || {
      frequency: 'daily' as const,
      daysOfWeek: [1, 2, 3, 4, 5],
    },
  });

  const [newStep, setNewStep] = useState({
    title: '',
    description: '',
    requiresPhoto: false,
  });

  const handleAddStep = () => {
    if (newStep.title.trim()) {
      const step: TaskTemplateStep = {
        id: `step_${Date.now()}`,
        order: formData.steps.length + 1,
        title: newStep.title,
        description: newStep.description,
        requiresPhoto: newStep.requiresPhoto,
      };
      setFormData({ ...formData, steps: [...formData.steps, step] });
      setNewStep({ title: '', description: '', requiresPhoto: false });
    }
  };

  const handleRemoveStep = (stepId: string) => {
    const updatedSteps = formData.steps
      .filter(s => s.id !== stepId)
      .map((s, idx) => ({ ...s, order: idx + 1 }));
    setFormData({ ...formData, steps: updatedSteps });
  };

  const handleMoveStep = (stepId: string, direction: 'up' | 'down') => {
    const index = formData.steps.findIndex(s => s.id === stepId);
    if (
      (direction === 'up' && index > 0) ||
      (direction === 'down' && index < formData.steps.length - 1)
    ) {
      const newSteps = [...formData.steps];
      const swapIndex = direction === 'up' ? index - 1 : index + 1;
      [newSteps[index], newSteps[swapIndex]] = [newSteps[swapIndex], newSteps[index]];
      const reorderedSteps = newSteps.map((s, idx) => ({ ...s, order: idx + 1 }));
      setFormData({ ...formData, steps: reorderedSteps });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.steps.length === 0) {
      alert('Please add at least one step to the template');
      return;
    }
    onSave(formData);
  };

  const handleSOPToggle = (sopId: string) => {
    const newSOPIds = formData.sopIds.includes(sopId)
      ? formData.sopIds.filter(id => id !== sopId)
      : [...formData.sopIds, sopId];
    setFormData({ ...formData, sopIds: newSOPIds });
  };

  const handleDayToggle = (day: number) => {
    const days = formData.recurrencePattern.daysOfWeek || [];
    const newDays = days.includes(day)
      ? days.filter(d => d !== day)
      : [...days, day].sort();
    setFormData({
      ...formData,
      recurrencePattern: { ...formData.recurrencePattern, daysOfWeek: newDays },
    });
  };

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>
            {template ? 'Edit Task Template' : 'Create Task Template'}
          </h2>
          <button style={styles.closeButton} onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} style={styles.modalForm}>
          {/* Basic Information Section */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Basic Information</h3>

            <div style={styles.formGroup}>
              <label style={styles.label}>Template Title *</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g., Morning Opening Duties"
                required
                style={styles.input}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Description *</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe what this task template is for..."
                required
                rows={3}
                style={{...styles.input, ...styles.textarea}}
              />
            </div>

            <div style={styles.formRow}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Category *</label>
                <input
                  type="text"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  placeholder="e.g., Opening Duties, Cleaning"
                  required
                  style={styles.input}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Department *</label>
                <select
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  required
                  style={styles.input}
                >
                  <option value="Admin">Admin</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Operations">Operations</option>
                  <option value="Customer Service">Customer Service</option>
                </select>
              </div>
            </div>

            <div style={styles.formRow}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Estimated Duration (minutes) *</label>
                <input
                  type="number"
                  value={formData.estimatedDuration}
                  onChange={(e) => setFormData({ ...formData, estimatedDuration: parseInt(e.target.value) })}
                  min="1"
                  required
                  style={styles.input}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Priority *</label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                  required
                  style={styles.input}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>
          </div>

          {/* Recurrence Section */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Recurrence Settings</h3>

            <div style={styles.formGroup}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={formData.isRecurring}
                  onChange={(e) => setFormData({ ...formData, isRecurring: e.target.checked })}
                  style={styles.checkbox}
                />
                <span>This is a Recurring Task</span>
              </label>
            </div>

            {formData.isRecurring && (
              <div style={styles.recurrenceInner}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Frequency</label>
                <select
                  value={formData.recurrencePattern.frequency}
                  onChange={(e) => setFormData({
                    ...formData,
                    recurrencePattern: { ...formData.recurrencePattern, frequency: e.target.value as any }
                  })}
                  style={styles.input}
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>

              {(formData.recurrencePattern.frequency === 'daily' || formData.recurrencePattern.frequency === 'weekly') && (
                <div style={styles.formGroup}>
                  <label style={styles.label}>Days of Week</label>
                  <div style={styles.daysContainer}>
                    {dayNames.map((day, index) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => handleDayToggle(index)}
                        style={{
                          ...styles.dayButton,
                          ...(formData.recurrencePattern.daysOfWeek?.includes(index) ? styles.dayButtonActive : {})
                        }}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            )}
          </div>

          {/* Attached SOPs Section */}
          {availableSOPs.length > 0 && (
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Attach SOPs (Optional)</h3>
              <div style={styles.sopsList}>
                {availableSOPs.map(sop => (
                  <label key={sop.id} style={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={formData.sopIds.includes(sop.id)}
                      onChange={() => handleSOPToggle(sop.id)}
                      style={styles.checkbox}
                    />
                    {sop.title}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Steps Section */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Task Steps</h3>

            {formData.steps.map((step, index) => (
              <div key={step.id} style={styles.stepItem}>
                <div style={styles.stepNumber}>{index + 1}</div>
                <div style={styles.stepContent}>
                  <div style={styles.stepTitle}>{step.title}</div>
                  {step.description && <div style={styles.stepDescription}>{step.description}</div>}
                  {step.requiresPhoto && (
                    <span style={styles.photoRequired}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                      </svg>
                      Photo Required
                    </span>
                  )}
                </div>
                <div style={styles.stepActions}>
                  <button
                    type="button"
                    onClick={() => handleMoveStep(step.id, 'up')}
                    disabled={index === 0}
                    style={styles.stepActionButton}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMoveStep(step.id, 'down')}
                    disabled={index === formData.steps.length - 1}
                    style={styles.stepActionButton}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveStep(step.id)}
                    style={styles.stepActionButtonDelete}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}

            {/* Add New Step */}
            <div style={styles.addStepSection}>
              <input
                type="text"
                value={newStep.title}
                onChange={(e) => setNewStep({ ...newStep, title: e.target.value })}
                placeholder="Step title..."
                style={styles.stepInput}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddStep())}
              />
              <input
                type="text"
                value={newStep.description}
                onChange={(e) => setNewStep({ ...newStep, description: e.target.value })}
                placeholder="Step description (optional)..."
                style={styles.stepInput}
              />
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={newStep.requiresPhoto}
                  onChange={(e) => setNewStep({ ...newStep, requiresPhoto: e.target.checked })}
                  style={styles.checkbox}
                />
                Requires Photo
              </label>
              <button type="button" onClick={handleAddStep} style={styles.addStepButton}>
                Add Step
              </button>
            </div>
          </div>

          {/* Form Actions */}
          <div style={styles.modalActions}>
            <button type="button" onClick={onClose} style={styles.cancelButton}>
              Cancel
            </button>
            <button type="submit" style={styles.saveButton}>
              {template ? 'Update Template' : 'Create Template'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface UseTemplateModalProps {
  template: TaskTemplate;
  onClose: () => void;
  onCreateTask: (templateId: string, assignedTo: string[], scheduledDate: string, assignedBy: string) => void;
  currentUserId: string;
}

const UseTemplateModal: React.FC<UseTemplateModalProps> = ({
  template,
  onClose,
  onCreateTask,
  currentUserId
}) => {
  const { users } = useAuth();
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [scheduledDate, setScheduledDate] = useState(new Date().toISOString().split('T')[0]);

  const teamMembers = users.filter(u => u.role === 'team' && u.isActive);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedUsers.length === 0) {
      alert('Please select at least one team member');
      return;
    }
    onCreateTask(template.id, selectedUsers, scheduledDate, currentUserId);
    onClose();
  };

  const toggleUser = (userId: string) => {
    setSelectedUsers(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Create Task from Template</h2>
          <button style={styles.modalCloseButton} onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} style={styles.modalForm}>
          <div style={styles.templateDetailsSection}>
            <h3 style={styles.templateTitle}>{template.title}</h3>
            <p style={styles.templateDescription}>{template.description}</p>

            <div style={styles.templateMetaGrid}>
              <div style={styles.templateMetaItem}>
                <span style={styles.templateMetaLabel}>Department:</span>
                <span style={styles.templateMetaValue}>{template.department}</span>
              </div>
              <div style={styles.templateMetaItem}>
                <span style={styles.templateMetaLabel}>Category:</span>
                <span style={styles.templateMetaValue}>{template.category}</span>
              </div>
              <div style={styles.templateMetaItem}>
                <span style={styles.templateMetaLabel}>Duration:</span>
                <span style={styles.templateMetaValue}>{template.estimatedDuration} min</span>
              </div>
              <div style={styles.templateMetaItem}>
                <span style={styles.templateMetaLabel}>Priority:</span>
                <span style={{
                  ...styles.templateMetaValue,
                  color: template.priority === 'urgent' ? theme.colors.status.error :
                         template.priority === 'high' ? theme.colors.status.warning :
                         template.priority === 'medium' ? theme.colors.status.info :
                         theme.colors.status.success
                }}>
                  {template.priority.toUpperCase()}
                </span>
              </div>
            </div>

            <div style={styles.templateStepsSection}>
              <h4 style={styles.templateStepsTitle}>Steps ({template.steps.length})</h4>
              <div style={styles.templateStepsList}>
                {template.steps.map((step, index) => (
                  <div key={step.id} style={styles.templateStepItem}>
                    <span style={styles.templateStepNumber}>{index + 1}.</span>
                    <span style={styles.templateStepTitle}>{step.title}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Scheduled Date</label>
            <input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              style={styles.formInput}
              required
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.formLabel}>
              Assign to Team Members ({selectedUsers.length} selected)
            </label>
            <div style={styles.userSelectionList}>
              {teamMembers.map(user => (
                <label key={user.id} style={styles.userCheckboxLabel}>
                  <input
                    type="checkbox"
                    checked={selectedUsers.includes(user.id)}
                    onChange={() => toggleUser(user.id)}
                    style={styles.userCheckbox}
                  />
                  <div style={styles.userInfo}>
                    <span style={styles.userName}>{user.firstName} {user.lastName}</span>
                    <span style={styles.userDepartment}>{user.department}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div style={styles.modalActions}>
            <button type="button" style={styles.modalCancelButton} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" style={styles.modalSubmitButton}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
              Create Task
            </button>
          </div>
        </form>
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
  departmentTabs: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    padding: '0 0 24px 0',
    borderBottom: `3px solid ${theme.colors.primary}`,
    marginBottom: '24px',
  },
  departmentTab: {
    padding: '16px 32px',
    backgroundColor: 'transparent',
    color: theme.colors.textPrimary,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.lg,
    fontSize: '16px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'all 0.2s',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    whiteSpace: 'nowrap',
  },
  departmentTabActive: {
    backgroundColor: theme.colors.primary,
    color: '#FFFFFF',
    border: `2px solid ${theme.colors.primary}`,
    transform: 'translateY(-2px)',
    boxShadow: '0 4px 12px rgba(239, 35, 60, 0.4)',
  },
  controls: {
    display: 'flex',
    gap: '16px',
    marginBottom: '24px',
    flexWrap: 'wrap',
  },
  searchContainer: {
    position: 'relative',
    flex: 1,
    minWidth: '300px',
  },
  searchIcon: {
    position: 'absolute',
    left: '16px',
    top: '50%',
    transform: 'translateY(-50%)',
  },
  searchInput: {
    width: '100%',
    padding: '14px 16px 14px 48px',
    fontSize: '15px',
    backgroundColor: theme.colors.cardBackground,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.textPrimary,
    outline: 'none',
  },
  expandControls: {
    display: 'flex',
    gap: '8px',
  },
  expandButton: {
    padding: '14px 20px',
    fontSize: '14px',
    fontWeight: '600',
    backgroundColor: 'transparent',
    color: theme.colors.textSecondary,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
  },
  stats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '20px',
    marginBottom: '32px',
  },
  statCard: {
    backgroundColor: theme.colors.cardBackground,
    padding: '24px',
    borderRadius: theme.borderRadius.lg,
    border: `2px solid ${theme.colors.border}`,
    textAlign: 'center',
  },
  statNumber: {
    fontSize: '32px',
    fontWeight: '800',
    color: theme.colors.primary,
    marginBottom: '8px',
  },
  statLabel: {
    fontSize: '14px',
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    fontWeight: '600',
  },
  categoriesContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  categorySection: {
    backgroundColor: theme.colors.cardBackground,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
  },
  categoryHeader: {
    width: '100%',
    padding: '20px 24px',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    transition: 'background-color 0.2s',
  },
  categoryHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  categoryChevron: {
    transition: 'transform 0.2s',
    color: theme.colors.primary,
  },
  categoryTitle: {
    fontSize: '22px',
    fontWeight: '700',
    color: theme.colors.textPrimary,
    margin: 0,
  },
  categoryCount: {
    fontSize: '14px',
    fontWeight: '600',
    color: theme.colors.textMuted,
    backgroundColor: 'rgba(239, 35, 60, 0.1)',
    padding: '4px 12px',
    borderRadius: theme.borderRadius.full,
  },
  templatesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
    gap: '24px',
    padding: '0 24px 24px 24px',
  },
  emptyState: {
    textAlign: 'center',
    padding: '80px 20px',
  },
  emptyTitle: {
    fontSize: '24px',
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: '12px',
  },
  emptyText: {
    fontSize: '16px',
    color: theme.colors.textSecondary,
    marginBottom: '24px',
    maxWidth: '500px',
    margin: '0 auto 24px',
  },
  emptyButton: {
    padding: '14px 28px',
    backgroundColor: theme.colors.primary,
    color: theme.colors.background,
    border: 'none',
    borderRadius: theme.borderRadius.md,
    fontSize: '15px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  card: {
    backgroundColor: theme.colors.background,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.lg,
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    transition: 'all 0.2s',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.md,
  },
  cardBadges: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  badge: {
    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
    borderRadius: theme.borderRadius.sm,
    fontSize: '12px',
    fontWeight: 600,
  },
  priorityBadge: {
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.5px',
  },
  cardTitle: {
    fontSize: '18px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
    marginBottom: theme.spacing.sm,
  },
  cardDescription: {
    fontSize: '14px',
    color: theme.colors.txt.secondary,
    marginBottom: theme.spacing.lg,
    lineHeight: '1.5',
  },
  cardStats: {
    display: 'flex',
    gap: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  stat: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.xs,
    fontSize: '13px',
    color: theme.colors.txt.tertiary,
  },
  recurringBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing.xs,
    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
    backgroundColor: 'rgba(33, 150, 243, 0.15)',
    color: theme.colors.status.info,
    borderRadius: theme.borderRadius.sm,
    fontSize: '12px',
    fontWeight: 600,
    marginBottom: theme.spacing.md,
  },
  cardActions: {
    display: 'flex',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    borderTop: `1px solid ${theme.colors.bdr.primary}`,
    flexWrap: 'wrap',
  },
  actionButtonUse: {
    flex: '1 1 100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    padding: `${theme.spacing.md} ${theme.spacing.sm}`,
    backgroundColor: theme.colors.primary,
    border: 'none',
    borderRadius: theme.borderRadius.md,
    color: '#FFFFFF',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  actionButtonEdit: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.bg.tertiary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.txt.secondary,
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  actionButtonDelete: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    padding: theme.spacing.sm,
    backgroundColor: 'rgba(239, 35, 60, 0.1)',
    border: `1px solid rgba(239, 35, 60, 0.3)`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.status.error,
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s',
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
    maxWidth: '800px',
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
  section: {
    backgroundColor: theme.colors.bg.tertiary,
    border: `2px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.lg,
    padding: '24px',
    marginBottom: '20px',
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: '700',
    color: theme.colors.txt.primary,
    marginBottom: '20px',
    margin: '0 0 20px 0',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.sm,
    marginBottom: '16px',
  },
  label: {
    fontSize: '14px',
    fontWeight: 600,
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
  textarea: {
    resize: 'vertical',
    fontFamily: 'inherit',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.sm,
    fontSize: '14px',
    color: theme.colors.txt.secondary,
    cursor: 'pointer',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    cursor: 'pointer',
  },
  recurrenceSection: {
    backgroundColor: theme.colors.bg.tertiary,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
    border: `1px solid ${theme.colors.bdr.primary}`,
  },
  recurrenceInner: {
    marginTop: '16px',
  },
  daysContainer: {
    display: 'flex',
    gap: theme.spacing.xs,
  },
  dayButton: {
    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
    backgroundColor: theme.colors.bg.secondary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.txt.tertiary,
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  dayButtonActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
    color: theme.colors.txt.primary,
  },
  sopsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.sm,
    maxHeight: '150px',
    overflowY: 'auto',
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.md,
    border: `1px solid ${theme.colors.bdr.primary}`,
  },
  stepsSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.md,
    marginBottom: 0,
  },
  stepItem: {
    display: 'flex',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.bg.tertiary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
  },
  stepNumber: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    backgroundColor: theme.colors.primary,
    color: theme.colors.txt.primary,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 600,
    fontSize: '14px',
    flexShrink: 0,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: '15px',
    fontWeight: 500,
    color: theme.colors.txt.primary,
    marginBottom: theme.spacing.xs,
  },
  stepDescription: {
    fontSize: '13px',
    color: theme.colors.txt.secondary,
    marginBottom: theme.spacing.xs,
  },
  photoRequired: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing.xs,
    fontSize: '12px',
    color: theme.colors.status.info,
    fontWeight: 500,
  },
  stepActions: {
    display: 'flex',
    gap: theme.spacing.xs,
    alignItems: 'flex-start',
  },
  stepActionButton: {
    width: '28px',
    height: '28px',
    backgroundColor: theme.colors.bg.secondary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.sm,
    color: theme.colors.txt.secondary,
    fontSize: '16px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepActionButtonDelete: {
    width: '28px',
    height: '28px',
    backgroundColor: 'rgba(239, 35, 60, 0.1)',
    border: `1px solid rgba(239, 35, 60, 0.3)`,
    borderRadius: theme.borderRadius.sm,
    color: theme.colors.status.error,
    fontSize: '20px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addStepSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.bg.tertiary,
    border: `1px dashed ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
  },
  stepInput: {
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.bg.secondary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.txt.primary,
    fontSize: '14px',
    outline: 'none',
  },
  addStepButton: {
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.primary,
    color: theme.colors.txt.primary,
    border: 'none',
    borderRadius: theme.borderRadius.md,
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
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
  modalCloseButton: {
    backgroundColor: 'transparent',
    border: 'none',
    color: theme.colors.txt.tertiary,
    cursor: 'pointer',
    padding: theme.spacing.xs,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'color 0.2s',
  },
  modalContent: {
    backgroundColor: theme.colors.bg.secondary,
    borderRadius: theme.borderRadius.lg,
    width: '100%',
    maxWidth: '700px',
    maxHeight: '90vh',
    overflow: 'auto',
    border: `2px solid ${theme.colors.bdr.primary}`,
  },
  templateDetailsSection: {
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
  templateTitle: {
    fontSize: '20px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
    marginBottom: theme.spacing.sm,
  },
  templateDescription: {
    fontSize: '14px',
    color: theme.colors.txt.secondary,
    marginBottom: theme.spacing.lg,
    lineHeight: '1.6',
  },
  templateMetaGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  templateMetaItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.xs,
  },
  templateMetaLabel: {
    fontSize: '12px',
    color: theme.colors.txt.tertiary,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  templateMetaValue: {
    fontSize: '14px',
    color: theme.colors.txt.primary,
    fontWeight: 500,
  },
  templateStepsSection: {
    paddingTop: theme.spacing.lg,
    borderTop: `1px solid ${theme.colors.bdr.primary}`,
  },
  templateStepsTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
    marginBottom: theme.spacing.md,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  templateStepsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.sm,
    maxHeight: '200px',
    overflowY: 'auto',
    paddingRight: theme.spacing.sm,
  },
  templateStepItem: {
    display: 'flex',
    gap: theme.spacing.sm,
    fontSize: '13px',
    color: theme.colors.txt.secondary,
  },
  templateStepNumber: {
    fontWeight: 600,
    color: theme.colors.primary,
    minWidth: '24px',
  },
  templateStepTitle: {
    flex: 1,
  },
  formInput: {
    padding: theme.spacing.md,
    backgroundColor: theme.colors.bg.tertiary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.txt.primary,
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  userSelectionList: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.sm,
    maxHeight: '250px',
    overflowY: 'auto',
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.md,
    border: `1px solid ${theme.colors.bdr.primary}`,
  },
  userCheckboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.bg.secondary,
    borderRadius: theme.borderRadius.sm,
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  userCheckbox: {
    width: '18px',
    height: '18px',
    cursor: 'pointer',
    accentColor: theme.colors.primary,
  },
  userInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    flex: 1,
  },
  userName: {
    fontSize: '14px',
    color: theme.colors.txt.primary,
    fontWeight: 500,
  },
  userDepartment: {
    fontSize: '12px',
    color: theme.colors.txt.tertiary,
  },
  modalCancelButton: {
    padding: `${theme.spacing.md} ${theme.spacing.xl}`,
    backgroundColor: theme.colors.bg.tertiary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.txt.secondary,
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  modalSubmitButton: {
    padding: `${theme.spacing.md} ${theme.spacing.xl}`,
    backgroundColor: theme.colors.primary,
    color: '#FFFFFF',
    border: 'none',
    borderRadius: theme.borderRadius.md,
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.sm,
    transition: 'all 0.2s',
  },
  // Mobile-specific styles
  containerMobile: {
    padding: '16px',
  },
  headerMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: '16px',
    marginBottom: '24px',
  },
  titleMobile: {
    fontSize: '24px',
    marginBottom: '4px',
  },
  subtitleMobile: {
    fontSize: '14px',
  },
  createButtonMobile: {
    width: '100%',
    justifyContent: 'center',
    padding: '16px 24px',
    minHeight: '44px',
  },
  departmentTabsMobile: {
    gap: '8px',
    padding: '0 0 16px 0',
    marginBottom: '16px',
  },
  departmentTabMobile: {
    padding: '12px 20px',
    fontSize: '14px',
    minHeight: '44px',
    flex: '1 1 calc(50% - 4px)',
    textAlign: 'center',
  },
  controlsMobile: {
    flexDirection: 'column',
    gap: '12px',
    marginBottom: '16px',
  },
  searchContainerMobile: {
    minWidth: 'auto',
    width: '100%',
  },
  searchInputMobile: {
    padding: '12px 16px 12px 48px',
    fontSize: '16px',
  },
  expandControlsMobile: {
    width: '100%',
    justifyContent: 'stretch',
  },
  expandButtonMobile: {
    flex: 1,
    minHeight: '44px',
    padding: '12px 16px',
  },
  statsMobile: {
    gridTemplateColumns: '1fr',
    gap: '12px',
    marginBottom: '24px',
  },
  templatesGridMobile: {
    gridTemplateColumns: '1fr',
    gap: '16px',
    padding: '0 16px 16px 16px',
  },
  cardMobile: {
    padding: '16px',
  },
  cardHeaderMobile: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '8px',
  },
  cardBadgesMobile: {
    width: '100%',
    justifyContent: 'flex-start',
  },
  cardActionsMobile: {
    flexDirection: 'column',
    gap: '8px',
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.md,
  },
  actionButtonUseMobile: {
    width: '100%',
    flex: 'none',
    minHeight: '44px',
    padding: '12px 16px',
  },
  actionButtonEditMobile: {
    width: '100%',
    flex: 'none',
    minHeight: '44px',
    padding: '12px 16px',
  },
  actionButtonDeleteMobile: {
    width: '100%',
    flex: 'none',
    minHeight: '44px',
    padding: '12px 16px',
  },
};

export default TaskLibraryPage;
