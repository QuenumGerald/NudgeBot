import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Settings as SettingsIcon, Loader2, Brain, Trash2, Save } from 'lucide-react';

const INTEGRATIONS = [
  { id: 'fetch', label: 'Web Fetch', description: 'Récupérer des pages web et URLs' },
  { id: 'github', label: 'GitHub', description: 'Accès aux repos, issues et PRs' },
  { id: 'google_calendar', label: 'Google Calendar', description: 'Gérer les événements du calendrier' },
  { id: 'jira', label: 'Jira', description: 'Accès et gestion des tickets Jira' },
  { id: 'confluence', label: 'Confluence', description: 'Accès aux pages Confluence' },
  { id: 'render', label: 'Render', description: 'Gérer les déploiements Render' },
  { id: 'netlify', label: 'Netlify', description: 'Gérer les sites Netlify' },
];

const MEMORY_SECTIONS = [
  { id: 'decisions', label: 'Décisions', description: 'Choix techniques et architecturaux mémorisés' },
  { id: 'actions', label: 'Actions en cours', description: 'Tâches et actions planifiées' },
  { id: 'topics', label: 'Sujets actifs', description: 'Thèmes détectés dans les conversations' },
  { id: 'messages', label: 'Historique messages', description: 'Messages compressés stockés localement' },
];

interface MemorySection {
  decisions: Array<{ text: string; timestamp: string }>;
  actions: Array<{ description: string; priority: string; timestamp: string }>;
  topics: string[];
  messageCount: number;
}

interface MemoryData {
  stats: {
    summary: string;
    messageCount: number;
    decisionsCount: number;
    actionsCount: number;
    lastSave: string | null;
    sessionDuration: string;
  } | null;
  sections: MemorySection | null;
}

export default function Settings() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const [enabledIntegrations, setEnabledIntegrations] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  const [memory, setMemory] = useState<MemoryData>({ stats: null, sections: null });
  const [memoryLoading, setMemoryLoading] = useState(true);
  const [clearingSection, setClearingSection] = useState<string | null>(null);
  const [forceSaving, setForceSaving] = useState(false);

  const loadSettings = useCallback(() => {
    fetch(`/api/settings/${user.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.enabled_integrations) setEnabledIntegrations(data.enabled_integrations);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user.id]);

  const loadMemory = useCallback(() => {
    setMemoryLoading(true);
    fetch(`/api/memory/${user.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setMemory({ stats: data.stats, sections: data.sections });
      })
      .catch(console.error)
      .finally(() => setMemoryLoading(false));
  }, [user.id]);

  useEffect(() => {
    if (!user.id) { navigate('/login'); return; }
    loadSettings();
    loadMemory();
  }, [user.id, navigate, loadSettings, loadMemory]);

  const toggle = async (id: string) => {
    const next = enabledIntegrations.includes(id)
      ? enabledIntegrations.filter((i) => i !== id)
      : [...enabledIntegrations, id];

    setEnabledIntegrations(next);
    setSaving(true);
    setSavedKey(id);

    try {
      await fetch(`/api/settings/${user.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled_integrations: next }),
      });
    } catch (e) {
      console.error('Failed to save integration settings', e);
      setEnabledIntegrations(enabledIntegrations);
    } finally {
      setSaving(false);
      setTimeout(() => setSavedKey(null), 1000);
    }
  };

  const clearSection = async (section: string) => {
    setClearingSection(section);
    try {
      await fetch(`/api/memory/${user.id}/${section}`, { method: 'DELETE' });
      loadMemory();
    } catch (e) {
      console.error('Failed to clear section', e);
    } finally {
      setClearingSection(null);
    }
  };

  const clearAll = async () => {
    setClearingSection('all');
    try {
      await fetch(`/api/memory/${user.id}`, { method: 'DELETE' });
      loadMemory();
    } catch (e) {
      console.error('Failed to clear memory', e);
    } finally {
      setClearingSection(null);
    }
  };

  const forceSave = async () => {
    setForceSaving(true);
    try {
      await fetch(`/api/memory/${user.id}/save`, { method: 'POST' });
      loadMemory();
    } catch (e) {
      console.error('Failed to force save', e);
    } finally {
      setForceSaving(false);
    }
  };

  const sectionCount = (id: string): number => {
    if (!memory.sections) return 0;
    if (id === 'decisions') return memory.sections.decisions.length;
    if (id === 'actions') return memory.sections.actions.length;
    if (id === 'topics') return memory.sections.topics.length;
    if (id === 'messages') return memory.sections.messageCount;
    return 0;
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-2xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center space-x-2">
            <SettingsIcon className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          </div>
        </div>

        {/* MCP Integrations */}
        <div className="bg-card p-6 rounded-xl border border-border space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Intégrations MCP</h2>
          <p className="text-sm text-muted-foreground">
            Active uniquement les outils dont tu as besoin. Chaque intégration démarre un processus
            MCP lors du prochain message.
          </p>

          {loading ? (
            <div className="flex items-center space-x-2 text-muted-foreground py-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Chargement…</span>
            </div>
          ) : (
            <div className="space-y-2">
              {INTEGRATIONS.map((integration) => {
                const enabled = enabledIntegrations.includes(integration.id);
                const isSavingThis = saving && savedKey === integration.id;
                return (
                  <div
                    key={integration.id}
                    className="flex items-center justify-between p-4 rounded-lg border border-border bg-background hover:bg-muted/30 transition-colors"
                  >
                    <div>
                      <div className="font-medium text-foreground text-sm">{integration.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{integration.description}</div>
                    </div>
                    <button
                      onClick={() => toggle(integration.id)}
                      disabled={isSavingThis}
                      className={[
                        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                        enabled ? 'bg-primary' : 'bg-muted',
                        isSavingThis ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
                      ].join(' ')}
                    >
                      <span className={['inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform', enabled ? 'translate-x-6' : 'translate-x-1'].join(' ')} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Memory */}
        <div className="bg-card p-6 rounded-xl border border-border space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Brain className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Mémoire</h2>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={forceSave}
                disabled={forceSaving}
                className="text-xs"
              >
                {forceSaving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}
                Sauvegarder
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAll}
                disabled={clearingSection === 'all'}
                className="text-xs text-destructive hover:text-destructive"
              >
                {clearingSection === 'all' ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Trash2 className="w-3 h-3 mr-1" />}
                Tout effacer
              </Button>
            </div>
          </div>

          {/* Stats */}
          {memory.stats && (
            <div className="bg-muted/30 rounded-lg p-3 space-y-1">
              <p className="text-sm text-foreground">{memory.stats.summary}</p>
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>{memory.stats.messageCount} messages</span>
                <span>{memory.stats.decisionsCount} décisions</span>
                <span>{memory.stats.actionsCount} actions</span>
                {memory.stats.lastSave && (
                  <span>Sauvegardé {new Date(memory.stats.lastSave).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Auto-save toutes les heures via BlazerJob</p>
            </div>
          )}

          {memoryLoading ? (
            <div className="flex items-center space-x-2 text-muted-foreground py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Chargement…</span>
            </div>
          ) : (
            <div className="space-y-2">
              {MEMORY_SECTIONS.map((section) => {
                const count = sectionCount(section.id);
                const isClearing = clearingSection === section.id;
                return (
                  <div
                    key={section.id}
                    className="flex items-center justify-between p-4 rounded-lg border border-border bg-background"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground text-sm">{section.label}</span>
                        <span className="text-xs bg-muted text-muted-foreground rounded-full px-2 py-0.5">
                          {count}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{section.description}</div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => clearSection(section.id)}
                      disabled={isClearing || count === 0}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      {isClearing
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Trash2 className="w-4 h-4" />}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
