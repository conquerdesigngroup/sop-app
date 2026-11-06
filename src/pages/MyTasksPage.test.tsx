import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import MyTasksPage from './MyTasksPage';

/**
 * My Tasks is a checklist of titles; the details are one tap away.
 *
 * Team members asked not to be handed every field of every task up front.
 * The list shows a checkbox and a title, nothing else. Ticking the box
 * finishes the task; tapping the title opens the task with whatever the
 * admin filled in — and only that, so a title-only task stays plain.
 */

const mockUpdates: { id: string; patch: Record<string, unknown> }[] = [];
let resolveUpdate: (() => void) | null = null;
const mockUpdateJobTask = (id: string, patch: Record<string, unknown>) => {
  mockUpdates.push({ id, patch });
  return new Promise<void>(resolve => { resolveUpdate = resolve; });
};

const TODAY = '2026-11-06';
const base = {
  assignedTo: ['me'],
  assignedBy: 'admin',
  department: 'Operations',
  category: 'General',
  scheduledDate: TODAY,
  estimatedDuration: 0,
  priority: 'medium',
  steps: [] as unknown[],
  completedSteps: [] as string[],
  progressPercentage: 0,
  sopIds: [] as string[],
  comments: [],
  createdAt: TODAY,
  updatedAt: TODAY,
};
const mockTasks = [
  { ...base, id: 't1', title: 'Restock the front desk', description: '', status: 'pending' },
  {
    ...base,
    id: 't2',
    title: 'Close the studio',
    description: 'Lights, AC, alarm.',
    status: 'in-progress',
    dueTime: '21:30',
    priority: 'high',
    steps: [
      { id: 's1', title: 'Lights off', isCompleted: true, order: 1 },
      { id: 's2', title: 'Set the alarm', isCompleted: false, order: 2 },
    ],
    completedSteps: ['s1'],
    progressPercentage: 50,
  },
  { ...base, id: 't3', title: 'Water the plants', description: '', status: 'completed', completedSteps: ['__task_complete__'], progressPercentage: 100 },
  { ...base, id: 't4', title: 'Someone else’s task', description: '', status: 'pending', assignedTo: ['other'] },
];

jest.mock('react-router-dom', () => ({ useLocation: () => ({ state: null }) }), { virtual: true });
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ currentUser: { id: 'me' } }) }));
jest.mock('../contexts/SOPContext', () => ({ useSOPs: () => ({ sops: [] }) }));
jest.mock('../contexts/ToastContext', () => ({ useToast: () => ({ success: () => {}, error: () => {} }) }));
jest.mock('../contexts/TaskContext', () => ({
  TASK_COMPLETE_MARKER: '__task_complete__',
  useTask: () => ({ jobTasks: mockTasks, updateJobTask: mockUpdateJobTask }),
}));
jest.mock('../lib/studioDate', () => ({
  studioToday: () => '2026-11-06',
  shiftIsoDays: (iso: string, n: number) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  },
}));

beforeEach(() => {
  mockUpdates.length = 0;
  resolveUpdate = null;
});

test('the list is my task titles and nothing else', () => {
  render(<MyTasksPage />);
  expect(screen.getByText('Restock the front desk')).toBeInTheDocument();
  expect(screen.getByText('Close the studio')).toBeInTheDocument();
  expect(screen.getByText('Water the plants')).toBeInTheDocument();
  expect(screen.queryByText(/Someone else/)).not.toBeInTheDocument();
  // Details stay in the modal until asked for.
  expect(screen.queryByText('Lights, AC, alarm.')).not.toBeInTheDocument();
  expect(screen.queryByText('Set the alarm')).not.toBeInTheDocument();
  // Finished work sinks to its own group.
  const done = screen.getByRole('region', { name: 'Done' });
  expect(within(done).getByText('Water the plants')).toBeInTheDocument();
});

test('ticking a task finishes it, and a second tap starts nothing', async () => {
  render(<MyTasksPage />);
  const box = screen.getByRole('checkbox', { name: 'Mark "Restock the front desk" done' });
  fireEvent.click(box);
  fireEvent.click(box);
  expect(mockUpdates).toHaveLength(1);
  expect(mockUpdates[0]).toMatchObject({
    id: 't1',
    patch: { status: 'completed', completedSteps: ['__task_complete__'], progressPercentage: 100 },
  });
  // Shown ticked straight away (and moved to Done), not after the round trip.
  const done = screen.getByRole('region', { name: 'Done' });
  const ticked = within(done).getByRole('checkbox', { name: 'Mark "Restock the front desk" not done' });
  expect(ticked).toBeChecked();
  expect(ticked).toBeDisabled();
  fireEvent.click(ticked);
  expect(mockUpdates).toHaveLength(1);
  await act(async () => { resolveUpdate?.(); });
});

test('ticking a task with steps finishes every step', () => {
  render(<MyTasksPage />);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Mark "Close the studio" done' }));
  expect(mockUpdates[0].patch).toMatchObject({ status: 'completed', completedSteps: ['s1', 's2'] });
});

test('tapping the title opens the details that were filled in', () => {
  render(<MyTasksPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Open Close the studio' }));
  const dialog = screen.getByRole('dialog', { name: 'Close the studio' });
  expect(within(dialog).getByText('Lights, AC, alarm.')).toBeInTheDocument();
  expect(within(dialog).getByText('Today at 9:30 PM')).toBeInTheDocument();
  expect(within(dialog).getByText('High')).toBeInTheDocument();
  expect(within(dialog).getByText('1 of 2 done')).toBeInTheDocument();
  fireEvent.click(within(dialog).getByLabelText(/Set the alarm/));
  expect(mockUpdates[0].patch).toMatchObject({ completedSteps: ['s1', 's2'], status: 'completed' });
});

test('a title-only task opens as just a title', () => {
  render(<MyTasksPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Open Restock the front desk' }));
  const dialog = screen.getByRole('dialog', { name: 'Restock the front desk' });
  expect(within(dialog).queryByText('Steps')).not.toBeInTheDocument();
  expect(within(dialog).queryByText('Priority')).not.toBeInTheDocument();
  expect(within(dialog).queryByText('Takes about')).not.toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Mark done' }));
  expect(mockUpdates[0]).toMatchObject({ id: 't1', patch: { status: 'completed' } });
});
