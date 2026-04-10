# Doc Agent Generator

Un agent intelligent pour la génération automatique de documentation.

## Description

Cet agent utilise l'IA pour générer, maintenir et améliorer la documentation technique de manière automatique. Il peut analyser le code source, comprendre la structure du projet et produire une documentation complète et à jour.

## Fonctionnalités

- 📝 Génération automatique de documentation à partir du code
- 🔄 Mise à jour automatique de la documentation lors des changements
- 🎯 Support de multiples langages de programmation
- 📊 Génération de diagrammes et de visualisations
- 🤖 Intégration avec les workflows CI/CD
- 📚 Support pour différents formats (Markdown, HTML, PDF)

## Installation

```bash
# Cloner le repository
git clone https://github.com/votre-username/doc-agent-generator.git
cd doc-agent-generator

# Installer les dépendances
npm install
```

## Configuration

Créez un fichier `.env` à la racine du projet :

```env
OPENAI_API_KEY=votre_clé_api
GITHUB_TOKEN=votre_token_github
PROJECT_PATH=./votre-projet
```

## Utilisation

```bash
# Générer la documentation
npm run generate-docs

# Surveiller les changements et mettre à jour automatiquement
npm run watch

# Générer un rapport d'analyse
npm run analyze
```

## Structure du projet

```
doc-agent-generator/
├── src/
│   ├── agents/          # Agents IA spécialisés
│   ├── parsers/         # Analyseurs de code
│   ├── generators/      # Générateurs de documentation
│   ├── utils/          # Utilitaires
│   └── index.js        # Point d'entrée
├── config/             # Fichiers de configuration
├── examples/           # Exemples d'utilisation
├── tests/              # Tests unitaires
└── docs/              # Documentation générée
```

## Dépendances principales

- OpenAI API pour les modèles de langage
- Node.js pour l'exécution
- Various code parsers (TypeScript, Python, Java, etc.)
- Markdown/HTML generators

## Roadmap

- [ ] Support multi-langages
- [ ] Génération de diagrammes UML
- [ ] Intégration GitHub Actions
- [ ] Interface web
- [ ] API REST
- [ ] Plugins pour éditeurs

## Licence

MIT