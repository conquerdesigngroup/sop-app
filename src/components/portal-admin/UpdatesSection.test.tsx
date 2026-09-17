import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import UpdatesSection from './UpdatesSection';
import { PortalClass, PortalProgram, PortalUpdate } from '../../types';

/**
 * The info post editor, driven the way a person drives it.
 *
 * WHY THIS EXISTS
 *
 * v54 gave a post a link, and a link is the one field on this form that is not
 * just text: it ends up in an href a parent taps. Three things therefore have
 * to hold, and each has a test below.
 *
 * 1. The value survives the round trip — row to toDraft to a form control and
 *    back out through saveUpdate. A field dropped anywhere in that chain writes
 *    NULL over a working link the next time somebody fixes a typo.
 * 2. A dangerous scheme is refused BEFORE the write, with a sentence next to
 *    the form rather than a thrown error.
 * 3. A label cannot be stranded without a link to label.
 *
 * Fields are found by their visible label, which works because Input wires
 * htmlFor to the field's id.
 */

const PROGRAM: PortalProgram = {
  id: 'prog-academy',
  slug: 'academy',
  name: 'Academy / TNT Dancers',
  blurb: '',
  requiresCode: true,
  sortOrder: 2,
  isActive: true,
  heroPath: null,
  heroAlt: '',
};

const ALL_STARS: PortalProgram = {
  ...PROGRAM,
  id: 'prog-allstars',
  slug: 'allstars',
  name: 'All-Star Dancers',
  requiresCode: false,
  sortOrder: 1,
};

// What the picker offers, in the order the editor's section tabs show them.
const mockPrograms: PortalProgram[] = [ALL_STARS, PROGRAM];

const post = (over: Partial<PortalUpdate> = {}): PortalUpdate => ({
  id: 'upd-1',
  programId: 'prog-academy',
  classId: null,
  householdId: null,
  title: 'Recital tickets are on sale',
  body: 'Tickets are available now.',
  linkUrl: null,
  linkLabel: null,
  isPinned: false,
  isPublished: true,
  publishedAt: '2026-08-28T09:00:00Z',
  authorId: null,
  createdAt: '2026-08-28T09:00:00Z',
  updatedAt: '2026-08-28T09:00:00Z',
  ...over,
});

// --------------------------------------------------------------- mocks

// jest.mock factories are hoisted above these declarations, so anything they
// close over has to be `mock`-prefixed.
const mockSaveUpdate = jest.fn();
const mockFetchUpdates = jest.fn();

jest.mock('../../contexts/PortalAdminContext', () => ({
  usePortalAdmin: () => ({
    fetchUpdates: mockFetchUpdates,
    saveUpdate: mockSaveUpdate,
    deleteUpdate: jest.fn(),
    canEditClass: () => true,
    editableClassIds: [],
    programs: mockPrograms,
  }),
  describeWriteError: (e: any) => String(e?.message ?? e),
}));

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ isAdmin: true }),
}));

jest.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ success: jest.fn(), error: jest.fn() }),
}));

jest.mock('../../contexts/RefreshContext', () => ({
  useRefreshable: () => {},
}));

jest.mock('../../hooks/useConfirm', () => ({
  useConfirm: () => ({ confirm: jest.fn().mockResolvedValue(true), confirmDialog: null }),
}));

jest.mock('../../hooks/useResponsive', () => ({
  useResponsive: () => ({ isMobileOrTablet: false }),
}));

// --------------------------------------------------------------- helpers

const CLASSES: PortalClass[] = [];

const renderSection = () =>
  render(<UpdatesSection program={PROGRAM} classes={CLASSES} scope={{ classId: null }} />);

/**
 * The list load resolves outside act, so the dialog is awaited rather than
 * queried — a plain getBy here passes or fails on timing.
 */
const openEditor = async (title: string): Promise<HTMLElement> => {
  fireEvent.click(await screen.findByRole('button', { name: `Edit ${title}` }));
  return screen.findByRole('dialog');
};

const openNew = async (): Promise<HTMLElement> => {
  fireEvent.click(await screen.findByRole('button', { name: /New info post/ }));
  return screen.findByRole('dialog');
};

const setValue = (dialog: HTMLElement, label: string | RegExp, value: string) =>
  fireEvent.change(within(dialog).getByLabelText(label), { target: { value } });

const save = (dialog: HTMLElement) =>
  fireEvent.click(within(dialog).getByRole('button', { name: /Publish|Save draft/ }));

beforeEach(() => {
  jest.clearAllMocks();
  mockSaveUpdate.mockResolvedValue(undefined);
  mockFetchUpdates.mockResolvedValue([post()]);
});

// --------------------------------------------------------------- round trip

describe('a post that already has a link', () => {
  beforeEach(() => {
    mockFetchUpdates.mockResolvedValue([
      post({ linkUrl: 'https://www.didc.app/tickets', linkLabel: 'Buy recital tickets' }),
    ]);
  });

  it('shows it, and writes it back untouched', async () => {
    renderSection();
    const dialog = await openEditor('Recital tickets are on sale');

    expect(within(dialog).getByLabelText(/^Link/)).toHaveValue('https://www.didc.app/tickets');
    expect(within(dialog).getByLabelText('Button text')).toHaveValue('Buy recital tickets');

    save(dialog);
    await waitFor(() => expect(mockSaveUpdate).toHaveBeenCalledTimes(1));
    expect(mockSaveUpdate.mock.calls[0][0]).toMatchObject({
      id: 'upd-1',
      linkUrl: 'https://www.didc.app/tickets',
      linkLabel: 'Buy recital tickets',
    });
  });

  it('tells staff which posts carry one, and where it goes', async () => {
    renderSection();
    expect(await screen.findByText(/didc\.app/)).toBeInTheDocument();
  });
});

describe('a post with no link', () => {
  it('sends empty strings, which saveUpdate turns into NULL', async () => {
    renderSection();
    const dialog = await openNew();
    setValue(dialog, 'Title', 'Studio closed Monday');
    save(dialog);

    await waitFor(() => expect(mockSaveUpdate).toHaveBeenCalledTimes(1));
    expect(mockSaveUpdate.mock.calls[0][0]).toMatchObject({ linkUrl: '', linkLabel: '' });
  });

  it('will not let a label be typed with nothing to label', async () => {
    // Not styling. A label with no URL is a row the v54 CHECK refuses, so the
    // field is shut until there is a link for it to name.
    renderSection();
    const dialog = await openNew();
    expect(within(dialog).getByLabelText('Button text')).toBeDisabled();

    setValue(dialog, /^Link/, 'didc.app/tickets');
    expect(within(dialog).getByLabelText('Button text')).not.toBeDisabled();
  });
});

// --------------------------------------------------------------- refusal

describe('a link that must never reach an href', () => {
  it('is refused with a sentence, and nothing is saved', async () => {
    renderSection();
    const dialog = await openNew();
    setValue(dialog, 'Title', 'Tap here');
    setValue(dialog, /^Link/, 'javascript:alert(1)');
    save(dialog);

    expect(await within(dialog).findByText(/must start with http/i)).toBeInTheDocument();
    // The whole point: the form stops it, so saveUpdate and the CHECK
    // constraint behind it are never the thing a person finds out from.
    expect(mockSaveUpdate).not.toHaveBeenCalled();
  });
});

// --------------------------------------------------------------- audience

/**
 * Who a post goes to (v55).
 *
 * Since the All-Star section closed to families without a dancer on a team,
 * the section a post is filed under decides which families can read it. The
 * welcome note meant for everyone had been filed under All-Stars, and the owner
 * asked for the choice to be explicit: All-Stars, Academy/TNT, or both.
 */
describe('who a post goes to', () => {
  it('starts on the section in view, and can be sent to both', async () => {
    renderSection();
    const dialog = await openNew();

    const picker = within(dialog).getByLabelText('Who sees this');
    expect(picker).toHaveValue('prog-academy');

    fireEvent.change(picker, { target: { value: 'both' } });
    expect(within(dialog).getByText('Every family sees it, in both sections.')).toBeInTheDocument();

    setValue(dialog, 'Title', 'Welcome to the new app');
    save(dialog);

    await waitFor(() => expect(mockSaveUpdate).toHaveBeenCalledTimes(1));
    // Both sections is no section at all: a NULL program, listed in each.
    expect(mockSaveUpdate.mock.calls[0][0]).toMatchObject({ programId: null, classId: null });
  });

  it('says plainly when only All-Star families will see it', async () => {
    renderSection();
    const dialog = await openNew();
    fireEvent.change(within(dialog).getByLabelText('Who sees this'), { target: { value: 'prog-allstars' } });

    expect(within(dialog).getByText('Only All-Star families see it.')).toBeInTheDocument();

    setValue(dialog, 'Title', 'Competition schedule');
    save(dialog);

    await waitFor(() => expect(mockSaveUpdate).toHaveBeenCalledTimes(1));
    expect(mockSaveUpdate.mock.calls[0][0]).toMatchObject({ programId: 'prog-allstars' });
  });

  it('marks a post that goes to both sections, and reopens it that way', async () => {
    // Listed under every section tab, so editing it in one edits it in all —
    // which is what the badge is there to say.
    mockFetchUpdates.mockResolvedValue([post({ programId: null, title: 'APP INFO' })]);
    renderSection();

    expect(await screen.findByText('Both sections')).toBeInTheDocument();
    const dialog = await openEditor('APP INFO');
    expect(within(dialog).getByLabelText('Who sees this')).toHaveValue('both');
  });

  it('offers no choice inside a class, whose families are already decided', async () => {
    mockFetchUpdates.mockResolvedValue([]);
    render(<UpdatesSection program={PROGRAM} classes={CLASSES} scope={{ classId: 'cls-1' }} />);

    const dialog = await openNew();
    expect(within(dialog).queryByLabelText('Who sees this')).not.toBeInTheDocument();
  });
});
