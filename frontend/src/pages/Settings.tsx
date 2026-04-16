import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Settings as SettingsIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';

type SettingsState = {
  llm_provider: string;
  llm_model: string;
  llm_api_key: string;
  enabled_integrations: string[];
};

export default function Settings() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [settings, setSettings] = useState<SettingsState>({
    llm_provider: '',
    llm_model: '',
    llm_api_key: '',
    enabled_integrations: [],
  });
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!user.id) {
      navigate('/login');
      return;
    }

    const loadSettings = async () => {
      try {
        const data = await api.get(`/settings/${user.id}`) as Partial<SettingsState>;
        setSettings({
          llm_provider: data.llm_provider || '',
          llm_model: data.llm_model || '',
          llm_api_key: data.llm_api_key || '',
          enabled_integrations: data.enabled_integrations || [],
        });
      } catch {
        setStatus('No settings found yet. Save to create them.');
      }
    };

    loadSettings();
  }, [user.id, navigate]);

  const saveSettings = async () => {
    setStatus('');
    setIsSaving(true);
    try {
      await api.post(`/settings/${user.id}`, settings);
      setStatus('Settings saved.');
    } catch {
      setStatus('Failed to save settings.');
    } finally {
      setIsSaving(false);
    }
  };

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

        <div className="bg-card p-6 rounded-xl border border-border space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Provider</label>
            <Input
              value={settings.llm_provider}
              onChange={(e) => setSettings((prev) => ({ ...prev, llm_provider: e.target.value }))}
              placeholder="openai / deepseek / openrouter"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Model</label>
            <Input
              value={settings.llm_model}
              onChange={(e) => setSettings((prev) => ({ ...prev, llm_model: e.target.value }))}
              placeholder="gpt-4o-mini, deepseek-chat, ..."
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">API key</label>
            <Input
              type="password"
              value={settings.llm_api_key}
              onChange={(e) => setSettings((prev) => ({ ...prev, llm_api_key: e.target.value }))}
              placeholder="Optional per-user key"
            />
          </div>

          <div className="space-y-3 pt-4 border-t border-border">
            <label className="text-sm font-medium text-foreground">Integrations (MCP)</label>
            <div className="space-y-2">
              {['github', 'google_calendar', 'jira', 'confluence', 'render', 'netlify'].map((integration) => (
                <label key={integration} className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.enabled_integrations.includes(integration)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSettings((prev) => ({
                          ...prev,
                          enabled_integrations: [...prev.enabled_integrations, integration],
                        }));
                      } else {
                        setSettings((prev) => ({
                          ...prev,
                          enabled_integrations: prev.enabled_integrations.filter((i) => i !== integration),
                        }));
                      }
                    }}
                    className="w-4 h-4 rounded border-border"
                  />
                  <span className="text-sm text-foreground capitalize">{integration.replace('_', ' ')}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Configure API keys in environment variables or .env file
            </p>
          </div>

          <Button onClick={saveSettings} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save settings'}
          </Button>
          {status && <div className="text-sm text-muted-foreground">{status}</div>}
        </div>
      </div>
    </div>
  );
}
