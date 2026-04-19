const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");
const { randomBytes, scryptSync, timingSafeEqual } = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, "data");
const DB_PATH = path.join(DATA_DIR, "forge-auth.db");
const PRODUCT_ASSET_DIR = path.join(ROOT_DIR, "assets", "products");
const SESSION_COOKIE = "labu_session";
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 365 * 10; // 10 years
const RESET_TOKEN_TTL_MS = 1000 * 60 * 30; // 30 minutes
const MAX_JSON_BODY_BYTES = 6_000_000;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@digitalforge.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin123!";
const ORDER_STATUSES = ["placed", "waiting_carrier", "in_transit", "delivered", "cancelled"];
const PAYMENT_METHODS = ["cash_on_delivery", "card"];
const DEFAULT_USD_TO_PHP = Number(process.env.USD_TO_PHP || 56);
const DEFAULT_PRICE_ROUND_TO = Number(process.env.PRICE_ROUND_TO || 50);

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(PRODUCT_ASSET_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
const schema = fs.readFileSync(path.join(ROOT_DIR, "schema.sql"), "utf8");
db.exec(schema);

function tableHasColumn(tableName, columnName) {
  return db
    .prepare(`PRAGMA table_info(${tableName})`)
    .all()
    .some((column) => column.name === columnName);
}

function ensureColumn(tableName, columnName, definition) {
  if (!tableHasColumn(tableName, columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function seedExampleStocksIfAllOut() {
  const products = db.prepare("SELECT id, tier, category, stock FROM products ORDER BY id ASC").all();
  if (!products.length) return;

  const hasInStock = products.some((product) => Number(product.stock) > 0);
  if (hasInStock) return;

  const tierBaseStock = { mid: 26, high: 17, elite: 9 };
  const categoryStockAdjust = {
    GPU: -2,
    CPU: -1,
    Motherboard: 1,
    RAM: 3,
    SSD: 2,
    "Input Device": 4,
    "Output Device": 2,
    Cooling: 1,
    PSU: 1,
    Case: 2
  };

  const updateStock = db.prepare("UPDATE products SET stock = ? WHERE id = ?");
  products.forEach((product, index) => {
    const tier = String(product.tier || "mid").toLowerCase();
    const base = tierBaseStock[tier] ?? 20;
    const categoryAdjust = categoryStockAdjust[product.category] ?? 0;
    const wave = (index % 4) - 1;
    const stock = Math.max(1, base + categoryAdjust + wave);
    updateStock.run(stock, product.id);
  });
}

function runMigrations() {
  ensureColumn("users", "role", "TEXT NOT NULL DEFAULT 'customer'");
  ensureColumn("orders", "payment_method", "TEXT NOT NULL DEFAULT 'cash_on_delivery'");
  ensureColumn("products", "image_url", "TEXT");
  ensureColumn("products", "stock", "INTEGER NOT NULL DEFAULT 20");
  ensureColumn("orders", "address", "TEXT");
  ensureColumn("orders", "contact_number", "TEXT");
  ensureColumn("users", "avatar_data", "TEXT");
  ensureColumn("users", "phone", "TEXT");
  ensureColumn("users", "address", "TEXT");
  ensureColumn("users", "default_payment", "TEXT");

  db.prepare("UPDATE users SET role = 'customer' WHERE role IS NULL OR trim(role) = ''").run();
  db.prepare("UPDATE orders SET status = 'placed' WHERE status IS NULL OR trim(status) = ''").run();
  db.prepare("UPDATE orders SET status = 'delivered' WHERE status = 'completed'").run();
  db.prepare("UPDATE orders SET payment_method = 'cash_on_delivery' WHERE payment_method IS NULL OR trim(payment_method) = ''").run();
  db.prepare("UPDATE products SET stock = 20 WHERE stock IS NULL").run();
  db.prepare("UPDATE products SET stock = 0 WHERE stock < 0").run();
  seedExampleStocksIfAllOut();

  migrateProductPricesToPHP();
}

runMigrations();

function migrateProductPricesToPHP() {
  try {
    const versionRow = db.prepare("PRAGMA user_version").get() || {};
    const userVersion = Number(versionRow.user_version || 0);
    if (userVersion >= 2) return;

    const maxRow = db.prepare("SELECT MAX(price) AS max_price FROM products").get() || {};
    const maxPrice = Number(maxRow.max_price || 0);

    // If prices already look like PHP, just bump the version marker.
    if (maxPrice >= 5_000) {
      db.exec("PRAGMA user_version = 2");
      return;
    }

    const multiplier = Number.isFinite(DEFAULT_USD_TO_PHP) && DEFAULT_USD_TO_PHP > 0 ? DEFAULT_USD_TO_PHP : 56;
    const roundTo = Number.isFinite(DEFAULT_PRICE_ROUND_TO) && DEFAULT_PRICE_ROUND_TO > 0 ? DEFAULT_PRICE_ROUND_TO : 50;

    db.exec(`
      UPDATE products
      SET price = CAST(ROUND((price * ${multiplier}) / ${roundTo}) * ${roundTo} AS INTEGER)
    `);

    db.exec("PRAGMA user_version = 2");
    console.log(`Migrated product prices to PHP (x${multiplier}, rounded to ${roundTo}).`);
  } catch (error) {
    console.error("Price migration failed:", error);
  }
}

db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now());
db.prepare("DELETE FROM password_reset_tokens WHERE expires_at <= ?").run(Date.now());

const statements = {
  findUserByEmail: db.prepare("SELECT * FROM users WHERE lower(email) = lower(?)"),
  findUserById: db.prepare("SELECT * FROM users WHERE id = ?"),
  createUser: db.prepare("INSERT INTO users (email, password_hash, full_name, role) VALUES (?, ?, ?, ?)"),
  updateUserRole: db.prepare("UPDATE users SET role = ? WHERE id = ?"),
  updateUserPassword: db.prepare("UPDATE users SET password_hash = ? WHERE id = ?"),
  updateUserProfile: db.prepare("UPDATE users SET phone = ?, address = ?, default_payment = ?, avatar_data = ? WHERE id = ?"),
  deleteUser: db.prepare("DELETE FROM users WHERE id = ?"),
  createSession: db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)"),
  findSession: db.prepare(`
    SELECT sessions.token, sessions.user_id, sessions.expires_at, users.*
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token = ?
  `),
  deleteSession: db.prepare("DELETE FROM sessions WHERE token = ?"),
  deleteSessionsByUser: db.prepare("DELETE FROM sessions WHERE user_id = ?"),
  createPasswordResetToken: db.prepare("INSERT INTO password_reset_tokens (token, user_id, expires_at) VALUES (?, ?, ?)"),
  findPasswordResetToken: db.prepare("SELECT token, user_id, expires_at FROM password_reset_tokens WHERE token = ? AND expires_at > ?"),
  deletePasswordResetToken: db.prepare("DELETE FROM password_reset_tokens WHERE token = ?"),
  deletePasswordResetTokensByUser: db.prepare("DELETE FROM password_reset_tokens WHERE user_id = ?"),
  
  // Products
  getAllProducts: db.prepare("SELECT * FROM products ORDER BY id ASC"),
  getProductById: db.prepare("SELECT * FROM products WHERE id = ?"),
  updateProductStock: db.prepare("UPDATE products SET stock = ? WHERE id = ?"),
  incrementProductStock: db.prepare("UPDATE products SET stock = stock + ? WHERE id = ?"),
  decrementProductStockIfEnough: db.prepare("UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?"),
  countProducts: db.prepare("SELECT COUNT(*) as count FROM products"),
  insertProduct: db.prepare(`
    INSERT INTO products (name, category, tier, price, stock, badge, accent, description, image_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),

  // Cart
  getCartItems: db.prepare(`
    SELECT cart_items.quantity, products.*
    FROM cart_items
    JOIN products ON products.id = cart_items.product_id
    WHERE cart_items.user_id = ?
  `),
  upsertCartItem: db.prepare(`
    INSERT INTO cart_items (user_id, product_id, quantity)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, product_id) DO UPDATE SET quantity = excluded.quantity
  `),
  deleteCartItem: db.prepare("DELETE FROM cart_items WHERE user_id = ? AND product_id = ?"),
  clearCart: db.prepare("DELETE FROM cart_items WHERE user_id = ?"),

  // Orders
  getOrders: db.prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC"),
  getAllOrders: db.prepare(`
    SELECT orders.*, users.email AS customer_email, users.full_name AS customer_full_name
    FROM orders
    JOIN users ON users.id = orders.user_id
    ORDER BY orders.created_at DESC
  `),
  createOrder: db.prepare(`
    INSERT INTO orders (user_id, items_json, total_price, status, payment_method, address, contact_number)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  updateOrderStatus: db.prepare("UPDATE orders SET status = ? WHERE id = ?"),
  getOrderForUser: db.prepare("SELECT id, status, items_json FROM orders WHERE id = ? AND user_id = ?"),
  getOrderById: db.prepare("SELECT id, status, items_json FROM orders WHERE id = ?")
};

async function seedProducts() {
  const { count } = statements.countProducts.get();
  if (count > 0) return;

  console.log("Seeding products database...");
  const initialProducts = [
    { name: "Ryzen 3 3200G", category: "CPU", tier: "mid", price: 5550, badge: "APU", accent: "orange", desc: "Budget quad-core Ryzen processor with built-in Radeon graphics." },
    { name: "Ryzen 5 4600G", category: "CPU", tier: "mid", price: 7200, badge: "APU", accent: "orange", desc: "Balanced six-core Ryzen chip for affordable builds and office setups." },
    { name: "Ryzen 5 5600G", category: "CPU", tier: "high", price: 7800, badge: "Popular APU", accent: "green", desc: "Ryzen 5 model with integrated graphics for compact starter gaming PCs." },
    { name: "Ryzen 5 5600X", category: "CPU", tier: "high", price: 8900, badge: "6-Core", accent: "green", desc: "Fast Ryzen gaming CPU with strong value for mainstream builds." },
    { name: "Ryzen 7 5700X", category: "CPU", tier: "high", price: 11150, badge: "8-Core", accent: "cyan", desc: "Excellent Ryzen 7 chip for gaming, editing, and multitasking." },
    { name: "Ryzen 7 5800X3D", category: "CPU", tier: "elite", price: 16200, badge: "3D V-Cache", accent: "cyan", desc: "Top AM4 Ryzen gaming CPU with extra cache for high frame rates." },
    { name: "Ryzen 9 5900X", category: "CPU", tier: "elite", price: 18400, badge: "12-Core", accent: "violet", desc: "Ryzen 9 processor built for streaming, rendering, and heavier workloads." },
    { name: "Ryzen 9 7950X3D", category: "CPU", tier: "elite", price: 33550, badge: "Flagship", accent: "violet", desc: "Premium Ryzen 9 chip for enthusiast gaming and creator-class performance." },
    { name: "Aegis B550 Board", category: "Motherboard", tier: "mid", price: 8350, badge: "AM4 Ready", accent: "red", desc: "Reliable AM4 motherboard for Ryzen 3000 and Ryzen 5000 series builds." },
    { name: "Aegis B650 Board", category: "Motherboard", tier: "high", price: 15600, badge: "AM5 Ready", accent: "red", desc: "DDR5 motherboard with PCIe 5.0 support for newer Ryzen platforms." },
    { name: "Kingston ValueRAM 4GB DDR4", category: "RAM", tier: "mid", price: 1050, badge: "4GB / 2200MHz", accent: "blue", desc: "Entry-level Kingston memory stick for basic PCs and light office builds." },
    { name: "Crucial Basics 8GB DDR4", category: "RAM", tier: "mid", price: 1600, badge: "8GB / 2400MHz", accent: "blue", desc: "Common Crucial RAM option for day-to-day systems and school computers." },
    { name: "TeamGroup Elite 16GB DDR4", category: "RAM", tier: "mid", price: 2750, badge: "16GB / 2666MHz", accent: "blue", desc: "TeamGroup dual-channel memory kit for multitasking and mainstream gaming." },
    { name: "G.Skill Ripjaws V 16GB DDR4", category: "RAM", tier: "high", price: 3850, badge: "16GB / 3000MHz", accent: "cyan", desc: "Popular G.Skill kit that balances gaming speed and stable everyday performance." },
    { name: "Corsair Vengeance LPX 32GB DDR4", category: "RAM", tier: "high", price: 8900, badge: "32GB / 3200MHz", accent: "cyan", desc: "Common Corsair performance memory kit for heavier games, editing, and multitasking." },
    { name: "Kingston NV2 256GB", category: "SSD", tier: "mid", price: 1950, badge: "256GB / NVMe", accent: "orange", desc: "Compact Kingston SSD for boot drives and smaller everyday storage needs." },
    { name: "Crucial BX500 512GB", category: "SSD", tier: "mid", price: 2750, badge: "512GB / SATA", accent: "orange", desc: "Common Crucial SSD with more room for apps, files, and light game libraries." },
    { name: "WD Blue SN570 1TB", category: "SSD", tier: "high", price: 5000, badge: "1TB / NVMe", accent: "orange", desc: "WD Blue NVMe SSD with solid speed and a roomy 1TB capacity." },
    { name: "Samsung 970 EVO Plus 1TB", category: "SSD", tier: "high", price: 8350, badge: "1TB / NVMe", accent: "orange", desc: "Popular Samsung SSD for fast load times, large games, and project storage." },
    { name: "Vortex RTX 4070 Super", category: "GPU", tier: "elite", price: 36350, badge: "1440p Ultra", accent: "cyan", desc: "High-performance graphics card for smooth 1440p gaming and creator work." },
    { name: "GhostFlow 240 AIO", category: "Cooling", tier: "high", price: 7200, badge: "ARGB", accent: "green", desc: "240mm liquid cooler to keep Ryzen systems cool under heavy load." },
    { name: "Nova 750W Gold", category: "PSU", tier: "mid", price: 6650, badge: "Modular", accent: "gray", desc: "Dependable 750W power supply for gaming systems with cable management." },
    { name: "ForgeMesh Case", category: "Case", tier: "mid", price: 6650, badge: "Airflow", accent: "slate", desc: "Airflow-focused mid tower with tempered glass and roomy cable routing." },
    { name: "Pulse 27 Monitor", category: "Output Device", tier: "high", price: 18400, badge: "165Hz", accent: "blue", desc: "27-inch QHD monitor for output display with fast refresh and sharp detail." },
    { name: "Echo Studio Speakers", category: "Output Device", tier: "mid", price: 5550, badge: "2.1 Audio", accent: "slate", desc: "Desktop speaker system for clear output audio in gaming and media setups." },
    { name: "Halo Gaming Headset", category: "Output Device", tier: "mid", price: 5000, badge: "Spatial Audio", accent: "violet", desc: "Comfortable headset for game sound, voice chat, and immersive listening." },
    { name: "Vector Gaming Mouse", category: "Input Device", tier: "mid", price: 3300, badge: "Lightweight", accent: "red", desc: "Responsive gaming mouse for fast and accurate input control." },
    { name: "Forge Mechanical Keyboard", category: "Input Device", tier: "high", price: 4400, badge: "Hot-Swap", accent: "cyan", desc: "Mechanical keyboard for crisp typing, macros, and gaming input." },
    { name: "Wave USB Microphone", category: "Input Device", tier: "high", price: 6100, badge: "Streaming", accent: "green", desc: "USB microphone for voice input, streaming, and online meetings." },
    { name: "Focus 1080p Webcam", category: "Input Device", tier: "mid", price: 3850, badge: "Auto Focus", accent: "blue", desc: "Webcam for video input in classes, streaming, and conference calls." }
  ];

  const tierBaseStock = { mid: 26, high: 17, elite: 9 };
  const categoryStockAdjust = {
    GPU: -2,
    CPU: -1,
    Motherboard: 1,
    RAM: 3,
    SSD: 2,
    "Input Device": 4,
    "Output Device": 2,
    Cooling: 1,
    PSU: 1,
    Case: 2
  };

  initialProducts.forEach((p, index) => {
    const base = tierBaseStock[p.tier] ?? 20;
    const categoryAdjust = categoryStockAdjust[p.category] ?? 0;
    const wave = (index % 4) - 1;
    const stock = Math.max(1, base + categoryAdjust + wave);
    statements.insertProduct.run(p.name, p.category, p.tier, p.price, stock, p.badge, p.accent, p.desc, null);
  });
}
seedProducts();

function seedAdminAccount() {
  const existing = statements.findUserByEmail.get(ADMIN_EMAIL);
  if (existing) {
    if ((existing.role || "customer") !== "admin") {
      statements.updateUserRole.run("admin", existing.id);
    }
    return;
  }

  statements.createUser.run(ADMIN_EMAIL, hashPassword(ADMIN_PASSWORD), "LAB U Admin", "admin");
  console.log(`Seeded admin account: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
}

seedAdminAccount();


const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp"
};

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

function verifyPassword(password, storedHash) {
  const [algorithm, salt, hashedValue] = String(storedHash).split("$");
  if (algorithm !== "scrypt" || !salt || !hashedValue) return false;

  const derived = scryptSync(password, salt, 64);
  const stored = Buffer.from(hashedValue, "hex");
  if (stored.length !== derived.length) return false;
  return timingSafeEqual(stored, derived);
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeOrderStatus(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  const map = {
    completed: "delivered",
    canceled: "cancelled",
    cancelled: "cancelled",
    waiting_for_carrier: "waiting_carrier",
    waiting: "waiting_carrier",
    transit: "in_transit",
    intransit: "in_transit",
    shipped: "in_transit",
    shipping: "in_transit"
  };

  const normalized = map[key] || key;
  return ORDER_STATUSES.includes(normalized) ? normalized : "placed";
}

function normalizePaymentMethod(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return PAYMENT_METHODS.includes(normalized) ? normalized : "cash_on_delivery";
}

function sanitizeStock(value) {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed);
}

function serializeUser(user) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name || "",
    role: user.role || "customer",
    createdAt: user.created_at,
    avatarData: user.avatar_data || null,
    phone: user.phone || null,
    address: user.address || null,
    defaultPayment: user.default_payment || null
  };
}

function serializeProduct(product) {
  return {
    id: product.id,
    name: product.name,
    category: product.category,
    tier: product.tier,
    price: Number(product.price || 0),
    stock: sanitizeStock(product.stock),
    badge: product.badge || "",
    accent: product.accent || "cyan",
    desc: product.description || "",
    imageUrl: product.image_url || ""
  };
}

function serializeCartItem(row) {
  return {
    ...serializeProduct(row),
    quantity: Number(row.quantity || 1)
  };
}

function parseOrderItems(rawItems) {
  try {
    const items = JSON.parse(rawItems || "[]");
    if (!Array.isArray(items)) return [];
    return items.map((item) => ({
      id: Number(item.id || 0),
      name: item.name || "",
      category: item.category || "",
      tier: item.tier || "",
      price: Number(item.price || 0),
      badge: item.badge || "",
      accent: item.accent || "cyan",
      desc: item.desc || item.description || "",
      imageUrl: item.imageUrl || item.image_url || "",
      quantity: Number(item.quantity || 1)
    }));
  } catch (error) {
    return [];
  }
}

function serializeOrder(order) {
  return {
    id: order.id,
    userId: order.user_id,
    createdAt: order.created_at,
    total: Number(order.total_price || 0),
    status: normalizeOrderStatus(order.status),
    paymentMethod: normalizePaymentMethod(order.payment_method),
    items: parseOrderItems(order.items_json),
    customerName: order.customer_full_name || "",
    customerEmail: order.customer_email || ""
  };
}

function restockOrderItems(rawItems) {
  for (const item of parseOrderItems(rawItems)) {
    const productId = Number(item.id);
    const quantity = Math.max(1, Math.floor(Number(item.quantity || 1)));
    if (!Number.isFinite(productId) || productId <= 0 || quantity <= 0) continue;
    statements.incrementProductStock.run(quantity, productId);
  }
}

function createSession(userId) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + SESSION_MAX_AGE_MS;
  statements.createSession.run(token, userId, expiresAt);
  return { token, expiresAt };
}

function createPasswordResetToken(userId) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + RESET_TOKEN_TTL_MS;
  statements.deletePasswordResetTokensByUser.run(userId);
  statements.createPasswordResetToken.run(token, userId, expiresAt);
  return { token, expiresAt };
}

function parseCookies(request) {
  const cookieHeader = request.headers.cookie || "";
  return cookieHeader
    .split(";")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const index = part.indexOf("=");
      if (index === -1) return cookies;
      const key = decodeURIComponent(part.slice(0, index).trim());
      const value = decodeURIComponent(part.slice(index + 1).trim());
      cookies[key] = value;
      return cookies;
    }, {});
}

function buildSessionCookie(token, maxAgeMs) {
  const maxAge = Math.max(0, Math.floor(maxAgeMs / 1000));
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function sendJson(request, response, statusCode, payload, headers = {}) {
  const origin = request.headers.origin || "*";
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true",
    ...headers
  });
  response.end(body);
}

function sendText(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload)
  });
  response.end(payload);
}

function getAuthenticatedUser(request) {
  const cookies = parseCookies(request);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;

  const session = statements.findSession.get(token);
  if (!session) return null;
  if (session.expires_at <= Date.now()) {
    statements.deleteSession.run(token);
    return null;
  }

  return {
    token,
    user: serializeUser({
      id: session.user_id,
      email: session.email,
      full_name: session.full_name,
      role: session.role,
      created_at: session.created_at,
      avatar_data: session.avatar_data,
      phone: session.phone,
      address: session.address,
      default_payment: session.default_payment
    })
  };
}

function requireAuth(request, response) {
  const auth = getAuthenticatedUser(request);
  if (!auth) {
    sendJson(request, response, 401, { error: "Not authenticated." });
    return null;
  }
  return auth;
}

function requireAdmin(request, response) {
  const auth = requireAuth(request, response);
  if (!auth) return null;
  if (auth.user.role !== "admin") {
    sendJson(request, response, 403, { error: "Admin access required." });
    return null;
  }
  return auth;
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateDeliveryAddress(value, { required = true } = {}) {
  const address = String(value || "").trim();
  if (!address) return required ? "Please provide a delivery address." : "";
  if (address.length < 10) return "Please enter a more detailed delivery address.";
  if (address.length > 300) return "Delivery address is too long (max 300 characters).";
  if (!/[a-z]/i.test(address)) return "Please include street/city details in the delivery address.";
  return "";
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > MAX_JSON_BODY_BYTES) {
        reject(new Error("Request body too large."));
        request.destroy();
      }
    });

    request.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("Invalid JSON body."));
      }
    });

    request.on("error", reject);
  });
}

function resolveStaticPath(urlPathname) {
  let pathname = decodeURIComponent(urlPathname);
  if (pathname === "/") pathname = "/index.html";

  let requestedPath = path.join(ROOT_DIR, pathname);
  if (!path.extname(requestedPath)) {
    requestedPath = `${requestedPath}.html`;
  }

  const normalized = path.normalize(requestedPath);
  const lowerNormalized = normalized.toLowerCase();
  const lowerRoot = ROOT_DIR.toLowerCase();
  const lowerData = DATA_DIR.toLowerCase();

  if (!lowerNormalized.startsWith(lowerRoot)) return null;
  if (lowerNormalized.startsWith(lowerData)) return null;
  if (lowerNormalized === path.join(ROOT_DIR, "server.js").toLowerCase()) return null;

  return normalized;
}

function serveStaticFile(request, response, pathname) {
  const filePath = resolveStaticPath(pathname);
  if (!filePath) {
    sendText(response, 404, "Not found.");
    return;
  }

  fs.readFile(filePath, (error, file) => {
    if (error) {
      if (error.code === "ENOENT") {
        sendText(response, 404, "Not found.");
        return;
      }
      sendText(response, 500, "Unable to load file.");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Content-Length": file.byteLength,
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });

    if (request.method === "HEAD") {
      response.end();
      return;
    }

    response.end(file);
  });
}

function saveUploadedProductImage(name, imageData) {
  if (!imageData) {
    const safeLabel = String(name || "Product").replace(/[<>&"]/g, "").slice(0, 24);
    const filename = `${slugify(name) || "product"}-${Date.now()}.svg`;
    const absolutePath = path.join(PRODUCT_ASSET_DIR, filename);
    const placeholderSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#122033" />
      <stop offset="100%" stop-color="#08101a" />
    </linearGradient>
  </defs>
  <rect width="800" height="800" rx="48" fill="url(#bg)" />
  <circle cx="630" cy="180" r="120" fill="rgba(33, 212, 253, 0.18)" />
  <text x="80" y="380" fill="#f4f7fb" font-family="Segoe UI, Arial, sans-serif" font-size="54" font-weight="700">${safeLabel}</text>
  <text x="80" y="460" fill="#8d98b3" font-family="Segoe UI, Arial, sans-serif" font-size="28">Uploaded from the admin panel</text>
</svg>`.trim();
    fs.writeFileSync(absolutePath, placeholderSvg, "utf8");
    return `assets/products/${filename}`;
  }

  const match = /^data:(image\/(?:png|jpeg|jpg|webp|svg\+xml));base64,(.+)$/i.exec(String(imageData));
  if (!match) {
    throw new Error("Unsupported image format.");
  }

  const mimeType = match[1].toLowerCase();
  const extensionMap = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/svg+xml": "svg"
  };
  const extension = extensionMap[mimeType];
  const buffer = Buffer.from(match[2], "base64");

  if (!extension) {
    throw new Error("Unsupported image format.");
  }
  if (buffer.byteLength > 4_000_000) {
    throw new Error("Image is too large.");
  }

  const filename = `${slugify(name) || "product"}-${Date.now()}.${extension}`;
  const absolutePath = path.join(PRODUCT_ASSET_DIR, filename);
  fs.writeFileSync(absolutePath, buffer);
  return `assets/products/${filename}`;
}

async function handleRegister(request, response) {
  const payload = await readJsonBody(request);
  const email = String(payload.email || "").trim();
  const password = String(payload.password || "");
  const fullName = String(payload.fullName || "").trim();

  if (!fullName) {
    sendJson(request, response, 400, { error: "Please provide your full name." });
    return;
  }
  if (!validateEmail(email)) {
    sendJson(request, response, 400, { error: "Please provide a valid email address." });
    return;
  }

  if (password.length < 6) {
    sendJson(request, response, 400, { error: "Password must be at least 6 characters long." });
    return;
  }

  const existing = statements.findUserByEmail.get(email);
  if (existing) {
    sendJson(request, response, 409, { error: "An account with that email already exists." });
    return;
  }

  const passwordHash = hashPassword(password);
  const result = statements.createUser.run(email, passwordHash, fullName, "customer");
  const user = statements.findUserById.get(result.lastInsertRowid);
  const session = createSession(user.id);

  sendJson(
    request,
    response,
    201,
    { user: serializeUser(user) },
    { "Set-Cookie": buildSessionCookie(session.token, SESSION_MAX_AGE_MS) }
  );
}

async function handleLogin(request, response) {
  const payload = await readJsonBody(request);
  const email = String(payload.email || "").trim();
  const password = String(payload.password || "");

  if (!validateEmail(email) || !password) {
    sendJson(request, response, 400, { error: "Email and password are required." });
    return;
  }

  const user = statements.findUserByEmail.get(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    sendJson(request, response, 401, { error: "Invalid email or password." });
    return;
  }

  const session = createSession(user.id);
  sendJson(
    request,
    response,
    200,
    { user: serializeUser(user) },
    { "Set-Cookie": buildSessionCookie(session.token, SESSION_MAX_AGE_MS) }
  );
}

async function handleForgotPassword(request, response) {
  const payload = await readJsonBody(request);
  const email = String(payload.email || "").trim();
  const password = String(payload.password || payload.newPassword || "");
  const confirmPassword = String(payload.confirmPassword || payload.confirm || "");

  if (!validateEmail(email)) {
    sendJson(request, response, 400, { error: "Please provide a valid email address." });
    return;
  }
  if (password.length < 6) {
    sendJson(request, response, 400, { error: "Password must be at least 6 characters long." });
    return;
  }
  if (password !== confirmPassword) {
    sendJson(request, response, 400, { error: "Passwords do not match." });
    return;
  }

  const user = statements.findUserByEmail.get(email);
  if (!user) {
    sendJson(request, response, 404, { error: "No account found for that email." });
    return;
  }

  const passwordHash = hashPassword(password);
  db.exec("BEGIN TRANSACTION");
  try {
    statements.updateUserPassword.run(passwordHash, user.id);
    statements.deletePasswordResetTokensByUser.run(user.id);
    statements.deleteSessionsByUser.run(user.id);
    db.exec("COMMIT");
    sendJson(request, response, 200, { ok: true, message: "Password reset successful. Please sign in." }, { "Set-Cookie": clearSessionCookie() });
  } catch (error) {
    db.exec("ROLLBACK");
    sendJson(request, response, 500, { error: "Unable to reset password right now." });
  }
}

async function handleResetPassword(request, response) {
  const payload = await readJsonBody(request);
  const token = String(payload.token || "").trim();
  const password = String(payload.password || "");

  if (!token) {
    sendJson(request, response, 400, { error: "Reset token is required." });
    return;
  }

  if (password.length < 6) {
    sendJson(request, response, 400, { error: "Password must be at least 6 characters long." });
    return;
  }

  const resetToken = statements.findPasswordResetToken.get(token, Date.now());
  if (!resetToken) {
    sendJson(request, response, 400, { error: "Reset token is invalid or expired." });
    return;
  }

  const passwordHash = hashPassword(password);
  db.exec("BEGIN TRANSACTION");
  try {
    statements.updateUserPassword.run(passwordHash, resetToken.user_id);
    statements.deletePasswordResetTokensByUser.run(resetToken.user_id);
    statements.deleteSessionsByUser.run(resetToken.user_id);
    db.exec("COMMIT");
    sendJson(request, response, 200, { ok: true }, { "Set-Cookie": clearSessionCookie() });
  } catch (error) {
    db.exec("ROLLBACK");
    sendJson(request, response, 500, { error: "Unable to reset password right now." });
  }
}

function handleCurrentUser(request, response) {
  const auth = requireAuth(request, response);
  if (!auth) return;
  sendJson(request, response, 200, { user: auth.user });
}

function handleLogout(request, response) {
  const auth = getAuthenticatedUser(request);
  if (auth) {
    statements.deleteSession.run(auth.token);
  }

  sendJson(request, response, 200, { ok: true }, { "Set-Cookie": clearSessionCookie() });
}

function handleGetProducts(request, response) {
  const products = statements.getAllProducts.all().map(serializeProduct);
  sendJson(request, response, 200, { products });
}

function handleGetCart(request, response) {
  const auth = requireAuth(request, response);
  if (!auth) return;

  const rows = statements.getCartItems.all(auth.user.id);
  const items = [];

  for (const row of rows) {
    const productId = Number(row.id);
    const stock = sanitizeStock(row.stock);
    const quantity = Math.max(0, Math.floor(Number(row.quantity || 1)));

    if (!Number.isFinite(productId) || productId <= 0 || quantity <= 0 || stock <= 0) {
      if (Number.isFinite(productId) && productId > 0) {
        statements.deleteCartItem.run(auth.user.id, productId);
      }
      continue;
    }

    const cappedQuantity = Math.min(quantity, stock);
    if (cappedQuantity !== quantity) {
      statements.upsertCartItem.run(auth.user.id, productId, cappedQuantity);
    }

    items.push(serializeCartItem({ ...row, quantity: cappedQuantity }));
  }

  sendJson(request, response, 200, { items });
}

async function handleUpdateProfile(request, response) {
  const auth = requireAuth(request, response);
  if (!auth) return;

  const payload = await readJsonBody(request);
  const phoneRaw = String(payload.phone || "").trim();
  const phoneDigits = phoneRaw ? phoneRaw.replace(/\D/g, "") : "";
  if (phoneRaw && (phoneDigits.length < 10 || phoneDigits.length > 15)) {
    sendJson(request, response, 400, { error: "Please provide a valid contact number." });
    return;
  }

  const address = String(payload.address || "").trim();
  const addressError = validateDeliveryAddress(address, { required: false });
  if (addressError) {
    sendJson(request, response, 400, { error: addressError });
    return;
  }

  const payment = normalizePaymentMethod(payload.payment);
  const avatar = payload.avatarData ? String(payload.avatarData) : auth.user.avatarData;

  statements.updateUserProfile.run(phoneDigits, address, payment, avatar, auth.user.id);
  sendJson(request, response, 200, { ok: true });
}

async function handleDeleteAccount(request, response) {
  const auth = requireAuth(request, response);
  if (!auth) return;

  const payload = await readJsonBody(request);
  const confirm = String(payload.confirm || "").trim().toUpperCase();

  if (confirm !== "DELETE") {
    sendJson(request, response, 400, { error: "Confirmation required." });
    return;
  }

  db.exec("BEGIN TRANSACTION");
  try {
    statements.deleteUser.run(auth.user.id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    sendJson(request, response, 500, { error: "Unable to delete account." });
    return;
  }

  sendJson(request, response, 200, { ok: true }, { "Set-Cookie": clearSessionCookie() });
}

async function handleAddCartItem(request, response) {
  const auth = requireAuth(request, response);
  if (!auth) return;

  const payload = await readJsonBody(request);
  const productId = Number(payload.productId);
  const quantity = Math.max(0, Math.floor(Number(payload.quantity || 1)));

  if (Number.isNaN(productId)) {
    sendJson(request, response, 400, { error: "Invalid product." });
    return;
  }

  const product = statements.getProductById.get(productId);
  if (!product) {
    sendJson(request, response, 404, { error: "Product not found." });
    return;
  }

  const availableStock = sanitizeStock(product.stock);
  if (quantity === 0) {
    statements.deleteCartItem.run(auth.user.id, productId);
    sendJson(request, response, 200, { ok: true });
    return;
  }

  if (availableStock <= 0) {
    sendJson(request, response, 409, { error: `${product.name} is out of stock.`, availableStock: 0 });
    return;
  }

  if (quantity > availableStock) {
    sendJson(request, response, 409, {
      error: `Only ${availableStock} unit(s) left for ${product.name}.`,
      availableStock
    });
    return;
  }

  statements.upsertCartItem.run(auth.user.id, productId, quantity);
  sendJson(request, response, 200, { ok: true, availableStock });
}

async function handleSyncCart(request, response) {
  const auth = requireAuth(request, response);
  if (!auth) return;

  const payload = await readJsonBody(request);
  const items = Array.isArray(payload.items) ? payload.items : [];

  db.exec("BEGIN TRANSACTION");
  try {
    for (const item of items) {
      const productId = Number(item.id);
      const quantity = Math.max(1, Math.floor(Number(item.quantity || 1)));
      if (Number.isNaN(productId)) continue;
      const product = statements.getProductById.get(productId);
      if (!product) continue;

      const availableStock = sanitizeStock(product.stock);
      if (availableStock <= 0) {
        statements.deleteCartItem.run(auth.user.id, productId);
        continue;
      }

      statements.upsertCartItem.run(auth.user.id, productId, Math.min(quantity, availableStock));
    }
    db.exec("COMMIT");
    sendJson(request, response, 200, { ok: true });
  } catch (error) {
    db.exec("ROLLBACK");
    sendJson(request, response, 500, { error: "Failed to sync cart." });
  }
}

function handleGetOrders(request, response) {
  const auth = requireAuth(request, response);
  if (!auth) return;

  const orders = statements.getOrders.all(auth.user.id).map(serializeOrder);
  sendJson(request, response, 200, { orders });
}

async function handleCheckout(request, response) {
  const auth = requireAuth(request, response);
  if (!auth) return;

  const payload = await readJsonBody(request);
  const items = Array.isArray(payload.items) ? payload.items : [];
  const paymentMethod = normalizePaymentMethod(payload.paymentMethod);
  const address = String(payload.address || "").trim();
  const contactNumber = String(payload.contactNumber || "").trim();

  const addressError = validateDeliveryAddress(address, { required: true });
  if (addressError) {
    sendJson(request, response, 400, { error: addressError });
    return;
  }

  if (!contactNumber) {
    sendJson(request, response, 400, { error: "Please provide a contact number." });
    return;
  }

  const contactDigits = contactNumber.replace(/\D/g, "");
  if (contactDigits.length < 10 || contactDigits.length > 15) {
    sendJson(request, response, 400, { error: "Please provide a valid contact number." });
    return;
  }

  const requestedItems = new Map();
  for (const item of items) {
    const productId = Number(item.id);
    const quantity = Math.max(1, Math.floor(Number(item.quantity || 1)));
    if (Number.isNaN(productId) || quantity <= 0) continue;
    requestedItems.set(productId, (requestedItems.get(productId) || 0) + quantity);
  }

  const snapshots = [];
  const stockErrors = [];
  let subtotal = 0;

  for (const [productId, quantity] of requestedItems.entries()) {
    const product = statements.getProductById.get(productId);
    if (!product) continue;

    const availableStock = sanitizeStock(product.stock);
    if (availableStock <= 0) {
      stockErrors.push(`${product.name} is out of stock.`);
      continue;
    }
    if (quantity > availableStock) {
      stockErrors.push(`${product.name} only has ${availableStock} unit(s) left.`);
      continue;
    }

    const snapshot = {
      ...serializeProduct(product),
      quantity
    };
    snapshots.push(snapshot);
    subtotal += snapshot.price * quantity;
  }

  if (!snapshots.length) {
    sendJson(request, response, 400, { error: "Cart is empty." });
    return;
  }

  if (stockErrors.length) {
    sendJson(request, response, 409, { error: stockErrors[0], details: stockErrors });
    return;
  }

  const total = subtotal + 200;

  db.exec("BEGIN TRANSACTION");
  try {
    for (const snapshot of snapshots) {
      const changed = statements.decrementProductStockIfEnough.run(snapshot.quantity, snapshot.id, snapshot.quantity).changes || 0;
      if (changed !== 1) {
        throw new Error(`Not enough stock for ${snapshot.name}.`);
      }
    }

    statements.createOrder.run(auth.user.id, JSON.stringify(snapshots), total, "placed", paymentMethod, address, contactDigits);
    if (!payload.isBuyNow) {
      statements.clearCart.run(auth.user.id);
    }
    db.exec("COMMIT");
    sendJson(request, response, 201, { ok: true });
  } catch (error) {
    db.exec("ROLLBACK");
    if (String(error?.message || "").startsWith("Not enough stock")) {
      sendJson(request, response, 409, { error: error.message });
      return;
    }
    sendJson(request, response, 500, { error: "Checkout failed." });
  }
}

async function handleCancelOrder(request, response) {
  const auth = requireAuth(request, response);
  if (!auth) return;

  const payload = await readJsonBody(request);
  const orderId = Number(payload.orderId);

  if (Number.isNaN(orderId)) {
    sendJson(request, response, 400, { error: "Invalid order." });
    return;
  }

  const order = statements.getOrderForUser.get(orderId, auth.user.id);
  if (!order) {
    sendJson(request, response, 404, { error: "Order not found." });
    return;
  }

  const status = normalizeOrderStatus(order.status);
  if (status === "cancelled") {
    sendJson(request, response, 200, { ok: true });
    return;
  }

  if (status === "in_transit" || status === "delivered") {
    sendJson(request, response, 409, { error: "This order can no longer be cancelled." });
    return;
  }

  if (status !== "placed" && status !== "waiting_carrier") {
    sendJson(request, response, 409, { error: "This order cannot be cancelled." });
    return;
  }

  db.exec("BEGIN TRANSACTION");
  try {
    statements.updateOrderStatus.run("cancelled", orderId);
    restockOrderItems(order.items_json);
    db.exec("COMMIT");
    sendJson(request, response, 200, { ok: true });
  } catch (error) {
    db.exec("ROLLBACK");
    sendJson(request, response, 500, { error: "Unable to cancel order right now." });
  }
}

function handleGetAdminOrders(request, response) {
  const auth = requireAdmin(request, response);
  if (!auth) return;

  const orders = statements.getAllOrders.all().map(serializeOrder);
  sendJson(request, response, 200, { orders });
}

async function handleUpdateAdminOrderStatus(request, response) {
  const auth = requireAdmin(request, response);
  if (!auth) return;

  const payload = await readJsonBody(request);
  const orderId = Number(payload.orderId);
  const status = normalizeOrderStatus(payload.status);

  if (Number.isNaN(orderId)) {
    sendJson(request, response, 400, { error: "Invalid order." });
    return;
  }

  const existing = statements.getOrderById.get(orderId);
  if (!existing) {
    sendJson(request, response, 404, { error: "Order not found." });
    return;
  }

  const currentStatus = normalizeOrderStatus(existing.status);
  if (currentStatus === "cancelled" && status !== "cancelled") {
    sendJson(request, response, 409, { error: "Cancelled orders cannot be reopened." });
    return;
  }

  db.exec("BEGIN TRANSACTION");
  try {
    statements.updateOrderStatus.run(status, orderId);
    if (status === "cancelled" && currentStatus !== "cancelled") {
      restockOrderItems(existing.items_json);
    }
    db.exec("COMMIT");
    sendJson(request, response, 200, { ok: true });
  } catch (error) {
    db.exec("ROLLBACK");
    sendJson(request, response, 500, { error: "Unable to update order status." });
  }
}

async function handleCreateAdminProduct(request, response) {
  const auth = requireAdmin(request, response);
  if (!auth) return;

  const payload = await readJsonBody(request);
  const name = String(payload.name || "").trim();
  const category = String(payload.category || "").trim();
  const tier = String(payload.tier || "mid").trim().toLowerCase();
  const price = Math.floor(Number(payload.price || 0));
  const stock = Math.floor(Number(payload.stock ?? 20));
  const badge = String(payload.badge || "").trim();
  const accent = String(payload.accent || "cyan").trim().toLowerCase();
  const desc = String(payload.desc || payload.description || "").trim();

  if (!name || !category || !desc) {
    sendJson(request, response, 400, { error: "Name, category, and description are required." });
    return;
  }
  if (!["mid", "high", "elite"].includes(tier)) {
    sendJson(request, response, 400, { error: "Tier must be mid, high, or elite." });
    return;
  }
  if (!Number.isFinite(price) || price <= 0) {
    sendJson(request, response, 400, { error: "Price must be greater than zero." });
    return;
  }
  if (!Number.isFinite(stock) || stock < 0) {
    sendJson(request, response, 400, { error: "Stock must be zero or greater." });
    return;
  }

  let imageUrl = "";
  try {
    imageUrl = saveUploadedProductImage(name, payload.imageData);
  } catch (error) {
    sendJson(request, response, 400, { error: error.message });
    return;
  }

  const result = statements.insertProduct.run(name, category, tier, price, stock, badge, accent, desc, imageUrl || null);
  const product = statements.getProductById.get(result.lastInsertRowid);
  sendJson(request, response, 201, { product: serializeProduct(product) });
}

async function handleUpdateAdminProductStock(request, response) {
  const auth = requireAdmin(request, response);
  if (!auth) return;

  const payload = await readJsonBody(request);
  const productId = Number(payload.productId);
  const hasStockValue = payload.stock !== undefined && payload.stock !== null && String(payload.stock).trim() !== "";
  const hasAddStock = payload.addStock !== undefined && payload.addStock !== null && String(payload.addStock).trim() !== "";

  if (Number.isNaN(productId)) {
    sendJson(request, response, 400, { error: "Invalid product." });
    return;
  }
  if (hasStockValue && hasAddStock) {
    sendJson(request, response, 400, { error: "Provide either stock or addStock, not both." });
    return;
  }
  if (!hasStockValue && !hasAddStock) {
    sendJson(request, response, 400, { error: "Stock value is required." });
    return;
  }

  const product = statements.getProductById.get(productId);
  if (!product) {
    sendJson(request, response, 404, { error: "Product not found." });
    return;
  }

  let nextStock = sanitizeStock(product.stock);
  if (hasStockValue) {
    const stock = Math.floor(Number(payload.stock));
    if (!Number.isFinite(stock) || stock < 0) {
      sendJson(request, response, 400, { error: "Stock must be zero or greater." });
      return;
    }
    nextStock = stock;
  } else {
    const addStock = Math.floor(Number(payload.addStock));
    if (!Number.isFinite(addStock) || addStock === 0) {
      sendJson(request, response, 400, { error: "addStock must be a non-zero integer." });
      return;
    }
    nextStock = Math.max(0, nextStock + addStock);
  }

  statements.updateProductStock.run(nextStock, productId);
  const updated = statements.getProductById.get(productId);
  sendJson(request, response, 200, { product: serializeProduct(updated) });
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || `${HOST}:${PORT}`}`);
    const pathname = url.pathname;

    // Handle CORS Preflight
    if (request.method === "OPTIONS") {
      const origin = request.headers.origin || "*";
      response.writeHead(204, {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Credentials": "true"
      });
      response.end();
      return;
    }

    // Auth Routes
    if (pathname === "/api/auth/register" && request.method === "POST") {
      await handleRegister(request, response);
      return;
    }
    if (pathname === "/api/auth/login" && request.method === "POST") {
      await handleLogin(request, response);
      return;
    }
    if (pathname === "/api/auth/forgot-password" && request.method === "POST") {
      await handleForgotPassword(request, response);
      return;
    }
    if (pathname === "/api/auth/reset-password" && request.method === "POST") {
      await handleResetPassword(request, response);
      return;
    }
    if (pathname === "/api/auth/me" && request.method === "GET") {
      handleCurrentUser(request, response);
      return;
    }
    if (pathname === "/api/auth/logout" && request.method === "POST") {
      handleLogout(request, response);
      return;
    }

    // Product Routes
    if (pathname === "/api/products" && request.method === "GET") {
      handleGetProducts(request, response);
      return;
    }

    if (pathname === "/api/user/profile" && request.method === "PUT") {
      await handleUpdateProfile(request, response);
      return;
    }

    if (pathname === "/api/user/delete" && request.method === "POST") {
      await handleDeleteAccount(request, response);
      return;
    }

    // Cart Routes
    if (pathname === "/api/cart" && request.method === "GET") {
      handleGetCart(request, response);
      return;
    }
    if (pathname === "/api/cart/add" && request.method === "POST") {
      await handleAddCartItem(request, response);
      return;
    }
    if (pathname === "/api/cart/sync" && request.method === "POST") {
      await handleSyncCart(request, response);
      return;
    }

    // Order Routes
    if (pathname === "/api/orders" && request.method === "GET") {
      handleGetOrders(request, response);
      return;
    }
    if (pathname === "/api/orders/checkout" && request.method === "POST") {
      await handleCheckout(request, response);
      return;
    }
    if (pathname === "/api/orders/cancel" && request.method === "POST") {
      await handleCancelOrder(request, response);
      return;
    }

    // Admin Routes
    if (pathname === "/api/admin/orders" && request.method === "GET") {
      handleGetAdminOrders(request, response);
      return;
    }
    if (pathname === "/api/admin/orders/status" && request.method === "POST") {
      await handleUpdateAdminOrderStatus(request, response);
      return;
    }
    if (pathname === "/api/admin/products" && request.method === "POST") {
      await handleCreateAdminProduct(request, response);
      return;
    }
    if (pathname === "/api/admin/products/stock" && request.method === "POST") {
      await handleUpdateAdminProductStock(request, response);
      return;
    }

    if (request.method === "GET" || request.method === "HEAD") {
      serveStaticFile(request, response, pathname);
      return;
    }

    sendJson(request, response, 405, { error: "Method not allowed." });
  } catch (error) {
    sendJson(request, response, 500, { error: error.message || "Unexpected server error." });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`LAB U server running at http://${HOST}:${PORT}`);
});
