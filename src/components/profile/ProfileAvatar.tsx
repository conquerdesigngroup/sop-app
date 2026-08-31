import React from 'react';
import { AvatarConfig, AvatarIconKey, paletteEntry } from '../../lib/avatarPalette';

/**
 * The avatar, drawn as SVG rather than fetched as an image (§5.2).
 *
 * An <img> would mean a storage bucket, a CDN path, a broken-image state and a
 * loading flash on every card. A shape and two letters need none of that: it
 * renders instantly, scales to any size without a second asset, and re-themes
 * with the page because the colours are props.
 */

const ICON_PATHS: Record<AvatarIconKey, string> = {
  star: 'M12 3.5l2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.9l6-.8z',
  bolt: 'M13.5 2.5L5.5 13.5h5l-1 8 8-11h-5z',
  heart: 'M12 20.5S3.5 15 3.5 9.2a4.7 4.7 0 018.5-2.8 4.7 4.7 0 018.5 2.8c0 5.8-8.5 11.3-8.5 11.3z',
  note: 'M9 18.5a2.5 2.5 0 11-2.5-2.5c.6 0 1.1.2 1.5.5V4l10-2v12.5a2.5 2.5 0 11-2.5-2.5c.6 0 1.1.2 1.5.5V6L9 7.6z',
  shoe: 'M3.5 15.5V8h3l2.5 3 3-3h6a3 3 0 013 3v4.5a1 1 0 01-1 1h-15a1 1 0 01-1-1z',
  flame: 'M12 2.5s5.5 4.6 5.5 9.5a5.5 5.5 0 11-11 0c0-2.2 1.2-3.9 2.3-5 0 1.6.9 2.6 1.9 2.6 1.4 0 2.1-1.4 1.8-3.3a9 9 0 00-.5-1.8z',
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

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label={config.mode === 'icon' ? 'Profile icon' : `Profile initials ${initials}`}
      style={{ flexShrink: 0, display: 'block' }}
    >
      <rect width="48" height="48" rx="16" fill={palette.bg} />

      {config.mode === 'icon' ? (
        <g transform="translate(12 12) scale(1)">
          <path d={ICON_PATHS[config.iconKey]} fill={palette.fg} transform="scale(1)" />
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
