import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DocumentList } from './DocumentList';
import { PortalDocument } from '../../types';

/**
 * What a parent gets handed when a teacher posts a file.
 *
 * Two complaints produced this component and both are pinned here.
 *
 * "Show me the photo, not a link to it" — so the image, video and audio cases
 * assert a real <img>/<video>/<audio> is in the document, and the PDF case
 * asserts it is still a link.
 *
 * "The download button did nothing on my phone" — that was window.open() being
 * called after an await, which iOS discards. The tests below assert the normal
 * path is a plain anchor with a working href, and that the one path which still
 * has to await navigates instead of opening a window. window.open is spied on
 * and required NEVER to be called; that assertion is the regression test.
 */

const SIGNED = 'https://x.supabase.co/storage/v1/object/sign/portal-documents/p/f?token=abc';

const mockGetDocumentUrls = jest.fn();
const mockGetDocumentUrl = jest.fn();
const mockResolveDownload = jest.fn();

// The function that follows Cloudflare's CORS-less redirect for the phone.
jest.mock('../../lib/portalStreamDownload', () => ({
  resolveStreamDownload: (...args: unknown[]) => mockResolveDownload(...args),
}));

jest.mock('../../contexts/PortalContext', () => ({
  usePortal: () => ({
    getDocumentUrls: mockGetDocumentUrls,
    getDocumentUrl: mockGetDocumentUrl,
  }),
}));

const doc = (over: Partial<PortalDocument>): PortalDocument => ({
  id: 'doc-1',
  programId: 'prog-1',
  classId: 'class-1',
  title: 'Costume photo',
  description: '',
  category: null,
  storagePath: 'allstars/abc-costume.jpg',
  fileName: 'costume.jpg',
  mimeType: 'image/jpeg',
  sizeBytes: 1024,
  sortOrder: 0,
  isPublished: true,
  createdAt: '2026-08-01T00:00:00Z',
  streamUid: null,
  streamPlaybackUrl: null,
  streamStatus: null,
  durationSeconds: null,
  streamDownloadUrl: null,
  ...over,
});

const STREAM_BASE = 'https://customer-abc123.cloudflarestream.com/0123456789abcdef0123456789abcdef';

/** A class video that lives on Cloudflare Stream rather than in the bucket. */
const streamDoc = (over: Partial<PortalDocument>): PortalDocument => doc({
  id: 'doc-stream',
  title: 'Tuesday class recording',
  storagePath: null,
  fileName: 'IMG_2231.MOV',
  mimeType: 'video/quicktime',
  sizeBytes: 2400000000,
  streamUid: '0123456789abcdef0123456789abcdef',
  streamPlaybackUrl: STREAM_BASE,
  streamStatus: 'ready',
  durationSeconds: 1834,
  streamDownloadUrl: `${STREAM_BASE}/downloads/default.mp4`,
  ...over,
});

/** Renders and waits out the signing round-trip the list fires on mount. */
const renderList = async (documents: PortalDocument[]) => {
  render(<DocumentList documents={documents} />);
  await waitFor(() => expect(mockGetDocumentUrls).toHaveBeenCalled());
  // Let the resolved promise's setState flush. A whole macrotask, not one
  // microtask: the mock's promise chain is more than one tick deep, and a
  // single Promise.resolve() left the img unrendered about one run in ten —
  // the "flaky photo test" PR #65 wrote off.
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
};

/** Every path in this file signs successfully unless a test says otherwise. */
const signsEverything = () =>
  mockGetDocumentUrls.mockImplementation((paths: string[]) =>
    Promise.resolve(Object.fromEntries(paths.map(p => [p, SIGNED])))
  );

let openSpy: jest.SpyInstance;
let assignSpy: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  signsEverything();

  openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);

  // jsdom refuses a real navigation, so location is replaced wholesale.
  assignSpy = jest.fn();
  delete (window as any).location;
  (window as any).location = { assign: assignSpy, href: 'http://localhost/' };
});

afterEach(() => openSpy.mockRestore());

describe('a photo', () => {
  it('is rendered as an image, not offered as a download', async () => {
    await renderList([doc({ title: 'Competition costume' })]);

    const img = screen.getByAltText('Competition costume') as HTMLImageElement;
    expect(img.tagName).toBe('IMG');
    // The bare signed URL: ?download= would make the browser save it instead
    // of painting it.
    expect(img.src).toBe(SIGNED);
    expect(img.src).not.toContain('download=');
  });

  it('uses the description as alt text when there is one', async () => {
    await renderList([doc({ description: 'The red jacket, front and back' })]);
    expect(screen.getByAltText('The red jacket, front and back')).toBeInTheDocument();
  });

  it('carries a Save link that asks storage for an attachment', async () => {
    await renderList([doc({ fileName: 'costume front.jpg' })]);

    const save = screen.getByRole('link', { name: /save/i }) as HTMLAnchorElement;
    expect(save.href).toContain('download=costume%20front.jpg');
    // _blank on an attachment opens a tab that instantly closes itself.
    expect(save.target).toBe('');
  });

  it('opens full size in a new tab when tapped', async () => {
    await renderList([doc({ title: 'Costume' })]);

    const full = screen.getByAltText('Costume').closest('a') as HTMLAnchorElement;
    expect(full.href).toBe(SIGNED);
    expect(full.target).toBe('_blank');
    expect(full.rel).toBe('noopener noreferrer');
  });

  it('falls back to a download row when the browser cannot decode it', async () => {
    // The HEIC case: an iPhone shoots it, Chrome cannot show it.
    await renderList([doc({ title: 'Shot on iPhone', mimeType: 'image/heic', fileName: 'IMG_1.heic' })]);

    const img = screen.getByAltText('Shot on iPhone');
    fireEvent.error(img);

    expect(screen.queryByAltText('Shot on iPhone')).not.toBeInTheDocument();
    const row = screen.getByRole('link', { name: /Shot on iPhone/ }) as HTMLAnchorElement;
    expect(row.href).toContain('download=IMG_1.heic');
  });
});

describe('a video', () => {
  const video = (over: Partial<PortalDocument> = {}) =>
    doc({ title: 'Routine run-through', mimeType: 'video/mp4', fileName: 'routine.mp4', ...over });

  it('plays in the page rather than downloading', async () => {
    const { container } = render(<DocumentList documents={[video()]} />);
    await waitFor(() => expect(mockGetDocumentUrls).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); });

    const el = container.querySelector('video') as HTMLVideoElement;
    expect(el).toBeInTheDocument();
    expect(el.getAttribute('src')).toBe(SIGNED);
    expect(el.hasAttribute('controls')).toBe(true);
    // Without playsInline an iPhone hijacks the whole screen on play.
    expect(el.getAttribute('playsinline')).not.toBeNull();
    // metadata is what draws the first frame as a thumbnail without pulling
    // the whole file over mobile data.
    expect(el.getAttribute('preload')).toBe('metadata');
  });

  it('is recognised from the file name when the MIME type is useless', async () => {
    // Some pickers send octet-stream for an ordinary .mov.
    const { container } = render(<DocumentList documents={[
      video({ mimeType: 'application/octet-stream', fileName: 'jazz.mov' }),
    ]} />);
    await waitFor(() => expect(mockGetDocumentUrls).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); });

    expect(container.querySelector('video')).toBeInTheDocument();
  });

  it('falls back to a download row when the codec is not supported', async () => {
    const { container } = render(<DocumentList documents={[video()]} />);
    await waitFor(() => expect(mockGetDocumentUrls).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); });

    fireEvent.error(container.querySelector('video')!);

    expect(container.querySelector('video')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Routine run-through/ })).toBeInTheDocument();
  });
});

describe('music', () => {
  it('gets a player', async () => {
    const { container } = render(<DocumentList documents={[
      doc({ title: 'Competition mix', mimeType: 'audio/mpeg', fileName: 'mix.mp3' }),
    ]} />);
    await waitFor(() => expect(mockGetDocumentUrls).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); });

    const el = container.querySelector('audio') as HTMLAudioElement;
    expect(el).toBeInTheDocument();
    expect(el.getAttribute('src')).toBe(SIGNED);
    expect(el.hasAttribute('controls')).toBe(true);
  });
});

describe('everything else', () => {
  const pdf = doc({
    title: 'Permission slip',
    mimeType: 'application/pdf',
    fileName: 'permission #2 & 3.pdf',
  });

  it('stays a download row', async () => {
    const { container } = await renderList([pdf]).then(() => ({ container: document.body }));

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('video')).toBeNull();
    expect(screen.getByText('Permission slip')).toBeInTheDocument();
  });

  it('is a real anchor, so the tap is never swallowed', async () => {
    await renderList([pdf]);

    const link = screen.getByRole('link', { name: /Permission slip/ }) as HTMLAnchorElement;
    expect(link.tagName).toBe('A');
    // encodeURIComponent, not encodeURI: # would otherwise cut the query short.
    expect(link.href).toContain('download=permission%20%232%20%26%203.pdf');
  });

  it('is not a name the extension table can override', async () => {
    // Named like a video, served as a PDF. The server's type wins.
    const { container } = render(<DocumentList documents={[
      doc({ mimeType: 'application/pdf', fileName: 'routine.mp4' }),
    ]} />);
    await waitFor(() => expect(mockGetDocumentUrls).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); });

    expect(container.querySelector('video')).toBeNull();
  });
});

describe('signing', () => {
  it('asks for every file on the page in one request', async () => {
    await renderList([
      doc({ id: 'a', storagePath: 'p/a.jpg' }),
      doc({ id: 'b', storagePath: 'p/b.jpg' }),
      doc({ id: 'c', storagePath: 'p/c.pdf', mimeType: 'application/pdf' }),
    ]);

    expect(mockGetDocumentUrls).toHaveBeenCalledTimes(1);
    expect(mockGetDocumentUrls).toHaveBeenCalledWith(['p/a.jpg', 'p/b.jpg', 'p/c.pdf']);
  });

  it('does not re-sign when the parent re-renders with an equal list', async () => {
    const documents = [doc({})];
    const { rerender } = render(<DocumentList documents={documents} />);
    await waitFor(() => expect(mockGetDocumentUrls).toHaveBeenCalledTimes(1));

    // A new array with the same contents — what a parent component produces on
    // every render. Depending on the array itself would loop forever.
    rerender(<DocumentList documents={[doc({})]} />);
    await act(async () => { await Promise.resolve(); });

    expect(mockGetDocumentUrls).toHaveBeenCalledTimes(1);
  });

  it('does not ask at all for an empty list', async () => {
    render(<DocumentList documents={[]} />);
    await act(async () => { await Promise.resolve(); });
    expect(mockGetDocumentUrls).not.toHaveBeenCalled();
  });

  it('leaves one unsignable file as a row without blanking the others', async () => {
    mockGetDocumentUrls.mockResolvedValue({ 'p/ok.jpg': SIGNED });

    await renderList([
      doc({ id: 'ok', title: 'Fine', storagePath: 'p/ok.jpg' }),
      doc({ id: 'gone', title: 'Missing', storagePath: 'p/gone.jpg' }),
    ]);

    expect(screen.getByAltText('Fine')).toBeInTheDocument();
    // No URL, so no image — but the row is still there and still tappable.
    expect(screen.queryByAltText('Missing')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Missing/ })).toBeInTheDocument();
  });
});

describe('the file that could not be signed up front', () => {
  const unsigned = doc({ title: 'Late handout', mimeType: 'application/pdf', fileName: 'late.pdf' });

  beforeEach(() => mockGetDocumentUrls.mockResolvedValue({}));

  it('signs on tap and NAVIGATES — window.open is what iOS was dropping', async () => {
    mockGetDocumentUrl.mockResolvedValue(SIGNED);
    await renderList([unsigned]);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Late handout/ }));
    });

    expect(mockGetDocumentUrl).toHaveBeenCalledWith(unsigned.storagePath);
    expect(assignSpy).toHaveBeenCalledWith(`${SIGNED}&download=late.pdf`);
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('says so rather than going quiet when signing fails', async () => {
    mockGetDocumentUrl.mockResolvedValue(null);
    await renderList([unsigned]);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Late handout/ }));
    });

    expect(screen.getByText(/Could not open/)).toBeInTheDocument();
    expect(assignSpy).not.toHaveBeenCalled();
  });
});

describe('across the whole list', () => {
  it('never calls window.open — that is the bug this component replaced', async () => {
    await renderList([
      doc({ id: 'a', title: 'A photo' }),
      doc({ id: 'b', title: 'A video', mimeType: 'video/mp4', fileName: 'v.mp4' }),
      doc({ id: 'c', title: 'A handout', mimeType: 'application/pdf', fileName: 'c.pdf' }),
    ]);

    // Every control on the page, of all three kinds.
    screen.getAllByRole('link').forEach(link => fireEvent.click(link));
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('keeps the order the teacher put them in', async () => {
    await renderList([
      doc({ id: 'a', title: 'First', sortOrder: 0 }),
      doc({ id: 'b', title: 'Second', mimeType: 'application/pdf', fileName: 'b.pdf', sortOrder: 1 }),
      doc({ id: 'c', title: 'Third', sortOrder: 2 }),
    ]);

    const text = document.body.textContent ?? '';
    expect(text.indexOf('First')).toBeLessThan(text.indexOf('Second'));
    expect(text.indexOf('Second')).toBeLessThan(text.indexOf('Third'));
  });
});

describe('a class video on Cloudflare Stream', () => {
  it('plays in Cloudflare\'s player, not a <video> tag', async () => {
    render(<DocumentList documents={[streamDoc({})]} />);
    const frame = await screen.findByTitle('Tuesday class recording');
    expect(frame.tagName).toBe('IFRAME');
    expect(frame).toHaveAttribute('src', `${STREAM_BASE}/iframe`);
    expect(document.querySelector('video')).toBeNull();
  });

  it('offers Cloudflare\'s MP4 as a plain Download link where the browser cannot share a file', async () => {
    const onDownload = jest.fn();
    render(<DocumentList documents={[streamDoc({})]} onDownload={onDownload} />);
    await screen.findByTitle('Tuesday class recording');
    const link = screen.getByRole('link', { name: /download/i });
    expect(link).toHaveAttribute('href', `${STREAM_BASE}/downloads/default.mp4?filename=Tuesday-class-recording.mp4`);
    // No target: Cloudflare sends the file as an attachment, so the page stays.
    expect(link).not.toHaveAttribute('target');
    fireEvent.click(link);
    expect(onDownload).toHaveBeenCalledWith(expect.objectContaining({ id: 'doc-stream' }));
  });

  describe('Save to Photos, on a phone that can share a file', () => {
    const shareSpy = jest.fn();
    const fetchSpy = jest.fn();
    /** A fake MP4 body: two chunks, the first held back until `release` runs. */
    let release: () => void = () => {};
    const fakeResponse = (total: number | null, signal?: AbortSignal) => {
      const first = new Promise<void>(res => { release = res; });
      const abort = () => { const e = new Error('aborted'); e.name = 'AbortError'; return e; };
      const chunks = [new Uint8Array(4).fill(1), new Uint8Array(6).fill(2)];
      let i = 0;
      return {
        ok: true,
        status: 200,
        headers: { get: (h: string) => (h === 'content-length' ? (total === null ? null : String(total)) : h === 'content-type' ? 'video/mp4' : null) },
        body: {
          getReader: () => ({
            read: async () => {
              if (i === 0) await first;
              // Like the real reader: a read after abort rejects.
              if (signal?.aborted) throw abort();
              return i < chunks.length ? { done: false, value: chunks[i++] } : { done: true, value: undefined };
            },
            cancel: jest.fn().mockResolvedValue(undefined),
          }),
          cancel: jest.fn().mockResolvedValue(undefined),
        },
      };
    };

    const RESOLVED = `${STREAM_BASE}/dl/default.mp4?p=signed&s=sig`;

    beforeEach(() => {
      mockResolveDownload.mockReset().mockResolvedValue(RESOLVED);
      Object.defineProperty(navigator, 'share', { value: shareSpy, configurable: true, writable: true });
      Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true, writable: true });
      (global as any).fetch = fetchSpy;
      shareSpy.mockReset().mockResolvedValue(undefined);
      fetchSpy.mockReset().mockImplementation(async (_url: string, init?: RequestInit) => fakeResponse(10, init?.signal ?? undefined));
    });
    afterEach(() => {
      delete (navigator as any).share;
      delete (navigator as any).canShare;
      delete (global as any).fetch;
    });

    it('is a Download button, not a link, and one tap fetches the MP4 with a progress line', async () => {
      const onDownload = jest.fn();
      render(<DocumentList documents={[streamDoc({})]} onDownload={onDownload} />);
      await screen.findByTitle('Tuesday class recording');
      expect(screen.queryByRole('link', { name: /download/i })).toBeNull();

      const button = screen.getByRole('button', { name: /download/i });
      await act(async () => { fireEvent.click(button); });

      // The recorded URL redirects without CORS headers, so the fetch goes
      // to the target the function resolved, not to the recorded URL.
      expect(mockResolveDownload).toHaveBeenCalledWith('0123456789abcdef0123456789abcdef', 'Tuesday class recording');
      expect(fetchSpy).toHaveBeenCalledWith(RESOLVED, expect.objectContaining({ credentials: 'omit' }));
      // The audit sees the download the moment it starts.
      expect(onDownload).toHaveBeenCalledWith(expect.objectContaining({ id: 'doc-stream' }));
      // While it is coming: the control is disabled, and the words say so.
      expect(button).toBeDisabled();
      expect(screen.getByRole('progressbar', { name: /getting the video/i })).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent(/Getting the video ready — 0% of 0.0 MB. Keep this page open./);

      // A second, third, fourth tap starts nothing.
      fireEvent.click(button); fireEvent.click(button); fireEvent.click(button);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      await act(async () => { release(); });
      const save = await screen.findByRole('button', { name: /save to photos/i });
      expect(save).toBeEnabled();
      expect(screen.getByRole('status')).toHaveTextContent(/Ready. Tap Save to Photos, then choose Save Video./);
      expect(screen.queryByRole('progressbar')).toBeNull();

      await act(async () => { fireEvent.click(save); });
      expect(shareSpy).toHaveBeenCalledTimes(1);
      const shared = shareSpy.mock.calls[0][0];
      expect(shared.title).toBe('Tuesday class recording');
      expect(shared.files).toHaveLength(1);
      expect(shared.files[0]).toBeInstanceOf(File);
      expect(shared.files[0].name).toBe('Tuesday-class-recording.mp4');
      expect(shared.files[0].type).toBe('video/mp4');
      expect(shared.files[0].size).toBe(10);
      expect(screen.getByRole('status')).toHaveTextContent(/Done\./);
      // Still there for a second send; the file is kept, not re-fetched.
      expect(screen.getByRole('button', { name: /save to photos/i })).toBeEnabled();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('goes back to Download when the fetch is cancelled', async () => {
      render(<DocumentList documents={[streamDoc({})]} />);
      await screen.findByTitle('Tuesday class recording');
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /download/i })); });
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /cancel/i })); });
      // The held-back read resolves after the abort; the component must
      // not treat that as success.
      await act(async () => { release(); });
      expect(await screen.findByRole('button', { name: /^download$/i })).toBeEnabled();
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('hands a video over the size cap to the browser download instead, and says so', async () => {
      fetchSpy.mockImplementation(async (_url: string, init?: RequestInit) => fakeResponse(400 * 1024 * 1024, init?.signal ?? undefined));
      render(<DocumentList documents={[streamDoc({})]} />);
      await screen.findByTitle('Tuesday class recording');
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /download/i })); });
      await waitFor(() => expect(assignSpy).toHaveBeenCalledWith(
        `${STREAM_BASE}/downloads/default.mp4?filename=Tuesday-class-recording.mp4`,
      ));
      expect(screen.getByRole('status')).toHaveTextContent(/too big to save straight to Photos/);
      expect(screen.getByRole('link', { name: /download/i })).toBeInTheDocument();
      expect(openSpy).not.toHaveBeenCalled();
    });

    it('says what to do when the redirect cannot be resolved, and lets them try again', async () => {
      mockResolveDownload.mockRejectedValueOnce(new Error('No download for that video yet.'));
      render(<DocumentList documents={[streamDoc({})]} />);
      await screen.findByTitle('Tuesday class recording');
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /download/i })); });
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(screen.getByRole('status')).toHaveTextContent(/Check your connection and tap Download again/);
      expect(screen.getByRole('button', { name: /download/i })).toBeEnabled();
    });

    it('says what to do when the fetch fails, and lets them try again', async () => {
      fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      render(<DocumentList documents={[streamDoc({})]} />);
      await screen.findByTitle('Tuesday class recording');
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /download/i })); });
      expect(screen.getByRole('status')).toHaveTextContent(/Check your connection and tap Download again/);
      expect(screen.getByRole('button', { name: /download/i })).toBeEnabled();
    });

    it('stays ready when the share sheet is dismissed, and falls back when it will not open', async () => {
      const dismissed = new Error('cancelled'); dismissed.name = 'AbortError';
      shareSpy.mockRejectedValueOnce(dismissed).mockRejectedValueOnce(new Error('NotAllowedError'));
      render(<DocumentList documents={[streamDoc({})]} />);
      await screen.findByTitle('Tuesday class recording');
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /download/i })); });
      await act(async () => { release(); });
      const save = await screen.findByRole('button', { name: /save to photos/i });

      await act(async () => { fireEvent.click(save); });
      expect(screen.getByRole('button', { name: /save to photos/i })).toBeEnabled();
      expect(assignSpy).not.toHaveBeenCalled();

      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /save to photos/i })); });
      expect(assignSpy).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('status')).toHaveTextContent(/downloading it as a file instead/);
    });
  });

  it('offers no Download until Cloudflare has built the MP4', async () => {
    render(<DocumentList documents={[streamDoc({ streamDownloadUrl: null })]} />);
    await screen.findByTitle('Tuesday class recording');
    expect(screen.queryByRole('link', { name: /download/i })).toBeNull();
    expect(screen.queryByText('Save')).toBeNull();
  });

  it('shows the duration where a bucket file shows its size', async () => {
    render(<DocumentList documents={[streamDoc({})]} />);
    await screen.findByTitle('Tuesday class recording');
    expect(screen.getByText('30:34')).toBeInTheDocument();
    expect(screen.queryByText(/GB/)).toBeNull();
  });

  it('does not ask storage to sign anything for it', async () => {
    render(<DocumentList documents={[streamDoc({})]} />);
    await screen.findByTitle('Tuesday class recording');
    expect(mockGetDocumentUrls).not.toHaveBeenCalled();
  });

  it('says it is still processing rather than showing an empty player', async () => {
    render(<DocumentList documents={[streamDoc({ streamStatus: 'pending', durationSeconds: null })]} />);
    expect(await screen.findByText(/still processing/i)).toBeInTheDocument();
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('says so when Cloudflare could not process it', async () => {
    render(<DocumentList documents={[streamDoc({ streamStatus: 'error', durationSeconds: null })]} />);
    expect(await screen.findByText(/could not be processed/i)).toBeInTheDocument();
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('sits in the list beside bucket files, which are still signed', async () => {
    await renderList([doc({}), streamDoc({})]);
    expect(mockGetDocumentUrls).toHaveBeenCalledWith(['allstars/abc-costume.jpg']);
    expect(await screen.findByTitle('Tuesday class recording')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Costume photo' })).toBeInTheDocument();
  });
});
