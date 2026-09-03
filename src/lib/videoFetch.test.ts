import { fetchVideoFile, VideoTooLarge, isAbort } from './videoFetch';

/**
 * A fake fetch Response with a chunked body. Only the surface fetchVideoFile
 * reads is modelled: ok/status, headers.get, and body.getReader().
 */
const response = (chunks: Uint8Array[], headers: Record<string, string>, ok = true) => {
  let i = 0;
  const cancel = jest.fn().mockResolvedValue(undefined);
  return {
    ok,
    status: ok ? 200 : 500,
    headers: { get: (h: string) => headers[h.toLowerCase()] ?? null },
    body: {
      getReader: () => ({
        read: async () => (i < chunks.length ? { done: false, value: chunks[i++] } : { done: true, value: undefined }),
        cancel,
      }),
      cancel,
    },
    _cancel: cancel,
  };
};

const bytes = (n: number, fill = 7) => new Uint8Array(n).fill(fill);

describe('fetchVideoFile', () => {
  afterEach(() => { delete (global as any).fetch; });

  it('reads the body in chunks, reports progress against Content-Length, and returns a File', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue(
      response([bytes(4), bytes(6)], { 'content-length': '10', 'content-type': 'video/mp4' }),
    );
    const seen: { received: number; total: number | null }[] = [];
    const file = await fetchVideoFile('https://cf/x.mp4', 'Class.mp4', {
      maxBytes: 1000,
      onProgress: p => seen.push(p),
    });
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe('Class.mp4');
    expect(file.type).toBe('video/mp4');
    expect(file.size).toBe(10);
    expect(seen).toEqual([
      { received: 0, total: 10 },
      { received: 4, total: 10 },
      { received: 10, total: 10 },
    ]);
    expect((global as any).fetch).toHaveBeenCalledWith('https://cf/x.mp4', expect.objectContaining({ credentials: 'omit' }));
  });

  it('refuses up front, without reading, when Content-Length is over the cap', async () => {
    const res = response([bytes(4)], { 'content-length': String(400 * 1024 * 1024) });
    (global as any).fetch = jest.fn().mockResolvedValue(res);
    await expect(fetchVideoFile('u', 'f.mp4', { maxBytes: 300 * 1024 * 1024 }))
      .rejects.toBeInstanceOf(VideoTooLarge);
    expect(res._cancel).toHaveBeenCalled();
  });

  it('refuses mid-stream when there is no Content-Length and the cap is passed', async () => {
    const res = response([bytes(50), bytes(60)], {});
    (global as any).fetch = jest.fn().mockResolvedValue(res);
    const seen: number[] = [];
    await expect(fetchVideoFile('u', 'f.mp4', { maxBytes: 100, onProgress: p => seen.push(p.received) }))
      .rejects.toMatchObject({ name: 'VideoTooLarge', bytes: null });
    // Progress was reported for the chunk that fit, then reading stopped.
    expect(seen).toEqual([0, 50]);
    expect(res._cancel).toHaveBeenCalled();
  });

  it('reports total as null when the server does not say', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue(response([bytes(3)], {}));
    const seen: (number | null)[] = [];
    await fetchVideoFile('u', 'f.mp4', { maxBytes: 100, onProgress: p => seen.push(p.total) });
    expect(seen).toEqual([null, null]);
  });

  it('throws on a non-2xx response', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue(response([], {}, false));
    await expect(fetchVideoFile('u', 'f.mp4', { maxBytes: 100 })).rejects.toThrow('500');
  });

  it('recognises an abort', () => {
    const e = new Error('x'); e.name = 'AbortError';
    expect(isAbort(e)).toBe(true);
    expect(isAbort(new Error('x'))).toBe(false);
    expect(isAbort('nope')).toBe(false);
  });
});
