const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

// ── Order confirmation to customer ──────────────────────────────
async function sendOrderConfirmation(order) {
  const itemsHtml = order.items
    .map(i => `<tr>
      <td style="padding:8px 0;border-bottom:1px solid #2a1008;color:#e9d0a2">${i.name}</td>
      <td style="padding:8px 0;border-bottom:1px solid #2a1008;color:#e9d0a2;text-align:center">${i.qty}</td>
      <td style="padding:8px 0;border-bottom:1px solid #2a1008;color:#d9a441;text-align:right;font-weight:700">GH₵ ${(i.price * i.qty).toLocaleString()}</td>
    </tr>`)
    .join('');

  const html = `
  <!DOCTYPE html>
  <html>
  <body style="margin:0;padding:0;background:#0a0302;font-family:'Georgia',serif">
    <div style="max-width:560px;margin:0 auto;padding:40px 20px">
      <div style="text-align:center;margin-bottom:32px">
        <div style="font-size:1.8rem;font-weight:700;color:#d9a441;letter-spacing:0.15em">ASA NTI</div>
        <div style="font-size:0.7rem;letter-spacing:0.3em;color:rgba(233,208,162,0.4);text-transform:uppercase;margin-top:4px">Card Game</div>
      </div>
      <div style="background:linear-gradient(160deg,#1a0806,#0f0503);border:1px solid rgba(217,164,65,0.2);border-radius:12px;padding:32px">
        <h2 style="color:#e9d0a2;margin:0 0 8px;font-size:1.2rem">Order Confirmed ✦</h2>
        <p style="color:rgba(233,208,162,0.55);font-size:0.88rem;margin:0 0 24px">Thank you, ${order.customer_name}. Your kingdom awaits.</p>
        <div style="background:rgba(217,164,65,0.05);border:1px solid rgba(217,164,65,0.1);border-radius:8px;padding:16px;margin-bottom:24px">
          <div style="font-size:0.7rem;letter-spacing:0.15em;color:rgba(233,208,162,0.4);text-transform:uppercase;margin-bottom:6px">Order Reference</div>
          <div style="font-family:monospace;color:#d9a441;font-size:1rem;font-weight:700">${order.ref}</div>
        </div>
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
          <thead>
            <tr>
              <th style="text-align:left;font-size:0.7rem;letter-spacing:0.12em;color:rgba(233,208,162,0.35);text-transform:uppercase;padding-bottom:8px;border-bottom:1px solid rgba(217,164,65,0.15)">Item</th>
              <th style="text-align:center;font-size:0.7rem;letter-spacing:0.12em;color:rgba(233,208,162,0.35);text-transform:uppercase;padding-bottom:8px;border-bottom:1px solid rgba(217,164,65,0.15)">Qty</th>
              <th style="text-align:right;font-size:0.7rem;letter-spacing:0.12em;color:rgba(233,208,162,0.35);text-transform:uppercase;padding-bottom:8px;border-bottom:1px solid rgba(217,164,65,0.15)">Price</th>
            </tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
        </table>
        <div style="display:flex;justify-content:space-between;margin-bottom:6px">
          <span style="font-size:0.83rem;color:rgba(233,208,162,0.45)">Shipping (${order.shipping_method})</span>
          <span style="font-size:0.83rem;color:rgba(233,208,162,0.45)">${order.shipping_cost === 0 ? 'Free' : 'GH₵ ' + order.shipping_cost}</span>
        </div>
        <div style="display:flex;justify-content:space-between;border-top:1px solid rgba(217,164,65,0.15);padding-top:12px;margin-top:8px">
          <span style="font-weight:700;color:#e9d0a2">Total Paid</span>
          <span style="font-weight:700;color:#d9a441;font-size:1.05rem">GH₵ ${order.total.toLocaleString()}</span>
        </div>
        <div style="margin-top:24px;padding-top:20px;border-top:1px solid rgba(217,164,65,0.1)">
          <div style="font-size:0.7rem;letter-spacing:0.12em;color:rgba(233,208,162,0.35);text-transform:uppercase;margin-bottom:6px">Delivering to</div>
          <div style="font-size:0.88rem;color:rgba(233,208,162,0.6)">${order.delivery_address}</div>
          <div style="font-size:0.78rem;color:rgba(233,208,162,0.3);margin-top:6px">Expected: ${getDeliveryEstimate(order.shipping_method)}</div>
        </div>
      </div>
      <p style="text-align:center;font-size:0.75rem;color:rgba(233,208,162,0.25);margin-top:24px">
        Questions? Reply to this email or contact hello@asanticards.com<br>
        © 2025 ASA NTI Card Game · Proudly made in Ghana ✦
      </p>
    </div>
  </body>
  </html>`;

  await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to: order.customer_email,
    subject: `Your ASA NTI Order is Confirmed — ${order.ref}`,
    html,
  });
}

// ── Internal alert to admin ──────────────────────────────────────
async function sendAdminOrderAlert(order) {
  const itemsList = order.items.map(i => `• ${i.name} × ${i.qty} — GH₵ ${i.price * i.qty}`).join('\n');
  await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to: process.env.ADMIN_EMAIL,
    subject: `[ASA NTI] New Order ${order.ref} — GH₵ ${order.total}`,
    text: `New order received.\n\nRef: ${order.ref}\nCustomer: ${order.customer_name} <${order.customer_email}>\nPhone: ${order.customer_phone}\nAddress: ${order.delivery_address}\nShipping: ${order.shipping_method}\n\nItems:\n${itemsList}\n\nTotal: GH₵ ${order.total}`,
  });
}

// ── Contact form message to admin ─────────────────────────────────
async function sendContactMessage({ name, email, message }) {
  await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to: process.env.ADMIN_EMAIL,
    replyTo: email,
    subject: `[ASA NTI] New Contact Message from ${name}`,
    text: `New contact form submission.\n\nName: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
  });
}

function getDeliveryEstimate(method) {
  const estimates = { standard: '3–5 business days', express: '1–2 business days', diaspora: '7–14 business days' };
  return estimates[method] || '3–5 business days';
}

module.exports = { sendOrderConfirmation, sendAdminOrderAlert, sendContactMessage };
