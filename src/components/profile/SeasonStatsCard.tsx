import React from 'react';
import { theme } from '../../theme';
import { Card } from '../ui';
import { AttendanceClass } from '../../types/attendance';
import { ClassProgress } from '../../lib/attendanceQueries';
import { localIso } from '../../lib/upcomingClasses';
import { FIXTURE_TODAY } from '../../lib/attendanceFixture';
import { ProfileCardProps } from '../../lib/profileCards';
import { StatTiles, Stat } from '../portal/StatTiles';
import { useHousehold } from './useHousehold';

/**
 * Three numbers, big, at the top of the attendance section.
 *
 * WHY THIS IS NOT A SCORE
 *
 * §6.1 rules out grading a child and the attendance card is careful about it —
 * no ranking between siblings, colour by dance style rather than by percentage.
 * A tile reading "87%" in 32px type would undo all of that in one line, which
 * is why there is no percentage here. What is here is effort and logistics:
 * how many times you are driving this week, how many classes have actually
 * been danced, roughly how many hours that adds up to. All three are counts a
 * parent can check, none of them is a mark out of ten.
 *
 * WHERE THE NUMBERS COME FROM
 *
 * Entirely from the shared household read — no query of its own. That is the
 * reason this card can exist at all: three more numbers on a page that already
 * knows them costs nothing, whereas a card that fetched for itself would be a
 * fourth request for data three cards had already loaded.
 *
 * "SO FAR", NOT "THIS SEASON"
 *
 * loadHouseholdSummary reads portal_my_enrollments with range 'all', because
 * the schedule must not vanish when someone picks "This month" in the card
 * below. So these totals are all-time and the labels say so. Calling them a
 * season would be a smaller word for a bigger claim, and wrong for any child
 * who has been at the studio more than one.
 *
 * ZERO IS A CLAIM; UNKNOWN IS NOT
 *
 * Before the first import every one of these would read 0 — "your child has
 * attended no classes and spent no hours in the studio", stated in the largest
 * type on the page, about a family whose data simply has not arrived. So a
 * household with no enrolments renders no card, and classes that have not met
 * render an em dash with "No sessions yet" rather than a zero.
 */

/** Minutes between two 'HH:MM:SS' columns. Null when the catalogue lacks either. */
const classMinutes = (klass: AttendanceClass): number | null => {
  if (!klass.startTime || !klass.endTime) return null;

  const toMinutes = (t: string): number | null => {
    const [h, m] = t.split(':').map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
  };

  const start = toMinutes(klass.startTime);
  const end = toMinutes(klass.endTime);
  if (start === null || end === null) return null;

  // A class that ends before it starts is bad catalogue data, not a class
  // running past midnight. Counting it as negative hours would quietly drag the
  // total down and look like arithmetic.
  return end > start ? end - start : null;
};

const SeasonStatsCard: React.FC<ProfileCardProps> = ({ ctx }) => {
  const { data, loading } = useHousehold(ctx.source);
  const now = ctx.source.source === 'fixture' ? FIXTURE_TODAY : new Date();

  // No skeleton and no spinner. Every other card on this page is already
  // loading, and a fourth placeholder for a card that may turn out not to
  // render at all just makes the page flicker.
  if (loading) return null;

  // Renders nothing on failure, as HouseholdCard does and for the same reason:
  // Up next and Attendance both announce a failed household read with a retry,
  // and a third copy of that message is noise. Absent makes no claim.
  if (!data || data.error) return null;

  const enrollments: ClassProgress[] = data.perStudent.flatMap(p => p.current);
  if (enrollments.length === 0) return null;

  // Next seven days INCLUDING today. `series` holds the next occurrence of
  // every active class, one row each and uncapped — `upcoming` is capped at
  // four, so counting that instead would tell a family of six classes they had
  // four. One class is one weekly slot in this model, so this is a count of
  // classes, not of occurrences.
  const from = localIso(now);
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + 6);
  const to = localIso(horizon);
  const thisWeek = data.series.filter(s => s.date >= from && s.date <= to).length;

  const attended = enrollments.reduce((n, p) => n + p.summary.attended, 0);
  const counted = enrollments.reduce((n, p) => n + p.summary.counted, 0);
  const started = counted > 0;

  // Attended sessions times the class's own length. Approximate and labelled
  // that way — a class that ran long is not recorded anywhere — but every
  // input is a number the studio published, so it is checkable rather than
  // invented. Classes with no times on the catalogue contribute nothing and
  // are not guessed at.
  const minutes = enrollments.reduce((total, p) => {
    const per = classMinutes(p.klass);
    return per === null ? total : total + per * p.summary.attended;
  }, 0);
  const hours = Math.round(minutes / 60);

  const stats: Stat[] = [
    {
      key: 'week',
      value: String(thisWeek),
      label: thisWeek === 1 ? 'class this week' : 'classes this week',
    },
    {
      key: 'attended',
      value: started ? String(attended) : '—',
      label: started ? 'classes danced' : 'no sessions yet',
      note: started ? `of ${counted} so far` : undefined,
    },
    {
      key: 'hours',
      value: started && hours > 0 ? String(hours) : '—',
      label: 'hours in the studio',
      note: started && hours > 0 ? 'about, so far' : 'once classes start',
    },
  ];

  return (
    <Card>
      <h3 style={{
        ...theme.typography.h3,
        fontFamily: theme.fonts.display,
        color: theme.colors.txt.primary,
        margin: `0 0 ${theme.spacing.md}`,
      }}>
        At a glance
      </h3>

      <StatTiles stats={stats} />
    </Card>
  );
};

export default SeasonStatsCard;
