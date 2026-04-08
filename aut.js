// routes/auth.js
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');

// ── POST /api/auth/register ──────────────────────────────────────────────────
router.post('/register', (req, res) => {
  const { name, email, password, role = 'student', shopName, shopEmoji } = req.body;

  if (!name || !email || !password)
    return res.status(400).json({ error: 'Name, email and password are required' });

  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });

  if (!['student', 'vendor'].includes(role))
    return res.status(400).json({ error: 'Role must be student or vendor' });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const hash = bcrypt.hashSync(password, 10);
  const userId = uuidv4();
  const avatar = role === 'vendor' ? '🏪' : '🎓';

  db.prepare(`INSERT INTO users (id, name, email, password, role, avatar) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(userId, name.trim(), email.toLowerCase().trim(), hash, role, avatar);

  // If registering as vendor, also create vendor profile
  if (role === 'vendor') {
    if (!shopName) return res.status(400).json({ error: 'Shop name is required for vendors' });
    db.prepare(`INSERT INTO vendors (id, user_id, shop_name, shop_emoji) VALUES (?, ?, ?, ?)`)
      .run(uuidv4(), userId, shopName.trim(), shopEmoji || '🏪');
  }

  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });

  const user = db.prepare('SELECT id, name, email, role, avatar FROM users WHERE id = ?').get(userId);
  res.status(201).json({ message: 'Account created successfully', token, user });
});

// ── POST /api/auth/login ─────────────────────────────────────────────────────
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email and password required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });

  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });

  // Get vendor info if applicable
  let vendor = null;
  if (user.role === 'vendor') {
    vendor = db.prepare('SELECT * FROM vendors WHERE user_id = ?').get(user.id);
  }

  res.json({
    message: 'Login successful',
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, avatar: user.avatar },
    vendor
  });
});

// ── GET /api/auth/me ─────────────────────────────────────────────────────────
router.get('/me', authenticate, (req, res) => {
  let vendor = null;
  if (req.user.role === 'vendor') {
    vendor = db.prepare('SELECT * FROM vendors WHERE user_id = ?').get(req.user.id);
  }
  res.json({ user: req.user, vendor });
});

// ── PUT /api/auth/me ─────────────────────────────────────────────────────────
router.put('/me', authenticate, (req, res) => {
  const { name, avatar } = req.body;
  db.prepare('UPDATE users SET name = ?, avatar = ?, updated_at = datetime("now") WHERE id = ?')
    .run(name || req.user.name, avatar || req.user.avatar, req.user.id);
  const updated = db.prepare('SELECT id, name, email, role, avatar FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: updated });
});

// ── POST /api/auth/change-password ──────────────────────────────────────────
router.post('/change-password', authenticate, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword)
    return res.status(400).json({ error: 'Both passwords required' });
  if (newPassword.length < 6)
    return res.status(400).json({ error: 'New password must be at least 6 characters' });

  const user = db.prepare('SELECT password FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(currentPassword, user.password))
    return res.status(401).json({ error: 'Current password incorrect' });

  db.prepare('UPDATE users SET password = ? WHERE id = ?')
    .run(bcrypt.hashSync(newPassword, 10), req.user.id);
  res.json({ message: 'Password changed successfully' });
});

module.exports = router;
