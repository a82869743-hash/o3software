/**
 * OpenAIProvider.js — Official OpenAI / Compatible API Provider
 */
const axios = require('axios');
const ILLMProvider = require('./ILLMProvider');

class OpenAIProvider extends ILLMProvider {
  constructor() {
    super();
    this.apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '';
    this.model = process.env.AI_MODEL || 'gpt-4o-mini';
    this.apiBase = process.env.AI_API_BASE || 'https://api.openai.com/v1';
  }

  getProviderName() {
    return 'openai';
  }

  async generateResponse({ messages, temperature = 0.3, maxTokens = 500 }) {
    if (!this.apiKey) {
      throw new Error('AI API Key is missing. Configure AI_API_KEY or OPENAI_API_KEY in .env.');
    }

    try {
      const response = await axios.post(
        `${this.apiBase}/chat/completions`,
        {
          model: this.model,
          messages,
          temperature,
          max_tokens: maxTokens
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );

      const choice = response.data.choices?.[0];
      const text = choice?.message?.content || '';
      const tokensUsed = response.data.usage?.total_tokens || 100;

      return {
        text: text.trim(),
        tokensUsed,
        confidence: 0.95
      };
    } catch (err) {
      const errMsg = err.response?.data?.error?.message || err.message;
      throw new Error(`OpenAI Provider error: ${errMsg}`);
    }
  }
}

module.exports = OpenAIProvider;
