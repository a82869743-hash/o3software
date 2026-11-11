/**
 * imageGen.js — auto-creates a picture for a new service / package in the app's 3D house style.
 *
 * Uses Google's Gemini image model (same family the app's existing illustrations were made with).
 * Plug-and-play: does nothing until GEMINI_API_KEY is set in server/.env.
 *   GEMINI_API_KEY=...                       (Google AI Studio → Get API key)
 *   GEMINI_IMAGE_MODEL=gemini-2.5-flash-image (optional)
 * Without a key the customer app still shows a matching picture from the built-in library (by name).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');

const OUT_DIR = path.join(__dirname, '..', '..', 'uploads', 'illustrations');

const HOUSE_STYLE =
  '3D rendered app icon illustration, glossy semi-realistic toy style like a modern Indian car-care app icon. ' +
  '{SUBJECT} Minimal composition with one main object and at most one small helper object, smooth simple shapes, ' +
  'no extra parts or decorations. Royal blue (#2563EB), navy and silver colour palette. Soft studio lighting, gentle shadow, ' +
  'isolated on a pure white background, centered with plenty of empty space around, no readable text, no logo, no watermark, no people.';

function isConfigured() {
  return !!(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim());
}

/** Turn a service/package name into a short visual subject for the prompt. */
function subjectFor(name, kind = 'service', description = '') {
  const n = String(name || '').trim().slice(0, 80);
  const d = String(description || '').trim().slice(0, 140);
  if (kind === 'package') {
    return `An icon representing the car care package "${n}"${d ? ` (${d})` : ''}: a premium royal blue membership card with a small car silhouette and a gold star badge.`;
  }
  return `An icon representing the car care service "${n}"${d ? ` (${d})` : ''}, shown with the car part or tool that best explains this service.`;
}

/**
 * Generate an illustration. Returns the public path ("/uploads/illustrations/…png") or throws a friendly error.
 */
async function generateIllustration({ name, kind = 'service', description = '' }) {
  if (!isConfigured()) {
    const e = new Error('AI pictures are not set up yet — add GEMINI_API_KEY to the server settings (.env).');
    e.status = 400;
    throw e;
  }
  const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
  const prompt = HOUSE_STYLE.replace('{SUBJECT}', subjectFor(name, kind, description));
  let res;
  try {
    res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } },
      { headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY, 'Content-Type': 'application/json' }, timeout: 90000 }
    );
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    const e = new Error(`Picture could not be created: ${msg}`);
    e.status = err.response?.status === 429 ? 429 : 502;
    throw e;
  }
  const parts = res.data?.candidates?.[0]?.content?.parts || [];
  const img = parts.find(p => p.inlineData && /^image\//.test(p.inlineData.mimeType || ''));
  if (!img) {
    const e = new Error('The AI did not return a picture — try again or upload a photo.');
    e.status = 502;
    throw e;
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const ext = (img.inlineData.mimeType.split('/')[1] || 'png').replace('jpeg', 'jpg');
  const file = `ai_${kind}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(OUT_DIR, file), Buffer.from(img.inlineData.data, 'base64'));
  return `/uploads/illustrations/${file}`;
}

/**
 * Fire-and-forget after a service/package is created without a picture:
 * generates one in the background and saves it, if AI pictures are set up.
 */
function autoGenerateFor(pool, table, id, name, description) {
  if (!isConfigured() || !['services', 'packages'].includes(table)) return;
  generateIllustration({ name, kind: table === 'packages' ? 'package' : 'service', description })
    .then(url => pool.query(`UPDATE ${table} SET image_url = ? WHERE id = ? AND (image_url IS NULL OR image_url = '')`, [url, id]))
    .then(() => console.log(`[imageGen] picture created for ${table} #${id}`))
    .catch(err => console.warn(`[imageGen] ${table} #${id}: ${err.message}`));
}

module.exports = { isConfigured, generateIllustration, autoGenerateFor };
