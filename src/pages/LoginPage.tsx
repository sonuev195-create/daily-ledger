import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Lock, User, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [needsBootstrap, setNeedsBootstrap] = useState(false);
  const [checkingBootstrap, setCheckingBootstrap] = useState(true);
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    checkBootstrapNeeded();
  }, []);

  const checkBootstrapNeeded = async () => {
    try {
      // Try to query user_roles - if empty or errors, show bootstrap
      const { count, error } = await supabase
        .from('user_roles')
        .select('*', { count: 'exact', head: true });
      // If error (likely RLS blocks anon), or count is 0, need bootstrap
      if (error || count === 0) {
        setNeedsBootstrap(true);
      }
    } catch {
      setNeedsBootstrap(true);
    }
    setCheckingBootstrap(false);
  };

  const handleBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      toast.error('Please enter username and password');
      return;
    }
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-users', {
        body: {
          action: 'bootstrap',
          username: username.trim(),
          password,
          display_name: displayName.trim() || 'Administrator',
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success('Admin account created! Logging in...');
      // Now login with these credentials
      const result = await login(username.trim(), password);
      if (!result.success) {
        toast.error(result.error || 'Login failed after setup');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to create admin account');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      toast.error('Please enter username and password');
      return;
    }
    setLoading(true);
    const result = await login(username.trim(), password);
    setLoading(false);
    if (!result.success) {
      toast.error(result.error || 'Login failed');
    }
  };

  if (checkingBootstrap) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-sm border-border/50 shadow-xl">
        <CardHeader className="text-center space-y-2 pb-2">
          <div className="mx-auto w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mb-2">
            {needsBootstrap ? (
              <ShieldCheck className="h-7 w-7 text-primary" />
            ) : (
              <Lock className="h-7 w-7 text-primary" />
            )}
          </div>
          <CardTitle className="text-xl font-bold">
            {needsBootstrap ? 'Initial Setup' : 'Cash Manager'}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {needsBootstrap
              ? 'Create your admin account to get started'
              : 'Sign in to continue'}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={needsBootstrap ? handleBootstrap : handleLogin} className="space-y-4">
            {needsBootstrap && (
              <div className="space-y-2">
                <Label htmlFor="displayName">Display Name</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Administrator"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="username">User ID</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your user ID"
                  className="pl-10"
                  autoComplete="username"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={needsBootstrap ? 'Min 6 characters' : 'Enter password'}
                  className="pl-10 pr-10"
                  autoComplete={needsBootstrap ? 'new-password' : 'current-password'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading
                ? needsBootstrap ? 'Creating...' : 'Signing in...'
                : needsBootstrap ? 'Create Admin & Sign In' : 'Sign In'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
