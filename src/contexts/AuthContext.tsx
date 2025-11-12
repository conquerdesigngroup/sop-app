import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { User, UserRole } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { User as SupabaseUser } from '@supabase/supabase-js';

interface AuthContextType {
  currentUser: User | null;
  users: User[];
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  addUser: (userData: Omit<User, 'id' | 'createdAt'>) => void;
  updateUser: (id: string, userData: Partial<User>) => void;
  deleteUser: (id: string) => void;
  getUserById: (id: string) => User | undefined;
  getUsersByDepartment: (department: string) => User[];
  getUsersByRole: (role: UserRole) => User[];
  isAuthenticated: boolean;
  isAdmin: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Default admin user for initial setup
const defaultAdmin: User = {
  id: 'user_admin_default',
  email: 'admin@mediamaple.com',
  password: 'admin123', // In production, this should be hashed
  firstName: 'Admin',
  lastName: 'User',
  role: 'admin',
  department: 'Admin',
  createdAt: new Date().toISOString(),
  isActive: true,
  notificationPreferences: {
    pushEnabled: true,
    emailEnabled: true,
    calendarSyncEnabled: false,
    taskReminders: true,
    overdueAlerts: true,
  },
};

// Sample team members for testing
const defaultTeamMembers: User[] = [
  {
    id: 'user_team_1',
    email: 'john@mediamaple.com',
    password: 'team123',
    firstName: 'John',
    lastName: 'Smith',
    role: 'team',
    department: 'Teachers',
    createdAt: new Date().toISOString(),
    isActive: true,
    invitedBy: 'user_admin_default',
    notificationPreferences: {
      pushEnabled: false,
      emailEnabled: true,
      calendarSyncEnabled: false,
      taskReminders: true,
      overdueAlerts: true,
    },
  },
  {
    id: 'user_team_2',
    email: 'sarah@mediamaple.com',
    password: 'team123',
    firstName: 'Sarah',
    lastName: 'Johnson',
    role: 'team',
    department: 'Admin',
    createdAt: new Date().toISOString(),
    isActive: true,
    invitedBy: 'user_admin_default',
    notificationPreferences: {
      pushEnabled: true,
      emailEnabled: true,
      calendarSyncEnabled: false,
      taskReminders: true,
      overdueAlerts: true,
    },
  },
];

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

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const useSupabase = isSupabaseConfigured();

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
        // Fallback to localStorage mode
        const storedUsers = localStorage.getItem('mediamaple_users');
        const storedCurrentUser = localStorage.getItem('mediamaple_current_user');

        if (storedUsers) {
          const parsedUsers = JSON.parse(storedUsers);
          setUsers(parsedUsers);
        } else {
          // Initialize with default users
          const initialUsers = [defaultAdmin, ...defaultTeamMembers];
          setUsers(initialUsers);
          localStorage.setItem('mediamaple_users', JSON.stringify(initialUsers));
        }

        if (storedCurrentUser) {
          setCurrentUser(JSON.parse(storedCurrentUser));
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
        // Fetch user profile
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', data.user.id)
          .single();

        if (profile && !profileError && profile.is_active) {
          setCurrentUser(mapProfileToUser(profile, data.user));
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  };

  const logout = async () => {
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

  const addUser = async (userData: Omit<User, 'id' | 'createdAt'>) => {
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
      return;
    }

    try {
      // Create auth user in Supabase
      const { error: authError } = await supabase.auth.signUp({
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
        throw authError;
      }

      // Profile will be auto-created by database trigger
      // Reload users to get the new one
      await loadUsers();
    } catch (error) {
      console.error('Error adding user:', error);
      throw error;
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

      const { error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', id);

      if (error) {
        console.error('Error updating user:', error);
        throw error;
      }

      // Update local state
      const updatedUsers = users.map((user) => (user.id === id ? { ...user, ...userData } : user));
      setUsers(updatedUsers);

      // Update current user if it's the one being updated
      if (currentUser?.id === id) {
        setCurrentUser({ ...currentUser, ...userData });
      }
    } catch (error) {
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

  const value: AuthContextType = {
    currentUser,
    users,
    login,
    logout,
    addUser,
    updateUser,
    deleteUser,
    getUserById,
    getUsersByDepartment,
    getUsersByRole,
    isAuthenticated: currentUser !== null,
    isAdmin: currentUser?.role === 'admin',
    loading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
