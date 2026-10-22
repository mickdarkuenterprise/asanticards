const express = require('express');
const crypto = require('crypto');
const supabase = require('../lib/supabase');
const { sendOrderConfirmation, sendAdminOrderAlert, sendAdminStockAlert } = require('../lib/email');

const router = express.Router();

// IMPORTANT: This route must receive the RAW request body (not JSON-parsed)
// so the HMAC signature can be verified correctly.
// express.raw() is applied in server.js for this route only.

router.post('/', async (req, res) => {
  // ── 1. Verify the request genuinely came from Paystack ──────────
  // Paystack signs webhooks with your SECRET KEY (there is no separate webhook secret)
  const hash = crypto
    .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
    .update(req.body)          // req.body is raw Buffer here
    .digest('hex');

  const expected  = Buffer.from(hash);
  const signature = Buffer.from(req.headers['x-paystack-signature'] || '');

  if (signature.length !== expected.length || !crypto.timingSafeEqual(signature, expected)) {
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

  // The response is already sent, so errors from here on must be caught
  // and logged — an unhandled rejection would crash the process.
  try {
    await processEvent(event);
  } catch (err) {
    console.error('[webhook] Processing failed:', err.message);
  }
});

async function processEvent(event) {
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
    console.log('[webhook] Order already processed:', orderRef);
    return;
  }

  // ── 5. Verify amount matches what we calculated ──────────────────
  if (Math.abs(amountPaid - Number(order.total)) > 0.01) {
    console.error(`[webhook] Amount mismatch for ${orderRef}: expected ${order.total}, got ${amountPaid}`);
    await supabase
      .from('orders')
      .update({ status: 'amount_mismatch', paystack_ref: paystackRef })
      .eq('ref', orderRef)
      .eq('status', 'pending');
    return;
  }

  // ── 6. Claim the order — mark paid ONLY if it is still pending ───
  // This conditional update is the idempotency guard: if Paystack delivers
  // the same event twice, only one delivery gets a row back.
  const { data: claimed, error: claimErr } = await supabase
    .from('orders')
    .update({
      status: 'paid',
      paystack_ref: paystackRef,
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('ref', orderRef)
    .eq('status', 'pending')
    .select();

  if (claimErr) {
    console.error(`[webhook] Could not mark ${orderRef} as paid:`, claimErr.message);
    return;
  }
  if (!claimed || claimed.length === 0) {
    console.log('[webhook] Order already processed (concurrent delivery):', orderRef);
    return;
  }

  const updatedOrder = claimed[0];

  // ── 7. Deduct stock ───────────────────────────────────────────────
  // decrement_stock refuses to go below 0, so a failure here means the
  // item was oversold (or removed) — the customer has already paid.
  const stockProblems = [];
  for (const item of updatedOrder.items) {
    const { error: stockErr } = await supabase.rpc('decrement_stock', {
      p_product_id: item.product_id,
      p_qty: item.qty,
    });
    if (stockErr) {
      console.error(`[webhook] Stock decrement failed for ${item.product_id}:`, stockErr.message);
      stockProblems.push({ product_id: item.product_id, qty: item.qty, reason: stockErr.message });
    }
  }

  // ── 8. Send emails ────────────────────────────────────────────────
  // Sent independently so one failure doesn't stop the others.
  // Don't fail the webhook if email fails — log and move on.
  const emails = [
    ['customer confirmation', () => sendOrderConfirmation(updatedOrder)],
    ['admin alert', () => sendAdminOrderAlert(updatedOrder)],
  ];
  if (stockProblems.length) {
    emails.push(['admin stock alert', () => sendAdminStockAlert(updatedOrder, stockProblems)]);
  }
  for (const [label, send] of emails) {
    try {
      await send();
    } catch (emailErr) {
      console.error(`[webhook] Email send failed (${label}) for ${orderRef}:`, emailErr.message);
    }
  }

  console.log(`[webhook] Order ${orderRef} confirmed — GH₵ ${amountPaid}`);
}

module.exports = router;
