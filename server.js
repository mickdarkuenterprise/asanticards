require('dotenv').config();

const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');
const rateLimit = require('express-rate-limit');
const { hasValidAdminToken } = require('./middleware/auth');
const { startCleanupJob } = require('./lib/cleanup');

const shippingRouter = require('./routes/shipping');
const productsRouter = require('./routes/products');
const ordersRouter   = require('./routes/orders');
const webhookRouter  = require('./routes/webhook');
const adminRouter    = require('./routes/admin');
const newsletterRouter = require('./routes/newsletter');
const contactRouter     = require('./routes/contact');

const app  = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

// ── Security headers ─────────────────────────────────────────────
app.use(helmet());

// ── CORS — only allow your frontend domain ───────────────────────
// FRONTEND_URL may list several origins separated by commas. Each one is
// also allowed with/without "www." since the site is served on both.
function withWwwVariants(urls) {
  const origins = new Set();
  for (const raw of urls.split(',').map(u => u.trim().replace(/\/+$/, '')).filter(Boolean)) {
    origins.add(raw);
    const url = new URL(raw);
    url.hostname = url.hostname.startsWith('www.') ? url.hostname.slice(4) : `www.${url.hostname}`;
    origins.add(url.origin);
  }
  return [...origins];
}

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? withWwwVariants(process.env.FRONTEND_URL || '')   // e.g. https://asanticards.com
    : ['http://localhost:3000', 'http://127.0.0.1:5500'],
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Webhook MUST receive raw body for HMAC verification ─────────
// Register BEFORE express.json()
app.use('/api/webhook', express.raw({ type: 'application/json' }), webhookRouter);

// ── JSON body parser for all other routes ────────────────────────
app.use(express.json());

// ── Rate limiting ────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: hasValidAdminToken,    // logged-in admin isn't throttled while using the dashboard
  message: { error: 'Too many requests, please try again later.' },
});

const checkoutLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,   // 1 hour
  max: 20,                     // max 20 checkout attempts per IP per hour
  message: { error: 'Too many checkout attempts, please try again later.' },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,                     // max 20 login attempts per IP per 15 minutes
  message: { error: 'Too many login attempts, please try again later.' },
});

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,   // 1 hour
  max: 5,                      // max 5 contact messages per IP per hour
  message: { error: 'Too many messages, please try again later.' },
});

app.use('/api/', apiLimiter);
app.post('/api/orders', checkoutLimiter);       // checkout only — not the admin order list
app.post('/api/admin/login', loginLimiter);
app.post('/api/contact', contactLimiter);

// ── Routes ───────────────────────────────────────────────────────
app.use('/api/products', productsRouter);
app.use('/api/orders',   ordersRouter);
app.use('/api/admin',    adminRouter);
app.use('/api/shipping_methods', shippingRouter);
app.use('/api/newsletter', newsletterRouter);
app.use('/api/contact',    contactRouter);


// ── Health check ─────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', env: process.env.NODE_ENV, timestamp: new Date().toISOString() });
});


// ── 404 handler ──────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Global error handler ─────────────────────────────────────────
app.use((err, req, res, next) => {
  // Client errors (e.g. malformed JSON → 400, body too large → 413) keep their status
  const status = err.status || err.statusCode || 500;
  if (status < 500) {
    return res.status(status).json({ error: err.type === 'entity.parse.failed' ? 'Malformed JSON body' : 'Bad request' });
  }
  console.error('[error]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[asanti-api] Running on port ${PORT} — ${process.env.NODE_ENV || 'development'}`);
  startCleanupJob();
});
