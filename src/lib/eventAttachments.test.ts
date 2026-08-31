import { removeAttachment, EventAttachment } from './eventAttachments';

/**
 * Deleting an attachment, in the order that makes a failure survivable.
 *
 * The same invariant as deleteDocument in PortalAdminContext, tested here
 * because this one is a plain function: the FILE goes first, and if it will not
 * go, the row is left alone. A row with its file still attached can be deleted
 * again tomorrow. A file with no row is invisible to the app forever — nothing
 * links to it, the app only lists the bucket by row, and Supabase refuses
 * direct DELETEs on storage.objects.
 */

const calls: string[] = [];
const mockRemove = jest.fn();
const mockEq = jest.fn();

jest.mock('./supabase', () => ({
  // Not configured, so the fire-and-forget logActivity inside removeAttachment
  // no-ops instead of reaching for an rpc this mock does not provide.
  isSupabaseConfigured: () => false,
  supabase: {
    storage: {
      from: () => ({ remove: (...a: unknown[]) => mockRemove(...a) }),
    },
    from: () => ({
      delete: () => ({ eq: (...a: unknown[]) => mockEq(...a) }),
    }),
  },
}));

const FILE: EventAttachment = {
  id: 'att-1',
  kind: 'file',
  url: null,
  label: null,
  storagePath: 'events/abc-costume-list.pdf',
  fileName: 'costume-list.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1024,
  createdAt: '2026-08-01T00:00:00Z',
};

beforeEach(() => {
  calls.length = 0;
  jest.clearAllMocks();
  mockRemove.mockImplementation(async () => { calls.push('storage'); return { error: null }; });
  mockEq.mockImplementation(async () => { calls.push('row'); return { error: null }; });
});

describe('removeAttachment', () => {
  it('deletes the file before the row', async () => {
    await removeAttachment(FILE);
    expect(calls).toEqual(['storage', 'row']);
  });

  it('LEAVES THE ROW when the file cannot be deleted', async () => {
    mockRemove.mockImplementation(async () => {
      calls.push('storage');
      return { error: { status: 403, message: 'row-level security' } };
    });

    await expect(removeAttachment(FILE)).rejects.toBeDefined();

    // The whole point: the row survives, so the file is still reachable and
    // the delete can be tried again.
    expect(calls).toEqual(['storage']);
    expect(mockEq).not.toHaveBeenCalled();
  });

  it('still deletes the row when the file was already gone', async () => {
    mockRemove.mockImplementation(async () => {
      calls.push('storage');
      return { error: { statusCode: '404', code: 'NoSuchKey', message: 'Object not found' } };
    });

    await removeAttachment(FILE);
    expect(calls).toEqual(['storage', 'row']);
  });

  it('touches storage at all only for a file', async () => {
    const link: EventAttachment = {
      ...FILE, kind: 'link', url: 'https://example.com/x', storagePath: null, fileName: null,
    };

    await removeAttachment(link);

    expect(mockRemove).not.toHaveBeenCalled();
    expect(calls).toEqual(['row']);
  });

  it('surfaces a failed row delete', async () => {
    mockEq.mockImplementation(async () => {
      calls.push('row');
      return { error: { message: 'permission denied' } };
    });

    await expect(removeAttachment(FILE)).rejects.toThrow('permission denied');
  });
});
