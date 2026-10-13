/**
 * cryptoUtil.js — Secure AES-256-GCM encryption for stored API tokens
 */
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const TAG_LENGTH = 16;

function getEncryptionKey() {
  const secret = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || 'O3CarSpaa_Default_Secret_Key_32B!';
  // Derive a reliable 32-byte key via SHA-256
  return crypto.createHash('sha256').update(String(secret)).digest();
}

/**
 * Encrypt a plaintext string
 * @param {string} plaintext
 * @returns {string} iv:authTag:ciphertext (hex)
 */
function encrypt(plaintext) {
  if (!plaintext) return '';
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt an encrypted string
 * @param {string} encryptedString
 * @returns {string} plaintext
 */
function decrypt(encryptedString) {
  if (!encryptedString) return '';
  if (!encryptedString.includes(':')) {
    // Legacy plaintext fallback
    return encryptedString;
  }

  try {
    const key = getEncryptionKey();
    const parts = encryptedString.split(':');
    if (parts.length !== 3) return encryptedString;

    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.warn('[cryptoUtil] Decryption failed, returning empty:', err.message);
    return '';
  }
}

module.exports = {
  encrypt,
  decrypt
};
