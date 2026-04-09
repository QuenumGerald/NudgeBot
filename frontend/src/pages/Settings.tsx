import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Settings as SettingsIcon } from 'lucide-react';

export default function Settings() {
  const [provider, setProvider] = useState('openrouter');
  const [model, setModel] = useState('deepseek/deepseek-chat:free');
  const [apiKey, setApiKey] = useState('');
  const [message, setMessage] = useState('');
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => {
    if (!user.id) {
      navigate('/login');
      return;
    }

    api.get(`/settings/${user.id}`)
      .then(data => {
        setProvider(data.llm_provider || 'openrouter');
        setModel(data.llm_model || 'deepseek/deepseek-chat:free');
        setApiKey(data.llm_api_key || '');
      })
      .catch(console.error);
  }, [user.id, navigate]);

  const handleSave = async () => {
    try {
      await api.post(`/settings/${user.id}`, {
        llm_provider: provider,
        llm_model: model,
        llm_api_key: apiKey
      });
      setMessage('Settings saved successfully!');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage('Failed to save settings.');
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

        <div className="bg-card p-6 rounded-xl border border-border space-y-6">
          {message && <div className="text-sm font-medium text-primary bg-primary/10 p-3 rounded-md">{message}</div>}

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">LLM Provider</label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger>
                <SelectValue placeholder="Select a provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openrouter">OpenRouter</SelectItem>
                <SelectItem value="openai">OpenAI</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Model</label>
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={provider === 'openrouter' ? 'deepseek/deepseek-chat:free' : 'gpt-3.5-turbo'}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">API Key</label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
            />
          </div>

          <Button onClick={handleSave}>Save Settings</Button>
        </div>
      </div>
    </div>
  );
}
