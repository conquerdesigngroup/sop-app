import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { User, UserRole } from '../types';
import { isManagementRole, isSuperAdminRole } from '../lib/roles';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { logActivity } from '../utils/activityLogger';
import { logActivity as logViaRpc } from '../lib/activityLog';
import { reportSignInFailure, reportResetRequested } from '../lib/clientAuth';
import { useRefreshable } from './RefreshContext';

interface AddUserResult {
  success: boolean;
  error?: string;
  requiresEmailConfirmation?: boolean;
}

interface AuthContextType {
  currentUser: User | null;
  users: User[];
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  addUser: (userData: Omit<User, 'id' | 'createdAt'>) => Promise<AddUserResult>;
  updateUser: (id: string, userData: Partial<User>) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  /** Admin-only: set someone else's password. Enforced server-side. */
  adminResetPassword: (userId: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  /** Send a reset email to a signed-out user. Always reports success — see impl. */
  requestPasswordReset: (email: string) => Promise<{ success: boolean; error?: string }>;
  getUserById: (id: string) => User | undefined;
  getUsersByDepartment: (department: string) => User[];
  getUsersByRole: (role: UserRole) => User[];
  /**
   * "View as": the person the UI is currently pretending to be, or null.
   *
   * While set, `currentUser`, `isAdmin` and `isSuperAdmin` describe THAT
   * person, so every page renders what they would see. The session, the
   * Supabase client and RLS are untouched — writes still happen as the real
   * signed-in admin, which is why the banner says so. Session-only: a reload
   * ends it.
   */
  viewingAs: User | null;
  /** Start viewing as someone. Ignored unless the real user is management. */
  viewAs: (userId: string) => void;
  exitViewAs: () => void;
  isAuthenticated: boolean;
  /** Management or above — admin AND super_admin. Mirrors is_admin(). */
  isAdmin: boolean;
  /** The narrow tier: pay, hours and logins. Mirrors is_super_admin(). */
  isSuperAdmin: boolean;
  loading: boolean;
  sessionExpiryWarning: boolean;
  extendSession: () => void;
  dismissSessionWarning: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Note: Default users removed - app now requires Supabase for user management
// If running in localStorage mode (no Supabase), users must be created through the UI

interface AuthProviderProps {
  children: ReactNode;
}

// Helper function to convert Supabase profile to User type
const mapProfileToUser = (profile: any, authUser?: SupabaseUser): User => {
  return {
    id: profile.id,
    email: profile.email,
    password: '', // Password not stored in frontend
    firstName: profile.first_name,
    lastName: profile.last_name,
    role: profile.role as UserRole,
    department: profile.department,
    createdAt: profile.created_at,
    isActive: profile.is_active,
    invitedBy: profile.invited_by,
    avatar: profile.avatar_url,
    notificationPreferences: profile.notification_preferences || {
      pushEnabled: true,
      emailEnabled: true,
      calendarSyncEnabled: false,
      taskReminders: true,
      overdueAlerts: true,
    },
  };
};

// Session timeout settings (in milliseconds)
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const WARNING_BEFORE_TIMEOUT = 5 * 60 * 1000; // Show warning 5 minutes before timeout

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [viewingAs, setViewingAs] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionExpiryWarning, setSessionExpiryWarning] = useState(false);
  const useSupabase = isSupabaseConfigured();

  const sessionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const warningTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  // Load all users from database
  const loadUsers = useCallback(async () => {
    if (!useSupabase) return;

    try {
      // Staff directory only. Client (parent) profiles are visible to staff
      // under RLS, but they are not team members — listing them here would put
      // every parent in Team Management and the assignment pickers. They are
      // managed in Client Accounts (/portal-admin/clients).
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('*')
        .neq('role', 'client')
        .order('created_at', { ascending: false });

      if (profiles && !error) {
        const mappedUsers = profiles.map((p: any) => mapProfileToUser(p));
        setUsers(mappedUsers);
      }
    } catch (error) {
      console.error('Error loading users:', error);
    }
  }, [useSupabase]);

  // Initialize: Check for existing session and load users
  useEffect(() => {
    const initializeAuth = async () => {
      console.log('[Auth] Starting initialization, useSupabase:', useSupabase);

      if (!useSupabase) {
        console.log('[Auth] Using localStorage mode');
        // localStorage mode - this is a fallback/demo mode only
        // Clear any old default user data that might be cached
        const storedUsers = localStorage.getItem('mediamaple_users');
        const storedCurrentUser = localStorage.getItem('mediamaple_current_user');

        if (storedUsers) {
          const parsedUsers = JSON.parse(storedUsers);
          // Filter out old default test users that may have been cached
          const cleanedUsers = parsedUsers.filter((u: User) =>
            !u.id.startsWith('user_admin_default') &&
            !u.id.startsWith('user_team_')
          );
          setUsers(cleanedUsers);
          if (cleanedUsers.length !== parsedUsers.length) {
            localStorage.setItem('mediamaple_users', JSON.stringify(cleanedUsers));
          }
        } else {
          // No users - start with empty array
          setUsers([]);
        }

        if (storedCurrentUser) {
          const parsedUser = JSON.parse(storedCurrentUser);
          // Don't restore if it was a default test user
          if (!parsedUser.id.startsWith('user_admin_default') && !parsedUser.id.startsWith('user_team_')) {
            setCurrentUser(parsedUser);
          } else {
            localStorage.removeItem('mediamaple_current_user');
          }
        }

        console.log('[Auth] localStorage mode - setting loading to false');
        setLoading(false);
        return;
      }

      try {
        console.log('[Auth] Checking Supabase session...');
        // Check for existing Supabase session with shorter timeout (5 seconds)
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise<{ data: { session: null } }>((resolve) =>
          setTimeout(() => {
            console.log('[Auth] Session check timed out - continuing without session');
            resolve({ data: { session: null } });
          }, 5000)
        );

        const result = await Promise.race([sessionPromise, timeoutPromise]);
        const session = result?.data?.session;
        console.log('[Auth] Session check complete, has session:', !!session);

        if (session?.user) {
          // Fetch user profile from database
          const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

          // A client (parent) session belongs to the portal, not the staff
          // app. Leaving currentUser null keeps isAuthenticated false, which
          // is what gates the staff chrome, every ProtectedRoute and — because
          // the data contexts key off it — the staff table fetches and
          // realtime channels a client's RLS would return nothing for. The
          // session itself stays valid; PortalAuthContext is what reads it.
          if (profile && !error && profile.role !== 'client') {
            setCurrentUser(mapProfileToUser(profile, session.user));

            // Load all users (for admin features).
            //
            // Deliberately inside the session branch. This used to run
            // unconditionally, so every logged-out visitor's browser pulled the
            // entire staff directory — and the profiles SELECT policy was
            // USING (true) with no TO clause, so the `anon` role actually got the
            // rows. Migration v8 closes that at the database; this stops the app
            // asking for something it cannot use. Login is unaffected: the
            // SIGNED_IN handler below calls loadUsers() again once there is a
            // session, and signInWithPassword completes before any profile read.
            console.log('[Auth] Loading users...');
            await loadUsers();
            console.log('[Auth] Users loaded');
          }
        }

        console.log('[Auth] Initialization complete - setting loading to false');
        setLoading(false);
      } catch (error) {
        console.error('[Auth] Error initializing auth:', error);
        console.log('[Auth] Error occurred - setting loading to false');
        setLoading(false);
      }
    };

    initializeAuth();

    // Auth state listener — registered in the effect body (not inside the async
    // init function) so the unsubscribe cleanup actually runs on unmount.
    // TOKEN_REFRESHED/USER_UPDATED keep the profile in sync after refreshes.
    //
    // IMPORTANT: the callback runs while supabase-js holds the per-origin
    // `lock:sop-app-auth` web lock. Awaiting any supabase call here (which
    // itself waits on that lock) deadlocks the whole origin — every tab of
    // the app hangs on a spinner. Dispatch async work via setTimeout so it
    // runs after the lock is released.
    let subscription: { unsubscribe: () => void } | null = null;
    if (useSupabase) {
      const { data } = supabase.auth.onAuthStateChange(
        (event: any, session: any) => {
          if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') && session?.user) {
            setTimeout(async () => {
              const { data: profile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', session.user.id)
                .single();

              // Same rule as initializeAuth: a client session never becomes
              // the staff currentUser. Without this, a parent signing in on
              // the portal would flip isAuthenticated and grow staff chrome.
              if (profile && profile.role !== 'client') {
                setCurrentUser(mapProfileToUser(profile, session.user));
              }
            }, 0);
          } else if (event === 'SIGNED_OUT') {
            setCurrentUser(null);
          }
        }
      );
      subscription = data.subscription;
    }

    return () => {
      subscription?.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useSupabase]);

  // Subscribe to real-time profile changes
  useEffect(() => {
    if (!useSupabase) return;
    // No session, nothing to subscribe to. Realtime delivers rows through
    // RLS, so a signed-out device — a parent on /portal, anyone on the login
    // screen — can only ever be sent nothing. What it DOES get is a websocket
    // that fails and then retries on a backoff for as long as the page is
    // open. Same guard as WorkHoursContext, which had this fixed first.
    // Keyed on the id, not the object: setCurrentUser({ ...currentUser })
    // runs on every profile edit and would otherwise tear the channel down and
    // build it again each time.
    if (!currentUser?.id) return;

    const channel = supabase
      .channel('profiles_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
        },
        () => {
          // Reload users when profiles table changes
          loadUsers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [useSupabase, loadUsers, currentUser?.id]);

  // View as. Gated on the REAL user's role, not the effective one — otherwise
  // an admin viewing as a team member could not have started, and a team
  // member could never start at all, which is the point.
  const viewAs = useCallback((userId: string) => {
    if (!isManagementRole(currentUser?.role)) return;
    if (userId === currentUser?.id) { setViewingAs(null); return; }
    const target = users.find(u => u.id === userId);
    if (target) setViewingAs(target);
  }, [currentUser, users]);

  const exitViewAs = useCallback(() => setViewingAs(null), []);

  // Signing out, or the real user changing, ends it.
  useEffect(() => {
    if (!currentUser) setViewingAs(null);
  }, [currentUser]);

  // Part of every app-wide refresh: the header button, pull-to-refresh, and
  // coming back to the foreground. RefreshContext owns the visibility
  // handling that used to sit here.
  useRefreshable(loadUsers, !!useSupabase && currentUser !== null);

  const login = async (email: string, password: string): Promise<boolean> => {
    if (!useSupabase) {
      // Fallback to localStorage mode
      const user = users.find(
        (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password && u.isActive
      );

      if (user) {
        setCurrentUser(user);
        localStorage.setItem('mediamaple_current_user', JSON.stringify(user));

        // Log login activity
        logActivity({
          userId: user.id,
          userEmail: user.email,
          userName: `${user.firstName} ${user.lastName}`,
          action: 'user_login',
          entityType: 'user',
          entityId: user.id,
          entityTitle: `${user.firstName} ${user.lastName}`,
        });

        return true;
      }

      return false;
    }

    try {
      // Supabase authentication
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error('Login error:', error);
        // Fire-and-forget telemetry for the audit log. GoTrue keeps no audit
        // trail on this project, so failed sign-ins are reported app-side.
        // Never awaited: a logging hiccup must not change how login fails.
        reportSignInFailure(email);
        return false;
      }

      if (data.user) {
        // First try to fetch profile by user ID
        let { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', data.user.id)
          .single();

        // If no profile found by ID, fall back to an email lookup (for migrated
        // users). Note: we intentionally do NOT rewrite the profile's primary key
        // here — the id column is an FK to auth.users and referenced by other
        // tables; fixing mismatched ids is a one-time server-side migration.
        if (!profile || profileError) {
          console.log('Profile not found by ID, trying by email...');
          const { data: profileByEmail, error: emailError } = await supabase
            .from('profiles')
            .select('*')
            .eq('email', data.user.email)
            .single();

          if (profileByEmail && !emailError) {
            profile = profileByEmail;
            profileError = null;
          }
        }

        // A client (parent) hitting the STAFF login gets turned away with the
        // session revoked — their door is /portal/login. Without the signOut
        // the password grant would leave a live session behind a login screen
        // that just told them "no".
        if (profile && !profileError && profile.role === 'client') {
          // Awaited, and before the signOut: the log RPC attributes the actor
          // from the JWT, which the signOut is about to destroy.
          await logViaRpc({
            action: 'user_sign_in_failed',
            entityType: 'user',
            entityId: data.user.id,
            entityTitle: email,
            result: 'failure',
            details: { reason: 'client_role_on_staff_login' },
          });
          await supabase.auth.signOut();
          return false;
        }

        if (profile && !profileError && profile.is_active !== false) {
          const loggedInUser = mapProfileToUser(profile, data.user);
          setCurrentUser(loggedInUser);

          // Log login activity
          logActivity({
            userId: loggedInUser.id,
            userEmail: loggedInUser.email,
            userName: `${loggedInUser.firstName} ${loggedInUser.lastName}`,
            action: 'user_login',
            entityType: 'user',
            entityId: loggedInUser.id,
            entityTitle: `${loggedInUser.firstName} ${loggedInUser.lastName}`,
          });

          return true;
        } else {
          console.error('Profile lookup failed:', { profileError, profile, userId: data.user.id });
          void logViaRpc({
            action: 'user_sign_in_failed',
            entityType: 'user',
            entityId: data.user.id,
            entityTitle: email,
            result: 'failure',
            details: { reason: profile ? 'account_deactivated' : 'profile_missing' },
          });
        }
      }

      return false;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  };

  const logout = async () => {
    // Log logout activity before clearing user
    if (currentUser) {
      logActivity({
        userId: currentUser.id,
        userEmail: currentUser.email,
        userName: `${currentUser.firstName} ${currentUser.lastName}`,
        action: 'user_logout',
        entityType: 'user',
        entityId: currentUser.id,
        entityTitle: `${currentUser.firstName} ${currentUser.lastName}`,
      });
    }

    if (!useSupabase) {
      // Fallback to localStorage mode
      setCurrentUser(null);
      localStorage.removeItem('mediamaple_current_user');
      return;
    }

    try {
      await supabase.auth.signOut();
      setCurrentUser(null);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const addUser = async (userData: Omit<User, 'id' | 'createdAt'>): Promise<AddUserResult> => {
    if (!useSupabase) {
      // Fallback to localStorage mode
      const newUser: User = {
        ...userData,
        id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        createdAt: new Date().toISOString(),
      };

      const updatedUsers = [...users, newUser];
      setUsers(updatedUsers);
      localStorage.setItem('mediamaple_users', JSON.stringify(updatedUsers));

      // Log activity
      if (currentUser) {
        logActivity({
          userId: currentUser.id,
          userEmail: currentUser.email,
          userName: `${currentUser.firstName} ${currentUser.lastName}`,
          action: 'user_created',
          entityType: 'user',
          entityId: newUser.id,
          entityTitle: `${userData.firstName} ${userData.lastName}`,
          details: {
            newUserEmail: userData.email,
            newUserRole: userData.role,
            newUserDepartment: userData.department,
          },
        });
      }
      return { success: true };
    }

    try {
      // Goes through the admin-users Edge Function, NOT supabase.auth.signUp().
      //
      // signUp() was wrong here in two ways that both bit us:
      //
      //   1. It issues a session for the NEW user, so the admin doing the
      //      creating was silently signed in as the person they just created.
      //
      //   2. The role was discarded. handle_new_user() hardcodes role='team'
      //      (v6, deliberately), so the trigger always won and every account an
      //      admin made came out a team member. The manual-insert fallback below
      //      it only ran when the trigger had NOT created the profile — which
      //      never happens — so the role was never corrected.
      //
      // Creating a user for someone else needs auth.admin.createUser, which
      // needs the service role key, which can never ship in a CRA bundle.
      const { data, error: fnError } = await supabase.functions.invoke('admin-users', {
        body: {
          action: 'create_user',
          email: userData.email,
          password: userData.password,
          firstName: userData.firstName,
          lastName: userData.lastName,
          role: userData.role,
          department: userData.department,
        },
      });

      // functions.invoke surfaces a non-2xx as an error whose body holds our
      // message; dig it out so the user sees "already exists" rather than
      // "Edge Function returned a non-2xx status code".
      if (fnError) {
        let message = fnError.message || 'Failed to create user';
        try {
          const body = await (fnError as any).context?.json?.();
          if (body?.error) message = body.error;
        } catch {
          /* keep the generic message */
        }
        console.error('Error creating user:', fnError);
        return { success: false, error: message };
      }

      if (data?.error) {
        return { success: false, error: data.error };
      }

      // The function logs the activity itself, as the calling admin.
      await loadUsers();

      // The account is created with email_confirm: true, so there is nothing to
      // confirm — they can sign in immediately with the password given to them.
      return { success: true, requiresEmailConfirmation: false };
    } catch (error: any) {
      console.error('Error adding user:', error);
      return { success: false, error: error.message || 'Failed to create user' };
    }
  };

  /**
   * Set another user's password. Admins only.
   *
   * Distinct from changePassword(), which only ever acts on the signed-in user
   * and requires their current password. There was previously no way for an
   * admin to reset someone else's, which is why it was being done by hand in
   * the Supabase dashboard.
   *
   * Authorisation is enforced inside the Edge Function against the caller's own
   * JWT — isAdmin here only decides whether to show the button.
   */
  const adminResetPassword = async (
    userId: string,
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!useSupabase) {
      return { success: false, error: 'Password reset requires Supabase' };
    }

    try {
      const { data, error: fnError } = await supabase.functions.invoke('admin-users', {
        body: { action: 'set_password', userId, password: newPassword },
      });

      if (fnError) {
        let message = fnError.message || 'Failed to reset password';
        try {
          const body = await (fnError as any).context?.json?.();
          if (body?.error) message = body.error;
        } catch {
          /* keep the generic message */
        }
        return { success: false, error: message };
      }

      if (data?.error) return { success: false, error: data.error };
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to reset password' };
    }
  };

  /**
   * Send a password-reset email to someone who is locked out.
   *
   * The explicit `redirectTo` is the point of this function. Supabase builds
   * recovery links from the project's Site URL unless the caller overrides it,
   * and a wrong Site URL is what sent our reset emails to a different app
   * entirely. Passing redirectTo pins the link to whatever origin the request
   * came from, so this flow is correct regardless of that project setting.
   *
   * The origin must still be on the Auth → URL Configuration → Redirect URLs
   * allow-list, or Supabase falls back to the Site URL and the problem returns.
   *
   * Always reports success, even for an unknown address: telling a stranger
   * whether an email is registered is a free user-enumeration oracle.
   */
  const requestPasswordReset = async (
    email: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!useSupabase) {
      return { success: false, error: 'Password reset requires Supabase' };
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      // Rate limiting is worth surfacing — it is actionable ("wait a minute"),
      // unlike "no such user", which is not ours to disclose.
      if (error && /rate|limit|too many/i.test(error.message)) {
        return { success: false, error: 'Too many attempts. Please wait a minute and try again.' };
      }

      if (error) console.error('Password reset request failed:', error);
      // Logged whether or not the address exists. The visitor is anon here and
      // v29 revokes log_activity from anon, so the server writes the row —
      // same reporter the portal's requestReset uses.
      reportResetRequested(email.trim());
      return { success: true };
    } catch (error: any) {
      console.error('Password reset request failed:', error);
      return { success: true };
    }
  };

  const updateUser = async (id: string, userData: Partial<User>) => {
    const existingUser = users.find(u => u.id === id);

    // Determine if this is a role change
    const isRoleChange = userData.role && existingUser && userData.role !== existingUser.role;

    if (!useSupabase) {
      // Fallback to localStorage mode
      const updatedUsers = users.map((user) => (user.id === id ? { ...user, ...userData } : user));
      setUsers(updatedUsers);
      localStorage.setItem('mediamaple_users', JSON.stringify(updatedUsers));

      // Log activity
      if (currentUser && existingUser) {
        logActivity({
          userId: currentUser.id,
          userEmail: currentUser.email,
          userName: `${currentUser.firstName} ${currentUser.lastName}`,
          action: isRoleChange ? 'user_role_changed' : 'user_updated',
          entityType: 'user',
          entityId: id,
          entityTitle: `${existingUser.firstName} ${existingUser.lastName}`,
          details: {
            changedFields: Object.keys(userData),
            previousRole: existingUser.role,
            newRole: userData.role || existingUser.role,
          },
        });
      }

      // Update current user if it's the one being updated
      if (currentUser?.id === id) {
        setCurrentUser({ ...currentUser, ...userData });
      }
      return;
    }

    try {
      // Update profile in database
      const updateData: any = {};
      if (userData.firstName !== undefined) updateData.first_name = userData.firstName;
      if (userData.lastName !== undefined) updateData.last_name = userData.lastName;
      if (userData.role !== undefined) updateData.role = userData.role;
      if (userData.department !== undefined) updateData.department = userData.department;
      if (userData.isActive !== undefined) updateData.is_active = userData.isActive;
      if (userData.avatar !== undefined) updateData.avatar_url = userData.avatar;
      if (userData.notificationPreferences !== undefined) {
        updateData.notification_preferences = userData.notificationPreferences;
      }

      console.log('Updating user in Supabase:', { id, updateData });

      const { data, error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', id)
        .select();

      if (error) {
        console.error('Error updating user in Supabase:', error);
        throw new Error(error.message || 'Failed to update user in database');
      }

      console.log('Supabase update response:', data);

      // Verify the update was applied by checking returned data
      if (!data || data.length === 0) {
        console.warn('No rows were updated - this may indicate an RLS policy issue');
        // Reload users from database to get actual state
        await loadUsers();
        throw new Error('Update may not have been saved. Please check your permissions.');
      }

      // Log activity
      if (currentUser && existingUser) {
        logActivity({
          userId: currentUser.id,
          userEmail: currentUser.email,
          userName: `${currentUser.firstName} ${currentUser.lastName}`,
          action: isRoleChange ? 'user_role_changed' : 'user_updated',
          entityType: 'user',
          entityId: id,
          entityTitle: `${existingUser.firstName} ${existingUser.lastName}`,
          details: {
            changedFields: Object.keys(userData),
            previousRole: existingUser.role,
            newRole: userData.role || existingUser.role,
          },
        });
      }

      // Update local state with the data returned from Supabase
      const updatedUserFromDB = data[0];
      const mappedUser = mapProfileToUser(updatedUserFromDB);

      const updatedUsers = users.map((user) => (user.id === id ? mappedUser : user));
      setUsers(updatedUsers);

      // Update current user if it's the one being updated
      if (currentUser?.id === id) {
        setCurrentUser(mappedUser);
      }
    } catch (error: any) {
      console.error('Error updating user:', error);
      throw error;
    }
  };

  const deleteUser = async (id: string) => {
    const userToDelete = users.find(u => u.id === id);

    if (!useSupabase) {
      // Fallback to localStorage mode
      const updatedUsers = users.filter((user) => user.id !== id);
      setUsers(updatedUsers);
      localStorage.setItem('mediamaple_users', JSON.stringify(updatedUsers));

      // Log activity
      if (currentUser && userToDelete) {
        logActivity({
          userId: currentUser.id,
          userEmail: currentUser.email,
          userName: `${currentUser.firstName} ${currentUser.lastName}`,
          action: 'user_deleted',
          entityType: 'user',
          entityId: id,
          entityTitle: `${userToDelete.firstName} ${userToDelete.lastName}`,
          details: {
            deletedUserEmail: userToDelete.email,
            deletedUserRole: userToDelete.role,
          },
        });
      }
      return;
    }

    try {
      // In Supabase, we typically deactivate users rather than deleting them
      // But if you want to delete, you need to delete from auth.users (requires service role)
      // For now, we'll just mark as inactive
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: false })
        .eq('id', id);

      if (error) {
        console.error('Error deactivating user:', error);
        throw error;
      }

      // Log activity
      if (currentUser && userToDelete) {
        logActivity({
          userId: currentUser.id,
          userEmail: currentUser.email,
          userName: `${currentUser.firstName} ${currentUser.lastName}`,
          action: 'user_deleted',
          entityType: 'user',
          entityId: id,
          entityTitle: `${userToDelete.firstName} ${userToDelete.lastName}`,
          details: {
            deletedUserEmail: userToDelete.email,
            deletedUserRole: userToDelete.role,
            deactivated: true,
          },
        });
      }

      // Update local state
      setUsers(prev => prev.filter((user) => user.id !== id));
    } catch (error) {
      console.error('Error deleting user:', error);
      throw error;
    }
  };

  const getUserById = (id: string): User | undefined => {
    return users.find((user) => user.id === id);
  };

  const getUsersByDepartment = (department: string): User[] => {
    return users.filter((user) => user.department === department && user.isActive);
  };

  const getUsersByRole = (role: UserRole): User[] => {
    return users.filter((user) => user.role === role && user.isActive);
  };

  const changePassword = async (currentPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> => {
    if (!useSupabase) {
      // In localStorage mode, verify current password and update
      if (currentUser) {
        // Verify current password
        if (currentUser.password !== currentPassword) {
          return { success: false, error: 'Current password is incorrect' };
        }

        const updatedUsers = users.map((user) =>
          user.id === currentUser.id ? { ...user, password: newPassword } : user
        );
        setUsers(updatedUsers);
        localStorage.setItem('mediamaple_users', JSON.stringify(updatedUsers));
        setCurrentUser({ ...currentUser, password: newPassword });

        // Log activity
        logActivity({
          userId: currentUser.id,
          userEmail: currentUser.email,
          userName: `${currentUser.firstName} ${currentUser.lastName}`,
          action: 'user_password_changed',
          entityType: 'user',
          entityId: currentUser.id,
          entityTitle: `${currentUser.firstName} ${currentUser.lastName}`,
        });

        return { success: true };
      }
      return { success: false, error: 'No user logged in' };
    }

    try {
      // First, verify current password by attempting to sign in
      const { data: { user }, error: signInError } = await supabase.auth.signInWithPassword({
        email: currentUser?.email || '',
        password: currentPassword,
      });

      if (signInError || !user) {
        console.error('Current password verification failed:', signInError);
        void logViaRpc({
          action: 'user_password_changed',
          entityType: 'user',
          entityId: currentUser?.id,
          entityTitle: currentUser?.email,
          result: 'failure',
          details: { reason: 'wrong_current_password' },
        });
        return { success: false, error: 'Current password is incorrect' };
      }

      // Now update to the new password
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        console.error('Error changing password:', error);
        void logViaRpc({
          action: 'user_password_changed',
          entityType: 'user',
          entityId: currentUser?.id,
          entityTitle: currentUser?.email,
          result: 'failure',
          details: { reason: 'update_rejected' },
        });
        return { success: false, error: error.message };
      }

      // Log activity
      if (currentUser) {
        logActivity({
          userId: currentUser.id,
          userEmail: currentUser.email,
          userName: `${currentUser.firstName} ${currentUser.lastName}`,
          action: 'user_password_changed',
          entityType: 'user',
          entityId: currentUser.id,
          entityTitle: `${currentUser.firstName} ${currentUser.lastName}`,
        });
      }

      return { success: true };
    } catch (error: any) {
      console.error('Error changing password:', error);
      return { success: false, error: error.message || 'Failed to change password' };
    }
  };

  // Session management functions
  const clearSessionTimers = useCallback(() => {
    if (sessionTimeoutRef.current) {
      clearTimeout(sessionTimeoutRef.current);
      sessionTimeoutRef.current = null;
    }
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
      warningTimeoutRef.current = null;
    }
  }, []);

  const resetSessionTimers = useCallback(() => {
    if (!currentUser) return;

    clearSessionTimers();
    setSessionExpiryWarning(false);
    lastActivityRef.current = Date.now();

    // Set warning timer
    warningTimeoutRef.current = setTimeout(() => {
      setSessionExpiryWarning(true);
    }, SESSION_TIMEOUT - WARNING_BEFORE_TIMEOUT);

    // Set logout timer
    sessionTimeoutRef.current = setTimeout(() => {
      logout();
    }, SESSION_TIMEOUT);
  }, [currentUser, clearSessionTimers]);

  const extendSession = useCallback(() => {
    resetSessionTimers();
  }, [resetSessionTimers]);

  const dismissSessionWarning = useCallback(() => {
    setSessionExpiryWarning(false);
  }, []);

  // Track user activity to reset session timer
  useEffect(() => {
    if (!currentUser) {
      clearSessionTimers();
      return;
    }

    const handleActivity = () => {
      // Only reset if not showing warning (user must explicitly extend session)
      if (!sessionExpiryWarning) {
        resetSessionTimers();
      }
    };

    // Events that indicate user activity
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach(event => {
      window.addEventListener(event, handleActivity);
    });

    // Initialize session timers
    resetSessionTimers();

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
      clearSessionTimers();
    };
  }, [currentUser, sessionExpiryWarning, resetSessionTimers, clearSessionTimers]);

  // The effective user is the one being viewed as, when there is one. Only
  // the value handed to consumers is swapped: everything above (session
  // timers, the users subscription, login/logout) keeps using the real one.
  const effectiveUser = viewingAs ?? currentUser;

  const value: AuthContextType = {
    currentUser: effectiveUser,
    users,
    login,
    logout,
    addUser,
    updateUser,
    deleteUser,
    changePassword,
    adminResetPassword,
    requestPasswordReset,
    getUserById,
    getUsersByDepartment,
    getUsersByRole,
    viewingAs,
    viewAs,
    exitViewAs,
    isAuthenticated: currentUser !== null,
    // Deliberately NOT `role === 'admin'`. Once super_admin exists that test
    // is false for the most privileged accounts in the system, which would
    // drop them into a team member's UI.
    isAdmin: isManagementRole(effectiveUser?.role),
    isSuperAdmin: isSuperAdminRole(effectiveUser?.role),
    loading,
    sessionExpiryWarning,
    extendSession,
    dismissSessionWarning,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
