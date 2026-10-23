import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import RosterSheet from './RosterSheet';
import { cancelSession, loadRoster, markAttendance, restoreSession } from '../../lib/attendanceStaff';

jest.mock('../../lib/attendanceStaff', () => ({
  loadRoster: jest.fn(),
  markAttendance: jest.fn(),
  cancelSession: jest.fn(),
  restoreSession: jest.fn(),
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

describe('cancelling the class', () => {
  it('confirms, sends the reason, excuses everyone and says so — then undo reopens it', async () => {
    (cancelSession as jest.Mock).mockResolvedValue({ result: { excused: 1, replaced: 0, already: 0 }, error: null });
    (restoreSession as jest.Mock).mockResolvedValue({ restored: 1, error: null });
    const onStatusChange = jest.fn();

    render(<RosterSheet day={day as any} onBack={() => {}} onCountChange={() => {}} onStatusChange={onStatusChange} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel class' }));

    const dialog = screen.getByRole('dialog', { name: 'Cancel this class?' });
    expect(dialog).toHaveTextContent('will be marked Excused');
    fireEvent.change(screen.getByLabelText('Reason (optional)'), { target: { value: 'Power out' } });
    (loadRoster as jest.Mock).mockResolvedValue({
      rows: [{ studentId: 'stu', firstName: 'Bo', lastName: 'Marsh', status: 'excused' }], error: null,
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel class' }));

    expect(await screen.findByText('Class cancelled — Power out')).toBeInTheDocument();
    expect(cancelSession).toHaveBeenCalledWith('ses', 'Power out');
    expect(onStatusChange).toHaveBeenCalledWith('cancelled', 'Power out');
    // Locked: the bulk-mark button is gone while the class is cancelled.
    expect(screen.queryByRole('button', { name: /Mark the remaining/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Undo cancellation' }));
    await waitFor(() => expect(onStatusChange).toHaveBeenLastCalledWith('held', null));
    expect(restoreSession).toHaveBeenCalledWith('ses');
    expect(await screen.findByRole('button', { name: 'Cancel class' })).toBeInTheDocument();
  });

  it('a failed cancel keeps the dialog open, says nothing changed, and leaves the class held', async () => {
    (cancelSession as jest.Mock).mockResolvedValue({ result: null, error: 'You do not teach this class' });
    const onStatusChange = jest.fn();

    render(<RosterSheet day={day as any} onBack={() => {}} onCountChange={() => {}} onStatusChange={onStatusChange} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel class' }));
    const dialog = screen.getByRole('dialog', { name: 'Cancel this class?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel class' }));

    expect(await within(dialog).findByText(/You do not teach this class\. Nothing was changed/)).toBeInTheDocument();
    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it('sends a mark made a moment ago before cancelling, so the order on the server is right', async () => {
    const order: string[] = [];
    (markAttendance as jest.Mock).mockImplementation(async () => { order.push('mark'); return { error: null }; });
    (cancelSession as jest.Mock).mockImplementation(async () => { order.push('cancel'); return { result: { excused: 1, replaced: 1, already: 0 }, error: null }; });

    render(<RosterSheet day={day as any} onBack={() => {}} onCountChange={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: /Mark the remaining 1 present/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel class' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel class' }));

    await waitFor(() => expect(order).toEqual(['mark', 'cancel']));
  });
});

it('review: does not cancel over marks that failed to save, so the teacher is never stuck', async () => {
  (markAttendance as jest.Mock).mockResolvedValue({ error: "Couldn't save. Try again." });
  (cancelSession as jest.Mock).mockClear();

  render(<RosterSheet day={day as any} onBack={() => {}} onCountChange={() => {}} />);
  fireEvent.click(await screen.findByRole('button', { name: /Mark the remaining 1 present/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel class' }));
  const dialog = screen.getByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel class' }));

  expect(await within(dialog).findByText(/the class was not cancelled/)).toBeInTheDocument();
  expect(cancelSession).not.toHaveBeenCalled();
});
