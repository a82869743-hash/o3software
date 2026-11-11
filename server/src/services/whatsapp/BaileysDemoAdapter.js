/**
 * BaileysDemoAdapter.js — Isolated Unofficial WhatsApp Web Adapter (DEMO MODE ONLY)
 * Strictly governed by Demo Mode Safeguards to eliminate account ban risks.
 */

const fs = require('fs');
const path = require('path');
const IWhatsAppProvider = require('./IWhatsAppProvider');
const pool = require('../../config/db');

class BaileysDemoAdapter extends IWhatsAppProvider {
  constructor() {
    super();
    this.sessionDir = path.join(__dirname, '..', '..', '..', 'sessions', 'whatsapp');
  }

  getProviderName() {
    return 'baileys_demo';
  }

  /**
   * Check if Demo Mode is explicitly enabled
   */
  isDemoEnabled() {
    const isExplicitlyEnabled = process.env.ENABLE_BAILEYS_DEMO === 'true';
    if (process.env.NODE_ENV === 'production' && !isExplicitlyEnabled) {
      return false;
    }
    return isExplicitlyEnabled;
  }

  /**
   * Check if phone is in allowed demo whitelist
   */
  async isPhoneWhitelisted(phone, franchiseId = 1) {
    // DEMO_WHITELIST=* → anyone (the studio's interim live use: replies to every customer who writes in)
    if ((process.env.DEMO_WHITELIST || '').trim() === '*') return true;

    // 1. Env whitelist
    const envWhitelist = (process.env.DEMO_WHITELIST || '').split(',').map(p => p.trim().replace(/\D/g, '')).filter(Boolean);

    // 2. Franchise DB whitelist
    let dbWhitelist = [];
    try {
      const [rows] = await pool.query(
        'SELECT demo_whitelist FROM franchise_whatsapp_settings WHERE franchise_id = ?',
        [franchiseId]
      );
      if (rows.length && rows[0].demo_whitelist) {
        dbWhitelist = rows[0].demo_whitelist.split(',').map(p => p.trim().replace(/\D/g, '')).filter(Boolean);
      }
    } catch (_) {}

    const fullWhitelist = new Set([...envWhitelist, ...dbWhitelist]);
    if (fullWhitelist.size === 0) {
      // If no whitelist is configured, allow ONLY the admin WhatsApp number
      const adminPhone = (process.env.ADMIN_WHATSAPP_NUMBER || '').replace(/\D/g, '');
      if (adminPhone) fullWhitelist.add(adminPhone);
    }

    const cleanRecipient = phone.replace(/\D/g, '');
    const cleanLast10 = cleanRecipient.slice(-10);

    for (const allowed of fullWhitelist) {
      if (allowed === cleanRecipient || allowed.slice(-10) === cleanLast10) {
        return true;
      }
    }

    return false;
  }

  async healthCheck(franchiseId = 1) {
    if (!this.isDemoEnabled()) {
      return {
        status: 'disconnected',
        details: {
          enabled: false,
          reason: 'Baileys Demo Mode is disabled by default. Set ENABLE_BAILEYS_DEMO=true to enable for client presentation.'
        }
      };
    }

    try {
      const baileys = require('../whatsappBaileys');
      const status = baileys.getStatus();
      return {
        status: status.connected ? 'demo_active' : 'disconnected',
        details: {
          enabled: true,
          connectionState: status.state,
          phone: status.phone,
          sessionExists: fs.existsSync(this.sessionDir)
        }
      };
    } catch (err) {
      return {
        status: 'disconnected',
        details: { error: err.message }
      };
    }
  }

  async sendTemplate({ to, templateName, components = [], category = 'utility', franchiseId = 1 }) {
    if (!this.isDemoEnabled()) {
      throw new Error('Baileys Demo Mode is disabled. Enable ENABLE_BAILEYS_DEMO=true in .env to use demo client.');
    }

    const whitelisted = await this.isPhoneWhitelisted(to, franchiseId);
    if (!whitelisted) {
      throw new Error(`[DEMO MODE SAFEGUARD] Sending blocked to non-whitelisted number (+${to}). Add number to whitelist in Settings.`);
    }

    const baileys = require('../whatsappBaileys');
    if (!baileys.isConnected()) {
      throw new Error('Baileys WhatsApp Demo is not connected. Scan QR code in Admin Settings first.');
    }

    // Render template text from components or name
    const bodyText = `[Demo] Template: ${templateName}\n${components.map(c => typeof c === 'object' ? JSON.stringify(c) : c).join(' ')}`;
    const result = await baileys.sendText(to, bodyText);

    return {
      success: true,
      messageId: `baileys_${Date.now()}`,
      provider: 'baileys_demo',
      rawResponse: result
    };
  }

  async sendFreeForm({ to, text, franchiseId = 1 }) {
    if (!this.isDemoEnabled()) {
      throw new Error('Baileys Demo Mode is disabled.');
    }

    const whitelisted = await this.isPhoneWhitelisted(to, franchiseId);
    if (!whitelisted) {
      throw new Error(`[DEMO MODE SAFEGUARD] Sending blocked to non-whitelisted number (+${to}).`);
    }

    const baileys = require('../whatsappBaileys');
    if (!baileys.isConnected()) {
      throw new Error('Baileys WhatsApp Demo is not connected. Please scan QR in Admin panel.');
    }

    const result = await baileys.sendText(to, text);
    return {
      success: true,
      messageId: `baileys_${Date.now()}`,
      provider: 'baileys_demo',
      rawResponse: result
    };
  }

  async sendMedia({ to, mediaUrl, mediaPath, filename, caption = '', type = 'document', franchiseId = 1 }) {
    if (!this.isDemoEnabled()) {
      throw new Error('Baileys Demo Mode is disabled.');
    }

    const whitelisted = await this.isPhoneWhitelisted(to, franchiseId);
    if (!whitelisted) {
      throw new Error(`[DEMO MODE SAFEGUARD] Sending blocked to non-whitelisted number (+${to}).`);
    }

    const baileys = require('../whatsappBaileys');
    if (!baileys.isConnected()) {
      throw new Error('Baileys WhatsApp Demo is not connected.');
    }

    // Use local media path if exists, otherwise fallback to URL
    const targetPath = mediaPath && fs.existsSync(mediaPath) ? mediaPath : mediaUrl;
    const result = await baileys.sendDocumentFromPath(to, targetPath, filename, caption);

    return {
      success: true,
      messageId: `baileys_${Date.now()}`,
      provider: 'baileys_demo',
      rawResponse: result
    };
  }

  async handleWebhook(req, res) {
    // Baileys receives events over persistent WebSocket rather than HTTP webhooks
    return {
      handled: true,
      message: 'Baileys runs stateful WebSocket listeners directly.'
    };
  }

  /**
   * Disconnect and permanently wipe session credentials from disk
   */
  async disconnectAndWipeSession() {
    try {
      const baileys = require('../whatsappBaileys');
      await baileys.logout().catch(() => {});
    } catch (_) {}

    if (fs.existsSync(this.sessionDir)) {
      fs.rmSync(this.sessionDir, { recursive: true, force: true });
    }

    console.log('[BaileysDemoAdapter] Session completely purged from local storage.');
    return { success: true, message: 'Session disconnected and wiped successfully.' };
  }
}

module.exports = BaileysDemoAdapter;
