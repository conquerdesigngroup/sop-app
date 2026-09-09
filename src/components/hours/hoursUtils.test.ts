import { shareOrDownloadCSV, shareOrDownloadFile } from './hoursUtils';

/**
 * The delivery half of the hours exports.
 *
 * The rules here are the ones with a user-visible failure mode: a file that
 * arrives twice, a file that arrives after the person said no, or a print
 * button that quietly does nothing.
 */

const CSV = 'a,b\r\n1,2';

describe('shareOrDownloadCSV', () => {
  let clicks: number;
  let created: string[];

  beforeEach(() => {
    clicks = 0;
    created = [];
    // jsdom implements neither, and downloadCSV needs both.
    (URL as any).createObjectURL = jest.fn(() => {
      created.push('blob:x');
      return 'blob:x';
    });
    (URL as any).revokeObjectURL = jest.fn();
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { clicks += 1; });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete (navigator as any).share;
    delete (navigator as any).canShare;
  });

  it('downloads when the device has no share sheet', async () => {
    await expect(shareOrDownloadCSV('t.csv', CSV)).resolves.toBe('downloaded');
    expect(clicks).toBe(1);
  });

  it('downloads when share exists but refuses files — canShare is the only honest test', async () => {
    (navigator as any).share = jest.fn();
    (navigator as any).canShare = jest.fn(() => false);

    await expect(shareOrDownloadCSV('t.csv', CSV)).resolves.toBe('downloaded');
    expect(navigator.share).not.toHaveBeenCalled();
    expect(clicks).toBe(1);
  });

  it('shares the file and does NOT also download it', async () => {
    (navigator as any).canShare = jest.fn(() => true);
    (navigator as any).share = jest.fn(async () => undefined);

    await expect(shareOrDownloadCSV('team.csv', CSV)).resolves.toBe('shared');
    expect(navigator.share).toHaveBeenCalledTimes(1);

    const [{ files }] = (navigator.share as jest.Mock).mock.calls[0];
    expect(files[0].name).toBe('team.csv');
    // A download on top of a successful share is two copies of payroll data
    // the person asked for once.
    expect(clicks).toBe(0);
  });

  it('treats a dismissed share sheet as a decision, not a failure to route around', async () => {
    (navigator as any).canShare = jest.fn(() => true);
    (navigator as any).share = jest.fn(async () => {
      const err: any = new Error('share cancelled');
      err.name = 'AbortError';
      throw err;
    });

    await expect(shareOrDownloadCSV('t.csv', CSV)).resolves.toBe('cancelled');
    // They said no. Downloading anyway is the surprise this test exists to stop.
    expect(clicks).toBe(0);
  });

  it('falls back to a download when sharing fails for any other reason', async () => {
    (navigator as any).canShare = jest.fn(() => true);
    (navigator as any).share = jest.fn(async () => { throw new Error('NotAllowedError'); });

    await expect(shareOrDownloadCSV('t.csv', CSV)).resolves.toBe('downloaded');
    expect(clicks).toBe(1);
  });
});

describe('shareOrDownloadFile', () => {
  it('carries the mime type onto the shared file, so a PDF is offered as a PDF', async () => {
    (navigator as any).canShare = jest.fn(() => true);
    (navigator as any).share = jest.fn(async () => undefined);

    (URL as any).createObjectURL = jest.fn(() => 'blob:x');
    (URL as any).revokeObjectURL = jest.fn();

    const blob = new Blob(['%PDF-1.3'], { type: 'application/pdf' });
    await expect(shareOrDownloadFile('t.pdf', blob, 'application/pdf')).resolves.toBe('shared');

    const [{ files }] = (navigator.share as jest.Mock).mock.calls[0];
    expect(files[0].name).toBe('t.pdf');
    expect(files[0].type).toBe('application/pdf');

    delete (navigator as any).share;
    delete (navigator as any).canShare;
  });
});
