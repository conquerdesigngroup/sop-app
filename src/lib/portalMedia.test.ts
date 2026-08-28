import {
  extensionOf,
  mediaKindOf,
  isPlayable,
  withDownload,
  compatibilityWarning,
} from './portalMedia';

describe('extensionOf', () => {
  it('lowercases and drops the dot', () => {
    expect(extensionOf('Costume List.PDF')).toBe('pdf');
  });

  it('takes the last extension, not the first', () => {
    expect(extensionOf('routine.final.mp4')).toBe('mp4');
  });

  it('is empty for a name with no extension', () => {
    expect(extensionOf('handout')).toBe('');
  });

  it('is empty for a dotfile — the dot is not an extension separator there', () => {
    expect(extensionOf('.gitignore')).toBe('');
  });

  it('is empty for a trailing dot', () => {
    expect(extensionOf('weird.')).toBe('');
  });
});

describe('mediaKindOf', () => {
  it('reads the MIME type first', () => {
    expect(mediaKindOf('image/png', 'anything')).toBe('image');
    expect(mediaKindOf('video/mp4', 'anything')).toBe('video');
    expect(mediaKindOf('audio/mpeg', 'anything')).toBe('audio');
    expect(mediaKindOf('application/pdf', 'anything')).toBe('file');
  });

  it('trusts the MIME type over a misleading name', () => {
    expect(mediaKindOf('image/jpeg', 'costumes.pdf')).toBe('image');
  });

  it('does not let the extension table override a real non-media type', () => {
    // The name says video, the server says PDF. The server wins, because that
    // is what the browser will be handed.
    expect(mediaKindOf('application/pdf', 'routine.mp4')).toBe('file');
  });

  it('falls back to the extension when the MIME is missing', () => {
    expect(mediaKindOf(null, 'recital.mov')).toBe('video');
    expect(mediaKindOf('', 'costume.HEIC')).toBe('image');
  });

  it('falls back to the extension for octet-stream, which means nothing', () => {
    // iOS and some Android pickers send this for an ordinary .mov.
    expect(mediaKindOf('application/octet-stream', 'jazz-combo.mov')).toBe('video');
    expect(mediaKindOf('binary/octet-stream', 'music.mp3')).toBe('audio');
  });

  it('is a plain file when nothing identifies it', () => {
    expect(mediaKindOf(null, 'notes')).toBe('file');
    expect(mediaKindOf(null, 'sheet.xlsx')).toBe('file');
  });

  it('ignores case in the MIME type', () => {
    expect(mediaKindOf('IMAGE/JPEG', 'x')).toBe('image');
  });
});

describe('isPlayable', () => {
  it('is true for the three that render in place', () => {
    expect(isPlayable('image')).toBe(true);
    expect(isPlayable('video')).toBe(true);
    expect(isPlayable('audio')).toBe(true);
  });

  it('is false for a plain file', () => {
    expect(isPlayable('file')).toBe(false);
  });
});

describe('withDownload', () => {
  const signed = 'https://x.supabase.co/storage/v1/object/sign/portal-documents/a/b.pdf?token=abc';

  it('appends to an URL that already has a query', () => {
    expect(withDownload(signed, 'Costume list.pdf'))
      .toBe(`${signed}&download=Costume%20list.pdf`);
  });

  it('starts the query when there is not one', () => {
    expect(withDownload('https://x/y', 'a.pdf')).toBe('https://x/y?download=a.pdf');
  });

  it('encodes characters that would otherwise end the query value', () => {
    // encodeURI leaves both of these alone, which is why this is not it.
    const out = withDownload(signed, 'Recital #2 & 3.pdf');
    expect(out).toContain('download=Recital%20%232%20%26%203.pdf');
    expect(out).not.toContain('#2');
  });

  it('never produces an empty filename', () => {
    expect(withDownload(signed, '')).toContain('download=file');
  });

  it('leaves the signature untouched', () => {
    expect(withDownload(signed, 'a.pdf').startsWith(signed)).toBe(true);
  });
});

describe('compatibilityWarning', () => {
  it('warns about HEIC by MIME and by extension', () => {
    expect(compatibilityWarning('image/heic', 'x.heic')).toMatch(/Apple/);
    expect(compatibilityWarning('', 'IMG_0042.HEIC')).toMatch(/Apple/);
  });

  it('warns about .mov', () => {
    expect(compatibilityWarning('video/quicktime', 'x.mov')).toMatch(/MP4/);
    expect(compatibilityWarning('', 'recital.MOV')).toMatch(/MP4/);
  });

  it('is silent for the formats that play everywhere', () => {
    expect(compatibilityWarning('image/jpeg', 'a.jpg')).toBeNull();
    expect(compatibilityWarning('video/mp4', 'a.mp4')).toBeNull();
    expect(compatibilityWarning('application/pdf', 'a.pdf')).toBeNull();
    expect(compatibilityWarning('audio/mpeg', 'a.mp3')).toBeNull();
  });
});
