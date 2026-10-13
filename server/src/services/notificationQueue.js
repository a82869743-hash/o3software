const axios = require('axios');
const nodemailer = require('nodemailer');
const pool = require('../config/db');

class NotificationQueue {
  constructor() {
    this.isProcessing = false;
    this.workerTimer = null;
    this.io = null;
    this.failureSimulator = null; // For automated failure testing
  }

  /**
   * Set Socket.io instance for failure broadcasts
   */
  setIo(io) {
    this.io = io;
  }

  /**
   * Set simulated failure hook for unit/integration testing
   */
  setFailureSimulator(simulatorFn) {
    this.failureSimulator = simulatorFn;
  }

  /**
   * Helper to retrieve credentials from env or DB settings
   */
  async getCredentials() {
    try {
      const [rows] = await pool.query(
        "SELECT key_name, value FROM settings WHERE key_name IN ('whatsapp_access_token', 'whatsapp_phone_number_id', 'whatsapp_business_account_id', 'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from', 'admin_whatsapp', 'studio_name')"
      );
      const settingsMap = {};
      rows.forEach(r => { settingsMap[r.key_name] = r.value; });

      return {
        whatsapp: {
          accessToken: process.env.WHATSAPP_ACCESS_TOKEN || settingsMap['whatsapp_access_token'] || '',
          phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || settingsMap['whatsapp_phone_number_id'] || '',
          businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || settingsMap['whatsapp_business_account_id'] || '',
        },
        smtp: {
          host: process.env.SMTP_HOST || settingsMap['smtp_host'] || 'smtp.gmail.com',
          port: parseInt(process.env.SMTP_PORT || settingsMap['smtp_port'] || '587', 10),
          user: process.env.SMTP_USER || process.env.GMAIL_USER || settingsMap['smtp_user'] || '',
          pass: process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || settingsMap['smtp_pass'] || '',
          from: process.env.SMTP_FROM || settingsMap['smtp_from'] || `O3 Car Spaa <${process.env.SMTP_USER || settingsMap['smtp_user'] || 'notifications@o3carspaa.com'}>`,
        },
        studioName: settingsMap['studio_name'] || 'O3 Car Spaa'
      };
    } catch (err) {
      console.warn('[NotificationQueue] Could not load credentials from DB, falling back to process.env:', err.message);
      return {
        whatsapp: {
          accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
          phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
          businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '',
        },
        smtp: {
          host: process.env.SMTP_HOST || 'smtp.gmail.com',
          port: parseInt(process.env.SMTP_PORT || '587', 10),
          user: process.env.SMTP_USER || process.env.GMAIL_USER || '',
          pass: process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || '',
          from: process.env.SMTP_FROM || 'O3 Car Spaa <notifications@o3carspaa.com>',
        },
        studioName: 'O3 Car Spaa'
      };
    }
  }

  /**
   * Check if running in Mock / Sandbox mode
   */
  isSandboxMode(credentials, channel) {
    if (process.env.NOTIFICATION_SANDBOX === 'true') return true;
    if (channel === 'whatsapp') {
      return !credentials.whatsapp.accessToken || !credentials.whatsapp.phoneNumberId;
    }
    if (channel === 'email') {
      return !credentials.smtp.user || !credentials.smtp.pass;
    }
    return false;
  }

  /**
   * Enqueue a notification with strict idempotency (Non-blocking)
   */
  async enqueueNotification({
    idempotency_key,
    channel = 'whatsapp',
    customer_id = null,
    mobile = null,
    email = null,
    template_name = 'GENERIC',
    message_body = '',
    attachment_url = null,
    attachment_path = null,
    payload_json = null,
    reference_type = null,
    reference_id = null,
    franchise_id = 1,
    max_retries = 3
  }) {
    try {
      // 1. Strict Idempotency Verification
      if (idempotency_key) {
        const [existing] = await pool.query(
          'SELECT id, idempotency_key, channel, status, attempts, created_at FROM v2_notification_logs WHERE idempotency_key = ?',
          [idempotency_key]
        );
        if (existing.length > 0) {
          console.log(`[NotificationQueue] Idempotency match: key "${idempotency_key}" already exists (ID: ${existing[0].id}, status: ${existing[0].status}). Skipping duplicate.`);
          return {
            success: true,
            deduplicated: true,
            notificationId: existing[0].id,
            status: existing[0].status,
            message: 'Notification already queued or dispatched (idempotent)'
          };
        }
      }

      // 2. Insert as 'queued'
      const [insertRes] = await pool.query(
        `INSERT INTO v2_notification_logs
         (idempotency_key, customer_id, mobile, email, channel, template_name, message_body,
          attachment_url, attachment_path, payload_json, status, attempts, next_retry_at,
          max_retries, franchise_id, reference_type, reference_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', 0, NOW(), ?, ?, ?, ?, NOW(), NOW())`,
        [
          idempotency_key || null,
          customer_id,
          mobile,
          email,
          channel,
          template_name,
          message_body,
          attachment_url,
          attachment_path,
          payload_json ? JSON.stringify(payload_json) : null,
          max_retries,
          franchise_id || 1,
          reference_type,
          reference_id
        ]
      );

      const notificationId = insertRes.insertId;
      console.log(`[NotificationQueue] Queued #${notificationId} (${channel}) for ${mobile || email} [key: ${idempotency_key || 'none'}]`);

      // 3. Trigger queue process tick immediately without blocking HTTP caller
      setImmediate(() => {
        this.processQueue().catch(err => {
          console.error('[NotificationQueue] Background tick error:', err.message);
        });
      });

      return {
        success: true,
        queued: true,
        notificationId,
        status: 'queued'
      };
    } catch (err) {
      // In case of race condition on UNIQUE idempotency_key constraint
      if (err.code === 'ER_DUP_ENTRY' && idempotency_key) {
        const [existing] = await pool.query(
          'SELECT id, status FROM v2_notification_logs WHERE idempotency_key = ?',
          [idempotency_key]
        );
        return {
          success: true,
          deduplicated: true,
          notificationId: existing[0]?.id,
          status: existing[0]?.status,
          message: 'Notification already queued or dispatched (duplicate entry caught)'
        };
      }
      console.error('[NotificationQueue] Enqueue error:', err);
      throw err;
    }
  }

  /**
   * Main Queue Worker: processes queued and retryable items
   */
  async processQueue() {
    if (this.isProcessing) {
      this.pendingTick = true;
      return;
    }
    this.isProcessing = true;

    try {
      while (true) {
        // Fetch batch of actionable items:
        // status = 'queued' OR (status = 'failed' AND attempts < max_retries AND next_retry_at <= NOW())
        const [items] = await pool.query(`
          SELECT * FROM v2_notification_logs
          WHERE (status = 'queued' OR (status = 'failed' AND attempts < max_retries AND next_retry_at <= NOW()))
          ORDER BY id ASC
          LIMIT 10
        `);

        if (!items.length) {
          break;
        }

        const credentials = await this.getCredentials();

        for (const item of items) {
          await this.processItem(item, credentials);
        }
      }
    } catch (err) {
      console.error('[NotificationQueue] processQueue loop error:', err.message);
    } finally {
      this.isProcessing = false;
      if (this.pendingTick) {
        this.pendingTick = false;
        setImmediate(() => this.processQueue());
      }
    }
  }

  /**
   * Process a single notification item with retry & backoff
   */
  async processItem(item, credentials) {
    try {
      // Mark as processing
      await pool.query(
        "UPDATE v2_notification_logs SET status = 'processing', last_attempt_at = NOW() WHERE id = ?",
        [item.id]
      );

      // Check simulated failure hook (for testing failure & backoff)
      let parsedPayload = null;
      try {
        parsedPayload = typeof item.payload_json === 'string' ? JSON.parse(item.payload_json) : item.payload_json;
      } catch (e) {}

      if (parsedPayload?.simulate_failure || (this.failureSimulator && this.failureSimulator(item))) {
        throw new Error(parsedPayload?.failure_reason || 'Provider timeout error (504 Gateway Timeout)');
      }

      let dispatchResult;
      if (item.channel === 'whatsapp') {
        dispatchResult = await this.dispatchWhatsApp(item, credentials);
      } else if (item.channel === 'email') {
        dispatchResult = await this.dispatchEmail(item, credentials);
      } else if (item.channel === 'sms') {
        dispatchResult = await this.dispatchSMS(item, credentials);
      } else {
        throw new Error(`Unsupported channel: ${item.channel}`);
      }

      // Success
      await pool.query(`
        UPDATE v2_notification_logs
        SET status = 'sent',
            attempts = attempts + 1,
            last_attempt_at = NOW(),
            error_message = NULL,
            response_data = ?,
            updated_at = NOW()
        WHERE id = ?
      `, [JSON.stringify(dispatchResult), item.id]);

      console.log(`[NotificationQueue] ✅ Sent #${item.id} (${item.channel}) to ${item.mobile || item.email}`);

    } catch (err) {
      const nextAttempt = (item.attempts || 0) + 1;
      const maxRetries = item.max_retries || 3;
      const isFinalFailure = nextAttempt >= maxRetries;

      // Exponential backoff: base 30s * 2^(attempts-1) (e.g. 30s, 60s, 120s...)
      const backoffSec = Math.min(3600, Math.pow(2, Math.max(0, nextAttempt - 1)) * 30);
      const nextRetryAt = isFinalFailure ? null : new Date(Date.now() + backoffSec * 1000);

      await pool.query(`
        UPDATE v2_notification_logs
        SET status = 'failed',
            attempts = ?,
            last_attempt_at = NOW(),
            error_message = ?,
            next_retry_at = ?,
            updated_at = NOW()
        WHERE id = ?
      `, [nextAttempt, err.message, nextRetryAt, item.id]);

      console.error(`[NotificationQueue] ❌ Attempt ${nextAttempt}/${maxRetries} failed for #${item.id}: ${err.message}. ${isFinalFailure ? 'Max retries exceeded.' : `Retrying at ${nextRetryAt.toISOString()}`}`);

      // If final failure or alert triggered, notify via Socket.io and admin alert
      if (isFinalFailure || nextAttempt === 1) {
        this.emitFailureAlert({
          notificationId: item.id,
          channel: item.channel,
          template_name: item.template_name,
          customer_id: item.customer_id,
          recipient: item.mobile || item.email,
          error: err.message,
          attempts: nextAttempt,
          maxRetries,
          isFinal: isFinalFailure
        });
      }
    }
  }

  /**
   * Emit Socket.io Failure Alert and log to audit
   */
  emitFailureAlert(alertPayload) {
    if (this.io) {
      try {
        this.io.emit('notification_failed', alertPayload);
        console.log(`[NotificationQueue] Broadcasted 'notification_failed' alert for #${alertPayload.notificationId}`);
      } catch (err) {
        console.warn('[NotificationQueue] Socket.io broadcast failed:', err.message);
      }
    }
  }

  /**
   * WhatsApp Dispatcher — Routes through WhatsAppManager adapter layer
   */
  async dispatchWhatsApp(item, credentials) {
    let phone = (item.mobile || '').replace(/\D/g, '');
    if (!phone) throw new Error('Recipient mobile number is missing');
    if (phone.length === 10) phone = '91' + phone;

    const whatsappManager = require('./whatsapp/WhatsAppManager');
    const franchiseId = item.franchise_id || 1;

    // 1. If document/media attachment exists
    if (item.attachment_path || item.attachment_url) {
      const baseUrl = process.env.APP_BASE_URL || 'http://localhost:5000';
      const attachmentUrl = item.attachment_url
        ? (item.attachment_url.startsWith('http') ? item.attachment_url : `${baseUrl}${item.attachment_url}`)
        : null;
      const filename = item.attachment_path
        ? require('path').basename(item.attachment_path)
        : (attachmentUrl ? attachmentUrl.split('/').pop() : 'Document.pdf');

      return await whatsappManager.sendMedia({
        to: phone,
        mediaUrl: attachmentUrl,
        mediaPath: item.attachment_path,
        filename,
        caption: item.message_body,
        type: 'document',
        franchiseId
      });
    }

    // 2. If pre-approved template
    if (item.template_name && item.template_name !== 'CUSTOM_NOTIFICATION' && item.template_name !== 'MANUAL_TEXT') {
      return await whatsappManager.sendTemplate({
        to: phone,
        templateName: item.template_name,
        components: [item.message_body],
        category: 'utility',
        franchiseId
      });
    }

    // 3. Free-form text
    return await whatsappManager.sendFreeForm({
      to: phone,
      text: item.message_body,
      franchiseId
    });
  }

  /**
   * Gmail / SMTP Dispatcher
   */
  async dispatchEmail(item, credentials) {
    const isSandbox = this.isSandboxMode(credentials, 'email');
    const recipientEmail = item.email;
    if (!recipientEmail || !recipientEmail.includes('@')) {
      throw new Error(`Invalid or missing email recipient: ${recipientEmail}`);
    }

    const subject = `[O3 Car Spaa] ${item.template_name.replace(/_/g, ' ')}`;
    const attachments = [];
    if (item.attachment_path) {
      const fs = require('fs');
      if (fs.existsSync(item.attachment_path)) {
        attachments.push({
          filename: item.attachment_path.split(/[/\\]/).pop(),
          path: item.attachment_path
        });
      }
    }

    if (isSandbox) {
      console.log(`[EMAIL SANDBOX/MOCK] Sent to: ${recipientEmail} | Subject: ${subject}`);
      console.log(`  Body preview: ${item.message_body.substring(0, 100)}...`);
      if (attachments.length) console.log(`  Attachment: ${attachments[0].filename}`);
      return {
        success: true,
        mocked: true,
        provider: 'Nodemailer SMTP (Sandbox)',
        to: recipientEmail,
        messageId: `mock_email_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        timestamp: new Date().toISOString()
      };
    }

    // Live SMTP Call
    const transporter = nodemailer.createTransporter({
      host: credentials.smtp.host,
      port: credentials.smtp.port,
      secure: credentials.smtp.port === 465,
      auth: {
        user: credentials.smtp.user,
        pass: credentials.smtp.pass
      }
    });

    const info = await transporter.sendMail({
      from: credentials.smtp.from,
      to: recipientEmail,
      subject,
      text: item.message_body,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #0f172a; border-bottom: 2px solid #d97706; padding-bottom: 8px;">${credentials.studioName}</h2>
          <p style="white-space: pre-line; line-height: 1.6; color: #334155;">${item.message_body}</p>
          ${item.attachment_url ? `<p><a href="${item.attachment_url}" style="display: inline-block; padding: 10px 18px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px; font-weight: bold;">Download Attachment</a></p>` : ''}
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <p style="font-size: 12px; color: #94a3b8;">This is an automated notification from ${credentials.studioName}. Please do not reply directly to this email.</p>
        </div>
      `,
      attachments
    });

    return {
      success: true,
      provider: 'Nodemailer SMTP',
      messageId: info.messageId,
      response: info.response
    };
  }

  /**
   * SMS Dispatcher fallback
   */
  async dispatchSMS(item) {
    const messagingService = require('./messagingService');
    const res = await messagingService.sendSMS(item.mobile, 'TXN_SMS', null, { content: item.message_body });
    return res;
  }

  /**
   * Manual Resend: resets attempts, clears errors, and schedules immediate queue tick
   */
  async resendNotification(id) {
    const [rows] = await pool.query('SELECT * FROM v2_notification_logs WHERE id = ?', [id]);
    if (!rows.length) {
      throw new Error(`Notification #${id} not found`);
    }

    let payload = rows[0].payload_json;
    if (payload) {
      try {
        const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
        if (parsed.simulate_failure) {
          delete parsed.simulate_failure;
          delete parsed.failure_reason;
          payload = JSON.stringify(parsed);
        }
      } catch (e) {}
    }

    await pool.query(`
      UPDATE v2_notification_logs
      SET status = 'queued',
          attempts = 0,
          next_retry_at = NOW(),
          error_message = NULL,
          payload_json = ?,
          updated_at = NOW()
      WHERE id = ?
    `, [payload ? (typeof payload === 'string' ? payload : JSON.stringify(payload)) : null, id]);

    console.log(`[NotificationQueue] 🔄 Manual resend initiated for #${id}`);

    // Trigger immediate background process
    setImmediate(() => {
      this.processQueue().catch(err => {
        console.error('[NotificationQueue] Manual resend tick error:', err.message);
      });
    });

    return {
      success: true,
      message: `Notification #${id} requeued for immediate dispatch`,
      notificationId: id
    };
  }

  /**
   * Start recurring background timer (checks for retries every 20 seconds)
   */
  startWorker(intervalMs = 20000) {
    if (this.workerTimer) return;
    this.workerTimer = setInterval(() => {
      this.processQueue().catch(err => {
        console.error('[NotificationQueue] Worker timer error:', err.message);
      });
    }, intervalMs);
    console.log(`[NotificationQueue] Background queue worker active (poll interval: ${intervalMs}ms)`);
  }

  /**
   * Stop recurring timer
   */
  stopWorker() {
    if (this.workerTimer) {
      clearInterval(this.workerTimer);
      this.workerTimer = null;
    }
  }
}

const notificationQueue = new NotificationQueue();
module.exports = notificationQueue;
