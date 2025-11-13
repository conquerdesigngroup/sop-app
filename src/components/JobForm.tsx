import React, { useState, useEffect } from 'react';
import { Task, TaskPriority, TaskStep } from '../types';
import { useTask } from '../contexts/TaskContext';
import { useAuth } from '../contexts/AuthContext';
import { useJob } from '../contexts/JobContext';

interface JobFormProps {
  onClose: () => void;
}

const JobForm: React.FC<JobFormProps> = ({ onClose }) => {
  const { currentUser } = useAuth();
  const { jobTasks, taskTemplates } = useTask();
  const { addJob } = useJob();

  // Job basic info
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignedTo, setAssignedTo] = useState<string[]>([]);
  const [department, setDepartment] = useState('Admin');
  const [scheduledDate, setScheduledDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');

  // Tasks in this job
  const [selectedTasks, setSelectedTasks] = useState<Task[]>([]);
  const [showTaskSelector, setShowTaskSelector] = useState(false);
  const [showCustomTaskForm, setShowCustomTaskForm] = useState(false);

  // Custom task form
  const [customTaskTitle, setCustomTaskTitle] = useState('');
  const [customTaskDescription, setCustomTaskDescription] = useState('');
  const [customTaskDuration, setCustomTaskDuration] = useState(30);
  const [customTaskPriority, setCustomTaskPriority] = useState<TaskPriority>('medium');
  const [customTaskSteps, setCustomTaskSteps] = useState<TaskStep[]>([]);

  // Task template selector filters
  const [templateSearchQuery, setTemplateSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<string>>(new Set());

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleAddTaskFromLibrary = (taskId: string) => {
    const task = jobTasks.find(t => t.id === taskId);
    if (task && !selectedTasks.find(t => t.id === task.id)) {
      // Convert JobTask to Task (remove assignment fields)
      const newTask: Task = {
        id: task.id,
        templateId: task.templateId,
        title: task.title,
        description: task.description,
        department: task.department,
        category: task.category,
        estimatedDuration: task.estimatedDuration,
        status: 'pending',
        priority: task.priority,
        steps: task.steps,
        completedSteps: [],
        progressPercentage: 0,
        sopIds: task.sopIds,
        comments: [],
        createdAt: new Date().toISOString(),
      };
      setSelectedTasks([...selectedTasks, newTask]);
    }
  };

  const handleAddTaskFromTemplate = (templateId: string) => {
    const template = taskTemplates.find(t => t.id === templateId);
    if (template) {
      const newTask: Task = {
        id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        templateId: template.id,
        title: template.title,
        description: template.description,
        department: template.department,
        category: template.category,
        estimatedDuration: template.estimatedDuration,
        status: 'pending',
        priority: template.priority,
        steps: template.steps.map(step => ({ ...step, isCompleted: false })),
        completedSteps: [],
        progressPercentage: 0,
        sopIds: template.sopIds,
        comments: [],
        createdAt: new Date().toISOString(),
      };
      setSelectedTasks([...selectedTasks, newTask]);
    }
  };

  const handleCreateCustomTask = () => {
    if (!customTaskTitle.trim()) return;

    const newTask: Task = {
      id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: customTaskTitle,
      description: customTaskDescription,
      department,
      category: 'Custom',
      estimatedDuration: customTaskDuration,
      status: 'pending',
      priority: customTaskPriority,
      steps: customTaskSteps,
      completedSteps: [],
      progressPercentage: 0,
      sopIds: [],
      comments: [],
      createdAt: new Date().toISOString(),
    };

    setSelectedTasks([...selectedTasks, newTask]);

    // Reset custom task form
    setCustomTaskTitle('');
    setCustomTaskDescription('');
    setCustomTaskDuration(30);
    setCustomTaskPriority('medium');
    setCustomTaskSteps([]);
    setShowCustomTaskForm(false);
  };

  const handleRemoveTask = (taskId: string) => {
    setSelectedTasks(selectedTasks.filter(t => t.id !== taskId));
  };

  const handleMoveTaskUp = (index: number) => {
    if (index === 0) return;
    const newTasks = [...selectedTasks];
    [newTasks[index - 1], newTasks[index]] = [newTasks[index], newTasks[index - 1]];
    setSelectedTasks(newTasks);
  };

  const handleMoveTaskDown = (index: number) => {
    if (index === selectedTasks.length - 1) return;
    const newTasks = [...selectedTasks];
    [newTasks[index], newTasks[index + 1]] = [newTasks[index + 1], newTasks[index]];
    setSelectedTasks(newTasks);
  };

  // Filter task templates
  const filteredTemplates = taskTemplates.filter(template => {
    const matchesSearch = templateSearchQuery === '' ||
                         template.title.toLowerCase().includes(templateSearchQuery.toLowerCase()) ||
                         template.description.toLowerCase().includes(templateSearchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || template.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Group templates by category
  const templatesByCategory = filteredTemplates.reduce((acc, template) => {
    if (!acc[template.category]) {
      acc[template.category] = [];
    }
    acc[template.category].push(template);
    return acc;
  }, {} as Record<string, typeof taskTemplates>);

  // Get unique categories
  const categories = Array.from(new Set(taskTemplates.map(t => t.category))).sort();

  // Handle template checkbox toggle
  const handleToggleTemplate = (templateId: string) => {
    const newSelected = new Set(selectedTemplateIds);
    if (newSelected.has(templateId)) {
      newSelected.delete(templateId);
    } else {
      newSelected.add(templateId);
    }
    setSelectedTemplateIds(newSelected);
  };

  // Add selected templates to the job
  const handleAddSelectedTasks = () => {
    const newTasks: Task[] = [];
    selectedTemplateIds.forEach(templateId => {
      const template = taskTemplates.find(t => t.id === templateId);
      if (template && !selectedTasks.find(t => t.templateId === template.id)) {
        const newTask: Task = {
          id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          templateId: template.id,
          title: template.title,
          description: template.description,
          department: template.department,
          category: template.category,
          estimatedDuration: template.estimatedDuration,
          status: 'pending',
          priority: template.priority,
          steps: template.steps.map(step => ({ ...step, isCompleted: false })),
          completedSteps: [],
          progressPercentage: 0,
          sopIds: template.sopIds,
          comments: [],
          createdAt: new Date().toISOString(),
        };
        newTasks.push(newTask);
      }
    });
    setSelectedTasks([...selectedTasks, ...newTasks]);
    setSelectedTemplateIds(new Set());
    setShowTaskSelector(false);
    setTemplateSearchQuery('');
    setSelectedCategory('all');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim() || !scheduledDate || selectedTemplateIds.size === 0) {
      alert('Please fill in all required fields and select at least one task');
      return;
    }

    // Convert selected template IDs to tasks
    const tasksForJob: Task[] = [];
    selectedTemplateIds.forEach(templateId => {
      const template = taskTemplates.find(t => t.id === templateId);
      if (template) {
        const newTask: Task = {
          id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          templateId: template.id,
          title: template.title,
          description: template.description,
          department: template.department,
          category: template.category,
          estimatedDuration: template.estimatedDuration,
          status: 'pending',
          priority: template.priority,
          steps: template.steps.map(step => ({ ...step, isCompleted: false })),
          completedSteps: [],
          progressPercentage: 0,
          sopIds: template.sopIds,
          comments: [],
          createdAt: new Date().toISOString(),
        };
        tasksForJob.push(newTask);
      }
    });

    try {
      await addJob({
        title,
        description,
        assignedTo,
        assignedBy: currentUser?.id || 'admin',
        department,
        scheduledDate,
        dueTime: dueTime || undefined,
        status: 'pending',
        priority,
        tasks: tasksForJob,
        comments: [],
      });

      onClose();
    } catch (error) {
      console.error('Error creating job:', error);
      alert('Failed to create job');
    }
  };

  const styles = {
    overlay: {
      position: 'fixed' as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000,
      padding: isMobile ? '10px' : '20px',
    },
    modal: {
      backgroundColor: '#1a1a1a',
      borderRadius: '12px',
      maxWidth: isMobile ? '100%' : '800px',
      width: '100%',
      maxHeight: isMobile ? '95vh' : '90vh',
      overflow: 'auto',
      position: 'relative' as const,
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '20px 24px',
      borderBottom: '1px solid #2a2a2a',
    },
    title: {
      fontSize: '20px',
      fontWeight: '600' as const,
      color: '#ffffff',
      margin: 0,
    },
    closeButton: {
      background: 'none',
      border: 'none',
      color: '#888',
      fontSize: '28px',
      cursor: 'pointer',
      padding: '0',
      width: '32px',
      height: '32px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
    form: {
      padding: '24px',
    },
    section: {
      marginBottom: '32px',
    },
    sectionTitle: {
      fontSize: '14px',
      fontWeight: '600' as const,
      color: '#888',
      marginBottom: '16px',
      textTransform: 'uppercase' as const,
      letterSpacing: '0.5px',
    },
    label: {
      display: 'block',
      marginBottom: '8px',
      color: '#ffffff',
      fontSize: '14px',
      fontWeight: '500' as const,
    },
    input: {
      width: '100%',
      padding: '10px 12px',
      backgroundColor: '#0f0f0f',
      border: '1px solid #2a2a2a',
      borderRadius: '6px',
      color: '#ffffff',
      fontSize: '14px',
      boxSizing: 'border-box' as const,
      transition: 'border-color 0.2s',
    },
    textarea: {
      width: '100%',
      minHeight: '100px',
      padding: '10px 12px',
      backgroundColor: '#0f0f0f',
      border: '1px solid #2a2a2a',
      borderRadius: '6px',
      color: '#ffffff',
      fontSize: '14px',
      fontFamily: 'inherit',
      resize: 'vertical' as const,
      boxSizing: 'border-box' as const,
      transition: 'border-color 0.2s',
    },
    select: {
      width: '100%',
      padding: '10px 12px',
      backgroundColor: '#0f0f0f',
      border: '1px solid #2a2a2a',
      borderRadius: '6px',
      color: '#ffffff',
      fontSize: '14px',
      boxSizing: 'border-box' as const,
      transition: 'border-color 0.2s',
    },
    taskList: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '8px',
      marginTop: '12px',
    },
    taskItem: {
      backgroundColor: '#2a2a2a',
      border: '1px solid #444',
      borderRadius: '8px',
      padding: '12px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    taskInfo: {
      flex: 1,
    },
    taskTitle: {
      color: '#ffffff',
      fontSize: '14px',
      fontWeight: '500' as const,
      marginBottom: '4px',
    },
    taskMeta: {
      color: '#888',
      fontSize: '12px',
    },
    taskActions: {
      display: 'flex',
      gap: '8px',
      marginLeft: '12px',
    },
    iconButton: {
      background: 'none',
      border: 'none',
      color: '#888',
      cursor: 'pointer',
      fontSize: '16px',
      padding: '4px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
    addButton: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '10px 16px',
      backgroundColor: '#2a2a2a',
      border: '1px solid #444',
      borderRadius: '8px',
      color: '#ffffff',
      cursor: 'pointer',
      fontSize: '14px',
      width: '100%',
      justifyContent: 'center',
      marginTop: '12px',
    },
    buttonGroup: {
      display: 'flex',
      gap: '12px',
      marginTop: '32px',
      paddingTop: '24px',
      borderTop: '1px solid #2a2a2a',
    },
    primaryButton: {
      flex: 1,
      padding: '12px 24px',
      backgroundColor: '#dc2626',
      color: '#ffffff',
      border: 'none',
      borderRadius: '6px',
      fontSize: '14px',
      fontWeight: '600' as const,
      cursor: 'pointer',
      transition: 'background-color 0.2s',
    },
    secondaryButton: {
      flex: 1,
      padding: '12px 24px',
      backgroundColor: 'transparent',
      color: '#888',
      border: '1px solid #2a2a2a',
      borderRadius: '6px',
      fontSize: '14px',
      fontWeight: '600' as const,
      cursor: 'pointer',
      transition: 'all 0.2s',
    },
    emptyState: {
      textAlign: 'center' as const,
      padding: '32px',
      color: '#888',
      fontSize: '14px',
    },
    // Template Library Styles
    templateLibrary: {
      backgroundColor: '#1a1a1a',
      border: '2px solid #444',
      borderRadius: '12px',
      padding: '0',
      maxHeight: '600px',
      display: 'flex',
      flexDirection: 'column' as const,
    },
    templateLibraryHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '16px 20px',
      borderBottom: '1px solid #444',
      position: 'sticky' as const,
      top: 0,
      backgroundColor: '#1a1a1a',
      zIndex: 10,
    },
    templateLibraryTitle: {
      fontSize: '18px',
      fontWeight: 'bold' as const,
      color: '#ffffff',
      margin: 0,
    },
    templateCloseButton: {
      background: 'none',
      border: 'none',
      color: '#888',
      fontSize: '32px',
      cursor: 'pointer',
      padding: '0',
      width: '32px',
      height: '32px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      lineHeight: '1',
    },
    templateSearchContainer: {
      padding: '16px 20px 0',
    },
    templateSearchInput: {
      width: '100%',
      padding: '10px 12px',
      backgroundColor: '#2a2a2a',
      border: '1px solid #444',
      borderRadius: '8px',
      color: '#ffffff',
      fontSize: '14px',
      boxSizing: 'border-box' as const,
    },
    categoryFilterContainer: {
      display: 'flex',
      gap: '8px',
      padding: '12px 20px',
      flexWrap: 'wrap' as const,
      borderBottom: '1px solid #444',
    },
    categoryFilterButton: {
      padding: '8px 16px',
      backgroundColor: 'transparent',
      border: '1px solid #444',
      borderRadius: '6px',
      color: '#888',
      fontSize: '13px',
      fontWeight: '600' as const,
      cursor: 'pointer',
      transition: 'all 0.2s',
      whiteSpace: 'nowrap' as const,
    },
    categoryFilterButtonActive: {
      backgroundColor: '#007AFF',
      borderColor: '#007AFF',
      color: '#ffffff',
    },
    templatesContainer: {
      padding: '20px',
      overflowY: 'auto' as const,
      flex: 1,
    },
    categoryGroup: {
      marginBottom: '24px',
    },
    categoryGroupHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '12px',
    },
    categoryGroupTitle: {
      fontSize: '16px',
      fontWeight: 'bold' as const,
      color: '#ffffff',
      margin: 0,
    },
    categoryGroupCount: {
      fontSize: '12px',
      color: '#888',
      fontWeight: '500' as const,
    },
    templateGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
      gap: '12px',
    },
    templateCard: {
      backgroundColor: '#2a2a2a',
      border: '1px solid #444',
      borderRadius: '8px',
      padding: '16px',
      cursor: 'pointer',
      transition: 'all 0.2s',
      ':hover': {
        backgroundColor: '#333',
        borderColor: '#007AFF',
      },
    },
    templateCardHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: '8px',
      gap: '8px',
    },
    templateCardTitle: {
      fontSize: '14px',
      fontWeight: '600' as const,
      color: '#ffffff',
      margin: 0,
      flex: 1,
    },
    templatePriorityBadge: {
      fontSize: '10px',
      fontWeight: '700' as const,
      padding: '4px 8px',
      borderRadius: '4px',
      whiteSpace: 'nowrap' as const,
      letterSpacing: '0.5px',
    },
    templateCardDescription: {
      fontSize: '12px',
      color: '#888',
      marginBottom: '12px',
      lineHeight: '1.4',
      display: '-webkit-box',
      WebkitLineClamp: 2,
      WebkitBoxOrient: 'vertical' as const,
      overflow: 'hidden',
    },
    templateCardMeta: {
      display: 'flex',
      gap: '12px',
      flexWrap: 'wrap' as const,
    },
    templateCardMetaItem: {
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      fontSize: '11px',
      color: '#888',
    },
    emptyTemplateState: {
      padding: '40px 20px',
      textAlign: 'center' as const,
    },
    emptyTemplateText: {
      color: '#888',
      fontSize: '14px',
      margin: 0,
    },
    filterButton: {
      padding: '6px 12px',
      backgroundColor: 'transparent',
      border: '1px solid #2a2a2a',
      borderRadius: '4px',
      color: '#888',
      fontSize: '12px',
      fontWeight: '500' as const,
      cursor: 'pointer',
      transition: 'all 0.2s',
      whiteSpace: 'nowrap' as const,
    },
    filterButtonActive: {
      backgroundColor: '#dc2626',
      borderColor: '#dc2626',
      color: '#ffffff',
    },
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>Create New Job</h2>
          <button style={styles.closeButton} onClick={onClose}>×</button>
        </div>

        <form style={styles.form} onSubmit={handleSubmit}>
          {/* Basic Info Section */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Job Information</h3>

            <div style={{ marginBottom: '16px' }}>
              <label style={styles.label}>Job Title *</label>
              <input
                type="text"
                style={styles.input}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter job title"
                required
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={styles.label}>Description</label>
              <textarea
                style={styles.textarea}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter job description"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={styles.label}>Department *</label>
                <select
                  style={styles.select}
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  required
                >
                  <option value="Admin">Admin</option>
                  <option value="Staff">Staff</option>
                </select>
              </div>

              <div>
                <label style={styles.label}>Priority *</label>
                <select
                  style={styles.select}
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TaskPriority)}
                  required
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={styles.label}>Scheduled Date *</label>
                <input
                  type="date"
                  style={styles.input}
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={styles.label}>Due Time</label>
                <input
                  type="time"
                  style={styles.input}
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Tasks Section */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Select Tasks ({selectedTemplateIds.size} selected)</h3>

            {/* Search Bar */}
            <div style={{ marginBottom: '12px' }}>
              <input
                type="text"
                placeholder="Search tasks..."
                value={templateSearchQuery}
                onChange={(e) => setTemplateSearchQuery(e.target.value)}
                style={styles.input}
              />
            </div>

            {/* Category Filter */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                style={{
                  ...styles.filterButton,
                  ...(selectedCategory === 'all' ? styles.filterButtonActive : {}),
                }}
              >
                All
              </button>
              {categories.map(category => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setSelectedCategory(category)}
                  style={{
                    ...styles.filterButton,
                    ...(selectedCategory === category ? styles.filterButtonActive : {}),
                  }}
                >
                  {category}
                </button>
              ))}
            </div>

            {/* Task List with Checkboxes */}
            {filteredTemplates.length === 0 ? (
              <div style={styles.emptyState}>
                {templateSearchQuery ? 'No tasks match your search.' : 'No tasks available in the library.'}
              </div>
            ) : (
              <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #2a2a2a', borderRadius: '6px', padding: '8px', backgroundColor: '#0f0f0f' }}>
                {filteredTemplates.map(template => {
                  const isSelected = selectedTemplateIds.has(template.id);
                  return (
                    <label
                      key={template.id}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        padding: '12px',
                        marginBottom: '6px',
                        backgroundColor: isSelected ? '#1a1a1a' : 'transparent',
                        border: `1px solid ${isSelected ? '#dc2626' : '#2a2a2a'}`,
                        borderRadius: '6px',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleTemplate(template.id)}
                        style={{ cursor: 'pointer', width: '16px', height: '16px', marginRight: '12px', marginTop: '2px', flexShrink: 0 }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: '500', color: '#ffffff', marginBottom: '4px', fontSize: '14px' }}>
                          {template.title}
                        </div>
                        <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px', lineHeight: '1.4' }}>
                          {template.description}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', fontSize: '11px', color: '#555', alignItems: 'center' }}>
                          <span>{template.estimatedDuration} min</span>
                          <span>•</span>
                          <span>{template.steps.length} steps</span>
                          <span>•</span>
                          <span>{template.department}</span>
                          <span>•</span>
                          <span style={{
                            color:
                              template.priority === 'urgent' ? '#dc2626' :
                              template.priority === 'high' ? '#ea580c' :
                              template.priority === 'medium' ? '#2563eb' :
                              '#16a34a',
                            fontWeight: '600',
                          }}>
                            {template.priority.toUpperCase()}
                          </span>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Form Actions */}
          <div style={styles.buttonGroup}>
            <button
              type="submit"
              style={styles.primaryButton}
              disabled={!title.trim() || !scheduledDate || selectedTemplateIds.size === 0}
            >
              Create Job
            </button>
            <button
              type="button"
              style={styles.secondaryButton}
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default JobForm;
