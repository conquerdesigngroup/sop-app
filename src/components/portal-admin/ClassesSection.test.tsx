import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ClassesSection from './ClassesSection';
import { PortalClass, PortalProgram } from '../../types';

/**
 * The class editor, driven the way a person drives it.
 *
 * WHY THIS EXISTS
 *
 * v25 widened portal_classes from eleven columns to twenty-seven. Every one of
 * them has to survive a round trip through five hand-written translations — a
 * Postgres row, mapClass(), PortalClass, toDraft(), a form control, and back
 * out through saveClass(). A field dropped from any one of those disappears
 * silently: the editor opens, shows nothing in that box, and writes NULL over
 * whatever was there the moment somebody presses Save on an unrelated change.
 *
 * That is the bug this file exists to catch, and the first test is the one that
 * catches it: open a fully populated class, press Save without touching
 * anything, and require the payload to equal what came in. It asserts the whole
 * object rather than a handful of fields, because a spot check only ever covers
 * the fields somebody remembered — which is the same lapse that loses a column.
 *
 * Fields are found by their visible label. That only works because Input,
 * Select and Textarea now wire htmlFor to the field's id; before that every
 * labelled field in this app was anonymous to a screen reader too.
 *
 * fireEvent rather than userEvent: the pinned user-event is 13.5.0, which has
 * no setup() and types character by character — which a date input rejects.
 * fireEvent.change sets a value in one go and is wrapped in act by RTL.
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

/** A row exactly as the v25 import wrote it, with every column populated. */
const IMPORTED: PortalClass = {
  id: 'class-1',
  programId: 'prog-academy',
  category: 'academy',
  name: 'Jr/Teen Hip Hop 2',
  dayOfWeek: 1,
  startTime: '16:15:00',
  endTime: '17:15:00',
  level: '2',
  location: 'Studio 2',
  description: 'Hip hop at DIDC is grooves, choreography, musicality.',
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

// --------------------------------------------------------------- mocks

// jest.mock factories are hoisted above these declarations, so everything they
// close over has to be `mock`-prefixed — babel-plugin-jest-hoist enforces it.
const mockSaveClass = jest.fn();
const mockSetClassInstructors = jest.fn();
const mockFetchClassInstructors = jest.fn();
const mockDeleteClass = jest.fn();
const mockAuth = { isAdmin: true };

jest.mock('../../contexts/PortalAdminContext', () => ({
  usePortalAdmin: () => ({
    saveClass: mockSaveClass,
    deleteClass: mockDeleteClass,
    fetchClassInstructors: mockFetchClassInstructors,
    setClassInstructors: mockSetClassInstructors,
    editableClassIds: [],
  }),
  describeWriteError: (e: unknown) => String(e),
}));

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    isAdmin: mockAuth.isAdmin,
    users: [
      { id: 'u1', firstName: 'Chill', lastName: 'Kerney', role: 'team', isActive: true },
      { id: 'u2', firstName: 'Alyssa', lastName: 'Zuppardo', role: 'admin', isActive: true },
    ],
  }),
}));

jest.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ success: jest.fn(), error: jest.fn() }),
}));

jest.mock('../../hooks/useConfirm', () => ({
  useConfirm: () => ({ confirm: jest.fn().mockResolvedValue(true), confirmDialog: null }),
}));

// --------------------------------------------------------------- helpers

const renderSection = (classes: PortalClass[] = [IMPORTED]) =>
  render(
    <ClassesSection
      program={PROGRAM}
      classes={classes}
      loading={false}
      error={null}
      reload={jest.fn()}
    />
  );

/** Open the editor for the imported class and return its dialog. */
const openEditor = async (): Promise<HTMLElement> => {
  fireEvent.click(screen.getByRole('button', { name: `Edit ${IMPORTED.name}` }));
  const dialog = await screen.findByRole('dialog');
  // The instructor grants land through an effect. Waiting for them here keeps
  // every later assertion clear of a re-render arriving mid-test.
  await waitFor(() => expect(mockFetchClassInstructors).toHaveBeenCalledWith('class-1'));
  return dialog;
};

const field = (dialog: HTMLElement, label: string) =>
  within(dialog).getByLabelText(label) as HTMLInputElement;

const setValue = (dialog: HTMLElement, label: string, value: string) =>
  fireEvent.change(field(dialog, label), { target: { value } });

const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save' }));

const savedPayload = async () => {
  await waitFor(() => expect(mockSaveClass).toHaveBeenCalledTimes(1));
  return mockSaveClass.mock.calls[0][0];
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.isAdmin = true;
  mockSaveClass.mockResolvedValue('class-1');
  mockSetClassInstructors.mockResolvedValue(undefined);
  mockFetchClassInstructors.mockResolvedValue(['u1']);
});

// --------------------------------------------------------------- round trip

describe('open and save without touching anything', () => {
  it('writes back exactly what it read', async () => {
    renderSection();
    await openEditor();
    save();

    expect(await savedPayload()).toEqual({
      id: 'class-1',
      programId: 'prog-academy',
      category: 'academy',
      name: 'Jr/Teen Hip Hop 2',
      dayOfWeek: 1,
      startTime: '16:15:00',
      endTime: '17:15:00',
      level: '2',
      location: 'Studio 2',
      description: 'Hip hop at DIDC is grooves, choreography, musicality.',
      instructorName: 'Chill Kerney',
      sortOrder: 4,
      isActive: true,
      style: 'Hip Hop',
      ageGroup: 'Junior / Teen',
      ageMinYears: 7,
      ageMaxYears: 18,
      capacity: 20,
      tuitionFee: 77.5,
      season: '2026-2027',
      seasonStart: '2026-08-31',
      seasonEnd: '2027-06-20',
    });
  });

  it('shows every stored value in its own field', async () => {
    renderSection();
    const dialog = await openEditor();

    expect(field(dialog, 'Class name')).toHaveValue('Jr/Teen Hip Hop 2');
    expect(field(dialog, 'Shown on')).toHaveValue('academy');
    expect(field(dialog, 'Day')).toHaveValue('1');
    expect(field(dialog, 'Starts')).toHaveValue('16:15');
    expect(field(dialog, 'Ends')).toHaveValue('17:15');
    expect(field(dialog, 'Level (optional)')).toHaveValue('2');
    expect(field(dialog, 'Room (optional)')).toHaveValue('Studio 2');
    expect(field(dialog, 'Teacher shown to parents (optional)')).toHaveValue('Chill Kerney');
    expect(field(dialog, 'Description (optional)')).toHaveValue(IMPORTED.description);
    expect(field(dialog, 'Style (optional)')).toHaveValue('Hip Hop');
    expect(field(dialog, 'Age group (optional)')).toHaveValue('Junior / Teen');
    expect(field(dialog, 'Youngest age')).toHaveValue(7);
    expect(field(dialog, 'Oldest age')).toHaveValue(18);
    expect(field(dialog, 'Class size (optional)')).toHaveValue(20);
    expect(field(dialog, 'Monthly tuition (optional)')).toHaveValue(77.5);
    expect(field(dialog, 'Season (optional)')).toHaveValue('2026-2027');
    expect(field(dialog, 'First class')).toHaveValue('2026-08-31');
    expect(field(dialog, 'Last class')).toHaveValue('2027-06-20');
    expect(field(dialog, 'Order in the list')).toHaveValue(4);
  });
});

// --------------------------------------------------------------- editing

describe('editing a field', () => {
  const cases: { label: string; input: string; key: string; expected: unknown }[] = [
    { label: 'Class name', input: 'Teen Hip Hop 4', key: 'name', expected: 'Teen Hip Hop 4' },
    { label: 'Shown on', input: 'tnt', key: 'category', expected: 'tnt' },
    { label: 'Day', input: '5', key: 'dayOfWeek', expected: 5 },
    { label: 'Starts', input: '09:30', key: 'startTime', expected: '09:30:00' },
    { label: 'Ends', input: '18:45', key: 'endTime', expected: '18:45:00' },
    { label: 'Level (optional)', input: '3', key: 'level', expected: '3' },
    { label: 'Room (optional)', input: 'Studio 4', key: 'location', expected: 'Studio 4' },
    { label: 'Teacher shown to parents (optional)', input: 'Tara Triche', key: 'instructorName', expected: 'Tara Triche' },
    { label: 'Description (optional)', input: 'Bring knee pads.', key: 'description', expected: 'Bring knee pads.' },
    { label: 'Style (optional)', input: 'Jazz', key: 'style', expected: 'Jazz' },
    { label: 'Age group (optional)', input: 'Teen', key: 'ageGroup', expected: 'Teen' },
    { label: 'Youngest age', input: '9', key: 'ageMinYears', expected: 9 },
    { label: 'Oldest age', input: '14', key: 'ageMaxYears', expected: 14 },
    { label: 'Class size (optional)', input: '12', key: 'capacity', expected: 12 },
    { label: 'Monthly tuition (optional)', input: '69', key: 'tuitionFee', expected: 69 },
    { label: 'Season (optional)', input: '2027-2028', key: 'season', expected: '2027-2028' },
    // Inside the existing season on purpose. 2027-09-01 is after the stored
    // end of 2027-06-20, and the season-order check correctly refuses that —
    // which the "season ends before it starts" case below covers deliberately.
    { label: 'First class', input: '2026-09-07', key: 'seasonStart', expected: '2026-09-07' },
    { label: 'Last class', input: '2028-06-18', key: 'seasonEnd', expected: '2028-06-18' },
    { label: 'Order in the list', input: '9', key: 'sortOrder', expected: 9 },
  ];

  it.each(cases)('carries "$label" through to the save', async ({ label, input, key, expected }) => {
    renderSection();
    const dialog = await openEditor();
    setValue(dialog, label, input);
    save();
    expect(await savedPayload()).toMatchObject({ [key]: expected });
  });

  it('carries the visibility tick', async () => {
    renderSection();
    const dialog = await openEditor();
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Show on the schedule/ }));
    save();
    expect(await savedPayload()).toMatchObject({ isActive: false });
  });

  it('clears a number to null rather than to zero', async () => {
    // Number('') is 0, so the obvious implementation turns a deleted price into
    // a free class and a deleted capacity into a class nobody may join.
    renderSection();
    const dialog = await openEditor();
    setValue(dialog, 'Monthly tuition (optional)', '');
    setValue(dialog, 'Class size (optional)', '');
    setValue(dialog, 'Youngest age', '');
    save();
    expect(await savedPayload()).toMatchObject({
      tuitionFee: null, capacity: null, ageMinYears: null,
    });
  });

  it('turns an emptied text field into null, not an empty string', async () => {
    renderSection();
    const dialog = await openEditor();
    for (const label of [
      'Level (optional)', 'Room (optional)', 'Style (optional)',
      'Age group (optional)', 'Season (optional)', 'Teacher shown to parents (optional)',
    ]) {
      setValue(dialog, label, '');
    }
    save();
    expect(await savedPayload()).toMatchObject({
      level: null, location: null, style: null,
      ageGroup: null, season: null, instructorName: null,
    });
  });

  it('lets a class go back to having no fixed day', async () => {
    renderSection();
    const dialog = await openEditor();
    setValue(dialog, 'Day', '');
    save();
    expect(await savedPayload()).toMatchObject({ dayOfWeek: null });
  });
});

// --------------------------------------------------------------- validation

describe('validation', () => {
  const expectRefusal = async (edit: (d: HTMLElement) => void, message: RegExp) => {
    renderSection();
    const dialog = await openEditor();
    edit(dialog);
    save();
    expect(await within(dialog).findByText(message)).toBeInTheDocument();
    expect(mockSaveClass).not.toHaveBeenCalled();
  };

  it('refuses a class with no name', () =>
    expectRefusal(d => setValue(d, 'Class name', '   '), /Give the class a name/));

  it('refuses a class that ends before it starts', () =>
    expectRefusal(d => setValue(d, 'Ends', '15:00'), /ends before it starts/i));

  it('refuses an age range that runs backwards', () =>
    // portal_classes_age_order would reject this too; catching it here is the
    // difference between a sentence and a raw constraint name.
    expectRefusal(d => setValue(d, 'Oldest age', '5'), /oldest age is younger than the youngest/i));

  it('refuses a season that ends before it starts', () =>
    expectRefusal(d => setValue(d, 'Last class', '2026-01-01'), /season ends before it starts/i));
});

// --------------------------------------------------------------- new classes

describe('a brand-new class', () => {
  const openNew = async () => {
    fireEvent.click(screen.getAllByRole('button', { name: /New class/ })[0]);
    return screen.findByRole('dialog');
  };

  it('inherits the season from the classes already in the program', async () => {
    // Retyping four dates per class is how a schedule ends up with three
    // different season ends and a month view that stops early for no reason.
    renderSection();
    const dialog = await openNew();

    expect(field(dialog, 'Season (optional)')).toHaveValue('2026-2027');
    expect(field(dialog, 'First class')).toHaveValue('2026-08-31');
    expect(field(dialog, 'Last class')).toHaveValue('2027-06-20');
  });

  it('defaults its schedule to the program it was created in', async () => {
    renderSection();
    const dialog = await openNew();
    expect(field(dialog, 'Shown on')).toHaveValue('academy');

    setValue(dialog, 'Class name', 'Mini Tap 1');
    save();

    const payload = await savedPayload();
    expect(payload).toMatchObject({
      name: 'Mini Tap 1', category: 'academy', programId: 'prog-academy',
    });
    expect(payload.id).toBeUndefined();
  });

  it('can be filed on the All-Star schedule from the Academy program', async () => {
    // category and program are different questions — a class filed under
    // Academy can still be listed on the All-Star schedule.
    renderSection();
    const dialog = await openNew();
    setValue(dialog, 'Class name', 'Guest Company Call');
    setValue(dialog, 'Shown on', 'allstars');
    save();

    expect(await savedPayload()).toMatchObject({
      category: 'allstars', programId: 'prog-academy',
    });
  });
});

// --------------------------------------------------------------- teachers

describe('who can post to the class', () => {
  it('saves the instructor grants alongside the class', async () => {
    renderSection();
    const dialog = await openEditor();

    const chill = within(dialog).getByRole('checkbox', { name: /Chill Kerney/ });
    await waitFor(() => expect(chill).toBeChecked());

    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Alyssa Zuppardo/ }));
    save();

    await waitFor(() =>
      expect(mockSetClassInstructors).toHaveBeenCalledWith('class-1', ['u1', 'u2']));
  });

  it('offers no record editing at all to a teacher', async () => {
    // portal_classes_write is admin-only, so a teacher's save would be refused
    // by Postgres. The UI mirrors that rather than letting them try.
    mockAuth.isAdmin = false;
    renderSection();

    expect(screen.queryByRole('button', { name: /New class/ })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: `Edit ${IMPORTED.name}` })
    ).not.toBeInTheDocument();
  });
});

// --------------------------------------------------------------- grant safety

describe('the teacher grants are never written on a guess', () => {
  it('leaves them alone when Save beats the fetch that loads them', async () => {
    // setClassInstructors treats its argument as the whole truth and deletes
    // the difference. The list starts empty, so writing it before the fetch
    // lands revokes every teacher on the class — silently, under a toast that
    // says "Class updated."
    let release: (ids: string[]) => void = () => {};
    mockFetchClassInstructors.mockReturnValue(
      new Promise<string[]>(resolve => { release = resolve; })
    );

    renderSection();
    fireEvent.click(screen.getByRole('button', { name: `Edit ${IMPORTED.name}` }));
    await screen.findByRole('dialog');
    save();

    await waitFor(() => expect(mockSaveClass).toHaveBeenCalledTimes(1));
    expect(mockSetClassInstructors).not.toHaveBeenCalled();

    release(['u1']);
  });

  it('says so, and still saves the class, when they cannot be loaded at all', async () => {
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockFetchClassInstructors.mockRejectedValue(new Error('offline'));

    renderSection();
    fireEvent.click(screen.getByRole('button', { name: `Edit ${IMPORTED.name}` }));
    const dialog = await screen.findByRole('dialog');

    expect(await within(dialog).findByText(/Could not load who can post/i)).toBeInTheDocument();

    save();
    await waitFor(() => expect(mockSaveClass).toHaveBeenCalledTimes(1));
    expect(mockSetClassInstructors).not.toHaveBeenCalled();

    quiet.mockRestore();
  });

  it('writes them once they have loaded', async () => {
    renderSection();
    const dialog = await openEditor();
    await waitFor(() =>
      expect(within(dialog).getByRole('checkbox', { name: /Chill Kerney/ })).toBeChecked());

    save();
    await waitFor(() => expect(mockSetClassInstructors).toHaveBeenCalledWith('class-1', ['u1']));
  });
});

// --------------------------------------------------------------- whole numbers

describe('numbers the database can actually store', () => {
  const refuse = async (label: string, value: string, message: RegExp) => {
    renderSection();
    const dialog = await openEditor();
    setValue(dialog, label, value);
    save();
    expect(await within(dialog).findByText(message)).toBeInTheDocument();
    expect(mockSaveClass).not.toHaveBeenCalled();
  };

  // age_min_years, age_max_years and capacity are all smallint. Left to reach
  // Postgres, "2.5" fails the whole save — times and description too — under
  // `invalid input syntax for type smallint: "2.5"`.
  it('refuses a fractional age', () => refuse('Youngest age', '2.5', /whole numbers/i));
  it('refuses a fractional class size', () => refuse('Class size (optional)', '12.5', /whole numbers/i));
  it('refuses a number too big for a smallint', () =>
    refuse('Class size (optional)', '40000', /between 0 and 999/i));

  it('marks the fields as whole-number-only for the browser too', async () => {
    renderSection();
    const dialog = await openEditor();
    expect(field(dialog, 'Youngest age')).toHaveAttribute('step', '1');
    expect(field(dialog, 'Oldest age')).toHaveAttribute('step', '1');
    expect(field(dialog, 'Class size (optional)')).toHaveAttribute('step', '1');
  });
});

// --------------------------------------------------------------- long lists

describe('a program with a real number of classes', () => {
  const many: PortalClass[] = [
    { ...IMPORTED, id: 'a', name: 'Combo', dayOfWeek: 1, instructorName: 'Tara Triche', location: 'Studio 3', sortOrder: 14 },
    { ...IMPORTED, id: 'b', name: 'Combo', dayOfWeek: 2, instructorName: 'Kansas O’Dwyer', location: 'Studio 3', sortOrder: 32 },
    { ...IMPORTED, id: 'c', name: 'Ballet 3A', dayOfWeek: 4, instructorName: 'Chrisilla Adrien', location: 'Studio 4', sortOrder: 78 },
    ...Array.from({ length: 7 }, (_, i) => ({
      ...IMPORTED, id: `x${i}`, name: `Filler ${i}`, instructorName: 'Someone Else', sortOrder: 90 + i,
    })),
  ];

  it('offers a search once the list is long', () => {
    renderSection(many);
    expect(screen.getByLabelText('Search classes')).toBeInTheDocument();
    expect(screen.getByText('10 classes')).toBeInTheDocument();
  });

  it('does not offer one when there is nothing to search', () => {
    renderSection();
    expect(screen.queryByLabelText('Search classes')).not.toBeInTheDocument();
  });

  it('finds a class by its teacher', () => {
    renderSection(many);
    fireEvent.change(screen.getByLabelText('Search classes'), { target: { value: 'chrisilla' } });

    expect(screen.getByText('Ballet 3A')).toBeInTheDocument();
    expect(screen.queryByText('Filler 0')).not.toBeInTheDocument();
    expect(screen.getByText('1 of 10')).toBeInTheDocument();
  });

  it('finds a class by the day it runs, which is not text on the row', () => {
    renderSection(many);
    fireEvent.change(screen.getByLabelText('Search classes'), { target: { value: 'thursday' } });
    expect(screen.getByText('Ballet 3A')).toBeInTheDocument();
    expect(screen.getByText('1 of 10')).toBeInTheDocument();
  });

  it('says a search found nothing without offering to create a class', () => {
    renderSection(many);
    fireEvent.change(screen.getByLabelText('Search classes'), { target: { value: 'zzzz' } });
    expect(screen.getByText(/No classes match that/i)).toBeInTheDocument();
  });

  it('numbers a new class past the highest, not past the count', async () => {
    // classes.length + 1 would be 11, which after the v25 import lands the new
    // class in the middle of a Monday afternoon.
    renderSection(many);
    fireEvent.click(screen.getAllByRole('button', { name: /New class/ })[0]);
    const dialog = await screen.findByRole('dialog');

    expect(field(dialog, 'Order in the list')).toHaveValue(97);

    setValue(dialog, 'Class name', 'Mini Tap 1');
    save();
    expect(await savedPayload()).toMatchObject({ sortOrder: 97 });
  });
});
