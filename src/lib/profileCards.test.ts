/**
 * The registry imports all nine card components, which pulls the entire UI
 * tree — and with it react-router-dom 7, whose ESM this jest cannot resolve.
 * Nothing under test renders anything: `visible` is a pure function of the
 * context, so the components are stubbed to a string tag.
 */
jest.mock('../components/profile/IdentityCard', () => ({ __esModule: true, default: 'div' }), { virtual: true });
jest.mock('../components/profile/UpNextCard', () => ({ __esModule: true, default: 'div' }), { virtual: true });
jest.mock('../components/profile/HouseholdCard', () => ({ __esModule: true, default: 'div' }), { virtual: true });
jest.mock('../components/profile/SeasonStatsCard', () => ({ __esModule: true, default: 'div' }), { virtual: true });
jest.mock('../components/profile/AttendanceCardHost', () => ({ __esModule: true, default: 'div' }), { virtual: true });
jest.mock('../components/profile/UpdatesCard', () => ({ __esModule: true, default: 'div' }), { virtual: true });
jest.mock('../components/profile/DocumentsCard', () => ({ __esModule: true, default: 'div' }), { virtual: true });
jest.mock('../components/profile/ClassCalendarCard', () => ({ __esModule: true, default: 'div' }), { virtual: true });
jest.mock('../components/profile/NotificationsCard', () => ({ __esModule: true, default: 'div' }), { virtual: true });
jest.mock('../components/profile/AccountCard', () => ({ __esModule: true, default: 'div' }), { virtual: true });

// eslint-disable-next-line import/first
import { ProfileContext, orderedCards } from './profileCards';

/**
 * Who sees which cards.
 *
 * Worth pinning because this predicate was, until recently, the only thing
 * standing between an admin opening the portal profile and every child in the
 * studio — loadHouseholdSummary filtered by RLS alone, and RLS does not scope
 * an admin. The query is honest now, but the shape of the mistake is easy to
 * reintroduce: the cards must key on whether there is a FAMILY here, never on
 * a role alone, and Notifications must stay out of it for its own reason.
 */

const ctx = (over: Partial<ProfileContext> = {}): ProfileContext => ({
  memberType: 'guardian',
  isStaff: false,
  hasHousehold: false,
  source: { source: 'live' },
  flags: { unlockables: false },
  ...over,
});

const idsFor = (c: ProfileContext) => orderedCards(c).map(card => card.id);

const FAMILY_CARDS = ['up-next', 'household', 'season-stats', 'attendance', 'updates', 'documents', 'calendar'];

describe('who sees the family cards', () => {
  it('shows them to a client immediately, without waiting for the household read', () => {
    // hasHousehold is false until that read lands. A client must not watch
    // their own page assemble itself.
    expect(idsFor(ctx())).toEqual(expect.arrayContaining(FAMILY_CARDS));
  });

  it('shows a member of staff with no children at the studio nothing but their account', () => {
    expect(idsFor(ctx({ isStaff: true }))).toEqual(['identity', 'account']);
  });

  it('shows a member of staff who IS a parent their own family', () => {
    const ids = idsFor(ctx({ isStaff: true, hasHousehold: true }));
    expect(ids).toEqual(expect.arrayContaining(FAMILY_CARDS));
  });

  it('never gives staff the notifications card, household or not', () => {
    // Its reason is not "staff have no family": Settings already has a toggle
    // over the SAME push subscription, and two switches over one wire fight.
    expect(idsFor(ctx({ isStaff: true, hasHousehold: true }))).not.toContain('notifications');
    expect(idsFor(ctx({ isStaff: true }))).not.toContain('notifications');
    expect(idsFor(ctx())).toContain('notifications');
  });

  it('keeps "Your dancers" to guardians — a student login sees only itself', () => {
    expect(idsFor(ctx({ memberType: 'student' }))).not.toContain('household');
    expect(idsFor(ctx({ memberType: 'guardian' }))).toContain('household');
  });

  it('always shows identity and account, to everybody', () => {
    [ctx(), ctx({ isStaff: true }), ctx({ isStaff: true, hasHousehold: true })].forEach(c => {
      expect(idsFor(c)).toEqual(expect.arrayContaining(['identity', 'account']));
    });
  });
});
