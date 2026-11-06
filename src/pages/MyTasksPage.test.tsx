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
  { ...base, id: 't5', title: 'Open the front doors', description: 'Unlock and turn the sign on.', status: 'pending', dueTime: '08:00' },
  { ...base, id: 't6', title: 'Order tap shoes', description: '', status: 'pending', scheduledDate: '2026-11-04' },
  { ...base, id: 't7', title: 'Recital walkthrough', description: 'With the stage manager.', status: 'pending', scheduledDate: '2026-11-07', dueTime: '10:00' },
];
// 2026-11-06 is a Friday. Every Monday, generated through Sunday the 8th.
const mockSeries = [
  {
    ...base,
    id: 'series-1',
    title: 'Mop Studio A',
    description: 'Before the first class.',
    status: 'pending',
    scheduledDate: '2026-10-01',
    isRecurring: true,
    recurrencePattern: { frequency: 'weekly', daysOfWeek: [1], generatedThrough: '2026-11-08' },
  },
];

jest.mock('react-router-dom', () => ({ useLocation: () => ({ state: null }) }), { virtual: true });
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    currentUser: { id: 'me', firstName: 'Sam', lastName: 'M' },
    users: [{ id: 'me', firstName: 'Sam', lastName: 'M' }, { id: 'other', firstName: 'Amy', lastName: 'K' }],
  }),
}));
jest.mock('../contexts/ToastContext', () => ({
  useToast: () => ({ success: () => {}, error: () => {}, showToast: () => {} }),
}));
jest.mock('../hooks/useGoogleCalendar', () => ({
  useGoogleCalendar: () => ({ isConnected: false, syncTaskToGoogle: () => Promise.resolve(false) }),
}));
jest.mock('../contexts/TaskContext', () => ({
  TASK_COMPLETE_MARKER: '__task_complete__',
  useTask: () => ({ jobTasks: mockTasks, recurringSeries: mockSeries, updateJobTask: mockUpdateJobTask }),
}));
jest.mock('../lib/studioDate', () => ({
  ...jest.requireActual('../lib/studioDate'),
  studioToday: () => '2026-11-06',
}));

beforeEach(() => {
  mockUpdates.length = 0;
  resolveUpdate = null;
});

test('the list is my task titles and what each is for, nothing else', () => {
  render(<MyTasksPage />);
  expect(screen.getByText('Restock the front desk')).toBeInTheDocument();
  expect(screen.getByText('Close the studio')).toBeInTheDocument();
  expect(screen.getByText('Water the plants')).toBeInTheDocument();
  expect(screen.queryByText(/Someone else/)).not.toBeInTheDocument();
  // One line of what it's for; the rest stays in the modal until asked for.
  expect(screen.getByText('Lights, AC, alarm.')).toBeInTheDocument();
  expect(screen.queryByText('Set the alarm')).not.toBeInTheDocument();
  expect(screen.queryByText('High')).not.toBeInTheDocument();
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
  // The same full view a manager gets.
  expect(within(dialog).getByText('Lights, AC, alarm.')).toBeInTheDocument();
  expect(within(dialog).getByText('Friday, November 6, 2026')).toBeInTheDocument();
  expect(within(dialog).getByText('9:30 PM')).toBeInTheDocument();
  expect(within(dialog).getByText('high')).toBeInTheDocument();
  expect(within(dialog).getByText('Sam M')).toBeInTheDocument();
  expect(within(dialog).getByText('1 / 2 steps completed')).toBeInTheDocument();
  expect(within(dialog).getByText('Team Discussion')).toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: /Calendar/ })).toBeInTheDocument();
  fireEvent.click(within(dialog).getByText(/Set the alarm/));
  expect(mockUpdates[0].patch).toMatchObject({ completedSteps: ['s1', 's2'], status: 'completed' });
});

test('a title-only task opens as just a title', () => {
  render(<MyTasksPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Open Restock the front desk' }));
  const dialog = screen.getByRole('dialog', { name: 'Restock the front desk' });
  // Nothing filled in, so nothing shown blank.
  expect(within(dialog).queryByText('Steps')).not.toBeInTheDocument();
  expect(within(dialog).queryByText('Progress')).not.toBeInTheDocument();
  expect(within(dialog).queryByText(/min estimated/)).not.toBeInTheDocument();
  expect(within(dialog).queryByText('No time set')).not.toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Mark done' }));
  expect(mockUpdates[0]).toMatchObject({ id: 't1', patch: { status: 'completed' } });
});

test('it opens on today, in time order, saying what each task is for', () => {
  render(<MyTasksPage />);
  const toDo = screen.getByRole('region', { name: 'To do' });
  const titles = within(toDo).getAllByRole('button', { name: /^Open / }).map(b => b.getAttribute('aria-label'));
  // 8:00 AM, then 9:30 PM, then the untimed one.
  expect(titles).toEqual(['Open Open the front doors', 'Open Close the studio', 'Open Restock the front desk']);
  expect(within(toDo).getByText('Unlock and turn the sign on.')).toBeInTheDocument();
  expect(within(toDo).getByText('8:00 AM')).toBeInTheDocument();
  // Another day's task stays on its own day.
  expect(screen.queryByText('Recital walkthrough')).not.toBeInTheDocument();
});

test('overdue work from earlier days shows on today', () => {
  render(<MyTasksPage />);
  const overdue = screen.getByRole('region', { name: 'Overdue' });
  expect(within(overdue).getByText('Order tap shoes')).toBeInTheDocument();
});

test('the day strip moves to upcoming days', () => {
  render(<MyTasksPage />);
  fireEvent.click(screen.getByRole('button', { name: /^Saturday, November 7/ }));
  expect(screen.getByText('Recital walkthrough')).toBeInTheDocument();
  expect(screen.queryByText('Open the front doors')).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Overdue' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Back to today' }));
  expect(screen.getByText('Open the front doors')).toBeInTheDocument();
});

test('a repeating task shows on every day it lands on, even before it is created', () => {
  render(<MyTasksPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Next week' }));
  // Friday the 13th: not a Monday, so no mop.
  expect(screen.queryByText('Mop Studio A')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /^Monday, November 9/ }));
  expect(screen.getByText('Mop Studio A')).toBeInTheDocument();
  expect(screen.getByText('Repeats')).toBeInTheDocument();
  // Not created yet, so it cannot be ticked off from here.
  expect(screen.getByRole('checkbox', { name: 'Mark "Mop Studio A" done' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Open Mop Studio A' }));
  const dialog = screen.getByRole('dialog', { name: 'Mop Studio A' });
  expect(within(dialog).queryByRole('button', { name: 'Mark done' })).not.toBeInTheDocument();
  // A day already generated (and so deliberately empty) is not filled in.
  expect(within(dialog).queryByPlaceholderText('Add a comment...')).not.toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
  fireEvent.click(screen.getByRole('button', { name: 'Previous week' }));
  fireEvent.click(screen.getByRole('button', { name: /^Monday, November 2/ }));
  expect(screen.queryByText('Mop Studio A')).not.toBeInTheDocument();
});
