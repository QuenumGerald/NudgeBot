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
  github_token: string;
  github_memory_repo: string;
  github_workspace_repo: string;
  jira_api_token: string;
  jira_email: string;
  jira_url: string;
  confluence_api_token: string;
  confluence_email: string;
  confluence_url: string;
  google_client_id: string;
  google_client_secret: string;
  google_refresh_token: string;
  render_api_key: string;
  netlify_auth_token: string;
};

export default function Settings() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [settings, setSettings] = useState<SettingsState>({
    llm_provider: '',
    llm_model: '',
    llm_api_key: '',
    enabled_integrations: [],
    github_token: '',
    github_memory_repo: '',
    github_workspace_repo: '',
    jira_api_token: '',
    jira_email: '',
    jira_url: '',
    confluence_api_token: '',
    confluence_email: '',
    confluence_url: '',
    google_client_id: '',
    google_client_secret: '',
    google_refresh_token: '',
    render_api_key: '',
    netlify_auth_token: '',
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
          github_token: data.github_token || '',
          github_memory_repo: data.github_memory_repo || '',
          github_workspace_repo: data.github_workspace_repo || '',
          jira_api_token: data.jira_api_token || '',
          jira_email: data.jira_email || '',
          jira_url: data.jira_url || '',
          confluence_api_token: data.confluence_api_token || '',
          confluence_email: data.confluence_email || '',
          confluence_url: data.confluence_url || '',
          google_client_id: data.google_client_id || '',
          google_client_secret: data.google_client_secret || '',
          google_refresh_token: data.google_refresh_token || '',
          render_api_key: data.render_api_key || '',
          netlify_auth_token: data.netlify_auth_token || '',
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
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-6 md:space-y-8">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center space-x-2">
            <SettingsIcon className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          </div>
        </div>

        <div className="bg-card p-4 md:p-6 rounded-xl border border-border space-y-6">
          <div className="space-y-4">
            <h2 className="text-md font-semibold text-foreground border-b border-border pb-1">LLM Credentials</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          </div>

          <div className="space-y-4 pt-4 border-t border-border">
            <h2 className="text-md font-semibold text-foreground border-b border-border pb-1">Integrations (MCP)</h2>
            <div className="space-y-4">
              {['github', 'google_calendar', 'jira', 'confluence', 'render', 'netlify'].map((integration) => {
                const isEnabled = settings.enabled_integrations.includes(integration);
                return (
                  <div key={integration} className="space-y-3 p-4 rounded-lg border border-border bg-background/30">
                    <label className="flex items-center space-x-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isEnabled}
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
                        className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                      />
                      <span className="text-sm font-bold text-foreground capitalize">
                        {integration.replace('_', ' ')}
                      </span>
                    </label>

                    {isEnabled && (
                      <div className="pl-6 space-y-3 border-l-2 border-border mt-3">
                        {integration === 'github' && (
                          <>
                            <div className="space-y-1">
                              <label className="text-xs text-muted-foreground">GitHub Token (PAT)</label>
                              <Input
                                type="password"
                                value={settings.github_token}
                                onChange={(e) => setSettings(prev => ({ ...prev, github_token: e.target.value }))}
                                placeholder="ghp_..."
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs text-muted-foreground">Memory Repository</label>
                              <Input
                                value={settings.github_memory_repo}
                                onChange={(e) => setSettings(prev => ({ ...prev, github_memory_repo: e.target.value }))}
                                placeholder="username/nudgebot-memory"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs text-muted-foreground">Workspace Repository</label>
                              <Input
                                value={settings.github_workspace_repo}
                                onChange={(e) => setSettings(prev => ({ ...prev, github_workspace_repo: e.target.value }))}
                                placeholder="username/nudgebot-workspace"
                              />
                            </div>
                          </>
                        )}

                        {integration === 'jira' && (
                          <>
                            <div className="space-y-1">
                              <label className="text-xs text-muted-foreground">Jira Email</label>
                              <Input
                                type="email"
                                value={settings.jira_email}
                                onChange={(e) => setSettings(prev => ({ ...prev, jira_email: e.target.value }))}
                                placeholder="user@company.com"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs text-muted-foreground">Jira API Token</label>
                              <Input
                                type="password"
                                value={settings.jira_api_token}
                                onChange={(e) => setSettings(prev => ({ ...prev, jira_api_token: e.target.value }))}
                                placeholder="API token"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs text-muted-foreground">Jira Site URL</label>
                              <Input
                                value={settings.jira_url}
                                onChange={(e) => setSettings(prev => ({ ...prev, jira_url: e.target.value }))}
                                placeholder="https://company.atlassian.net"
                              />
                            </div>
                          </>
                        )}

                        {integration === 'confluence' && (
                          <>
                            <div className="space-y-1">
                              <label className="text-xs text-muted-foreground">Confluence Email</label>
                              <Input
                                type="email"
                                value={settings.confluence_email}
                                onChange={(e) => setSettings(prev => ({ ...prev, confluence_email: e.target.value }))}
                                placeholder="user@company.com"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs text-muted-foreground">Confluence API Token</label>
                              <Input
                                type="password"
                                value={settings.confluence_api_token}
                                onChange={(e) => setSettings(prev => ({ ...prev, confluence_api_token: e.target.value }))}
                                placeholder="API token"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs text-muted-foreground">Confluence Site URL</label>
                              <Input
                                value={settings.confluence_url}
                                onChange={(e) => setSettings(prev => ({ ...prev, confluence_url: e.target.value }))}
                                placeholder="https://company.atlassian.net"
                              />
                            </div>
                          </>
                        )}

                        {integration === 'google_calendar' && (
                          <>
                            <div className="space-y-1">
                              <label className="text-xs text-muted-foreground">Google Client ID</label>
                              <Input
                                value={settings.google_client_id}
                                onChange={(e) => setSettings(prev => ({ ...prev, google_client_id: e.target.value }))}
                                placeholder="Client ID"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs text-muted-foreground">Google Client Secret</label>
                              <Input
                                type="password"
                                value={settings.google_client_secret}
                                onChange={(e) => setSettings(prev => ({ ...prev, google_client_secret: e.target.value }))}
                                placeholder="Client Secret"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs text-muted-foreground">Google Refresh Token</label>
                              <Input
                                type="password"
                                value={settings.google_refresh_token}
                                onChange={(e) => setSettings(prev => ({ ...prev, google_refresh_token: e.target.value }))}
                                placeholder="Refresh Token"
                              />
                            </div>
                          </>
                        )}

                        {integration === 'render' && (
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">Render API Key</label>
                            <Input
                              type="password"
                              value={settings.render_api_key}
                              onChange={(e) => setSettings(prev => ({ ...prev, render_api_key: e.target.value }))}
                              placeholder="rnd_..."
                            />
                          </div>
                        )}

                        {integration === 'netlify' && (
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">Netlify Auth Token</label>
                            <Input
                              type="password"
                              value={settings.netlify_auth_token}
                              onChange={(e) => setSettings(prev => ({ ...prev, netlify_auth_token: e.target.value }))}
                              placeholder="nla_..."
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center space-x-3 pt-4 border-t border-border">
            <Button onClick={saveSettings} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save settings'}
            </Button>
            {status && <div className="text-sm text-muted-foreground">{status}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
