// routes/vendor.js
const router = require('express').Router();
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');

// All vendor routes require auth + vendor role
router.use(authenticate, requireRole('vendor', 'admin'));

const getVendor = (userId) => db.prepare('SELECT * FROM vendors WHERE user_id = ?').get(userId);

// ── GET /api/vendor/dashboard ─────────────────────────────────────────────────
router.get('/dashboard', (req, res) => {
  const vendor = getVendor(req.user.id);
  if (!vendor) return res.status(404).json({ error: 'Vendor profile not found' });

  const totalSales = db.prepare(`
    SELECT COALESCE(SUM(oi.price * oi.qty), 0) as total
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE oi.vendor_id = ? AND o.payment_status = 'paid'
  `).get(vendor.id);

  const ordersToday = db.prepare(`
    SELECT COUNT(DISTINCT o.id) as count
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE oi.vendor_id = ? AND date(o.created_at) = date('now')
  `).get(vendor.id);

  const productCount = db.prepare('SELECT COUNT(*) as count FROM products WHERE vendor_id = ? AND is_active = 1').get(vendor.id);
  const pendingCount = db.prepare("SELECT COUNT(*) as count FROM products WHERE vendor_id = ? AND is_active = 0").get(vendor.id);

  const avgRating = db.prepare(`
    SELECT ROUND(AVG(p.rating), 1) as avg
    FROM products p WHERE p.vendor_id = ? AND p.review_count > 0
  `).get(vendor.id);

  const weekSales = db.prepare(`
    SELECT COALESCE(SUM(oi.price * oi.qty), 0) as total
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE oi.vendor_id = ? AND o.payment_status = 'paid'
    AND o.created_at >= datetime('now', '-7 days')
  `).get(vendor.id);

  const monthSales = db.prepare(`
    SELECT COALESCE(SUM(oi.price * oi.qty), 0) as total
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE oi.vendor_id = ? AND o.payment_status = 'paid'
    AND o.created_at >= datetime('now', '-30 days')
  `).get(vendor.id);

  const recentOrders = db.prepare(`
    SELECT DISTINCT o.id, o.status, o.total, o.created_at, o.payment_status,
           u.name as customer_name
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id AND oi.vendor_id = ?
    JOIN users u ON u.id = o.user_id
    ORDER BY o.created_at DESC
    LIMIT 10
  `).all(vendor.id);

  res.json({
    vendor,
    stats: {
      total_sales: totalSales.total,
      week_sales: weekSales.total,
      month_sales: monthSales.total,
      orders_today: ordersToday.count,
      product_count: productCount.count,
      pending_count: pendingCount.count,
      avg_rating: avgRating.avg || 0,
    },
    recent_orders: recentOrders,
  });
});

// ── GET /api/vendor/products ───────────────────────────────────────────────────
router.get('/products', (req, res) => {
  const vendor = getVendor(req.user.id);
  if (!vendor) return res.status(404).json({ error: 'No vendor profile' });

  const products = db.prepare(`
    SELECT p.*, c.name as category_name
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.vendor_id = ?
    ORDER BY p.created_at DESC
  `).all(vendor.id);

  res.json({ products });
});

// ── GET /api/vendor/orders ────────────────────────────────────────────────────
router.get('/orders', (req, res) => {
  const vendor = getVendor(req.user.id);
  if (!vendor) return res.status(404).json({ error: 'No vendor profile' });

  const orders = db.prepare(`
    SELECT DISTINCT o.*, u.name as customer_name, u.email as customer_email,
           GROUP_CONCAT(oi.name || ' x' || oi.qty, ', ') as items_summary
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id AND oi.vendor_id = ?
    JOIN users u ON u.id = o.user_id
    GROUP BY o.id
    ORDER BY o.created_at DESC
    LIMIT 50
  `).all(vendor.id);

  res.json({ orders });
});

// ── PUT /api/vendor/profile ───────────────────────────────────────────────────
router.put('/profile', (req, res) => {
  const vendor = getVendor(req.user.id);
  if (!vendor) return res.status(404).json({ error: 'No vendor profile' });

  const { shop_name, shop_emoji, description } = req.body;
  db.prepare(`
    UPDATE vendors SET shop_name = COALESCE(?, shop_name),
    shop_emoji = COALESCE(?, shop_emoji),
    description = COALESCE(?, description)
    WHERE id = ?
  `).run(shop_name, shop_emoji, description, vendor.id);

  res.json({ message: 'Profile updated', vendor: getVendor(req.user.id) });
});

module.exports = router;
