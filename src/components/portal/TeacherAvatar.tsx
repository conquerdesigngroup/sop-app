import React from 'react';
import ProfileAvatar from '../profile/ProfileAvatar';
import { InstructorLook, lookFor } from '../../lib/instructorLook';
import { splitInstructorNames } from '../../lib/instructorMatch';

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
 *
 * ONE FIELD, SEVERAL TEACHERS
 *
 * instructor_name is free text and routinely holds a list — "Chill Kerney,
 * Ky'ree Nevels", and on the Saturday production four of them. The first
 * version of this drew ONE mark from the whole string, which for that pair
 * gives the initials CN: not either teacher, an invented third person, printed
 * next to their real names on a page parents read. It splits on the same
 * separators the bulk-assign matcher uses and draws one mark each.
 *
 * Capped at three. Beyond that the marks are wider than the names they belong
 * to and stop being a way to find anybody — and the full list is written out
 * beside them anyway, so nothing is hidden by stopping.
 */

const MAX_MARKS = 3;

interface TeacherAvatarProps {
  instructorName: string;
  /** Stored overrides keyed by nameKey. Empty is the normal case — see lookFor. */
  looks?: Record<string, InstructorLook>;
  size?: number;
}

const TeacherAvatar: React.FC<TeacherAvatarProps> = ({ instructorName, looks, size = 22 }) => {
  const names = splitInstructorNames(instructorName).slice(0, MAX_MARKS);
  if (names.length === 0) return null;

  return (
    /* Spaced rather than overlapped. An overlapping stack is the usual idiom
       and is narrower, but every mark then needs a ring in whatever colour is
       behind it — and these render on a card, on a pressed row that changes
       colour, and inside a modal. A 3px gap needs no such assumption. */
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', flexShrink: 0 }}>
      {names.map(name => (
        <ProfileAvatar
          key={name}
          config={lookFor(name, looks)}
          /* lookFor has already resolved initials from the name, so this only
             matters for a name that folds to nothing at all. */
          fallbackInitials="·"
          size={size}
        />
      ))}
    </span>
  );
};

export default TeacherAvatar;
