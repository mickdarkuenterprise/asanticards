const express = require('express');
const { body, validationResult } = require('express-validator');
const supabase = require('../lib/supabase');
const { requireAuth } = require('../middleware/auth');
const { sendOrderConfirmation, sendAdminOrderAlert } = require('../lib/email');

const router = express.Router();

const SHIPPING_COSTS = { standard: 10, express: 30, diaspora: 80 };
const FREE_SHIPPING_THRESHOLD = 200; // GH₵

// ── POST /api/orders — create a pending order before payment ────
// Called from the frontend right before opening Paystack.
// Returns an order ref that gets passed to Paystack as metadata.
router.post(
  '/',
  [
    body('customer_name').trim().notEmpty(),
    body('customer_email').isEmail().normalizeEmail(),
    body('customer_phone').trim().notEmpty(),
    body('delivery_address').trim().notEmpty(),
    body('shipping_method').isIn(['standard', 'express', 'diaspora']),
    body('items').isArray({ min: 1 }),
    body('items.*.product_id').notEmpty(),
    body('items.*.qty').isInt({ min: 1 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { customer_name, customer_email, customer_phone, delivery_address, shipping_method, items } = req.body;

    // Fetch all requested products in one query
    const productIds = items.map(i => i.product_id);
    const { data: products, error: prodErr } = await supabase
      .from('products')
      .select('id, name, price, stock')
      .in('id', productIds)
      .eq('active', true);

    if (prodErr) return res.status(500).json({ error: 'Could not verify products' });

    // Validate stock for each item
    const lineItems = [];
    for (const item of items) {
      const prod = products.find(p => p.id === item.product_id);
      if (!prod) return res.status(400).json({ error: `Product ${item.product_id} not found` });
      if (prod.stock < item.qty) {
        return res.status(400).json({ error: `Insufficient stock for "${prod.name}" — only ${prod.stock} available` });
      }
      lineItems.push({ product_id: prod.id, name: prod.name, price: prod.price, qty: item.qty });
    }

    // Calculate totals
    const subtotal = lineItems.reduce((s, i) => s + i.price * i.qty, 0);
    const shippingCost = subtotal >= FREE_SHIPPING_THRESHOLD && shipping_method === 'standard'
      ? 0
      : SHIPPING_COSTS[shipping_method];
    const total = subtotal + shippingCost;

    // Generate ref
    const ref = 'ASANTI-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6).toUpperCase();

    // Insert pending order
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        ref,
        customer_name,
        customer_email,
        customer_phone,
        delivery_address,
        shipping_method,
        shipping_cost: shippingCost,
        subtotal,
        total,
        items: lineItems,
        status: 'pending',
      })
      .select()
      .single();

    if (orderErr) return res.status(500).json({ error: 'Failed to create order' });

    // Return the ref and total for Paystack initialisation
    res.status(201).json({
      order_ref: order.ref,
      total_pesewas: total * 100,   // Paystack amount in pesewas (GHS subunit)
      total_ghs: total,
    });
  }
);

// ── GET /api/orders — admin: paginated order list ───────────────
router.get('/', requireAuth, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const from = (page - 1) * limit;
  const status = req.query.status; // optional filter

  let query = supabase
    .from('orders')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1);

  if (status) query = query.eq('status', status);

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: 'Failed to fetch orders' });

  res.json({ orders: data, total: count, page, limit });
});

// ── GET /api/orders/:ref — get single order (admin or by ref) ───
router.get('/:ref', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('ref', req.params.ref)
    .single();

  if (error || !data) return res.status(404).json({ error: 'Order not found' });
  res.json({ order: data });
});

// ── PATCH /api/orders/:ref/status — admin: update order status ──
router.patch('/:ref/status', requireAuth, async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const { data, error } = await supabase
    .from('orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('ref', req.params.ref)
    .select()
    .single();

  if (error) return res.status(500).json({ error: 'Failed to update order' });
  res.json({ order: data });
});

module.exports = router;
