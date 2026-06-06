const express = require('express');
const crypto = require('crypto');
const supabase = require('../lib/supabase');
const { sendOrderConfirmation, sendAdminOrderAlert } = require('../lib/email');

const router = express.Router();

// IMPORTANT: This route must receive the RAW request body (not JSON-parsed)
// so the HMAC signature can be verified correctly.
// express.raw() is applied in server.js for this route only.

router.post('/', async (req, res) => {
  // ── 1. Verify the request genuinely came from Paystack ──────────
  const hash = crypto
    .createHmac('sha512', process.env.PAYSTACK_WEBHOOK_SECRET)
    .update(req.body)          // req.body is raw Buffer here
    .digest('hex');

  if (hash !== req.headers['x-paystack-signature']) {
    console.warn('[webhook] Invalid signature — rejected');
    return res.status(401).send('Invalid signature');
  }

  // ── 2. Parse and handle the event ───────────────────────────────
  let event;
  try {
    event = JSON.parse(req.body.toString());
  } catch {
    return res.status(400).send('Bad JSON');
  }

  // Acknowledge immediately — Paystack expects a 200 within 30s
  res.sendStatus(200);

  // ── 3. Only process successful charges ──────────────────────────
  if (event.event !== 'charge.success') return;

  const paystackRef = event.data.reference;
  const amountPaid  = event.data.amount / 100; // convert pesewas → GHS

  // Extract our internal order ref from Paystack metadata
  const meta = event.data.metadata?.custom_fields || [];
  // We pass order_ref as a custom field from the frontend
  const orderRefField = meta.find(f => f.variable_name === 'order_ref');

  if (!orderRefField) {
    console.warn('[webhook] charge.success received but no order_ref in metadata', paystackRef);
    return;
  }

  const orderRef = orderRefField.value;

  // ── 4. Fetch the pending order ───────────────────────────────────
  const { data: order, error: fetchErr } = await supabase
    .from('orders')
    .select('*')
    .eq('ref', orderRef)
    .single();

  if (fetchErr || !order) {
    console.error('[webhook] Order not found:', orderRef);
    return;
  }

  if (order.status !== 'pending') {
    // Already processed — idempotency guard
    console.log('[webhook] Order already processed:', orderRef);
    return;
  }

  // ── 5. Verify amount matches what we calculated ──────────────────
  if (Math.abs(amountPaid - order.total) > 0.01) {
    console.error(`[webhook] Amount mismatch for ${orderRef}: expected ${order.total}, got ${amountPaid}`);
    await supabase.from('orders').update({ status: 'amount_mismatch', paystack_ref: paystackRef }).eq('ref', orderRef);
    return;
  }

  // ── 6. Deduct stock atomically ────────────────────────────────────
  for (const item of order.items) {
    const { error: stockErr } = await supabase.rpc('decrement_stock', {
      p_product_id: item.product_id,
      p_qty: item.qty,
    });
    if (stockErr) {
      console.error(`[webhook] Stock decrement failed for ${item.product_id}:`, stockErr.message);
    }
  }

  // ── 7. Mark order as paid ─────────────────────────────────────────
  const { data: updatedOrder } = await supabase
    .from('orders')
    .update({
      status: 'paid',
      paystack_ref: paystackRef,
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('ref', orderRef)
    .select()
    .single();

  // ── 8. Send emails ────────────────────────────────────────────────
  try {
    await sendOrderConfirmation(updatedOrder);
    await sendAdminOrderAlert(updatedOrder);
  } catch (emailErr) {
    // Don't fail the webhook if email fails — log and move on
    console.error('[webhook] Email send failed:', emailErr.message);
  }

  console.log(`[webhook] Order ${orderRef} confirmed — GH₵ ${amountPaid}`);
});

module.exports = router;
