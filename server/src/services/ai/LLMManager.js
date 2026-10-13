/**
 * LLMManager.js — Factory and Model Router for AI Leads Agent
 */
const OpenAIProvider = require('./OpenAIProvider');
const MockLLMProvider = require('./MockLLMProvider');

class LLMManager {
  constructor() {
    this.providers = {
      openai: new OpenAIProvider(),
      mock: new MockLLMProvider()
    };
  }

  getProvider() {
    const configuredProvider = process.env.AI_PROVIDER || (process.env.AI_API_KEY || process.env.OPENAI_API_KEY ? 'openai' : 'mock');
    return this.providers[configuredProvider] || this.providers.mock;
  }

  async generateResponse(options) {
    const provider = this.getProvider();
    return await provider.generateResponse(options);
  }
}

module.exports = new LLMManager();
