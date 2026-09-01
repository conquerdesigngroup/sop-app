import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import PayRatesManager from './PayRatesManager';

/**
 * The pay-rates editor is one person at a time: a person list (a dropdown
 * on a phone) and that person's rates as a vertical form. These pin the
 * bits that would silently break payroll if they regressed — a typed rate
 * must reach setEmployeePayRate exactly once, and the bulk actions must
 * write the right value to the right person.
 */

const mockUsers = [
  { id: 'u-amy', firstName: 'Amy', lastName: 'M', isActive: true },
  { id: 'u-alyssa', firstName: 'Alyssa', lastName: 'Zuppardo', isActive: true },
  { id: 'u-gone', firstName: 'Former', lastName: 'Staff', isActive: false },
];

const mockCategories = [
  { id: 'c-teach', name: 'Teach', sortOrder: 1, isActive: true, createdAt: '' },
  { id: 'c-assist', name: 'Assist', sortOrder: 2, isActive: true, createdAt: '' },
  { id: 'c-old', name: 'Retired', sortOrder: 3, isActive: false, createdAt: '' },
];

let mockRates: { employeeId: string; categoryId: string; hourlyRate: number }[] = [];
const mockSetRate = jest.fn(async (employeeId: string, categoryId: string, hourlyRate: number) => {
  mockRates = mockRates.filter(r => !(r.employeeId === employeeId && r.categoryId === categoryId));
  mockRates.push({ employeeId, categoryId, hourlyRate });
});
const mockShowToast = jest.fn();
const mockResponsive = { isMobileOrTablet: false };

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ users: mockUsers }),
}));
jest.mock('../../contexts/WorkHoursContext', () => ({
  useWorkHours: () => ({
    workCategories: mockCategories,
    employeePayRates: mockRates,
    setEmployeePayRate: mockSetRate,
    getEmployeePayRate: (employeeId: string, categoryId?: string | null) =>
      mockRates.find(r => r.employeeId === employeeId && r.categoryId === categoryId)?.hourlyRate,
  }),
}));
jest.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));
jest.mock('../../hooks/useResponsive', () => ({
  useResponsive: () => mockResponsive,
}));

const open = () => render(<PayRatesManager isOpen onClose={() => {}} />);

beforeEach(() => {
  jest.clearAllMocks();
  mockRates = [
    { employeeId: 'u-alyssa', categoryId: 'c-teach', hourlyRate: 22 },
    { employeeId: 'u-alyssa', categoryId: 'c-assist', hourlyRate: 22 },
  ];
  mockResponsive.isMobileOrTablet = false;
});

describe('desktop', () => {
  it('lists active people alphabetically and opens on the first one', () => {
    open();
    const list = screen.getByRole('listbox', { name: 'Employees' });
    const names = within(list).getAllByRole('option').map(o => o.textContent);
    expect(names[0]).toMatch(/^Alyssa Zuppardo/);
    expect(names[1]).toMatch(/^Amy M/);
    expect(names).toHaveLength(2); // deactivated staff are not shown
    expect(screen.getByText('2 of 2 rates set')).toBeInTheDocument();
  });

  it('shows only active categories, each with its own labelled box', () => {
    open();
    expect(screen.getByLabelText('Teach')).toHaveValue(22);
    expect(screen.getByLabelText('Assist')).toHaveValue(22);
    expect(screen.queryByLabelText('Retired')).not.toBeInTheDocument();
  });

  it('switches person when clicked and shows their unset boxes blank', () => {
    open();
    fireEvent.click(screen.getByRole('option', { name: /Amy M/ }));
    expect(screen.getByText('0 of 2 rates set')).toBeInTheDocument();
    expect(screen.getByLabelText('Teach')).toHaveValue(null);
  });

  it('saves a typed rate on blur, once, for the right person', async () => {
    open();
    fireEvent.click(screen.getByRole('option', { name: /Amy M/ }));
    const box = screen.getByLabelText('Teach');
    fireEvent.change(box, { target: { value: '18.5' } });
    fireEvent.blur(box, { target: { value: '18.5' } });
    await waitFor(() => expect(mockSetRate).toHaveBeenCalledTimes(1));
    expect(mockSetRate).toHaveBeenCalledWith('u-amy', 'c-teach', 18.5);
  });

  it('does not round-trip an unchanged rate', async () => {
    open();
    const box = screen.getByLabelText('Teach');
    fireEvent.blur(box, { target: { value: '22.00' } });
    await waitFor(() => expect(box).not.toBeDisabled());
    expect(mockSetRate).not.toHaveBeenCalled();
  });

  it('rejects a negative rate without saving', async () => {
    open();
    const box = screen.getByLabelText('Teach');
    fireEvent.change(box, { target: { value: '-3' } });
    fireEvent.blur(box, { target: { value: '-3' } });
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Enter a rate of 0 or more', 'error'));
    expect(mockSetRate).not.toHaveBeenCalled();
  });

  it('"same rate for all" writes every active category for the selected person', async () => {
    open();
    fireEvent.click(screen.getByRole('option', { name: /Amy M/ }));
    fireEvent.change(screen.getByLabelText('Rate for all categories'), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(mockSetRate).toHaveBeenCalledTimes(2));
    expect(mockSetRate).toHaveBeenCalledWith('u-amy', 'c-teach', 20);
    expect(mockSetRate).toHaveBeenCalledWith('u-amy', 'c-assist', 20);
    expect(mockSetRate).not.toHaveBeenCalledWith('u-amy', 'c-old', expect.anything());
  });

  it('"copy from" only offers people who have rates, and copies theirs', async () => {
    open();
    fireEvent.click(screen.getByRole('option', { name: /Amy M/ }));
    const from = screen.getByLabelText('Copy rates from') as HTMLSelectElement;
    const offered = Array.from(from.options).map(o => o.textContent);
    expect(offered).toContain('Alyssa Zuppardo');
    expect(offered).not.toContain('Amy M');
    fireEvent.change(from, { target: { value: 'u-alyssa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(mockSetRate).toHaveBeenCalledTimes(2));
    expect(mockSetRate).toHaveBeenCalledWith('u-amy', 'c-teach', 22);
    expect(mockSetRate).toHaveBeenCalledWith('u-amy', 'c-assist', 22);
  });

  it('filters the person list by search', () => {
    open();
    fireEvent.change(screen.getByPlaceholderText('Find a person'), { target: { value: 'amy' } });
    const list = screen.getByRole('listbox', { name: 'Employees' });
    expect(within(list).getAllByRole('option')).toHaveLength(1);
    expect(within(list).getByRole('option', { name: /Amy M/ })).toBeInTheDocument();
  });

  it('counts unset rates across active people and categories only', () => {
    open();
    // 2 people × 2 active categories = 4 cells, 2 set.
    expect(screen.getByText(/2 of 4 rates are not set/)).toBeInTheDocument();
  });
});

describe('phone', () => {
  beforeEach(() => {
    mockResponsive.isMobileOrTablet = true;
  });

  it('replaces the person list with a dropdown that still switches the form', () => {
    open();
    expect(screen.queryByRole('listbox', { name: 'Employees' })).not.toBeInTheDocument();
    const picker = screen.getByLabelText('Employee') as HTMLSelectElement;
    expect(picker.options[0].textContent).toBe('Alyssa Zuppardo — 2/2 set');
    expect(picker.options[1].textContent).toBe('Amy M — not set');
    fireEvent.change(picker, { target: { value: 'u-amy' } });
    expect(screen.getByText('0 of 2 rates set')).toBeInTheDocument();
    expect(screen.getByLabelText('Teach')).toHaveValue(null);
  });
});
