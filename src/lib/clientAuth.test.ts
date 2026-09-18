import { portalRegister } from './clientAuth';

/**
 * The wire format of a signup, as portal-signup reads it.
 *
 * The agreement notice on the signup form is only worth something if the
 * version it showed reaches the audit log, and the one place that can quietly
 * drop it is here, between the form and the edge function: portal-signup reads
 * body.acceptedTermsVersion, and nothing but a key-for-key match gets it there.
 */

const mockInvoked: Array<{ name: string; body: Record<string, unknown> }> = [];

jest.mock('./supabase', () => ({
  isSupabaseConfigured: () => true,
  supabase: {
    functions: {
      invoke: (name: string, opts: { body: Record<string, unknown> }) => {
        mockInvoked.push({ name, body: opts.body });
        return Promise.resolve({ data: { ok: true }, error: null });
      },
    },
  },
}));

beforeEach(() => { mockInvoked.length = 0; });

it('sends the accepted terms version to portal-signup under the key it reads', async () => {
  await expect(portalRegister({
    email: 'rosa@example.com',
    password: 'dance123',
    firstName: 'Rosa',
    lastName: 'Alvarez',
    acceptedTermsVersion: '2026-09-18',
  })).resolves.toBe(true);

  expect(mockInvoked).toHaveLength(1);
  expect(mockInvoked[0].name).toBe('portal-signup');
  expect(mockInvoked[0].body).toEqual(expect.objectContaining({
    action: 'register',
    email: 'rosa@example.com',
    acceptedTermsVersion: '2026-09-18',
  }));
});
