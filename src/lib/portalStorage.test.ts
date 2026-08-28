import { isMissingObjectError, removeStorageObject, signDocumentUrls } from './portalStorage';

/**
 * The order a file is deleted in, and what counts as a failure.
 *
 * Two files sat stranded in the bucket for two days because the row was
 * deleted first and the file's delete was allowed to fail quietly. Nothing
 * pointed at them, the app lists the bucket only by row, and Supabase blocks
 * direct DELETEs on storage.objects — so there was no route back from inside
 * the product at all.
 *
 * The fix is to delete the file first and abort if that fails. Which creates
 * the opposite trap unless "already gone" is treated as success, because the
 * Storage API answers a delete for a path it does not hold with an error:
 *
 *     400 {"statusCode":"404","error":"not_found","code":"NoSuchKey"}
 *
 * Both halves are pinned below. Verified against production storage before it
 * was written — that 400 is a real response, not an assumption.
 */

const mockRemove = jest.fn();
const mockCreateSignedUrls = jest.fn();

jest.mock('./supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        remove: (...args: unknown[]) => mockRemove(...args),
        createSignedUrls: (...args: unknown[]) => mockCreateSignedUrls(...args),
      }),
    },
  },
}));

beforeEach(() => jest.clearAllMocks());

describe('isMissingObjectError', () => {
  it('recognises the shape the Storage API actually returns', () => {
    // Captured from production: DELETE on a path that does not exist.
    expect(isMissingObjectError({
      status: 400,
      statusCode: '404',
      error: 'not_found',
      message: 'Object not found',
      code: 'NoSuchKey',
    })).toBe(true);
  });

  it('recognises the variants supabase-js has used across versions', () => {
    expect(isMissingObjectError({ status: 404 })).toBe(true);
    expect(isMissingObjectError({ statusCode: 404 })).toBe(true);
    expect(isMissingObjectError({ code: 'NoSuchKey' })).toBe(true);
    expect(isMissingObjectError({ message: 'The resource was not found' })).toBe(true);
  });

  it('does not mistake a permission or network failure for a missing file', () => {
    // These MUST abort the delete — the row has to survive them.
    expect(isMissingObjectError({ status: 403, message: 'new row violates row-level security policy' })).toBe(false);
    expect(isMissingObjectError({ status: 500, message: 'Internal Server Error' })).toBe(false);
    expect(isMissingObjectError({ message: 'Failed to fetch' })).toBe(false);
    expect(isMissingObjectError(null)).toBe(false);
    expect(isMissingObjectError(undefined)).toBe(false);
    expect(isMissingObjectError('not found')).toBe(false);
  });
});

describe('removeStorageObject', () => {
  it('resolves when the file is deleted', async () => {
    mockRemove.mockResolvedValue({ error: null });
    await expect(removeStorageObject('portal-documents', 'a/b.jpg')).resolves.toBeUndefined();
    expect(mockRemove).toHaveBeenCalledWith(['a/b.jpg']);
  });

  it('resolves when the file was already gone — the goal is met either way', async () => {
    // Otherwise a row pointing at a deleted file could never be removed.
    mockRemove.mockResolvedValue({ error: { statusCode: '404', code: 'NoSuchKey', message: 'Object not found' } });
    await expect(removeStorageObject('portal-documents', 'a/b.jpg')).resolves.toBeUndefined();
  });

  it('throws on anything else, so the caller keeps the row', async () => {
    const denied = { status: 403, message: 'row-level security' };
    mockRemove.mockResolvedValue({ error: denied });
    await expect(removeStorageObject('portal-documents', 'a/b.jpg')).rejects.toBe(denied);
  });
});

describe('signDocumentUrls', () => {
  it('sends one request for the whole page, de-duplicated', async () => {
    mockCreateSignedUrls.mockResolvedValue({
      data: [{ path: 'a.jpg', signedUrl: 'https://s/a' }, { path: 'b.jpg', signedUrl: 'https://s/b' }],
      error: null,
    });

    const map = await signDocumentUrls(['a.jpg', 'b.jpg', 'a.jpg', '']);

    expect(mockCreateSignedUrls).toHaveBeenCalledTimes(1);
    expect(mockCreateSignedUrls).toHaveBeenCalledWith(['a.jpg', 'b.jpg'], 3600);
    expect(map).toEqual({ 'a.jpg': 'https://s/a', 'b.jpg': 'https://s/b' });
  });

  it('drops the rows that failed and keeps the rest', async () => {
    mockCreateSignedUrls.mockResolvedValue({
      data: [
        { path: 'a.jpg', signedUrl: 'https://s/a' },
        { path: 'gone.jpg', signedUrl: null, error: 'Object not found' },
      ],
      error: null,
    });

    expect(await signDocumentUrls(['a.jpg', 'gone.jpg'])).toEqual({ 'a.jpg': 'https://s/a' });
  });

  it('returns an empty map rather than throwing when the whole call fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockCreateSignedUrls.mockResolvedValue({ data: null, error: new Error('offline') });

    expect(await signDocumentUrls(['a.jpg'])).toEqual({});
    (console.error as jest.Mock).mockRestore();
  });

  it('does not call out at all for an empty list', async () => {
    expect(await signDocumentUrls([])).toEqual({});
    expect(mockCreateSignedUrls).not.toHaveBeenCalled();
  });
});
