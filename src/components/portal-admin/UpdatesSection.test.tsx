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
