import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Brain } from 'lucide-react';

export default function Login() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async () => {
    try {
      setError('');
      const res = await api.post('/auth/login', { password });
      localStorage.setItem('user', JSON.stringify(res.user));
      navigate('/');
    } catch (err: any) {
      setError('Invalid password or server error.');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleLogin();
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="w-full max-w-md p-8 space-y-6 bg-card rounded-xl shadow-lg border border-border">
        <div className="flex flex-col items-center">
          <Brain className="w-12 h-12 text-primary mb-4" />
          <h1 className="text-2xl font-bold text-foreground">Sign in to NudgeBot</h1>
        </div>

        {error && <div className="text-destructive text-sm text-center">{error}</div>}

        <div className="space-y-4" onKeyDown={handleKeyDown}>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Password</label>
            <Input
              type="password"
              placeholder="Enter admin password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button className="w-full mt-4" onClick={handleLogin}>
            Sign In
          </Button>
        </div>
      </div>
    </div>
  );
}
