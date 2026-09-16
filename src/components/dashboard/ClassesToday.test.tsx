import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ClassesToday from './ClassesToday';
import type { AttendanceGap, ClassDay } from '../../lib/attendanceStaff';

/**
 * The dashboard's "Your classes today" card.
 *
 * WHY THIS IS A RENDER TEST
 *
 * The pills themselves are pinned in classesToday.test.ts. What only a render
 * can pin is the card's behaviour around them: that it stays out of the way of
 * everyone who teaches nothing, that a tap goes to the class's register rather
 * than to the list, and that the backlog line counts earlier days only —
 * today's unfinished classes are already the rows above it.
 *
 * The clock is pinned at 17:30 on the studio's clock, so "on now" is decided
 * by the fixture and not by whenever the suite happens to run.
 */

// Only a type comes from here, and react-router-dom 7's ESM does not resolve
// under this jest.
jest.mock('react-router-dom', () => ({}), { virtual: true });

const mockAuth = { currentUser: { id: 'me' }, isAdmin: false };
const mockPortal: { checking: boolean; editableClassIds: string[] } = { checking: false, editableClassIds: ['cls-1', 'cls-2'] };
let mockDay: { days: ClassDay[]; error: string | null } = { days: [], error: null };
let mockGaps: { rows: AttendanceGap[]; error: string | null } = { rows: [], error: null };
const mockCalls: { day: unknown[][]; gaps: unknown[][] } = { day: [], gaps: [] };

jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('../../contexts/PortalAdminContext', () => ({ usePortalAdmin: () => mockPortal }));
jest.mock('../../contexts/RefreshContext', () => ({ useRefreshable: () => undefined }));
// Plain functions, not jest.fn: CRA's jest runs with resetMocks, which would
// strip a jest.fn implementation before every test.
jest.mock('../../lib/attendanceStaff', () => ({
  loadDay: (...args: unknown[]) => { mockCalls.day.push(args); return Promise.resolve(mockDay); },
  loadGaps: (...args: unknown[]) => { mockCalls.gaps.push(args); return Promise.resolve(mockGaps); },
}));
jest.mock('../../lib/studioDate', () => ({
  studioToday: () => '2026-09-16',
  studioClock: () => '17:30',
}));

const classDay = (
  id: string,
  name: string,
  start: string | null,
  end: string | null,
  over: Partial<Pick<ClassDay, 'expected' | 'marked'>> & { status?: ClassDay['session']['status'] } = {},
): ClassDay => ({
  klass: { id, name, dayOfWeek: 3, startTime: start, endTime: end, location: 'Studio B', level: null, style: null },
  session: {
    id: `ses-${id}`, classId: id, sessionDate: '2026-09-16', status: over.status ?? 'held', source: 'schedule', note: null,
  },
  expected: over.expected ?? 12,
  marked: over.marked ?? 0,
});

const gap = (sessionDate: string): AttendanceGap => ({
  classId: 'cls-1', sessionId: `gap-${sessionDate}`, sessionDate, expected: 10, marked: 4, missing: 6,
});

const navigate = jest.fn();
const draw = () => render(<ClassesToday navigate={navigate} />);

beforeEach(() => {
  mockAuth.isAdmin = false;
  mockPortal.checking = false;
  mockPortal.editableClassIds = ['cls-1', 'cls-2'];
  mockDay = { days: [], error: null };
  mockGaps = { rows: [], error: null };
  mockCalls.day = [];
  mockCalls.gaps = [];
});

describe('who gets the card', () => {
  it('draws nothing, and asks for nothing, for someone who holds no class', () => {
    mockPortal.editableClassIds = [];
    const { container } = draw();
    expect(container).toBeEmptyDOMElement();
    expect(mockCalls.day).toHaveLength(0);
  });

  it('draws nothing while the portal check has not answered', () => {
    mockPortal.checking = true;
    const { container } = draw();
    expect(container).toBeEmptyDOMElement();
  });

  it('asks for this person\'s own classes, admins included', async () => {
    // The owner holds classes AND the admin role. 'mine' is what they teach;
    // the whole studio's afternoon is the Attendance page's other toggle.
    mockAuth.isAdmin = true;
    draw();
    await screen.findByText('No classes on your schedule today.');
    expect(mockCalls.day).toEqual([['2026-09-16', 'me', true, 'mine']]);
    expect(mockCalls.gaps).toEqual([[['cls-1', 'cls-2']]]);
  });
});

describe('the day', () => {
  it('shows where each register stands, in the words the pill uses', async () => {
    mockDay.days = [
      classDay('cls-1', 'Mini Hip Hop 1', '16:00:00', '17:00:00', { marked: 12 }),
      classDay('cls-2', 'Jr Ballet 2', '17:20:00', '18:20:00', { marked: 3 }),
      classDay('cls-3', 'Combo', '19:00:00', '20:00:00', { expected: 10 }),
      classDay('cls-4', 'Tiny Tots', '17:00:00', '18:00:00', { status: 'cancelled' }),
    ];
    draw();

    expect(await screen.findByText('Done')).toBeInTheDocument();
    expect(screen.getByText('3 of 12')).toBeInTheDocument();
    expect(screen.getByText('10 dancers')).toBeInTheDocument();
    expect(screen.getByText('Cancelled')).toBeInTheDocument();

    // Only the class actually running says so. Tiny Tots is inside its hour
    // too, but a cancelled class is not "on".
    expect(screen.getAllByText('On now')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /jr ballet 2/i })).toHaveTextContent('On now');
    expect(screen.getByText('5:20 PM – 6:20 PM')).toBeInTheDocument();
  });

  it('opens the class\'s register, not the list it sits in', async () => {
    mockDay.days = [classDay('cls-2', 'Jr Ballet 2', '17:20:00', '18:20:00', { marked: 3 })];
    draw();
    fireEvent.click(await screen.findByRole('button', { name: /jr ballet 2/i }));
    expect(navigate).toHaveBeenCalledWith('/attendance', { state: { openClassId: 'cls-2' } });
  });

  it('names the class, the time and the count to a screen reader', async () => {
    mockDay.days = [classDay('cls-2', 'Jr Ballet 2', '17:20:00', '18:20:00', { marked: 3 })];
    draw();
    expect(await screen.findByRole('button', {
      name: 'Jr Ballet 2, 5:20 PM, on now. 3 of 12 dancers marked. Open the register.',
    })).toBeInTheDocument();
  });

  it('says so on a day with nothing to teach', async () => {
    draw();
    expect(await screen.findByText('No classes on your schedule today.')).toBeInTheDocument();
  });
});

describe('the backlog', () => {
  it('counts earlier unfinished registers and leaves today\'s to the rows', async () => {
    mockDay.days = [classDay('cls-1', 'Mini Hip Hop 1', '16:00:00', '17:00:00', { marked: 4 })];
    mockGaps.rows = [gap('2026-09-16'), gap('2026-09-14'), gap('2026-09-09')];
    draw();
    const backlog = await screen.findByRole('button', { name: /2 earlier classes still need attendance/ });
    fireEvent.click(backlog);
    expect(navigate).toHaveBeenCalledWith('/attendance');
  });

  it('draws no backlog line when today is the only thing unfinished', async () => {
    mockDay.days = [classDay('cls-1', 'Mini Hip Hop 1', '16:00:00', '17:00:00', { marked: 4 })];
    mockGaps.rows = [gap('2026-09-16')];
    draw();
    await screen.findByText('4 of 12');
    expect(screen.queryByText(/earlier class/)).not.toBeInTheDocument();
  });
});

describe('a failed load', () => {
  it('says what went wrong and loads again on Try again', async () => {
    mockDay = { days: [], error: "Couldn't load this." };
    draw();
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load today's classes");

    mockDay = { days: [classDay('cls-1', 'Mini Hip Hop 1', '16:00:00', '17:00:00')], error: null };
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Mini Hip Hop 1')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
