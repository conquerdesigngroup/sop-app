import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { TaskTemplate, JobTask, TaskTemplateStep, TaskStep, TaskStatus, TaskPriority } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { logActivity } from '../utils/activityLogger';

interface TaskContextType {
  // Task Templates (Library)
  taskTemplates: TaskTemplate[];
  addTaskTemplate: (template: Omit<TaskTemplate, 'id' | 'createdAt'>) => Promise<void>;
  updateTaskTemplate: (id: string, template: Partial<TaskTemplate>) => Promise<void>;
  deleteTaskTemplate: (id: string) => Promise<void>;
  getTaskTemplateById: (id: string) => TaskTemplate | undefined;
  getTaskTemplatesByDepartment: (department: string) => TaskTemplate[];

  // Job Tasks (Assigned Tasks)
  jobTasks: JobTask[];
  addJobTask: (task: Omit<JobTask, 'id' | 'createdAt' | 'progressPercentage'>) => Promise<void>;
  updateJobTask: (id: string, task: Partial<JobTask>) => Promise<void>;
  deleteJobTask: (id: string) => Promise<void>;
  archiveJobTask: (id: string) => Promise<void>;
  restoreJobTask: (id: string) => Promise<void>;
  getJobTaskById: (id: string) => JobTask | undefined;
  getJobTasksByUser: (userId: string) => JobTask[];
  getJobTasksByDate: (date: string) => JobTask[];
  getArchivedJobTasks: () => JobTask[];
  updateTaskProgress: (taskId: string, completedStepIds: string[]) => Promise<void>;
  createJobTaskFromTemplate: (templateId: string, assignedTo: string[], scheduledDate: string, assignedBy: string) => Promise<void>;
  createJobTaskUnified: (taskData: {
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
    scheduledDate: string;
    dueTime?: string;
    assignedTo: string[];
    isRecurring?: boolean;
    recurrencePattern?: any;
    templateId?: string;
  }, saveAsTemplate: boolean) => Promise<void>;
  loading: boolean;
}

// Helper function to map Supabase task template to app TaskTemplate type
const mapSupabaseTaskTemplate = (dbTemplate: any): TaskTemplate => {
  return {
    id: dbTemplate.id,
    title: dbTemplate.title,
    description: dbTemplate.description,
    category: dbTemplate.category,
    department: dbTemplate.department,
    estimatedDuration: dbTemplate.estimated_duration,
    priority: dbTemplate.priority as TaskPriority,
    sopIds: dbTemplate.sop_ids || [],
    steps: dbTemplate.steps || [],
    createdBy: dbTemplate.created_by,
    createdAt: dbTemplate.created_at,
    updatedAt: dbTemplate.updated_at,
    isRecurring: dbTemplate.is_recurring || false,
    recurrencePattern: dbTemplate.recurrence_pattern,
  };
};

// Helper function to map Supabase job task to app JobTask type
const mapSupabaseJobTask = (dbTask: any): JobTask => {
  return {
    id: dbTask.id,
    templateId: dbTask.template_id,
    title: dbTask.title,
    description: dbTask.description,
    assignedTo: dbTask.assigned_to || [],
    assignedBy: dbTask.assigned_by,
    department: dbTask.department,
    category: dbTask.category,
    scheduledDate: dbTask.scheduled_date,
    dueTime: dbTask.due_time,
    estimatedDuration: dbTask.estimated_duration,
    status: dbTask.status as TaskStatus,
    priority: dbTask.priority as TaskPriority,
    steps: dbTask.steps || [],
    completedSteps: dbTask.completed_steps || [],
    progressPercentage: dbTask.progress_percentage || 0,
    sopIds: dbTask.sop_ids || [],
    startedAt: dbTask.started_at,
    completedAt: dbTask.completed_at,
    completedBy: dbTask.completed_by,
    completionNotes: dbTask.completion_notes,
    completionPhotos: dbTask.completion_photos || [],
    comments: dbTask.comments || [],
    createdAt: dbTask.created_at,
    updatedAt: dbTask.updated_at,
    isRecurring: dbTask.is_recurring || false,
    recurrencePattern: dbTask.recurrence_pattern,
  };
};

const TaskContext = createContext<TaskContextType | undefined>(undefined);

export const useTask = () => {
  const context = useContext(TaskContext);
  if (!context) {
    throw new Error('useTask must be used within a TaskProvider');
  }
  return context;
};

// Default task templates for demo
const defaultTaskTemplates: TaskTemplate[] = [
  {
    id: 'template_opening_duties',
    title: 'Morning Opening Duties',
    description: 'Complete all tasks required to open the facility for the day',
    category: 'Opening Duties',
    department: 'Admin',
    estimatedDuration: 45,
    priority: 'high',
    sopIds: ['sop_default_classroom_setup'],
    steps: [
      {
        id: 'step_1',
        order: 1,
        title: 'Unlock doors and disable alarm',
        description: 'Unlock main entrance and disable security system',
        requiresPhoto: false,
      },
      {
        id: 'step_2',
        order: 2,
        title: 'Turn on lights and HVAC',
        description: 'Turn on all lights and set temperature to 72°F',
        requiresPhoto: false,
      },
      {
        id: 'step_3',
        order: 3,
        title: 'Check voice mail and emails',
        description: 'Review and respond to urgent messages',
        requiresPhoto: false,
      },
      {
        id: 'step_4',
        order: 4,
        title: 'Prepare reception area',
        description: 'Ensure reception is clean and organized',
        requiresPhoto: true,
      },
    ],
    createdBy: 'system',
    createdAt: new Date().toISOString(),
    isRecurring: true,
    recurrencePattern: {
      frequency: 'daily',
      daysOfWeek: [1, 2, 3, 4, 5], // Monday-Friday
    },
  },
  {
    id: 'template_closing_duties',
    title: 'Evening Closing Duties',
    description: 'Complete all tasks required to close the facility for the day',
    category: 'Closing Duties',
    department: 'Admin',
    estimatedDuration: 30,
    priority: 'high',
    sopIds: [],
    steps: [
      {
        id: 'step_1',
        order: 1,
        title: 'Check all rooms are empty',
        description: 'Walk through all rooms and ensure no one is left',
        requiresPhoto: false,
      },
      {
        id: 'step_2',
        order: 2,
        title: 'Turn off lights and equipment',
        description: 'Turn off all lights, computers, and equipment',
        requiresPhoto: false,
      },
      {
        id: 'step_3',
        order: 3,
        title: 'Lock all doors and windows',
        description: 'Ensure all entry points are secured',
        requiresPhoto: false,
      },
      {
        id: 'step_4',
        order: 4,
        title: 'Arm security system',
        description: 'Activate alarm system and verify it is armed',
        requiresPhoto: false,
      },
    ],
    createdBy: 'system',
    createdAt: new Date().toISOString(),
    isRecurring: true,
    recurrencePattern: {
      frequency: 'daily',
      daysOfWeek: [1, 2, 3, 4, 5], // Monday-Friday
    },
  },
  {
    id: 'template_weekly_inventory',
    title: 'Weekly Supply Inventory',
    description: 'Check and restock all supplies',
    category: 'Weekly Maintenance',
    department: 'Admin',
    estimatedDuration: 60,
    priority: 'medium',
    sopIds: [],
    steps: [
      {
        id: 'step_1',
        order: 1,
        title: 'Check office supplies',
        description: 'Count and note items running low',
        requiresPhoto: false,
      },
      {
        id: 'step_2',
        order: 2,
        title: 'Check classroom materials',
        description: 'Review classroom supply levels',
        requiresPhoto: false,
      },
      {
        id: 'step_3',
        order: 3,
        title: 'Create shopping list',
        description: 'Compile list of items to order',
        requiresPhoto: false,
      },
      {
        id: 'step_4',
        order: 4,
        title: 'Submit purchase orders',
        description: 'Submit orders for approved supplies',
        requiresPhoto: false,
      },
    ],
    createdBy: 'system',
    createdAt: new Date().toISOString(),
    isRecurring: true,
    recurrencePattern: {
      frequency: 'weekly',
      daysOfWeek: [1], // Every Monday
    },
  },
];

interface TaskProviderProps {
  children: ReactNode;
}

export const TaskProvider: React.FC<TaskProviderProps> = ({ children }) => {
  const [taskTemplates, setTaskTemplates] = useState<TaskTemplate[]>([]);
  const [jobTasks, setJobTasks] = useState<JobTask[]>([]);
  const [loading, setLoading] = useState(true);
  const { currentUser, isAuthenticated, loading: authLoading } = useAuth();
  const useSupabase = isSupabaseConfigured();

  // Load task templates from database
  const loadTaskTemplates = useCallback(async () => {
    if (!useSupabase) return;

    try {
      const { data: templates, error } = await supabase
        .from('task_templates')
        .select('*')
        .order('created_at', { ascending: false });

      if (templates && !error) {
        const mappedTemplates = templates.map((t: any) => mapSupabaseTaskTemplate(t));
        setTaskTemplates(mappedTemplates);
      }
    } catch (error) {
      console.error('Error loading task templates:', error);
    }
  }, [useSupabase]);

  // Load job tasks from database
  const loadJobTasks = useCallback(async () => {
    if (!useSupabase) return;

    try {
      const { data: tasks, error } = await supabase
        .from('job_tasks')
        .select('*')
        .order('scheduled_date', { ascending: true });

      if (tasks && !error) {
        const mappedTasks = tasks.map((t: any) => mapSupabaseJobTask(t));
        setJobTasks(mappedTasks);
      }
    } catch (error) {
      console.error('Error loading job tasks:', error);
    }
  }, [useSupabase]);

  // Initialize: Load data from Supabase or localStorage (only after auth is ready)
  useEffect(() => {
    // Wait for auth to finish loading before fetching data
    if (authLoading) return;

    const initializeData = async () => {
      if (!useSupabase) {
        // Fallback to localStorage mode
        const storedTemplates = localStorage.getItem('mediamaple_task_templates');
        const storedJobTasks = localStorage.getItem('mediamaple_job_tasks');

        if (storedTemplates) {
          setTaskTemplates(JSON.parse(storedTemplates));
        } else {
          setTaskTemplates(defaultTaskTemplates);
          localStorage.setItem('mediamaple_task_templates', JSON.stringify(defaultTaskTemplates));
        }

        if (storedJobTasks) {
          setJobTasks(JSON.parse(storedJobTasks));
        }

        setLoading(false);
        return;
      }

      // Only load data if authenticated (Supabase requires auth for RLS)
      if (!isAuthenticated) {
        setLoading(false);
        return;
      }

      try {
        // Load from Supabase
        await Promise.all([loadTaskTemplates(), loadJobTasks()]);
        setLoading(false);
      } catch (error) {
        console.error('Error initializing task data:', error);
        setLoading(false);
      }
    };

    initializeData();
  }, [useSupabase, authLoading, isAuthenticated, loadTaskTemplates, loadJobTasks]);

  // Subscribe to real-time changes for task templates
  useEffect(() => {
    if (!useSupabase) return;

    const channel = supabase
      .channel('task_templates_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'task_templates',
        },
        () => {
          loadTaskTemplates();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [useSupabase, loadTaskTemplates]);

  // Subscribe to real-time changes for job tasks
  useEffect(() => {
    if (!useSupabase) return;

    const channel = supabase
      .channel('job_tasks_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'job_tasks',
        },
        () => {
          loadJobTasks();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [useSupabase, loadJobTasks]);

  // Save templates to localStorage (fallback mode only)
  useEffect(() => {
    if (!useSupabase && taskTemplates.length > 0) {
      localStorage.setItem('mediamaple_task_templates', JSON.stringify(taskTemplates));
    }
  }, [taskTemplates, useSupabase]);

  // Save job tasks to localStorage (fallback mode only)
  useEffect(() => {
    if (!useSupabase && jobTasks.length > 0) {
      localStorage.setItem('mediamaple_job_tasks', JSON.stringify(jobTasks));
    }
  }, [jobTasks, useSupabase]);

  // Task Template Methods
  const addTaskTemplate = async (templateData: Omit<TaskTemplate, 'id' | 'createdAt'>) => {
    if (!useSupabase) {
      // Fallback to localStorage mode
      const newTemplate: TaskTemplate = {
        ...templateData,
        id: `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        createdAt: new Date().toISOString(),
      };
      setTaskTemplates([...taskTemplates, newTemplate]);
      return;
    }

    try {
      const { error } = await supabase.from('task_templates').insert({
        title: templateData.title,
        description: templateData.description,
        category: templateData.category,
        department: templateData.department,
        estimated_duration: templateData.estimatedDuration,
        priority: templateData.priority,
        sop_ids: templateData.sopIds,
        steps: templateData.steps,
        created_by: currentUser?.id || 'system',
        is_recurring: templateData.isRecurring,
        recurrence_pattern: templateData.recurrencePattern,
      });

      if (error) {
        console.error('Error adding task template:', error);
        throw error;
      }

      await loadTaskTemplates();
    } catch (error) {
      console.error('Error adding task template:', error);
      throw error;
    }
  };

  const updateTaskTemplate = async (id: string, templateData: Partial<TaskTemplate>) => {
    if (!useSupabase) {
      // Fallback to localStorage mode
      setTaskTemplates(
        taskTemplates.map((template) =>
          template.id === id
            ? { ...template, ...templateData, updatedAt: new Date().toISOString() }
            : template
        )
      );
      return;
    }

    try {
      const updateData: any = { updated_at: new Date().toISOString() };
      if (templateData.title) updateData.title = templateData.title;
      if (templateData.description) updateData.description = templateData.description;
      if (templateData.category) updateData.category = templateData.category;
      if (templateData.department) updateData.department = templateData.department;
      if (templateData.estimatedDuration) updateData.estimated_duration = templateData.estimatedDuration;
      if (templateData.priority) updateData.priority = templateData.priority;
      if (templateData.sopIds) updateData.sop_ids = templateData.sopIds;
      if (templateData.steps) updateData.steps = templateData.steps;
      if (templateData.isRecurring !== undefined) updateData.is_recurring = templateData.isRecurring;
      if (templateData.recurrencePattern) updateData.recurrence_pattern = templateData.recurrencePattern;

      const { error } = await supabase
        .from('task_templates')
        .update(updateData)
        .eq('id', id);

      if (error) {
        console.error('Error updating task template:', error);
        throw error;
      }

      // Update local state optimistically
      setTaskTemplates(
        taskTemplates.map((template) =>
          template.id === id
            ? { ...template, ...templateData, updatedAt: new Date().toISOString() }
            : template
        )
      );
    } catch (error) {
      console.error('Error updating task template:', error);
      throw error;
    }
  };

  const deleteTaskTemplate = async (id: string) => {
    if (!useSupabase) {
      // Fallback to localStorage mode
      setTaskTemplates(taskTemplates.filter((template) => template.id !== id));
      return;
    }

    try {
      const { error } = await supabase
        .from('task_templates')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting task template:', error);
        throw error;
      }

      // Update local state
      setTaskTemplates(taskTemplates.filter((template) => template.id !== id));
    } catch (error) {
      console.error('Error deleting task template:', error);
      throw error;
    }
  };

  const getTaskTemplateById = (id: string): TaskTemplate | undefined => {
    return taskTemplates.find((template) => template.id === id);
  };

  const getTaskTemplatesByDepartment = (department: string): TaskTemplate[] => {
    return taskTemplates.filter((template) => template.department === department);
  };

  // Job Task Methods
  const calculateProgress = (steps: TaskStep[], completedStepIds: string[]): number => {
    if (steps.length === 0) return 0;
    return Math.round((completedStepIds.length / steps.length) * 100);
  };

  const addJobTask = async (taskData: Omit<JobTask, 'id' | 'createdAt' | 'progressPercentage'>) => {
    const progressPercentage = calculateProgress(taskData.steps, taskData.completedSteps);

    if (!useSupabase) {
      // Fallback to localStorage mode
      const newTask: JobTask = {
        ...taskData,
        id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        createdAt: new Date().toISOString(),
        progressPercentage,
      };
      setJobTasks([...jobTasks, newTask]);

      // Log activity
      if (currentUser) {
        logActivity({
          userId: currentUser.id,
          userEmail: currentUser.email,
          userName: `${currentUser.firstName} ${currentUser.lastName}`,
          action: 'task_created',
          entityType: 'task',
          entityId: newTask.id,
          entityTitle: newTask.title,
        });
      }
      return;
    }

    try {
      const { data, error } = await supabase.from('job_tasks').insert({
        template_id: taskData.templateId,
        title: taskData.title,
        description: taskData.description,
        assigned_to: taskData.assignedTo,
        assigned_by: taskData.assignedBy,
        department: taskData.department,
        category: taskData.category,
        scheduled_date: taskData.scheduledDate,
        due_time: taskData.dueTime,
        estimated_duration: taskData.estimatedDuration,
        status: taskData.status,
        priority: taskData.priority,
        steps: taskData.steps,
        completed_steps: taskData.completedSteps,
        progress_percentage: progressPercentage,
        sop_ids: taskData.sopIds,
        comments: taskData.comments,
        is_recurring: taskData.isRecurring || false,
        recurrence_pattern: taskData.recurrencePattern,
      }).select().single();

      if (error) {
        console.error('Error adding job task:', error);
        throw error;
      }

      // Log activity
      if (currentUser) {
        logActivity({
          userId: currentUser.id,
          userEmail: currentUser.email,
          userName: `${currentUser.firstName} ${currentUser.lastName}`,
          action: 'task_created',
          entityType: 'task',
          entityId: data?.id,
          entityTitle: taskData.title,
        });
      }

      await loadJobTasks();
    } catch (error) {
      console.error('Error adding job task:', error);
      throw error;
    }
  };

  const updateJobTask = async (id: string, taskData: Partial<JobTask>) => {
    if (!useSupabase) {
      // Fallback to localStorage mode
      setJobTasks(
        jobTasks.map((task) => {
          if (task.id === id) {
            const updatedTask = { ...task, ...taskData, updatedAt: new Date().toISOString() };

            // Recalculate progress if steps or completedSteps changed
            if (taskData.steps || taskData.completedSteps) {
              updatedTask.progressPercentage = calculateProgress(
                updatedTask.steps,
                updatedTask.completedSteps
              );
            }

            // Auto-update status based on progress
            if (updatedTask.progressPercentage === 100 && updatedTask.status !== 'completed') {
              updatedTask.status = 'completed';
              updatedTask.completedAt = new Date().toISOString();
            }

            return updatedTask;
          }
          return task;
        })
      );
      return;
    }

    try {
      // Build update data
      const updateData: any = { updated_at: new Date().toISOString() };
      if (taskData.title) updateData.title = taskData.title;
      if (taskData.description) updateData.description = taskData.description;
      if (taskData.assignedTo) updateData.assigned_to = taskData.assignedTo;
      if (taskData.department) updateData.department = taskData.department;
      if (taskData.category) updateData.category = taskData.category;
      if (taskData.scheduledDate) updateData.scheduled_date = taskData.scheduledDate;
      if (taskData.dueTime) updateData.due_time = taskData.dueTime;
      if (taskData.estimatedDuration) updateData.estimated_duration = taskData.estimatedDuration;
      if (taskData.status) updateData.status = taskData.status;
      if (taskData.priority) updateData.priority = taskData.priority;
      if (taskData.steps) updateData.steps = taskData.steps;
      if (taskData.completedSteps) updateData.completed_steps = taskData.completedSteps;
      if (taskData.sopIds) updateData.sop_ids = taskData.sopIds;
      if (taskData.startedAt) updateData.started_at = taskData.startedAt;
      if (taskData.completedAt) updateData.completed_at = taskData.completedAt;
      if (taskData.completedBy) updateData.completed_by = taskData.completedBy;
      if (taskData.completionNotes) updateData.completion_notes = taskData.completionNotes;
      if (taskData.completionPhotos) updateData.completion_photos = taskData.completionPhotos;
      if (taskData.comments) updateData.comments = taskData.comments;

      // Calculate progress if steps or completedSteps changed
      const currentTask = jobTasks.find(t => t.id === id);
      if (currentTask && (taskData.steps || taskData.completedSteps)) {
        const steps = taskData.steps || currentTask.steps;
        const completedSteps = taskData.completedSteps || currentTask.completedSteps;
        updateData.progress_percentage = calculateProgress(steps, completedSteps);

        // Auto-update status based on progress
        if (updateData.progress_percentage === 100 && !taskData.status) {
          updateData.status = 'completed';
          updateData.completed_at = new Date().toISOString();
        }
      }

      const { error } = await supabase
        .from('job_tasks')
        .update(updateData)
        .eq('id', id);

      if (error) {
        console.error('Error updating job task:', error);
        throw error;
      }

      // Update local state optimistically
      setJobTasks(
        jobTasks.map((task) => {
          if (task.id === id) {
            const updatedTask = { ...task, ...taskData, updatedAt: new Date().toISOString() };

            // Recalculate progress if steps or completedSteps changed
            if (taskData.steps || taskData.completedSteps) {
              updatedTask.progressPercentage = calculateProgress(
                updatedTask.steps,
                updatedTask.completedSteps
              );
            }

            // Auto-update status based on progress
            if (updatedTask.progressPercentage === 100 && updatedTask.status !== 'completed') {
              updatedTask.status = 'completed';
              updatedTask.completedAt = new Date().toISOString();
            }

            return updatedTask;
          }
          return task;
        })
      );
    } catch (error) {
      console.error('Error updating job task:', error);
      throw error;
    }
  };

  const deleteJobTask = async (id: string) => {
    const taskToDelete = jobTasks.find((task) => task.id === id);

    if (!useSupabase) {
      // Fallback to localStorage mode
      setJobTasks(jobTasks.filter((task) => task.id !== id));

      // Log activity
      if (currentUser && taskToDelete) {
        logActivity({
          userId: currentUser.id,
          userEmail: currentUser.email,
          userName: `${currentUser.firstName} ${currentUser.lastName}`,
          action: 'task_deleted',
          entityType: 'task',
          entityId: id,
          entityTitle: taskToDelete.title,
        });
      }
      return;
    }

    try {
      const { error } = await supabase
        .from('job_tasks')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting job task:', error);
        throw error;
      }

      // Log activity
      if (currentUser && taskToDelete) {
        logActivity({
          userId: currentUser.id,
          userEmail: currentUser.email,
          userName: `${currentUser.firstName} ${currentUser.lastName}`,
          action: 'task_deleted',
          entityType: 'task',
          entityId: id,
          entityTitle: taskToDelete.title,
        });
      }

      // Update local state
      setJobTasks(jobTasks.filter((task) => task.id !== id));
    } catch (error) {
      console.error('Error deleting job task:', error);
      throw error;
    }
  };

  const getJobTaskById = (id: string): JobTask | undefined => {
    return jobTasks.find((task) => task.id === id);
  };

  const getJobTasksByUser = (userId: string): JobTask[] => {
    return jobTasks.filter((task) => task.assignedTo.includes(userId));
  };

  const getJobTasksByDate = (date: string): JobTask[] => {
    return jobTasks.filter((task) => task.scheduledDate === date);
  };

  const getArchivedJobTasks = (): JobTask[] => {
    return jobTasks.filter((task) => task.status === 'archived');
  };

  const archiveJobTask = async (id: string) => {
    const taskToArchive = jobTasks.find((task) => task.id === id);
    if (!taskToArchive) return;

    await updateJobTask(id, { status: 'archived' as TaskStatus });

    // Log activity
    if (currentUser) {
      logActivity({
        userId: currentUser.id,
        userEmail: currentUser.email,
        userName: `${currentUser.firstName} ${currentUser.lastName}`,
        action: 'task_archived',
        entityType: 'task',
        entityId: id,
        entityTitle: taskToArchive.title,
      });
    }
  };

  const restoreJobTask = async (id: string) => {
    const taskToRestore = jobTasks.find((task) => task.id === id);
    if (!taskToRestore) return;

    await updateJobTask(id, { status: 'pending' as TaskStatus });

    // Log activity
    if (currentUser) {
      logActivity({
        userId: currentUser.id,
        userEmail: currentUser.email,
        userName: `${currentUser.firstName} ${currentUser.lastName}`,
        action: 'task_restored',
        entityType: 'task',
        entityId: id,
        entityTitle: taskToRestore.title,
      });
    }
  };

  const updateTaskProgress = async (taskId: string, completedStepIds: string[]) => {
    await updateJobTask(taskId, { completedSteps: completedStepIds });
  };

  const createJobTaskFromTemplate = async (
    templateId: string,
    assignedTo: string[],
    scheduledDate: string,
    assignedBy: string
  ) => {
    const template = getTaskTemplateById(templateId);
    if (!template) return;

    // Convert template steps to task steps
    const taskSteps: TaskStep[] = template.steps.map((step) => ({
      ...step,
      isCompleted: false,
    }));

    const newTask: Omit<JobTask, 'id' | 'createdAt' | 'progressPercentage'> = {
      templateId: template.id,
      title: template.title,
      description: template.description,
      assignedTo,
      assignedBy,
      department: template.department,
      category: template.category,
      scheduledDate,
      estimatedDuration: template.estimatedDuration,
      status: 'pending',
      priority: template.priority,
      steps: taskSteps,
      completedSteps: [],
      sopIds: template.sopIds,
      comments: [],
    };

    await addJobTask(newTask);
  };

  // Unified method for creating job tasks (with optional template saving)
  const createJobTaskUnified = async (
    taskData: {
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
      scheduledDate: string;
      dueTime?: string;
      assignedTo: string[];
      isRecurring?: boolean;
      recurrencePattern?: any;
      templateId?: string;
    },
    saveAsTemplate: boolean = false
  ): Promise<void> => {
    if (!currentUser) {
      throw new Error('User must be logged in to create tasks');
    }

    try {
      // 1. If saveAsTemplate, create template first
      if (saveAsTemplate) {
        const templateSteps: TaskTemplateStep[] = taskData.steps.map((step, index) => ({
          id: `step_${Date.now()}_${index}`,
          order: index + 1,
          title: step.title,
          description: step.description || '',
          requiresPhoto: step.requiresPhoto,
          sopId: step.sopId,
        }));

        const template: Omit<TaskTemplate, 'id' | 'createdAt'> = {
          title: taskData.title,
          description: taskData.description,
          category: taskData.category,
          department: taskData.department,
          priority: taskData.priority,
          estimatedDuration: taskData.estimatedDuration,
          steps: templateSteps,
          sopIds: taskData.steps
            .filter(s => s.sopId)
            .map(s => s.sopId!),
          createdBy: currentUser.id,
          isRecurring: taskData.isRecurring || false,
          recurrencePattern: taskData.recurrencePattern,
        };

        await addTaskTemplate(template);
      }

      // 2. Create job task
      const taskSteps: TaskStep[] = taskData.steps.map((step, index) => ({
        id: `step_${Date.now()}_${index}`,
        order: index + 1,
        title: step.title,
        description: step.description || '',
        isCompleted: false,
        requiresPhoto: step.requiresPhoto,
        sopId: step.sopId,
      }));

      const jobTask: Omit<JobTask, 'id' | 'createdAt' | 'progressPercentage'> = {
        templateId: taskData.templateId,
        title: taskData.title,
        description: taskData.description,
        assignedTo: taskData.assignedTo,
        assignedBy: currentUser.id,
        department: taskData.department,
        category: taskData.category,
        scheduledDate: taskData.scheduledDate,
        dueTime: taskData.dueTime,
        estimatedDuration: taskData.estimatedDuration,
        status: 'pending',
        priority: taskData.priority,
        steps: taskSteps,
        completedSteps: [],
        sopIds: taskData.steps
          .filter(s => s.sopId)
          .map(s => s.sopId!),
        comments: [],
        isRecurring: taskData.isRecurring,
        recurrencePattern: taskData.recurrencePattern,
      };

      await addJobTask(jobTask);

      // Log activity
      logActivity({
        userId: currentUser.id,
        userEmail: currentUser.email,
        userName: `${currentUser.firstName} ${currentUser.lastName}`,
        action: 'task_created',
        entityType: 'task',
        entityId: jobTask.title, // Will be replaced with actual ID after creation
        entityTitle: jobTask.title,
      });
    } catch (error) {
      console.error('Error creating job task:', error);
      throw error;
    }
  };

  const value: TaskContextType = {
    taskTemplates,
    addTaskTemplate,
    updateTaskTemplate,
    deleteTaskTemplate,
    getTaskTemplateById,
    getTaskTemplatesByDepartment,
    jobTasks,
    addJobTask,
    updateJobTask,
    deleteJobTask,
    archiveJobTask,
    restoreJobTask,
    getJobTaskById,
    getJobTasksByUser,
    getJobTasksByDate,
    getArchivedJobTasks,
    updateTaskProgress,
    createJobTaskFromTemplate,
    createJobTaskUnified,
    loading,
  };

  return <TaskContext.Provider value={value}>{children}</TaskContext.Provider>;
};
