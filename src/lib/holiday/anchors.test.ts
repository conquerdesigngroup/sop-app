import { createAnchorSource, unionRect } from './anchors';

/**
 * The anchor plumbing.
 *
 * jsdom reports every getBoundingClientRect as zero, so there is no point
 * asserting geometry here. What IS worth pinning is the wiring, because that is
 * what actually breaks: names resolving to the right elements, the fallback
 * path that makes this layer safe to mount on a page with no anchors at all,
 * and picking up elements that mount after the source was created.
 */

const anchor = (name: string) => {
  const el = document.createElement('div');
  el.dataset.holidayAnchor = name;
  document.body.appendChild(el);
  return el;
};

describe('createAnchorSource', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('finds elements by their anchor name', () => {
    anchor('staff');
    anchor('dancer');
    const src = createAnchorSource();
    const stage = src.read();

    expect(stage.anchor('staff')).not.toBeNull();
    expect(stage.anchor('dancer')).not.toBeNull();
    src.dispose();
  });

  it('returns null for a name the page never published', () => {
    anchor('staff');
    const src = createAnchorSource();
    expect(src.read().anchor('logo')).toBeNull();
    src.dispose();
  });

  it('falls back rather than failing, so any page can mount the layer', () => {
    // No anchors at all — a portal page, or a page nobody has wired up yet.
    const src = createAnchorSource();
    const fallback = { x: 10, y: 20, w: 30, h: 40 };
    expect(src.read().anchorOr('staff', fallback)).toBe(fallback);
    src.dispose();
  });

  it('prefers a real anchor over the fallback when one exists', () => {
    anchor('staff');
    const src = createAnchorSource();
    const fallback = { x: 10, y: 20, w: 30, h: 40 };
    expect(src.read().anchorOr('staff', fallback)).not.toBe(fallback);
    src.dispose();
  });

  it('picks up an element that mounts later', () => {
    const src = createAnchorSource();
    expect(src.read().anchor('late')).toBeNull();

    anchor('late');
    // A resize is one of the things that invalidates the cache; without a
    // re-query a late-mounting element would be missed for the page's lifetime.
    window.dispatchEvent(new Event('resize'));

    expect(src.read().anchor('late')).not.toBeNull();
    src.dispose();
  });

  it('reports compact below the tile-sizing breakpoint, matching isMobileOrTablet', () => {
    const src = createAnchorSource();
    (window as { innerWidth: number }).innerWidth = 390;
    window.dispatchEvent(new Event('resize'));
    expect(src.read().compact).toBe(true);

    (window as { innerWidth: number }).innerWidth = 1024;
    window.dispatchEvent(new Event('resize'));
    expect(src.read().compact).toBe(false);
    src.dispose();
  });

  it('survives a page with no ResizeObserver', () => {
    // jsdom has none, which is exactly the environment being proven here.
    expect(() => {
      const src = createAnchorSource();
      src.read();
      src.dispose();
    }).not.toThrow();
  });

  it('stops listening once disposed', () => {
    const remove = jest.spyOn(window, 'removeEventListener');
    createAnchorSource().dispose();
    const removed = remove.mock.calls.map((c) => c[0]);
    expect(removed).toEqual(expect.arrayContaining(['scroll', 'resize', 'orientationchange']));
    remove.mockRestore();
  });
});

describe('unionRect', () => {
  it('spans both rects, which is what stages the zombie across the pair', () => {
    const a = { x: 10, y: 100, w: 50, h: 80 };
    const b = { x: 100, y: 90, w: 40, h: 100 };
    expect(unionRect(a, b)).toEqual({ x: 10, y: 90, w: 130, h: 100 });
  });

  it('is unchanged when one rect contains the other', () => {
    const big = { x: 0, y: 0, w: 100, h: 100 };
    const small = { x: 20, y: 20, w: 10, h: 10 };
    expect(unionRect(big, small)).toEqual(big);
  });
});
