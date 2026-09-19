import { portalRegister } from './clientAuth';

/**
 * What register hands back to the signup form.
 *
 * portal-signup answers { ok: true } for every accepted request, on or off the
 * roster. The only refusals it states are about what the parent typed, as a
 * 400, and the form has to be able to show that sentence: a refusal it cannot
 * show is a family sent to wait for a code that will never come.
 */

let mockResult: { data: unknown; error: unknown } = { data: { ok: true }, error: null };

jest.mock('./supabase', () => ({
  isSupabaseConfigured: () => true,
  supabase: {
    functions: {
      invoke: () => Promise.resolve(mockResult),
    },
  },
}));

const input = { email: 'rosa@example.com', password: 'password1', firstName: 'Rosa', lastName: 'Alvarez' };

// supabase-js puts the function's Response on FunctionsHttpError.context.
const refusal = (status: number, body: unknown) => ({
  data: null,
  error: { name: 'FunctionsHttpError', context: { status, json: () => Promise.resolve(body) } },
});

it('reports an accepted signup as ok', async () => {
  mockResult = { data: { ok: true }, error: null };
  await expect(portalRegister(input)).resolves.toEqual({ ok: true });
});

it('passes a 400 refusal through in words the form can show', async () => {
  mockResult = refusal(400, { error: 'That password has appeared in a data breach. Please choose a different one.' });
  await expect(portalRegister(input)).resolves.toEqual({
    ok: false,
    error: 'That password has appeared in a data breach. Please choose a different one.',
  });
});

it('keeps a server failure to itself', async () => {
  mockResult = refusal(500, { error: 'Function is missing Supabase environment configuration' });
  await expect(portalRegister(input)).resolves.toEqual({ ok: false });
});
