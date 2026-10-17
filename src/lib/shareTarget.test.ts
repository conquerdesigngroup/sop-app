import { prefersShareSheet } from './shareTarget';

/**
 * One rule, and the two ways it is wrong.
 *
 * Reading canShare() as "this is a phone" sends desktops to the share sheet.
 * Reading a coarse pointer as "this can share" sends a file to a browser
 * that will reject it. Both halves, every time.
 */

const coarse = (q: string) => q === '(pointer: coarse)';
const fine = () => false;

const able = { share: async () => undefined, canShare: () => true } as unknown as Navigator;
const unable = { share: async () => undefined, canShare: () => false } as unknown as Navigator;

describe('prefersShareSheet', () => {
  it('is true only on a touch device whose browser takes the file', () => {
    expect(prefersShareSheet('t.pdf', 'application/pdf', able, coarse)).toBe(true);
  });

  it('is false on a desktop that claims it can share', () => {
    // Desktop Chrome and desktop Safari on macOS both do exactly this.
    expect(prefersShareSheet('t.pdf', 'application/pdf', able, fine)).toBe(false);
  });

  it('is false on a touch device whose browser refuses the file type', () => {
    expect(prefersShareSheet('t.pdf', 'application/pdf', unable, coarse)).toBe(false);
  });

  it('is false when the browser has no share API at all', () => {
    expect(prefersShareSheet('t.pdf', 'application/pdf', undefined, coarse)).toBe(false);
    expect(prefersShareSheet('t.pdf', 'application/pdf', {} as Navigator, coarse)).toBe(false);
    expect(prefersShareSheet(
      't.pdf', 'application/pdf', { canShare: () => true } as unknown as Navigator, coarse,
    )).toBe(false);
  });

  it('probes with the name and type the caller will actually share', () => {
    const seen: Array<{ name: string; type: string }> = [];
    const nav = {
      share: async () => undefined,
      canShare: (d: { files?: File[] }) => {
        const f = d.files?.[0];
        seen.push({ name: f?.name ?? '', type: f?.type ?? '' });
        return true;
      },
    } as unknown as Navigator;

    prefersShareSheet('probe.ics', 'text/calendar', nav, coarse);
    prefersShareSheet('probe.mp4', 'video/mp4', nav, coarse);

    expect(seen).toEqual([
      { name: 'probe.ics', type: 'text/calendar' },
      { name: 'probe.mp4', type: 'video/mp4' },
    ]);
  });

  it('never throws out of a click, whatever the browser does', () => {
    const hostile = {
      share: async () => undefined,
      canShare: () => { throw new Error('nope'); },
    } as unknown as Navigator;

    expect(prefersShareSheet('t.pdf', 'application/pdf', hostile, coarse)).toBe(false);
    expect(prefersShareSheet('t.pdf', 'application/pdf', able, () => { throw new Error('nope'); }))
      .toBe(false);
  });
});
