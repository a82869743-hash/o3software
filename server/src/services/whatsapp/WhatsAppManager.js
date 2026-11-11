/**
 * WhatsAppManager.js — Central WhatsApp Provider Factory & Governance Router
 * Enforces:
 * - Provider resolution (Meta Cloud primary, Baileys Demo gated, AiSensy, Mock)
 * - Opt-out enforcement (blocks send to customers who texted STOP)
 * - Per-franchise multi-number configuration
 * - Audited cutover and demo session wiping
 */

const pool = require('../../config/db');
const { encrypt } = require('../../utils/cryptoUtil');
const MetaCloudAdapter = require('./MetaCloudAdapter');
const AiSensyAdapter = require('./AiSensyAdapter');
const BaileysDemoAdapter = require('./BaileysDemoAdapter');
const MockAdapter = require('./MockAdapter');

class WhatsAppManager {
  constructor() {
    this.adapters = {
      meta_cloud: new MetaCloudAdapter(),
      aisensy: new AiSensyAdapter(),
      baileys_demo: new BaileysDemoAdapter(),
      mock: new MockAdapter()
    };
  }

  setOverrideProvider(provider) {
    this.overrideProvider = provider;
  }

  /**
   * Determine the active provider for a given franchise
   * @param {number} franchiseId
   * @returns {Promise<IWhatsAppProvider>}
   */
  async getAdapter(franchiseId = 1) {
    if (this.overrideProvider && this.adapters[this.overrideProvider]) {
      return this.adapters[this.overrideProvider];
    }

    let providerName = process.env.WHATSAPP_PROVIDER || 'meta_cloud';

    try {
      const [rows] = await pool.query(
        'SELECT provider, is_enabled FROM franchise_whatsapp_settings WHERE franchise_id = ?',
        [franchiseId]
      );
      if (rows.length && rows[0].is_enabled && rows[0].provider) {
        providerName = rows[0].provider;
      }
    } catch (_) {}

    // Safeguard: If Baileys Demo is requested but flag is disabled, force fallback to meta_cloud or mock
    if (providerName === 'baileys_demo') {
      const isDemoAllowed = process.env.ENABLE_BAILEYS_DEMO === 'true';
      if (!isDemoAllowed) {
        console.warn(`[WhatsAppManager] Baileys Demo requested for Franchise #${franchiseId} but ENABLE_BAILEYS_DEMO is not true. Falling back to meta_cloud.`);
        providerName = 'meta_cloud';
      }
    }

    const adapter = this.adapters[providerName] || this.adapters.meta_cloud;
    return adapter;
  }

  /**
   * Check if a recipient has opted out (STOP)
   */
  async isOptedOut(phone) {
    if (!phone) return false;
    let clean = phone.replace(/\D/g, '');
    const cleanLast10 = clean.slice(-10);

    try {
      const [rows] = await pool.query(
        'SELECT id FROM whatsapp_opt_outs WHERE phone LIKE ? OR phone LIKE ?',
        [`%${cleanLast10}`, clean]
      );
      return rows.length > 0;
    } catch (_) {
      return false;
    }
  }

  /**
   * Customers may use a different WhatsApp number than their login mobile — deliver there.
   * Keeps the caller's country-code prefix (e.g. 91XXXXXXXXXX).
   */
  async resolveTo(to) {
    const digits = String(to || '').replace(/\D/g, '');
    if (digits.length < 10) return to;
    const last10 = digits.slice(-10);
    try {
      const [[u]] = await pool.query(
        "SELECT whatsapp_number FROM users WHERE mobile = ? AND whatsapp_number IS NOT NULL AND whatsapp_number <> '' LIMIT 1", [last10]);
      if (u && u.whatsapp_number && u.whatsapp_number !== last10) return digits.slice(0, -10) + u.whatsapp_number;
    } catch (_) { /* fall back to the given number */ }
    return to;
  }

  /**
   * Universal Send Template method
   */
  async sendTemplate(options) {
    options = { ...options, to: await this.resolveTo(options.to) };
    const { to, franchiseId = 1 } = options;

    // 1. Opt-out enforcement
    if (await this.isOptedOut(to)) {
      console.log(`[WhatsAppManager] 🛑 Suppressed message to opted-out recipient: +${to}`);
      return {
        success: false,
        opted_out: true,
        error: 'Message suppressed: Customer has opted out of WhatsApp messages.'
      };
    }

    // 2. Resolve adapter & dispatch
    const adapter = await this.getAdapter(franchiseId);
    return await adapter.sendTemplate(options);
  }

  /**
   * Universal Send Free-Form (24-hour care window aware)
   */
  /** Business-initiated text: uses the provider's smart path (template outside the 24h window) when available. */
  async sendText(options) {
    const { limitEmojis } = require('../../utils/humanizer');
    // WhatsApp bold is *text*; AI replies sometimes use markdown **text**, which shows the stars
    const waText = (t) => limitEmojis(String(t).replace(/\*\*(.+?)\*\*/g, '*$1*').replace(/__(.+?)__/g, '_$1_'));
    options = { ...options, to: await this.resolveTo(options.to), ...(options.text ? { text: waText(options.text) } : {}) };
    const { to, franchiseId = 1 } = options;
    if (await this.isOptedOut(to)) {
      return { success: false, opted_out: true, error: 'Message suppressed: Customer has opted out of WhatsApp messages.' };
    }
    const adapter = await this.getAdapter(franchiseId);
    if (typeof adapter.sendSmart === 'function') return adapter.sendSmart(options);
    return adapter.sendFreeForm(options);
  }

  async sendFreeForm(options) {
    const { limitEmojis } = require('../../utils/humanizer');
    // WhatsApp bold is *text*; AI replies sometimes use markdown **text**, which shows the stars
    const waText = (t) => limitEmojis(String(t).replace(/\*\*(.+?)\*\*/g, '*$1*').replace(/__(.+?)__/g, '_$1_'));
    options = { ...options, to: await this.resolveTo(options.to), ...(options.text ? { text: waText(options.text) } : {}) };
    const { to, franchiseId = 1 } = options;

    if (await this.isOptedOut(to)) {
      return {
        success: false,
        opted_out: true,
        error: 'Message suppressed: Customer has opted out of WhatsApp messages.'
      };
    }

    const adapter = await this.getAdapter(franchiseId);
    return await adapter.sendFreeForm(options);
  }

  /**
   * Universal Send Media
   */
  async sendMedia(options) {
    options = { ...options, to: await this.resolveTo(options.to) };
    const { to, franchiseId = 1 } = options;

    if (await this.isOptedOut(to)) {
      return {
        success: false,
        opted_out: true,
        error: 'Message suppressed: Customer has opted out of WhatsApp messages.'
      };
    }

    const adapter = await this.getAdapter(franchiseId);
    return await adapter.sendMedia(options);
  }

  /**
   * Get overall provider health & status for a franchise
   */
  async healthCheck(franchiseId = 1) {
    const adapter = await this.getAdapter(franchiseId);
    const health = await adapter.healthCheck(franchiseId);
    return {
      provider: adapter.getProviderName(),
      ...health
    };
  }

  /**
   * One-click cutover: update active provider and credentials for a franchise
   */
  async setFranchiseProvider(franchiseId, {
    provider,
    phoneNumber,
    phoneNumberId,
    businessAccountId,
    accessToken,
    aisensyApiKey,
    demoWhitelist,
    isEnabled = 1
  }) {
    const validProviders = ['meta_cloud', 'aisensy', 'baileys_demo', 'mock'];
    if (!validProviders.includes(provider)) {
      throw new Error(`Invalid WhatsApp provider: ${provider}`);
    }

    const accessTokenEncrypted = accessToken ? encrypt(accessToken) : null;
    const aisensyApiKeyEncrypted = aisensyApiKey ? encrypt(aisensyApiKey) : null;

    await pool.query(`
      INSERT INTO franchise_whatsapp_settings (
        franchise_id, provider, phone_number, phone_number_id, business_account_id,
        access_token_encrypted, aisensy_api_key_encrypted, demo_whitelist, is_enabled
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        provider = VALUES(provider),
        phone_number = COALESCE(VALUES(phone_number), phone_number),
        phone_number_id = COALESCE(VALUES(phone_number_id), phone_number_id),
        business_account_id = COALESCE(VALUES(business_account_id), business_account_id),
        access_token_encrypted = COALESCE(VALUES(access_token_encrypted), access_token_encrypted),
        aisensy_api_key_encrypted = COALESCE(VALUES(aisensy_api_key_encrypted), aisensy_api_key_encrypted),
        demo_whitelist = COALESCE(VALUES(demo_whitelist), demo_whitelist),
        is_enabled = VALUES(is_enabled),
        updated_at = NOW()
    `, [
      franchiseId, provider, phoneNumber || null, phoneNumberId || null, businessAccountId || null,
      accessTokenEncrypted, aisensyApiKeyEncrypted, demoWhitelist || null, isEnabled
    ]);

    console.log(`[WhatsAppManager] Franchise #${franchiseId} provider updated to "${provider}"`);
    return { success: true, franchiseId, provider };
  }

  /**
   * Wipe Baileys Demo session completely
   */
  async wipeBaileysSession() {
    const baileysAdapter = this.adapters.baileys_demo;
    return await baileysAdapter.disconnectAndWipeSession();
  }
}

module.exports = new WhatsAppManager();
