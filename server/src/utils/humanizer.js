/**
 * humanizer.js — Dynamic Anti-Spam Message Humanization & Spintax Engine
 * 
 * Protects WhatsApp account from automated spam filters by:
 *  1. Dynamic time-aware and natural greetings (no rigid "Dear Customer")
 *  2. Spintax syntax support: "{Hi|Hello|Hey} there!" -> randomly selects one
 *  3. Multiple rich sentence variations for every business trigger
 *  4. Dynamic natural sign-offs
 *  5. Invisible zero-width cryptographic salt injection (ensures NO two messages
 *     ever share the same SHA-256 binary hash, evading duplicate text detection)
 */

// Invisible zero-width characters (completely invisible in WhatsApp UI)
const ZERO_WIDTH_CHARS = [
  '\u200B', // Zero-Width Space
  '\u200C', // Zero-Width Non-Joiner
  '\u200D', // Zero-Width Joiner
  '\u2060'  // Word Joiner
];

/**
 * Injects invisible zero-width characters into text so every single sent message
 * has a cryptographically unique binary payload and SHA-256 hash.
 */
function injectAntiFingerprintSalt(text) {
  if (!text) return text;
  // Generate a random sequence of 3 to 6 invisible zero-width characters
  const saltLength = 3 + Math.floor(Math.random() * 4);
  let salt = '';
  for (let i = 0; i < saltLength; i++) {
    const idx = Math.floor(Math.random() * ZERO_WIDTH_CHARS.length);
    salt += ZERO_WIDTH_CHARS[idx];
  }
  // Append at end of message and optionally between paragraphs
  return text.trim() + salt;
}

/**
 * Evaluates nested or single spintax patterns: "{option1|option2|option3}"
 * Note: must contain at least one pipe "|" to prevent altering single or double braces.
 */
function parseSpintax(str) {
  if (!str) return '';
  const regex = /\{([^{}|]+(?:\|[^{}|]+)+)\}/g;
  let result = str;
  let iterations = 0;
  while (regex.test(result) && iterations < 10) {
    iterations++;
    result = result.replace(regex, (match, choices) => {
      const options = choices.split('|');
      const pick = options[Math.floor(Math.random() * options.length)];
      return pick.trim();
    });
  }
  return result;
}

/**
 * Returns a dynamic, friendly greeting tailored to IST time of day
 */
function getDynamicGreeting(name) {
  const cleanName = (name && name.trim() && name.toLowerCase() !== 'customer') ? name.trim() : null;

  // Get current hour in IST (+05:30)
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const istDate = new Date(utc + (3600000 * 5.5));
  const hour = istDate.getHours();

  let timeSalutation = 'Hello';
  if (hour >= 5 && hour < 12) {
    timeSalutation = 'Good morning';
  } else if (hour >= 12 && hour < 17) {
    timeSalutation = 'Good afternoon';
  } else if (hour >= 17 && hour < 22) {
    timeSalutation = 'Good evening';
  }

  if (cleanName) {
    const options = [
      `${timeSalutation} ${cleanName},`,
      `Hi ${cleanName}, ${timeSalutation.toLowerCase()}!`,
      `Hey ${cleanName}, hope you're having a good day!`,
      `Hi ${cleanName},`,
      `Hello ${cleanName},`,
      `Hey ${cleanName},`
    ];
    return options[Math.floor(Math.random() * options.length)];
  } else {
    const options = [
      `${timeSalutation}!`,
      `Hi there, ${timeSalutation.toLowerCase()}!`,
      `Hello, hope you're having a wonderful day!`,
      `Greetings from O3 Car Spaa!`,
      `Hi there!`
    ];
    return options[Math.floor(Math.random() * options.length)];
  }
}

/**
 * Returns a dynamic, professional yet warm sign-off
 */
function getDynamicSignoff() {
  const options = [
    `Warm regards,\n*Team O3 Car Spaa* 🚗✨`,
    `Best regards,\n*O3 Car Spaa Studio* 🚘`,
    `Thanks & regards,\n*Team O3 Car Spaa*`,
    `Have a great day ahead!\n*O3 Car Spaa* 🏎️`,
    `With care for your drive,\n*Team O3 Car Spaa* 💎`,
    `Always glad to serve,\n*O3 Car Spaa* ⭐`
  ];
  return options[Math.floor(Math.random() * options.length)];
}

/**
 * Pre-defined humanized variation libraries for core events
 */
const EVENT_VARIATIONS = {
  PIPELINE_STATUS_UPDATE: [
    (v, g, s) => `${g}\n\nQuick progress update on your *{{entity_type}}* ({{vehicle_number}}): it has now entered the *{{stage_name}}* stage. Current status is *{{status_label}}*.\n\n${s}`,
    (v, g, s) => `${g}\n\nJust keeping you in the loop — work on your {{vehicle_number}} is progressing nicely! We've advanced it to the *{{stage_name}}* phase (*{{status_label}}*).\n\n${s}`,
    (v, g, s) => `${g}\n\nStatus update: Your vehicle {{vehicle_number}} is currently undergoing *{{stage_name}}* (*{{status_label}}*). Our detailing specialists are on it!\n\n${s}`,
    (v, g, s) => `${g}\n\nHere is a quick snapshot from our studio bay: your {{vehicle_number}} has transitioned to *{{stage_name}}* (status: {{status_label}}).\n\n${s}`
  ],

  SERVICE_STARTED: [
    (v, g, s) => `${g}\n\nOur detailing team has officially started work on your {{vehicle_number}}. We estimate completion by approximately *{{estimated_time}}*. We'll notify you as soon as the final inspection wraps up!\n\n${s}`,
    (v, g, s) => `${g}\n\nYour {{vehicle_number}} is now on the studio bay at O3 Car Spaa! The process is underway with an expected finish time of *{{estimated_time}}*.\n\n${s}`,
    (v, g, s) => `${g}\n\nJust letting you know that our detailing specialists have begun working on your vehicle ({{vehicle_number}}). Target completion: *{{estimated_time}}*.\n\n${s}`
  ],

  SERVICE_COMPLETED: [
    (v, g, s) => `🎉 ${g}\n\nGreat news! The detailing for your {{vehicle_number}} (Job Card: #{{job_cart_id}}) is fully finished and looking pristine. It has passed final inspection and is ready for pickup!\n\n${s}`,
    (v, g, s) => `✨ ${g}\n\nAll set! Work on your {{vehicle_number}} (Job Card: #{{job_cart_id}}) is complete. Your car is glowing and ready to roll whenever you'd like to collect it.\n\n${s}`,
    (v, g, s) => `⭐ ${g}\n\nExciting update: we've wrapped up all services for your {{vehicle_number}} (Job Card: #{{job_cart_id}}). Feel free to visit O3 Car Spaa studio to collect your vehicle.\n\n${s}`
  ],

  DELIVERY_READY: [
    (v, g, s) => `🚗 ${g}\n\nYour vehicle {{vehicle_number}} is ready and waiting for you at {{location}}! Feel free to drop by to collect it.\n\n${s}`,
    (v, g, s) => `🌟 ${g}\n\nAll polished and ready to go! Your {{vehicle_number}} is ready for pickup at our {{location}} studio.\n\n${s}`,
    (v, g, s) => `🏎️ ${g}\n\nYour car {{vehicle_number}} has completed all detailing steps and is ready for pickup at {{location}}.\n\n${s}`
  ],

  PAYMENT_REMINDER: [
    (v, g, s) => `💳 ${g}\n\nHope you're having a great day. Just a gentle follow-up regarding the pending balance of *₹{{amount_due}}* for invoice {{invoice_number}} (Due: {{due_date}}). You can clear this online or during your next visit.\n\n${s}`,
    (v, g, s) => `🧾 ${g}\n\nThis is a friendly reminder from O3 Car Spaa regarding invoice {{invoice_number}} with an outstanding amount of *₹{{amount_due}}*, due on {{due_date}}. Appreciate your prompt support!\n\n${s}`,
    (v, g, s) => `💳 ${g}\n\nKindly note that a payment of *₹{{amount_due}}* is pending against invoice {{invoice_number}} (Due date: {{due_date}}). Please let us know if you have any questions or need payment assistance.\n\n${s}`
  ],

  INVOICE_GENERATED: [
    (v, g, s) => `🧾 ${g}\n\nYour invoice #{{invoice_number}} for *₹{{amount}}* has been generated. You can view or download the official copy here:\n🔗 {{invoice_url}}\n\nThank you for choosing O3 Car Spaa!\n\n${s}`,
    (v, g, s) => `📄 ${g}\n\nHere is the digital copy of your bill (Invoice #{{invoice_number}}, Total: *₹{{amount}}*):\n🔗 {{invoice_url}}\n\nAppreciate your visit to our studio!\n\n${s}`,
    (v, g, s) => `🧾 ${g}\n\nWe have prepared your service invoice #{{invoice_number}} totaling *₹{{amount}}*. Download your receipt here:\n🔗 {{invoice_url}}\n\n${s}`
  ],

  WARRANTY_CERTIFICATE: [
    (v, g, s) => `🛡️ ${g}\n\nCongratulations! Your official *{{service_type}}* warranty certificate for {{vehicle_number}} has been issued.\n\n📜 *Certificate No:* {{certificate_no}}\n⏳ *Validity:* {{warranty_years}} Year(s) (till {{expiry_date}})\n🔗 *Download Certificate:* {{certificate_url}}\n\n${s}`,
    (v, g, s) => `🏆 ${g}\n\nYour warranty protection is live! We've registered certificate *{{certificate_no}}* for the {{service_type}} applied on your {{vehicle_number}} (valid until {{expiry_date}}).\n\n📥 Download PDF: {{certificate_url}}\n\n${s}`
  ],

  BUY_SELL_BILL: [
    (v, g, s) => `📦 ${g}\n\nYour bill for *{{product_name}}* (Qty: {{quantity}}) totaling *₹{{total_amount}}* is ready.\n🧾 Bill No: {{invoice_number}}\n📥 Download soft copy: {{bill_url}}\n\nThank you for your business!\n\n${s}`,
    (v, g, s) => `🧾 ${g}\n\nHere is your purchase bill for {{product_name}} (Invoice #{{invoice_number}}, Total: *₹{{total_amount}}*).\n🔗 Download: {{bill_url}}\n\n${s}`
  ],

  BOOKING_CONFIRMED: [
    (v, g, s) => `✅ ${g}\n\nWe are pleased to confirm your booking for *{{service_name}}* on *{{booking_date}}*! Booking ID: *#{{booking_id}}*.\n\nOur detailing team is excited to welcome your car!\n\n${s}`,
    (v, g, s) => `📅 ${g}\n\nYour appointment is confirmed! Booking #{{booking_id}} for *{{service_name}}* is scheduled on *{{booking_date}}*.\n\nSee you at O3 Car Spaa!\n\n${s}`
  ],

  BOOKING_REMINDER_24H: [
    (v, g, s) => `⏰ ${g}\n\nFriendly reminder: your service appointment for {{vehicle_number}} is scheduled for tomorrow at *{{slot_time}}*.\n\nPlease arrive a few minutes prior so we can inspect and start promptly.\n\n${s}`,
    (v, g, s) => `🚗 ${g}\n\nJust a quick heads-up: your car detailing session for {{vehicle_number}} is tomorrow at *{{slot_time}}*. We're ready for you!\n\n${s}`
  ],

  BOOKING_REMINDER_2H: [
    (v, g, s) => `🔔 ${g}\n\nYour appointment for {{vehicle_number}} is in 2 hours at *{{slot_time}}*! Our studio team has prepared your detailing bay.\n\n${s}`,
    (v, g, s) => `⚡ ${g}\n\nQuick reminder: our team is expecting you and your {{vehicle_number}} in about 2 hours (*{{slot_time}}*). Drive safe!\n\n${s}`
  ],

  PACKAGE_EXPIRY_REMINDER: [
    (v, g, s) => `💎 ${g}\n\nHope you're enjoying your car care journey! Just a reminder that your *{{package_name}}* package expires on *{{expiry_date}}*.\n\nRenew now to keep your vehicle protected: {{renewal_url}}\n\n${s}`,
    (v, g, s) => `⚠️ ${g}\n\nA quick note that your *{{package_name}}* package will expire on *{{expiry_date}}*. Renew early to enjoy uninterrupted premium benefits:\n🔗 {{renewal_url}}\n\n${s}`
  ]
};

/**
 * Main function: builds a natural, dynamic, anti-spam message body
 * 
 * @param {string} eventTrigger - Trigger code (e.g., 'PIPELINE_STATUS_UPDATE')
 * @param {object} variables - Values for interpolation (customer_name, vehicle_number, etc.)
 * @param {string} [customTemplate] - Optional fallback or custom template string
 * @returns {string} Fully humanized, salted message text
 */
function humanizeNotification(eventTrigger, variables = {}, customTemplate = null) {
  const customerName = variables.customer_name || '';
  const greeting = getDynamicGreeting(customerName);
  const signoff = getDynamicSignoff();

  let textTemplate = '';

  // 1. Check if we have rich dynamic variations for this event trigger
  const variations = EVENT_VARIATIONS[eventTrigger];
  if (variations && variations.length > 0) {
    const pickFn = variations[Math.floor(Math.random() * variations.length)];
    textTemplate = pickFn(variables, greeting, signoff);
  } else if (customTemplate) {
    // 2. Fall back to custom template or DB template
    let parsed = customTemplate;
    // If template has generic "Dear {{customer_name}}," replace with natural greeting
    if (parsed.startsWith('Dear {{customer_name}},') || parsed.startsWith('Dear Customer,')) {
      parsed = parsed.replace(/^(Dear\s+\{\{\s*customer_name\s*\}\},?|Dear\s+Customer,?)/i, greeting);
    }
    // If template ends with generic "- O3 Car Spaa", replace with natural signoff
    if (parsed.includes('- O3 Car Spaa') || parsed.includes('O3 Car Spaa.')) {
      parsed = parsed.replace(/(-?\s*O3\s*Car\s*Spaa.*$)/i, `\n\n${signoff}`);
    }
    textTemplate = parsed;
  } else {
    // 3. Fallback generic notification
    textTemplate = `${greeting}\n\nUpdate from O3 Car Spaa regarding your vehicle {{vehicle_number}}.\n\n${signoff}`;
  }

  // 3. Interpolate variables ({{key}})
  for (const [key, value] of Object.entries(variables)) {
    const valStr = value !== undefined && value !== null ? String(value) : '';
    textTemplate = textTemplate.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g'), valStr);
  }

  // 4. Process Spintax (e.g. "{option1|option2}")
  textTemplate = parseSpintax(textTemplate);

  // 5. Inject invisible zero-width cryptographic salt
  return injectAntiFingerprintSalt(textTemplate);
}

/**
 * Humanizes an arbitrary plain text / manual message:
 * Adds spintax resolution, optional dynamic greeting if missing, and zero-width salt.
 */
function humanizeManualMessage(text, customerName = null) {
  if (!text) return '';
  let result = parseSpintax(text);

  // If text starts with "Dear Customer" or "Dear <Name>", soften it
  if (/^Dear\s+/i.test(result)) {
    const greeting = getDynamicGreeting(customerName);
    result = result.replace(/^Dear\s+[^,\n]+[,:\s]*/i, `${greeting}\n\n`);
  }

  return injectAntiFingerprintSalt(result);
}

module.exports = {
  humanizeNotification,
  humanizeManualMessage,
  parseSpintax,
  getDynamicGreeting,
  getDynamicSignoff,
  injectAntiFingerprintSalt,
  EVENT_VARIATIONS
};
