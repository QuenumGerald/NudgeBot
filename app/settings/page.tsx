"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Brain, ArrowLeft, Save, Plus, Trash2, CheckCircle, Circle } from "lucide-react";

type Settings = Record<string, string>;

interface McpServer {
  name: string;
  command: string;
  args: string;
  env: string;
}

const LLM_PROVIDERS = [
  { value: "openrouter", label: "OpenRouter", baseURL: "https://openrouter.ai/api/v1" },
  { value: "openai", label: "OpenAI", baseURL: "https://api.openai.com/v1" },
  { value: "anthropic", label: "Anthropic", baseURL: "https://api.anthropic.com/v1" },
  { value: "deepseek", label: "DeepSeek", baseURL: "https://api.deepseek.com/v1" },
];

const PROVIDER_MODEL_SUGGESTIONS: Record<string, string> = {
  openrouter: "deepseek/deepseek-chat",
  openai: "gpt-4o",
  anthropic: "claude-sonnet-4-6",
  deepseek: "deepseek-v3",
};

function Badge({ connected }: { connected: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${connected ? "bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400" : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"}`}>
      {connected ? <CheckCircle size={11} /> : <Circle size={11} />}
      {connected ? "Connecté" : "Non configuré"}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-6 space-y-4">
      <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = "text" }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400 dark:placeholder-gray-500"
    />
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // MCP custom servers
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [newMcp, setNewMcp] = useState<McpServer>({ name: "", command: "npx", args: "", env: "" });

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const response = await fetch("/api/settings", {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
        });
        const data = await response.json().catch(() => ({}));
        if (!active) return;

        if (!response.ok) {
          const message = data?.error || `HTTP ${response.status}`;
          setLoadError(`Impossible de charger les paramètres: ${message}`);
          return;
        }

        setLoadError(null);
        setSettings(data.settings ?? {});
        if (data.settings?.mcp_servers) {
          try { setMcpServers(JSON.parse(data.settings.mcp_servers)); } catch { /* ignore */ }
        }
      } catch (error: any) {
        if (!active) return;
        console.error("[Settings] Failed to fetch settings:", error);
        setLoadError(`Impossible de contacter /api/settings (${error?.message || "erreur réseau"})`);
      }
    })();

    return () => { active = false; };
  }, []);

  const set = (key: string, value: string) => setSettings(prev => ({ ...prev, [key]: value }));

  async function save(section: string, keys: Record<string, string>) {
    setSaving(section);
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys }),
      });
      if (!response.ok) {
        const error = await response.json();
        console.error(`[Settings] Error saving ${section}:`, error);
        alert(`Erreur: ${error.error || "Sauvegarde échouée"}`);
        setSaving(null);
        return;
      }
      console.log(`[Settings] Saved ${section}`);
      setSaved(section);
      setTimeout(() => setSaved(null), 2000);
    } catch (error) {
      console.error(`[Settings] Network error:`, error);
      alert("Erreur réseau: impossible de sauvegarder");
    } finally {
      setSaving(null);
    }
  }

  async function saveMcpServers(servers: McpServer[]) {
    setMcpServers(servers);
    await save("mcp", { mcp_servers: JSON.stringify(servers) });
  }

  function addMcpServer() {
    if (!newMcp.name || !newMcp.command) return;
    saveMcpServers([...mcpServers, newMcp]);
    setNewMcp({ name: "", command: "npx", args: "", env: "" });
  }

  function removeMcpServer(index: number) {
    saveMcpServers(mcpServers.filter((_, i) => i !== index));
  }

  const provider = settings.llm_provider || "openrouter";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <header className="h-16 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <Brain size={20} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-800 dark:text-white">Nudgebot — Paramètres</h1>
        </div>
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-sm font-medium"
        >
          <ArrowLeft size={14} />
          Retour au chat
        </button>
      </header>

      <main className="max-w-2xl mx-auto p-6 space-y-6">
        {loadError && (
          <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300 px-4 py-3 text-sm">
            {loadError}
          </div>
        )}

        {/* LLM */}
        <Section title="Modèle de langage">
          <Field label="Fournisseur">
            <select
              value={provider}
              onChange={e => {
                set("llm_provider", e.target.value);
                set("llm_model", PROVIDER_MODEL_SUGGESTIONS[e.target.value] || "");
              }}
              className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {LLM_PROVIDERS.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Modèle">
            <Input
              value={settings.llm_model || ""}
              onChange={v => set("llm_model", v)}
              placeholder={PROVIDER_MODEL_SUGGESTIONS[provider] || "nom/du-modele"}
            />
          </Field>
          <Field label="Clé API">
            <Input
              type="password"
              value={settings.llm_api_key || ""}
              onChange={v => set("llm_api_key", v)}
              placeholder="sk-..."
            />
          </Field>
          <button
            onClick={() => save("llm", { llm_provider: provider, llm_model: settings.llm_model || "", llm_api_key: settings.llm_api_key || "" })}
            disabled={saving === "llm"}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 text-sm font-medium transition-colors"
          >
            <Save size={14} />
            {saved === "llm" ? "Sauvegardé ✓" : saving === "llm" ? "Sauvegarde..." : "Sauvegarder"}
          </button>
        </Section>

        {/* GitHub */}
        <Section title="GitHub">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">Personal Access Token</span>
            <Badge connected={!!(settings.github_token && settings.github_token !== "••••••")} />
          </div>
          <Field label="Token">
            <Input
              type="password"
              value={settings.github_token || ""}
              onChange={v => set("github_token", v)}
              placeholder="ghp_..."
            />
          </Field>
          <button
            onClick={() => save("github", { github_token: settings.github_token || "" })}
            disabled={saving === "github"}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 text-sm font-medium transition-colors"
          >
            <Save size={14} />
            {saved === "github" ? "Sauvegardé ✓" : saving === "github" ? "Sauvegarde..." : "Sauvegarder"}
          </button>
        </Section>

        {/* Jira */}
        <Section title="Jira / Atlassian">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">Authentification par token</span>
            <Badge connected={!!(settings.jira_host && settings.jira_api_token && settings.jira_api_token !== "••••••")} />
          </div>
          <Field label="URL de l'instance">
            <Input value={settings.jira_host || ""} onChange={v => set("jira_host", v)} placeholder="https://yourorg.atlassian.net" />
          </Field>
          <Field label="Email">
            <Input value={settings.jira_email || ""} onChange={v => set("jira_email", v)} placeholder="you@example.com" />
          </Field>
          <Field label="API Token">
            <Input type="password" value={settings.jira_api_token || ""} onChange={v => set("jira_api_token", v)} placeholder="Atlassian API token" />
          </Field>
          <button
            onClick={() => save("jira", { jira_host: settings.jira_host || "", jira_email: settings.jira_email || "", jira_api_token: settings.jira_api_token || "" })}
            disabled={saving === "jira"}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 text-sm font-medium transition-colors"
          >
            <Save size={14} />
            {saved === "jira" ? "Sauvegardé ✓" : saving === "jira" ? "Sauvegarde..." : "Sauvegarder"}
          </button>
        </Section>

        {/* Google */}
        <Section title="Google Calendar">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">OAuth2</span>
            <Badge connected={!!(settings.google_refresh_token && settings.google_refresh_token !== "••••••")} />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Crée un projet Google Cloud, active l&apos;API Calendar, génère des credentials OAuth2 et colle-les ci-dessous. Ensuite clique &quot;Connecter&quot;.
          </p>
          <Field label="Client ID">
            <Input value={settings.google_client_id || ""} onChange={v => set("google_client_id", v)} placeholder="xxx.apps.googleusercontent.com" />
          </Field>
          <Field label="Client Secret">
            <Input type="password" value={settings.google_client_secret || ""} onChange={v => set("google_client_secret", v)} placeholder="GOCSPX-..." />
          </Field>
          <div className="flex gap-2">
            <button
              onClick={() => save("google_creds", { google_client_id: settings.google_client_id || "", google_client_secret: settings.google_client_secret || "" })}
              disabled={saving === "google_creds"}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 text-sm font-medium transition-colors"
            >
              <Save size={14} />
              {saved === "google_creds" ? "Sauvegardé ✓" : "Sauvegarder credentials"}
            </button>
            <a
              href="/api/auth/google"
              className="flex items-center gap-1.5 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium transition-colors"
            >
              Connecter avec Google
            </a>
          </div>
        </Section>

        {/* MCP Custom */}
        <Section title="Serveurs MCP personnalisés">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Connecte n&apos;importe quel serveur MCP compatible stdio. Les outils seront automatiquement disponibles dans le chat.
          </p>
          {mcpServers.length > 0 && (
            <div className="space-y-2">
              {mcpServers.map((s, i) => (
                <div key={i} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{s.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{s.command} {s.args}</p>
                  </div>
                  <button onClick={() => removeMcpServer(i)} className="text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-2 border-t border-gray-100 dark:border-gray-800 pt-4">
            <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Ajouter un serveur</p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Nom">
                <Input value={newMcp.name} onChange={v => setNewMcp(p => ({ ...p, name: v }))} placeholder="slack" />
              </Field>
              <Field label="Commande">
                <Input value={newMcp.command} onChange={v => setNewMcp(p => ({ ...p, command: v }))} placeholder="npx" />
              </Field>
              <Field label="Args (espace-séparés)">
                <Input value={newMcp.args} onChange={v => setNewMcp(p => ({ ...p, args: v }))} placeholder="-y mcp-server-slack" />
              </Field>
              <Field label="Env vars (JSON)">
                <Input value={newMcp.env} onChange={v => setNewMcp(p => ({ ...p, env: v }))} placeholder='{"SLACK_TOKEN":"xoxb-..."}' />
              </Field>
            </div>
            <button
              onClick={addMcpServer}
              disabled={!newMcp.name || !newMcp.command}
              className="flex items-center gap-1.5 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50 text-sm font-medium transition-colors"
            >
              <Plus size={14} />
              Ajouter
            </button>
          </div>
        </Section>

      </main>
    </div>
  );
}
