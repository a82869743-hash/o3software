/**
 * routes/leads.js — Routes for Leads CRM, Unified Inbox, and AI Agent
 */
const router = require('express').Router();
require('../middleware/numericIds')(router, ['id']);
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const ctrl = require('../controllers/leadsController');

// ── CRM Leads ───────────────────────────────────────────────────────────────
// Public webhook: website / Instagram & Facebook Lead Ads / Google / JustDial / Zapier (x-lead-key header)
router.post('/capture', ctrl.captureLead);
router.get('/capture-key', auth, role(['admin']), ctrl.captureKey);
router.post('/import', auth, role(['staff']), ctrl.importLeads);
router.post('/:id/follow-up', auth, role(['staff']), ctrl.followUp);
router.post('/:id/convert', auth, role(['staff']), ctrl.convertLead);
router.post('/', auth, role(['staff']), ctrl.createLead);
router.get('/',                    auth, role(['staff']), ctrl.getLeads);
router.put('/:id',                 auth, role(['staff']), ctrl.updateLead);
router.get('/dashboard',          auth, role(['staff']), ctrl.getDashboardStats);

// ── Unified Inbox & Human Takeover ──────────────────────────────────────────
router.get('/conversations',       auth, role(['staff']), ctrl.getConversations);
router.get('/conversations/:id/messages', auth, role(['staff']), ctrl.getMessages);
router.post('/conversations/:id/agent-mode', auth, role(['admin']), ctrl.toggleAgentMode);
router.post('/conversations/:id/reply', auth, role(['staff']), ctrl.sendStaffReply);

// ── Knowledge Base ──────────────────────────────────────────────────────────
router.get('/knowledge-base',      auth, role(['staff']), ctrl.getKnowledgeBase);
router.post('/knowledge-base',     auth, role(['admin']), ctrl.saveKnowledgeArticle);
router.delete('/knowledge-base/:id', auth, role(['admin']), ctrl.deleteKnowledgeArticle);

// ── AI Agent Governance & Settings ──────────────────────────────────────────
router.get('/ai-settings',         auth, role(['admin']), ctrl.getAISettings);
router.post('/ai-settings',        auth, role(['admin']), ctrl.updateAISettings);

module.exports = router;
