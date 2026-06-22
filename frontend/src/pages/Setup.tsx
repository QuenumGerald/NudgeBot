import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Eye, EyeOff, Key, Shield, Bot, ArrowRight, Check } from 'lucide-react';

export default function Setup() {
  const navigate = useNavigate();
  
  const [adminPassword, setAdminPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [llmProvider, setLlmProvider] = useState('deepseek');
  const [llmModel, setLlmModel] = useState('deepseek-chat');
  const [llmApiKey, setLlmApiKey] = useState('');
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (llmProvider === 'deepseek') {
      setLlmModel('deepseek-chat');
    } else if (llmProvider === 'openai') {
      setLlmModel('gpt-4o-mini');
    } else if (llmProvider === 'openrouter') {
      setLlmModel('google/gemini-2.5-flash');
    }
  }, [llmProvider]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    if (adminPassword.length < 4) {
      setError('Password must be at least 4 characters long.');
      setIsLoading(false);
      return;
    }

    if (!llmApiKey) {
      setError('Please provide an API Key for the selected LLM provider.');
      setIsLoading(false);
      return;
    }

    try {
      await api.post('/setup/config', {
        adminPassword,
        llmProvider,
        llmModel,
        llmApiKey
      });
      
      setSuccess(true);
      setTimeout(() => {
        navigate('/login');
      }, 2000);
    } catch (err: any) {
      setError(err?.message || 'Failed to save configuration. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background text-foreground p-4">
      <div className="w-full max-w-md p-8 space-y-6 bg-card rounded-xl border border-border shadow-lg relative">
        
        <div className="flex flex-col items-center mb-2">
          {/* NudgeBot Full-Color Bee Logo */}
          <img src="/logo.png" alt="NudgeBot" className="w-20 h-20 mb-4" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-center">
            Welcome to NudgeBot
          </h1>
          <p className="text-sm text-muted-foreground mt-2 text-center">
            Initialize NudgeBot by setting up your password and AI provider configuration.
          </p>
        </div>

        {success ? (
          <div className="flex flex-col items-center py-8 space-y-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 border border-primary text-primary">
              <Check className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold text-foreground text-center">Configuration Saved!</h2>
            <p className="text-sm text-muted-foreground text-center">Redirecting to the login screen...</p>
          </div>
        ) : (
          <form className="space-y-5" onSubmit={handleSubmit}>
            {error && (
              <div className="p-3 text-sm rounded-lg border border-destructive/20 bg-destructive/10 text-destructive text-center">
                {error}
              </div>
            )}

            {/* Admin Password Field */}
            <div className="space-y-2">
              <label className="flex items-center text-xs font-semibold uppercase tracking-wider text-muted-foreground space-x-1.5">
                <Shield className="w-3.5 h-3.5" />
                <span>Admin Password</span>
              </label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password (minimum 4 characters)"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="bg-background border-border text-foreground rounded-lg pl-3 pr-10 py-5 focus-visible:ring-1 focus-visible:ring-ring"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Provider Tabs */}
            <div className="space-y-2.5 pt-1">
              <label className="flex items-center text-xs font-semibold uppercase tracking-wider text-muted-foreground space-x-1.5">
                <Bot className="w-3.5 h-3.5" />
                <span>Select LLM Provider</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'deepseek', name: 'DeepSeek' },
                  { id: 'openai', name: 'OpenAI' },
                  { id: 'openrouter', name: 'OpenRouter' },
                ].map((prov) => (
                  <button
                    key={prov.id}
                    type="button"
                    onClick={() => setLlmProvider(prov.id)}
                    className={`py-2 px-1 rounded-lg border text-xs font-medium transition-all ${
                      llmProvider === prov.id
                        ? 'border-foreground bg-foreground text-background'
                        : 'border-border bg-muted text-muted-foreground hover:border-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {prov.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Model Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Model Name
              </label>
              <Input
                type="text"
                placeholder="e.g. deepseek-chat"
                value={llmModel}
                onChange={(e) => setLlmModel(e.target.value)}
                className="bg-background border-border text-foreground rounded-lg py-5 focus-visible:ring-1 focus-visible:ring-ring"
                required
              />
            </div>

            {/* API Key */}
            <div className="space-y-1.5">
              <label className="flex items-center text-xs font-semibold uppercase tracking-wider text-muted-foreground space-x-1.5">
                <Key className="w-3.5 h-3.5" />
                <span>API Key</span>
              </label>
              <Input
                type="password"
                placeholder={`Paste your ${llmProvider} API key`}
                value={llmApiKey}
                onChange={(e) => setLlmApiKey(e.target.value)}
                className="bg-background border-border text-foreground rounded-lg py-5 focus-visible:ring-1 focus-visible:ring-ring"
                required
              />
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full py-5 mt-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity"
            >
              {isLoading ? (
                <div className="flex items-center justify-center space-x-2">
                  <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  <span>Saving Configuration...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center space-x-2">
                  <span>Start NudgeBot</span>
                  <ArrowRight className="w-4 h-4" />
                </div>
              )}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
