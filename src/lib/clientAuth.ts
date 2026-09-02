import { supabase, isSupabaseConfigured } from './supabase';

/**
 * Client (parent) authentication — the flag and the portal-signup calls.
 *
 * TWO FLAGS, TWO STAGES
 *
 * These are deliberately separate so the new login can be TESTED in parallel
 * with the live portal before it ever becomes mandatory:
 *
 *   REACT_APP_CLIENT_AUTH ("enabled") — the new login flow EXISTS and is
 *   reachable: the /portal/login|signup|account routes are registered and a
 *   small "client login" button appears on the front door. It does NOT gate
 *   the existing portal. With this on and REQUIRED off, real families use the
 *   studio access code exactly as before (anonymous reads, no login), while a
 *   handful of test users can exercise the new login through the small button.
 *   A test user who logs in may then open any program without the code, which
 *   is how you confirm the login works as an access mechanism.
 *
 *   REACT_APP_CLIENT_AUTH_REQUIRED ("required") — the full launch. Now the
 *   whole portal sits behind the sign-in: ProgramGate and PortalHome demand a
 *   session and the access-code path is retired. This must land TOGETHER with
 *   the v30 migration, which closes the anon door database-side — one without
 *   the other is either a login nobody needs or a portal nobody can read. See
 *   supabase-migration-v30-close-anon-door.sql and CLIENT-AUTH-LAUNCH.md.
 *
 * Stages: (1) test → CLIENT_AUTH=true,  REQUIRED=false, v30 NOT applied.
 *         (2) launch → CLIENT_AUTH=true, REQUIRED=true,  v30 applied.
 * REQUIRED implies ENABLED; setting REQUIRED without ENABLED is meaningless
 * (the login routes would not be registered), so the guard below treats
 * REQUIRED as forcing ENABLED on.
 *
 * THE SIGNUP CONTRACT
 *
 * Every portal-signup response is 200 { ok: true } whatever the roster says —
 * on purpose, so this endpoint cannot be used to test which families attend
 * the studio. The UI must therefore never branch on "was the email on file";
 * the honest copy is "if your email is on our roster, a code is on its way".
 * The real decisions (roster check, account creation, sending the code) all
 * happen server-side after the response.
 */

// REQUIRED implies ENABLED — see the header. Reading it this way means a
// misconfiguration (REQUIRED without ENABLED) still registers the login routes
// rather than gating the portal behind a login that has no page to show.
export const CLIENT_AUTH_REQUIRED = process.env.REACT_APP_CLIENT_AUTH_REQUIRED === 'true';
export const CLIENT_AUTH_ENABLED =
  process.env.REACT_APP_CLIENT_AUTH === 'true' || CLIENT_AUTH_REQUIRED;

/** Where a client password-reset email lands. Must be on the Supabase redirect allow-list. */
export const PORTAL_UPDATE_PASSWORD_PATH = '/portal/update-password';

/**
 * Minimum client password length.
 *
 * Six, not ten. Ten was locking parents out of a portal whose whole content is
 * their own child's class schedule and attendance — the friction was costing
 * more sign-ups than the extra characters were buying in safety.
 *
 * Must stay >= Supabase's own password_min_length (currently 6) or GoTrue
 * rejects what the form accepted, and it must match MIN_PASSWORD in
 * supabase/functions/portal-signup — the browser check is convenience, that one
 * is the actual gate.
 *
 * The compensating control for a shorter minimum is leaked-password checking
 * (password_hibp_enabled), which rejects known-breached passwords outright and
 * is worth far more here than two extra characters.
 */
export const CLIENT_MIN_PASSWORD = 6;

interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

const invokeSignup = async (body: Record<string, unknown>): Promise<boolean> => {
  if (!isSupabaseConfigured() || !supabase) return false;
  try {
    const { error } = await supabase.functions.invoke('portal-signup', { body });
    if (error) {
      console.error('portal-signup failed:', error);
      return false;
    }
    return true;
  } catch (e) {
    console.error('portal-signup threw:', e);
    return false;
  }
};

/**
 * Step 1 of signup. UX only — register re-checks everything server-side — and
 * the answer never says whether the email matched, so the return value is just
 * "the request went through".
 */
export const portalCheckEmail = (email: string): Promise<boolean> =>
  invokeSignup({ action: 'check', email });

/**
 * Step 2: create the account and send the 6-digit code. `true` means the
 * request was accepted, NOT that an account exists — that is the enumeration
 * contract above.
 */
export const portalRegister = (input: RegisterInput): Promise<boolean> =>
  invokeSignup({ action: 'register', ...input });

/** "Send me a new code" on the verify screen. Same silence as register. */
export const portalResendCode = (email: string): Promise<boolean> =>
  invokeSignup({ action: 'resend', email });

/**
 * Failed sign-in telemetry for the audit log. Fire-and-forget by design: a
 * logging hiccup must never make a failed login fail differently. GoTrue on
 * this project keeps no auth audit trail (auth.audit_log_entries is empty), so
 * the app reports its own; the server marks the row client_reported and rate
 * limits it.
 */
export const reportSignInFailure = (email: string): void => {
  void invokeSignup({ action: 'signin_failed', email });
};

/**
 * Failed OTP verification telemetry. Same contract as reportSignInFailure —
 * the browser is anon on the verify screen and v29 revokes log_activity from
 * anon, so the server writes the row (marked client_reported, rate limited).
 */
export const reportVerifyFailure = (email: string): void => {
  void invokeSignup({ action: 'verify_failed', email });
};

/**
 * Password-reset-request telemetry. The reset form only renders signed out,
 * so the same anon constraint applies and the server writes the row.
 */
export const reportResetRequested = (email: string): void => {
  void invokeSignup({ action: 'reset_requested', email });
};
