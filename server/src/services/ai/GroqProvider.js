/**
 * GroqProvider.js — Groq (free tier) chat model for the WhatsApp + leads AI agent.
 * Groq speaks the OpenAI chat format, so this reuses OpenAIProvider with Groq's address and key.
 *
 *   GROQ_API_KEY=gsk_...                 (console.groq.com → API keys)
 *   GROQ_MODEL=openai/gpt-oss-120b       (default; free tier ≈ 30 replies/min, 1,000/day)
 *   GROQ_REASONING_EFFORT=low            (low | medium | high — short replies need low)
 *   GROQ_FALLBACK_MODELS=openai/gpt-oss-20b,qwen/qwen3.8-27b
 *       Each Groq model has its own free per-minute and per-day limit, so when one is busy the next is tried.
 *
 * When Groq fails or the free limit is hit, LLMManager answers with the studio's own rule-based agent.
 */
const OpenAIProvider = require('./OpenAIProvider');

const DEFAULT_MODEL = 'openai/gpt-oss-120b';
const DEFAULT_FALLBACKS = 'openai/gpt-oss-20b,qwen/qwen3.8-27b';

class GroqProvider extends OpenAIProvider {
  getProviderName() {
    return 'groq';
  }

  keyName() {
    return 'GROQ_API_KEY';
  }

  config() {
    return {
      apiKey: process.env.GROQ_API_KEY || '',
      model: process.env.GROQ_MODEL || DEFAULT_MODEL,
      apiBase: 'https://api.groq.com/openai/v1',
      effort: ['low', 'medium', 'high'].includes(process.env.GROQ_REASONING_EFFORT) ? process.env.GROQ_REASONING_EFFORT : 'low',
    };
  }

  buildBody({ model, messages, effort, temperature, maxTokens }) {
    // gpt-oss models think before answering: leave room for that, and keep the thinking out of the reply
    if (/gpt-oss/i.test(model)) {
      // Groq counts the requested max tokens against the free per-minute limit, so ask for no more than needed
      return { model, messages, reasoning_effort: effort, include_reasoning: false, max_completion_tokens: maxTokens + 400 };
    }
    // Qwen also thinks first: hide the thinking so only the answer comes back
    if (/qwen/i.test(model)) return { model, messages, temperature, reasoning_format: 'hidden', max_completion_tokens: maxTokens + 600 };
    return { model, messages, temperature, max_completion_tokens: maxTokens };
  }

  async generateResponse(options) {
    const models = [this.config().model, ...(process.env.GROQ_FALLBACK_MODELS ?? DEFAULT_FALLBACKS).split(',').map(m => m.trim()).filter(Boolean)];
    let lastErr;
    for (const model of [...new Set(models)]) {
      try {
        return await super.generateResponse({ ...options, model });
      } catch (err) {
        lastErr = err;
        if (!/rate limit|429|over capacity|503|decommissioned|does not exist/i.test(err.message)) break; // a real error: don't hide it
      }
    }
    throw lastErr;
  }
}

GroqProvider.DEFAULT_MODEL = DEFAULT_MODEL;
module.exports = GroqProvider;
