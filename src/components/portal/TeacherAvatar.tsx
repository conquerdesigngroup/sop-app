import React from 'react';
import ProfileAvatar from '../profile/ProfileAvatar';
import { InstructorLook, lookFor } from '../../lib/instructorLook';

/**
 * The mark beside a teacher's name.
 *
 * WHY THE NAME NEEDED A FACE
 *
 * "Sarah Davidson · Studio B" was a single grey line of metadata at the bottom
 * of a class card, and on a schedule of twenty classes every one of those lines
 * looks the same. A parent scanning for "which of these is Miss Sarah's" was
 * reading, not looking. A coloured mark is found rather than read, and it is
 * the same colour for the same teacher on every card, on every device, forever
 * — see lib/instructorLook.ts for why that determinism is the whole point.
 *
 * NO PHOTOGRAPHS
 *
 * Same decision as §5.2 made for family avatars, and for the same reasons:
 * initials and icons need no bucket, no moderation, no broken-image state and
 * no loading flash, and this one adds a fourth — a photograph of a member of
 * staff on an anon-readable page is a consent question nobody asked for. What
 * a super admin can change is the colour and the glyph.
 *
 * DRAWN BY ProfileAvatar
 *
 * Not a second avatar renderer. The family avatar already resolves a palette
 * entry, draws the rounded square, and centres either two letters or one of six
 * glyphs; a teacher's mark is the same object with a different source of
 * config, so it goes through the same component. One place to change how an
 * avatar looks.
 */

interface TeacherAvatarProps {
  instructorName: string;
  /** Stored overrides keyed by nameKey. Empty is the normal case — see lookFor. */
  looks?: Record<string, InstructorLook>;
  size?: number;
}

const TeacherAvatar: React.FC<TeacherAvatarProps> = ({ instructorName, looks, size = 22 }) => {
  if (!instructorName.trim()) return null;

  return (
    <ProfileAvatar
      config={lookFor(instructorName, looks)}
      /* lookFor has already resolved initials from the name, so this only
         matters for a name that folds to nothing at all. */
      fallbackInitials="·"
      size={size}
    />
  );
};

export default TeacherAvatar;
