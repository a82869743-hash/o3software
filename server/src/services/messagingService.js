/**
 * messagingService — legacy entry point kept for existing callers.
 *
 * Policy: SMS is used ONLY for login / forgot-password OTPs (utils/sendOtp.js).
 * Every other customer message goes out on WhatsApp through the notification queue
 * (which retries, de-duplicates and records history).
 */
const notificationService = require('./notificationService');

class MessagingService {
  /**
   * Historic name — callers used this for transactional texts. Now delivered over WhatsApp.
   * Signature kept: (mobile, templateId, shortUrl, variables)
   */
  async sendSMS(mobile, _templateId, _shortUrl, variables = {}) {
    const body = variables.content || variables.body || '';
    if (!mobile || !body) return { success: false, error: 'mobile and message are required' };
    return notificationService.notify({
      mobile,
      customMessageBody: body,
      channels: ['whatsapp'],
      franchiseId: variables.franchise_id || 1,
    });
  }

  /** Free-text WhatsApp message to a phone number. */
  async sendWhatsApp(to, templateName, params = {}) {
    const body = params.body || params.content || '';
    if (!to || !body) return { success: false, error: 'mobile and message are required' };
    return notificationService.notify({
      mobile: to,
      customMessageBody: body,
      channels: ['whatsapp'],
      franchiseId: params.franchise_id || 1,
      referenceType: params.reference_type || null,
      referenceId: params.reference_id || null,
    });
  }

  /**
   * Template-driven customer notification (WhatsApp).
   * notify(customerId, 'SERVICE_COMPLETED', { vehicle_number }, { type: 'job_cart', id })
   */
  async notify(customerId, eventTrigger, variables = {}, references = {}) {
    return notificationService.notify({
      eventTrigger,
      customerId,
      variables,
      channels: ['whatsapp'],
      referenceType: references.type || null,
      referenceId: references.id || null,
      franchiseId: references.franchise_id || 1,
      idempotencyKey: references.idempotency_key || null,
    });
  }
}

module.exports = new MessagingService();
