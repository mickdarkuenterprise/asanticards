require('dotenv').config();

const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');
const rateLimit = require('express-rate-limit');

const productsRouter = require('./routes/products');
const ordersRouter   = require('./routes/orders');
const webhookRouter  = require('./routes/webhook');
const adminRouter    = require('./routes/admin');

const app  = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

// ── Security headers ─────────────────────────────────────────────
app.use(helmet());

// ── CORS — only allow your frontend domain ───────────────────────
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.FRONTEND_URL          // e.g. https://asanticards.com
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
  message: { error: 'Too many requests, please try again later.' },
});

const checkoutLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,   // 1 hour
  max: 20,                     // max 20 checkout attempts per IP per hour
  message: { error: 'Too many checkout attempts, please try again later.' },
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many admin requests.' },
});

app.use('/api/', apiLimiter);
app.use('/api/orders', checkoutLimiter);
app.use('/api/admin', adminLimiter);

// ── Routes ───────────────────────────────────────────────────────
app.use('/api/products', productsRouter);
app.use('/api/orders',   ordersRouter);
app.use('/api/admin',    adminRouter);

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
  console.error('[error]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// Change ONLY the very bottom of your file to this:
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[asanti-api] Running on port ${PORT} — ${process.env.NODE_ENV || 'development'}`);
});
