import React from 'react';

/**
 * The drawings that sit above an empty state.
 *
 * WHY THEY EXIST
 *
 * `EmptyState` has always accepted an `icon` and the portal has never passed
 * one, so "Nothing posted yet" arrived as a paragraph floating in grey. That is
 * the same visual weight as a page that has failed, on the screens where empty
 * is the NORMAL case — a class with no files, a season before the first
 * announcement. A drawing is what makes the difference legible at a glance:
 * something was made for this state, so this state is expected.
 *
 * THEY CARRY NO COLOUR OF THEIR OWN
 *
 * Every stroke is `currentColor`, and EmptyState renders the slot at
 * txt.tertiary. So they re-theme with the page, they never fight the ~5% pink
 * budget, and there is no second decision to keep in step when the palette
 * moves. `currentColor` is safe as a presentation attribute — the rule in
 * CLAUDE.md is about theme tokens, which are var() strings and would be
 * dropped; this is a plain CSS keyword.
 *
 * NOTHING IS FILLED
 *
 * A filled shape is opaque against whichever background it lands on, so it has
 * to be re-checked in both modes. Outlines do not: the same line reads on
 * #0B0B0D and on the light panel, which is why every icon already in this app
 * is drawn this way.
 *
 * THE VOCABULARY IS THE ONE THAT EXISTS
 *
 * The star and the shoe below are the avatar glyphs from ProfileAvatar, scaled
 * up rather than redrawn. Inventing a second illustration style for the same
 * app is how a set of drawings starts looking like clip art from three places.
 */

/**
 * Three, because three states earn one.
 *
 * Art goes on "nothing exists yet" — the expected, calm empties. It does NOT go
 * on "your filter matched nothing", which is a consequence of something the
 * reader just did: that state wants to stay small and close to the control that
 * caused it, and a drawing there would imply the studio has posted nothing,
 * which is a different and false claim. The compact one-line empties inside the
 * profile's small cards are left alone for the same reason — proportion.
 */
export type EmptyArtName = 'stage' | 'calendar' | 'classes';

interface EmptyArtProps {
  name: EmptyArtName;
  /** Rendered width in px. The drawings are built on a 120×88 box. */
  width?: number;
}

/** ProfileAvatar's star, on its own 24 grid so it can be transformed in place. */
const STAR = 'M12 3.5l2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.9l6-.8z';
/** ProfileAvatar's shoe, likewise. */
const SHOE = 'M3.5 15.5V8h3l2.5 3 3-3h6a3 3 0 013 3v4.5a1 1 0 01-1 1h-15a1 1 0 01-1-1z';

const ART: Record<EmptyArtName, React.ReactNode> = {
  /**
   * A stage: rail, two curtains, a floor, and the star standing on it.
   *
   * For "nothing has been posted" — the announcement screens. The room is
   * ready and nobody has said anything yet, which is exactly the state.
   */
  stage: (
    <>
      <path d="M14 14h92" />
      <path d="M28 14v52q-7 4-14 7V14" />
      <path d="M92 14v52q7 4 14 7V14" />
      <path d="M14 76h92" />
      <g transform="translate(42 26) scale(1.5)" opacity="0.85">
        <path d={STAR} />
      </g>
    </>
  ),

  /** A month with nothing in it. For the calendar's empty state. */
  calendar: (
    <>
      <rect x="26" y="20" width="68" height="56" rx="7" />
      <path d="M26 37h68" />
      <path d="M43 12v13M77 12v13" />
      <path d="M41 50h.01M60 50h.01M79 50h.01M41 63h.01M60 63h.01M79 63h.01" strokeWidth="4" />
    </>
  ),

  /** A shoe on a studio floor. For a schedule with no classes on it. */
  classes: (
    <>
      <g transform="translate(24 22) scale(3)">
        <path d={SHOE} />
      </g>
      <path d="M14 76h92" />
      <path d="M22 84h14M48 84h24M84 84h14" opacity="0.5" />
    </>
  ),
};

/**
 * `aria-hidden` on purpose. Every one of these sits directly above a heading
 * that says the same thing in words, so announcing it a second time is noise —
 * and there is no description of a drawing that beats "Nothing posted yet".
 */
const EmptyArt: React.FC<EmptyArtProps> = ({ name, width = 120 }) => (
  <svg
    width={width}
    height={Math.round((width * 88) / 120)}
    viewBox="0 0 120 88"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
    style={{ display: 'block' }}
  >
    {ART[name]}
  </svg>
);

export default EmptyArt;
