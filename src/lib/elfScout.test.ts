import {
  ELF_PORTAL_PAGES,
  ELF_STAFF_PAGES,
  elfFoundToday,
  elfIsOut,
  elfPageFor,
  elfPageIndex,
  elfPageKey,
  elfPerchPlan,
  forgetElfFound,
  markElfFound,
} from './elfScout';
import { localDayKey } from './homeScenes';

const days = (from: string, n: number) => {
  const [y, m, d] = from.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => localDayKey(new Date(y, m - 1, d + i)));
};

describe('elfIsOut', () => {
  it('is off without a setting or when disabled', () => {
    expect(elfIsOut(null, '2026-12-01')).toBe(false);
    expect(elfIsOut({ enabled: false, endsOn: null, onPortal: false }, '2026-12-01')).toBe(false);
  });
  it('goes home the morning after the last day', () => {
    const s = { enabled: true, endsOn: '2026-12-25', onPortal: false };
    expect(elfIsOut(s, '2026-12-25')).toBe(true);
    expect(elfIsOut(s, '2026-12-26')).toBe(false);
    expect(elfIsOut({ ...s, endsOn: null }, '2027-03-01')).toBe(true);
  });
});

describe('daily hiding place', () => {
  it('never hides on the same page two days running', () => {
    for (const audience of ['staff', 'portal'] as const) {
      const run = days('2026-11-20', 60).map(d => elfPageIndex(d, audience));
      run.slice(1).forEach((p, i) => expect(p).not.toBe(run[i]));
    }
  });
  it('visits every staff page over a season', () => {
    const seen = new Set(days('2026-11-25', 40).map(d => elfPageFor(d, 'staff').key));
    expect(seen.size).toBe(ELF_STAFF_PAGES.length);
  });
  it('is the same for everyone on a given day', () => {
    expect(elfPageFor('2026-12-03', 'staff')).toEqual(elfPageFor('2026-12-03', 'staff'));
    expect(elfPerchPlan('2026-12-03', 'staff', 5)).toEqual(elfPerchPlan('2026-12-03', 'staff', 5));
  });
  it('picks a perch that exists, sitting within the card', () => {
    for (const d of days('2026-12-01', 30)) {
      for (const n of [1, 3, 12]) {
        const p = elfPerchPlan(d, 'portal', n);
        expect(p.index).toBeGreaterThanOrEqual(0);
        expect(p.index).toBeLessThan(n);
        expect(p.along).toBeGreaterThanOrEqual(0.12);
        expect(p.along).toBeLessThanOrEqual(0.88);
      }
    }
  });
});

describe('elfPageKey', () => {
  it('knows the staff pages and nothing else', () => {
    expect(elfPageKey('/calendar', 'staff')).toBe('calendar');
    expect(elfPageKey('/calendar/', 'staff')).toBe('calendar');
    expect(elfPageKey('/hours', 'staff')).toBeNull();
  });
  it('maps portal pages for any program', () => {
    expect(elfPageKey('/portal', 'portal')).toBe('portal');
    expect(elfPageKey('/portal/academy', 'portal')).toBe('program');
    expect(elfPageKey('/portal/allstars/classes', 'portal')).toBe('classes');
    expect(elfPageKey('/portal/academy/classes/abc', 'portal')).toBeNull();
    expect(elfPageKey('/portal/profile', 'portal')).toBeNull();
    ELF_PORTAL_PAGES.forEach(p => expect(typeof p.label).toBe('string'));
  });
});

describe('found today', () => {
  it('stays found for the day only', () => {
    forgetElfFound();
    expect(elfFoundToday('2026-12-02')).toBe(false);
    markElfFound('2026-12-02');
    expect(elfFoundToday('2026-12-02')).toBe(true);
    expect(elfFoundToday('2026-12-03')).toBe(false);
  });
});
