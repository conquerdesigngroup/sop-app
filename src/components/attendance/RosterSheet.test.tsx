import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import RosterSheet from './RosterSheet';
import { loadRoster, markAttendance } from '../../lib/attendanceStaff';

jest.mock('../../lib/attendanceStaff', () => ({
  loadRoster: jest.fn(),
  markAttendance: jest.fn(),
}));

/**
 * Leaving the register must not lose the last taps.
 *
 * Marks are sent a moment after the last tap, and unmounting cancels that
 * timer — so a teacher who marked the final dancer and tapped Back straight
 * away used to lose that mark without a word.
 */

const day = {
  klass: { id: 'cls', name: 'Jr Ballet 2', dayOfWeek: 2, startTime: null, endTime: null, location: null, level: null, style: null },
  session: { id: 'ses', classId: 'cls', sessionDate: '2026-10-20', status: 'held' as const, source: 'schedule' as const, note: null },
  expected: 1,
  marked: 0,
};

beforeEach(() => {
  (loadRoster as jest.Mock).mockResolvedValue({
    rows: [{ studentId: 'stu', firstName: 'Bo', lastName: 'Marsh', status: null }],
    error: null,
  });
});

it('Back sends a mark made a moment ago, and leaves only once it has landed', async () => {
  let land: (v: { error: null }) => void = () => {};
  (markAttendance as jest.Mock).mockImplementation(() => new Promise(r => { land = r; }));
  const onBack = jest.fn();

  render(<RosterSheet day={day as any} onBack={onBack} onCountChange={() => {}} />);
  fireEvent.click(await screen.findByRole('button', { name: /Mark the remaining 1 present/ }));
  fireEvent.click(screen.getByRole('button', { name: '← Classes' }));

  await waitFor(() => expect(markAttendance).toHaveBeenCalledWith('ses', [{ studentId: 'stu', status: 'present' }]));
  expect(onBack).not.toHaveBeenCalled();
  // A second tap while it waits starts nothing new.
  fireEvent.click(screen.getByRole('button', { name: 'Saving…' }));

  await act(async () => { land({ error: null }); });
  await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
  expect(markAttendance).toHaveBeenCalledTimes(1);
});

it('stays on the register when that save fails, so the marks are not abandoned', async () => {
  (markAttendance as jest.Mock).mockResolvedValue({ error: "Couldn't save. Try again." });
  const onBack = jest.fn();

  render(<RosterSheet day={day as any} onBack={onBack} onCountChange={() => {}} />);
  fireEvent.click(await screen.findByRole('button', { name: /Mark the remaining 1 present/ }));
  fireEvent.click(screen.getByRole('button', { name: '← Classes' }));

  expect(await screen.findByText("Couldn't save. Try again.")).toBeInTheDocument();
  expect(onBack).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: '← Classes' })).toBeEnabled();
});
