import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ClassWorkspace from './ClassWorkspace';
import { PortalClass, PortalProgram } from '../../types';

/**
 * The screen that answers "can we add the content this class needs".
 *
 * Three kinds of thing hang off a class — info posts, files, and calendar
 * events — and each is written with the class's id on it. The point of this
 * file is that all three are reachable from the class itself and all three are
 * pinned to it: a section rendered without a scope posts to the whole program
 * instead, which is a mistake nobody notices until the wrong families are told
 * about a rehearsal.
 *
 * The three sections are stubbed. They have their own fetches, their own
 * modals and their own upload paths; what matters here is only which of them
 * is mounted and what scope it is handed.
 */

const PROGRAM: PortalProgram = {
  id: 'prog-academy',
  slug: 'academy',
  name: 'Academy / TNT Dancers',
  blurb: '',
  requiresCode: true,
  sortOrder: 2,
  isActive: true,
};

const KLASS: PortalClass = {
  id: 'class-1',
  programId: 'prog-academy',
  category: 'academy',
  name: 'Jr/Teen Hip Hop 2',
  dayOfWeek: 1,
  startTime: '16:15:00',
  endTime: '17:15:00',
  level: '2',
  location: 'Studio 2',
  description: '',
  instructorName: 'Chill Kerney',
  sortOrder: 4,
  isActive: true,
  style: 'Hip Hop',
  ageGroup: 'Junior / Teen',
  ageMinYears: 7,
  ageMaxYears: 18,
  capacity: 20,
  tuitionFee: 77.5,
  registrationFee: 0,
  costumeFee: 0,
  billingCycle: 'Monthly',
  billingDay: 15,
  season: '2026-2027',
  seasonStart: '2026-08-31',
  seasonEnd: '2027-06-20',
  registrationOpens: '2026-08-29',
  sourceTitle: 'Jr/Teen Hip Hop 2 (Chill/M-4:15PM)',
};

const mockAuth = { isAdmin: true };
const mockGrants = { ids: [] as string[] };

// Each stub prints its own name and the scope it was handed, so a section
// mounted without one is visible as data-scope="none" rather than passing.
jest.mock('./UpdatesSection', () => ({ __esModule: true, default: (p: any) => (
  <div data-testid="updates" data-scope={p.scope ? String(p.scope.classId) : 'none'}>updates</div>
) }));
jest.mock('./DocumentsSection', () => ({ __esModule: true, default: (p: any) => (
  <div data-testid="files" data-scope={p.scope ? String(p.scope.classId) : 'none'}>files</div>
) }));
jest.mock('./EventsSection', () => ({ __esModule: true, default: (p: any) => (
  <div data-testid="calendar" data-scope={p.scope ? String(p.scope.classId) : 'none'}>calendar</div>
) }));

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ isAdmin: mockAuth.isAdmin }),
}));

jest.mock('../../contexts/PortalAdminContext', () => ({
  usePortalAdmin: () => ({ editableClassIds: mockGrants.ids }),
}));

const renderWorkspace = () =>
  render(
    <ClassWorkspace
      program={PROGRAM}
      klass={KLASS}
      classes={[KLASS]}
      onBack={jest.fn()}
    />
  );

beforeEach(() => {
  mockAuth.isAdmin = true;
  mockGrants.ids = [];
});

describe('every kind of content a class needs', () => {
  it('offers info, files and a calendar', () => {
    renderWorkspace();
    for (const label of ['Info', 'Files', 'Calendar']) {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
    }
  });

  it('opens on the info posts, which are the substance', () => {
    renderWorkspace();
    expect(screen.getByTestId('updates')).toHaveAttribute('data-scope', 'class-1');
    expect(screen.queryByTestId('files')).not.toBeInTheDocument();
    expect(screen.queryByTestId('calendar')).not.toBeInTheDocument();
  });

  it.each([
    ['Files', 'files'],
    ['Calendar', 'calendar'],
  ])('pins %s to this class and nothing wider', (tab, testId) => {
    renderWorkspace();
    fireEvent.click(screen.getByRole('tab', { name: tab }));

    // The scope is the whole point. Without it the section posts to the
    // program, and every family in it is told about one class's rehearsal.
    expect(screen.getByTestId(testId)).toHaveAttribute('data-scope', 'class-1');
  });

  it('names the class and its schedule at the top', () => {
    renderWorkspace();
    expect(screen.getByRole('heading', { name: KLASS.name })).toBeInTheDocument();
    expect(screen.getByText(/Studio 2/)).toBeInTheDocument();
    expect(screen.getByText(/Chill Kerney/)).toBeInTheDocument();
  });

  it('has a way back out', () => {
    renderWorkspace();
    expect(screen.getByRole('button', { name: /All classes/ })).toBeInTheDocument();
  });
});

describe('a class hidden from parents', () => {
  it('says so, rather than looking the same as a live one', () => {
    // Reachable again only because v26 added portal_classes_read_staff — the
    // row used to vanish from the manager entirely when is_active went false.
    render(
      <ClassWorkspace
        program={PROGRAM}
        klass={{ ...KLASS, isActive: false }}
        classes={[KLASS]}
        onBack={jest.fn()}
      />
    );
    expect(screen.getByText(/Hidden from parents/i)).toBeInTheDocument();
  });
});

describe('a teacher', () => {
  beforeEach(() => {
    mockAuth.isAdmin = false;
    mockGrants.ids = ['class-1'];
  });

  it('sees their own class marked', () => {
    renderWorkspace();
    expect(screen.getByText('Yours')).toBeInTheDocument();
  });

  it('gets the info and files they own', () => {
    renderWorkspace();
    expect(screen.getByRole('tab', { name: 'Info' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Files' })).toBeInTheDocument();
  });

  it('is not offered the calendar, because v44 made writing events admin-only', () => {
    // Not a style choice. portal_events_insert/update/delete are is_admin()
    // alone, so every save from this tab would come back refused — the same
    // dead button the program-wide Info tab was hidden for.
    renderWorkspace();
    expect(screen.queryByRole('tab', { name: 'Calendar' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('calendar')).not.toBeInTheDocument();
  });

  it('cannot reach the events editor even with the tab already selected', () => {
    // The tab is local state, so a teacher can arrive holding 'calendar' from
    // before their access narrowed. It must fall back, not render an editor.
    const { rerender } = render(
      <ClassWorkspace program={PROGRAM} klass={KLASS} classes={[KLASS]} onBack={jest.fn()} />
    );
    mockAuth.isAdmin = true;
    rerender(
      <ClassWorkspace program={PROGRAM} klass={KLASS} classes={[KLASS]} onBack={jest.fn()} />
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Calendar' }));
    expect(screen.getByTestId('calendar')).toBeInTheDocument();

    mockAuth.isAdmin = false;
    rerender(
      <ClassWorkspace program={PROGRAM} klass={KLASS} classes={[KLASS]} onBack={jest.fn()} />
    );
    expect(screen.queryByTestId('calendar')).not.toBeInTheDocument();
    expect(screen.getByTestId('updates')).toBeInTheDocument();
  });
});
