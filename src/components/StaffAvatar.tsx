import React, { useEffect, useState } from 'react';
import { theme } from '../theme';
import { cachedStaffPhoto, signStaffPhoto } from '../lib/staffPhoto';

/**
 * A member of staff's face, or their initials.
 *
 * ONE RENDERER, EVERY SURFACE
 *
 * The photo was previously drawn in exactly one place — the person's own
 * profile page — while nine other screens kept drawing initials from
 * `firstName.charAt(0)`. So uploading a picture changed one screen out of ten,
 * and the studio's own team list still showed a coloured circle with letters
 * in it. This is the join: every one of those places now renders this, and a
 * change to how a staff avatar looks happens once.
 *
 * INITIALS ARE THE DEFAULT, NOT THE FAILURE
 *
 * Most of the studio has no photo and never will, so the lettered circle is
 * the normal case and is drawn without waiting for anything. A photo replaces
 * it once its URL resolves. There is no spinner and no grey box: a placeholder
 * that flashes on every row of a forty-person list is worse than a letter that
 * is occasionally replaced by a face.
 *
 * NO LAYOUT SHIFT
 *
 * Both states are exactly `size` square, so the swap cannot move the row it
 * sits in.
 */

interface StaffAvatarProps {
  firstName?: string | null;
  lastName?: string | null;
  /** Storage key from profiles.avatar_path. Absent for most of the studio. */
  avatarPath?: string | null;
  size?: number;
  /** Overrides for the circle — a border on a dark row, say. */
  style?: React.CSSProperties;
}

const StaffAvatar: React.FC<StaffAvatarProps> = ({
  firstName,
  lastName,
  avatarPath,
  size = 40,
  style,
}) => {
  // Seeded from the cache so an avatar that has already been signed on this
  // page paints its photo on the FIRST render rather than flashing initials.
  const [url, setUrl] = useState<string | null>(() => cachedStaffPhoto(avatarPath) ?? null);

  useEffect(() => {
    if (!avatarPath) { setUrl(null); return; }

    const known = cachedStaffPhoto(avatarPath);
    if (known !== undefined) { setUrl(known); return; }

    let cancelled = false;
    signStaffPhoto(avatarPath).then(next => { if (!cancelled) setUrl(next); });
    return () => { cancelled = true; };
  }, [avatarPath]);

  const initials =
    `${(firstName ?? '').trim().charAt(0)}${(lastName ?? '').trim().charAt(0)}`.toUpperCase();

  return (
    <div
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        backgroundColor: theme.colors.primary,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        flexShrink: 0,
        ...style,
      }}
    >
      {url ? (
        <img
          src={url}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        // Hardcoded white, not a text token: this sits on the crimson brand
        // colour in both modes, and the mode-dependent tokens flip dark in
        // light mode and lose the contrast (CLAUDE.md).
        <span style={{ fontSize: `${Math.round(size * 0.36)}px`, fontWeight: 700, color: '#FFFFFF' }}>
          {initials}
        </span>
      )}
    </div>
  );
};

export default StaffAvatar;
