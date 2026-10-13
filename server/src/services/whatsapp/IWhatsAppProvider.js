/**
 * IWhatsAppProvider.js — Common Contract for WhatsApp Adapters
 * All WhatsApp providers (Meta Cloud, AiSensy, Baileys Demo, Mock) must implement this interface.
 */

class IWhatsAppProvider {
  /**
   * Provider identifier
   * @returns {'meta_cloud' | 'aisensy' | 'baileys_demo' | 'mock'}
   */
  getProviderName() {
    throw new Error('getProviderName() must be implemented');
  }

  /**
   * Health & connectivity status check
   * @param {number} franchiseId
   * @returns {Promise<{ status: 'connected' | 'disconnected' | 'ready' | 'demo_active', details: any }>}
   */
  async healthCheck(franchiseId) {
    throw new Error('healthCheck() must be implemented');
  }

  /**
   * Send pre-approved Template message (Marketing, Utility, Authentication)
   * @param {Object} options
   * @param {string} options.to - Recipient phone in E.164 format (e.g. '919876543210')
   * @param {string} options.templateName - Template identifier approved by provider/Meta
   * @param {string} [options.languageCode='en'] - Language code (e.g. 'en', 'gu', 'hi')
   * @param {Array<any>} [options.components=[]] - Dynamic parameters / body variables
   * @param {string} [options.category='utility'] - 'utility' | 'marketing' | 'authentication'
   * @param {number} [options.franchiseId=1]
   * @returns {Promise<{ success: boolean, messageId: string, provider: string, rawResponse?: any }>}
   */
  async sendTemplate(options) {
    throw new Error('sendTemplate() must be implemented');
  }

  /**
   * Send free-form text message (Permitted ONLY inside open 24-hour service window)
   * @param {Object} options
   * @param {string} options.to - Recipient phone in E.164
   * @param {string} options.text - Free-form message body
   * @param {number} [options.franchiseId=1]
   * @returns {Promise<{ success: boolean, messageId: string, provider: string }>}
   */
  async sendFreeForm(options) {
    throw new Error('sendFreeForm() must be implemented');
  }

  /**
   * Send document / media (PDF invoices, warranties, job photos)
   * @param {Object} options
   * @param {string} options.to - Recipient phone
   * @param {string} options.mediaUrl - Public or local URL of the media file
   * @param {string} [options.mediaPath] - Local filesystem path if applicable
   * @param {string} options.filename - Display filename (e.g. 'Invoice_101.pdf')
   * @param {string} [options.caption] - Accompanying caption
   * @param {'document' | 'image'} [options.type='document']
   * @param {number} [options.franchiseId=1]
   * @returns {Promise<{ success: boolean, messageId: string, provider: string }>}
   */
  async sendMedia(options) {
    throw new Error('sendMedia() must be implemented');
  }

  /**
   * Handle incoming HTTP webhook event (Inbound chats, delivery receipts, read statuses)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<{ handled: boolean, eventType?: string, payload?: any }>}
   */
  async handleWebhook(req, res) {
    throw new Error('handleWebhook() must be implemented');
  }
}

module.exports = IWhatsAppProvider;
