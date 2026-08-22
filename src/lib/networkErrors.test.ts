import { isNetworkFailure } from './networkErrors';

describe('isNetworkFailure', () => {
  describe('treats a transport failure as retryable', () => {
    it.each([
      ['Chrome / Firefox fetch', new TypeError('Failed to fetch')],
      ['Firefox NetworkError', new Error('NetworkError when attempting to fetch resource.')],
      ['Safari', new Error('Load failed')],
      ['React Native polyfill', new Error('Network request failed')],
      ['any bare TypeError', new TypeError('')],
    ])('%s', (_label, thrown) => {
      expect(isNetworkFailure(thrown)).toBe(true);
    });
  });

  describe('does NOT queue an answer the server actually sent', () => {
    it.each([
      [
        'RLS refusal',
        { message: 'new row violates row-level security policy for table "work_hours"' },
      ],
      ['check constraint', { message: 'new row for relation "work_hours" violates check constraint' }],
      ['bad uuid', { message: 'invalid input syntax for type uuid: "wh_1712_ab12"' }],
      ['expired JWT', { message: 'JWT expired' }],
      ['unknown column', { message: "column work_hours.total_hours can only be updated to DEFAULT" }],
    ])('%s', (_label, thrown) => {
      expect(isNetworkFailure(thrown)).toBe(false);
    });
  });

  describe('is safe on junk', () => {
    it.each([
      ['null', null],
      ['undefined', undefined],
      ['a string', 'Failed to fetch'],
      ['a number', 500],
      ['an object with no message', {}],
      ['a non-string message', { message: { nested: true } }],
    ])('%s', (_label, thrown) => {
      expect(isNetworkFailure(thrown)).toBe(false);
    });
  });
});
