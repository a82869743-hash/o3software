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

      const handoffReply = 'I understand your request and have escalated this conversation to our senior studio manager. They are reviewing your message and will assist you directly in a few moments.';
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

    // ── 9. Prompt Assembly & LLM Generation ──────────────────────────────────
    const systemPrompt = `You are the helpful, professional, and knowledgeable AI Assistant for "O3 Car Spaa", a premier multi-franchise car detailing studio.
Your goals:
1. Provide accurate answers about services (PPF, Ceramic Coating, Deep Interior Spa, Exterior Polish), pricing, studio hours, and booking.
2. NEVER invent or hallucinate prices or policies. Rely strictly on the Knowledge Base below.
3. Keep answers concise, warm, and structured (use bullet points and emojis where helpful).
4. If the customer mentions their car (e.g., Creta, Fortuner, City, Thar, Seltos), acknowledge the model and suggest the right package.
5. If the customer is looking to book, propose available morning (10:00 AM) or afternoon (2:30 PM) slots.
6. Support inquiries in English, Hindi, Gujarati, or Hinglish naturally.

VERIFIED KNOWLEDGE BASE:
${knowledgeContext}

STRICT GUARDRAILS:
- Never offer discounts beyond 10% on packages above ₹2,000.
- Never share data or details of other customers.
- If asked unrelated questions (coding, cooking, news), politely redirect to car detailing.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text }
    ];

    const llmResult = await llmManager.generateResponse({ messages, temperature: 0.3, maxTokens: 400 });
    const replyText = llmResult.text;

    // ── 10. Auto-Qualify Lead Based on Extracted Entities ────────────────────
    await this.qualifyLeadFromText(leadId, text);

    // ── 11. Record & Dispatch Response ───────────────────────────────────────
    await this.recordAndSendReply({
      conversationId,
      franchiseId,
      to: cleanPhone,
      replyText,
      confidenceScore: llmResult.confidence || 0.95
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
      agentMode: 'ai',
      replyText,
      leadId,
      conversationId
    };
  }

  /**
   * Record AI reply to conversation history and dispatch to customer
   */
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

    // Detect services
    if (lower.includes('ceramic')) detectedService = 'Ceramic Coating';
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
