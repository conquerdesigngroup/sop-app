import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TeachersSection from './TeachersSection';

/**
 * The screen that finally switches the per-class grants on.
 *
 * WHAT IS WORTH PINNING HERE
 *
 * Not the matching — instructorMatch.test.ts owns that. What this file is for
 * is the three ways a bulk write can go wrong:
 *
 *   1. It writes a pair that already exists, so re-running it double-counts.
 *   2. It writes a grant for an admin, who could already post everywhere, and
 *      buries the real work under rows that change nothing.
 *   3. A second tap lands before the button disables and everything is granted
 *      twice.
 *
 * The fixtures are the real spellings from the live schedule and the live
 * profiles table, so a regression in normalisation shows up here as a row that
 * suddenly finds nobody.
 */

const CLASSES = [
  { id: 'c1', instructorName: 'Tara Triche', isActive: true },
  { id: 'c2', instructorName: 'Tara Triche', isActive: true },
  { id: 'c3', instructorName: "Ky'ree Nevels", isActive: true },
  { id: 'c4', instructorName: 'Carlos Renteria', isActive: true },
  { id: 'c5', instructorName: 'Guest Choreographer', isActive: true },
];

const mockUsers = [
  { id: 'tara', firstName: 'Tara', lastName: 'Triche', role: 'team', isActive: true },
  { id: 'kyree', firstName: 'Ky’Ree ', lastName: 'Nevels', role: 'team', isActive: true },
  { id: 'carlos', firstName: 'Carlos', lastName: 'Renteria', role: 'admin', isActive: true },
];

const mockApi = {
  fetchAllClasses: jest.fn(),
  fetchAllClassInstructors: jest.fn(),
  grantClassInstructors: jest.fn(),
};
const mockToast = { success: jest.fn(), error: jest.fn() };

jest.mock('../../contexts/PortalAdminContext', () => ({
  usePortalAdmin: () => mockApi,
  describeWriteError: (e: any) => (e instanceof Error ? e.message : 'Could not save that.'),
}));
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ users: mockUsers }) }));
jest.mock('../../contexts/ToastContext', () => ({ useToast: () => mockToast }));
jest.mock('../../contexts/RefreshContext', () => ({ useRefreshable: () => {} }));
jest.mock('../../hooks/useResponsive', () => ({
  useResponsive: () => ({ isMobileOrTablet: false }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockApi.fetchAllClasses.mockResolvedValue(CLASSES);
  mockApi.fetchAllClassInstructors.mockResolvedValue([]);
  mockApi.grantClassInstructors.mockResolvedValue(3);
});

const renderAndSettle = async () => {
  render(<TeachersSection />);
  // The fetch resolves outside act(), so only a retrying wait catches the row.
  // Queried by the select's label rather than the name: the name also appears
  // as an <option> in every row's dropdown, so getByText would find several.
  await waitFor(() =>
    expect(screen.getByLabelText(/Staff account for Tara Triche/i)).toBeInTheDocument()
  );
};

const applyButton = () =>
  screen.getByRole('button', { name: /Give these teachers their classes/i });

describe('the list an admin works through', () => {
  it('is one row per teacher, not one per class', async () => {
    await renderAndSettle();
    // Tara holds two classes and gets one row, not two.
    expect(screen.getAllByLabelText(/Staff account for Tara Triche/i)).toHaveLength(1);
    expect(screen.getByText(/^2 classes/)).toBeInTheDocument();
  });

  it('finds the account behind a differently-punctuated name', async () => {
    await renderAndSettle();
    const select = screen.getByLabelText(/Staff account for Ky'ree Nevels/i);
    expect(select).toHaveValue('kyree');
  });

  it('says plainly that an admin needs nothing', async () => {
    await renderAndSettle();
    expect(screen.getByText(/can already post to every class/i)).toBeInTheDocument();
  });

  it('leaves a name that is not a person unassigned', async () => {
    await renderAndSettle();
    expect(screen.getByLabelText(/Staff account for Guest Choreographer/i)).toHaveValue('');
  });
});

describe('applying', () => {
  it('grants the teachers and skips the admin', async () => {
    await renderAndSettle();
    fireEvent.click(applyButton());

    await waitFor(() => expect(mockApi.grantClassInstructors).toHaveBeenCalledTimes(1));
    const pairs = mockApi.grantClassInstructors.mock.calls[0][0];

    // Tara's two, Ky'ree's one. Carlos is an admin and the guest has no
    // account, so neither costs a row.
    expect(pairs).toHaveLength(3);
    expect(pairs).toEqual(
      expect.arrayContaining([
        { classId: 'c1', profileId: 'tara' },
        { classId: 'c2', profileId: 'tara' },
        { classId: 'c3', profileId: 'kyree' },
      ])
    );
    expect(pairs.map((p: any) => p.profileId)).not.toContain('carlos');
  });

  it('does not re-grant a class that already has that teacher', async () => {
    mockApi.fetchAllClassInstructors.mockResolvedValue([{ classId: 'c1', profileId: 'tara' }]);
    await renderAndSettle();
    fireEvent.click(applyButton());

    await waitFor(() => expect(mockApi.grantClassInstructors).toHaveBeenCalledTimes(1));
    const pairs = mockApi.grantClassInstructors.mock.calls[0][0];
    expect(pairs).toHaveLength(2);
    expect(pairs).not.toContainEqual({ classId: 'c1', profileId: 'tara' });
  });

  it('starts nothing on a second tap', async () => {
    // The first tap's promise is still open, which is exactly the window a
    // frustrated double-tap lands in.
    let release: (n: number) => void = () => {};
    mockApi.grantClassInstructors.mockReturnValue(new Promise<number>(r => { release = r; }));

    await renderAndSettle();
    const button = applyButton();
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    expect(mockApi.grantClassInstructors).toHaveBeenCalledTimes(1);
    release(3);
    await waitFor(() => expect(mockApi.fetchAllClasses).toHaveBeenCalledTimes(2));
  });

  it('says what happened, in words, when it worked', async () => {
    await renderAndSettle();
    fireEvent.click(applyButton());
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/3 classes are now editable/i)
    );
  });

  it('says nothing was changed when the write failed', async () => {
    mockApi.grantClassInstructors.mockRejectedValue(new Error('row-level security'));
    await renderAndSettle();
    fireEvent.click(applyButton());

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/Nothing was changed/i)
    );
    expect(mockToast.error).toHaveBeenCalled();
  });

  it('has nothing to do once every grant exists', async () => {
    mockApi.fetchAllClassInstructors.mockResolvedValue([
      { classId: 'c1', profileId: 'tara' },
      { classId: 'c2', profileId: 'tara' },
      { classId: 'c3', profileId: 'kyree' },
    ]);
    await renderAndSettle();
    expect(applyButton()).toBeDisabled();
    expect(screen.getByText(/Nothing left to grant/i)).toBeInTheDocument();
  });
});

describe('an admin overruling the suggestion', () => {
  it('keeps a cleared row cleared instead of snapping back to the guess', async () => {
    await renderAndSettle();
    const select = screen.getByLabelText(/Staff account for Tara Triche/i);
    fireEvent.change(select, { target: { value: '' } });

    expect(select).toHaveValue('');
    fireEvent.click(applyButton());

    await waitFor(() => expect(mockApi.grantClassInstructors).toHaveBeenCalled());
    const pairs = mockApi.grantClassInstructors.mock.calls[0][0];
    expect(pairs.map((p: any) => p.profileId)).not.toContain('tara');
  });

  it('grants the account a person picked by hand for an unmatched name', async () => {
    await renderAndSettle();
    fireEvent.change(screen.getByLabelText(/Staff account for Guest Choreographer/i), {
      target: { value: 'tara' },
    });
    fireEvent.click(applyButton());

    await waitFor(() => expect(mockApi.grantClassInstructors).toHaveBeenCalled());
    expect(mockApi.grantClassInstructors.mock.calls[0][0]).toContainEqual({
      classId: 'c5',
      profileId: 'tara',
    });
  });
});
