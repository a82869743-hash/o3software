/**
 * ─── SEND TRANSACTIONAL SMS VIA 2FACTOR.IN ──────────────────
 * Production-ready DLT-compliant transactional SMS for job card updates.
 * Features Primary & Fallback Template Routing
 */

const axios = require('axios');

/**
 * Send job card SMS notification via 2Factor.in with Fallback
 * @param {string|number} mobile — Indian mobile number (will be formatted to 91XXXXXXXXXX)
 * @param {string|number} jobId — Job card ID
 * @returns {Promise<{success: boolean, method: string, response: any}>}
 */
async function sendJobCardSMS(mobile, jobId) {
  const apiKey = process.env.MSG91_AUTH_KEY;
  const sender = process.env.MSG91_SENDER_ID || 'GKAUTO';
  const baseUrl = process.env.APP_BASE_URL || 'http://localhost:5000';

  if (!apiKey) {
    console.log(`[DEBUG SMS] To: ${mobile} | JobId: ${jobId} (API key not set)`);
    return { success: false, method: 'none', response: 'API key missing' };
  }

  // 1. Validate & Format Phone Number
  let cleanMobile = String(mobile).replace(/\D/g, '');
  if (cleanMobile.length === 10) {
    cleanMobile = '91' + cleanMobile;
  } else if (cleanMobile.length === 12 && cleanMobile.startsWith('91')) {
    // Already correct
  } else {
    console.error(`[DEBUG SMS FAILED] Invalid mobile number format: ${mobile}`);
    return { success: false, method: 'none', response: 'Invalid phone format' };
  }

  if (!jobId) {
    console.error('[DEBUG SMS FAILED] Missing Job ID');
    return { success: false, method: 'none', response: 'Missing Job ID' };
  }

  const trackingUrl = `${baseUrl}/job/${jobId}`;
  const url = `https://2factor.in/API/V1/${apiKey}/ADDON_SERVICES/SEND/TSMS`;

  // 2. Define Payloads
  const primaryPayload = {
    From: sender,
    To: cleanMobile,
    TemplateName: 'GK_JOB_ALERT_V2',
    VAR1: trackingUrl,
    VAR2: String(jobId)
  };

  const fallbackPayload = {
    From: sender,
    To: cleanMobile,
    TemplateName: 'GK_JOB_ALERT_NOURL',
    VAR1: String(jobId)
  };

  // 3. Helper Function for Sending
  const attemptSend = async (payload, method) => {
    console.log('\n=============================================');
    console.log(`🔹 DEBUG SMS REQUEST DETAILS (${method.toUpperCase()})`);
    console.log('=============================================');
    console.log('Endpoint URL:', url.replace(apiKey, 'HIDDEN_API_KEY'));
    console.log('Payload:', JSON.stringify(payload, null, 2));
    console.log('=============================================\n');

    try {
      const response = await axios.post(url, payload, { 
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000 
      });

      console.log(`[DEBUG SMS RESPONSE - ${method.toUpperCase()}]`);
      console.log('Status Code:', response.status);
      console.log('Response Body:', JSON.stringify(response.data, null, 2));

      if (response.data && response.data.Status === 'Success') {
        console.log(`✅ [SMS SUCCESS - ${method.toUpperCase()}] Mobile: ${cleanMobile} | JobId: ${jobId}`);
        return { success: true, method, response: response.data };
      } else {
        console.error(`❌ [SMS FAILED - ${method.toUpperCase()}] API rejected:`, response.data);
        return { success: false, method, response: response.data };
      }
    } catch (err) {
      const errorData = err.response?.data || err.message;
      console.error(`❌ [SMS ERROR - ${method.toUpperCase()}] Request Failed:`, errorData);
      return { success: false, method, response: errorData };
    }
  };

  // 4. Try Primary Template
  const primaryResult = await attemptSend(primaryPayload, 'primary');

  // If primary succeeds, return
  // Note: DLT-CNT-REJECT is usually asynchronous, but if 2Factor returns a synchronous failure, we fallback
  if (primaryResult.success) {
    return primaryResult;
  }

  // 5. If Primary Fails, Try Fallback Template
  console.log(`[SMS FALLBACK] Primary failed. Attempting fallback template NOURL...`);
  const fallbackResult = await attemptSend(fallbackPayload, 'fallback');

  return fallbackResult;
}

module.exports = sendJobCardSMS;
