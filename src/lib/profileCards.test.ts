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
import { PROFILE_CARDS, PortalSurface, ProfileContext, orderedCards } from './profileCards';

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

const idsFor = (c: ProfileContext, surface?: PortalSurface) =>
  orderedCards(c, surface).map(card => card.id);

/**
 * In dashboard order, which the surface test below asserts exactly.
 *
 * Updates sits second, above the roster: it is the only card here whose
 * content is new, dated and useless once missed. The three that describe the
 * same set of enrolments — the glance, the classes, the attendance — then run
 * together rather than with the class list stranded at the bottom.
 */
const FAMILY_CARDS = ['up-next', 'updates', 'household', 'season-stats', 'calendar', 'teachers', 'attendance', 'documents'];

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

/**
 * Which page a card lands on.
 *
 * The dashboard exists because the family content used to be buried behind an
 * avatar builder on a page called "My Profile". The rule that keeps it that way
 * is one field per card, so the way to break it again is to add a card and
 * forget to think about where it goes — hence a test that every card has an
 * opinion, and that the two lists stay disjoint.
 */
describe('the surface split', () => {
  it('gives the family content to the dashboard', () => {
    expect(idsFor(ctx(), 'dashboard')).toEqual(FAMILY_CARDS);
  });

  it('keeps identity, notifications and account off it', () => {
    expect(idsFor(ctx(), 'account')).toEqual(['identity', 'notifications', 'account']);
  });

  it('puts every card on exactly one surface', () => {
    const dashboard = PROFILE_CARDS.filter(c => c.surface === 'dashboard').map(c => c.id);
    const account = PROFILE_CARDS.filter(c => c.surface === 'account').map(c => c.id);

    expect(dashboard.length + account.length).toBe(PROFILE_CARDS.length);
    expect(dashboard.filter(id => account.includes(id))).toEqual([]);
  });

  it('leaves a member of staff with no children at the studio an empty dashboard', () => {
    // Not a broken page: PortalHome renders the section tiles underneath and
    // simply omits the card column.
    expect(idsFor(ctx({ isStaff: true }), 'dashboard')).toEqual([]);
    expect(idsFor(ctx({ isStaff: true }), 'account')).toEqual(['identity', 'account']);
  });

  it('still answers the visibility question without a surface', () => {
    // Who may see a card and which page renders it are separate rules, and the
    // tests above this block deliberately ask only the first.
    expect(idsFor(ctx())).toEqual(expect.arrayContaining([...FAMILY_CARDS, 'identity', 'account']));
  });
});
