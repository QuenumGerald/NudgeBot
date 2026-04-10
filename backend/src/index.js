#!/usr/bin/env node

/**
 * Point d'entrée principal de l'agent de génération de documentation
 */

const { DocAgent } = require('./agents/doc-agent');
const { ConfigManager } = require('./utils/config-manager');
const { Logger } = require('./utils/logger');

class DocAgentGenerator {
  constructor() {
    this.logger = new Logger();
    this.configManager = new ConfigManager();
    this.agent = null;
  }

  /**
   * Initialise l'agent avec la configuration
   */
  async initialize() {
    try {
      this.logger.info('Initialisation du Doc Agent Generator...');
      
      // Charger la configuration
      const config = await this.configManager.load();
      
      // Créer l'agent
      this.agent = new DocAgent(config);
      
      this.logger.success('Doc Agent Generator initialisé avec succès');
      return true;
    } catch (error) {
      this.logger.error('Erreur lors de l\'initialisation:', error);
      return false;
    }
  }

  /**
   * Génère la documentation pour un projet
   * @param {string} projectPath - Chemin du projet à documenter
   * @param {Object} options - Options de génération
   */
  async generateDocumentation(projectPath, options = {}) {
    if (!this.agent) {
      await this.initialize();
    }

    try {
      this.logger.info(`Génération de documentation pour: ${projectPath}`);
      
      const result = await this.agent.generate(projectPath, options);
      
      this.logger.success('Documentation générée avec succès');
      this.logger.info(`Fichiers créés: ${result.filesGenerated.length}`);
      this.logger.info(`Emplacement: ${result.outputPath}`);
      
      return result;
    } catch (error) {
      this.logger.error('Erreur lors de la génération de documentation:', error);
      throw error;
    }
  }

  /**
   * Surveille un projet et met à jour la documentation automatiquement
   * @param {string} projectPath - Chemin du projet à surveiller
   */
  async watchProject(projectPath) {
    if (!this.agent) {
      await this.initialize();
    }

    try {
      this.logger.info(`Surveillance du projet: ${projectPath}`);
      this.logger.info('Appuyez sur Ctrl+C pour arrêter...');
      
      await this.agent.watch(projectPath);
    } catch (error) {
      this.logger.error('Erreur lors de la surveillance:', error);
      throw error;
    }
  }

  /**
   * Analyse un projet sans générer de documentation
   * @param {string} projectPath - Chemin du projet à analyser
   */
  async analyzeProject(projectPath) {
    if (!this.agent) {
      await this.initialize();
    }

    try {
      this.logger.info(`Analyse du projet: ${projectPath}`);
      
      const analysis = await this.agent.analyze(projectPath);
      
      this.logger.info('=== RAPPORT D\'ANALYSE ===');
      this.logger.info(`Langages détectés: ${analysis.languages.join(', ')}`);
      this.logger.info(`Fichiers analysés: ${analysis.filesAnalyzed}`);
      this.logger.info(`Complexité moyenne: ${analysis.averageComplexity}`);
      this.logger.info(`Documentation existante: ${analysis.existingDocs}%`);
      
      return analysis;
    } catch (error) {
      this.logger.error('Erreur lors de l\'analyse:', error);
      throw error;
    }
  }
}

// Export pour utilisation en tant que module
module.exports = { DocAgentGenerator };

// Exécution en ligne de commande
if (require.main === module) {
  const { program } = require('commander');
  const generator = new DocAgentGenerator();

  program
    .name('doc-agent')
    .description('Agent de génération automatique de documentation')
    .version('1.0.0');

  program
    .command('generate <project-path>')
    .description('Génère la documentation pour un projet')
    .option('-o, --output <path>', 'Chemin de sortie pour la documentation')
    .option('-f, --format <format>', 'Format de sortie (markdown, html, pdf)', 'markdown')
    .option('-v, --verbose', 'Mode verbeux')
    .action(async (projectPath, options) => {
      try {
        await generator.initialize();
        await generator.generateDocumentation(projectPath, options);
      } catch (error) {
        console.error('Erreur:', error.message);
        process.exit(1);
      }
    });

  program
    .command('watch <project-path>')
    .description('Surveille un projet et met à jour la documentation automatiquement')
    .action(async (projectPath) => {
      try {
        await generator.initialize();
        await generator.watchProject(projectPath);
      } catch (error) {
        console.error('Erreur:', error.message);
        process.exit(1);
      }
    });

  program
    .command('analyze <project-path>')
    .description('Analyse un projet sans générer de documentation')
    .action(async (projectPath) => {
      try {
        await generator.initialize();
        await generator.analyzeProject(projectPath);
      } catch (error) {
        console.error('Erreur:', error.message);
        process.exit(1);
      }
    });

  program.parse(process.argv);
}