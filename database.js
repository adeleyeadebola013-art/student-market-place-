// db/database.js — SQLite setup with better-sqlite3
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'campuscart.db');

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── SCHEMA ──────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    email       TEXT UNIQUE NOT NULL,
    password    TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'student'  CHECK(role IN ('student','vendor','admin')),
    avatar      TEXT DEFAULT '🎓',
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS vendors (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    shop_name   TEXT NOT NULL,
    shop_emoji  TEXT DEFAULT '🏪',
    description TEXT,
    is_active   INTEGER DEFAULT 1,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS categories (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    slug  TEXT UNIQUE NOT NULL,
    name  TEXT NOT NULL,
    icon  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS products (
    id          TEXT PRIMARY KEY,
    vendor_id   TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    category_id INTEGER REFERENCES categories(id),
    name        TEXT NOT NULL,
    description TEXT,
    emoji       TEXT DEFAULT '📦',
    price       REAL NOT NULL CHECK(price > 0),
    stock       INTEGER NOT NULL DEFAULT 0,
    is_active   INTEGER DEFAULT 1,
    is_hot      INTEGER DEFAULT 0,
    rating      REAL DEFAULT 0,
    review_count INTEGER DEFAULT 0,
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS cart_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id  TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    qty         INTEGER NOT NULL DEFAULT 1 CHECK(qty > 0),
    added_at    TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, product_id)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id),
    status          TEXT DEFAULT 'pending' CHECK(status IN ('pending','confirmed','preparing','in_transit','delivered','cancelled')),
    subtotal        REAL NOT NULL,
    delivery_fee    REAL DEFAULT 500,
    total           REAL NOT NULL,
    delivery_address TEXT,
    delivery_note   TEXT,
    payment_method  TEXT,
    payment_status  TEXT DEFAULT 'unpaid' CHECK(payment_status IN ('unpaid','paid','refunded')),
    paystack_ref    TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id    TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id  TEXT NOT NULL REFERENCES products(id),
    vendor_id   TEXT NOT NULL REFERENCES vendors(id),
    name        TEXT NOT NULL,
    emoji       TEXT,
    price       REAL NOT NULL,
    qty         INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id  TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id     TEXT NOT NULL REFERENCES users(id),
    rating      INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    comment     TEXT,
    created_at  TEXT DEFAULT (datetime('now')),
    UNIQUE(product_id, user_id)
  );

  -- Indexes
  CREATE INDEX IF NOT EXISTS idx_products_vendor    ON products(vendor_id);
  CREATE INDEX IF NOT EXISTS idx_products_category  ON products(category_id);
  CREATE INDEX IF NOT EXISTS idx_orders_user        ON orders(user_id);
  CREATE INDEX IF NOT EXISTS idx_order_items_order  ON order_items(order_id);
  CREATE INDEX IF NOT EXISTS idx_cart_user          ON cart_items(user_id);
`);

module.exports = db;
