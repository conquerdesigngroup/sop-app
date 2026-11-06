import { suggestedEnd } from './HomeSceneSettings';

describe('suggestedEnd', () => {
  it('ends Christmas scenes on Twelfth Night', () => {
    expect(suggestedEnd('christmas', new Date(2026, 10, 6))).toBe('2027-01-06');
    expect(suggestedEnd('christmas', new Date(2027, 0, 2))).toBe('2027-01-06');
  });

  it('ends Thanksgiving scenes the Sunday after Thanksgiving', () => {
    // Thanksgiving 2026 is Thursday 26 November.
    expect(suggestedEnd('thanksgiving', new Date(2026, 10, 6))).toBe('2026-11-29');
    // Once it has passed, next year's (Thursday 25 November 2027).
    expect(suggestedEnd('thanksgiving', new Date(2026, 11, 1))).toBe('2027-11-28');
  });
});
