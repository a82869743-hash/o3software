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
    const franchiseId = req.franchiseId || req.user.franchise_id || 1;
    const { stage, search, source, direction, page = 1, limit = 50 } = req.query;

    let where = 'franchise_id = ?';
    const params = [franchiseId];
    if (source) { where += ' AND source = ?'; params.push(source); }
    if (direction) { where += ' AND direction = ?'; params.push(direction); }

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
    const STAGES = ['new', 'contacted', 'qualified', 'booked', 'converted', 'lost'];
    if (stage !== undefined && stage !== null && !STAGES.includes(stage)) {
      return res.status(400).json({ success: false, error: `Stage must be one of: ${STAGES.join(', ')}` });
    }
    const [upd] = await pool.query(`
      UPDATE leads
      SET stage = COALESCE(?, stage),
          vehicle_model = COALESCE(?, vehicle_model),
          service_interest = COALESCE(?, service_interest),
          timeline = COALESCE(?, timeline),
          notes = COALESCE(?, notes),
          updated_at = NOW()
      WHERE id = ? AND franchise_id = ?
    `, [stage, vehicle_model, service_interest, timeline, notes, id, franchiseId]);
    if (!upd.affectedRows) return res.status(404).json({ success: false, error: 'Lead not found' });

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
    if (!/^\d+$/.test(String(id))) return res.status(404).json({ success: false, error: 'Conversation not found' });
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
    if (!['ai', 'human'].includes(mode)) return res.status(400).json({ success: false, error: "Mode must be 'ai' or 'human'" });
    const [[conv]] = await pool.query('SELECT id FROM whatsapp_conversations WHERE id = ?', [id]);
    if (!conv) return res.status(404).json({ success: false, error: 'Conversation not found' });

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
    const [del] = await pool.query(
      'DELETE FROM franchise_knowledge_base WHERE id = ? AND franchise_id = ?',
      [id, franchiseId]
    );
    if (!del.affectedRows) return res.status(404).json({ success: false, error: 'Article not found' });
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
    const franchiseId = Number(req.franchiseId) || Number(req.user.franchise_id) || 1;
    const { is_enabled, sandbox_mode, monthly_budget_cap_inr, custom_system_prompt } = req.body;
    if (monthly_budget_cap_inr !== undefined && monthly_budget_cap_inr !== null && monthly_budget_cap_inr !== '' && !(Number(monthly_budget_cap_inr) >= 0)) {
      return res.status(400).json({ success: false, error: 'Monthly budget must be 0 or more' });
    }
    // only the fields that were sent are changed (a new studio row starts with the table defaults)
    await pool.query('INSERT IGNORE INTO franchise_ai_settings (franchise_id) VALUES (?)', [franchiseId]);
    const sets = []; const vals = [];
    if (is_enabled !== undefined) { sets.push('is_enabled = ?'); vals.push(is_enabled ? 1 : 0); }
    if (sandbox_mode !== undefined) { sets.push('sandbox_mode = ?'); vals.push(sandbox_mode ? 1 : 0); }
    if (monthly_budget_cap_inr !== undefined && monthly_budget_cap_inr !== '') { sets.push('monthly_budget_cap_inr = ?'); vals.push(monthly_budget_cap_inr === null ? null : Number(monthly_budget_cap_inr)); }
    if (custom_system_prompt !== undefined) { sets.push('custom_system_prompt = ?'); vals.push(custom_system_prompt); }
    if (sets.length) await pool.query(`UPDATE franchise_ai_settings SET ${sets.join(', ')}, updated_at = NOW() WHERE franchise_id = ?`, [...vals, franchiseId]);

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

// ── 4. Lead capture from every source ───────────────────────────────────────
const { upsertLead, SOURCES } = require('../services/leadIntake');
const fidOf = (req) => Number(req.franchiseId) || Number(req.user?.franchise_id) || 1;
const stamp = () => new Date().toISOString().slice(0, 16).replace('T', ' ');

/** POST /api/leads — add a lead manually (walk-in, phone call, outbound list, Instagram DM, ...) */
exports.createLead = async (req, res) => {
  try {
    const r = await upsertLead({ ...req.body, franchiseId: fidOf(req) });
    res.status(r.created ? 201 : 200).json({ success: true, data: r, message: r.created ? 'Lead added' : 'Existing open lead updated (same mobile)' });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ success: false, error: err.message });
    console.error('createLead error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

/** POST /api/leads/import { rows: [{ name, mobile, email, vehicle_model, service_interest, source, campaign, notes }] } */
exports.importLeads = async (req, res) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows.slice(0, 5000) : [];
    if (!rows.length) return res.status(400).json({ success: false, error: 'No rows to import' });
    let created = 0, updated = 0;
    const errors = [];
    for (let i = 0; i < rows.length; i++) {
      try {
        const r = await upsertLead({ source: 'excel_import', direction: req.body.direction || 'outbound', ...rows[i], franchiseId: fidOf(req) });
        if (r.created) created++; else updated++;
      } catch (e) { errors.push({ row: i + 2, error: e.message }); }
    }
    res.json({ success: true, data: { created, updated, failed: errors.length, errors: errors.slice(0, 50) },
      message: `${created} new lead(s), ${updated} updated, ${errors.length} skipped` });
  } catch (err) {
    console.error('importLeads error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

/**
 * POST /api/leads/capture  (public webhook)
 * Header x-lead-key: <lead capture key>  — website form, Meta (Instagram/Facebook) Lead Ads, Google lead forms,
 * JustDial, Zapier/Make. Body: { name, mobile|phone, email, vehicle_model, service_interest, source, campaign, message }
 */
exports.captureLead = async (req, res) => {
  try {
    const key = String(req.headers['x-lead-key'] || req.query.key || '');
    if (!key) return res.status(401).json({ success: false, error: 'Missing lead capture key' });
    const [[row]] = await pool.query("SELECT franchise_id FROM settings WHERE key_name = 'lead_capture_key' AND value = ? LIMIT 1", [key]);
    if (!row) return res.status(401).json({ success: false, error: 'Invalid lead capture key' });
    const b = req.body || {};
    const r = await upsertLead({
      franchiseId: row.franchise_id, name: b.name || b.full_name, phone: b.mobile || b.phone || b.phone_number, email: b.email,
      vehicle_model: b.vehicle_model || b.car, service_interest: b.service_interest || b.service, source: b.source || 'website',
      campaign: b.campaign || b.ad_name, notes: b.message || b.notes, direction: 'inbound',
    });
    res.status(201).json({ success: true, data: { id: r.id } });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ success: false, error: err.message });
    console.error('captureLead error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

/** GET /api/leads/capture-key[?rotate=1] — webhook key + URL for connecting lead sources */
exports.captureKey = async (req, res) => {
  try {
    if (!['admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Only the studio admin can see the lead key' });
    }
    const fid = fidOf(req);
    let [[row]] = await pool.query("SELECT value FROM settings WHERE franchise_id = ? AND key_name = 'lead_capture_key'", [fid]);
    if (!row || req.query.rotate === '1') {
      const key = require('crypto').randomBytes(18).toString('hex');
      await pool.query("INSERT INTO settings (franchise_id, key_name, value) VALUES (?, 'lead_capture_key', ?) ON DUPLICATE KEY UPDATE value = VALUES(value)", [fid, key]);
      row = { value: key };
    }
    const base = process.env.APP_BASE_URL || process.env.SERVER_URL || '';
    res.json({ success: true, data: { key: row.value, url: `${base}/api/leads/capture`, sources: SOURCES } });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

/** POST /api/leads/:id/follow-up { message, next_follow_up_at } — outbound WhatsApp + schedule next follow-up */
exports.followUp = async (req, res) => {
  try {
    const [[lead]] = await pool.query('SELECT * FROM leads WHERE id = ? AND franchise_id = ?', [req.params.id, fidOf(req)]);
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
    const msg = String(req.body.message || '').trim();
    if (msg) {
      const [[opt]] = await pool.query('SELECT 1 AS x FROM whatsapp_opt_outs WHERE RIGHT(phone,10) = RIGHT(?,10) LIMIT 1', [lead.phone]);
      if (opt) return res.status(422).json({ success: false, error: 'This number opted out of WhatsApp messages' });
      await require('../services/notificationService').notify({
        mobile: lead.phone, customMessageBody: msg, channels: ['whatsapp'], franchiseId: lead.franchise_id,
        referenceType: 'lead', referenceId: lead.id,
      });
    }
    const note = msg ? `[${stamp()} · follow-up by ${req.user.name || 'staff'}] ${msg}` : null;
    await pool.query(
      `UPDATE leads SET stage = IF(stage = 'new', 'contacted', stage), last_contacted_at = IF(? IS NULL, last_contacted_at, NOW()),
         next_follow_up_at = ?, assigned_to = COALESCE(assigned_to, ?), notes = IF(? IS NULL, notes, CONCAT_WS(CHAR(10), notes, ?))
       WHERE id = ?`,
      [note, req.body.next_follow_up_at || null, req.user.id, note, note, lead.id]
    );
    res.json({ success: true, message: msg ? 'Follow-up sent on WhatsApp' : 'Follow-up scheduled' });
  } catch (err) {
    console.error('followUp error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

/** POST /api/leads/:id/convert — create/link the customer and return job card prefill */
exports.convertLead = async (req, res) => {
  try {
    const [[lead]] = await pool.query('SELECT * FROM leads WHERE id = ? AND franchise_id = ?', [req.params.id, fidOf(req)]);
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
    const mobile = String(lead.phone).replace(/\D/g, '').slice(-10);
    let [[cust]] = await pool.query('SELECT id, role FROM users WHERE mobile = ?', [mobile]);
    if (cust && cust.role !== 'customer') return res.status(409).json({ success: false, error: 'This mobile belongs to a staff account' });
    if (!cust) {
      const [ins] = await pool.query(
        "INSERT INTO users (name, mobile, password_hash, role, franchise_id) VALUES (?, ?, 'manual', 'customer', ?)",
        [lead.name || 'Customer', mobile, lead.franchise_id]
      );
      await pool.query('INSERT IGNORE INTO loyalty (customer_id) VALUES (?)', [ins.insertId]);
      cust = { id: ins.insertId };
    }
    await pool.query("UPDATE leads SET stage = 'converted', customer_id = ?, updated_at = NOW() WHERE id = ?", [cust.id, lead.id]);
    res.json({ success: true, message: 'Lead converted to customer', data: {
      customer_id: cust.id, customer_name: lead.name, customer_mobile: mobile,
      notes: `From lead #${lead.id} (${lead.source}). Interested in: ${lead.service_interest || '-'}`,
    } });
  } catch (err) {
    console.error('convertLead error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};
