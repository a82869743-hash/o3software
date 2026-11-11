/**
 * OpenAIProvider.js — OpenAI (or OpenAI-compatible) chat model for the leads + WhatsApp AI agent.
 *
 *   OPENAI_API_KEY=sk-...            (platform.openai.com → API keys; AI_API_KEY also accepted)
 *   AI_MODEL=gpt-6-luna              (default: OpenAI's latest low-cost model, $0.10 in / $0.50 out per 1M tokens)
 *   AI_REASONING_EFFORT=none         (none | low | medium — short sales replies need none; only for reasoning models)
 *   AI_API_BASE=https://api.openai.com/v1
 */
const axios = require('axios');
const ILLMProvider = require('./ILLMProvider');

const DEFAULT_MODEL = 'gpt-6-luna';
// gpt-5+, gpt-6 and o-series are reasoning models: they take max_completion_tokens + reasoning_effort, not temperature
const isReasoningModel = (m) => /^(gpt-[5-9]|o\d)/i.test(m);

class OpenAIProvider extends ILLMProvider {
  getProviderName() {
    return 'openai';
  }

  // read settings on each call so a key added in .env works after a restart without stale values
  config() {
    return {
      apiKey: process.env.OPENAI_API_KEY || process.env.AI_API_KEY || '',
      model: process.env.AI_MODEL || DEFAULT_MODEL,
      apiBase: (process.env.AI_API_BASE || 'https://api.openai.com/v1').replace(/\/+$/, ''),
      effort: ['none', 'low', 'medium', 'high'].includes(process.env.AI_REASONING_EFFORT) ? process.env.AI_REASONING_EFFORT : 'none',
    };
  }

  keyName() {
    return 'OPENAI_API_KEY';
  }

  buildBody({ model, messages, effort, temperature, maxTokens }) {
    return isReasoningModel(model)
      ? { model, messages, reasoning_effort: effort, max_completion_tokens: effort === 'none' ? maxTokens : Math.max(2000, maxTokens * 4) }
      : { model, messages, temperature, max_tokens: maxTokens };
  }

  async generateResponse({ messages, temperature = 0.3, maxTokens = 500, model: modelOverride }) {
    const { apiKey, model: configuredModel, apiBase, effort } = this.config();
    const model = modelOverride || configuredModel;
    if (!apiKey) throw new Error(`${this.keyName()} is missing. Add it to server/.env to enable the AI agent.`);

    const body = this.buildBody({ model, messages, effort, temperature, maxTokens });
    const post = (b) => axios.post(`${apiBase}/chat/completions`, b, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      timeout: 30000,
    });

    let response;
    try {
      response = await post(body);
    } catch (err) {
      // a model that rejects one of the optional settings: retry once with only the essentials
      const msg = err.response?.data?.error?.message || '';
      if (err.response?.status === 400 && /unsupported|not supported|unrecognized|reasoning_effort|temperature|max_tokens/i.test(msg)) {
        try {
          response = await post({ model, messages, max_completion_tokens: Math.max(2000, maxTokens * 4) });
        } catch (err2) {
          throw new Error(`${this.getProviderName()} error: ${err2.response?.data?.error?.message || err2.message}`);
        }
      } else {
        throw new Error(`${this.getProviderName()} error: ${msg || err.message}`);
      }
    }

    const choice = response.data.choices?.[0];
    const text = (choice?.message?.content || '').trim();
    if (choice?.message?.refusal) return { text: '', tokensUsed: response.data.usage?.total_tokens || 0, confidence: 0, refused: true };
    return {
      text,
      tokensUsed: response.data.usage?.total_tokens || 0,
      confidence: text ? 0.95 : 0,
      model,
    };
  }
}

OpenAIProvider.DEFAULT_MODEL = DEFAULT_MODEL;
module.exports = OpenAIProvider;
