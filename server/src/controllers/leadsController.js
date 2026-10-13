/**
 * leadsController.js — Unified Inbox, Leads CRM, and AI Knowledge Base Controller
 */
const pool = require('../config/db');
const leadsAgentService = require('../services/ai/LeadsAgentService');
const whatsappManager = require('../services/whatsapp/WhatsAppManager');

// ── 1. Leads CRM Endpoints ───────────────────────────────────────────────────

/** GET /api/leads — list CRM leads with stage filters */
exports.getLeads = async (req, res) => {
  try {
    const franchiseId = req.user.franchise_id || 1;
    const { stage, search, page = 1, limit = 50 } = req.query;

    let where = 'franchise_id = ?';
    const params = [franchiseId];

    if (stage) {
      where += ' AND stage = ?';
      params.push(stage);
    }
    if (search) {
      where += ' AND (phone LIKE ? OR name LIKE ? OR vehicle_model LIKE ? OR service_interest LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    const offset = (Number(page) - 1) * Number(limit);
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM leads WHERE ${where}`,
      params
    );

    const [rows] = await pool.query(
      `SELECT * FROM leads WHERE ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset]
    );

    res.json({
      success: true,
      data: rows,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/** PUT /api/leads/:id — update lead stage, details, notes */
exports.updateLead = async (req, res) => {
  try {
    const { id } = req.params;
    const franchiseId = req.user.franchise_id || 1;
    const { stage, vehicle_model, service_interest, timeline, notes } = req.body;

    await pool.query(`
      UPDATE leads
      SET stage = COALESCE(?, stage),
          vehicle_model = COALESCE(?, vehicle_model),
          service_interest = COALESCE(?, service_interest),
          timeline = COALESCE(?, timeline),
          notes = COALESCE(?, notes),
          updated_at = NOW()
      WHERE id = ? AND franchise_id = ?
    `, [stage, vehicle_model, service_interest, timeline, notes, id, franchiseId]);

    res.json({ success: true, message: 'Lead updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ── 2. Unified Inbox & Human Takeover ────────────────────────────────────────

/** GET /api/leads/conversations — list WhatsApp conversations */
exports.getConversations = async (req, res) => {
  try {
    const franchiseId = req.user.franchise_id || 1;
    const [rows] = await pool.query(`
      SELECT 
        c.*,
        l.id AS lead_id,
        l.stage AS lead_stage,
        l.vehicle_model,
        l.service_interest
      FROM whatsapp_conversations c
      LEFT JOIN leads l ON l.franchise_id = c.franchise_id AND (l.phone = c.phone OR l.phone LIKE CONCAT('%', RIGHT(c.phone, 10)))
      WHERE c.franchise_id = ?
      ORDER BY c.last_customer_message_at DESC, c.updated_at DESC
      LIMIT 100
    `, [franchiseId]);

    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/** GET /api/leads/conversations/:id/messages — get conversation chat history */
exports.getMessages = async (req, res) => {
  try {
    const { id } = req.params;
    const franchiseId = req.user.franchise_id || 1;

    // Reset unread count
    await pool.query(
      'UPDATE whatsapp_conversations SET unread_count = 0 WHERE id = ? AND franchise_id = ?',
      [id, franchiseId]
    );

    const [rows] = await pool.query(`
      SELECT * FROM lead_messages
      WHERE conversation_id = ? AND franchise_id = ?
      ORDER BY created_at ASC
    `, [id, franchiseId]);

    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/** POST /api/leads/conversations/:id/agent-mode — human takeover toggle */
exports.toggleAgentMode = async (req, res) => {
  try {
    const { id } = req.params;
    const { mode } = req.body; // 'ai' or 'human'

    const result = await leadsAgentService.setAgentMode(id, mode);
    res.json({ success: true, data: result, message: `Conversation agent mode set to ${mode}` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/** POST /api/leads/conversations/:id/reply — staff manual reply */
exports.sendStaffReply = async (req, res) => {
  try {
    const { id } = req.params;
    const franchiseId = req.user.franchise_id || 1;
    const { text } = req.body;
    const staffName = req.user.name || 'Studio Staff';

    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, error: 'Message text is required' });
    }

    const [conv] = await pool.query(
      'SELECT phone FROM whatsapp_conversations WHERE id = ? AND franchise_id = ?',
      [id, franchiseId]
    );
    if (!conv.length) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const phone = conv[0].phone;

    // 1. Log staff message
    await pool.query(`
      INSERT INTO lead_messages (conversation_id, franchise_id, sender_type, sender_name, message_text)
      VALUES (?, ?, 'human_staff', ?, ?)
    `, [id, franchiseId, staffName, text.trim()]);

    // 2. Dispatch via WhatsAppManager
    const dispatchRes = await whatsappManager.sendFreeForm({
      to: phone,
      text: text.trim(),
      franchiseId
    });

    res.json({ success: true, data: dispatchRes, message: 'Reply sent successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ── 3. Knowledge Base Endpoints ──────────────────────────────────────────────

/** GET /api/leads/knowledge-base — list KB articles */
exports.getKnowledgeBase = async (req, res) => {
  try {
    const franchiseId = req.user.franchise_id || 1;
    const [rows] = await pool.query(
      'SELECT * FROM franchise_knowledge_base WHERE franchise_id = ? ORDER BY category, title',
      [franchiseId]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/** POST /api/leads/knowledge-base — create or update KB article */
exports.saveKnowledgeArticle = async (req, res) => {
  try {
    const franchiseId = req.user.franchise_id || 1;
    const { id, category, title, content, keywords, is_active = 1 } = req.body;

    if (!title || !content || !category) {
      return res.status(400).json({ success: false, error: 'category, title, and content are required' });
    }

    if (id) {
      await pool.query(`
        UPDATE franchise_knowledge_base
        SET category = ?, title = ?, content = ?, keywords = ?, is_active = ?, updated_at = NOW()
        WHERE id = ? AND franchise_id = ?
      `, [category, title, content, keywords, is_active, id, franchiseId]);
      return res.json({ success: true, message: 'Knowledge article updated' });
    }

    const [result] = await pool.query(`
      INSERT INTO franchise_knowledge_base (franchise_id, category, title, content, keywords, is_active)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [franchiseId, category, title, content, keywords, is_active]);

    res.json({ success: true, message: 'Knowledge article created', id: result.insertId });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/** DELETE /api/leads/knowledge-base/:id — delete KB article */
exports.deleteKnowledgeArticle = async (req, res) => {
  try {
    const { id } = req.params;
    const franchiseId = req.user.franchise_id || 1;
    await pool.query(
      'DELETE FROM franchise_knowledge_base WHERE id = ? AND franchise_id = ?',
      [id, franchiseId]
    );
    res.json({ success: true, message: 'Article deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ── 4. AI Settings & Dashboard Metrics ───────────────────────────────────────

/** GET /api/leads/ai-settings — get franchise AI configuration */
exports.getAISettings = async (req, res) => {
  try {
    const franchiseId = req.user.franchise_id || 1;
    const [rows] = await pool.query(
      'SELECT * FROM franchise_ai_settings WHERE franchise_id = ?',
      [franchiseId]
    );
    const settings = rows[0] || {
      franchise_id: franchiseId,
      is_enabled: 1,
      sandbox_mode: 0,
      model_name: 'gpt-4o-mini',
      monthly_budget_cap_inr: 2000.00,
      cost_spent_this_month_inr: 0.00
    };
    res.json({ success: true, data: settings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/** POST /api/leads/ai-settings — update AI configuration */
exports.updateAISettings = async (req, res) => {
  try {
    const franchiseId = req.user.franchise_id || 1;
    const { is_enabled, sandbox_mode, monthly_budget_cap_inr, custom_system_prompt } = req.body;

    await pool.query(`
      INSERT INTO franchise_ai_settings (franchise_id, is_enabled, sandbox_mode, monthly_budget_cap_inr, custom_system_prompt)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        is_enabled = COALESCE(VALUES(is_enabled), is_enabled),
        sandbox_mode = COALESCE(VALUES(sandbox_mode), sandbox_mode),
        monthly_budget_cap_inr = COALESCE(VALUES(monthly_budget_cap_inr), monthly_budget_cap_inr),
        custom_system_prompt = COALESCE(VALUES(custom_system_prompt), custom_system_prompt),
        updated_at = NOW()
    `, [franchiseId, is_enabled !== undefined ? (is_enabled ? 1 : 0) : 1, sandbox_mode ? 1 : 0, monthly_budget_cap_inr, custom_system_prompt]);

    res.json({ success: true, message: 'AI settings updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/** GET /api/leads/dashboard — pipeline conversion funnel & metrics */
exports.getDashboardStats = async (req, res) => {
  try {
    const franchiseId = req.user.franchise_id || 1;

    const [stageCounts] = await pool.query(`
      SELECT stage, COUNT(*) as count
      FROM leads
      WHERE franchise_id = ?
      GROUP BY stage
    `, [franchiseId]);

    const [[{ totalLeads }]] = await pool.query(
      'SELECT COUNT(*) as totalLeads FROM leads WHERE franchise_id = ?',
      [franchiseId]
    );

    const [[{ activeConversations }]] = await pool.query(
      "SELECT COUNT(*) as activeConversations FROM whatsapp_conversations WHERE franchise_id = ? AND status = 'active'",
      [franchiseId]
    );

    const [[{ humanTakeoverCount }]] = await pool.query(
      "SELECT COUNT(*) as humanTakeoverCount FROM whatsapp_conversations WHERE franchise_id = ? AND agent_mode = 'human'",
      [franchiseId]
    );

    res.json({
      success: true,
      data: {
        totalLeads,
        activeConversations,
        humanTakeoverCount,
        stages: stageCounts
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
