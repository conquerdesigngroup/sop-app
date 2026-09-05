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
  ...over,
});

/**
 * Renders and waits until the signing round-trip has LANDED — not merely until
 * it was requested.
 *
 * That difference is what made this file flaky. `waitFor` runs with React's act
 * environment switched off, so the setState that fires when signing resolves is
 * queued on React's own scheduler rather than on the act queue — and `act` only
 * flushes the act queue. The old helper awaited a single microtask and caught
 * the re-render roughly two runs in three. Nor is a bigger flush the answer:
 * every fixed number of microtask or macrotask turns has some promise shape it
 * misses. Only a retrying wait is sound.
 *
 * A file with a URL renders as media or an <a>; one without renders as a
 * <button>. So the update has been applied once the buttons on the page have
 * settled to exactly the files the signing call declined to sign.
 */
const renderList = async (documents: PortalDocument[]) => {
  const view = render(<DocumentList documents={documents} />);
  await waitFor(() => expect(mockGetDocumentUrls).toHaveBeenCalled());

  // The map the component itself was handed, so the count below is derived
  // from what this test actually stubbed rather than restated by hand.
  const signed: Record<string, string> = await mockGetDocumentUrls.mock.results[0].value;
  const unsigned = documents.filter(d => !signed[d.storagePath]).length;
  await waitFor(() => expect(screen.queryAllByRole('button')).toHaveLength(unsigned));

  return view;
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
    const { container } = await renderList([video()]);

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
    const { container } = await renderList([
      video({ mimeType: 'application/octet-stream', fileName: 'jazz.mov' }),
    ]);

    expect(container.querySelector('video')).toBeInTheDocument();
  });

  it('falls back to a download row when the codec is not supported', async () => {
    const { container } = await renderList([video()]);

    fireEvent.error(container.querySelector('video')!);

    expect(container.querySelector('video')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Routine run-through/ })).toBeInTheDocument();
  });
});

describe('music', () => {
  it('gets a player', async () => {
    const { container } = await renderList([
      doc({ title: 'Competition mix', mimeType: 'audio/mpeg', fileName: 'mix.mp3' }),
    ]);

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
    const { container } = await renderList([pdf]);

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
    const { container } = await renderList([
      doc({ mimeType: 'application/pdf', fileName: 'routine.mp4' }),
    ]);

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
    const { rerender } = await renderList([doc({})]);
    expect(mockGetDocumentUrls).toHaveBeenCalledTimes(1);

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
    // The handler signs before it navigates, so the assign lands behind an
    // await — waited for, not assumed, for the reason in renderList.
    await waitFor(() => expect(assignSpy).toHaveBeenCalledWith(`${SIGNED}&download=late.pdf`));
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('says so rather than going quiet when signing fails', async () => {
    mockGetDocumentUrl.mockResolvedValue(null);
    await renderList([unsigned]);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Late handout/ }));
    });

    expect(await screen.findByText(/Could not open/)).toBeInTheDocument();
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
