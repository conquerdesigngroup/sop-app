import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ShiftReportDetail from './ShiftReportDetail';
import { ShiftReport, ShiftReportComment } from '../../lib/shiftReports';
import { TaskFile } from '../../types';

const mockUpload = jest.fn();
const mockDiscard = jest.fn(async (_files: TaskFile[]) => {});
jest.mock('../../lib/taskFiles', () => {
  const actual = jest.requireActual('../../lib/taskFiles');
  return {
    ...actual,
    uploadTaskFile: (...args: any[]) => mockUpload(...args),
    discardUnsaved: (files: TaskFile[]) => mockDiscard(files),
    signTaskFile: async () => 'https://signed.example/x',
    cachedTaskFileUrl: () => undefined,
  };
});
jest.mock('../../lib/supabase', () => ({ supabase: { storage: { from: jest.fn() } } }));

const mockAddComment = jest.fn();
const mockLoadComments = jest.fn(async (): Promise<ShiftReportComment[]> => []);
jest.mock('../../contexts/ShiftReportContext', () => ({
  useShiftReports: () => ({
    markSeen: async () => {},
    setArchived: async () => {},
    loadComments: mockLoadComments,
    addComment: mockAddComment,
    deleteComment: async () => {},
  }),
}));
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ users: [{ id: 'me', firstName: 'Amy', lastName: 'M' }], currentUser: { id: 'me' }, isAdmin: false }),
}));
const mockToast = jest.fn();
jest.mock('../../contexts/ToastContext', () => ({ useToast: () => ({ showToast: mockToast }) }));
jest.mock('../StaffAvatar', () => () => null);

const report: ShiftReport = {
  id: 'r1', authorId: 'me', shiftType: 'closing', shiftDate: '2026-11-09', body: 'Closed up',
  archivedAt: null, archivedBy: null, createdAt: '2026-11-10T20:00:00Z', updatedAt: '2026-11-10T20:00:00Z',
  tags: [], commentCount: 0,
};
const record = (name: string): TaskFile => ({
  id: name, path: `me/${name}`, name, mimeType: 'application/pdf', size: 100, uploadedAt: 'now',
});
const pick = (names: string[]) => {
  fireEvent.change(screen.getByTestId('chat-file-input'), { target: { files: names.map(n => new File(['x'], n, { type: 'application/pdf' })) } });
};
const sendButton = () => screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement;
const attachButton = () => screen.getByRole('button', { name: 'Attach photos or files' }) as HTMLButtonElement;

describe('ShiftReportDetail chat attachments', () => {
  beforeEach(() => {
    mockUpload.mockReset();
    mockDiscard.mockClear();
    mockAddComment.mockReset();
    mockToast.mockReset();
    // react-scripts resets mock implementations between tests.
    mockLoadComments.mockImplementation(async () => []);
    mockDiscard.mockImplementation(async (_files: TaskFile[]) => {});
  });

  it('uploads a picked file, says so, and sends it with no words needed', async () => {
    let release: (() => void) | null = null;
    mockUpload.mockImplementation((_uid: string, f: File) =>
      new Promise(resolve => { release = () => resolve(record(f.name)); }));
    mockAddComment.mockImplementation(async (reportId: string, body: string, files: TaskFile[]) => ({
      id: 'c1', reportId, authorId: 'me', body, files, createdAt: '2026-11-10T21:00:00Z',
    }));

    render(<ShiftReportDetail report={report} onClose={() => {}} onEdit={() => {}} />);
    await screen.findByText(/No messages yet/);

    pick(['receipt.pdf']);
    expect(screen.getByRole('status').textContent).toMatch(/Uploading receipt\.pdf/);
    expect(screen.getByRole('progressbar')).toBeTruthy();
    expect(attachButton().disabled).toBe(true);
    expect(sendButton().disabled).toBe(true);

    // A second pick while the first is going up starts nothing.
    pick(['other.pdf']);
    expect(mockUpload).toHaveBeenCalledTimes(1);

    await act(async () => { release!(); });
    expect(screen.getByText('receipt.pdf')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(/Ready to send 1 file/);
    expect(sendButton().disabled).toBe(false);

    fireEvent.click(sendButton());
    await waitFor(() => expect(mockAddComment).toHaveBeenCalledWith('r1', '', [record('receipt.pdf')]));
    await waitFor(() => expect(sendButton().disabled).toBe(true));
    expect(mockDiscard).not.toHaveBeenCalled();
  });

  it('deletes files that were picked but never sent when the report closes', async () => {
    mockUpload.mockImplementation(async (_uid: string, f: File) => record(f.name));
    const { rerender } = render(<ShiftReportDetail report={report} onClose={() => {}} onEdit={() => {}} />);
    await screen.findByText(/No messages yet/);
    pick(['photo.pdf']);
    await screen.findByText('photo.pdf');
    expect(screen.getByText('photo.pdf')).toBeTruthy();

    rerender(<ShiftReportDetail report={null} onClose={() => {}} onEdit={() => {}} />);
    expect(mockDiscard).toHaveBeenCalledWith([record('photo.pdf')]);
  });

  it('keeps the files attached when sending fails', async () => {
    mockUpload.mockImplementation(async (_uid: string, f: File) => record(f.name));
    mockAddComment.mockRejectedValue(new Error('offline'));
    render(<ShiftReportDetail report={report} onClose={() => {}} onEdit={() => {}} />);
    await screen.findByText(/No messages yet/);
    pick(['a.pdf']);
    await screen.findByText('a.pdf');
    fireEvent.click(sendButton());
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.stringMatching(/files are still attached/), 'error'));
    expect(screen.getByText('a.pdf')).toBeTruthy();
    expect(mockDiscard).not.toHaveBeenCalled();
  });
});
