import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { User, UserRole } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { logActivity } from '../utils/activityLogger';

interface AddUserResult {
  success: boolean;
  error?: string;
  requiresEmailConfirmation?: boolean;
}

interface AuthContextType {
  currentUser: User | null;
  users: User[];
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  addUser: (userData: Omit<User, 'id' | 'createdAt'>) => Promise<AddUserResult>;
  updateUser: (id: string, userData: Partial<User>) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  getUserById: (id: string) => User | undefined;
  getUsersByDepartment: (department: string) => User[];
  getUsersByRole: (role: UserRole) => User[];
  isAuthenticated: boolean;
  isAdmin: boolean;
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
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('*')
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
      if (!useSupabase) {
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

        setLoading(false);
        return;
      }

      try {
        // Check for existing Supabase session
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          // Fetch user profile from database
          const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

          if (profile && !error) {
            setCurrentUser(mapProfileToUser(profile, session.user));
          }
        }

        // Load all users (for admin features)
        await loadUsers();

        // Set up auth state listener
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          async (event: any, session: any) => {
            if (event === 'SIGNED_IN' && session?.user) {
              const { data: profile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', session.user.id)
                .single();

              if (profile) {
                setCurrentUser(mapProfileToUser(profile, session.user));
              }
            } else if (event === 'SIGNED_OUT') {
              setCurrentUser(null);
            }
          }
        );

        setLoading(false);

        return () => {
          subscription.unsubscribe();
        };
      } catch (error) {
        console.error('Error initializing auth:', error);
        setLoading(false);
      }
    };

    initializeAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useSupabase]);

  // Subscribe to real-time profile changes
  useEffect(() => {
    if (!useSupabase) return;

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
  }, [useSupabase, loadUsers]);

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
        return false;
      }

      if (data.user) {
        // First try to fetch profile by user ID
        let { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', data.user.id)
          .single();

        // If no profile found by ID, try by email (for migrated users)
        if (!profile || profileError) {
          console.log('Profile not found by ID, trying by email...');
          const { data: profileByEmail, error: emailError } = await supabase
            .from('profiles')
            .select('*')
            .eq('email', data.user.email)
            .single();

          if (profileByEmail && !emailError) {
            // Update the profile to use the correct auth user ID
            const { error: updateError } = await supabase
              .from('profiles')
              .update({ id: data.user.id })
              .eq('email', data.user.email);

            if (!updateError) {
              profile = { ...profileByEmail, id: data.user.id };
              profileError = null;
            }
          }
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
      return { success: true };
    }

    try {
      // Create auth user in Supabase
      const { data, error: authError } = await supabase.auth.signUp({
        email: userData.email,
        password: userData.password,
        options: {
          data: {
            first_name: userData.firstName,
            last_name: userData.lastName,
            role: userData.role,
            department: userData.department,
          },
          emailRedirectTo: window.location.origin,
        },
      });

      if (authError) {
        console.error('Error creating auth user:', authError);
        return { success: false, error: authError.message };
      }

      // If user already exists (identities empty in some Supabase configs), handle gracefully
      if (data.user && data.user.identities && data.user.identities.length === 0) {
        return { success: false, error: 'A user with this email already exists' };
      }

      // Check if email confirmation is required (no session means confirmation is needed)
      const requiresEmailConfirmation = !data.session;

      if (data.user) {
        // Wait a moment for the trigger to execute
        await new Promise(resolve => setTimeout(resolve, 500));

        // Check if profile was created by the trigger
        const { data: existingProfile, error: checkError } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', data.user.id)
          .single();

        // If profile doesn't exist, create it manually
        if (!existingProfile || checkError) {
          console.log('Profile not created by trigger, creating manually...');

          const { error: profileError } = await supabase
            .from('profiles')
            .insert({
              id: data.user.id,
              email: userData.email,
              first_name: userData.firstName,
              last_name: userData.lastName,
              role: userData.role,
              department: userData.department,
              is_active: true,
              invited_by: currentUser?.id || null,
              notification_preferences: userData.notificationPreferences || {
                pushEnabled: true,
                emailEnabled: true,
                calendarSyncEnabled: false,
                taskReminders: true,
                overdueAlerts: true,
              },
            });

          if (profileError) {
            console.error('Error creating profile manually:', profileError);
            // The auth user was created but profile failed
            // This is not ideal but we can try to continue
            console.warn('Profile creation failed. User may need admin intervention.');
          }
        }
      }

      // Reload users to get the latest list
      await loadUsers();

      return {
        success: true,
        requiresEmailConfirmation
      };
    } catch (error: any) {
      console.error('Error adding user:', error);
      return { success: false, error: error.message || 'Failed to create user' };
    }
  };

  const updateUser = async (id: string, userData: Partial<User>) => {
    if (!useSupabase) {
      // Fallback to localStorage mode
      const updatedUsers = users.map((user) => (user.id === id ? { ...user, ...userData } : user));
      setUsers(updatedUsers);
      localStorage.setItem('mediamaple_users', JSON.stringify(updatedUsers));

      // Update current user if it's the one being updated
      if (currentUser?.id === id) {
        setCurrentUser({ ...currentUser, ...userData });
      }
      return;
    }

    try {
      // Update profile in database
      const updateData: any = {};
      if (userData.firstName) updateData.first_name = userData.firstName;
      if (userData.lastName) updateData.last_name = userData.lastName;
      if (userData.role) updateData.role = userData.role;
      if (userData.department) updateData.department = userData.department;
      if (userData.isActive !== undefined) updateData.is_active = userData.isActive;
      if (userData.avatar !== undefined) updateData.avatar_url = userData.avatar;
      if (userData.notificationPreferences) {
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
    if (!useSupabase) {
      // Fallback to localStorage mode
      const updatedUsers = users.filter((user) => user.id !== id);
      setUsers(updatedUsers);
      localStorage.setItem('mediamaple_users', JSON.stringify(updatedUsers));
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

      // Update local state
      setUsers(users.filter((user) => user.id !== id));
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
        return { success: false, error: 'Current password is incorrect' };
      }

      // Now update to the new password
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        console.error('Error changing password:', error);
        return { success: false, error: error.message };
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

  const value: AuthContextType = {
    currentUser,
    users,
    login,
    logout,
    addUser,
    updateUser,
    deleteUser,
    changePassword,
    getUserById,
    getUsersByDepartment,
    getUsersByRole,
    isAuthenticated: currentUser !== null,
    isAdmin: currentUser?.role === 'admin',
    loading,
    sessionExpiryWarning,
    extendSession,
    dismissSessionWarning,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
