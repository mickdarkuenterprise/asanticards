const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const supabase = require('../lib/supabase');

const router = express.Router();

// ── POST /api/admin/login ────────────────────────────────────────
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password } = req.body;

    // Check against env (single admin) — swap for a DB users table later if needed
    if (email !== process.env.ADMIN_EMAIL) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { email, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({ token, expires_in: 28800 });
  }
);

// ── GET /api/admin/stats — dashboard summary ────────────────────
const { requireAuth } = require('../middleware/auth');

router.get('/stats', requireAuth, async (req, res) => {
  const [ordersResult, productsResult] = await Promise.all([
    supabase.from('orders').select('total, status'),
    supabase.from('products').select('id, name, stock').eq('active', true),
  ]);

  if (ordersResult.error || productsResult.error) {
    return res.status(500).json({ error: 'Failed to fetch stats' });
  }

  const orders = ordersResult.data;
  const products = productsResult.data;

  const paidOrders = orders.filter(o => o.status === 'paid');
  const revenue = paidOrders.reduce((s, o) => s + o.total, 0);
  const lowStock = products.filter(p => p.stock > 0 && p.stock <= 5);
  const outOfStock = products.filter(p => p.stock === 0);

  res.json({
    total_orders: orders.length,
    paid_orders: paidOrders.length,
    revenue,
    total_products: products.length,
    low_stock: lowStock,
    out_of_stock: outOfStock,
  });
});

module.exports = router;
