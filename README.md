# 🛒 CampusCart — Student Marketplace

A full-stack student marketplace with Node.js + Express + SQLite backend, JWT auth, and Paystack payments.

---

## 🚀 Quick Start

### 1. Install Node.js
Download from https://nodejs.org (v18+ recommended)

### 2. Install dependencies
```bash
cd campuscart
npm install
```

### 3. Configure environment
Edit `.env` and set your values:
```
JWT_SECRET=any_long_random_string_here
PAYSTACK_SECRET_KEY=sk_test_your_key   # from dashboard.paystack.com
PAYSTACK_PUBLIC_KEY=pk_test_your_key
```

### 4. Seed the database
```bash
npm run seed
```

### 5. Start the server
```bash
npm start
# or for auto-reload during development:
npm run dev
```

### 6. Open in browser
```
http://localhost:3000
```

---

## 🧪 Test Accounts

| Role    | Email                      | Password    |
|---------|---------------------------|-------------|
| Student | ada@student.edu.ng        | student123  |
| Vendor  | mama@campuscart.ng        | vendor123   |
| Admin   | admin@campuscart.ng       | admin123    |

---

## 💳 Paystack Setup (Payments)

1. Sign up at https://dashboard.paystack.com
2. Go to **Settings → API Keys**
3. Copy your **Test Secret Key** and **Test Public Key**
4. Paste them into `.env`
5. Restart the server

For webhooks (payment confirmation in production):
- Set webhook URL to: `https://yourdomain.com/api/webhooks/paystack`

---

## 📁 Project Structure

```
campuscart/
├── server.js          # Express app entry point
├── .env               # Environment variables (edit this!)
├── package.json
├── db/
│   ├── database.js    # SQLite schema + connection
│   └── seed.js        # Sample data seeder
├── middleware/
│   └── auth.js        # JWT authentication middleware
├── routes/
│   ├── auth.js        # Register, login, profile
│   ├── products.js    # CRUD + search + reviews
│   ├── cart.js        # Cart management
│   ├── orders.js      # Order placement + Paystack + tracking
│   └── vendor.js      # Vendor dashboard API
└── public/
    └── index.html     # Frontend (served by Express)
```

---

## 🔌 API Reference

### Auth
| Method | Endpoint              | Description         |
|--------|-----------------------|---------------------|
| POST   | /api/auth/register    | Create account      |
| POST   | /api/auth/login       | Sign in             |
| GET    | /api/auth/me          | Get current user    |
| PUT    | /api/auth/me          | Update profile      |

### Products
| Method | Endpoint                    | Description              |
|--------|-----------------------------|--------------------------|
| GET    | /api/products               | List (search/filter)     |
| GET    | /api/products/categories    | All categories           |
| GET    | /api/products/:id           | Single product + reviews |
| POST   | /api/products               | Create (vendor only)     |
| PUT    | /api/products/:id           | Update (vendor only)     |
| DELETE | /api/products/:id           | Remove (vendor only)     |
| POST   | /api/products/:id/review    | Submit review            |

### Cart
| Method | Endpoint             | Description       |
|--------|----------------------|-------------------|
| GET    | /api/cart            | Get cart          |
| POST   | /api/cart            | Add item          |
| PUT    | /api/cart/:productId | Update qty        |
| DELETE | /api/cart/:productId | Remove item       |
| DELETE | /api/cart            | Clear cart        |

### Orders
| Method | Endpoint                    | Description            |
|--------|-----------------------------|------------------------|
| GET    | /api/orders                 | My orders              |
| GET    | /api/orders/:id             | Order detail + items   |
| POST   | /api/orders                 | Place order            |
| POST   | /api/orders/paystack/verify | Verify Paystack payment|
| PUT    | /api/orders/:id/status      | Update status (vendor) |

### Vendor Dashboard
| Method | Endpoint              | Description         |
|--------|-----------------------|---------------------|
| GET    | /api/vendor/dashboard | Stats + recent orders|
| GET    | /api/vendor/products  | My products         |
| GET    | /api/vendor/orders    | My orders           |
| PUT    | /api/vendor/profile   | Update shop info    |

---

## 🛠️ Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: SQLite (via better-sqlite3)
- **Auth**: JWT (jsonwebtoken) + bcryptjs
- **Payments**: Paystack
- **Frontend**: Vanilla HTML/CSS/JS (no framework)

---

## 🚢 Deploying to Production

1. Set `NODE_ENV=production` in `.env`
2. Change `JWT_SECRET` to a strong random string (50+ chars)
3. Use a process manager: `npm install -g pm2 && pm2 start server.js`
4. Put behind Nginx or Caddy for HTTPS
5. Update `FRONTEND_URL` to your domain
