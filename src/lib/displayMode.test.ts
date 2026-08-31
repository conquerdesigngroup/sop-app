import { detectDisplayMode, detectPlatform, shouldPing } from './displayMode';

/**
 * Platform and display-mode detection.
 *
 * Worth testing because both are the kind of code that rots invisibly: a UA
 * string changes, every iPad silently becomes a desktop, and the install-rate
 * number quietly drops — with no error anywhere and no way to tell the drop
 * from parents genuinely uninstalling. The whole point of the measurement is to
 * decide whether to build push, so a wrong number is worse than no number.
 */

// Real user agent shapes, trimmed. The versions matter less than the tokens.
const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  ipadOld: 'Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1',
  // iPadOS 13+ claims to be a Mac. This is the trap.
  ipadModern: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
};

describe('detectPlatform', () => {
  it('recognises an iPhone', () => {
    expect(detectPlatform(UA.iphone, 5)).toBe('ios');
  });

  it('recognises an older iPad that still says iPad', () => {
    expect(detectPlatform(UA.ipadOld, 5)).toBe('ios');
  });

  it('recognises a modern iPad despite it claiming to be a Mac', () => {
    // The regression this guards: without the touch-point check this returns
    // 'desktop', and every iPad disappears from the iOS install rate.
    expect(detectPlatform(UA.ipadModern, 5)).toBe('ios');
  });

  it('does not mistake a real Mac for an iPad', () => {
    expect(detectPlatform(UA.mac, 0)).toBe('desktop');
  });

  it('recognises Android', () => {
    expect(detectPlatform(UA.android, 5)).toBe('android');
  });

  it('recognises Windows', () => {
    expect(detectPlatform(UA.windows, 0)).toBe('desktop');
  });

  it('falls back to other rather than guessing', () => {
    expect(detectPlatform('some-unknown-agent', 0)).toBe('other');
  });

  it('survives an empty user agent', () => {
    expect(detectPlatform('', 0)).toBe('other');
  });
});

describe('detectDisplayMode', () => {
  const never = () => false;
  const matches = (wanted: string) => (query: string) => query.includes(wanted);

  it('reports a plain tab as browser', () => {
    expect(detectDisplayMode(never, false)).toBe('browser');
  });

  it('trusts the standard display-mode query', () => {
    expect(detectDisplayMode(matches('standalone'), false)).toBe('standalone');
  });

  it("trusts Apple's non-standard flag when the media query is unavailable", () => {
    // Older iOS: navigator.standalone is the only signal there is.
    expect(detectDisplayMode(never, true)).toBe('standalone');
  });

  it('counts fullscreen and minimal-ui as installed', () => {
    expect(detectDisplayMode(matches('fullscreen'), false)).toBe('standalone');
    expect(detectDisplayMode(matches('minimal-ui'), false)).toBe('standalone');
  });

  it('does not throw when matchMedia is hostile', () => {
    const throwing = () => { throw new Error('nope'); };
    expect(() => detectDisplayMode(throwing as unknown as (q: string) => boolean, false)).not.toThrow();
  });
});

describe('shouldPing', () => {
  it('pings once for a given day', () => {
    expect(shouldPing(() => null, '2026-08-31')).toBe(true);
    expect(shouldPing(() => '2026-08-31', '2026-08-31')).toBe(false);
  });

  it('pings again the next day', () => {
    expect(shouldPing(() => '2026-08-30', '2026-08-31')).toBe(true);
  });
});
