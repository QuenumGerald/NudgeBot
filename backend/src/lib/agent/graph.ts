import { StateGraph, MessagesAnnotation } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage } from "@langchain/core/messages";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { getTools } from "./tools.js";
import { setupMCP } from "./mcp.js";

export const createLLM = (provider: string, modelName: string, apiKey: string) => {
  if (provider === "openrouter") {
    return new ChatOpenAI({
      model: modelName || "deepseek/deepseek-chat:free",
      apiKey,
      configuration: { baseURL: "https://openrouter.ai/api/v1" },
      temperature: 0.7,
      streaming: false,
      timeout: 30000,
    });
  }

  if (provider === "deepseek") {
    const rawBaseUrl = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").trim();
    const baseURL = rawBaseUrl.replace(/\/+$/, "");
    return new ChatOpenAI({
      model: modelName || "deepseek-chat",
      apiKey,
      configuration: { baseURL },
      temperature: 0.7,
      streaming: false,
      timeout: 30000,
      useResponsesApi: false,
    });
  }

  return new ChatOpenAI({
    model: modelName || "gpt-3.5-turbo",
    apiKey,
    temperature: 0.7,
    streaming: false,
    timeout: 30000,
  });
};

export const getAgent = async (
  provider: string,
  modelName: string,
  apiKey: string,
  enabledIntegrations: string[] = [],
  userId: string = "",
  previousContext: string | null = null
) => {
  const graphBuilder = new StateGraph(MessagesAnnotation);

  const llm = createLLM(provider, modelName, apiKey);
  const mcpTools = await setupMCP(enabledIntegrations, userId);
  const localTools = getTools();
  const allTools = [...localTools, ...mcpTools];
  const toolCatalog = allTools
    .map((tool: any) => `- ${tool.name}: ${tool.description || "Aucune description."}`)
    .join("\n");

  let toolsEnabled = false;
  let llmWithTools: any = llm;

  try {
    llmWithTools = llm.bindTools(allTools);
    toolsEnabled = allTools.length > 0;
  } catch (e) {
    console.error("Failed to bind tools to LLM, continuing without tools:", e);
  }

  const systemParts = [
    `Tu es NudgeBot, un assistant IA personnel polyvalent et compétent.

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
  - Quand tu utilises Jules, n'attends pas de réponse intermédiaire côté utilisateur : envoie la requête, laisse la session aller au bout, puis envoie un rapport clair à l'utilisateur (résumé, statut, PR/livrables).
  - Si l'utilisateur demande quels dépôts/repositories sont disponibles pour Jules, commence par 'list_jules_sources' puis résume les repos exploitables.
  - Pour Jules, suis cet ordre: (1) 'list_jules_sources' si le repo cible n'est pas clair, (2) 'list_jules_sessions' si l'utilisateur demande l'état/historique, (3) 'run_jules_session' pour exécuter la demande, (4) expliquer clairement le résultat en français.
  - Si l'utilisateur demande "quels outils tu as ?", réponds avec les noms exacts des outils chargés ci-dessous sans en inventer.
${mcpTools.length > 0 ? `- MCP : ${enabledIntegrations.join(", ")} (${mcpTools.length} outils chargés)` : ""}

Utilise les outils de manière proactive. La persistance sur GitHub est ta priorité absolue.
Quand une demande concerne Jules ou les outils, explique brièvement à quoi sert chaque outil que tu utilises.

### 📚 Catalogue exact des outils chargés (à utiliser pour lister les outils)
${toolCatalog || "- Aucun outil chargé."}

Réponds en français par défaut.`,
  ];

  if (previousContext) {
    systemParts.push(`\n--- Contexte des sessions précédentes ---\n${previousContext}\n---`);
  }

  const systemPrompt = systemParts.join("\n");

  const callModel = async (state: typeof MessagesAnnotation.State) => {
    const response = await llmWithTools.invoke([
      new SystemMessage(systemPrompt),
      ...state.messages,
    ]);
    return { messages: [response] };
  };

  if (toolsEnabled) {
    const toolNode = new ToolNode(allTools);

    const shouldContinue = (state: typeof MessagesAnnotation.State) => {
      const messages = state.messages;
      const lastMessage = messages[messages.length - 1];
      if ((lastMessage as any).tool_calls?.length) {
        return "tools";
      }
      return "__end__";
    };

    graphBuilder
      .addNode("agent", callModel)
      .addNode("tools", toolNode)
      .addEdge("__start__", "agent")
      .addConditionalEdges("agent", shouldContinue)
      .addEdge("tools", "agent");
  } else {
    graphBuilder
      .addNode("agent", callModel)
      .addEdge("__start__", "agent")
      .addEdge("agent", "__end__");
  }

  return graphBuilder.compile();
};
