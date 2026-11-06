import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import WorkHoursPage from './WorkHoursPage';
import { WorkDay } from '../types';

/**
 * Team Schedule: work hours on a scheduled day.
 *
 * The page lets someone mark days AND give each one a start and end time —
 * one default for every new day, overridden per day by tapping it. These
 * pin the three things that can quietly go wrong: the hours that reach the
 * context are the ones the person picked for each date, a half-filled pair
 * never gets saved, and the hours show back on the calendar and can be
 * changed there.
 */

// Plain recorders rather than jest.fn: CRA's jest runs with resetMocks.
const calls = {
  addWorkDays: [] as unknown[][],
  updateWorkDay: [] as unknown[][],
  toasts: [] as [string, string][],
};
let mockWorkDays: WorkDay[] = [];

const mockAuth = {
  isAdmin: false,
  currentUser: { id: 'me', firstName: 'Amy', lastName: 'Moss' },
  users: [{ id: 'me', firstName: 'Amy', lastName: 'Moss', isActive: true }],
};

jest.mock('../contexts/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('../contexts/WorkHoursContext', () => ({
  useWorkHours: () => ({
    workDays: mockWorkDays,
    addWorkDays: (...args: unknown[]) => { calls.addWorkDays.push(args); return Promise.resolve(); },
    updateWorkDay: (...args: unknown[]) => { calls.updateWorkDay.push(args); return Promise.resolve(); },
    deleteWorkDay: () => Promise.resolve(),
    getWorkDaysByDateRange: () => [],
  }),
}));
jest.mock('../contexts/ToastContext', () => ({
  useToast: () => ({ showToast: (msg: string, kind: string) => { calls.toasts.push([msg, kind]); } }),
}));
jest.mock('../hooks/useResponsive', () => ({ useResponsive: () => ({ isMobileOrTablet: false }) }));
jest.mock('../hooks/useConfirm', () => ({ useConfirm: () => ({ confirm: () => Promise.resolve(true), confirmDialog: null }) }));

// The page builds its date keys with toISOString; so do these.
const now = new Date();
const dayKey = (d: number) => new Date(now.getFullYear(), now.getMonth(), d).toISOString().split('T')[0];

/** The enabled (current-month) day button in the Manage Schedule grid. */
const dayButton = (d: number) =>
  screen.getAllByRole('button')
    .find(b => !(b as HTMLButtonElement).disabled && b.textContent?.replace(/[^0-9]/g, '') === String(d))!;

const openManageSchedule = () => {
  fireEvent.click(screen.getByRole('button', { name: /manage schedule/i }));
};

beforeEach(() => {
  calls.addWorkDays = [];
  calls.updateWorkDay = [];
  calls.toasts = [];
  mockWorkDays = [];
});

it('saves the default hours on new days, and a tapped day keeps its own', async () => {
  render(<WorkHoursPage />);
  openManageSchedule();

  fireEvent.change(screen.getByLabelText('Start time for new days'), { target: { value: '09:00' } });
  fireEvent.change(screen.getByLabelText('End time for new days'), { target: { value: '17:00' } });

  // Tap the 15th: its panel starts from the default, then gets a shorter day.
  fireEvent.click(dayButton(15));
  expect((screen.getByLabelText(/^Start time on /) as HTMLSelectElement).value).toBe('09:00');
  fireEvent.change(screen.getByLabelText(/^End time on /), { target: { value: '13:00' } });
  expect(screen.getByText('4 hrs on this day')).toBeInTheDocument();

  fireEvent.click(dayButton(16));
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

  await waitFor(() => expect(calls.addWorkDays).toHaveLength(1));
  const [employee, dates, notes, hoursByDate] = calls.addWorkDays[0];
  expect(employee).toBe('me');
  expect(dates).toEqual([dayKey(15), dayKey(16)]);
  expect(notes).toBeUndefined();
  expect(hoursByDate).toEqual({
    [dayKey(15)]: { startTime: '09:00', endTime: '13:00' },
    [dayKey(16)]: { startTime: '09:00', endTime: '17:00' },
  });
});

it('will not save a start time with no end time', async () => {
  render(<WorkHoursPage />);
  openManageSchedule();

  fireEvent.change(screen.getByLabelText('Start time for new days'), { target: { value: '09:00' } });
  fireEvent.click(dayButton(15));
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

  await waitFor(() => expect(calls.toasts.some(([, kind]) => kind === 'error')).toBe(true));
  expect(calls.toasts.find(([, kind]) => kind === 'error')![0]).toMatch(/end time/i);
  expect(calls.addWorkDays).toHaveLength(0);
});

it('days with no hours still save, without any hours', async () => {
  render(<WorkHoursPage />);
  openManageSchedule();
  fireEvent.click(dayButton(15));
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

  await waitFor(() => expect(calls.addWorkDays).toHaveLength(1));
  expect(calls.addWorkDays[0][3]).toEqual({ [dayKey(15)]: { startTime: '', endTime: '' } });
});

it('shows the hours on the calendar and lets them be changed from the day', async () => {
  const today = new Date().toISOString().split('T')[0];
  mockWorkDays = [{
    id: 'wd1', employeeId: 'me', workDate: today, status: 'scheduled',
    startTime: '09:00', endTime: '17:00', createdBy: 'me', createdAt: today,
  }];
  render(<WorkHoursPage />);

  const chip = screen.getByText('Amy 9a–5p');
  expect(chip).toHaveAttribute('title', 'Amy Moss · 9:00 AM – 5:00 PM');
  fireEvent.click(chip);

  expect(screen.getByText('9:00 AM – 5:00 PM')).toBeInTheDocument();
  const save = screen.getByRole('button', { name: 'Save hours' });
  expect(save).toBeDisabled(); // nothing changed yet

  fireEvent.change(screen.getByLabelText('End'), { target: { value: '18:00' } });
  fireEvent.click(save);

  await waitFor(() => expect(calls.updateWorkDay).toHaveLength(1));
  expect(calls.updateWorkDay[0]).toEqual(['wd1', { startTime: '09:00', endTime: '18:00' }]);
});

it('lists the hours in the Schedule view', () => {
  const today = new Date().toISOString().split('T')[0];
  mockWorkDays = [{
    id: 'wd1', employeeId: 'me', workDate: today, status: 'scheduled',
    startTime: '13:30', endTime: '18:00', createdBy: 'me', createdAt: today,
  }];
  render(<WorkHoursPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Schedule' }));
  const row = screen.getByText('Amy Moss').parentElement!;
  expect(within(row).getByText(/1:30 PM – 6:00 PM/)).toBeInTheDocument();
  expect(within(row).getByText('(4.5 hrs)')).toBeInTheDocument();
});
