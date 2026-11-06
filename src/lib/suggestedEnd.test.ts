import { suggestedEnd } from './homeScenes';

describe('suggestedEnd', () => {
  const nov6 = new Date(2026, 10, 6);

  it('ends Christmas scenes on Twelfth Night', () => {
    expect(suggestedEnd('christmas', nov6)).toBe('2027-01-06');
    expect(suggestedEnd('christmas', new Date(2027, 0, 2))).toBe('2027-01-06');
  });

  it('ends Thanksgiving scenes the Sunday after Thanksgiving', () => {
    // Thanksgiving 2026 is Thursday 26 November.
    expect(suggestedEnd('thanksgiving', nov6)).toBe('2026-11-29');
    // Once it has passed, next year's (Thursday 25 November 2027).
    expect(suggestedEnd('thanksgiving', new Date(2026, 11, 1))).toBe('2027-11-28');
  });

  it('ends the other holidays the day after, next year once passed', () => {
    expect(suggestedEnd('halloween', nov6)).toBe('2027-11-01');
    expect(suggestedEnd('halloween', new Date(2026, 9, 1))).toBe('2026-11-01');
    expect(suggestedEnd('newyear', nov6)).toBe('2027-01-02');
    expect(suggestedEnd('valentines', nov6)).toBe('2027-02-15');
  });

  it('leaves recital season open-ended', () => {
    expect(suggestedEnd('recital', nov6)).toBeNull();
  });
});
