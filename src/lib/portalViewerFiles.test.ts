import {
  ViewerFile, downloadHref, filePasses, fileWhereLabel, mapViewerFile, uploaderOptions, UNKNOWN_UPLOADER,
} from './portalViewerFiles';

jest.mock('./supabase', () => ({ supabase: {} }));

const row = (over: Record<string, unknown> = {}) => ({
  id: 'd1',
  program_id: 'p1',
  class_id: 'c1',
  update_id: null,
  title: 'Costume list',
  description: '',
  category: 'Costumes',
  storage_path: 'p1/costume.pdf',
  file_name: 'costume.pdf',
  mime_type: 'application/pdf',
  size_bytes: 2048,
  sort_order: 0,
  is_published: true,
  created_at: '2026-09-20T18:00:00Z',
  uploaded_by: 'u1',
  portal_classes: { name: 'Jazz 2' },
  portal_programs: { name: 'Academy' },
  portal_updates: null,
  ...over,
});

const file = (over: Record<string, unknown> = {}, names: Record<string, string> = { u1: 'Jamie Rivera' }): ViewerFile =>
  mapViewerFile(row(over), names);

describe('mapViewerFile', () => {
  it('names the uploader from the profiles lookup', () => {
    const f = file();
    expect(f.uploaderName).toBe('Jamie Rivera');
    expect(f.className).toBe('Jazz 2');
    expect(f.doc.fileName).toBe('costume.pdf');
  });

  it('leaves the name null when the profile could not be read', () => {
    expect(file({}, {}).uploaderName).toBeNull();
  });
});

describe('fileWhereLabel', () => {
  it('prefers the info post a file hangs on', () => {
    expect(fileWhereLabel(file({ update_id: 'x', class_id: null, portal_updates: { title: 'Picture day' } })))
      .toBe('Info post: Picture day');
  });
  it('names the class, or the whole section when there is none', () => {
    expect(fileWhereLabel(file())).toBe('Jazz 2');
    expect(fileWhereLabel(file({ class_id: null, portal_classes: null }))).toBe('Everyone in Academy');
  });
  it('says so when the class row is gone', () => {
    expect(fileWhereLabel(file({ portal_classes: null }))).toBe('A deleted class');
  });
});

describe('filePasses', () => {
  const f = file();
  it('matches every word across title, file name, uploader and class', () => {
    expect(filePasses(f, 'jamie costume', null)).toBe(true);
    expect(filePasses(f, 'jazz pdf', null)).toBe(true);
    expect(filePasses(f, 'ballet', null)).toBe(false);
  });
  it('filters by uploader, with unknowns grouped together', () => {
    expect(filePasses(f, '', 'u1')).toBe(true);
    expect(filePasses(f, '', 'u2')).toBe(false);
    expect(filePasses(file({}, {}), '', UNKNOWN_UPLOADER)).toBe(true);
  });
});

describe('uploaderOptions', () => {
  it('counts files per uploader, busiest first', () => {
    const names = { u1: 'Jamie Rivera', u2: 'Sam Lee' };
    const opts = uploaderOptions([
      file({ id: 'a', uploaded_by: 'u2' }, names),
      file({ id: 'b', uploaded_by: 'u2' }, names),
      file({ id: 'c' }, names),
      file({ id: 'd', uploaded_by: null }, names),
    ]);
    expect(opts.map(o => [o.label, o.count])).toEqual([
      ['Sam Lee', 2], ['Jamie Rivera', 1], [UNKNOWN_UPLOADER, 1],
    ]);
  });
});

describe('downloadHref', () => {
  it('appends the download parameter to a signed URL', () => {
    expect(downloadHref('https://x/sign/a.pdf?token=t', 'my file.pdf'))
      .toBe('https://x/sign/a.pdf?token=t&download=my%20file.pdf');
  });
});
