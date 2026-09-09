import React, { useId } from 'react';
import {
  AvatarConfig,
  AvatarIconKey,
  AvatarPattern,
  AvatarShape,
  paletteEntry,
} from '../../lib/avatarPalette';

/**
 * The avatar, drawn as SVG rather than fetched as an image (§5.2).
 *
 * An <img> would mean a storage bucket, a CDN path, a broken-image state and a
 * loading flash on every card. A shape and two letters need none of that: it
 * renders instantly, scales to any size without a second asset, and re-themes
 * with the page because the colours are props.
 *
 * ONE RENDERER, THREE CALLERS
 *
 * Families, dancers and teacher marks all come through here — see
 * TeacherAvatar, which is this component with a different source of config.
 * That is why every visual decision lives in this file and none of them live in
 * a caller: an icon added here appears on all three surfaces at once.
 *
 * THE IDS MUST BE PER-INSTANCE
 *
 * Patterns are clipped to the tile, and a clipPath is addressed by id. A
 * dashboard draws six of these at once and an SVG id is document-global, so a
 * hard-coded id means every avatar on the page clips to the FIRST one's shape —
 * which looks fine until somebody picks a circle and squares appear elsewhere.
 * useId is per-instance and stable across a re-render.
 */

/**
 * 24x24 filled paths, drawn at translate(12 12) inside the 48x48 tile.
 *
 * MULTIPLE SUBPATHS, ONE STRING
 *
 * A figure needs a head separated from a body, so most of these are several
 * subpaths in one `d`. That is deliberate rather than a nested <g> per icon:
 * the renderer stays one <path> and the whole set stays a lookup table.
 *
 * DRAWN FOR 24px, NOT FOR 200px
 *
 * A teacher mark on a class card is about 30px on the tile, so the glyph is
 * around 15px of actual ink. Every one of these is therefore a silhouette with
 * one idea in it. Detail that only reads at the size of the picker is detail
 * that is wrong on the surface the icon is actually used on.
 */
/**
 * Icons whose detail is CUT OUT rather than drawn.
 *
 * A mirror ball's facets are the tile showing through, not marks on top of it,
 * and one path cannot paint two colours. evenodd turns overlapping subpaths
 * into holes without depending on which direction each was wound, which
 * nonzero does — and getting a winding direction wrong silently fills the whole
 * shape solid. Applied per icon rather than globally because the concentric
 * circles in vinyl, trophy and diamond are already wound to work under nonzero.
 */
const EVENODD_ICONS = new Set<AvatarIconKey>([
  'disco', 'speaker', 'medal', 'ticket', 'pointe', 'bowler', 'sneaker', 'tutu',
]);

const ICON_PATHS: Record<AvatarIconKey, string> = {
  // --- Classic. Unchanged from the original six. ---------------------------
  star: 'M12 3.5l2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.9l6-.8z',
  bolt: 'M13.5 2.5L5.5 13.5h5l-1 8 8-11h-5z',
  heart: 'M12 20.5S3.5 15 3.5 9.2a4.7 4.7 0 018.5-2.8 4.7 4.7 0 018.5 2.8c0 5.8-8.5 11.3-8.5 11.3z',
  note: 'M9 18.5a2.5 2.5 0 11-2.5-2.5c.6 0 1.1.2 1.5.5V4l10-2v12.5a2.5 2.5 0 11-2.5-2.5c.6 0 1.1.2 1.5.5V6L9 7.6z',
  shoe: 'M3.5 15.5V8h3l2.5 3 3-3h6a3 3 0 013 3v4.5a1 1 0 01-1 1h-15a1 1 0 01-1-1z',
  flame: 'M12 2.5s5.5 4.6 5.5 9.5a5.5 5.5 0 11-11 0c0-2.2 1.2-3.9 2.3-5 0 1.6.9 2.6 1.9 2.6 1.4 0 2.1-1.4 1.8-3.3a9 9 0 00-.5-1.8z',

  // --- Styles. The thing you wear or carry, drawn large. ------------------
  // Pointe shoe: vamp, a FLAT toe box, and two ribbons. The flat base is the
  // whole difference between a pointe shoe and a bell.
  pointe: 'M12 4.6c2.7 0 4.6 2 4.9 4.8l.6 5.6c.1 1.2-.8 2.2-2 2.2H8.5c-1.2 0-2.1-1-2-2.2l.6-5.6C7.4 6.6 9.3 4.6 12 4.6zM8.2 18.4h7.6v2.6H8.2zM7.5 10.1l9 3.5-.5 1.3-9-3.5zM16.5 10.1l-9 3.5.5 1.3 9-3.5z',
  // Tap shoe: a jazz shoe with the two tap plates picked out beneath it.
  tapshoe: 'M3.4 14.2V7.6h2.9l2.4 2.8 2.9-2.8h5.9a3 3 0 013 3v3.6a1 1 0 01-1 1h-15a1 1 0 01-1-.8zM4.4 17.2h4.2v2.4H4.4zM13.4 17.2h6.2v2.4h-6.2z',
  // High top: the ankle collar and the thick sole are the whole silhouette.
  sneaker: 'M2.6 16.2c0-2.2 1.2-4.2 3.2-5.2l2.6-1.3V4.4c0-.8.7-1.5 1.5-1.5h2.4c.8 0 1.5.7 1.5 1.5v5.1l4.6 1.8c1.9.7 3.1 2.5 3.1 4.5v1.6a1 1 0 01-1 1H3.6a1 1 0 01-1-1zM2.6 19.4h18.8v2H2.6zM9.4 5.6h4.6v1.3H9.4zM9.4 7.9h4.6v1.3H9.4z',
  // Snapback: flat brim, high crown, button on top.
  cap: 'M12 3.2c3.9 0 7 2.9 7.3 6.6l.1 1.2H4.6l.1-1.2C5 6.1 8.1 3.2 12 3.2zM11.1 1.4h1.8v1.8h-1.8zM3.4 12.6h10.2v2.1c0 .9.7 1.6 1.6 1.6h5.4v2.1h-5.4a3.7 3.7 0 01-3.7-3.7v-.1H3.4z',
  // Bowler: the jazz hat, brim wider than the crown.
  bowler: 'M12 4.2c2.7 0 4.6 2.4 4.9 5.5l.1 1.2c2 .5 3.2 1.4 3.2 2.4 0 1.7-3.6 3-8.2 3s-8.2-1.3-8.2-3c0-1 1.2-1.9 3.2-2.4l.1-1.2C7.4 6.6 9.3 4.2 12 4.2zM6.6 11.2h10.8v1.7H6.6z',
  // Jazz hands: one splayed hand, fingers separated.
  jazzhands: 'M11.1 2.3h1.8v7h-1.8zM7.8 3.6l1.7-.5 1.8 6.1-1.7.5zM14.5 3.1l1.7.5-1.8 6.1-1.7-.5zM5.1 6.3l1.4-1.1 3.4 4.6-1.4 1.1zM18.9 6.3l-1.4-1.1-3.4 4.6 1.4 1.1zM7.9 10.4h8.2a3.4 3.4 0 013.4 3.4c0 4.3-2.8 8-7.5 8s-7.5-3.7-7.5-8a3.4 3.4 0 013.4-3.4z',
  // Ribbon on a handle. A thick band, not a hairline — the first draft simply
  // vanished at 28px.
  ribbon: 'M2.4 21.6l1.7-1.7 2.3 2.3-1.7 1.7zM5.8 21c4.3-2.4 5.7-5.4 4.3-8.9-1.6-4.1.9-8.6 7.5-10.9l.8 2.3c-5.2 1.8-7.1 5-5.7 8.4 1.7 4.1-.1 7.9-5.4 10.9z',
  // Tutu: bodice, then a skirt disc wider than anything else in the tile.
  tutu: 'M9.6 3.2h4.8l.8 5.6H8.8zM12 8.2c5 0 9.6 2.6 9.6 4.4 0 1.4-4.3 2.4-9.6 2.4S2.4 14 2.4 12.6c0-1.8 4.6-4.4 9.6-4.4zM8.9 9h6.2v1.3H8.9z',

  // --- Stage. -------------------------------------------------------------
  boombox: 'M6.6 2.6l1 1.9 8.8 0 1-1.9 1.7.9-.6 1.1h1.9a2 2 0 012 2v10a2 2 0 01-2 2H3.6a2 2 0 01-2-2v-10a2 2 0 012-2h1.9l-.6-1.1zM7.4 9.1a3.3 3.3 0 100 6.6 3.3 3.3 0 000-6.6zm9.2 0a3.3 3.3 0 100 6.6 3.3 3.3 0 000-6.6zM12 9.4h1.6v1.8H12zm0 3.2h1.6v1.8H12z',
  headphones: 'M12 2.2c5 0 9 4 9 9v6.6a3.2 3.2 0 01-3.2 3.2h-1.4a1 1 0 01-1-1v-6.2a1 1 0 011-1h2.6v-1.6a7 7 0 00-14 0v1.6h2.6a1 1 0 011 1V20a1 1 0 01-1 1H6.2A3.2 3.2 0 013 17.8V11.2c0-5 4-9 9-9z',
  mic: 'M12 1.8a3.4 3.4 0 013.4 3.4v5.6a3.4 3.4 0 01-6.8 0V5.2A3.4 3.4 0 0112 1.8zM5.6 10.2h1.9a4.5 4.5 0 009 0h1.9a6.4 6.4 0 01-5.4 6.3v3.1h2.8v1.9H8.2v-1.9H11v-3.1a6.4 6.4 0 01-5.4-6.3z',
  // Facets are HOLES cut with evenodd, so the tile colour shows through as the
  // mirror lines. A solid circle on a string reads as a yo-yo.
  disco: 'M11.1 1h1.8v2.7h-1.8zM12 3.9a9 9 0 110 18 9 9 0 010-18zM3.5 11.7h17v1.3h-17zM4.7 7.6h14.6v1.3H4.7zM4.7 15.9h14.6v1.3H4.7zM11.4 4h1.3v17.8h-1.3zM7.3 5h1.2v15.6H7.3zM15.5 5h1.2v15.6h-1.2z',
  vinyl: 'M12 1.8a11.2 11.2 0 110 22.4 11.2 11.2 0 010-22.4zm0 2.4a8.8 8.8 0 100 17.6 8.8 8.8 0 000-17.6zm0 3.6a5.2 5.2 0 110 10.4 5.2 5.2 0 010-10.4zm0 3.7a1.5 1.5 0 100 3 1.5 1.5 0 000-3z',
  // A mount, a lamp, then a GAP before the beam. Without the gap the lamp and
  // the beam fuse into one shape and it reads as a dress.
  spotlight: 'M2.6 2.8l4.8-2 3 7.2-4.8 2a1.5 1.5 0 01-2-.8L1.8 4.8a1.5 1.5 0 01.8-2zM8.8 9.4l3.3-1.4 9.9 11.6-13.6 2.6z',
  curtain: 'M1.8 1.8h20.4v2.4H1.8zM3.2 4.8h6.2v13.9c0 1.6-1.4 2.9-3.1 2.9s-3.1-1.3-3.1-2.9zM14.6 4.8h6.2v13.9c0 1.6-1.4 2.9-3.1 2.9s-3.1-1.3-3.1-2.9z',
  // Cones cut with evenodd, same reasoning as the mirror ball.
  speaker: 'M4.6 1.6h14.8a2 2 0 012 2v16.8a2 2 0 01-2 2H4.6a2 2 0 01-2-2V3.6a2 2 0 012-2zM12 11.6a4.2 4.2 0 100 8.4 4.2 4.2 0 000-8.4zM12 4.2a2.3 2.3 0 100 4.6 2.3 2.3 0 000-4.6z',

  // --- Fun. ---------------------------------------------------------------
  crown: 'M2.6 7.4l4.2 3.2L12 3.2l5.2 7.4 4.2-3.2-1.7 11H4.3zM4.6 21.4h14.8v1.8H4.6z',
  trophy: 'M7 2.4h10v1.6h3.6v2.8a4.6 4.6 0 01-4 4.6 5.1 5.1 0 01-3.7 3.2v2.6h3.3v1.9H7.8v-1.9h3.3v-2.6a5.1 5.1 0 01-3.7-3.2 4.6 4.6 0 01-4-4.6V4H7zM7 6h-2.6v.8a2.7 2.7 0 002.6 2.7zm10 0v3.5a2.7 2.7 0 002.6-2.7V6zM6.4 20.6h11.2v1.9H6.4z',
  sparkle: 'M12 1.6l1.9 6.1 6.1 1.9-6.1 1.9L12 17.6l-1.9-6.1L4 9.6l6.1-1.9zM19 15.4l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9zM5 14.2l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z',
  rocket: 'M12 1.6c3.2 2.4 5.1 6 5.1 10.2v2.4l2.4 2.9v3.4l-3.9-1.9-.9 2.4H9.3l-.9-2.4-3.9 1.9v-3.4l2.4-2.9v-2.4c0-4.2 1.9-7.8 5.1-10.2zm0 5.4a2.3 2.3 0 100 4.6 2.3 2.3 0 000-4.6z',
  shades: 'M2.2 6.4h19.6v2.2l-1 .3-.7 5.2a3.6 3.6 0 01-3.6 3.1h-1a3.6 3.6 0 01-3.5-2.8l-.4-1.9-.4 1.9a3.6 3.6 0 01-3.5 2.8h-1a3.6 3.6 0 01-3.6-3.1L2.4 9l-.2-.1z',
  diamond: 'M7.4 2.6h9.2l4.8 5.6L12 21.4 2.6 8.2zM8.6 8.2L12 17.9l3.4-9.7zM6.4 8.2H4.9l3 4.2zm11.2 0h1.5l-3 4.2zM8.5 4.5L6.8 6.4h2.4zm7 0l1.7 1.9h-2.4z',
  // Star cut out of the disc with evenodd, so the medal reads as struck metal
  // rather than as a badge with a sticker on it.
  medal: 'M7.4 1.4l3.3 6.1-2.6 1.4-3.5-6.3zM16.6 1.4l-3.3 6.1 2.6 1.4 3.5-6.3zM12 8.4a6.9 6.9 0 110 13.8 6.9 6.9 0 010-13.8zM12 11.3l1.2 2.5 2.8.4-2 2 .5 2.8-2.5-1.3-2.5 1.3.5-2.8-2-2 2.8-.4z',
  ticket: 'M1.8 7.2h20.4v3.1a2.3 2.3 0 000 4.6v3.1H1.8v-3.1a2.3 2.3 0 000-4.6zM15.6 8.6h1.2v2.1h-1.2zM15.6 12h1.2v2.1h-1.2zM15.6 15.4h1.2v2.1h-1.2z',
};

/** The tile outline. `rounded` must reproduce the original rx="16" exactly. */
const shapePath = (shape: AvatarShape): { rx: number } | { d: string } => {
  if (shape === 'circle') return { rx: 24 };
  if (shape === 'squircle') {
    // A superellipse rather than a smaller radius: the corner is continuous,
    // which is what makes it read as a different shape and not as a rounded
    // rect somebody set slightly wrong.
    return { d: 'M24 0c17.2 0 24 6.8 24 24s-6.8 24-24 24S0 41.2 0 24 6.8 0 24 0z' };
  }
  return { rx: 16 };
};

/**
 * The texture, drawn in `alt` and clipped to the tile.
 *
 * Every one of these sits UNDER the letter or glyph, so they are deliberately
 * low-frequency: a pattern with detail near the size of the initials competes
 * with them, and the initials have to win.
 */
const Pattern: React.FC<{ pattern: AvatarPattern; alt: string }> = ({ pattern, alt }) => {
  if (pattern === 'none') return null;

  if (pattern === 'duotone') {
    // A diagonal, not a horizontal split — a horizontal one cuts straight
    // through the middle of the initials, which is exactly where it is worst.
    return <path d="M0 48L48 0v48z" fill={alt} />;
  }

  if (pattern === 'dots') {
    const dots: React.ReactNode[] = [];
    for (let row = 0; row < 5; row += 1) {
      for (let col = 0; col < 5; col += 1) {
        dots.push(
          <circle key={`${row}-${col}`} cx={5 + col * 10 + (row % 2) * 5} cy={5 + row * 10} r={2.1} fill={alt} />,
        );
      }
    }
    return <g>{dots}</g>;
  }

  if (pattern === 'stripes') {
    return (
      <g fill={alt}>
        {[-40, -25, -10, 5, 20, 35].map(x => (
          <path key={x} d={`M${x} 48L${x + 24} 0h7L${x + 7} 48z`} />
        ))}
      </g>
    );
  }

  if (pattern === 'confetti') {
    return (
      <g fill={alt}>
        <rect x="6" y="7" width="6" height="2.4" rx="1.2" transform="rotate(-24 9 8)" />
        <rect x="31" y="4" width="7" height="2.4" rx="1.2" transform="rotate(38 34 5)" />
        <rect x="36" y="20" width="6" height="2.4" rx="1.2" transform="rotate(-14 39 21)" />
        <rect x="4" y="27" width="7" height="2.4" rx="1.2" transform="rotate(52 7 28)" />
        <rect x="27" y="38" width="6" height="2.4" rx="1.2" transform="rotate(-40 30 39)" />
        <rect x="12" y="40" width="7" height="2.4" rx="1.2" transform="rotate(16 15 41)" />
        <circle cx="21" cy="6" r="1.6" />
        <circle cx="43" cy="33" r="1.6" />
        <circle cx="6" cy="18" r="1.6" />
        <circle cx="20" cy="43" r="1.6" />
      </g>
    );
  }

  // spotlight — a beam down from the top corner, as if the tile were a stage.
  return (
    <g fill={alt}>
      <path d="M14 0h9l13 48h-25z" opacity="0.85" />
      <ellipse cx="23.5" cy="46" rx="15" ry="5" opacity="0.6" />
    </g>
  );
};

interface ProfileAvatarProps {
  config: AvatarConfig;
  /** Used when the family has not chosen initials of their own. */
  fallbackInitials: string;
  size?: number;
}

const ProfileAvatar: React.FC<ProfileAvatarProps> = ({ config, fallbackInitials, size = 56 }) => {
  const palette = paletteEntry(config.paletteKey);
  const initials = (config.initials || fallbackInitials).slice(0, 2);
  const clipId = `${useId()}-avatar-clip`;

  const shape = shapePath(config.shape);
  const tile = 'd' in shape
    ? <path d={shape.d} fill={palette.bg} />
    : <rect width="48" height="48" rx={shape.rx} fill={palette.bg} />;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label={config.mode === 'icon' ? 'Profile icon' : `Profile initials ${initials}`}
      style={{ flexShrink: 0, display: 'block' }}
    >
      <clipPath id={clipId}>
        {'d' in shape ? <path d={shape.d} /> : <rect width="48" height="48" rx={shape.rx} />}
      </clipPath>

      {tile}

      <g clipPath={`url(#${clipId})`}>
        <Pattern pattern={config.pattern} alt={palette.alt} />
      </g>

      {config.ring && (
        'd' in shape
          // Scaled about the centre rather than a second hand-drawn path, so the
          // ring cannot drift out of agreement with the tile it sits inside.
          ? <path d={shape.d} fill="none" stroke={palette.fg} strokeWidth="2" opacity="0.5" transform="translate(24 24) scale(0.87) translate(-24 -24)" />
          : <rect x="3.5" y="3.5" width="41" height="41" rx={Math.max(shape.rx - 3.5, 2)} fill="none" stroke={palette.fg} strokeWidth="2" opacity="0.5" />
      )}

      {config.mode === 'icon' ? (
        <g transform="translate(12 12)">
          <path
            d={ICON_PATHS[config.iconKey] ?? ICON_PATHS.star}
            fill={palette.fg}
            fillRule={EVENODD_ICONS.has(config.iconKey) ? 'evenodd' : 'nonzero'}
          />
        </g>
      ) : (
        <text
          x="24"
          y="24"
          textAnchor="middle"
          dominantBaseline="central"
          // Presentation attributes, not theme tokens: these are literal hex
          // from the palette, so they resolve. A var() would not (CLAUDE.md).
          fill={palette.fg}
          fontSize="18"
          fontWeight="700"
          fontFamily="Barlow, system-ui, sans-serif"
          letterSpacing="0.5"
        >
          {initials}
        </text>
      )}
    </svg>
  );
};

export default ProfileAvatar;
