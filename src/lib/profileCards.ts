import React from 'react';
import { MemberType } from '../types/attendance';
import { AttendanceSource } from './attendanceQueries';
import IdentityCard from '../components/profile/IdentityCard';
import UpNextCard from '../components/profile/UpNextCard';
import HouseholdCard from '../components/profile/HouseholdCard';
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
  /** Where the attendance cards read from — fixture or the live tables. */
  source: AttendanceSource;
  flags: {
    unlockables: boolean;
  };
}

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
    visible: ctx => !ctx.isStaff,
    defaultOrder: 15,
  },
  {
    id: 'household',
    title: 'Your dancers',
    component: HouseholdCard,
    // Renders nothing for a one-child household — the card itself makes that
    // call, because the registry cannot know the child count without querying,
    // and `visible` must stay synchronous and free.
    visible: ctx => !ctx.isStaff && ctx.memberType === 'guardian',
    defaultOrder: 18,
  },
  {
    id: 'attendance',
    title: 'Attendance',
    component: AttendanceCardHost,
    // Staff previewing the portal have no household, so there is nothing for
    // this card to read and no query worth issuing.
    visible: ctx => !ctx.isStaff,
    defaultOrder: 20,
  },
  {
    id: 'updates',
    title: 'Updates',
    component: UpdatesCard,
    visible: ctx => !ctx.isStaff,
    defaultOrder: 30,
  },
  {
    id: 'documents',
    title: 'Files & forms',
    component: DocumentsCard,
    visible: ctx => !ctx.isStaff,
    defaultOrder: 40,
  },
  {
    id: 'calendar',
    title: 'Add to your calendar',
    component: ClassCalendarCard,
    visible: ctx => !ctx.isStaff,
    defaultOrder: 50,
  },
  {
    // Below the content cards and above Account: it is a settings control, not
    // something a parent came to read, but it belongs with the account rather
    // than buried under the sign-out button.
    id: 'notifications',
    title: 'Notifications',
    component: NotificationsCard,
    // Staff previewing the portal keep the Settings page toggle, which is
    // wired to their own digest. Two switches over one subscription would
    // fight.
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
