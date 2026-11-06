import { HOLIDAY_PACKS, activePackId, packEndsOn, packIsValid } from './holidayPacks';

describe('HOLIDAY_PACKS', () => {
  it('names only scenes and palettes that exist', () => {
    for (const p of HOLIDAY_PACKS) expect(packIsValid(p)).toBe(true);
  });

  it('has unique ids', () => {
    const ids = HOLIDAY_PACKS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('recognises the pack that is on', () => {
    expect(activePackId('moon', 'halloween')).toBe('halloween');
    expect(activePackId('contours', 'electric')).toBe('everyday');
    expect(activePackId('moon', 'electric')).toBeNull();
  });

  it('gives the everyday and recital packs no end date', () => {
    const today = new Date(2026, 10, 6);
    expect(packEndsOn(HOLIDAY_PACKS[0], today)).toBeNull();
    expect(packEndsOn(HOLIDAY_PACKS.find(p => p.id === 'recital')!, today)).toBeNull();
    expect(packEndsOn(HOLIDAY_PACKS.find(p => p.id === 'halloween')!, today)).toBe('2027-11-01');
  });
});
