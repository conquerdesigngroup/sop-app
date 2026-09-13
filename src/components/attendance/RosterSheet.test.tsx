import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import RosterSheet from './RosterSheet';
import { ClassDay, RosterEntry } from '../../lib/attendanceStaff';

/**
 * Taking a mark back.
 *
 * Every assertion here is about a mistake that used to be permanent. Marks save
 * themselves with no Save button, so there is no moment where a teacher can
 * catch a wrong tap before it lands — which is fine, and only fine because the
 * tap can be taken back afterwards.
 *
 * The one that matters most is "Mark the remaining N present": one tap, N rows,
 * easy to hit on the wrong class. Before this, those N dancers had been
 * UNMARKED, and nothing in the app could return a dancer to unmarked — so N
 * wrong Presents sat in N families' attendance percentages looking exactly like
 * a finished register. That is why the null in these batches is the assertion
 * and not an implementation detail: a clear that silently arrives as some
 * status instead would look like it worked and quietly be wrong.
 */

const mockLoadRoster = jest.fn();
const mockMarkAttendance = jest.fn();

jest.mock('../../lib/attendanceStaff', () => ({
  loadRoster: (...args: unknown[]) => mockLoadRoster(...args),
  markAttendance: (...args: unknown[]) => mockMarkAttendance(...args),
}));

jest.mock('../../contexts/RefreshContext', () => ({
  useRefreshable: () => {},
}));

const DAY: ClassDay = {
  klass: {
    id: 'cls', name: 'All-star Bb', dayOfWeek: 6, startTime: '09:00:00',
    endTime: '10:00:00', location: 'Studio A', level: null, style: 'Hip Hop',
  },
  session: {
    id: 'ses', classId: 'cls', sessionDate: '2026-09-12',
    status: 'held', source: 'schedule', note: null,
  },
  expected: 3,
  marked: 0,
};

const entry = (over: Partial<RosterEntry>): RosterEntry => ({
  studentId: 'stu-1', firstName: 'Malia', lastName: 'Johnson', status: null, ...over,
});

/** Renders and waits out the initial load. */
const show = async (rows: RosterEntry[]) => {
  mockLoadRoster.mockResolvedValue({ rows, error: null });
  const onCountChange = jest.fn();
  render(<RosterSheet day={DAY} onBack={jest.fn()} onCountChange={onCountChange} />);
  await screen.findByText('All-star Bb');
  return { onCountChange };
};

/** The marks sent by the debounced write, after letting it fire. */
const flushed = async (): Promise<{ studentId: string; status: string | null }[]> => {
  await act(async () => { jest.advanceTimersByTime(1000); });
  await waitFor(() => expect(mockMarkAttendance).toHaveBeenCalled());
  return mockMarkAttendance.mock.calls[mockMarkAttendance.mock.calls.length - 1][1];
};

/** Opens one dancer's row so the pills are on screen. */
const openRow = (name: string) => fireEvent.click(screen.getByText(name));

beforeEach(() => {
  jest.useFakeTimers();
  mockLoadRoster.mockReset();
  mockMarkAttendance.mockReset();
  mockMarkAttendance.mockResolvedValue({ result: { written: 1, unchanged: 0, cleared: 0 }, error: null });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('clearing a mark', () => {
  it('sends an explicit null rather than a status', async () => {
    await show([entry({ status: 'absent' })]);

    openRow('Malia Johnson');
    fireEvent.click(screen.getByRole('radio', { name: /clear Malia Johnson/i }));

    expect(await flushed()).toEqual([{ studentId: 'stu-1', status: null }]);
  });

  it('puts the row back to the Not marked chip', async () => {
    const { onCountChange } = await show([entry({ status: 'present' })]);

    openRow('Malia Johnson');
    fireEvent.click(screen.getByRole('radio', { name: /clear Malia Johnson/i }));

    // The count the day list shows must drop too, or the "9 of 9 marked" chip
    // keeps claiming a register is finished after a mark was taken out of it.
    expect(onCountChange).toHaveBeenLastCalledWith(0);
    await waitFor(() => expect(screen.getByText('0 of 1 marked')).toBeInTheDocument());
  });

  it('offers Not marked as the checked option on a dancer nobody has marked', async () => {
    await show([entry({ status: null })]);

    openRow('Malia Johnson');
    expect(screen.getByRole('radio', { name: /Not marked/i })).toHaveAttribute('aria-checked', 'true');
  });
});

describe('undo', () => {
  it('takes back the bulk action, returning every dancer to unmarked', async () => {
    await show([
      entry({ studentId: 'a', firstName: 'Malia', lastName: 'Johnson' }),
      entry({ studentId: 'b', firstName: 'Mia', lastName: 'Ortiz' }),
      entry({ studentId: 'c', firstName: 'Bella', lastName: 'Perez' }),
    ]);

    fireEvent.click(screen.getByRole('button', { name: /Mark the remaining 3 present/i }));
    expect(await flushed()).toEqual([
      { studentId: 'a', status: 'present' },
      { studentId: 'b', status: 'present' },
      { studentId: 'c', status: 'present' },
    ]);

    // The words next to the button are what tell a teacher they hit the wrong
    // class, so they are asserted as well as the button.
    expect(screen.getByText('Marked 3 present.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Undo/i }));

    expect(await flushed()).toEqual([
      { studentId: 'a', status: null },
      { studentId: 'b', status: null },
      { studentId: 'c', status: null },
    ]);
    await waitFor(() => expect(screen.getByText('0 of 3 marked')).toBeInTheDocument());
  });

  it('restores the status a dancer had before, not just blankness', async () => {
    await show([entry({ status: 'late' })]);

    openRow('Malia Johnson');
    fireEvent.click(screen.getByRole('radio', { name: 'Absent' }));
    expect(await flushed()).toEqual([{ studentId: 'stu-1', status: 'absent' }]);

    fireEvent.click(screen.getByRole('button', { name: /^Undo/i }));
    expect(await flushed()).toEqual([{ studentId: 'stu-1', status: 'late' }]);
  });

  it('leaves the dancers the bulk action did not touch alone', async () => {
    await show([
      entry({ studentId: 'a', firstName: 'Malia', lastName: 'Johnson', status: null }),
      // Marked absent on purpose before the bulk tap. Undoing the bulk must not
      // reach her: she was never part of it, and clearing her would erase a
      // decision somebody made deliberately.
      entry({ studentId: 'b', firstName: 'Mia', lastName: 'Ortiz', status: 'absent' }),
    ]);

    fireEvent.click(screen.getByRole('button', { name: /Mark the remaining 1 present/i }));
    await flushed();
    fireEvent.click(screen.getByRole('button', { name: /^Undo/i }));

    expect(await flushed()).toEqual([{ studentId: 'a', status: null }]);
    await waitFor(() => expect(screen.getByText('1 of 2 marked')).toBeInTheDocument());
  });

  it('is spent once used, so it cannot toggle a mark back and forth', async () => {
    await show([entry({ status: 'present' })]);

    openRow('Malia Johnson');
    fireEvent.click(screen.getByRole('radio', { name: 'Absent' }));
    await flushed();

    fireEvent.click(screen.getByRole('button', { name: /^Undo/i }));
    await flushed();

    expect(screen.queryByRole('button', { name: /^Undo/i })).not.toBeInTheDocument();
  });

  it('is not offered before anything has been changed', async () => {
    await show([entry({ status: 'present' })]);
    expect(screen.queryByRole('button', { name: /^Undo/i })).not.toBeInTheDocument();
  });

  it('is not offered for a re-tap that changed nothing', async () => {
    await show([entry({ status: 'present' })]);

    // Scrolling back through a finished list and tapping the value already
    // there is not an action. Offering to undo it would claim to restore
    // something that was never changed.
    openRow('Malia Johnson');
    fireEvent.click(screen.getByRole('radio', { name: 'Present' }));

    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(mockMarkAttendance).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /^Undo/i })).not.toBeInTheDocument();
  });

  it('is never offered on a read-only session', async () => {
    mockLoadRoster.mockResolvedValue({ rows: [entry({ status: 'present' })], error: null });
    render(
      <RosterSheet day={DAY} onBack={jest.fn()} onCountChange={jest.fn()} readOnly />,
    );
    await screen.findByText('All-star Bb');

    expect(screen.queryByRole('button', { name: /Mark the remaining/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Undo/i })).not.toBeInTheDocument();
  });
});
