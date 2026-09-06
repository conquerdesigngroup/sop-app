import React from 'react';
import { theme } from '../../theme';
import { SessionAttendance } from '../../types/attendance';
import { describeMark } from '../../lib/attendanceMarks';

/**
 * One mark per session, in date order.
 *
 * WHAT THE BAR CANNOT SAY
 *
 * "9 of 10 · 90%" is true and unfalsifiable in the useful sense — a parent can
 * check the count — but it flattens the thing they would actually want to know.
 * Nine-then-one-missed and one-missed-then-nine are the same fraction and mean
 * completely different things; so does three in a row missed in February. The
 * bar has no way to show that and neither does the number. Twelve marks do, at
 * a glance, from the summary card, without opening anything.
 *
 * SAME VOCABULARY AS THE DETAIL MODAL
 *
 * Every mark comes from describeMark, which is also what AttendanceDetail
 * renders its rows from. So the strip and the list behind it cannot drift: an
 * excused absence is the same colour in both, a cancelled class is a dash in
 * both, because there is one function deciding.
 *
 * IT WRAPS, IT DOES NOT SCROLL OR SHRINK
 *
 * The marks are a fixed 8px and the row wraps. A flex-grow strip would either
 * overflow a 320px phone once a class had run for a season — a fixed minimum
 * width times fifty sessions is wider than the screen, and a flex item never
 * shrinks below its minimum — or would need a cap and a fallback. Wrapping has
 * no such failure: forty sessions become two rows, which is a fair picture of a
 * term anyway.
 *
 * NOT COLOUR ALONE
 *
 * Attended is a filled mark, absent is a hollow ring, excluded is a low dash.
 * Shape carries the distinction, so the strip still reads with any form of
 * colour blindness — and the accessible answer is the progressbar's label and
 * the full list behind the row, not fifty announced dots.
 */

const SLOT = 8;

interface SessionStripProps {
  sessions: SessionAttendance[];
  accent: string;
}

const SessionStrip: React.FC<SessionStripProps> = ({ sessions, accent }) => (
  <div
    aria-hidden="true"
    style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: '4px',
      alignItems: 'center',
    }}
  >
    {sessions.map(entry => {
      const mark = describeMark(entry, accent);

      // A session that does not count is drawn as a low dash rather than an
      // empty ring: an empty ring is what absence looks like, and a cancelled
      // class must never read as one.
      const inner: React.CSSProperties = mark.excluded
        ? {
          width: `${SLOT}px`,
          height: '2px',
          borderRadius: theme.borderRadius.full,
          background: theme.colors.bdr.secondary,
        }
        : {
          width: `${SLOT}px`,
          height: `${SLOT}px`,
          borderRadius: theme.borderRadius.full,
          background: mark.dot ?? 'transparent',
          border: mark.dot ? 'none' : `1.5px solid ${theme.colors.bdr.secondary}`,
          // 'Not marked' — the studio recorded the session but nobody ticked
          // this child either way. Fainter than a recorded absence, because it
          // is not one.
          opacity: !mark.dot && mark.muted ? 0.5 : 1,
          boxSizing: 'border-box' as const,
        };

      return (
        <span
          key={entry.session.id}
          title={mark.label}
          style={{
            width: `${SLOT}px`,
            height: `${SLOT}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <span style={inner} />
        </span>
      );
    })}
  </div>
);

export default SessionStrip;
