import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Job, Task, JobStatus, TaskPriority } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from './AuthContext';

interface JobContextType {
  // Jobs
  jobs: Job[];
  addJob: (job: Omit<Job, 'id' | 'createdAt' | 'completedTasksCount' | 'totalTasksCount' | 'progressPercentage'>) => Promise<void>;
  updateJob: (id: string, job: Partial<Job>) => Promise<void>;
  deleteJob: (id: string) => Promise<void>;
  getJobById: (id: string) => Job | undefined;
  getJobsByUser: (userId: string) => Job[];
  getJobsByDate: (date: string) => Job[];

  // Job-specific operations
  addTaskToJob: (jobId: string, task: Task) => Promise<void>;
  removeTaskFromJob: (jobId: string, taskId: string) => Promise<void>;
  updateJobProgress: (jobId: string) => Promise<void>;

  // Archive operations
  archiveJob: (id: string) => Promise<void>;
  restoreJob: (id: string) => Promise<void>;

  loading: boolean;
}

// Helper function to calculate job progress
const calculateJobProgress = (tasks: Task[]): { completedCount: number; totalCount: number; percentage: number } => {
  const totalCount = tasks.length;
  const completedCount = tasks.filter(task => task.status === 'completed').length;
  const percentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return { completedCount, totalCount, percentage };
};

// Helper function to determine job status based on tasks
const determineJobStatus = (tasks: Task[], currentStatus: JobStatus): JobStatus => {
  if (tasks.length === 0) return 'pending';

  const allCompleted = tasks.every(task => task.status === 'completed');
  if (allCompleted) return 'completed';

  const anyInProgress = tasks.some(task => task.status === 'in-progress');
  if (anyInProgress) return 'in-progress';

  const anyOverdue = tasks.some(task => task.status === 'overdue');
  if (anyOverdue) return 'overdue';

  return currentStatus;
};

const JobContext = createContext<JobContextType | undefined>(undefined);

export const useJob = () => {
  const context = useContext(JobContext);
  if (!context) {
    throw new Error('useJob must be used within a JobProvider');
  }
  return context;
};

interface JobProviderProps {
  children: ReactNode;
}

export const JobProvider: React.FC<JobProviderProps> = ({ children }) => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const { currentUser } = useAuth();
  const useSupabase = isSupabaseConfigured();

  // Load jobs from database
  const loadJobs = useCallback(async () => {
    if (!useSupabase) return;

    try {
      const { data: jobsData, error } = await supabase
        .from('jobs')
        .select('*')
        .order('scheduled_date', { ascending: true });

      if (jobsData && !error) {
        setJobs(jobsData);
      }
    } catch (error) {
      console.error('Error loading jobs:', error);
    }
  }, [useSupabase]);

  // Initialize: Load data from Supabase or localStorage
  useEffect(() => {
    const initializeData = async () => {
      if (!useSupabase) {
        // Fallback to localStorage mode
        const storedJobs = localStorage.getItem('mediamaple_jobs');

        if (storedJobs) {
          setJobs(JSON.parse(storedJobs));
        }

        setLoading(false);
        return;
      }

      try {
        // Load from Supabase
        await loadJobs();
        setLoading(false);
      } catch (error) {
        console.error('Error initializing job data:', error);
        setLoading(false);
      }
    };

    initializeData();
  }, [useSupabase, loadJobs]);

  // Subscribe to real-time changes for jobs
  useEffect(() => {
    if (!useSupabase) return;

    const channel = supabase
      .channel('jobs_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'jobs',
        },
        () => {
          loadJobs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [useSupabase, loadJobs]);

  // Save jobs to localStorage (fallback mode only)
  useEffect(() => {
    if (!useSupabase && jobs.length >= 0) {
      localStorage.setItem('mediamaple_jobs', JSON.stringify(jobs));
    }
  }, [jobs, useSupabase]);

  // Job Methods
  const addJob = async (jobData: Omit<Job, 'id' | 'createdAt' | 'completedTasksCount' | 'totalTasksCount' | 'progressPercentage'>) => {
    const { completedCount, totalCount, percentage } = calculateJobProgress(jobData.tasks);

    if (!useSupabase) {
      // Fallback to localStorage mode
      const newJob: Job = {
        ...jobData,
        id: `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        createdAt: new Date().toISOString(),
        completedTasksCount: completedCount,
        totalTasksCount: totalCount,
        progressPercentage: percentage,
      };
      setJobs([...jobs, newJob]);
      return;
    }

    try {
      const { error } = await supabase.from('jobs').insert({
        title: jobData.title,
        description: jobData.description,
        assigned_to: jobData.assignedTo,
        assigned_by: jobData.assignedBy,
        department: jobData.department,
        scheduled_date: jobData.scheduledDate,
        due_time: jobData.dueTime,
        status: jobData.status,
        priority: jobData.priority,
        tasks: jobData.tasks,
        completed_tasks_count: completedCount,
        total_tasks_count: totalCount,
        progress_percentage: percentage,
        comments: jobData.comments,
      });

      if (error) {
        console.error('Error adding job:', error);
        throw error;
      }

      await loadJobs();
    } catch (error) {
      console.error('Error adding job:', error);
      throw error;
    }
  };

  const updateJob = async (id: string, jobData: Partial<Job>) => {
    if (!useSupabase) {
      // Fallback to localStorage mode
      setJobs(
        jobs.map((job) => {
          if (job.id === id) {
            const updatedJob = { ...job, ...jobData, updatedAt: new Date().toISOString() };

            // Recalculate progress if tasks changed
            if (jobData.tasks) {
              const { completedCount, totalCount, percentage } = calculateJobProgress(jobData.tasks);
              updatedJob.completedTasksCount = completedCount;
              updatedJob.totalTasksCount = totalCount;
              updatedJob.progressPercentage = percentage;

              // Auto-update status based on tasks
              updatedJob.status = determineJobStatus(jobData.tasks, updatedJob.status);

              // If all tasks completed, mark job as completed
              if (percentage === 100 && updatedJob.status !== 'completed') {
                updatedJob.status = 'completed';
                updatedJob.completedAt = new Date().toISOString();
                updatedJob.completedBy = currentUser?.id;
              }
            }

            return updatedJob;
          }
          return job;
        })
      );
      return;
    }

    try {
      // Build update data
      const updateData: any = { updated_at: new Date().toISOString() };
      if (jobData.title) updateData.title = jobData.title;
      if (jobData.description) updateData.description = jobData.description;
      if (jobData.assignedTo) updateData.assigned_to = jobData.assignedTo;
      if (jobData.department) updateData.department = jobData.department;
      if (jobData.scheduledDate) updateData.scheduled_date = jobData.scheduledDate;
      if (jobData.dueTime) updateData.due_time = jobData.dueTime;
      if (jobData.status) updateData.status = jobData.status;
      if (jobData.priority) updateData.priority = jobData.priority;
      if (jobData.tasks) {
        updateData.tasks = jobData.tasks;

        // Recalculate progress
        const { completedCount, totalCount, percentage } = calculateJobProgress(jobData.tasks);
        updateData.completed_tasks_count = completedCount;
        updateData.total_tasks_count = totalCount;
        updateData.progress_percentage = percentage;

        // Auto-update status based on tasks
        const currentJob = jobs.find(j => j.id === id);
        if (currentJob) {
          updateData.status = determineJobStatus(jobData.tasks, currentJob.status);

          // If all tasks completed, mark job as completed
          if (percentage === 100 && updateData.status !== 'completed') {
            updateData.status = 'completed';
            updateData.completed_at = new Date().toISOString();
            updateData.completed_by = currentUser?.id;
          }
        }
      }
      if (jobData.startedAt) updateData.started_at = jobData.startedAt;
      if (jobData.completedAt) updateData.completed_at = jobData.completedAt;
      if (jobData.completedBy) updateData.completed_by = jobData.completedBy;
      if (jobData.completionNotes) updateData.completion_notes = jobData.completionNotes;
      if (jobData.comments) updateData.comments = jobData.comments;

      const { error } = await supabase
        .from('jobs')
        .update(updateData)
        .eq('id', id);

      if (error) {
        console.error('Error updating job:', error);
        throw error;
      }

      // Update local state optimistically
      setJobs(
        jobs.map((job) => {
          if (job.id === id) {
            const updatedJob = { ...job, ...jobData, updatedAt: new Date().toISOString() };

            // Recalculate progress if tasks changed
            if (jobData.tasks) {
              const { completedCount, totalCount, percentage } = calculateJobProgress(jobData.tasks);
              updatedJob.completedTasksCount = completedCount;
              updatedJob.totalTasksCount = totalCount;
              updatedJob.progressPercentage = percentage;

              // Auto-update status
              updatedJob.status = determineJobStatus(jobData.tasks, updatedJob.status);

              if (percentage === 100 && updatedJob.status !== 'completed') {
                updatedJob.status = 'completed';
                updatedJob.completedAt = new Date().toISOString();
                updatedJob.completedBy = currentUser?.id;
              }
            }

            return updatedJob;
          }
          return job;
        })
      );
    } catch (error) {
      console.error('Error updating job:', error);
      throw error;
    }
  };

  const deleteJob = async (id: string) => {
    if (!useSupabase) {
      // Fallback to localStorage mode
      setJobs(jobs.filter((job) => job.id !== id));
      return;
    }

    try {
      const { error } = await supabase
        .from('jobs')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting job:', error);
        throw error;
      }

      // Update local state
      setJobs(jobs.filter((job) => job.id !== id));
    } catch (error) {
      console.error('Error deleting job:', error);
      throw error;
    }
  };

  const getJobById = (id: string): Job | undefined => {
    return jobs.find((job) => job.id === id);
  };

  const getJobsByUser = (userId: string): Job[] => {
    return jobs.filter((job) => job.assignedTo.includes(userId));
  };

  const getJobsByDate = (date: string): Job[] => {
    return jobs.filter((job) => job.scheduledDate === date);
  };

  const addTaskToJob = async (jobId: string, task: Task) => {
    const job = getJobById(jobId);
    if (!job) return;

    const updatedTasks = [...job.tasks, task];
    await updateJob(jobId, { tasks: updatedTasks });
  };

  const removeTaskFromJob = async (jobId: string, taskId: string) => {
    const job = getJobById(jobId);
    if (!job) return;

    const updatedTasks = job.tasks.filter(task => task.id !== taskId);
    await updateJob(jobId, { tasks: updatedTasks });
  };

  const updateJobProgress = async (jobId: string) => {
    const job = getJobById(jobId);
    if (!job) return;

    const { completedCount, totalCount, percentage } = calculateJobProgress(job.tasks);
    await updateJob(jobId, {
      completedTasksCount: completedCount,
      totalTasksCount: totalCount,
      progressPercentage: percentage,
    });
  };

  const archiveJob = async (id: string) => {
    await updateJob(id, { status: 'archived' });
  };

  const restoreJob = async (id: string) => {
    await updateJob(id, { status: 'pending' });
  };

  const value: JobContextType = {
    jobs,
    addJob,
    updateJob,
    deleteJob,
    getJobById,
    getJobsByUser,
    getJobsByDate,
    addTaskToJob,
    removeTaskFromJob,
    updateJobProgress,
    archiveJob,
    restoreJob,
    loading,
  };

  return <JobContext.Provider value={value}>{children}</JobContext.Provider>;
};
