/**
 * LeadsAgentService.js — Inbound WhatsApp Leads Agent & CRM Engine
 * Features:
 * - Unified Inbox syncing (lead creation, conversation lifecycle, 24-hour care window refresh)
 * - RAG-grounded contextual replies using per-franchise knowledge base
 * - Guardrail enforcement (no price hallucination, prompt injection defense, off-topic rejection)
 * - Automatic sentiment & dispute escalation to human staff
 * - Dynamic human takeover toggle per conversation
 * - Slot proposal and lead qualification pipeline
 */

const pool = require('../../config/db');
const whatsappManager = require('../whatsapp/WhatsAppManager');
const knowledgeBaseService = require('./KnowledgeBaseService');
const guardrailService = require('./GuardrailService');
const llmManager = require('./LLMManager');

const BOOKING_STATUS_MEANING = {
  pending: 'booked, waiting for the studio to confirm',
  confirmed: 'confirmed for that time; work has not started yet',
  in_progress: 'the car is at the studio and being worked on now; not ready yet',
  completed: 'work finished; the car is ready for pickup',
  reschedule_required: 'the studio needs to change the time; the team will call',
};
// rate-card order; stored keys: semi_sedan = Mini SUV, premium_sedan = Luxury, premium_suv = Luxury + SUV
const TIERS = [['Hatch', 'hatchback'], ['Sedan', 'sedan'], ['MiniSUV', 'semi_sedan'], ['SUV', 'suv'], ['Lux', 'premium_sedan'], ['LuxSUV', 'premium_suv']];
// "H ₹399 · S ₹499 · SUV ₹599 …" — only the car types the studio has priced
const tierPrices = (row) => TIERS.filter(([, c]) => Number(row[`price_${c}`]) > 0)
  .map(([k, c]) => `${k} ₹${Math.round(Number(row[`price_${c}`])).toLocaleString('en-IN')}`).join(' · ');
const humanDuration = (min) => {
  const m = Number(min) || 0;
  if (m >= 1440) return `${Math.round(m / 1440)} day${m >= 2880 ? 's' : ''}`;
  if (m >= 60) return `${+(m / 60).toFixed(1)} hours`;
  return `${m} minutes`;
};

class LeadsAgentService {
  /**
   * Process an incoming WhatsApp customer message
   * @param {Object} params
   * @param {string} params.phone - Customer phone number
   * @param {string} params.text - Inbound message body
   * @param {number} [params.franchiseId=1] - Franchise ID
   * @param {string} [params.senderName] - WhatsApp profile name
   * @returns {Promise<{ handled: boolean, replyText?: string, escalated?: boolean, agentMode: string }>}
   */
  async processInboundMessage({ phone, text, franchiseId = 1, senderName = 'Valued Customer' }) {
    let cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;

    console.log(`[LeadsAgent] 📩 Processing inbound message from +${cleanPhone}: "${text}"`);

    // ── 1. Opt-out "STOP" Keyword Check ──────────────────────────────────────
    const trimmedUpper = text.trim().toUpperCase();
    if (trimmedUpper === 'STOP' || trimmedUpper === 'UNSUBSCRIBE' || trimmedUpper === 'STOP ALL') {
      await pool.query(
        'INSERT IGNORE INTO whatsapp_opt_outs (phone, reason, opt_out_date) VALUES (?, ?, NOW())',
        [cleanPhone, 'Inbound STOP keyword']
      );
      console.log(`[LeadsAgent] 🛑 Registered opt-out for +${cleanPhone}`);
      return { handled: true, agentMode: 'opted_out', replyText: 'You have been opted out of messages from O3 Car Spaa.' };
    }

    // ── 2. Sync or Create Conversation in Unified Inbox ─────────────────────
    let conversationId;
    let agentMode = 'ai';

    const [existingConv] = await pool.query(
      'SELECT id, agent_mode, status FROM whatsapp_conversations WHERE franchise_id = ? AND phone = ?',
      [franchiseId, cleanPhone]
    );

    if (existingConv.length > 0) {
      conversationId = existingConv[0].id;
      agentMode = existingConv[0].agent_mode;

      await pool.query(`
        UPDATE whatsapp_conversations
        SET last_customer_message_at = NOW(),
            window_expires_at = DATE_ADD(NOW(), INTERVAL 24 HOUR),
            last_message_text = ?,
            customer_name = COALESCE(?, customer_name),
            unread_count = unread_count + 1,
            status = 'active',
            updated_at = NOW()
        WHERE id = ?
      `, [text, senderName, conversationId]);
    } else {
      const [newConv] = await pool.query(`
        INSERT INTO whatsapp_conversations (
          franchise_id, phone, customer_name, last_customer_message_at,
          window_expires_at, last_message_text, status, agent_mode, unread_count
        ) VALUES (?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 24 HOUR), ?, 'active', 'ai', 1)
      `, [franchiseId, cleanPhone, senderName, text]);
      conversationId = newConv.insertId;
    }

    // ── 3. Sync or Create CRM Lead ──────────────────────────────────────────
    let leadId;
    const [existingLead] = await pool.query(
      'SELECT id, stage, vehicle_model, service_interest FROM leads WHERE franchise_id = ? AND phone LIKE ?',
      [franchiseId, `%${cleanPhone.slice(-10)}`]
    );

    if (existingLead.length > 0) {
      leadId = existingLead[0].id;
      await pool.query(
        'UPDATE leads SET last_contacted_at = NOW(), name = COALESCE(?, name) WHERE id = ?',
        [senderName, leadId]
      );
    } else {
      const [newLead] = await pool.query(`
        INSERT INTO leads (franchise_id, phone, name, stage, source, last_contacted_at)
        VALUES (?, ?, ?, 'new', 'whatsapp_inbound', NOW())
      `, [franchiseId, cleanPhone, senderName]);
      leadId = newLead.insertId;
    }

    // ── 4. Log Customer Message to Unified Inbox Trail ───────────────────────
    await pool.query(`
      INSERT INTO lead_messages (conversation_id, franchise_id, sender_type, sender_name, message_text)
      VALUES (?, ?, 'customer', ?, ?)
    `, [conversationId, franchiseId, senderName, text]);

    // ── 5. Human Takeover Check ──────────────────────────────────────────────
    if (agentMode === 'human') {
      console.log(`[LeadsAgent] 👤 Conversation #${conversationId} is in HUMAN takeover mode. Skipping automated AI reply.`);
      return { handled: true, agentMode: 'human', conversationId, leadId };
    }

    // ── 6. Franchise AI Settings & Budget Cap Check ──────────────────────────
    const [aiSettings] = await pool.query(
      'SELECT is_enabled, cost_spent_this_month_inr, monthly_budget_cap_inr FROM franchise_ai_settings WHERE franchise_id = ?',
      [franchiseId]
    );

    const isAiEnabled = aiSettings.length ? Boolean(aiSettings[0].is_enabled) : true;
    const isBudgetExceeded = aiSettings.length
      ? Number(aiSettings[0].cost_spent_this_month_inr) >= Number(aiSettings[0].monthly_budget_cap_inr)
      : false;

    if (!isAiEnabled || isBudgetExceeded) {
      console.log(`[LeadsAgent] AI disabled or budget cap reached for Franchise #${franchiseId}. Escalating to human.`);
      await this.setAgentMode(conversationId, 'human');
      return { handled: true, agentMode: 'human', escalated: true };
    }

    // ── 7. Guardrail & Escalation Evaluation ─────────────────────────────────
    const escalation = guardrailService.isEscalationTriggered(text);
    if (escalation.triggered) {
      console.log(`[LeadsAgent] 🚨 Human escalation triggered: ${escalation.reason}`);
      await this.setAgentMode(conversationId, 'human');
      this.alertAdmins({ franchiseId, phone: cleanPhone, name: senderName, text, reason: escalation.reason }).catch(() => {});

      const handoffReply = 'Sure 🙏 I have passed this to our team. Someone will reply to you here shortly.';
      await this.recordAndSendReply({
        conversationId,
        franchiseId,
        to: cleanPhone,
        replyText: handoffReply,
        flaggedForReview: true
      });

      return {
        handled: true,
        agentMode: 'human',
        escalated: true,
        reason: escalation.reason,
        replyText: handoffReply
      };
    }

    // ── 8. RAG Knowledge Base Retrieval ──────────────────────────────────────
    const relevantArticles = await knowledgeBaseService.getRelevantKnowledge(franchiseId, text);
    const knowledgeContext = knowledgeBaseService.formatContext(relevantArticles);

    // ── 9. Live studio data (real services, prices, free slots, studio info) ──
    const context = await this.buildLiveContext(franchiseId, relevantArticles, cleanPhone);
    const [[aiCfg]] = await pool.query('SELECT custom_system_prompt FROM franchise_ai_settings WHERE franchise_id = ?', [franchiseId]).catch(() => [[null]]);

    // Full prices only for the services this chat is about (keeps each Groq call small for the free limit);
    // every other service is listed by name so the model knows it exists.
    const { findServices } = require('./StudioAgentProvider');
    const [recent] = await pool.query(
      "SELECT message_text FROM lead_messages WHERE conversation_id = ? AND sender_type = 'customer' ORDER BY id DESC LIMIT 5",
      [conversationId]
    ).catch(() => [[]]);
    let priced = findServices(text.toLowerCase(), context.services);
    for (const r of recent) { if (priced.length) break; priced = findServices(String(r.message_text || '').toLowerCase(), context.services); }
    if (!priced.length) priced = context.services.filter(sv => sv.is_featured).slice(0, 8);
    if (!priced.length) priced = context.services.slice(0, 8);
    const pricedSet = new Set(priced);
    const others = context.services.filter(sv => !pricedSet.has(sv)).map(sv => sv.name);
    // The car being asked about (this message → earlier ones → their saved car): give the model that one price,
    // so it never has to pick a column itself
    const { carFromText } = require('./StudioAgentProvider');
    const { CAR_TYPE_LABELS } = require('../../utils/carCategory');
    let askedCar = carFromText(text.toLowerCase());
    for (const r of recent) { if (askedCar) break; askedCar = carFromText(String(r.message_text || '').toLowerCase()); }
    if (!askedCar && context.customer?.car?.cat) askedCar = { cat: context.customer.car.cat, model: context.customer.car.model };
    const carLine = askedCar ? `${askedCar.model ? `${askedCar.model} = ` : ''}${CAR_TYPE_LABELS[askedCar.cat] || askedCar.cat}` : '';
    const priceOf = (row) => (askedCar && Number(row[`price_${askedCar.cat}`]) > 0
      ? `₹${Math.round(Number(row[`price_${askedCar.cat}`])).toLocaleString('en-IN')} for ${carLine}`
      : tierPrices(row));
    const servicesText = context.services.length
      ? `${askedCar ? `(Customer's car: ${carLine}. Quote exactly these prices.)\n` : ''}${priced.map(sv => `- ${sv.name}: ${priceOf(sv)}${sv.duration_minutes ? ` | takes ${humanDuration(sv.duration_minutes)}` : ''}`).join('\n')}${others.length
        ? `\nAlso offered (price not listed here, so don't quote one; ask which they want and the team will confirm): ${others.join('; ')}` : ''}`
      : '(no services listed yet — do not quote any price; say the team will share prices)';
    // say "today" / "tomorrow" next to each slot so the model never mixes up the days
    const dayOffset = (ymd) => Math.round((new Date(`${ymd}T00:00:00`) - new Date(new Date().toDateString())) / 86400000);
    const rel = { 0: ' (TODAY)', 1: ' (TOMORROW)', 2: ' (DAY AFTER TOMORROW)' };
    const hasTomorrow = context.slots.some(sl => dayOffset(sl.date) === 1);
    const slotsText = context.slots.length
      ? `${context.slots.slice(0, 8).map(sl => `- ${sl.label}${rel[dayOffset(sl.date)] || ''}`).join('\n')}${hasTomorrow ? '' : '\n(No free slots TOMORROW. If asked for tomorrow, say so clearly, then offer the nearest slots above.)'}`
      : '(no free slots listed — say the team will confirm a time)';
    const packagesText = context.packages.length
      ? context.packages.map(pk => `- ${pk.name}: ${priceOf(pk)}${pk.wash_count ? `, ${pk.wash_count} washes` : ''}${pk.package_validity ? `, valid ${pk.package_validity} months` : ''}`).join('\n')
      : '(none)';
    const productsText = context.products.length
      ? context.products.map(pr => `- ${pr.name}: ₹${pr.price}${pr.in_stock ? '' : ' (out of stock)'}`).join('\n')
      : '(none)';
    const cu = context.customer;
    const customerText = cu
      ? `Name: ${cu.name || '-'}${cu.car ? `\nCar: ${cu.car.label}` : ''}${cu.booking ? `\nCurrent booking: ${cu.booking.service || '-'} for ${cu.booking.when}. Status: ${BOOKING_STATUS_MEANING[cu.booking.status] || cu.booking.status}` : '\nNo open booking.'}`
      : '(new customer, not registered yet)';
    const offersText = [context.offer ? `- ${context.offer.text}` : '', context.firstWash ? '- First wash: 50% off wash services (this customer is eligible). Half price rounded to the nearest rupee: ₹399 → ₹200, ₹499 → ₹250.' : ''].filter(Boolean).join('\n') || '(no offers — do not promise any discount)';
    const st = context.studio;

    const systemPrompt = `You are the WhatsApp assistant of "${st.studio_name || 'O3 Car Spaa'}", a car detailing studio${st.address ? ` at ${st.address}` : ''}.
Reply like a friendly, helpful person from the studio — short WhatsApp-style messages (2–5 lines), simple words, a few emojis at most.
LANGUAGE: reply in the same language AND the same letters the customer used. Hinglish or Gujarati typed in English letters → reply in English letters (e.g. "Creta ke liye ceramic coating ₹22,499 hai"). Only use Hindi or Gujarati script if the customer wrote in that script.
PRICES: one price per car type. Hatch = hatchback (Swift, i20, Baleno, Alto), Sedan (Dzire, Amaze, City, Verna, Ciaz), MiniSUV = compact SUV (Nexon, Brezza, Venue, Sonet, XUV 3XO, Punch, Creta, Seltos, Grand Vitara, Elevate), SUV = mid-size or 7-seater (XUV700, Scorpio N, Harrier, Safari, Hector, Innova, Ertiga, Carens), Lux = luxury car (BMW 3, Audi A4, Mercedes C-Class), LuxSUV = luxury or large SUV (Fortuner, Gloster, BMW X5, Audi Q7). Pick the column for the customer's car. Write prices like ₹22,499. When several options fit (e.g. ceramic 1/2/3/5 years), list the main ones briefly and ask which they want.
BOOKING STATUS: say exactly what the status line says. Never tell a customer the car is ready unless the status says ready.

RULES
- Use ONLY the facts below. Never make up prices, offers, discounts, timings or policies. If something is not listed, say the team will confirm.
- Prices depend on car type (hatchback / sedan / SUV). If the car is mentioned, give the price for that type.
- To book: offer the free slots below${context.bookUrl ? ` and share the booking link ${context.bookUrl}` : ''}. Ask for the car number if needed.
- Never share other customers' details. If asked unrelated things, politely bring it back to car care.
- If the customer is angry, wants a refund or asks for a person, say a team member will reply soon.

STUDIO
Name: ${st.studio_name || 'O3 Car Spaa'}${st.address ? `
Address: ${st.address}` : ''}${st.mobile ? `
Phone: ${st.mobile}` : ''}${st.hours ? `
Timings: ${st.hours}` : ''}

SERVICES & PRICES
${servicesText}

PACKAGES
${packagesText}

PRODUCTS (order in the app, pay and collect at the studio)
${productsText}

OFFERS
${offersText}

THIS CUSTOMER
${customerText}

FREE SLOTS (next days)
${slotsText}

KNOWLEDGE BASE
${knowledgeContext || '(empty)'}${aiCfg?.custom_system_prompt ? `

EXTRA INSTRUCTIONS FROM THE STUDIO
${aiCfg.custom_system_prompt}` : ''}`;

    // Recent conversation so the agent remembers what was said (last 10 messages, oldest first)
    const [hist] = await pool.query(
      'SELECT sender_type, message_text FROM lead_messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 11',
      [conversationId]
    );
    const history = hist.reverse().slice(0, -1) // the newest row is the message we are answering
      .map(h => ({ role: h.sender_type === 'customer' ? 'user' : 'assistant', content: String(h.message_text || '') }))
      .filter(h => h.content);

    // Tell the model exactly how to write back: models drift into Hindi/Gujarati script otherwise
    const { detectLang, dayFromText } = require('./StudioAgentProvider');
    const lang = detectLang(text);
    // "kal", "parso", "Monday"…: work out the date here and tell the model whether that day has free slots
    const askedDay = dayFromText(text.toLowerCase());
    let dayNote = '';
    if (askedDay) {
      const dayName = new Date(`${askedDay.date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
      const free = context.slots.filter(sl => sl.date === askedDay.date).map(sl => sl.label.split(', ').pop());
      dayNote = free.length
        ? ` The customer is asking about ${dayName}: free times that day are ${free.join(', ')}.`
        : ` The customer is asking about ${dayName}: there are NO free slots that day. Say so, then offer the nearest free slots.`;
    }
    const script = /[ऀ-ॿ઀-૿]/.test(text);
    const langNote = lang === 'en' ? 'The customer wrote in English. Reply in English.'
      : script ? `The customer wrote in ${lang === 'gu' ? 'Gujarati' : 'Hindi'} script. Reply in the same script.`
        : `The customer wrote ${lang === 'gu' ? 'Gujarati' : 'Hinglish'} in English letters. Reply in ${lang === 'gu' ? 'Gujarati' : 'Hinglish'} using ONLY English letters — no Hindi or Gujarati script.`;
    const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    const messages = [
      { role: 'system', content: `${systemPrompt}

Today is ${today}.` },
      ...history,
      { role: 'system', content: langNote + dayNote },
      // repeating it next to the message is what makes smaller models follow it
      { role: 'user', content: lang === 'en' || script ? text : `${text}

[${langNote}]` }
    ];

    const llmResult = await llmManager.generateResponse({ messages, temperature: 0.3, maxTokens: 400, context });
    const replyText = llmResult.text;
    // The studio agent wasn't sure: a person takes over this chat
    if (llmResult.handover) {
      await this.setAgentMode(conversationId, 'human');
      this.alertAdmins({ franchiseId, phone: cleanPhone, name: senderName, text, reason: 'The AI could not answer this' }).catch(() => {});
    }

    // ── 10. Auto-Qualify Lead Based on Extracted Entities ────────────────────
    await this.qualifyLeadFromText(leadId, text);

    // ── 11. Record & Dispatch Response ───────────────────────────────────────
    await this.recordAndSendReply({
      conversationId,
      franchiseId,
      to: cleanPhone,
      replyText,
      confidenceScore: llmResult.confidence || 0.95,
      flaggedForReview: !!llmResult.handover
    });

    // Update token and budget usage
    await pool.query(`
      UPDATE franchise_ai_settings
      SET tokens_used_this_month = tokens_used_this_month + ?,
          cost_spent_this_month_inr = cost_spent_this_month_inr + 0.05
      WHERE franchise_id = ?
    `, [llmResult.tokensUsed || 50, franchiseId]);

    return {
      handled: true,
      agentMode: llmResult.handover ? 'human' : 'ai',
      replyText,
      leadId,
      conversationId
    };
  }

  /**
   * Real data the agent may quote: active services with prices, free slots (next 4 days), studio profile, KB hits.
   */
  async buildLiveContext(franchiseId, knowledge = [], phone = '') {
    const { getStudioProfile } = require('../studioProfile');
    const { guessCarCategory, normalizeCarType, CAR_TYPE_LABELS } = require('../../utils/carCategory');
    const none = () => [[]];
    const studio = await getStudioProfile(franchiseId).catch(() => ({}));
    const settings = studio.settings || {};
    const priceCols = 'price_hatchback, price_semi_sedan, price_sedan, price_premium_sedan, price_suv, price_premium_suv';

    const [services] = await pool.query(
      `SELECT name, ${priceCols}, duration_minutes, is_featured FROM services
       WHERE is_active = 1 AND (franchise_id = ? OR franchise_id IS NULL) ORDER BY sort_order, name LIMIT 150`,
      [franchiseId]
    ).catch(none);
    const [packages] = await pool.query(
      `SELECT name, ${priceCols}, wash_count, package_validity FROM packages
       WHERE is_active = 1 AND visible_to_customer = 1 AND (franchise_id = ? OR franchise_id IS NULL) ORDER BY sort_order, name LIMIT 10`,
      [franchiseId]
    ).catch(none);
    const [productRows] = await pool.query(
      `SELECT product_name, selling_price, quantity FROM inventory
       WHERE is_deleted = 0 AND (status = 'active' OR status IS NULL) AND selling_price > 0 AND (franchise_id = ? OR franchise_id IS NULL)
       ORDER BY product_name LIMIT 40`,
      [franchiseId]
    ).catch(none);
    // up to a week of free slots: the studio agent picks the day the customer asks for
    const [slotRows] = await pool.query(
      `SELECT slot_date, start_time FROM slots
       WHERE (franchise_id = ? OR franchise_id IS NULL) AND is_blocked = 0 AND (is_deleted = 0 OR is_deleted IS NULL)
         AND booked_count < max_capacity AND slot_date <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)
         AND (slot_date > CURDATE() OR (slot_date = CURDATE() AND start_time > CURTIME()))
       ORDER BY slot_date, start_time LIMIT 40`,
      [franchiseId]
    ).catch(none);
    // the whole FAQ: the studio agent scores it itself
    const [allKnowledge] = await pool.query(
      'SELECT category, title, content, keywords FROM franchise_knowledge_base WHERE franchise_id = ? AND is_active = 1',
      [franchiseId]
    ).catch(none);

    const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const timeLabel = (t) => {
      const [h, m] = String(t).split(':').map(Number);
      return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
    };
    const dayLabel = (d) => new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
    const slots = slotRows.map(r => ({ date: ymd(new Date(r.slot_date)), label: `${dayLabel(r.slot_date)}, ${timeLabel(r.start_time)}` }));

    // Home-screen offer, only while it is switched on and not expired
    let offer = null;
    const ov = Number(settings.app_offer_value) || 0;
    const till = settings.app_offer_valid_till ? new Date(`${settings.app_offer_valid_till}T23:59:59`) : null;
    if (ov > 0 && (!till || till >= new Date())) {
      const min = Number(settings.app_offer_min_amount) || 0;
      offer = {
        text: [settings.app_offer_title, settings.app_offer_type === 'percent' ? `${ov}% off` : `₹${ov} off`,
          settings.app_offer_code ? `code ${settings.app_offer_code}` : '', min ? `on bills above ₹${min}` : '',
          till ? `till ${till.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''].filter(Boolean).join(' · '),
      };
    }

    // Who is writing: a registered customer's name, car, first-wash eligibility and open booking
    let customer = null;
    let firstWash = false;
    const last10 = String(phone || '').replace(/\D/g, '').slice(-10);
    if (last10.length === 10) {
      const [[u]] = await pool.query(
        `SELECT id, name FROM users WHERE role = 'customer' AND (is_deleted = 0 OR is_deleted IS NULL)
           AND (mobile LIKE ? OR whatsapp_number LIKE ?) ORDER BY id LIMIT 1`,
        [`%${last10}`, `%${last10}`]
      ).catch(() => [[null]]);
      if (u) {
        customer = { id: u.id, name: u.name };
        const [[v]] = await pool.query(
          'SELECT brand, model, category FROM vehicles WHERE customer_id = ? ORDER BY is_primary DESC, id DESC LIMIT 1', [u.id]
        ).catch(() => [[null]]);
        if (v) {
          const cat = normalizeCarType(v.category) || guessCarCategory(v.brand, v.model);
          const model = [v.brand, v.model].filter(Boolean).join(' ');
          customer.car = { cat, model, label: `${model}${cat ? ` (${CAR_TYPE_LABELS[cat]})` : ''}` };
        }
        const [[b]] = await pool.query(
          `SELECT b.status, b.vehicle_brand, b.vehicle_model, b.package_service_name, s.name AS service_name, sl.slot_date, sl.start_time
             FROM bookings b
             LEFT JOIN services s ON s.id = b.service_id
             LEFT JOIN slots sl ON sl.id = b.slot_id
            WHERE b.customer_id = ?
              AND (b.status IN ('pending', 'confirmed', 'in_progress', 'reschedule_required')
                   OR (b.status = 'completed' AND b.delivered_at IS NULL AND b.completed_at >= DATE_SUB(NOW(), INTERVAL 2 DAY)))
            ORDER BY FIELD(b.status, 'in_progress', 'completed', 'confirmed', 'pending', 'reschedule_required'), b.id DESC LIMIT 1`,
          [u.id]
        ).catch(() => [[null]]);
        if (b) {
          customer.booking = {
            status: b.status,
            service: b.service_name || b.package_service_name || '',
            car: [b.vehicle_brand, b.vehicle_model].filter(Boolean).join(' '),
            when: b.slot_date ? `${dayLabel(b.slot_date)}${b.start_time ? `, ${timeLabel(b.start_time)}` : ''}` : '',
          };
        }
        const { checkFirstWashEligibility } = require('../../utils/firstWashHelper');
        firstWash = (await checkFirstWashEligibility(pool, u.id).catch(() => ({ isEligible: false }))).isEligible;
      } else {
        firstWash = true; // not registered yet: their first booking gets the first-wash offer
      }
    }

    const base = (process.env.CLIENT_URL || '').split(',')[0].trim().replace(/\/+$/, '');
    return {
      studio: { ...studio, hours: settings.support_hours || settings.studio_hours || '', maps_url: settings.studio_maps_url || settings.google_maps_url || '' },
      services,
      packages,
      products: productRows.map(p => ({ name: p.product_name, price: Number(p.selling_price), in_stock: Number(p.quantity) > 0 })),
      slots,
      offer,
      firstWash,
      customer,
      pickupCharge: Number(settings.pickup_charge || settings.pickup_drop_charge || 0),
      knowledge: allKnowledge.length ? allKnowledge : knowledge,
      bookUrl: base ? `${base}/customer/bookings/new` : null,
    };
  }

  /**
   * Record AI reply to conversation history and dispatch to customer
   */
  /**
   * A chat was handed to a person: WhatsApp the studio admins (and super admin) so someone replies.
   * The phone that scanned the QR gets messages from itself silently, so admins' own numbers come first.
   */
  async alertAdmins({ franchiseId = 1, phone, name, text, reason }) {
    const [rows] = await pool.query(
      `SELECT DISTINCT mobile FROM users
       WHERE is_active = 1 AND mobile IS NOT NULL AND mobile <> ''
         AND (role = 'super_admin' OR (role = 'admin' AND franchise_id = ?))`, [franchiseId]);
    const own = String(process.env.ADMIN_WHATSAPP_NUMBER || '').replace(/\D/g, '').slice(-10);
    const last10 = (m) => String(m).replace(/\D/g, '').slice(-10);
    let to = rows.map(r => last10(r.mobile)).filter(m => m.length === 10 && m !== own && m !== last10(phone));
    if (!to.length && own) to = [own];
    const appUrl = (process.env.ADMIN_APP_URL || process.env.APP_URL || '').replace(/\/$/, '');
    const msg = `🚨 *Customer needs a person*\n` +
      `${name || 'Customer'} (+${String(phone).replace(/\D/g, '')})\n` +
      `Reason: ${reason || 'handover'}\n` +
      `Last message: "${String(text || '').slice(0, 300)}"\n\n` +
      `The AI has stopped replying in this chat. Please reply from the WhatsApp inbox${appUrl ? `: ${appUrl}/admin/whatsapp` : '.'}`;
    for (const m of to) {
      try { await whatsappManager.sendFreeForm({ to: m, text: msg, franchiseId }); }
      catch (err) { console.warn(`[LeadsAgent] Admin alert to ${m} failed: ${err.message}`); }
    }
    console.log(`[LeadsAgent] 🚨 Handover alert sent to ${to.length} admin number(s) for +${phone}`);
    return to;
  }

  async recordAndSendReply({ conversationId, franchiseId, to, replyText, confidenceScore = 0.95, flaggedForReview = false }) {
    // 1. Log in database
    await pool.query(`
      INSERT INTO lead_messages (
        conversation_id, franchise_id, sender_type, sender_name,
        message_text, confidence_score, flagged_for_review
      ) VALUES (?, ?, 'ai_agent', 'O3 Car Spaa AI', ?, ?, ?)
    `, [conversationId, franchiseId, replyText, confidenceScore, flaggedForReview ? 1 : 0]);

    // 2. Dispatch via WhatsAppManager
    try {
      await whatsappManager.sendFreeForm({
        to,
        text: replyText,
        franchiseId
      });
    } catch (err) {
      console.warn(`[LeadsAgent] Outbound dispatch notice (+${to}): ${err.message}`);
    }
  }

  /**
   * Qualify lead details from customer message text
   */
  async qualifyLeadFromText(leadId, text) {
    const lower = text.toLowerCase();
    let detectedModel = null;
    let detectedService = null;

    // Detect common Indian vehicle models
    const carModels = ['creta', 'seltos', 'fortuner', 'scorpio', 'thar', 'innova', 'baleno', 'swift', 'harrier', 'safari', 'xuv700', 'city', 'verna', 'brezza', 'nexon', 'bmw', 'audi', 'mercedes'];
    for (const m of carModels) {
      if (lower.includes(m)) {
        detectedModel = m.charAt(0).toUpperCase() + m.slice(1);
        break;
      }
    }

    // Detect services — prefer a real service name from the catalogue
    try {
      const [svcs] = await pool.query('SELECT name FROM services WHERE is_active = 1');
      const hit = svcs.find(s => s.name.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3).some(w => lower.includes(w)));
      if (hit) detectedService = hit.name;
    } catch { /* fall back to keywords */ }
    if (detectedService) { /* found in catalogue */ }
    else if (lower.includes('ceramic')) detectedService = 'Ceramic Coating';
    else if (lower.includes('ppf')) detectedService = 'Paint Protection Film';
    else if (lower.includes('interior') || lower.includes('steam')) detectedService = 'Deep Interior Spa';
    else if (lower.includes('wash') || lower.includes('rubbing')) detectedService = 'Exterior Spa & Polish';

    if (detectedModel || detectedService) {
      await pool.query(`
        UPDATE leads
        SET vehicle_model = COALESCE(?, vehicle_model),
            service_interest = COALESCE(?, service_interest),
            stage = CASE WHEN stage = 'new' THEN 'qualified' ELSE stage END,
            updated_at = NOW()
        WHERE id = ?
      `, [detectedModel, detectedService, leadId]);
    }
  }

  /**
   * Toggle between AI Agent and Human Takeover
   */
  async setAgentMode(conversationId, mode) {
    if (!['ai', 'human'].includes(mode)) throw new Error('Invalid agent mode');
    await pool.query(
      'UPDATE whatsapp_conversations SET agent_mode = ?, updated_at = NOW() WHERE id = ?',
      [mode, conversationId]
    );
    console.log(`[LeadsAgent] Conversation #${conversationId} agent_mode switched to "${mode}"`);
    return { success: true, conversationId, mode };
  }
}

module.exports = new LeadsAgentService();
