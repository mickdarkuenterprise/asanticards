# ASA NTI — Backend API

Node.js / Express API for the ASA NTI Card Game website.
Handles product stock, order creation, Paystack webhook verification, and admin authentication.

---

## Stack

- **Runtime:** Node.js 22+
- **Framework:** Express
- **Database:** Supabase (PostgreSQL)
- **Payments:** Paystack
- **Email:** Resend
- **Deployment:** Railway (recommended) or any Node.js host

---

## Local Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy env file and fill in your values
cp .env.example .env

# 3. Generate your admin password hash (run once, paste output into .env)
node -e "const b=require('bcryptjs');b.hash('your-password-here',12).then(h=>console.log('ADMIN_PASSWORD_HASH='+h))"

# 4. Start dev server
npm run dev
```

---

## Supabase Setup

1. Create a new project at supabase.com
2. Go to **SQL Editor → New Query**
3. Paste the contents of `supabase-schema.sql` and run it
4. Go to **Project Settings → API**
   - Copy **Project URL** → `SUPABASE_URL`
   - Copy **service_role** key → `SUPABASE_SERVICE_KEY` (never expose this client-side)

---

## Paystack Setup

1. Log in to your Paystack dashboard
2. **Settings → API Keys & Webhooks**
   - Copy **Secret Key** → `PAYSTACK_SECRET_KEY`
3. Under **Webhooks**, add:
   - URL: `https://your-api-domain.railway.app/api/webhook`
   - No separate webhook secret is needed — Paystack signs webhooks with your `PAYSTACK_SECRET_KEY`
4. Enable the `charge.success` event

---

## Deploy to Railway

Railway is the fastest way to get a Node.js backend live.

```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login
railway login

# 3. Create project and link
railway init
railway link

# 4. Set environment variables (do this in Railway dashboard or CLI)
railway variables set SUPABASE_URL=...
railway variables set SUPABASE_SERVICE_KEY=...
railway variables set PAYSTACK_SECRET_KEY=...
# ... (all variables from .env.example)

# 5. Deploy
railway up
```

Your API will be live at something like `https://asanti-api.up.railway.app`

---

## Deploy Frontend to Namecheap

1. Find the `API_BASE` constant and set it to your Railway URL:
   ```js
   const API_BASE = 'https://asanti-api.up.railway.app';
   ```
2. Upload the HTML file via **cPanel → File Manager → public_html**
3. Enable **SSL** in cPanel → SSL/TLS → Let's Encrypt (free)

---

## API Routes

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/products` | Public | List all active products with stock |
| GET | `/api/products/:id` | Public | Single active product |
| PATCH | `/api/products/:id` | Admin JWT | Update stock / price |
| POST | `/api/orders` | Public | Create pending order (max 20 of each product) |
| GET | `/api/orders` | Admin JWT | List all orders |
| GET | `/api/orders/:ref` | Admin JWT | Single order |
| PATCH | `/api/orders/:ref/status` | Admin JWT | Update order status |
| POST | `/api/webhook` | Paystack HMAC | Payment confirmed |
| POST | `/api/admin/login` | — | Returns JWT |
| GET | `/api/admin/stats` | Admin JWT | Dashboard summary |
| GET | `/api/shipping_methods` | Public | Shipping options and prices (from `lib/shipping.js`) |
| POST | `/api/newsletter` | Public | Newsletter signup |
| POST | `/api/contact` | Public | Contact form → email to admin (5/hour per IP) |
| GET | `/health` | Public | Health check |

---

## Connecting the Frontend

After deploying, update the HTML to call the API instead of localStorage.

In the `<script>` block, add at the top:

```js
const API_BASE = 'https://your-api.up.railway.app'; // your Railway URL
```

Key changes to make in the frontend:

**1. Load products from API on page load**
```js
async function loadProductsFromAPI() {
  const res = await fetch(`${API_BASE}/api/products`);
  const { products } = await res.json();
  // Update stock display on product cards
  products.forEach(p => updateStockDisplay(p.id, p.stock));
}
```

**2. Create order before opening Paystack**

The server creates the order, calculates the total from its own prices and starts
the Paystack transaction with the secret key. The website only gets an access code
and opens the popup with Paystack Inline v2 (`https://js.paystack.co/v2/inline.js`):
```js
async function initiatePaystack() {
  // ... validate form fields ...

  const res = await fetch(`${API_BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer_name: `${first} ${last}`,
      customer_email: email,
      customer_phone: phone,
      delivery_address: `${addr}, ${city}`,
      shipping_method: shippingMethod,
      items: cart.map(i => ({ product_id: i.id, qty: i.qty })),
      turnstile_token: token, // only needed once TURNSTILE_SECRET_KEY is set
    }),
  });

  const { order_ref, access_code } = await res.json();

  new PaystackPop().resumeTransaction(access_code, {
    onSuccess: (transaction) => onPaymentSuccess(transaction, order_ref),
    onCancel: () => { /* handle cancel */ },
  });
}
```

**3. Payment success — no stock deduction needed (webhook handles it)**
```js
function onPaymentSuccess(response, orderRef) {
  // Just clear cart and show confirmation.
  // Real stock deduction happens via webhook on your server.
  cart = [];
  updateCartUI();
  showOrderConfirmation(orderRef);
}
```

---

## Email (Resend)

1. Create an account at resend.com and add `asanticards.com` under **Domains**
2. Add the DNS records Resend shows (in Namecheap → Domain List → Advanced DNS) and wait for it to verify
3. Create an API key → `RESEND_API_KEY`
4. Set `EMAIL_FROM` to an address on the verified domain, e.g. `ASA NTI Orders <orders@asanticards.com>`

Emails sent: order confirmation (customer), new-order alert (admin), stock problem alert (admin), contact form (admin).

---

## Shipping, stock and order housekeeping

- **Shipping prices** live in `lib/shipping.js` — edit there and redeploy. There is no free shipping: every order pays its method's price.
- **Stock** is deducted by the webhook after payment. If a paid order can't be deducted (oversold), the admin gets an email alert.
- **Unpaid orders** are cancelled automatically after 48 hours (`lib/cleanup.js`). A payment that arrives later still marks the order paid.

---

## Security Checklist

- [ ] `PAYSTACK_SECRET_KEY` only on server, never in frontend HTML
- [ ] `SUPABASE_SERVICE_KEY` only on server, never in frontend HTML
- [ ] `JWT_SECRET` is a long random string (32+ chars)
- [ ] `ADMIN_PASSWORD_HASH` is a bcrypt hash, not plaintext
- [ ] Paystack webhook signature verified on every request
- [ ] HTTPS enabled on both frontend (Namecheap SSL) and API (Railway provides this)
- [ ] `FRONTEND_URL` set correctly in production for CORS (the `www.` variant is allowed automatically; separate several origins with commas)
