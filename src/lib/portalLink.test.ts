import {
  isSafeLinkUrl, linkButtonLabel, linkHost, normalizeLinkLabel, normalizeLinkUrl,
} from './portalLink';

/**
 * The rules an info post's link is held to.
 *
 * This is the layer that decides what reaches an href, so the cases that
 * matter most are the ones it must refuse. The two halves have to be read
 * together: normalizeLinkUrl deliberately does NOT sanitise — it leaves
 * anything scheme-shaped exactly as typed so that isSafeLinkUrl is the thing
 * saying no. A test that only checked normalize would call `javascript:` handled.
 */

describe('normalizeLinkUrl', () => {
  it('is null for a field nobody filled in', () => {
    expect(normalizeLinkUrl('')).toBeNull();
    expect(normalizeLinkUrl('   ')).toBeNull();
  });

  it('adds the scheme somebody typing on a phone left off', () => {
    expect(normalizeLinkUrl('didc.app/tickets')).toBe('https://didc.app/tickets');
    expect(normalizeLinkUrl('  www.didc.app  ')).toBe('https://www.didc.app');
  });

  it('leaves a scheme that is already there alone, http included', () => {
    expect(normalizeLinkUrl('http://didc.app')).toBe('http://didc.app');
    expect(normalizeLinkUrl('https://didc.app')).toBe('https://didc.app');
  });

  it('does NOT prefix something that names a scheme, however bad', () => {
    // The trap this avoids: prefixing gives https://javascript:alert(1), which
    // passes every check and silently does nothing. It has to stay recognisable
    // so isSafeLinkUrl can reject it.
    expect(normalizeLinkUrl('javascript:alert(1)')).toBe('javascript:alert(1)');
  });
});

describe('isSafeLinkUrl', () => {
  it('accepts http and https', () => {
    expect(isSafeLinkUrl('https://didc.app/tickets?a=1')).toBe(true);
    expect(isSafeLinkUrl('HTTP://didc.app')).toBe(true);
  });

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'mailto:office@didc.app',
    '/tickets',
    'didc.app',
    'https://',
    '',
  ])('refuses %s', value => {
    expect(isSafeLinkUrl(value)).toBe(false);
  });

  it('refuses nothing at all', () => {
    expect(isSafeLinkUrl(null)).toBe(false);
    expect(isSafeLinkUrl(undefined)).toBe(false);
  });
});

describe('what the button says', () => {
  it('uses the label when there is one', () => {
    expect(linkButtonLabel('https://didc.app/t', 'Buy tickets')).toBe('Buy tickets');
  });

  it('falls back to the host, without www', () => {
    expect(linkButtonLabel('https://www.didc.app/t', null)).toBe('didc.app');
    expect(linkButtonLabel('https://didc.app/t', '   ')).toBe('didc.app');
  });

  it('has a last resort rather than an empty button', () => {
    expect(linkButtonLabel('https://', null)).toBe('Open link');
  });
});

describe('the small ones', () => {
  it('trims a label to words or nothing', () => {
    expect(normalizeLinkLabel('  Buy tickets ')).toBe('Buy tickets');
    expect(normalizeLinkLabel('   ')).toBeNull();
  });

  it('reads a host, or says it cannot', () => {
    expect(linkHost('https://tickets.didc.app/x')).toBe('tickets.didc.app');
    expect(linkHost('not a url')).toBeNull();
    expect(linkHost(null)).toBeNull();
  });
});
