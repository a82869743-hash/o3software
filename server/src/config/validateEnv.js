/**
 * validateEnv.js — Fail-Fast Environment Configuration Validator
 * Validates existence, types, and constraints of all critical environment variables
 * on server boot before accepting any incoming requests.
 */

function validateEnv() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isProd = nodeEnv === 'production';
  const errors = [];
  const warnings = [];

  // ── 1. Runtime Environment ──────────────────────────────────────────────────
  const validEnvs = ['development', 'staging', 'production', 'test'];
  if (!validEnvs.includes(nodeEnv)) {
    errors.push(`NODE_ENV must be one of: ${validEnvs.join(', ')}. Received: "${nodeEnv}"`);
  }

  const port = parseInt(process.env.PORT || '5000', 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    errors.push(`PORT must be a valid number between 1 and 65535. Received: "${process.env.PORT}"`);
  }

  // ── 2. Database Constraints ─────────────────────────────────────────────────
  if (!process.env.DB_HOST) errors.push('DB_HOST is required (e.g. localhost or 127.0.0.1)');
  if (!process.env.DB_NAME) errors.push('DB_NAME is required (e.g. o3_car_spa)');
  if (!process.env.DB_USER) errors.push('DB_USER is required');
  if (isProd && !process.env.DB_PASSWORD) {
    errors.push('DB_PASSWORD cannot be empty in production environment');
  }

  const dbPort = parseInt(process.env.DB_PORT || '3306', 10);
  if (isNaN(dbPort) || dbPort < 1 || dbPort > 65535) {
    errors.push(`DB_PORT must be a valid number. Received: "${process.env.DB_PORT}"`);
  }

  // ── 3. Security & JWT Validation ────────────────────────────────────────────
  if (!process.env.JWT_SECRET) {
    errors.push('JWT_SECRET is required to sign and verify authentication tokens');
  } else if (process.env.JWT_SECRET.length < 32) {
    errors.push(`JWT_SECRET must be at least 32 characters long for cryptographic security. Current length: ${process.env.JWT_SECRET.length}`);
  }

  // ── 4. AES-256-GCM Credential Encryption Key ────────────────────────────────
  if (isProd && !process.env.ENCRYPTION_KEY) {
    errors.push('ENCRYPTION_KEY is required in production for database token encryption (AES-256-GCM). Generate with: openssl rand -hex 32');
  }

  // ── 5. WhatsApp Gateway Validation ──────────────────────────────────────────
  const allowedProviders = ['meta_cloud', 'aisensy', 'baileys_demo', 'mock'];
  const activeProvider = process.env.WHATSAPP_PROVIDER || 'meta_cloud';
  if (!allowedProviders.includes(activeProvider)) {
    errors.push(`WHATSAPP_PROVIDER must be one of: ${allowedProviders.join(', ')}. Received: "${activeProvider}"`);
  }

  if (activeProvider === 'baileys_demo' && isProd && process.env.ENABLE_BAILEYS_DEMO !== 'true') {
    errors.push('Baileys provider selected in production but ENABLE_BAILEYS_DEMO is not set to "true". Blocked by safety policy.');
  }

  // ── 6. Client & Base URLs ───────────────────────────────────────────────────
  if (isProd && !process.env.CLIENT_URL) {
    warnings.push('CLIENT_URL is not set in production. CORS will fall back to wildcards.');
  }

  // ── 7. Reporting & Enforcement ──────────────────────────────────────────────
  if (warnings.length > 0) {
    console.warn('\n⚠️  [validateEnv] Configuration Warnings:');
    warnings.forEach(w => console.warn(`   • ${w}`));
  }

  if (errors.length > 0) {
    console.error('\n╔══════════════════════════════════════════════════════════════════╗');
    console.error('║  ❌ FATAL CONFIGURATION ERROR: SERVER CANNOT START               ║');
    console.error('╚══════════════════════════════════════════════════════════════════╝');
    console.error(`Environment: ${nodeEnv.toUpperCase()}\n`);
    errors.forEach(err => console.error(`  ⛔ ${err}`));
    console.error('\nPlease consult .env.example and configure the required environment variables.');
    console.error('Server execution aborted.\n');
    process.exit(1);
  }

  console.log(`[validateEnv] ✅ Environment configuration validated successfully for [${nodeEnv.toUpperCase()}]`);
}

module.exports = validateEnv;
