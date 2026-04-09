import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Settings as SettingsIcon } from 'lucide-react';

export default function Settings() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => {
    if (!user.id) {
      navigate('/login');
      return;
    }
  }, [user.id, navigate]);

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center space-x-2">
            <SettingsIcon className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          </div>
        </div>

        <div className="bg-card p-6 rounded-xl border border-border space-y-6">
          <div className="text-sm text-muted-foreground">
            LLM configuration is managed on the server via environment variables.
          </div>
        </div>
      </div>
    </div>
  );
}
