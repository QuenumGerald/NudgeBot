# Rapport sur l'intégration d'OpenRouter AI dans NudgeBot

## 1. Résumé exécutif
OpenRouter est **déjà implémenté et supporté nativement** dans l'architecture de NudgeBot. Le système permet aux utilisateurs de sélectionner OpenRouter comme fournisseur LLM, d'utiliser n'importe quel modèle disponible sur la plateforme (bien que l'interface suggère des modèles comme DeepSeek, l'utilisateur peut entrer n'importe quel identifiant de modèle), et de configurer leur propre clé API via les paramètres de l'application. L'architecture est très modulaire (utilisant LangGraph et Langchain) et permet d'ajouter de nouveaux fournisseurs ou modèles très facilement. Aucune référence explicite au modèle "Gemma" n'a été trouvée dans le code, mais grâce à l'intégration d'OpenRouter, l'utilisateur peut tout à fait configurer et utiliser un modèle Gemma disponible sur OpenRouter.

## 2. Fichiers examinés
- `backend/src/routes/chat.ts` : Gestion des requêtes de chat, lecture de la configuration LLM.
- `backend/src/lib/agent/graph.ts` : Création de l'agent LangGraph et initialisation du LLM selon le fournisseur.
- `frontend/src/pages/Settings.tsx` : Interface de configuration utilisateur.
- `README.md` : Documentation du projet.
- `.env` (modèle attendu, basé sur le README) : Variables d'environnement pour la configuration globale.

## 3. Références trouvées (ou non)

### Ce qui a été trouvé :
- **"openrouter" / "OpenRouter" / "openrouter.ai"** :
  - Dans le README : Mentionné explicitement comme un fournisseur supporté (avec DeepSeek et OpenAI).
  - Dans le Frontend (`Settings.tsx`) : "openrouter" est listé comme exemple de provider dans le placeholder du champ "Provider".
  - Dans le Backend (`chat.ts`) : La configuration charge la clé API via `process.env.OPENROUTER_API_KEY` si le fournisseur configuré (dans l'environnement ou par l'utilisateur) est 'openrouter'.
  - Dans le Backend (`graph.ts`) : Lors de la création du LLM (`createLLM`), si le fournisseur est "openrouter", le système utilise `ChatOpenAI` de Langchain configuré avec la `baseURL` personnalisée : `https://openrouter.ai/api/v1`.

### Ce qui n'a pas été trouvé :
- **"gemma" / "Gemma"** : Aucune mention explicite des modèles Gemma n'a été trouvée dans le code ou la documentation. Cependant, puisque OpenRouter est supporté, tout modèle hébergé sur OpenRouter (y compris Gemma) peut être utilisé en spécifiant son identifiant dans le champ "Model" des paramètres utilisateur.

## 4. Architecture LLM actuelle
L'architecture de gestion des LLMs dans NudgeBot est conçue pour être **flexible et orientée utilisateur** :

1. **Priorité de configuration** :
   La configuration s'effectue à deux niveaux. Les variables d'environnement globales (`LLM_PROVIDER`, `LLM_MODEL`, `OPENROUTER_API_KEY`, etc.) servent de valeur par défaut. Ces valeurs peuvent être écrasées par les réglages individuels de chaque utilisateur (stockés via le GitHubStore et modifiables via l'interface `/settings`).
2. **Abstraction (Langchain)** :
   La fonction `createLLM` dans `backend/src/lib/agent/graph.ts` est responsable d'instancier le modèle. Pour OpenRouter, NudgeBot tire astucieusement parti de la compatibilité de l'API OpenRouter avec celle d'OpenAI. Il utilise la classe `ChatOpenAI` de `@langchain/openai` et modifie simplement la configuration pour pointer vers `https://openrouter.ai/api/v1`.
3. **Moteur d'Agent (LangGraph)** :
   Le LLM instancié est ensuite encapsulé dans un `StateGraph` de `@langchain/langgraph` qui gère le cycle `LLM → tools → LLM`, permettant au modèle d'utiliser des outils de manière itérative jusqu'à résolution de la tâche.

## 5. Recommandations techniques
Bien qu'OpenRouter soit déjà fonctionnel, voici quelques recommandations pour améliorer et sécuriser l'intégration :

- **Ajout de suggestions de modèles OpenRouter dans l'UI** : Dans `Settings.tsx`, il serait intéressant d'ajouter un menu déroulant ou des suggestions de modèles OpenRouter populaires (comme `google/gemma-7b-it` ou `anthropic/claude-3-haiku`) au lieu d'un simple champ texte libre, afin de guider l'utilisateur.
- **Validation du modèle** : Actuellement, le modèle par défaut pour OpenRouter est `"deepseek/deepseek-chat:free"`. Bien que fonctionnel, il serait judicieux de s'assurer que ce modèle existe toujours sur OpenRouter, ou de le remplacer par un modèle de base plus générique (comme un modèle OpenAI ou un autre modèle gratuit performant).
- **Documentation .env** : S'assurer que le fichier `.env.example` ou le bloc `.env` dans le README inclut clairement `OPENROUTER_API_KEY=` pour les nouveaux développeurs.
- **Gestion des erreurs (401)** : Les clés API OpenRouter peuvent être révoquées ou l'utilisateur peut manquer de crédits. S'assurer que les erreurs renvoyées par Langchain concernant l'API OpenRouter sont bien interceptées et renvoyées à l'utilisateur sous forme de message clair (ex: "Clé API OpenRouter invalide ou crédits épuisés") plutôt qu'une erreur serveur générique.
