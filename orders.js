// routes/orders.js
const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');

// ── GET /api/orders ────────────────────────────────────────────────────────────
// Students see their own orders; vendors see orders containing their products
router.get('/', authenticate, (req, res) => {
  let orders;
  if (req.user.role === 'student') {
    orders = db.prepare(`
      SELECT o.*, COUNT(oi.id) as item_count
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE o.user_id = ?
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `).all(req.user.id);
  } else if (req.user.role === 'vendor') {
    const vendor = db.prepare('SELECT id FROM vendors WHERE user_id = ?').get(req.user.id);
    if (!vendor) return res.status(404).json({ error: 'Vendor profile not found' });
    orders = db.prepare(`
      SELECT DISTINCT o.*, COUNT(oi.id) as item_count
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id AND oi.vendor_id = ?
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `).all(vendor.id);
  } else {
    // admin
    orders = db.prepare(`
      SELECT o.*, u.name as user_name, u.email as user_email, COUNT(oi.id) as item_count
      FROM orders o
      JOIN users u ON u.id = o.user_id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      GROUP BY o.id
      ORDER BY o.created_at DESC
      LIMIT 100
    `).all();
  }
  res.json({ orders });
});

// ── GET /api/orders/:id ────────────────────────────────────────────────────────
router.get('/:id', authenticate, (req, res) => {
  const order = db.prepare(`
    SELECT o.*, u.name as user_name, u.email as user_email
    FROM orders o
    JOIN users u ON u.id = o.user_id
    WHERE o.id = ?
  `).get(req.params.id);

  if (!order) return res.status(404).json({ error: 'Order not found' });

  // Access check
  if (req.user.role === 'student' && order.user_id !== req.user.id)
    return res.status(403).json({ error: 'Access denied' });

  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(req.params.id);
  res.json({ order, items });
});

// ── POST /api/orders ───────────────────────────────────────────────────────────
// Creates order from cart; if payment_method=paystack, also initialises Paystack
router.post('/', authenticate, async (req, res) => {
  const { delivery_address, delivery_note, payment_method = 'cash' } = req.body;
  if (!delivery_address) return res.status(400).json({ error: 'Delivery address required' });

  // Fetch cart
  const cartItems = db.prepare(`
    SELECT ci.qty, p.id as product_id, p.name, p.emoji, p.price, p.stock, p.vendor_id
    FROM cart_items ci
    JOIN products p ON p.id = ci.product_id
    WHERE ci.user_id = ? AND p.is_active = 1
  `).all(req.user.id);

  if (cartItems.length === 0) return res.status(400).json({ error: 'Cart is empty' });

  // Stock check
  for (const item of cartItems) {
    if (item.stock < item.qty)
      return res.status(400).json({ error: `"${item.name}" only has ${item.stock} left in stock` });
  }

  const subtotal = cartItems.reduce((s, i) => s + i.price * i.qty, 0);
  const delivery_fee = 500;
  const total = subtotal + delivery_fee;
  const orderId = 'CC-' + uuidv4().split('-')[0].toUpperCase();

  // Insert order
  db.prepare(`
    INSERT INTO orders (id, user_id, subtotal, delivery_fee, total, delivery_address, delivery_note, payment_method)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(orderId, req.user.id, subtotal, delivery_fee, total, delivery_address, delivery_note || null, payment_method);

  // Insert order items & decrement stock
  const insertItem = db.prepare(`INSERT INTO order_items (order_id, product_id, vendor_id, name, emoji, price, qty) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const decrStock  = db.prepare(`UPDATE products SET stock = stock - ? WHERE id = ?`);

  db.transaction(() => {
    for (const item of cartItems) {
      insertItem.run(orderId, item.product_id, item.vendor_id, item.name, item.emoji, item.price, item.qty);
      decrStock.run(item.qty, item.product_id);
    }
    // Clear cart
    db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(req.user.id);
  })();

  let paystackData = null;

  // ── Paystack initialisation ──────────────────────────────────────────────
  if (payment_method === 'paystack' && process.env.PAYSTACK_SECRET_KEY && !process.env.PAYSTACK_SECRET_KEY.includes('your_')) {
    try {
      const user = db.prepare('SELECT email FROM users WHERE id = ?').get(req.user.id);
      const response = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: user.email,
          amount: Math.round(total * 100), // Paystack uses kobo
          reference: orderId,
          metadata: { order_id: orderId, user_id: req.user.id },
          callback_url: `${process.env.FRONTEND_URL}/payment/callback`,
        }),
      });
      const data = await response.json();
      if (data.status) {
        paystackData = { authorization_url: data.data.authorization_url, reference: data.data.reference };
        db.prepare("UPDATE orders SET paystack_ref = ? WHERE id = ?").run(data.data.reference, orderId);
      }
    } catch (e) {
      console.error('Paystack init error:', e.message);
    }
  }

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  res.status(201).json({ message: 'Order placed!', order, paystack: paystackData });
});

// ── POST /api/orders/paystack/verify ──────────────────────────────────────────
router.post('/paystack/verify', authenticate, async (req, res) => {
  const { reference } = req.body;
  if (!reference) return res.status(400).json({ error: 'Reference required' });

  try {
    const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
    });
    const data = await response.json();
    if (data.status && data.data.status === 'success') {
      const orderId = data.data.metadata?.order_id || data.data.reference;
      db.prepare("UPDATE orders SET payment_status = 'paid', status = 'confirmed', updated_at = datetime('now') WHERE id = ?").run(orderId);
      res.json({ message: 'Payment verified', order: db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) });
    } else {
      res.status(400).json({ error: 'Payment not successful' });
    }
  } catch (e) {
    res.status(500).json({ error: 'Verification failed' });
  }
});

// ── PUT /api/orders/:id/status ─────────────────────────────────────────────────
// Vendors/admin can update order status
router.put('/:id/status', authenticate, requireRole('vendor', 'admin'), (req, res) => {
  const { status } = req.body;
  const validStatuses = ['pending','confirmed','preparing','in_transit','delivered','cancelled'];
  if (!validStatuses.includes(status))
    return res.status(400).json({ error: 'Invalid status' });

  db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, req.params.id);
  res.json({ message: 'Status updated', order: db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id) });
});

module.exports = router;
