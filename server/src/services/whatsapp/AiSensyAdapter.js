/**
 * AiSensyAdapter.js — Official AiSensy BSP Adapter
 * Implements AiSensy Campaign & Live Chat REST APIs for teams using the AiSensy portal.
 */

const axios = require('axios');
const IWhatsAppProvider = require('./IWhatsAppProvider');
const pool = require('../../config/db');
const { decrypt } = require('../../utils/cryptoUtil');

const AISENSY_API_BASE = 'https://backend.aisensy.com';

class AiSensyAdapter extends IWhatsAppProvider {
  getProviderName() {
    return 'aisensy';
  }

  async getCredentials(franchiseId = 1) {
    try {
      const [rows] = await pool.query(
        'SELECT aisensy_api_key_encrypted, is_enabled FROM franchise_whatsapp_settings WHERE franchise_id = ?',
        [franchiseId]
      );
      if (rows.length && rows[0].is_enabled && rows[0].aisensy_api_key_encrypted) {
        return {
          apiKey: decrypt(rows[0].aisensy_api_key_encrypted)
        };
      }
    } catch (_) {}

    return {
      apiKey: process.env.AISENSY_API_KEY || ''
    };
  }

  async healthCheck(franchiseId = 1) {
    const creds = await this.getCredentials(franchiseId);
    if (!creds.apiKey) {
      return {
        status: 'disconnected',
        details: {
          configured: false,
          error: 'AiSensy API key missing (AISENSY_API_KEY not configured).'
        }
      };
    }

    return {
      status: 'connected',
      details: {
        configured: true,
        provider: 'AiSensy BSP',
        endpoint: AISENSY_API_BASE
      }
    };
  }

  async sendTemplate({ to, templateName, components = [], franchiseId = 1 }) {
    const creds = await this.getCredentials(franchiseId);
    if (!creds.apiKey) {
      throw new Error('AiSensy API key is not configured for this franchise.');
    }

    let cleanPhone = to.replace(/\D/g, '');
    if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;

    const payload = {
      apiKey: creds.apiKey,
      campaignName: templateName,
      destination: cleanPhone,
      userName: 'Valued Customer',
      templateParams: Array.isArray(components) ? components.map(c => String(c)) : []
    };

    try {
      const res = await axios.post(`${AISENSY_API_BASE}/campaign/t1/api/v2`, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });

      const messageId = res.data?.messageId || `aisensy_${Date.now()}`;
      return {
        success: true,
        messageId,
        provider: 'aisensy',
        rawResponse: res.data
      };
    } catch (err) {
      const errorMsg = err.response?.data?.message || err.message;
      throw new Error(`AiSensy sendTemplate error: ${errorMsg}`);
    }
  }

  async sendFreeForm({ to, text, franchiseId = 1 }) {
    const creds = await this.getCredentials(franchiseId);
    if (!creds.apiKey) {
      throw new Error('AiSensy API key is not configured.');
    }

    let cleanPhone = to.replace(/\D/g, '');
    if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;

    // Send via live chat message endpoint
    try {
      const res = await axios.post(`${AISENSY_API_BASE}/live-chat/api/v1/send-message`, {
        apiKey: creds.apiKey,
        destination: cleanPhone,
        message: text
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });

      return {
        success: true,
        messageId: res.data?.messageId || `aisensy_${Date.now()}`,
        provider: 'aisensy',
        rawResponse: res.data
      };
    } catch (err) {
      const errorMsg = err.response?.data?.message || err.message;
      throw new Error(`AiSensy sendFreeForm error: ${errorMsg}`);
    }
  }

  async sendMedia({ to, mediaUrl, filename, caption = '', franchiseId = 1 }) {
    const creds = await this.getCredentials(franchiseId);
    if (!creds.apiKey) {
      throw new Error('AiSensy API key is not configured.');
    }

    let cleanPhone = to.replace(/\D/g, '');
    if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;

    try {
      const res = await axios.post(`${AISENSY_API_BASE}/campaign/t1/api/v2`, {
        apiKey: creds.apiKey,
        campaignName: 'DOCUMENT_SHARE',
        destination: cleanPhone,
        media: {
          url: mediaUrl,
          filename: filename || 'Attachment.pdf'
        }
      }, { timeout: 12000 });

      return {
        success: true,
        messageId: res.data?.messageId || `aisensy_${Date.now()}`,
        provider: 'aisensy',
        rawResponse: res.data
      };
    } catch (err) {
      const errorMsg = err.response?.data?.message || err.message;
      throw new Error(`AiSensy sendMedia error: ${errorMsg}`);
    }
  }

  async handleWebhook(req, res) {
    return {
      handled: true,
      provider: 'aisensy',
      body: req.body
    };
  }
}

module.exports = AiSensyAdapter;
