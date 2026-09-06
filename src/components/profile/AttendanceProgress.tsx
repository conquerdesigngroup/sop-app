import React from 'react';
import { theme } from '../../theme';
import { AttendanceSummary, SessionAttendance } from '../../types/attendance';
import { accentTrack } from '../../lib/attendanceColors';
import SessionStrip from './SessionStrip';

/**
 * One class's progress: a strip of sessions when we have them, a bar when we
 * do not.
 *
 * ALWAYS SHOWS THE RAW NUMBERS
 *
 * "9 of 10" sits next to "90%" because a percentage alone is unfalsifiable.
 * If the denominator is wrong — a cancelled class that was never marked, a
 * mid-season join that did not register — the percentage still looks like a
 * plausible percentage and nobody can tell. The raw fraction makes a wrong
 * denominator visible to the one person who knows how many classes their child
 * actually had (§6.1).
 *
 * ZERO COUNTED IS NOT ZERO PERCENT
 *
 * A class that has not met yet renders as "No sessions yet" over an empty
 * track. Rendering 0% would tell a parent their child missed every class in a
 * class that has never happened, and `attended / 0` renders as NaN, which is
 * worse. This is the single most likely thing to go wrong on a fresh studio
 * with no imports, so it is handled first (§6.1).
 *
 * WHY THE STRIP REPLACES THE BAR RATHER THAN JOINING IT
 *
 * The percentage is already printed on the row above, so a bar whose only job
 * is to draw that same percentage adds nothing the strip does not — and two
 * indicators of one number, stacked, is how a card starts looking busy while
 * saying less. When the sessions are there the strip is strictly more
 * information; when they are not, the bar is still exactly right, because it
 * renders the server's own numbers and nothing else.
 *
 * `sessions` arriving null is normal, not a failure: the strip's own agreement
 * check (stripSessions, lib/attendanceMarks.ts) refuses to draw when its clip
 * would contradict the fraction, and the caller passes null when the detail
 * fetch has not landed or did not come back.
 */
interface AttendanceProgressProps {
  summary: AttendanceSummary;
  accent: string;
  /** Already clipped and agreement-checked by the caller. Null draws the bar. */
  sessions?: SessionAttendance[] | null;
}

const AttendanceProgress: React.FC<AttendanceProgressProps> = ({ summary, accent, sessions }) => {
  const { attended, counted, percent } = summary;
  const started = counted > 0 && percent !== null;
  const strip = sessions && sessions.length > 0 ? sessions : null;

  return (
    <div>
      <div
        role="progressbar"
        aria-valuenow={started ? percent : undefined}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={started ? `${attended} of ${counted} classes attended` : 'No sessions yet'}
        style={
          strip
            ? undefined
            : {
              height: '8px',
              borderRadius: theme.borderRadius.full,
              background: accentTrack(accent),
              overflow: 'hidden',
            }
        }
      >
        {strip ? (
          <SessionStrip sessions={strip} accent={accent} />
        ) : (
          started && (
            <div
              style={{
                width: `${percent}%`,
                height: '100%',
                background: accent,
                borderRadius: theme.borderRadius.full,
                transition: 'width 240ms ease',
              }}
            />
          )
        )}
      </div>

      <p
        style={{
          ...theme.typography.captionSmall,
          fontFamily: theme.fonts.mono,
          color: theme.colors.txt.tertiary,
          margin: '6px 0 0',
        }}
      >
        {started ? `${attended} of ${counted} classes` : 'No sessions yet'}
      </p>
    </div>
  );
};

export default AttendanceProgress;
