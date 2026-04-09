import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function Settings() {
  const [provider, setProvider] = useState('openrouter');
  const [model, setModel] = useState('deepseek/deepseek-chat');
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        if (!data.error) {
          setProvider(data.llm_provider || 'openrouter');
          setModel(data.llm_model || 'deepseek/deepseek-chat');
          setApiKey(data.llm_api_key || '');
        }
      });
  }, []);

  const handleSave = async () => {
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ llm_provider: provider, llm_model: model, llm_api_key: apiKey }),
      });
      if (res.ok) {
        setStatus('Settings saved successfully');
        setTimeout(() => setStatus(''), 3000);
      } else {
        setStatus('Failed to save settings');
      }
    } catch (e) {
      setStatus('Error saving settings');
    }
  };

  return (
    <div className="p-8 max-w-2xl mx-auto w-full">
      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription>Configure your Language Model Provider</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium">Provider</label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger>
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openrouter">OpenRouter</SelectItem>
                <SelectItem value="openai">OpenAI</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Model</label>
            <Input
              value={model}
              onChange={(e: any) => setModel(e.target.value)}
              placeholder="e.g. deepseek/deepseek-chat or gpt-4o-mini"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">API Key</label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e: any) => setApiKey(e.target.value)}
              placeholder="Enter your API Key"
            />
          </div>
        </CardContent>
        <CardFooter className="flex justify-between items-center">
          <div className="text-sm text-muted-foreground">{status}</div>
          <Button onClick={handleSave}>Save Settings</Button>
        </CardFooter>
      </Card>
    </div>
  );
}
