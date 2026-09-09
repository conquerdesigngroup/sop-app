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
import TeachersCard from '../components/profile/TeachersCard';
import ClosuresCard from '../components/profile/ClosuresCard';
import NotificationsCard from '../components/profile/NotificationsCard';
import AccountCard from '../components/profile/AccountCard';

/**
 * The portal's card registry (§5.1).
 *
 * WHY A REGISTRY AND NOT A PAGE
 *
 * The portal is going to accumulate: goals, tokens, rewards, per-user alerts.
 * Every one of those is a temptation to add another block to a page, and three
 * features later that file is where all the feature logic lives and every
 * change touches it. So the pages render this array and nothing else — adding a
 * card means writing a component and adding one entry here, and no page is
 * edited again.
 *
 * TWO SURFACES, ONE REGISTRY
 *
 * Every card declares where it belongs. `dashboard` is the portal home — what
 * is on next, who is dancing, attendance, updates, files: the things a family
 * opens the app to find out. `account` is /portal/profile — who you are, your
 * password, your notifications: the things you change and then leave alone.
 *
 * The split matters because the two are read on completely different schedules.
 * The dashboard is opened in a car three times a week; the account page is
 * opened twice a year. Putting them on one page meant a parent scrolling past
 * an avatar builder to find out what time class starts, which is the wrong way
 * round — and it is why the dashboard cards used to sit one tap down behind a
 * tile called "My Profile".
 *
 * `visible` RUNS BEFORE THE COMPONENT MOUNTS
 *
 * That is the point of it. A card that is not visible must issue no queries —
 * not render and hide, not fetch and discard. A student member seeing a
 * guardian-only card's network request in the tab is the same leak whether or
 * not the pixels appear (§5.5 item 2).
 */

/**
 * Which page a card belongs on.
 *
 * 'dashboard' — /portal, the signed-in home. Family content.
 * 'account'   — /portal/profile. Identity, password, notifications.
 */
export type PortalSurface = 'dashboard' | 'account';

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
  /** Which page renders it. A card belongs to exactly one. */
  surface: PortalSurface;
  visible: (ctx: ProfileContext) => boolean;
  defaultOrder: number;
}

export const PROFILE_CARDS: ProfileCard[] = [
  {
    id: 'identity',
    title: 'Identity',
    component: IdentityCard,
    // Account, not dashboard. The avatar builder and the household nickname
    // are set once and then left alone for a year; a parent checking what time
    // class starts should not have to scroll past them.
    surface: 'account',
    visible: () => true,
    defaultOrder: 10,
  },
  {
    // Above attendance on purpose. Attendance is looked up occasionally;
    // "where do they need to be" is looked up on the way out of the house.
    id: 'up-next',
    title: 'Up next',
    component: UpNextCard,
    // The first thing on the dashboard, and the reason the dashboard exists.
    surface: 'dashboard',
    visible: showsAFamily,
    defaultOrder: 15,
  },
  {
    id: 'household',
    title: 'Your dancers',
    component: HouseholdCard,
    surface: 'dashboard',
    // Renders nothing for a one-child household — the card itself makes that
    // call, because the registry cannot know the child count without querying,
    // and `visible` must stay synchronous and free.
    visible: ctx => showsAFamily(ctx) && ctx.memberType === 'guardian',
    defaultOrder: 18,
  },
  {
    // The headline for the two cards under it: the glance, then the classes it
    // is counting, then the attendance detail. It reads the household summary
    // the cards around it have already loaded, so it costs no request — and it
    // renders nothing at all for a household with no enrolments, which is why
    // it can sit this high without being the first thing a brand-new family
    // sees.
    id: 'season-stats',
    title: 'At a glance',
    component: SeasonStatsCard,
    surface: 'dashboard',
    visible: showsAFamily,
    defaultOrder: 19,
  },
  {
    // Under "At a glance", which is the summary of exactly these classes, and
    // above Attendance, which is a record of them. It was last on the page
    // when it was only a calendar export; it is now the roster of what the
    // family is actually enrolled in and the way through to each class, so it
    // belongs with the two cards that describe the same set.
    id: 'calendar',
    title: 'Your classes',
    component: ClassCalendarCard,
    surface: 'dashboard',
    visible: showsAFamily,
    defaultOrder: 20,
  },
  {
    // Between the class roster and attendance, because it answers the question
    // a parent asks WHILE looking at the roster — "who has Maya got for hip
    // hop?" — and it reads from the same enrolments the card above it lists.
    // Above attendance because attendance is a record and this is a who's-who.
    id: 'teachers',
    title: 'Your teachers',
    component: TeachersCard,
    surface: 'dashboard',
    // Renders nothing when the family's classes carry no instructor name; the
    // card makes that call, because the registry cannot know without querying
    // and `visible` must stay synchronous and free.
    visible: showsAFamily,
    defaultOrder: 21,
  },
  {
    id: 'attendance',
    title: 'Attendance',
    component: AttendanceCardHost,
    surface: 'dashboard',
    visible: showsAFamily,
    defaultOrder: 22,
  },
  {
    // Second on the dashboard, above the roster and the numbers.
    //
    // It was below attendance, on the reasoning that the schedule is what a
    // parent opens the app for. That is right about "up next" and wrong about
    // everything under it: an announcement is the one thing here that is NEW,
    // has a deadline attached, and is useless once missed — a cancelled class
    // or a costume date read on Thursday is not the same information read on
    // Sunday. Who your dancers are does not change between visits.
    id: 'updates',
    title: 'Updates',
    component: UpdatesCard,
    surface: 'dashboard',
    visible: showsAFamily,
    defaultOrder: 16,
  },
  {
    // Below the roster and attendance, above the files. A closure is not what a
    // parent opened the app for on a normal Tuesday — it is what they need to
    // see BEFORE the week it lands in, which is what the countdown on a row is
    // for. Putting it above "up next" would make every visit start with a
    // holiday six weeks away.
    id: 'closures',
    title: 'Closures & season',
    component: ClosuresCard,
    surface: 'dashboard',
    // showsAFamily, like every other card here, and NOT `() => true`.
    //
    // The closures are the studio's rather than the family's, so "true for
    // anyone signed in" was tempting and is wrong: this dashboard is the
    // FAMILY's page, and the rule that a member of staff with no children at
    // the studio sees their account and nothing else is deliberate — they have
    // the staff calendar for the studio's own dates. The season line inside
    // needs a family regardless.
    visible: showsAFamily,
    defaultOrder: 30,
  },
  {
    id: 'documents',
    title: 'Files & forms',
    component: DocumentsCard,
    surface: 'dashboard',
    visible: showsAFamily,
    defaultOrder: 40,
  },
  {
    // A settings control, not something a parent came to read — so it lives
    // with the account rather than on the dashboard, above the sign-out button
    // rather than buried under it.
    id: 'notifications',
    title: 'Notifications',
    component: NotificationsCard,
    surface: 'account',
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
    surface: 'account',
    visible: () => true,
    defaultOrder: 90,
  },
];

/**
 * One surface's cards, in order, with the user's saved order winning where it
 * has an opinion.
 *
 * `surface` is optional and omitting it returns every card, which is what the
 * visibility tests want: who may see a card is a question about the context,
 * not about which page happens to render it, and the two should be able to
 * regress independently.
 *
 * A saved order that names a card which no longer exists is ignored rather than
 * treated as an error — a family that reordered their cards before a feature
 * was retired should not get a broken page because of it.
 */
export const orderedCards = (
  ctx: ProfileContext,
  surface?: PortalSurface,
  savedOrder: string[] = [],
  hidden: string[] = [],
): ProfileCard[] => {
  const rank = new Map(savedOrder.map((id, index) => [id, index]));

  return PROFILE_CARDS
    .filter(card => !surface || card.surface === surface)
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
