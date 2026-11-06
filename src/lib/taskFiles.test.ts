import {
  buildTaskFilePath,
  describeTaskFileProblem,
  isPreviewableImage,
  normalizeTaskFiles,
  MAX_TASK_FILE_BYTES,
} from './taskFiles';

jest.mock('./supabase', () => ({ supabase: { storage: { from: jest.fn() } } }));

const fileOfSize = (name: string, size: number, type = 'application/pdf'): File => {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};

describe('taskFiles', () => {
  it('starts every key with the uploader uid, because the storage policy demands it', () => {
    const path = buildTaskFilePath('user-123', 'Opening Checklist.PDF');
    expect(path.startsWith('user-123/')).toBe(true);
    expect(path.endsWith('.pdf')).toBe(true);
  });

  it('drops an extension that could not be a real one', () => {
    expect(buildTaskFilePath('u', 'weird.name with spaces/../x')).toMatch(/^u\/[^.]+$/);
    expect(buildTaskFilePath('u', 'noextension')).toMatch(/^u\/[^.]+$/);
  });

  it('refuses empty and oversized files with a sentence', () => {
    expect(describeTaskFileProblem(fileOfSize('a.pdf', 0))).toMatch(/empty/);
    expect(describeTaskFileProblem(fileOfSize('big.mov', MAX_TASK_FILE_BYTES + 1))).toMatch(/25 MB/);
    expect(describeTaskFileProblem(fileOfSize('ok.pdf', 1000))).toBeNull();
  });

  it('previews photos a browser can draw, and lists HEIC as a file', () => {
    expect(isPreviewableImage({ mimeType: 'image/jpeg', name: 'a.jpg' })).toBe(true);
    expect(isPreviewableImage({ mimeType: '', name: 'shot.PNG' })).toBe(true);
    expect(isPreviewableImage({ mimeType: 'image/heic', name: 'IMG_1.HEIC' })).toBe(false);
    expect(isPreviewableImage({ mimeType: 'application/pdf', name: 'a.pdf' })).toBe(false);
  });

  it('cleans whatever jsonb hands back', () => {
    expect(normalizeTaskFiles(null)).toEqual([]);
    expect(normalizeTaskFiles('nope')).toEqual([]);
    const out = normalizeTaskFiles([
      { id: 'a', path: 'u/a.jpg', name: 'a.jpg', mimeType: 'image/jpeg', size: 10, uploadedAt: 't' },
      { name: 'no path' },
      null,
      { path: 'u/b' },
    ]);
    expect(out.map(f => f.path)).toEqual(['u/a.jpg', 'u/b']);
    expect(out[1]).toMatchObject({ id: 'u/b', name: 'file', size: 0 });
  });
});
