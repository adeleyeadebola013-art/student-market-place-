// db/seed.js — populate the database with sample data
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('./database');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

console.log('🌱 Seeding database...');

// ── CATEGORIES ───────────────────────────────────────────────────────────────
const categories = [
  { slug: 'food',       name: 'Meals & Food',     icon: '🍱' },
  { slug: 'snacks',     name: 'Snacks & Drinks',  icon: '🍿' },
  { slug: 'stationery', name: 'Stationery',        icon: '✏️' },
  { slug: 'books',      name: 'Books & Notes',     icon: '📚' },
  { slug: 'tech',       name: 'Tech & Gadgets',    icon: '💻' },
  { slug: 'services',   name: 'Services',          icon: '🛠️' },
];

const insertCat = db.prepare(`INSERT OR IGNORE INTO categories (slug, name, icon) VALUES (?, ?, ?)`);
categories.forEach(c => insertCat.run(c.slug, c.name, c.icon));
console.log('✅ Categories seeded');

// ── USERS ────────────────────────────────────────────────────────────────────
const SALT = 10;
const users = [
  { id: uuidv4(), name: "Admin User",     email: "admin@campuscart.ng",   password: "admin123",   role: "admin",   avatar: "👑" },
  { id: uuidv4(), name: "Mama Chioma",    email: "mama@campuscart.ng",    password: "vendor123",  role: "vendor",  avatar: "👩‍🍳" },
  { id: uuidv4(), name: "StudyHub Store", email: "studyhub@campuscart.ng",password: "vendor123",  role: "vendor",  avatar: "📚" },
  { id: uuidv4(), name: "Adaeze Okafor",  email: "ada@student.edu.ng",    password: "student123", role: "student", avatar: "🎓" },
  { id: uuidv4(), name: "Emeka Jide",     email: "emeka@student.edu.ng",  password: "student123", role: "student", avatar: "🎓" },
];

const insertUser = db.prepare(`
  INSERT OR IGNORE INTO users (id, name, email, password, role, avatar)
  VALUES (?, ?, ?, ?, ?, ?)
`);

for (const u of users) {
  const hash = bcrypt.hashSync(u.password, SALT);
  insertUser.run(u.id, u.name, u.email, hash, u.role, u.avatar);
}
console.log('✅ Users seeded');

// ── VENDORS ──────────────────────────────────────────────────────────────────
const vendorUser1 = db.prepare('SELECT id FROM users WHERE email = ?').get('mama@campuscart.ng');
const vendorUser2 = db.prepare('SELECT id FROM users WHERE email = ?').get('studyhub@campuscart.ng');

const vendor1Id = uuidv4();
const vendor2Id = uuidv4();

const insertVendor = db.prepare(`
  INSERT OR IGNORE INTO vendors (id, user_id, shop_name, shop_emoji, description)
  VALUES (?, ?, ?, ?, ?)
`);

insertVendor.run(vendor1Id, vendorUser1.id, "Mama's Kitchen", "🍱", "Home-cooked Nigerian meals delivered fresh to your hostel.");
insertVendor.run(vendor2Id, vendorUser2.id, "StudyHub Store", "📚", "All your academic supplies in one place.");
console.log('✅ Vendors seeded');

// ── PRODUCTS ─────────────────────────────────────────────────────────────────
const catMap = {};
db.prepare('SELECT * FROM categories').all().forEach(c => catMap[c.slug] = c.id);

const products = [
  // Mama's Kitchen — Food
  { vendor: vendor1Id, cat: 'food',    name: 'Jollof Rice Combo',        emoji: '🍱', price: 1500, stock: 50, rating: 4.8, reviews: 124, hot: 1 },
  { vendor: vendor1Id, cat: 'food',    name: 'Fried Rice + Chicken',      emoji: '🍗', price: 2000, stock: 30, rating: 4.7, reviews: 89,  hot: 0 },
  { vendor: vendor1Id, cat: 'food',    name: 'Egusi Soup + Eba',          emoji: '🥘', price: 1200, stock: 40, rating: 4.9, reviews: 201, hot: 1 },
  { vendor: vendor1Id, cat: 'snacks',  name: 'Cold Brew Coffee',          emoji: '☕', price: 700,  stock: 80, rating: 4.5, reviews: 56,  hot: 0 },
  { vendor: vendor1Id, cat: 'snacks',  name: 'Snack Pack (Assorted)',     emoji: '🍿', price: 600,  stock: 100,rating: 4.3, reviews: 77,  hot: 0 },
  { vendor: vendor1Id, cat: 'snacks',  name: 'Chapman Drink',             emoji: '🥤', price: 400,  stock: 60, rating: 4.6, reviews: 43,  hot: 0 },
  // StudyHub — Stationery & Books
  { vendor: vendor2Id, cat: 'stationery', name: 'Geometry Set',           emoji: '📐', price: 850,  stock: 200,rating: 4.4, reviews: 38,  hot: 0 },
  { vendor: vendor2Id, cat: 'stationery', name: 'Lecture Notepad A4',     emoji: '📔', price: 450,  stock: 500,rating: 4.2, reviews: 61,  hot: 0 },
  { vendor: vendor2Id, cat: 'stationery', name: 'Scientific Calculator',  emoji: '🔢', price: 3500, stock: 45, rating: 4.8, reviews: 92,  hot: 1 },
  { vendor: vendor2Id, cat: 'books',   name: 'Engineering Maths Textbook',emoji: '📖', price: 8500, stock: 20, rating: 4.6, reviews: 29,  hot: 0 },
  { vendor: vendor2Id, cat: 'books',   name: 'Past Question Bundle (PDF)',emoji: '📄', price: 1500, stock: 999,rating: 4.9, reviews: 310, hot: 1 },
  { vendor: vendor2Id, cat: 'tech',    name: 'USB-C Charging Cable',      emoji: '🔌', price: 1200, stock: 150,rating: 4.1, reviews: 55,  hot: 0 },
  { vendor: vendor2Id, cat: 'tech',    name: 'Wireless Earbuds',          emoji: '🎧', price: 12000,stock: 15, rating: 4.5, reviews: 22,  hot: 1 },
];

const insertProduct = db.prepare(`
  INSERT OR IGNORE INTO products (id, vendor_id, category_id, name, emoji, price, stock, rating, review_count, is_hot)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

for (const p of products) {
  insertProduct.run(uuidv4(), p.vendor, catMap[p.cat], p.name, p.emoji, p.price, p.stock, p.rating, p.reviews, p.hot ? 1 : 0);
}
console.log('✅ Products seeded');

console.log('\n🎉 Database seeded successfully!');
console.log('\n📋 Test accounts:');
console.log('  Student : ada@student.edu.ng     / student123');
console.log('  Vendor  : mama@campuscart.ng     / vendor123');
console.log('  Admin   : admin@campuscart.ng    / admin123');
