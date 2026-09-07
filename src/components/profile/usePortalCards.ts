import { useCallback, useMemo, useState } from 'react';
import { usePortalAuth } from '../../contexts/PortalAuthContext';
import { ATTENDANCE_LIVE, AttendanceSource } from '../../lib/attendanceQueries';
import { FixtureScenario } from '../../lib/attendanceFixture';
import {
  PortalSurface,
  ProfileCard,
  ProfileContext,
  UNLOCKABLES_ENABLED,
  orderedCards,
} from '../../lib/profileCards';
import { revalidateHousehold, useHousehold } from './useHousehold';

/**
 * Everything the two card surfaces need in order to render the registry.
 *
 * WHY A HOOK AND NOT TWO PAGES DOING IT TWICE
 *
 * The dashboard and the account page ask the registry the same question with
 * the same context — who is signed in, is there a family behind this login, is
 * this a development build reading the fixture. Copying that into both pages
 * would mean the demo switcher, the fixture guard and the member-type rule
 * existing in two places, and the second copy drifting the first time one of
 * them is touched. The pages differ in exactly one argument: which surface.
 *
 * THE FIXTURE IS A DEVELOPMENT ARTEFACT AND MAY NEVER REACH A REAL FAMILY
 *
 * This used to key off REACT_APP_ATTENDANCE_LIVE alone, which made a missing or
 * misspelled Vercel variable enough to serve invented children — names, classes
 * and attendance percentages — to a parent who trusted them. An env var is not
 * a safety mechanism; a production build is. So production always reads the
 * real tables, and with no data yet a family sees the calm empty states, which
 * is true, instead of somebody else's fiction.
 */

export const DEMO_ALLOWED = !ATTENDANCE_LIVE && process.env.NODE_ENV !== 'production';

const USE_FIXTURE = DEMO_ALLOWED;

export interface PortalCards {
  /** Auth is still resolving. Neither page may decide anything yet. */
  loading: boolean;
  hasSession: boolean;
  /** Signed out, with the fixture standing in. Development builds only. */
  demo: boolean;
  /** Render the scenario picker. Development builds only. */
  showScenarioPicker: boolean;
  scenario: FixtureScenario;
  setScenario: (scenario: FixtureScenario) => void;
  ctx: ProfileContext;
  cards: ProfileCard[];
  identity: { firstName: string; lastName: string; email: string };
  /**
   * Refetch the household and push it into every card already on screen.
   *
   * Silent, and it throws on failure, because that is the contract for a loader
   * registered with `useRefreshable` — the refresh button counts rejections in
   * order to be able to say it did not work.
   */
  refreshHousehold: () => Promise<void>;
}

export const usePortalCards = (surface: PortalSurface): PortalCards => {
  const { loading, hasSession, isStaff, profile } = usePortalAuth();
  const [scenario, setScenario] = useState<FixtureScenario>('guardian');

  const source: AttendanceSource = useMemo(
    () => (USE_FIXTURE ? { source: 'fixture', scenario } : { source: 'live' }),
    [scenario],
  );

  /**
   * Read only where the answer is rendered.
   *
   * The dashboard needs it twice over — `hasHousehold` decides whether a member
   * of staff who is also a parent gets the family cards, and `memberType`
   * decides whether this login is a whole family or one dancer. Nothing on the
   * account page asks either question, so it does not pay for the read. It is
   * the same shared, cached promise the cards use, so the dashboard pays once
   * rather than once per card.
   */
  // Or standing in for one: DEMO_ALLOWED is false in any production build.
  const signedIn = hasSession || DEMO_ALLOWED;
  const needsHousehold = surface === 'dashboard' && signedIn;
  const household = useHousehold(source, needsHousehold);

  const ctx: ProfileContext = useMemo(() => ({
    /**
     * FROM THE MEMBERSHIP ROW, NOT FROM THE DEMO PICKER.
     *
     * This was `scenario === 'student' ? 'student' : 'guardian'`, which in a
     * production build — where the picker does not exist and the scenario is
     * frozen at its default — made every login a guardian. It did not show,
     * because there are no student logins yet and the one card keyed on it
     * hides itself for a one-child household anyway. It would have shown the
     * day the student roster is imported.
     *
     * `portal_household_members.member_type` is the real answer and the query
     * already returns it, pinned to a single student_id by both the request and
     * RLS. The picker only decides it while the fixture is standing in.
     */
    memberType: household.data?.memberType ?? (scenario === 'student' ? 'student' : 'guardian'),
    isStaff: !!isStaff,
    // False while the read is in flight, which is right: a staff member's cards
    // appear once there is demonstrably a family behind them, rather than
    // flashing and being taken away.
    hasHousehold: (household.data?.students.length ?? 0) > 0,
    source,
    flags: { unlockables: UNLOCKABLES_ENABLED },
  }), [scenario, isStaff, source, household.data]);

  /**
   * NO SESSION, NO DASHBOARD.
   *
   * The family cards are `showsAFamily`, which is true for anyone who is not
   * staff — including a visitor who has not signed in at all. That is correct
   * on the account page, which redirects such a visitor away before rendering.
   * It is not correct on the portal home, which in the pre-launch and TEST
   * configurations is deliberately readable with no login: a parent browsing on
   * the studio code alone would have been handed a stack of "no dancers linked
   * yet" cards about a family the page never asked who they were.
   *
   * Empty and signed-out are different states. This one renders the sections
   * and nothing else, exactly as the page did before it was a dashboard.
   */
  const cards = useMemo(
    () => (surface === 'dashboard' && !signedIn ? [] : orderedCards(ctx, surface)),
    [ctx, surface, signedIn],
  );

  const refreshHousehold = useCallback(async () => {
    const result = await revalidateHousehold(source);
    if (result.error) throw new Error(result.error);
  }, [source]);

  const demo = !hasSession && DEMO_ALLOWED;

  return {
    loading,
    hasSession,
    demo,
    showScenarioPicker: USE_FIXTURE && needsHousehold,
    scenario,
    setScenario,
    ctx,
    cards,
    identity: {
      firstName: profile?.firstName ?? (demo ? 'Rosa' : ''),
      lastName: profile?.lastName ?? (demo ? 'Alvarez' : ''),
      email: profile?.email ?? (demo ? 'alvarez.family@example.com' : ''),
    },
    refreshHousehold,
  };
};
