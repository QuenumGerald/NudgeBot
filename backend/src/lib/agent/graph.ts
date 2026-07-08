import { createOpenAI } from "@ai-sdk/openai";
import { stepCountIs, streamText } from "ai";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { getTools } from "./tools.js";
import { setupMCP } from "./mcp.js";

export const createModel = (provider: string, modelName: string, apiKey: string) => {
  if (provider === "openrouter") {
    const client = createOpenAI({
      name: "openrouter",
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
    });
    return client.chat(modelName || "deepseek/deepseek-chat:free");
  }

  if (provider === "deepseek") {
    const rawBaseUrl = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").trim();
    const normalizedBaseUrl = rawBaseUrl.replace(/\/+$/, "");
    const baseURL = /\/v\d+$/i.test(normalizedBaseUrl)
      ? normalizedBaseUrl
      : `${normalizedBaseUrl}/v1`;
    const client = createOpenAI({
      name: "deepseek",
      apiKey,
      baseURL,
    });
    return client.chat(modelName || "deepseek-chat");
  }

  const client = createOpenAI({ apiKey });
  return client.chat(modelName || "gpt-4o-mini");
};

// Keep createLLM as alias for backwards compatibility within the module
export const createLLM = createModel;

const GraphState = Annotation.Root({
  messages: Annotation<Array<{ role: "user" | "assistant"; content: string }>>(),
  maxSteps: Annotation<number>(),
  result: Annotation<any>(),
});

type StreamOptions = {
  maxSteps?: number;
  runId?: string;
};

const toolsToRecord = (tools: Array<any>) => {
  const record: Record<string, any> = {};
  for (const toolDef of tools) {
    record[toolDef.id] = toolDef;
  }
  return record;
};

export const getAgent = async (
  provider: string,
  modelName: string,
  apiKey: string,
  enabledIntegrations: string[] = [],
  userId: string = "",
  previousContext: string | null = null
) => {
  const model = createModel(provider, modelName, apiKey);
  const mcpTools = await setupMCP(enabledIntegrations, userId);
  const localToolsArray = getTools();
  const localToolsRecord = toolsToRecord(localToolsArray);
  const allTools = { ...localToolsRecord, ...mcpTools };

  const toolCatalog = [
    ...localToolsArray.map((t) => `- ${t.id}: ${t.description || "Aucune description."}`),
    ...Object.entries(mcpTools).map(([name, t]: [string, any]) =>
      `- ${name}: ${t.description || "Aucune description."}`
    ),
  ].join("\n");

  const systemParts = [
    `Tu es NudgeBot, un assistant IA personnel polyvalent et compétent.

Tu es orchestré sous le capot par **LangGraph** (\`@langchain/langgraph\`) et connecté au modèle de langage via **Vercel AI SDK** en TypeScript.
L'application frontend utilise **React (Vite)** et le backend tourne sous **Node.js (Express)**.

Tu peux aider sur TOUS les sujets : questions générales, programmation, rédaction, analyse, brainstorming, math, science, conseil, et bien plus.

### 📁 Gestion de l'espace de travail (CRITIQUE)
Tu travailles selon une architecture **Dual-Repo** :
1.  **Mémoire (Sauvegarde automatique)** : Toutes tes notes, réglages et historiques sont sauvegardés sur ton dépôt GitHub de mémoire. Tu n'as rien à faire, c'est géré par le système.
2.  **Espace de Travail (Local + GitHub)** :
    - Tu travailles d'abord en local dans './workspace' (via 'create_project_workspace').
    - **IMPORTANT** : Pour que le travail de l'utilisateur ne soit pas perdu (car le serveur est éphémère), tu DOIS systématiquement synchroniser tes fichiers importants vers le dépôt de workspace GitHub via l'outil 'sync_to_workspace'.
    - Fais-le après chaque création ou modification majeure de fichier.

### 🛠️ Outils à ta disposition :
- Workspace : créer un dossier ('create_project_workspace'), synchroniser vers GitHub ('sync_to_workspace').
- Fichiers : créer, lire, lister, supprimer des fichiers en local.
- Shell : exécuter des commandes.
- Scheduling : planifier des tâches (BlazerJob).
- Web : extraire le contenu d'URLs.
- Email : envoyer via Resend.
- Notes : persistance sur GitHub (Mémoire).
- Google Jules : déléguer le développement.
  - Pour lancer une tâche Jules, utilise impérativement 'run_jules_session' : cet outil démarre une exécution automatisée immédiatement (mode start/fire-and-forget) et renvoie un ID de session.
  - Quand tu utilises Jules, n'attends pas de réponse intermédiaire côté utilisateur : envoie la requête, puis envoie un rapport clair avec l'ID de session et ce qui a été demandé.
  - Si l'utilisateur demande quels dépôts/repositories sont disponibles pour Jules, commence par 'list_jules_sources' puis résume les repos exploitables.
  - Pour Jules, suis cet ordre: (1) 'list_jules_sources' si le repo cible n'est pas clair, (2) 'list_jules_sessions' si l'utilisateur demande l'état/historique, (3) 'run_jules_session' pour exécuter la demande, (4) expliquer clairement le résultat en français.
  - Si l'utilisateur demande "quels outils tu as ?", réponds avec les noms exacts des outils chargés ci-dessous sans en inventer.
${Object.keys(mcpTools).length > 0 ? `- MCP : ${enabledIntegrations.join(", ")} (${Object.keys(mcpTools).length} outils chargés)` : ""}

Utilise les outils de manière proactive. La persistance sur GitHub est ta priorité absolue.
Quand une demande concerne Jules ou les outils, explique brièvement à quoi sert chaque outil que tu utilises.


### 🚫 Fiabilité et anti-bluff (CRITIQUE)
N'invente jamais de faits, de résultats d'outils, d'IDs de session, de liens, de statuts, de fichiers ou de PR. Si tu n'es pas sûr, dis explicitement que tu n'es pas sûr et vérifie avec les outils disponibles avant de conclure. Si une vérification est impossible, indique clairement la limite au lieu de supposer. Distingue toujours les faits vérifiés de tes hypothèses.

### 💡 Efficacité et Frugalité
Sois concis. Ne génère pas de longs blocs de code ou de texte à moins que ce ne soit explicitement demandé ou absolument nécessaire. Résume tes actions d'outils en une seule phrase courte pour économiser des tokens de complétion.

### 📚 Catalogue exact des outils chargés (à utiliser pour lister les outils)
${toolCatalog || "- Aucun outil chargé."}

Réponds en français par défaut.`,
  ];

  if (previousContext) {
    systemParts.push(`\n--- Contexte des sessions précédentes ---\n${previousContext}\n---`);
  }

  const systemPrompt = systemParts.join("\n");

  const graph = new StateGraph(GraphState)
    .addNode("agent", async (state: any) => ({
      result: streamText({
        model,
        system: systemPrompt,
        messages: state.messages,
        tools: allTools,
        stopWhen: stepCountIs(state.maxSteps),
      }),
    }))
    .addEdge(START, "agent")
    .addEdge("agent", END)
    .compile();

  return {
    id: `nudgebot-${userId || "default"}`,
    name: "NudgeBot",
    async stream(messages: Array<{ role: "user" | "assistant"; content: string }>, options: StreamOptions = {}) {
      const state = await graph.invoke({
        messages,
        maxSteps: options.maxSteps ?? 10,
      }, {
        runName: options.runId,
      } as any);
      return state.result;
    },
  };
};
