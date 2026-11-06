import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { UnifiedJobTaskModal } from './UnifiedJobTaskModal';
import { JobTask } from '../types';

const mockError = jest.fn();
jest.mock('../contexts/ToastContext', () => ({ useToast: () => ({ error: mockError, success: jest.fn() }) }));
jest.mock('../hooks/useResponsive', () => ({ useResponsive: () => ({ isMobile: false, isMobileOrTablet: false }) }));
jest.mock('../lib/supabase', () => ({ supabase: { storage: { from: jest.fn() } }, isSupabaseConfigured: false }));
jest.mock('./tasks/TaskFilesEditor', () => () => null);

const task: JobTask = {
  id: 't1', title: 'Clean up costumes', description: '', assignedTo: ['u1'], assignedBy: 'u1',
  department: 'Ops', category: 'General', scheduledDate: '2026-07-20', estimatedDuration: 30,
  status: 'pending', priority: 'high', steps: [], completedSteps: [], progressPercentage: 0,
  sopIds: [], comments: [], createdAt: 'now', updatedAt: 'now',
} as unknown as JobTask;

const props = {
  onClose: jest.fn(), editingTask: task, taskTemplates: [], sops: [], currentUserId: 'u1',
  users: [{ id: 'u1', firstName: 'Sam', lastName: 'M', role: 'admin', department: 'Ops', isActive: true }],
};

describe('UnifiedJobTaskModal save button', () => {
  it('is not stuck on "Saving..." when the form is opened again after a save', async () => {
    const onCreate = jest.fn().mockResolvedValue(undefined);
    const { rerender } = render(<UnifiedJobTaskModal {...props} isOpen onCreate={onCreate} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Update Task' })); });
    expect(onCreate).toHaveBeenCalledTimes(1);

    // The page keeps the modal mounted and just flips isOpen.
    rerender(<UnifiedJobTaskModal {...props} isOpen={false} onCreate={onCreate} />);
    rerender(<UnifiedJobTaskModal {...props} isOpen onCreate={onCreate} />);
    expect(screen.queryByText('Saving...')).toBeNull();
    expect(screen.getByRole('button', { name: 'Update Task' })).not.toBeDisabled();
  });

  it('comes back from "Saving..." when the save fails and the form stays open', async () => {
    // JobTasksPage toasts its own failure and returns normally.
    const onCreate = jest.fn().mockResolvedValue(undefined);
    render(<UnifiedJobTaskModal {...props} isOpen onCreate={onCreate} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Update Task' })); });
    expect(screen.getByRole('button', { name: 'Update Task' })).not.toBeDisabled();
  });
});
