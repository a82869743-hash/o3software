/**
 * LLMManager.js — Factory and Model Router for AI Leads Agent
 */
const GroqProvider = require('./GroqProvider');
const OpenAIProvider = require('./OpenAIProvider');
const ClaudeProvider = require('./ClaudeProvider');
const StudioAgentProvider = require('./StudioAgentProvider');

class LLMManager {
  constructor() {
    this.providers = {
      groq: new GroqProvider(),
      openai: new OpenAIProvider(),
      claude: new ClaudeProvider(),
      studio: new StudioAgentProvider()
    };
  }

  getProvider() {
    // AI_PROVIDER wins; otherwise Groq when its key is present, else the studio's own agent
    let configuredProvider = process.env.AI_PROVIDER || (process.env.GROQ_API_KEY ? 'groq' : 'studio');
    if (configuredProvider === 'groq' && !process.env.GROQ_API_KEY) configuredProvider = 'studio';
    return this.providers[configuredProvider] || this.providers.studio;
  }

  async generateResponse(options) {
    const provider = this.getProvider();
    try {
      return await provider.generateResponse(options);
    } catch (err) {
      // Never leave a customer unanswered because the AI vendor is down/misconfigured
      console.error(`[LLM] ${provider.getProviderName()} failed, the studio agent replies instead:`, err.message);
      if (provider !== this.providers.studio) return this.providers.studio.generateResponse(options);
      throw err;
    }
  }

  status() {
    const p = this.getProvider();
    const models = {
      groq: () => process.env.GROQ_MODEL || GroqProvider.DEFAULT_MODEL,
      openai: () => process.env.AI_MODEL || OpenAIProvider.DEFAULT_MODEL,
      claude: () => process.env.ANTHROPIC_MODEL || 'claude-opus-5-5',
    };
    return { provider: p.getProviderName(), model: (models[p.getProviderName()] || (() => 'studio agent'))() };
  }
}

module.exports = new LLMManager();
