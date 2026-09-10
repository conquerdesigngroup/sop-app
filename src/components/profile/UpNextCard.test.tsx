import React from 'react';
import { render, screen } from '@testing-library/react';
import UpNextCard from './UpNextCard';
import { ProfileContext } from '../../lib/profileCards';

/**
 * "On now" is a claim a parent reads while deciding whether to set off for
 * pickup, so what it says and when it says it both matter.
 *
 * WHY THIS IS A RENDER TEST AND NOT A SCREENSHOT
 *
 * The demo fixture pins its clock to noon and every class runs in the
 * afternoon, so no amount of clicking through the demo produces this state —
 * it cannot be reached by looking. The maths is pinned separately in
 * upcomingClasses.test.ts; this pins what the card actually puts on screen.
 *
 * THE DOT IS NEVER THE ONLY SIGNAL
 *
 * index.css freezes animations under prefers-reduced-motion, so the pulsing
 * dot lands on a still frame. Every assertion below is on the WORDS, which is
 * the half that has to survive that.
 */

const CLASS = {
  id: 'cls', name: 'Mini Hip Hop 1', style: 'Hip Hop', category: 'academy',
  dayOfWeek: 4, startTime: '16:00:00', endTime: '17:00:00',
  seasonStart: '2026-08-31', seasonEnd: '2027-06-20',
  location: 'Studio 2', instructorName: 'Ky’ree Nevels',
  level: null, whatToBring: null,
} as any;

const mockStudent = { id: 'stu', firstName: 'Ava', lastName: 'Zuppardo', displayName: null } as any;

const item = (startsAt: Date, endsAt: Date | null) => ({
  student: mockStudent,
  klass: CLASS,
  enrollment: { id: 'enr', studentId: 'stu', classId: 'cls', status: 'active' } as any,
  date: '2026-09-10',
  startsAt,
  endsAt,
});

let mockUpcoming: ReturnType<typeof item>[] = [];

jest.mock('./useHousehold', () => ({
  useHousehold: () => ({
    data: { students: [mockStudent], upcoming: mockUpcoming, perStudent: [], series: [], cancelledByClass: {}, enrolledClassIds: [], memberType: 'guardian', error: null },
    loading: false,
    error: null,
    reload: jest.fn(),
  }),
}));

const ctx = { source: { source: 'live' }, memberType: 'guardian', isStaff: false, hasHousehold: true, flags: { unlockables: false } } as ProfileContext;

const draw = () => render(
  <UpNextCard ctx={ctx} firstName="Tony" lastName="Z" email="t@example.com" />,
);

describe('a class that is happening right now', () => {
  afterEach(() => jest.useRealTimers());

  const runNow = () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 8, 10, 16, 30, 0));
    mockUpcoming = [item(new Date(2026, 8, 10, 16, 0), new Date(2026, 8, 10, 17, 0))];
  };

  it('says so, and says when it ends', () => {
    runNow();
    draw();
    expect(screen.getByText(/On now/)).toBeInTheDocument();
    expect(screen.getByText(/ends 5:00 PM/)).toBeInTheDocument();
  });

  it('draws the pulsing dot beside it', () => {
    runNow();
    const { container } = draw();
    expect(container.querySelector('.live-dot')).not.toBeNull();
  });

  it('fills the bar to how far through the class is', () => {
    runNow();
    const { container } = draw();
    // Half past four in a four-to-five class.
    const fill = container.querySelector('[style*="width: 50%"]');
    expect(fill).not.toBeNull();
  });
});

describe('a class that is not running', () => {
  afterEach(() => jest.useRealTimers());

  it('keeps the ordinary day and time, with no dot and no bar', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 8, 10, 9, 0, 0));
    mockUpcoming = [item(new Date(2026, 8, 10, 16, 0), new Date(2026, 8, 10, 17, 0))];

    const { container } = draw();
    expect(screen.queryByText(/On now/)).toBeNull();
    expect(screen.getByText(/4:00 PM/)).toBeInTheDocument();
    expect(container.querySelector('.live-dot')).toBeNull();
  });

  /**
   * The card deliberately keeps a running class on screen, so a started class
   * with no end time tells us it BEGAN, not that it is still going.
   */
  it('will not claim "On now" for a class with no end time', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 8, 10, 16, 30, 0));
    mockUpcoming = [item(new Date(2026, 8, 10, 16, 0), null)];

    const { container } = draw();
    expect(screen.queryByText(/On now/)).toBeNull();
    expect(container.querySelector('.live-dot')).toBeNull();
  });
});
