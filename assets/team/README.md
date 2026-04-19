# LAB U (Unified Storefront)

This project is a static website + a small Node.js server (`server.js`) that powers:
- Accounts (register/login/logout + sessions)
- Products, cart, orders
- Admin dashboard endpoints

## Quick start

1. Install **Node.js 22+** (required for the built-in `node:sqlite` module used by `server.js`).
2. In this folder, run:

   `node server.js`

   (or `npm start` if you prefer)
3. Open:

   `http://127.0.0.1:3000`

## Accounts

- Customer: create an account via `register.html`
- Admin (seeded on first run):
  - Email: `admin@digitalforge.local`
  - Password: `Admin123!`

Override the admin seed with environment variables:
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

## Data

The SQLite database is stored at `data/forge-auth.db` (ignored by git).
