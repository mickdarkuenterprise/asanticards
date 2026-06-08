const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.json([
    { idx: 0, id: 'diaspora', name: 'Diaspora', delivery_time: '7–14 business days', price: '200' },
    { idx: 1, id: 'express', name: 'Express', delivery_time: '1–2 business days', price: '80' },
    { idx: 2, id: 'standard', name: 'Standard', delivery_time: '3–5 business days', price: '50' }
  ]);
});

module.exports = router;
