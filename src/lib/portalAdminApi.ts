/**
 * The one way to call the portal-admin edge function.
 *
 * Every admin action that touches the roster, client accounts or the class
 * import goes through that function so it is logged exactly once, in one place.
 * This unwraps its error shape: supabase-js reports a non-2xx as a generic
 * "Edge Function returned a non-2xx status code", and the message worth showing
 * is in the JSON body behind `error.context`.
 */

import { supabase } from './supabase';

export const callPortalAdmin = async (body: Record<string, unknown>): Promise<any> => {
  const { data, error } = await supabase.functions.invoke('portal-admin', { body });
  if (error) {
    let message = error.message || 'The request failed';
    try {
      const parsed = await (error as any).context?.json?.();
      if (parsed?.error) message = parsed.error;
    } catch { /* keep the generic message */ }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
};
