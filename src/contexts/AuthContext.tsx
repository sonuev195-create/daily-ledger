import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

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
  logout: () => void;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => ({ success: false }),
  logout: () => {},
  isAdmin: false,
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check stored session
    const stored = localStorage.getItem('app_user');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Validate against DB
        supabase
          .from('app_users')
          .select('id, username, role, display_name')
          .eq('id', parsed.id)
          .eq('is_active', true)
          .single()
          .then(({ data }) => {
            if (data) {
              setUser(data as AppUser);
            } else {
              localStorage.removeItem('app_user');
            }
            setLoading(false);
          });
      } catch {
        localStorage.removeItem('app_user');
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (username: string, password: string) => {
    const { data, error } = await supabase
      .from('app_users')
      .select('id, username, role, display_name')
      .eq('username', username)
      .eq('password', password)
      .eq('is_active', true)
      .single();

    if (error || !data) {
      return { success: false, error: 'Invalid username or password' };
    }

    const appUser = data as AppUser;
    setUser(appUser);
    localStorage.setItem('app_user', JSON.stringify(appUser));
    return { success: true };
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('app_user');
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAdmin: user?.role === 'admin' }}>
      {children}
    </AuthContext.Provider>
  );
}
