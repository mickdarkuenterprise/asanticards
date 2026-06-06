const express = require('express');
const { body, param, validationResult } = require('express-validator');
const supabase = require('../lib/supabase');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ── GET /api/products — public, returns all products with stock ──
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, price, category, stock, active')
    .eq('active', true)
    .order('sort_order', { ascending: true });

  if (error) return res.status(500).json({ error: 'Failed to fetch products' });
  res.json({ products: data });
});

// ── GET /api/products/:id — single product ──────────────────────
router.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, price, category, stock, active')
    .eq('id', req.params.id)
    .single();

  if (error || !data) return res.status(404).json({ error: 'Product not found' });
  res.json({ product: data });
});

// ── PATCH /api/products/:id — admin: update stock and/or price ──
router.patch(
  '/:id',
  requireAuth,
  [
    param('id').notEmpty(),
    body('stock').optional().isInt({ min: 0 }),
    body('price').optional().isFloat({ min: 0 }),
    body('active').optional().isBoolean(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const updates = {};
    if (req.body.stock !== undefined) updates.stock = req.body.stock;
    if (req.body.price !== undefined) updates.price = req.body.price;
    if (req.body.active !== undefined) updates.active = req.body.active;
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: 'Failed to update product' });
    res.json({ product: data });
  }
);

module.exports = router;
