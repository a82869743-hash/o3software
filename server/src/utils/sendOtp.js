/**
 * ─── SEND OTP VIA 2FACTOR.IN ────────────────────────────────
 * Sends a numeric OTP to a 10-digit Indian mobile number
 * using the 2Factor OTP API.
 *
 * API: GET https://2factor.in/API/V1/{API_KEY}/SMS/{mobile}/{otp}
 *
 * ENV required:
 *   MSG91_AUTH_KEY — Your 2Factor.in API key
 *
 * Returns boolean: true on success, false on failure.
 * NEVER throws — safe for fire-and-forget usage.
 */

const axios = require('axios');

/**
 * @param {string} mobile  — 10-digit Indian mobile (no country code)
 * @param {string} otp     — Numeric OTP string (e.g. "4829")
 * @returns {Promise<boolean>}
 */
async function sendOtp(mobile, otp) {
  const apiKey = process.env.MSG91_AUTH_KEY;

  if (!apiKey) {
    console.log(`[DEV] OTP for ${mobile}: ${otp} (API key not set)`);
    return false;
  }

  try {
    const url = `https://2factor.in/API/V1/${apiKey}/SMS/${mobile}/${otp}`;
    const response = await axios.get(url, { timeout: 10000 });

    if (response.data && response.data.Status === 'Success') {
      console.log(`OTP SENT SUCCESS — Mobile: ${mobile} | SessionId: ${response.data.Details}`);
      return true;
    } else {
      console.error(`OTP FAILED — Mobile: ${mobile} | Response:`, response.data);
      return false;
    }
  } catch (err) {
    console.error(`OTP FAILED — Mobile: ${mobile} | Error:`, err.response?.data || err.message);
    return false;
  }
}

module.exports = sendOtp;
