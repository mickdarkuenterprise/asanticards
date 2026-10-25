const express = require('express');
const { body, validationResult } = require('express-validator');
const { sendReviewSubmission } = require('../lib/email');

const router = express.Router();

// ── POST /api/reviews — public review form ───────────────────────
// Reviews are emailed to the admin to read and approve; nothing is
// published automatically.
router.post(
  '/',
  [
    body('name').trim().notEmpty().isLength({ max: 60 }).withMessage('Name is required'),
    body('city').trim().notEmpty().isLength({ max: 60 }).withMessage('City is required'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('rating').isInt({ min: 1, max: 5 }).toInt().withMessage('Rating must be 1 to 5'),
    body('review').trim().isLength({ min: 10, max: 1500 }).withMessage('Review must be 10 to 1500 characters'),
    body('video_link').optional({ values: 'falsy' }).trim()
      .isURL({ protocols: ['http', 'https'], require_protocol: true }).withMessage('Video link must be a full web address'),
    body('consent').equals('true').withMessage('Permission to publish is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, city, email, rating, review, video_link } = req.body;

    try {
      await sendReviewSubmission({ name, city, email, rating, review, videoLink: video_link || null });
      res.status(200).json({ success: true });
    } catch (err) {
      console.error('[error] Sending review failed:', err.message);
      res.status(500).json({ error: 'Could not send your review' });
    }
  }
);

module.exports = router;
