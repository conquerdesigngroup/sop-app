import React from 'react';
import { theme } from '../../theme';
import { AttendanceSummary } from '../../types/attendance';
import { accentTrack } from '../../lib/attendanceColors';

/**
 * One class's progress bar.
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
 */
interface AttendanceProgressProps {
  summary: AttendanceSummary;
  accent: string;
}

const AttendanceProgress: React.FC<AttendanceProgressProps> = ({ summary, accent }) => {
  const { attended, counted, percent } = summary;
  const started = counted > 0 && percent !== null;

  return (
    <div>
      <div
        role="progressbar"
        aria-valuenow={started ? percent : undefined}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={started ? `${attended} of ${counted} classes attended` : 'No sessions yet'}
        style={{
          height: '8px',
          borderRadius: theme.borderRadius.full,
          background: accentTrack(accent),
          overflow: 'hidden',
        }}
      >
        {started && (
          <div
            style={{
              width: `${percent}%`,
              height: '100%',
              background: accent,
              borderRadius: theme.borderRadius.full,
              transition: 'width 240ms ease',
            }}
          />
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
