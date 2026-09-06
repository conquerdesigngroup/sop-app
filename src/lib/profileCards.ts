import React from 'react';
import { MemberType } from '../types/attendance';
import { AttendanceSource } from './attendanceQueries';
import IdentityCard from '../components/profile/IdentityCard';
import UpNextCard from '../components/profile/UpNextCard';
import HouseholdCard from '../components/profile/HouseholdCard';
import SeasonStatsCard from '../components/profile/SeasonStatsCard';
import AttendanceCardHost from '../components/profile/AttendanceCardHost';
import UpdatesCard from '../components/profile/UpdatesCard';
import DocumentsCard from '../components/profile/DocumentsCard';
import ClassCalendarCard from '../components/profile/ClassCalendarCard';
import NotificationsCard from '../components/profile/NotificationsCard';
import AccountCard from '../components/profile/AccountCard';

/**
 * The profile's card registry (§5.1).
 *
 * WHY A REGISTRY AND NOT A PAGE
 *
 * The profile is going to accumulate: goals, tokens, rewards, per-user alerts.
 * Every one of those is a temptation to add another block to Profile.tsx, and
 * three features later that file is where all the feature logic lives and every
 * change touches it. So the page renders this array and nothing else — adding a
 * card means writing a component and adding one entry here, and the page is
 * never edited again.
 *
 * `visible` RUNS BEFORE THE COMPONENT MOUNTS
 *
 * That is the point of it. A card that is not visible must issue no queries —
 * not render and hide, not fetch and discard. A student member seeing a
 * guardian-only card's network request in the tab is the same leak whether or
 * not the pixels appear (§5.5 item 2).
 */

export interface ProfileContext {
  memberType: MemberType;
  /** Staff previewing the portal. They keep their own /profile for identity. */
  isStaff: boolean;
  /**
   * Is this login attached to a household — i.e. is there a family to show?
   *
   * Resolved by the page from the shared household read, so it costs nothing,
   * and false while that read is in flight. It is only ever consulted for
   * staff: a client is a family by definition and never waits on it.
   */
  hasHousehold: boolean;
  /** Where the attendance cards read from — fixture or the live tables. */
  source: AttendanceSource;
  flags: {
    unlockables: boolean;
  };
}

/**
 * Cards that show a FAMILY, rather than an account.
 *
 * WHY THIS IS NOT JUST `!ctx.isStaff`
 *
 * It was, and the reasoning recorded against it — "staff previewing the portal
 * have no household, so there is nothing for this card to read" — turned out to
 * be both wrong and load-bearing. Staff do not have no household; under RLS an
 * admin could read EVERY household, because portal_students_select is
 * `can_see_student(id) OR is_admin()` and loadHouseholdSummary filtered by
 * nothing. So this predicate was the only thing between an admin opening the
 * portal profile and a list of all 388 children in the studio.
 *
 * That is fixed at the source: loadHouseholdSummary now names the household it
 * wants. With the query honest, the predicate can go back to asking the
 * question it was always meant to ask — is there a family here to show — which
 * is what lets the teachers and the owner, who are parents at this studio too,
 * open the portal and see their own children.
 *
 * Staff with no children at the studio are unchanged: no membership row, no
 * household, no cards.
 */
const showsAFamily = (ctx: ProfileContext): boolean => !ctx.isStaff || ctx.hasHousehold;

export interface ProfileCardProps {
  ctx: ProfileContext;
  /** Identity fields, already resolved by the page. */
  firstName: string;
  lastName: string;
  email: string;
}

export interface ProfileCard {
  id: string;
  title: string;
  component: React.ComponentType<ProfileCardProps>;
  visible: (ctx: ProfileContext) => boolean;
  defaultOrder: number;
}

export const PROFILE_CARDS: ProfileCard[] = [
  {
    id: 'identity',
    title: 'Identity',
    component: IdentityCard,
    visible: () => true,
    defaultOrder: 10,
  },
  {
    // Above attendance on purpose. Attendance is looked up occasionally;
    // "where do they need to be" is looked up on the way out of the house.
    id: 'up-next',
    title: 'Up next',
    component: UpNextCard,
    visible: showsAFamily,
    defaultOrder: 15,
  },
  {
    id: 'household',
    title: 'Your dancers',
    component: HouseholdCard,
    // Renders nothing for a one-child household — the card itself makes that
    // call, because the registry cannot know the child count without querying,
    // and `visible` must stay synchronous and free.
    visible: ctx => showsAFamily(ctx) && ctx.memberType === 'guardian',
    defaultOrder: 18,
  },
  {
    // Directly above Attendance, as its headline: the glance, then the detail.
    // It reads the household summary the cards around it have already loaded,
    // so it costs no request — and it renders nothing at all for a household
    // with no enrolments, which is why it can sit this high without being the
    // first thing a brand-new family sees.
    id: 'season-stats',
    title: 'At a glance',
    component: SeasonStatsCard,
    visible: showsAFamily,
    defaultOrder: 19,
  },
  {
    id: 'attendance',
    title: 'Attendance',
    component: AttendanceCardHost,
    visible: showsAFamily,
    defaultOrder: 20,
  },
  {
    id: 'updates',
    title: 'Updates',
    component: UpdatesCard,
    visible: showsAFamily,
    defaultOrder: 30,
  },
  {
    id: 'documents',
    title: 'Files & forms',
    component: DocumentsCard,
    visible: showsAFamily,
    defaultOrder: 40,
  },
  {
    id: 'calendar',
    title: 'Add to your calendar',
    component: ClassCalendarCard,
    visible: showsAFamily,
    defaultOrder: 50,
  },
  {
    // Below the content cards and above Account: it is a settings control, not
    // something a parent came to read, but it belongs with the account rather
    // than buried under the sign-out button.
    id: 'notifications',
    title: 'Notifications',
    component: NotificationsCard,
    // The ONE card that stays `!isStaff` rather than moving to showsAFamily,
    // and the reason is not the mistaken one the others carried. Staff keep
    // the Settings page toggle, which is wired to their own digest over the
    // SAME push subscription this card would switch. A member of staff who is
    // also a parent would get both, pointed at one subscription, each
    // reporting the state it last wrote. Two switches over one wire fight;
    // there is no household test that makes them stop.
    visible: ctx => !ctx.isStaff,
    defaultOrder: 80,
  },
  {
    id: 'account',
    title: 'Account',
    component: AccountCard,
    visible: () => true,
    defaultOrder: 90,
  },
];

/**
 * Registry order, with the user's saved order winning where it has an opinion.
 *
 * A saved order that names a card which no longer exists is ignored rather than
 * treated as an error — a family that reordered their cards before a feature
 * was retired should not get a broken profile because of it.
 */
export const orderedCards = (
  ctx: ProfileContext,
  savedOrder: string[] = [],
  hidden: string[] = [],
): ProfileCard[] => {
  const rank = new Map(savedOrder.map((id, index) => [id, index]));

  return PROFILE_CARDS
    .filter(card => card.visible(ctx))
    .filter(card => !hidden.includes(card.id))
    .slice()
    .sort((a, b) => {
      const ra = rank.has(a.id) ? rank.get(a.id)! : Number.MAX_SAFE_INTEGER;
      const rb = rank.has(b.id) ? rank.get(b.id)! : Number.MAX_SAFE_INTEGER;
      if (ra !== rb) return ra - rb;
      return a.defaultOrder - b.defaultOrder;
    });
};

/** §5.4 — the frame exists, the surface is off until the rewards feature lands. */
export const UNLOCKABLES_ENABLED = process.env.REACT_APP_ENABLE_UNLOCKABLES === 'true';
