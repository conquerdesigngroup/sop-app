import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import DocumentsCard from './DocumentsCard';
import { PortalDocument } from '../../types';

/**
 * What the dashboard's file list says about each file.
 *
 * WHY THE ABSENCE OF A SIZE IS WORTH A TEST
 *
 * It is the kind of thing a later change adds back without meaning to —
 * `formatFileSize` is right there and every other file list uses it. The studio
 * asked for it gone because a column of megabytes beside four filenames read as
 * a storage report for the whole app rather than a list of their own things;
 * one file happened to be a 243MB class video titled "9/8", which looked for
 * all the world like a count and a total.
 *
 * The size is NOT gone everywhere. It still shows on the class page's own list
 * and live in the download progress line, where it changes whether someone taps
 * on cellular — see DocumentList and CLAUDE.md on slow taps.
 */

const mockLoadMyDocuments = jest.fn();
const mockUseHousehold = jest.fn();

jest.mock('../../lib/attendanceQueries', () => ({
  loadMyDocuments: (...a: unknown[]) => mockLoadMyDocuments(...a),
}));

jest.mock('./useHousehold', () => ({
  useHousehold: (...a: unknown[]) => mockUseHousehold(...a),
}));

jest.mock('../../lib/portalStorage', () => ({
  signDocumentUrls: async () => ({}),
}));

const doc = (over: Partial<PortalDocument> = {}): PortalDocument => ({
  id: 'doc-1',
  programId: 'prog-allstars',
  classId: 'cls-1',
  title: '9/8',
  description: '',
  category: '',
  // A bucket file, not a Stream video: exactly one of storagePath / streamUid
  // is set, and the stream fields stay null with it.
  storagePath: null,
  streamUid: null,
  streamPlaybackUrl: null,
  streamStatus: null,
  durationSeconds: null,
  streamDownloadUrl: null,
  fileName: 'IMG_2271.mov',
  mimeType: 'video/quicktime',
  // The real row from the studio: 243.5 MB.
  sizeBytes: 255_316_767,
  sortOrder: 1,
  isPublished: true,
  createdAt: '2026-09-10T04:26:29Z',
  ...over,
});

const props = {
  ctx: { source: { source: 'live' } },
  firstName: 'Tony',
  lastName: 'Z',
  email: 'parent@example.com',
} as unknown as React.ComponentProps<typeof DocumentsCard>;

beforeEach(() => {
  mockLoadMyDocuments.mockReset();
  mockUseHousehold.mockReset();
  mockUseHousehold.mockReturnValue({
    data: { enrolledClassIds: ['cls-1'], enrolledPrograms: ['allstars'] },
  });
});

describe('DocumentsCard', () => {
  it('names the file and says nothing about its size', async () => {
    mockLoadMyDocuments.mockResolvedValue({ rows: [doc()], error: null });

    render(<DocumentsCard {...props} />);

    expect(await screen.findByText('9/8')).toBeInTheDocument();
    // Neither the formatted size nor any stray byte count.
    expect(screen.queryByText(/243\.5|MB|KB|bytes/i)).not.toBeInTheDocument();
  });

  it('still shows a category when the studio set one', async () => {
    mockLoadMyDocuments.mockResolvedValue({
      rows: [doc({ title: 'Recital pack', category: 'Recital' })],
      error: null,
    });

    render(<DocumentsCard {...props} />);

    expect(await screen.findByText('Recital pack')).toBeInTheDocument();
    expect(screen.getByText('Recital')).toBeInTheDocument();
  });

  it('asks only for this household’s classes and programmes', async () => {
    mockLoadMyDocuments.mockResolvedValue({ rows: [], error: null });

    render(<DocumentsCard {...props} />);

    await waitFor(() => expect(mockLoadMyDocuments).toHaveBeenCalled());
    const [, classIds, programs] = mockLoadMyDocuments.mock.calls[0];
    expect(classIds).toEqual(['cls-1']);
    expect(programs).toEqual(['allstars']);
  });
});
