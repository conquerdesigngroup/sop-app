import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { logActivity } from '../lib/activityLog';
import {
  CLIENT_AUTH_ENABLED,
  CLIENT_MIN_PASSWORD,
  PORTAL_UPDATE_PASSWORD_PATH,
  portalRegister,
  portalResendCode,
  reportResetRequested,
  reportSignInFailure,
  reportVerifyFailure,
} from '../lib/clientAuth';

/**
 * Session state for the parent portal.
 *
 * ONE SUPABASE SESSION, TWO CONTEXTS READING IT
 *
 * Staff and clients share the same Supabase client and therefore the same
 * stored session. AuthContext deliberately ignores sessions whose profile role
 * is 'client' (so a parent never grows staff chrome); this context is the
 * mirror image — it reads ANY session, works out whether it belongs to a
 * client or to staff previewing the portal, and hands the portal pages a
 * single question they care about: is somebody signed in.
 *
 * Mounted around the /portal routes only (next to PortalProvider in App.tsx),
 * so none of this runs for staff pages — and with REACT_APP_CLIENT_AUTH off it
 * mounts but does nothing observable: the gate ignores it and the routes that
 * use it are not registered.
 *
 * SIGN-IN STAYS IN THE BROWSER
 *
 * signInWithPassword talks to GoTrue directly — no proxy — so each family's
 * own IP carries GoTrue's rate limits instead of an Edge Function's shared
 * egress IP carrying all of them on a launch weekend. Failures are reported to
 * portal-signup for the audit log, fire-and-forget.
 */

interface PortalAuthProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
}

interface SignInResult {
  ok: boolean;
  error?: string;
  /** The address exists but was never verified — send them to the code screen. */
  needsVerification?: boolean;
}

interface PortalAuthValue {
  /** True until the initial session check settles. Gate on it before redirecting. */
  loading: boolean;
  /** Any signed-in account — a client, or staff previewing the portal. */
  hasSession: boolean;
  isClient: boolean;
  /** Staff previewing the portal keep their own /profile; hide client account UI. */
  isStaff: boolean;
  profile: PortalAuthProfile | null;

  signIn: (email: string, password: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
  register: (input: { email: string; password: string; firstName: string; lastName: string }) => Promise<boolean>;
  resendCode: (email: string) => Promise<void>;
  verifyCode: (email: string, token: string) => Promise<{ ok: boolean; error?: string }>;
  requestReset: (email: string) => Promise<{ ok: boolean; error?: string }>;
  changePassword: (current: string, next: string) => Promise<{ ok: boolean; error?: string }>;
}

const PortalAuthContext = createContext<PortalAuthValue | undefined>(undefined);

export const usePortalAuth = () => {
  const ctx = useContext(PortalAuthContext);
  if (!ctx) throw new Error('usePortalAuth must be used within a PortalAuthProvider');
  return ctx;
};

export const PortalAuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<PortalAuthProfile | null>(null);

  const usable = isSupabaseConfigured() && !!supabase;

  const loadProfile = useCallback(async (userId: string): Promise<PortalAuthProfile | null> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name, role, is_active')
      .eq('id', userId)
      .single();
    if (error || !data) return null;
    return {
      id: data.id,
      email: data.email,
      firstName: data.first_name ?? '',
      lastName: data.last_name ?? '',
      role: data.role,
      isActive: data.is_active !== false,
    };
  }, []);

  useEffect(() => {
    if (!usable) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const settle = async (userId: string | null) => {
      if (!userId) {
        if (!cancelled) {
          setProfile(null);
          setLoading(false);
        }
        return;
      }
      const p = await loadProfile(userId);
      if (cancelled) return;

      // A deactivated client can hold a still-valid token until it expires
      // even though new sign-ins are banned. Treat the profile flag as the
      // truth and end the session rather than showing them empty pages.
      if (p && p.role === 'client' && !p.isActive) {
        // Awaited BEFORE signOut: the RPC attributes the actor from the JWT,
        // which signOut revokes. logActivity never throws.
        await logActivity({
          action: 'user_signed_out',
          entityType: 'user',
          entityId: p.id,
          details: { surface: 'portal', forced: true, reason: 'deactivated' },
        });
        await supabase.auth.signOut();
        setProfile(null);
      } else {
        setProfile(p);
      }
      setLoading(false);
    };

    supabase.auth.getSession().then(({ data }: any) => {
      settle(data?.session?.user?.id ?? null);
    });

    // Same web-lock rule as AuthContext: never await supabase inside the
    // callback itself — dispatch via setTimeout so the auth lock is released.
    const { data: sub } = supabase.auth.onAuthStateChange((event: string, session: any) => {
      if (event === 'SIGNED_OUT') {
        setProfile(null);
        return;
      }
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') && session?.user) {
        setTimeout(() => settle(session.user.id), 0);
      }
    });

    return () => {
      cancelled = true;
      sub?.subscription?.unsubscribe?.();
    };
  }, [usable, loadProfile]);

  // ------------------------------------------------------------------ actions

  const signIn = useCallback(async (email: string, password: string): Promise<SignInResult> => {
    if (!usable) return { ok: false, error: 'The portal is not available right now.' };

    const cleanEmail = email.trim().toLowerCase();
    const { data, error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });

    if (error || !data?.user) {
      reportSignInFailure(cleanEmail);
      const msg = error?.message ?? '';
      if (/not confirmed/i.test(msg)) {
        // The account exists but the address was never verified. GoTrue only
        // says this after a CORRECT password, so offering the code screen
        // reveals nothing a stranger could use.
        return { ok: false, needsVerification: true };
      }
      if (/banned/i.test(msg)) {
        return { ok: false, error: 'This account has been disabled. Please contact the studio.' };
      }
      return { ok: false, error: 'That email and password don’t match. Try again, or reset your password below.' };
    }

    const p = await loadProfile(data.user.id);
    if (p && p.role === 'client' && !p.isActive) {
      // Awaited BEFORE signOut: the RPC attributes the actor from the JWT,
      // which signOut revokes. logActivity never throws.
      await logActivity({
        action: 'user_sign_in_failed',
        entityType: 'user',
        entityId: data.user.id,
        entityTitle: cleanEmail,
        result: 'failure',
        details: { surface: 'portal', reason: 'deactivated' },
      });
      await supabase.auth.signOut();
      return { ok: false, error: 'This account has been disabled. Please contact the studio.' };
    }

    setProfile(p);
    void logActivity({
      action: 'user_signed_in',
      entityType: 'user',
      entityId: data.user.id,
      details: { surface: 'portal' },
    });
    return { ok: true };
  }, [usable, loadProfile]);

  const signOut = useCallback(async () => {
    if (!usable) return;
    const id = profile?.id;
    if (id) {
      void logActivity({ action: 'user_signed_out', entityType: 'user', entityId: id, details: { surface: 'portal' } });
    }
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error('Portal sign-out failed:', e);
    }
    setProfile(null);
  }, [usable, profile?.id]);

  const register = useCallback(
    (input: { email: string; password: string; firstName: string; lastName: string }) =>
      portalRegister({
        ...input,
        email: input.email.trim().toLowerCase(),
      }),
    []
  );

  const resendCode = useCallback(async (email: string) => {
    await portalResendCode(email.trim().toLowerCase());
  }, []);

  const verifyCode = useCallback(async (email: string, token: string) => {
    if (!usable) return { ok: false, error: 'The portal is not available right now.' };

    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: token.trim(),
      type: 'email',
    });

    if (error || !data?.session) {
      // The browser is anon here and v29 revokes log_activity from anon, so
      // the failure is reported via portal-signup instead.
      reportVerifyFailure(email.trim().toLowerCase());
      // Wrong code and nonexistent account read identically here, which is
      // exactly right — this screen must not become the roster oracle the
      // signup endpoint refuses to be.
      return { ok: false, error: 'That code is not right or has expired. Check the email or send a new one.' };
    }

    void logActivity({
      action: 'client_email_verified',
      entityType: 'user',
      entityId: data.session.user?.id,
      details: {},
    });
    return { ok: true };
  }, [usable]);

  const requestReset = useCallback(async (email: string) => {
    if (!usable) return { ok: false, error: 'The portal is not available right now.' };
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}${PORTAL_UPDATE_PASSWORD_PATH}`,
      });
      // Rate limiting is actionable; "no such user" is not ours to disclose.
      if (error && /rate|limit|too many/i.test(error.message)) {
        return { ok: false, error: 'Too many attempts. Please wait a minute and try again.' };
      }
      if (error) console.error('Portal reset request failed:', error);
      // Logged server-side via portal-signup: this form only renders signed
      // out (PortalLogin redirects sessions away), and v29 revokes
      // log_activity from anon, so a logActivity here would be dropped.
      reportResetRequested(email.trim().toLowerCase());
      return { ok: true };
    } catch (e) {
      console.error('Portal reset request threw:', e);
      return { ok: true };
    }
  }, [usable]);

  const changePassword = useCallback(async (current: string, next: string) => {
    if (!usable || !profile) return { ok: false, error: 'You are not signed in.' };
    if (next.length < CLIENT_MIN_PASSWORD) {
      return { ok: false, error: `Password must be at least ${CLIENT_MIN_PASSWORD} characters` };
    }

    // Re-authenticate first so a hijacked open session cannot silently change
    // the password. Same pattern as the staff profile page.
    const { error: reauthErr } = await supabase.auth.signInWithPassword({
      email: profile.email,
      password: current,
    });
    if (reauthErr) {
      void logActivity({
        action: 'user_password_changed',
        entityType: 'user',
        entityId: profile.id,
        entityTitle: `${profile.firstName} ${profile.lastName}`.trim() || profile.email,
        result: 'failure',
        details: { surface: 'portal', reason: 'wrong_current_password' },
      });
      return { ok: false, error: 'Your current password is not right.' };
    }

    const { error } = await supabase.auth.updateUser({ password: next });
    if (error) {
      return { ok: false, error: error.message || 'Could not update your password.' };
    }

    void logActivity({
      action: 'user_password_changed',
      entityType: 'user',
      entityId: profile.id,
      entityTitle: `${profile.firstName} ${profile.lastName}`.trim() || profile.email,
      details: { surface: 'portal' },
    });
    return { ok: true };
  }, [usable, profile]);

  const value = useMemo<PortalAuthValue>(() => ({
    loading,
    hasSession: !!profile,
    isClient: profile?.role === 'client',
    isStaff: !!profile && profile.role !== 'client',
    profile,
    signIn,
    signOut,
    register,
    resendCode,
    verifyCode,
    requestReset,
    changePassword,
  }), [loading, profile, signIn, signOut, register, resendCode, verifyCode, requestReset, changePassword]);

  return <PortalAuthContext.Provider value={value}>{children}</PortalAuthContext.Provider>;
};

export { CLIENT_AUTH_ENABLED };
