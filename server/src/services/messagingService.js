const axios = require('axios');
const pool = require('../config/db');

class MessagingService {
  constructor() {
    this.apiKey = process.env.MSG91_AUTH_KEY;
    this.senderId = process.env.MSG91_SENDER_ID || 'GKAHER';
  }

  /**
   * Send Transactional SMS via 2Factor.in / MSG91
   */
  async sendSMS(mobile, templateId, shortUrl, variables = {}) {
    if (!this.apiKey) {
      console.log(`[MOCK SMS] To: ${mobile} | Variables:`, variables);
      return { success: true, mocked: true };
    }

    const message = variables.content || variables.body || '';
    if (!message) {
      console.error('[SMS] No message content provided');
      return { success: false, error: 'No message content' };
    }

    // Normalize phone to 10 digits
    let cleanedMobile = mobile.replace(/\D/g, '');
    if (cleanedMobile.length > 10) {
      cleanedMobile = cleanedMobile.substring(cleanedMobile.length - 10);
    }

    try {
      const response = await axios.get('https://2factor.in/API/R1/', {
        params: {
          module: 'TRANS_SMS',
          apikey: this.apiKey,
          to: cleanedMobile,
          from: this.senderId,
          msg: message,
        },
        timeout: 10000,
      });

      if (response.data && response.data.Status === 'Success') {
        console.log(`[SMS] SENT — To: ${cleanedMobile} | SessionId: ${response.data.Details}`);
        return { success: true, data: response.data };
      } else {
        console.error(`[SMS] FAILED — To: ${cleanedMobile} | Response:`, response.data);
        return { success: false, error: response.data?.Details || 'SMS send failed' };
      }
    } catch (error) {
      console.error('[SMS] ERROR —', error.response?.data || error.message);
      return { success: false, error: error.response?.data?.Details || error.message };
    }
  }

  /**
   * Send WhatsApp via click-to-chat URL preview (stored in logs)
   */
  async sendWhatsApp(to, templateName, defaultParams = {}) {
    // Generate manual link and log to whatsapp_messages
    let normalized = to.replace(/\D/g, '');
    if (normalized.length === 10) normalized = '91' + normalized;
    
    const messageBody = defaultParams.body || `Template: ${templateName}`;
    const waLink = `https://api.whatsapp.com/send?phone=${normalized}&text=${encodeURIComponent(messageBody)}`;

    try {
      const [result] = await pool.query(
        `INSERT INTO whatsapp_messages (phone, template_name, message_type, message_body, status)
         VALUES (?, ?, 'manual', ?, 'pending')`,
        [normalized, templateName, messageBody]
      );
      return { success: true, id: result.insertId, wa_link: waLink };
    } catch (err) {
      console.error('[sendWhatsApp] Error logging:', err.message);
      return { success: true, wa_link: waLink };
    }
  }

  /**
   * Universal notification helper with SMS fallback and manual WhatsApp prefilled links
   */
  async notify(customerId, eventTrigger, variables = {}, references = {}) {
    const enabled = process.env.MESSAGES_ENABLED !== 'false';
    
    try {
      // 1. Get customer details
      const [users] = await pool.query('SELECT id, name, mobile, opt_out_promotional FROM users WHERE id = ?', [customerId]);
      if (!users.length || !users[0].mobile) {
        console.warn(`[notify] Customer ${customerId} not found or has no mobile`);
        return { success: false, error: 'Customer not found or has no mobile' };
      }
      const customer = users[0];
      const mobile = customer.mobile;
      
      // Check promotional opt-out
      const promotionalEvents = ['PACKAGE_EXPIRY_REMINDER', 'WELCOME_MESSAGE', 'PAYMENT_REMINDER', 'SERVICE_REMINDER'];
      if (promotionalEvents.includes(eventTrigger) && customer.opt_out_promotional === 1) {
        console.log(`[notify] Customer ${customerId} has opted out of promotional notifications. Skipping trigger ${eventTrigger}.`);
        return { success: true, opted_out: true };
      }
      
      // Auto-populate customer_name if not provided
      if (!variables.customer_name) {
        variables.customer_name = customer.name;
      }

      // 2. Fetch template matching event_trigger
      const [templates] = await pool.query(
        'SELECT * FROM v2_whatsapp_templates WHERE event_trigger = ? AND is_active = 1',
        [eventTrigger]
      );
      if (!templates.length) {
        console.warn(`[notify] Active template for trigger ${eventTrigger} not found`);
        return { success: false, error: 'Template not found' };
      }
      const template = templates[0];
      
      // 3. Interpolate placeholders in the message
      let messageBody = template.message_body;
      for (const [key, value] of Object.entries(variables)) {
        messageBody = messageBody.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g'), String(value));
      }
      
      // 4. Generate URL-encoded click-to-chat WhatsApp link
      let normalizedPhone = mobile.replace(/\D/g, '');
      if (normalizedPhone.length === 10) normalizedPhone = '91' + normalizedPhone;
      const waLink = `https://api.whatsapp.com/send?phone=${normalizedPhone}&text=${encodeURIComponent(messageBody)}`;

      // 5. Insert WhatsApp log (status: pending, containing wa_link)
      await pool.query(
        `INSERT INTO v2_notification_logs (customer_id, mobile, channel, template_name, message_body, status, attempts, last_attempt_at, response_data, reference_type, reference_id)
         VALUES (?, ?, 'whatsapp', ?, ?, 'pending', 1, NOW(), ?, ?, ?)`,
        [customerId, mobile, template.template_name, messageBody, JSON.stringify({ wa_link: waLink }), references.type || null, references.id || null]
      );

      // Log to whatsapp_messages as well for compatibility
      await pool.query(
        `INSERT INTO whatsapp_messages (customer_id, phone, template_name, message_type, message_body, status)
         VALUES (?, ?, ?, 'manual', ?, 'pending')`,
        [customerId, normalizedPhone, template.template_name, messageBody]
      );

      // 6. Send SMS fallback automatically if enabled
      let smsResult = { success: false };
      if (enabled) {
        const dltTemplateId = process.env.MSG91_PROMO_TEMPLATE_ID || 'PROMO123';
        smsResult = await this.sendSMS(mobile, dltTemplateId, null, {
          name: customer.name,
          content: messageBody
        });

        // Insert SMS log
        const smsStatus = smsResult.success ? 'sent' : 'failed';
        await pool.query(
          `INSERT INTO v2_notification_logs (customer_id, mobile, channel, template_name, message_body, status, attempts, last_attempt_at, response_data, reference_type, reference_id)
           VALUES (?, ?, 'sms', ?, ?, ?, 1, NOW(), ?, ?, ?)`,
          [customerId, mobile, template.template_name, messageBody, smsStatus, JSON.stringify(smsResult), references.type || null, references.id || null]
        );
      }

      return { success: true, wa_link: waLink, sms: smsResult };

    } catch (err) {
      console.error('[notify] Error:', err);
      return { success: false, error: err.message };
    }
  }
}

module.exports = new MessagingService();
