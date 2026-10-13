/**
 * MockAdapter.js — High-fidelity in-memory WhatsApp provider for automated tests and sandbox
 */
const IWhatsAppProvider = require('./IWhatsAppProvider');

class MockAdapter extends IWhatsAppProvider {
  constructor() {
    super();
    this.sentMessages = [];
  }

  getProviderName() {
    return 'mock';
  }

  async healthCheck() {
    return {
      status: 'ready',
      details: {
        mode: 'mock',
        sentCount: this.sentMessages.length,
        timestamp: new Date().toISOString()
      }
    };
  }

  async sendTemplate({ to, templateName, languageCode = 'en', components = [], category = 'utility', franchiseId = 1 }) {
    const messageId = `mock_tpl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const record = {
      messageId,
      to,
      type: 'template',
      templateName,
      languageCode,
      components,
      category,
      franchiseId,
      timestamp: new Date()
    };
    this.sentMessages.push(record);

    return {
      success: true,
      messageId,
      provider: 'mock',
      rawResponse: { status: 'mock_sent', messageId }
    };
  }

  async sendFreeForm({ to, text, franchiseId = 1 }) {
    const messageId = `mock_txt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const record = {
      messageId,
      to,
      type: 'free_form',
      text,
      franchiseId,
      timestamp: new Date()
    };
    this.sentMessages.push(record);

    return {
      success: true,
      messageId,
      provider: 'mock',
      rawResponse: { status: 'mock_sent', messageId }
    };
  }

  async sendMedia({ to, mediaUrl, mediaPath, filename, caption, type = 'document', franchiseId = 1 }) {
    const messageId = `mock_media_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const record = {
      messageId,
      to,
      type,
      mediaUrl,
      mediaPath,
      filename,
      caption,
      franchiseId,
      timestamp: new Date()
    };
    this.sentMessages.push(record);

    return {
      success: true,
      messageId,
      provider: 'mock',
      rawResponse: { status: 'mock_sent', messageId }
    };
  }

  async handleWebhook(req, res) {
    return {
      handled: true,
      eventType: 'mock_webhook',
      payload: req.body
    };
  }

  getSentMessages() {
    return [...this.sentMessages];
  }

  clearSentMessages() {
    this.sentMessages = [];
  }
}

module.exports = MockAdapter;
