// routes/products.js
const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');

// ── GET /api/products ─────────────────────────────────────────────────────────
// Query params: category, search, filter (hot/new), vendor_id, page, limit
router.get('/', (req, res) => {
  const { category, search, filter, vendor_id, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let where = ['p.is_active = 1'];
  const params = [];

  if (category && category !== 'all') {
    where.push('c.slug = ?');
    params.push(category);
  }
  if (search) {
    where.push('(p.name LIKE ? OR p.description LIKE ? OR v.shop_name LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (filter === 'hot') {
    where.push('p.is_hot = 1');
  }
  if (vendor_id) {
    where.push('v.id = ?');
    params.push(vendor_id);
  }

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const products = db.prepare(`
    SELECT p.*, c.slug as category_slug, c.name as category_name, c.icon as category_icon,
           v.shop_name as vendor_name, v.shop_emoji as vendor_emoji, v.id as vendor_id
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN vendors v ON v.id = p.vendor_id
    ${whereClause}
    ORDER BY p.is_hot DESC, p.review_count DESC, p.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit), offset);

  const total = db.prepare(`
    SELECT COUNT(*) as count FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN vendors v ON v.id = p.vendor_id
    ${whereClause}
  `).get(...params).count;

  res.json({ products, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
});

// ── GET /api/products/categories ─────────────────────────────────────────────
router.get('/categories', (req, res) => {
  const cats = db.prepare(`
    SELECT c.*, COUNT(p.id) as product_count
    FROM categories c
    LEFT JOIN products p ON p.category_id = c.id AND p.is_active = 1
    GROUP BY c.id
  `).all();
  res.json({ categories: cats });
});

// ── GET /api/products/:id ─────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const product = db.prepare(`
    SELECT p.*, c.slug as category_slug, c.name as category_name,
           v.shop_name as vendor_name, v.shop_emoji as vendor_emoji, v.id as vendor_id,
           v.description as vendor_description
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN vendors v ON v.id = p.vendor_id
    WHERE p.id = ? AND p.is_active = 1
  `).get(req.params.id);

  if (!product) return res.status(404).json({ error: 'Product not found' });

  const reviews = db.prepare(`
    SELECT r.*, u.name as user_name, u.avatar as user_avatar
    FROM reviews r
    JOIN users u ON u.id = r.user_id
    WHERE r.product_id = ?
    ORDER BY r.created_at DESC
    LIMIT 10
  `).all(req.params.id);

  res.json({ product, reviews });
});

// ── POST /api/products ────────────────────────────────────────────────────────
router.post('/', authenticate, requireRole('vendor', 'admin'), (req, res) => {
  const { name, description, emoji, price, stock, category_id, is_hot } = req.body;
  if (!name || !price) return res.status(400).json({ error: 'Name and price are required' });

  // Get vendor id
  const vendor = db.prepare('SELECT id FROM vendors WHERE user_id = ?').get(req.user.id);
  if (!vendor && req.user.role !== 'admin')
    return res.status(403).json({ error: 'No vendor profile found' });

  const id = uuidv4();
  db.prepare(`
    INSERT INTO products (id, vendor_id, category_id, name, description, emoji, price, stock, is_hot)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, vendor?.id || null, category_id || null, name, description || null, emoji || '📦', parseFloat(price), parseInt(stock) || 0, is_hot ? 1 : 0);

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  res.status(201).json({ message: 'Product created', product });
});

// ── PUT /api/products/:id ─────────────────────────────────────────────────────
router.put('/:id', authenticate, requireRole('vendor', 'admin'), (req, res) => {
  const product = db.prepare('SELECT p.*, v.user_id FROM products p JOIN vendors v ON v.id = p.vendor_id WHERE p.id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  if (product.user_id !== req.user.id && req.user.role !== 'admin')
    return res.status(403).json({ error: 'Not your product' });

  const { name, description, emoji, price, stock, category_id, is_hot, is_active } = req.body;
  db.prepare(`
    UPDATE products SET
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      emoji = COALESCE(?, emoji),
      price = COALESCE(?, price),
      stock = COALESCE(?, stock),
      category_id = COALESCE(?, category_id),
      is_hot = COALESCE(?, is_hot),
      is_active = COALESCE(?, is_active),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(name, description, emoji, price ? parseFloat(price) : null, stock != null ? parseInt(stock) : null,
         category_id, is_hot != null ? (is_hot ? 1 : 0) : null,
         is_active != null ? (is_active ? 1 : 0) : null, req.params.id);

  res.json({ message: 'Product updated', product: db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id) });
});

// ── DELETE /api/products/:id ──────────────────────────────────────────────────
router.delete('/:id', authenticate, requireRole('vendor', 'admin'), (req, res) => {
  const product = db.prepare('SELECT p.*, v.user_id FROM products p JOIN vendors v ON v.id = p.vendor_id WHERE p.id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  if (product.user_id !== req.user.id && req.user.role !== 'admin')
    return res.status(403).json({ error: 'Not your product' });

  // Soft delete
  db.prepare("UPDATE products SET is_active = 0 WHERE id = ?").run(req.params.id);
  res.json({ message: 'Product removed' });
});

// ── POST /api/products/:id/review ─────────────────────────────────────────────
router.post('/:id/review', authenticate, (req, res) => {
  const { rating, comment } = req.body;
  if (!rating || rating < 1 || rating > 5)
    return res.status(400).json({ error: 'Rating must be 1-5' });

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  try {
    db.prepare(`
      INSERT INTO reviews (product_id, user_id, rating, comment)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(product_id, user_id) DO UPDATE SET rating = ?, comment = ?
    `).run(req.params.id, req.user.id, rating, comment || null, rating, comment || null);

    // Recalculate avg rating
    const avg = db.prepare('SELECT AVG(rating) as avg, COUNT(*) as cnt FROM reviews WHERE product_id = ?').get(req.params.id);
    db.prepare('UPDATE products SET rating = ?, review_count = ? WHERE id = ?')
      .run(Math.round(avg.avg * 10) / 10, avg.cnt, req.params.id);

    res.json({ message: 'Review submitted' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to submit review' });
  }
});

module.exports = router;
