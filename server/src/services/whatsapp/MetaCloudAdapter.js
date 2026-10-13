/**
 * MetaCloudAdapter.js — Official WhatsApp Business Cloud API Adapter (Graph API v20.0)
 * Handles template sending, 24-hour customer care window validation, media attachments, and secure webhooks.
 */

const axios = require('axios');
const crypto = require('crypto');
const IWhatsAppProvider = require('./IWhatsAppProvider');
const pool = require('../../config/db');
const { decrypt } = require('../../utils/cryptoUtil');

const GRAPH_API_BASE = 'https://graph.facebook.com/v20.0';

// Official Meta pricing rate card for India (+91)
const META_RATES_INR = {
  marketing: 0.8631,
  utility: 0.1150,
  authentication: 0.1150,
  service: 0.1150
};

class MetaCloudAdapter extends IWhatsAppProvider {
  getProviderName() {
    return 'meta_cloud';
  }

  /**
   * Retrieve active credentials for a franchise (per-franchise DB settings or env fallback)
   */
  async getCredentials(franchiseId = 1) {
    try {
      const [rows] = await pool.query(
        'SELECT phone_number_id, business_account_id, access_token_encrypted, webhook_verify_token, is_enabled FROM franchise_whatsapp_settings WHERE franchise_id = ?',
        [franchiseId]
      );

      if (rows.length && rows[0].is_enabled && rows[0].phone_number_id && rows[0].access_token_encrypted) {
        return {
          phoneNumberId: rows[0].phone_number_id,
          businessAccountId: rows[0].business_account_id,
          accessToken: decrypt(rows[0].access_token_encrypted),
          verifyToken: rows[0].webhook_verify_token || process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
        };
      }
    } catch (_) {}

    // Fallback to global environment variables
    return {
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
      businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
      verifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'O3_SPAA_WEBHOOK_VERIFY'
    };
  }

  async healthCheck(franchiseId = 1) {
    const creds = await this.getCredentials(franchiseId);
    if (!creds.accessToken || !creds.phoneNumberId) {
      return {
        status: 'disconnected',
        details: {
          configured: false,
          error: 'Meta Cloud API credentials missing (WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID unset).'
        }
      };
    }

    try {
      // Query Meta Graph API for phone number status
      const res = await axios.get(`${GRAPH_API_BASE}/${creds.phoneNumberId}`, {
        headers: { Authorization: `Bearer ${creds.accessToken}` },
        params: { fields: 'verified_name,code_verification_status,display_phone_number,quality_rating' },
        timeout: 5000
      });

      return {
        status: 'connected',
        details: {
          configured: true,
          displayPhoneNumber: res.data.display_phone_number,
          verifiedName: res.data.verified_name,
          qualityRating: res.data.quality_rating
        }
      };
    } catch (err) {
      return {
        status: 'disconnected',
        details: {
          configured: true,
          error: err.response?.data?.error?.message || err.message
        }
      };
    }
  }

  /**
   * Send Template Message (Utility / Marketing)
   */
  async sendTemplate({ to, templateName, languageCode = 'en', components = [], category = 'utility', franchiseId = 1 }) {
    const creds = await this.getCredentials(franchiseId);
    if (!creds.accessToken || !creds.phoneNumberId) {
      throw new Error('Meta Cloud API credentials are not configured for this franchise.');
    }

    let cleanPhone = to.replace(/\D/g, '');
    if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanPhone,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components: components.length ? components : undefined
      }
    };

    try {
      const res = await axios.post(`${GRAPH_API_BASE}/${creds.phoneNumberId}/messages`, payload, {
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      const messageId = res.data.messages?.[0]?.id || `meta_${Date.now()}`;
      const estimatedCost = META_RATES_INR[category.toLowerCase()] || 0.1150;

      // Log usage for billing
      await this.logUsage({
        franchiseId,
        messageId,
        recipientPhone: cleanPhone,
        category,
        direction: 'outbound',
        estimatedCost,
        status: 'sent'
      });

      return {
        success: true,
        messageId,
        provider: 'meta_cloud',
        rawResponse: res.data
      };
    } catch (err) {
      const errorMsg = err.response?.data?.error?.message || err.message;
      throw new Error(`Meta Cloud API sendTemplate error: ${errorMsg}`);
    }
  }

  /**
   * Send Free-form text (Enforces 24-hour service window check)
   */
  async sendFreeForm({ to, text, franchiseId = 1 }) {
    let cleanPhone = to.replace(/\D/g, '');
    if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;

    // ─── 24-Hour Window Validation ─────────────────────────
    const windowValid = await this.isWindowActive(cleanPhone, franchiseId);
    if (!windowValid) {
      throw new Error('Customer service window is closed (>24h since last incoming message). Send an approved template message to re-engage.');
    }

    const creds = await this.getCredentials(franchiseId);
    if (!creds.accessToken || !creds.phoneNumberId) {
      throw new Error('Meta Cloud API credentials are not configured.');
    }

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanPhone,
      type: 'text',
      text: { body: text }
    };

    try {
      const res = await axios.post(`${GRAPH_API_BASE}/${creds.phoneNumberId}/messages`, payload, {
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      const messageId = res.data.messages?.[0]?.id || `meta_${Date.now()}`;

      await this.logUsage({
        franchiseId,
        messageId,
        recipientPhone: cleanPhone,
        category: 'service',
        direction: 'outbound',
        estimatedCost: META_RATES_INR.service,
        status: 'sent'
      });

      return {
        success: true,
        messageId,
        provider: 'meta_cloud',
        rawResponse: res.data
      };
    } catch (err) {
      const errorMsg = err.response?.data?.error?.message || err.message;
      throw new Error(`Meta Cloud API sendFreeForm error: ${errorMsg}`);
    }
  }

  /**
   * Send Media (PDF Invoices, Warranties)
   */
  async sendMedia({ to, mediaUrl, filename, caption = '', type = 'document', franchiseId = 1 }) {
    const creds = await this.getCredentials(franchiseId);
    if (!creds.accessToken || !creds.phoneNumberId) {
      throw new Error('Meta Cloud API credentials are not configured.');
    }

    let cleanPhone = to.replace(/\D/g, '');
    if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanPhone,
      type: type === 'image' ? 'image' : 'document',
      [type === 'image' ? 'image' : 'document']: {
        link: mediaUrl,
        filename: filename || 'Document.pdf',
        caption: caption || undefined
      }
    };

    try {
      const res = await axios.post(`${GRAPH_API_BASE}/${creds.phoneNumberId}/messages`, payload, {
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      });

      const messageId = res.data.messages?.[0]?.id || `meta_${Date.now()}`;

      await this.logUsage({
        franchiseId,
        messageId,
        recipientPhone: cleanPhone,
        category: 'utility',
        direction: 'outbound',
        estimatedCost: META_RATES_INR.utility,
        status: 'sent'
      });

      return {
        success: true,
        messageId,
        provider: 'meta_cloud',
        rawResponse: res.data
      };
    } catch (err) {
      const errorMsg = err.response?.data?.error?.message || err.message;
      throw new Error(`Meta Cloud API sendMedia error: ${errorMsg}`);
    }
  }

  /**
   * Check if 24-hour window is active for a customer
   */
  async isWindowActive(phone, franchiseId = 1) {
    try {
      const [rows] = await pool.query(
        'SELECT window_expires_at FROM whatsapp_conversations WHERE phone = ? AND franchise_id = ?',
        [phone, franchiseId]
      );
      if (rows.length && rows[0].window_expires_at) {
        return new Date(rows[0].window_expires_at) > new Date();
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  /**
   * Log WhatsApp conversation usage and cost
   */
  async logUsage({ franchiseId, messageId, recipientPhone, category, direction, estimatedCost, status }) {
    try {
      await pool.query(
        `INSERT INTO whatsapp_usage_logs (franchise_id, message_id, recipient_phone, provider, category, direction, estimated_cost, status)
         VALUES (?, ?, ?, 'meta_cloud', ?, ?, ?, ?)`,
        [franchiseId, messageId, recipientPhone, category, direction, estimatedCost, status]
      );
    } catch (err) {
      console.warn('[MetaCloudAdapter] logUsage error:', err.message);
    }
  }

  /**
   * Handle Webhook events (GET challenge verification & POST message ingestion)
   */
  async handleWebhook(req, res) {
    // 1. Webhook Challenge Verification (GET)
    if (req.method === 'GET') {
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];

      const creds = await this.getCredentials(1);
      if (mode === 'subscribe' && token === creds.verifyToken) {
        console.log('[MetaCloudAdapter] ✅ Webhook verified successfully.');
        return res.status(200).send(challenge);
      }
      return res.status(403).send('Forbidden: Invalid verify token');
    }

    // 2. Incoming Notification Events (POST)
    const body = req.body;
    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          const value = change.value;
          if (!value) continue;

          // Delivery / Read Status Updates
          if (value.statuses) {
            for (const statusObj of value.statuses) {
              await this.handleStatusUpdate(statusObj);
            }
          }

          // Inbound Customer Messages
          if (value.messages) {
            for (const msg of value.messages) {
              await this.handleInboundMessage(msg, value.metadata);
            }
          }
        }
      }
      return res.status(200).json({ status: 'EVENT_RECEIVED' });
    }

    return res.status(404).json({ error: 'Not a whatsapp_business_account event' });
  }

  async handleStatusUpdate(statusObj) {
    try {
      const { id, status, recipient_id } = statusObj;
      await pool.query(
        'UPDATE whatsapp_usage_logs SET status = ? WHERE message_id = ?',
        [status, id]
      );
      await pool.query(
        'UPDATE v2_notification_logs SET status = ? WHERE response_data LIKE ?',
        [status, `%${id}%`]
      );
    } catch (_) {}
  }

  async handleInboundMessage(msg, metadata) {
    try {
      const from = msg.from; // Customer phone (e.g. 919876543210)
      const text = msg.text?.body?.trim() || '';
      if (!text) return;

      const leadsAgentService = require('../ai/LeadsAgentService');
      await leadsAgentService.processInboundMessage({
        phone: from,
        text,
        franchiseId: 1
      });
    } catch (err) {
      console.error('[MetaCloudAdapter] Inbound message handling error:', err.message);
    }
  }
}

module.exports = MetaCloudAdapter;
