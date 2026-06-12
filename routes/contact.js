const express = require('express');
const { body, validationResult } = require('express-validator');
const { sendContactMessage } = require('../lib/email');

const router = express.Router();

// ── POST /api/contact — public contact form ──────────────────────
router.post(
  '/',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('message').trim().notEmpty().withMessage('Message is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, email, message } = req.body;

    try {
      await sendContactMessage({ name, email, message });
      res.status(200).json({ success: true });
    } catch (err) {
      console.error('[error] Sending contact message failed:', err.message);
      res.status(500).json({ error: 'Could not send message' });
    }
  }
);

module.exports = router;
