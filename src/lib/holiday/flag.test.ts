/**
 * The flag, which fails closed.
 *
 * webpack's DefinePlugin inlines process.env at build time but does not run
 * under jest, so these are real runtime lookups and resetModules re-evaluates
 * the module-level constant each time.
 *
 * The asymmetry being pinned here is the point: exactly three strings turn this
 * on and every other input in the universe leaves the front door alone.
 */

// This file only require()s under resetModules, so it has no import of its
// own — and without one, isolatedModules treats it as a global script.
export {};

const readFlag = (value?: string) => {
  jest.resetModules();
  if (value === undefined) delete process.env.REACT_APP_HOLIDAY;
  else process.env.REACT_APP_HOLIDAY = value;
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  return require('./flag').ACTIVE_HOLIDAY;
};

describe('ACTIVE_HOLIDAY', () => {
  const original = process.env.REACT_APP_HOLIDAY;
  afterAll(() => {
    if (original === undefined) delete process.env.REACT_APP_HOLIDAY;
    else process.env.REACT_APP_HOLIDAY = original;
  });

  it('is off when unset', () => {
    expect(readFlag(undefined)).toBeNull();
  });

  it.each(['', ' ', 'off', 'false', '0', 'none', 'no'])('is off for %p', (v) => {
    expect(readFlag(v)).toBeNull();
  });

  it('is off for a typo rather than guessing what was meant', () => {
    expect(readFlag('haloween')).toBeNull();
    expect(readFlag('xmas')).toBeNull();
  });

  it.each(['halloween', 'thanksgiving', 'christmas'])('accepts %p', (v) => {
    expect(readFlag(v)).toBe(v);
  });

  it('normalises case and stray whitespace from a pasted env value', () => {
    expect(readFlag('Halloween')).toBe('halloween');
    expect(readFlag('  HALLOWEEN  ')).toBe('halloween');
    expect(readFlag('\tChristmas\n')).toBe('christmas');
  });
});
