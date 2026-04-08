// routes/cart.js
const router = require('express').Router();
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');

const getCart = (userId) => db.prepare(`
  SELECT ci.id, ci.qty, ci.added_at,
         p.id as product_id, p.name, p.emoji, p.price, p.stock,
         v.shop_name as vendor_name, v.id as vendor_id
  FROM cart_items ci
  JOIN products p ON p.id = ci.product_id
  JOIN vendors v ON v.id = p.vendor_id
  WHERE ci.user_id = ? AND p.is_active = 1
  ORDER BY ci.added_at DESC
`).all(userId);

// ── GET /api/cart ──────────────────────────────────────────────────────────────
router.get('/', authenticate, (req, res) => {
  const items = getCart(req.user.id);
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  res.json({ items, subtotal, delivery_fee: 500, total: subtotal + 500, count: items.reduce((s,i)=>s+i.qty,0) });
});

// ── POST /api/cart ─────────────────────────────────────────────────────────────
router.post('/', authenticate, (req, res) => {
  const { product_id, qty = 1 } = req.body;
  if (!product_id) return res.status(400).json({ error: 'product_id required' });

  const product = db.prepare('SELECT * FROM products WHERE id = ? AND is_active = 1').get(product_id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  if (product.stock < qty) return res.status(400).json({ error: 'Not enough stock' });

  db.prepare(`
    INSERT INTO cart_items (user_id, product_id, qty)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, product_id) DO UPDATE SET qty = qty + ?
  `).run(req.user.id, product_id, parseInt(qty), parseInt(qty));

  const items = getCart(req.user.id);
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  res.json({ message: 'Added to cart', items, subtotal, total: subtotal + 500, count: items.reduce((s,i)=>s+i.qty,0) });
});

// ── PUT /api/cart/:productId ───────────────────────────────────────────────────
router.put('/:productId', authenticate, (req, res) => {
  const { qty } = req.body;
  if (!qty || qty < 1) return res.status(400).json({ error: 'qty must be >= 1' });

  const item = db.prepare('SELECT * FROM cart_items WHERE user_id = ? AND product_id = ?').get(req.user.id, req.params.productId);
  if (!item) return res.status(404).json({ error: 'Item not in cart' });

  db.prepare('UPDATE cart_items SET qty = ? WHERE user_id = ? AND product_id = ?')
    .run(parseInt(qty), req.user.id, req.params.productId);

  const items = getCart(req.user.id);
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  res.json({ items, subtotal, total: subtotal + 500, count: items.reduce((s,i)=>s+i.qty,0) });
});

// ── DELETE /api/cart/:productId ────────────────────────────────────────────────
router.delete('/:productId', authenticate, (req, res) => {
  db.prepare('DELETE FROM cart_items WHERE user_id = ? AND product_id = ?').run(req.user.id, req.params.productId);
  const items = getCart(req.user.id);
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  res.json({ message: 'Removed', items, subtotal, total: subtotal + 500, count: items.reduce((s,i)=>s+i.qty,0) });
});

// ── DELETE /api/cart ───────────────────────────────────────────────────────────
router.delete('/', authenticate, (req, res) => {
  db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(req.user.id);
  res.json({ message: 'Cart cleared' });
});

module.exports = router;
