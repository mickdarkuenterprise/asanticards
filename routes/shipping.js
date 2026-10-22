const express = require('express');
const { SHIPPING_METHODS } = require('../lib/shipping');
const router = express.Router();

// Return the available shipping methods — the same list POST /api/orders charges from
router.get('/', (req, res) => {
  res.json(SHIPPING_METHODS);
});

module.exports = router;
