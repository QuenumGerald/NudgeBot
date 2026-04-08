import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { apiFetch } from "@/lib/api";

interface Settings {
  llm_provider: string;
  llm_model: string;
  llm_api_key: string;
}

export const SettingsPage = () => {
  const [form, setForm] = useState({ llmProvider: "openrouter", llmModel: "deepseek/deepseek-chat", llmApiKey: "" });
  const [status, setStatus] = useState("");

  useEffect(() => {
    apiFetch<{ settings: Settings }>("/api/settings")
      .then((data) => {
        if (data.settings) {
          setForm({
            llmProvider: data.settings.llm_provider,
            llmModel: data.settings.llm_model,
            llmApiKey: data.settings.llm_api_key
          });
        }
      })
      .catch(() => setStatus("Could not load settings."));
  }, []);

  const save = async () => {
    try {
      await apiFetch("/api/settings", { method: "POST", body: JSON.stringify(form) });
      setStatus("Settings saved.");
    } catch {
      setStatus("Failed to save settings.");
    }
  };

  return (
    <section className="mx-auto max-w-2xl space-y-4 rounded-lg border bg-white p-6 dark:bg-slate-900">
      <h1 className="text-xl font-semibold">Model Settings</h1>
      <Select
        value={form.llmProvider}
        onValueChange={(value) => setForm((prev) => ({ ...prev, llmProvider: value }))}
        options={[
          { label: "OpenRouter", value: "openrouter" },
          { label: "OpenAI", value: "openai" },
          { label: "DeepSeek", value: "deepseek" }
        ]}
      />
      <Input value={form.llmModel} onChange={(e) => setForm((prev) => ({ ...prev, llmModel: e.target.value }))} placeholder="Model ID" />
      <Input value={form.llmApiKey} onChange={(e) => setForm((prev) => ({ ...prev, llmApiKey: e.target.value }))} placeholder="API Key" />
      {status ? <p className="text-sm text-slate-600 dark:text-slate-300">{status}</p> : null}
      <Button onClick={save}>Save settings</Button>
    </section>
  );
};
