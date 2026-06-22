import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function Login() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const checkSetup = async () => {
      try {
        const res = await api.get('/setup/status') as { needsSetup: boolean };
        if (res && res.needsSetup) {
          navigate('/setup');
        }
      } catch (err) {
        console.error('Failed to check setup status:', err);
      }
    };
    void checkSetup();
  }, [navigate]);

  const handleLogin = async () => {
    try {
      setError('');
      const res = await api.post('/auth/login', { password });
      localStorage.setItem('user', JSON.stringify(res.user));
      localStorage.setItem('auth_token', res.token);
      navigate('/');
    } catch {
      setError('Invalid password or server error.');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void handleLogin();
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="w-full max-w-md p-8 space-y-6 bg-card rounded-xl shadow-lg border border-border">
        <div className="flex flex-col items-center">
          <img src="/logo.png" alt="NudgeBot" className="w-20 h-20 mb-4" />
          <h1 className="text-2xl font-bold text-foreground">Sign in to NudgeBot</h1>
        </div>

        {error && <div className="text-destructive text-sm text-center">{error}</div>}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Password</label>
            <Input
              type="password"
              placeholder="Enter admin password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button className="w-full mt-4" type="submit">
            Sign In
          </Button>
        </form>
      </div>
    </div>
  );
}
