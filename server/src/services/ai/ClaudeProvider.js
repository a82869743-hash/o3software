/**
 * ClaudeProvider.js — Anthropic Claude backend for the AI leads agent / WhatsApp auto-reply.
 *
 * Env:
 *   AI_PROVIDER=claude
 *   ANTHROPIC_API_KEY=sk-ant-...
 *   ANTHROPIC_MODEL=claude-opus-5-5   (default; set claude-haiku-5-5 for the lowest cost per reply)
 *   ANTHROPIC_EFFORT=low              (low | medium | high — chat replies need little thinking)
 */
const AnthropicModule = require('@anthropic-ai/sdk');
const ILLMProvider = require('./ILLMProvider');

const Anthropic = AnthropicModule.default || AnthropicModule;

// Models that support the server-side refusal fallback ("default" routing) on the Claude API
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5', 'claude-fable-5-1']);

class ClaudeProvider extends ILLMProvider {
  constructor() {
    super();
    this.client = null;
  }

  getProviderName() {
    return 'claude';
  }

  getClient() {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is missing. Add it to server/.env to enable the Claude leads agent.');
    }
    if (!this.client) this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 30000 });
    return this.client;
  }

  /**
   * @param {{ messages: Array<{role: string, content: string}>, maxTokens?: number }} options
   *   OpenAI-style messages; any `system` entries become the Claude system prompt.
   */
  async generateResponse({ messages, maxTokens = 500 }) {
    const client = this.getClient();
    const model = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';
    const effort = ['low', 'medium', 'high'].includes(process.env.ANTHROPIC_EFFORT) ? process.env.ANTHROPIC_EFFORT : 'low';

    const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
    const convo = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: String(m.content || '') }));
    while (convo.length && convo[0].role !== 'user') convo.shift();
    // current models reject assistant prefill — the request must end on the customer's turn
    while (convo.length && convo[convo.length - 1].role !== 'user') convo.pop();
    if (!convo.length) throw new Error('Claude provider needs at least one user message');

    const params = {
      model,
      // thinking is on for current models; leave room for it plus the short WhatsApp reply
      max_tokens: Math.max(2000, maxTokens * 4),
      // stable prefix (system prompt + knowledge base) is cached between replies
      cache_control: { type: 'ephemeral' },
      system: system || undefined,
      messages: convo,
      output_config: { effort },
    };

    try {
      const useFallback = FALLBACK_MODELS.has(model);
      const response = useFallback
        ? await client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
        : await client.messages.create(params);

      if (response.stop_reason === 'refusal') {
        return { text: '', tokensUsed: response.usage?.output_tokens || 0, confidence: 0, refused: true };
      }
      const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
      const usage = response.usage || {};
      return {
        text,
        tokensUsed: (usage.input_tokens || 0) + (usage.output_tokens || 0) + (usage.cache_read_input_tokens || 0),
        confidence: text ? 0.95 : 0,
      };
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) throw new Error('Claude: invalid ANTHROPIC_API_KEY');
      if (err instanceof Anthropic.RateLimitError) throw new Error('Claude: rate limited — try again shortly');
      if (err instanceof Anthropic.BadRequestError) throw new Error(`Claude: bad request — ${err.message}`);
      if (err instanceof Anthropic.APIError) throw new Error(`Claude API error ${err.status}: ${err.message}`);
      throw new Error(`Claude provider error: ${err.message}`);
    }
  }
}

module.exports = ClaudeProvider;
