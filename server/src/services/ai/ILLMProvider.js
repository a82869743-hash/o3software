/**
 * ILLMProvider.js — Common interface contract for LLM backends
 */
class ILLMProvider {
  /**
   * @param {Object} options
   * @param {Array<{role: string, content: string}>} options.messages
   * @param {number} [options.temperature=0.3]
   * @param {number} [options.maxTokens=500]
   * @returns {Promise<{ text: string, tokensUsed: number, confidence: number }>}
   */
  async generateResponse(options) {
    throw new Error('generateResponse() must be implemented by subclass.');
  }

  getProviderName() {
    throw new Error('getProviderName() must be implemented by subclass.');
  }
}

module.exports = ILLMProvider;
