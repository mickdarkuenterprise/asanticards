const express = require('express');
const { body, validationResult } = require('express-validator');
const supabase = require('../lib/supabase');

const router = express.Router();

// ── POST /api/newsletter — public newsletter signup ───────────────
router.post(
  '/',
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email } = req.body;

    const { error } = await supabase
      .from('newsletter_subscribers')
      .upsert({ email, subscribed_at: new Date().toISOString() }, { onConflict: 'email' });

    if (error) {
      console.error('[error] Newsletter subscribe failed:', error.message);
      return res.status(500).json({ error: 'Could not subscribe' });
    }

    res.status(200).json({ success: true });
  }
);

module.exports = router;
