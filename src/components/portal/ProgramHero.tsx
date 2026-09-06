import React, { useState } from 'react';
import { theme } from '../../theme';

/**
 * The picture at the top of a program's page.
 *
 * IT IS ALLOWED NOT TO EXIST
 *
 * Most of the time there is no picture, and that has to look deliberate rather
 * than like something failed to load. So there is no placeholder, no grey box
 * and no "add an image" prompt on the parent's side — with no hero the page is
 * exactly the page it was before, which is a page that works. Everything below
 * only renders once a URL is in hand.
 *
 * AND IT IS ALLOWED TO FAIL
 *
 * The URL is signed and short-lived, the object can be deleted from the bucket
 * without the row noticing, and a phone can lose the network between the row
 * and the image. Every one of those ends the same way: `onError` unmounts the
 * picture and the page carries on. A broken-image glyph at the top of a
 * program is worse than no picture by some distance.
 *
 * THE ASPECT RATIO IS FIXED AND THE HEIGHT IS RESERVED
 *
 * `aspectRatio` on the frame, not on the image, so the space exists before a
 * byte arrives and the heading below it does not jump when the picture lands.
 * 16:6 rather than something taller because this sits above the content on a
 * phone, and a hero that fills the screen is a hero the reader has to scroll
 * past to reach what they came for.
 *
 * THE SCRIM IS NOT DECORATION
 *
 * A studio uploads whatever photograph it likes and some of them are bright.
 * The gradient at the foot of the frame is what keeps the rounded edge legible
 * against the page in light mode and stops a pale photo glowing against the
 * near-black in dark mode. It is drawn over the picture rather than baked into
 * it so that one file works in both.
 */

interface ProgramHeroProps {
  /** Signed URL. Undefined renders nothing at all. */
  url?: string;
  /** Written by whoever uploaded it; empty marks the picture as decorative. */
  alt: string;
}

const ProgramHero: React.FC<ProgramHeroProps> = ({ url, alt }) => {
  const [broken, setBroken] = useState(false);

  if (!url || broken) return null;

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '16 / 6',
        borderRadius: theme.borderRadius.lg,
        overflow: 'hidden',
        border: `2px solid ${theme.colors.bdr.primary}`,
        // Behind the picture while it decodes, and behind a transparent PNG
        // afterwards. bg.tertiary rather than a literal, so it is the page's
        // own grey in both modes.
        backgroundColor: theme.colors.bg.tertiary,
      }}
    >
      <img
        src={url}
        /* An empty alt is the correct answer for a decorative image — it tells
           a screen reader to skip it rather than announce a filename. The
           studio writing alt text is what turns it into content. */
        alt={alt}
        loading="lazy"
        onError={() => setBroken(true)}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          // Middle-weighted rather than centred: a photograph of dancers has
          // its subject above the midline more often than not, and cropping a
          // 16:6 band out of a 4:3 photo from the centre takes their heads off.
          objectPosition: 'center 35%',
        }}
      />

      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: '38%',
          background: 'linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,0.35))',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};

export default ProgramHero;
