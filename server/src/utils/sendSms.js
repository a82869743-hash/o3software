/**
 * Legacy helper kept for old callers. Customer messages (other than OTPs) are sent on
 * WhatsApp through the notification queue — see services/messagingService.js.
 *   sendSms(mobile, 'Your bill is ready ...')
 */
async function sendCustomerMessage(mobile, message) {
  if (!mobile || !message || typeof message !== 'string') {
    return { success: false, error: 'mobile and message text are required' };
  }
  const messagingService = require('../services/messagingService');
  return messagingService.sendWhatsApp(mobile, 'CUSTOM', { body: message });
}

module.exports = sendCustomerMessage;
