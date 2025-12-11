import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  userRole: string | null;
  userName: string | null;
  firmId: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshUserData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [firmId, setFirmId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session with better error handling
    const initializeAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Session error:', error);
          setLoading(false);
          return;
        }

        setUser(session?.user ?? null);
        if (session?.user) {
          await fetchUserData(session.user.id);
        } else {
          // Try to restore from localStorage if no session
          const storedRole = localStorage.getItem('userRole');
          const storedName = localStorage.getItem('userName');
          const storedFirmId = localStorage.getItem('firmId');
          
          if (storedRole && storedName) {
            setUserRole(storedRole);
            setUserName(storedName);
            setFirmId(storedFirmId);
          }
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      // console.log('Auth state changed:', event, session?.user?.id);
      
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchUserData(session.user.id);
      } else {
        // Clear user data on sign out
        setUserRole(null);
        setUserName(null);
        setFirmId(null);
        localStorage.clear();
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserData = async (userId: string) => {
    try {
      // First try to get the current user's email from auth
      const { data: { user: authUser } } = await supabase.auth.getUser();
      
      if (!authUser?.email) {
        console.error('No authenticated user email found');
        return;
      }

      // Search by email instead of ID to handle ID mismatches
      const { data: userData, error } = await supabase
        .from('users')
        .select('role, full_name, firm_id, is_active, id')
        .eq('email', authUser.email)
        .maybeSingle(); // Use maybeSingle() instead of single() to handle 0 rows gracefully

      if (error) {
        console.error('Error fetching user data:', error);
        return;
      }

      // Handle case where no user data is found
      if (!userData) {
        // console.log('No user data found in database for email:', authUser.email);
        return;
      }

      if (!userData.is_active) {
        // console.log('User account is inactive');
        return;
      }

      setUserRole(userData.role);
      setUserName(userData.full_name);
      setFirmId(userData.firm_id);

      // Store in localStorage
      localStorage.setItem('userRole', userData.role);
      localStorage.setItem('userName', userData.full_name);
      localStorage.setItem('firmId', userData.firm_id || '');
      localStorage.setItem('userId', userId);
    } catch (error) {
      console.error('Error in fetchUserData:', error);
    }
  };

  const refreshUserData = async () => {
    if (user) {
      await fetchUserData(user.id);
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setUserRole(null);
      setUserName(null);
      setFirmId(null);
      localStorage.clear();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const value = {
    user,
    userRole,
    userName,
    firmId,
    loading,
    signOut,
    refreshUserData,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
