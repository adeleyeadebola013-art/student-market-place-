// server.js — CampusCart Backend
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// ── MIDDLEWARE ────────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, message: { error: 'Too many requests' } });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Too many auth attempts' } });
app.use('/api/', limiter);
app.use('/api/auth/', authLimiter);

// Serve frontend
app.use(express.static(path.join(__dirname, 'public')));

// ── API ROUTES ────────────────────────────────────────────────────────────────
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/cart',     require('./routes/cart'));
app.use('/api/orders',   require('./routes/orders'));
app.use('/api/vendor',   require('./routes/vendor'));

// ── HEALTH CHECK ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// ── PAYSTACK WEBHOOK ──────────────────────────────────────────────────────────
app.post('/api/webhooks/paystack', express.raw({ type: 'application/json' }), (req, res) => {
  const crypto = require('crypto');
  const secret = process.env.PAYSTACK_SECRET_KEY;
  const hash = crypto.createHmac('sha512', secret).update(req.body).digest('hex');

  if (hash !== req.headers['x-paystack-signature']) {
    return res.status(401).send('Invalid signature');
  }

  const event = JSON.parse(req.body);
  if (event.event === 'charge.success') {
    const ref = event.data.reference;
    const db = require('./db/database');
    db.prepare("UPDATE orders SET payment_status = 'paid', status = 'confirmed', updated_at = datetime('now') WHERE id = ? OR paystack_ref = ?")
      .run(ref, ref);
    console.log(`✅ Payment confirmed for order ${ref}`);
  }

  res.sendStatus(200);
});

// ── SPA FALLBACK ─────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── ERROR HANDLER ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// ── START ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║         🛒  CampusCart Server  🛒         ║
╠══════════════════════════════════════════╣
║  Running at  →  http://localhost:${PORT}   ║
║  API Base    →  http://localhost:${PORT}/api║
║  Mode        →  ${(process.env.NODE_ENV || 'development').padEnd(12)}            ║
╚══════════════════════════════════════════╝
  `);
});

module.exports = app;
