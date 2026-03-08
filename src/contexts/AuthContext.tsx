import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Session } from '@supabase/supabase-js';

interface AppUser {
  id: string;
  username: string;
  role: 'admin' | 'employee';
  display_name: string | null;
}

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => ({ success: false }),
  logout: async () => {},
  isAdmin: false,
});

export const useAuth = () => useContext(AuthContext);

async function fetchAppUser(userId: string): Promise<AppUser | null> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username, display_name')
    .eq('id', userId)
    .single();

  if (!profile) return null;

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .single();

  return {
    id: profile.id,
    username: profile.username,
    display_name: profile.display_name,
    role: (roleData?.role as 'admin' | 'employee') || 'employee',
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          // Use setTimeout to avoid potential deadlocks with Supabase client
          setTimeout(async () => {
            const appUser = await fetchAppUser(session.user.id);
            setUser(appUser);
            setLoading(false);
          }, 0);
        } else {
          setUser(null);
          setLoading(false);
        }
      }
    );

    // THEN check existing session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const appUser = await fetchAppUser(session.user.id);
        setUser(appUser);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = async (username: string, password: string) => {
    const email = `${username.toLowerCase().replace(/[^a-z0-9_]/g, '')}@cashmanager.local`;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user) {
      return { success: false, error: 'Invalid username or password' };
    }

    const appUser = await fetchAppUser(data.user.id);
    if (!appUser) {
      await supabase.auth.signOut();
      return { success: false, error: 'User profile not found' };
    }

    setUser(appUser);
    return { success: true };
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAdmin: user?.role === 'admin' }}>
      {children}
    </AuthContext.Provider>
  );
}
