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
 * THE VOCABULARY IS THE ONE THAT EXISTS, WHERE IT SURVIVES THE SCALE
 *
 * The star is ProfileAvatar's own glyph, scaled up rather than redrawn —
 * inventing a second illustration style for one app is how a set of drawings
 * starts looking like clip art from three places.
 *
 * The shoe glyph does NOT survive it, which is worth recording because reusing
 * it is the obvious next idea. It is drawn as a 24px SOLID, and at 3× it reads
 * as a lump whether stroked or filled: the notch that makes it a shoe at avatar
 * size becomes the whole shape at illustration size, and what a reader sees is
 * a sofa. The barre below replaces it. A glyph designed to be recognised at
 * 24px inside a coloured square is not automatically a drawing.
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
const ART: Record<EmptyArtName, React.ReactNode> = {
  /**
   * A stage: rail, two curtains, a floor, and the star standing on it.
   *
   * For "nothing has been posted" — the announcement screens. The room is
   * ready and nobody has said anything yet, which is exactly the state.
   */
  stage: (
    <>
      {/* Rail, then the valance hanging off it. Without the scallops the two
          uprights below read as a plain rectangular frame — which looked
          deliberate but did not look like a stage, and the drawing has one job. */}
      <path d="M12 12h96" />
      <path d="M12 12q12 13 24 0 12 13 24 0 12 13 24 0 12 13 24 0" />
      {/* Side curtains: gathered at the top, falling away at the foot. The
          inner fold line is what stops each one reading as a bar. */}
      <path d="M26 20v44q-7 5-14 7V16" />
      <path d="M94 20v44q7 5 14 7V16" />
      <path d="M20 30v38M100 30v38" opacity="0.45" />
      <path d="M12 76h96" />
      <g transform="translate(42 30) scale(1.5)" opacity="0.9">
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

  /**
   * A barre on a studio floor. For a schedule with no classes on it.
   *
   * Four straight lines and two feet — which is the point. It is the only
   * object in the building that is unmistakable in outline at this size, and it
   * cannot be confused with the calendar above or the stage above that.
   */
  classes: (
    <>
      <path d="M14 32h92" />
      <path d="M32 32v36M88 32v36" />
      <path d="M22 68h20M78 68h20" />
      <path d="M12 76h96" opacity="0.55" />
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
