// Phone push notifications: the app registers / removes its token for the signed-in person.
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const push = require('../services/pushService');

const validToken = (t) => typeof t === 'string' && t.length >= 20 && t.length <= 255 && /^[\w:.\-]+$/.test(t);

router.post('/register', auth, async (req, res) => {
  const { token, platform } = req.body || {};
  if (!validToken(token)) return res.status(400).json({ success: false, error: 'Invalid device token' });
  if (req.user.is_impersonating) return res.json({ success: true, skipped: true }); // "open as" must not take over the phone
  try {
    await push.register(req.user.id, token, platform === 'ios' ? 'ios' : 'android');
    res.json({ success: true });
  } catch (err) {
    console.error('[push] register failed:', err.message);
    res.status(500).json({ success: false, error: 'Could not turn on notifications' });
  }
});

router.post('/unregister', auth, async (req, res) => {
  const { token } = req.body || {};
  if (!validToken(token)) return res.status(400).json({ success: false, error: 'Invalid device token' });
  try {
    await push.unregister(token, req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Could not turn off notifications' });
  }
});

// "Send me a test notification" — goes only to the signed-in person's own phones
router.post('/test', auth, async (req, res) => {
  const r = await push.sendToUsers([req.user.id], {
    title: 'O3 Car Spaa',
    body: 'Notifications are working on this phone ✅',
    url: req.user.role === 'customer' ? '/customer' : '/admin',
    tag: 'o3-test',
  });
  res.json({ success: true, data: r });
});

module.exports = router;
