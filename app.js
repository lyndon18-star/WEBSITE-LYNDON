let products = [];
let newReleaseIds = new Set();

const featureTiles = [
  { label: "The Forge Awaits", title: "Build and buy your full rig in one place", note: "Custom bundles, premium parts, faster checkout", href: "builder.html", className: "featured", glow: "radial-gradient(circle at top right, rgba(33, 212, 253, 0.35), transparent 45%)" },
  { label: "CPU", title: "Desktop processors", note: "Ryzen 3 to Ryzen 9", href: "shop.html?filter=CPU", glow: "radial-gradient(circle at top right, rgba(255, 96, 124, 0.26), transparent 50%)" },
  { label: "Case", title: "Airflow towers", note: "Compact to full ATX", href: "shop.html?filter=Case", glow: "radial-gradient(circle at top right, rgba(255, 188, 90, 0.23), transparent 50%)" },
  { label: "Motherboard", title: "AM5 and Intel boards", note: "Stable power delivery", href: "shop.html?filter=Motherboard", glow: "radial-gradient(circle at top right, rgba(255, 72, 72, 0.25), transparent 48%)" },
  { label: "Pre-Built", title: "Quick ship rigs", note: "Gaming ready today", href: "builder.html", glow: "radial-gradient(circle at top right, rgba(105, 90, 255, 0.24), transparent 50%)" },
  { label: "GPU", title: "High-fps graphics cards", note: "NVIDIA and AMD", href: "shop.html?filter=GPU", className: "featured", glow: "radial-gradient(circle at top right, rgba(255, 255, 255, 0.12), transparent 50%)" },
  { label: "PSU", title: "Stable power delivery", note: "Gold-rated reliability", href: "shop.html?filter=PSU", glow: "radial-gradient(circle at top right, rgba(160, 160, 160, 0.18), transparent 50%)" },
  { label: "Cooling", title: "AIO and tower coolers", note: "Quiet and efficient", href: "shop.html?filter=Cooling", glow: "radial-gradient(circle at top right, rgba(0, 255, 163, 0.25), transparent 50%)" },
  { label: "SSD", title: "Common storage brands", note: "256GB to 1TB options", href: "shop.html?filter=SSD", className: "featured", glow: "radial-gradient(circle at top right, rgba(255, 153, 51, 0.24), transparent 50%)" },
  { label: "RAM", title: "Common memory brands", note: "4GB to 32GB, 2200-3200MHz", href: "shop.html?filter=RAM", className: "featured", glow: "radial-gradient(circle at top right, rgba(64, 156, 255, 0.23), transparent 50%)" }
];

let cart = [];
let orders = [];
let adminOrders = [];
const catalogFilters = ["all", "elite", "high", "mid", "CPU", "GPU", "Motherboard", "RAM", "SSD", "Cooling", "PSU", "Case", "Input Device", "Output Device"];
const catalogSorts = ["popular", "low-high", "high-low", "name"];
let currentFilter = "all";
let currentSearch = "";
let currentSort = "popular";
let currentUser = null;
const scrollRevealSelector = [
  ".hero-card",
  ".section-head",
  ".product-card",
  ".order-card",
  ".inventory-item",
  ".cart-item-row",
  ".team-card",
  ".quick-category-card",
  ".inspiration-card",
  ".endorsement-card",
  ".visual-item-row"
].join(", ");

const THEME_STORAGE_KEY = "labu_theme";
const ADMIN_STOCK_OVERRIDES_KEY = "labu_admin_stock_overrides";
const MOBILE_NAV_MEDIA_QUERY = "(max-width: 900px)";
let adminStockOverrides = new Map();

function normalizeTheme(value) {
  const theme = String(value || "").trim().toLowerCase();
  if (theme === "light") return "light";
  if (theme === "dark") return "dark";
  return "";
}

function getStoredTheme() {
  try {
    return normalizeTheme(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "";
  }
}

function getActiveTheme() {
  const attr = normalizeTheme(document.documentElement?.dataset?.theme);
  return attr || getStoredTheme() || "dark";
}

function applyTheme(theme, { persist = true } = {}) {
  const normalized = normalizeTheme(theme) || "dark";

  if (document.documentElement) {
    document.documentElement.dataset.theme = normalized;
  }

  if (persist) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, normalized);
    } catch {
      // ignore storage errors
    }
  }
}

function initTheme() {
  applyTheme(getStoredTheme() || "dark", { persist: false });
}

function setTheme(theme) {
  applyTheme(theme, { persist: true });
  updateAuthUI();
}

initTheme();

function loadAdminStockOverrides() {
  try {
    const raw = localStorage.getItem(ADMIN_STOCK_OVERRIDES_KEY);
    if (!raw) {
      adminStockOverrides = new Map();
      return;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      adminStockOverrides = new Map();
      return;
    }

    adminStockOverrides = new Map(
      Object.entries(parsed).map(([id, stock]) => [Number(id), normalizeStockValue(stock)])
    );
  } catch {
    adminStockOverrides = new Map();
  }
}

function saveAdminStockOverrides() {
  try {
    if (!adminStockOverrides.size) {
      localStorage.removeItem(ADMIN_STOCK_OVERRIDES_KEY);
      return;
    }
    const payload = Object.fromEntries(adminStockOverrides.entries());
    localStorage.setItem(ADMIN_STOCK_OVERRIDES_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage issues
  }
}

function getAdminStockOverride(productId) {
  const id = Number(productId);
  if (!Number.isFinite(id)) return null;
  if (!adminStockOverrides.has(id)) return null;
  return normalizeStockValue(adminStockOverrides.get(id));
}

function setAdminStockOverride(productId, stock) {
  const id = Number(productId);
  if (!Number.isFinite(id)) return;
  adminStockOverrides.set(id, normalizeStockValue(stock));
  saveAdminStockOverrides();
}

function clearAdminStockOverride(productId) {
  const id = Number(productId);
  if (!Number.isFinite(id)) return;
  if (!adminStockOverrides.delete(id)) return;
  saveAdminStockOverrides();
}

function applyAdminStockOverrides() {
  if (!products.length || !adminStockOverrides.size) return;
  products = products.map((product) => {
    const override = getAdminStockOverride(product?.id);
    if (override === null) return product;
    if (normalizeStockValue(product?.stock) === override) return product;
    return { ...product, stock: override };
  });
}

loadAdminStockOverrides();

const orderProgressSteps = [
  { value: "placed", label: "Order placed" },
  { value: "waiting_carrier", label: "Waiting for carrier" },
  { value: "in_transit", label: "In transit" },
  { value: "delivered", label: "Order delivered" }
];
const orderStatusSteps = [...orderProgressSteps, { value: "cancelled", label: "Cancelled" }];

function normalizeStatus(value) {
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
  return orderStatusSteps.some((step) => step.value === normalized) ? normalized : "placed";
}

function normalizePaymentMethod(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "card" ? "card" : "cash_on_delivery";
}

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function isValidEmailAddress(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function deliveryAddressError(value, { required = true } = {}) {
  const address = String(value || "").trim();
  if (!address) return required ? "Please provide a delivery address." : "";
  if (address.length < 10) return "Please enter a more detailed delivery address.";
  if (address.length > 300) return "Address is too long (max 300 characters).";
  if (!/[a-z]/i.test(address)) return "Please include street/city details in the address.";
  return "";
}

function formatCardNumber(value) {
  const digits = digitsOnly(value).slice(0, 19);
  return digits.replace(/(.{4})/g, "$1 ").trim();
}

function formatExpiry(value) {
  const digits = digitsOnly(value).slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function parseExpiry(value) {
  const digits = digitsOnly(value);
  if (digits.length < 4) return null;
  const month = Number(digits.slice(0, 2));
  const year2 = Number(digits.slice(2, 4));
  if (!Number.isFinite(month) || !Number.isFinite(year2)) return null;
  if (month < 1 || month > 12) return null;
  const year = 2000 + year2;
  return { month, year };
}

function isValidVisaCardNumber(value) {
  const digits = digitsOnly(value);
  return /^4(\d{12}|\d{15}|\d{18})$/.test(digits);
}

function normalizeStockValue(value) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return 20;
  }
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) return 20;
  return Math.max(0, parsed);
}

function normalizeProduct(product) {
  return {
    ...product,
    id: Number(product.id),
    price: Number(product.price || 0),
    stock: normalizeStockValue(product.stock),
    badge: product.badge || "",
    accent: product.accent || "cyan",
    desc: product.desc || product.description || "",
    imageUrl: product.imageUrl || product.image_url || ""
  };
}

function normalizeCartItem(item) {
  return {
    ...normalizeProduct(item),
    quantity: Math.max(1, Number(item.quantity || 1))
  };
}

function normalizeOrder(order) {
  return {
    ...order,
    id: Number(order.id || Date.now()),
    total: Number(order.total ?? order.total_price ?? 0),
    createdAt: order.createdAt || order.created_at || new Date().toISOString(),
    status: normalizeStatus(order.status),
    paymentMethod: normalizePaymentMethod(order.paymentMethod || order.payment_method),
    customerName: order.customerName || order.customer_name || "",
    customerEmail: order.customerEmail || order.customer_email || "",
    items: Array.isArray(order.items) ? order.items.map(normalizeCartItem) : []
  };
}

function getProductById(productId) {
  return products.find((item) => Number(item.id) === Number(productId)) || null;
}

function availableStockForProduct(product) {
  return normalizeStockValue(product?.stock);
}

function availableStockForId(productId) {
  return availableStockForProduct(getProductById(productId));
}

function isOutOfStock(product) {
  return availableStockForProduct(product) <= 0;
}

function stockTagMarkup(product) {
  const stock = availableStockForProduct(product);
  if (stock <= 0) return `<span class="stock-pill is-out">Out of stock</span>`;
  if (stock <= 5) return `<span class="stock-pill is-low">Only ${stock} left</span>`;
  return `<span class="stock-pill">In stock: ${stock}</span>`;
}

function syncCartWithCurrentStock() {
  let changed = false;
  cart = cart
    .map((item) => {
      const liveProduct = getProductById(item.id);
      if (!liveProduct) return null;
      const stock = availableStockForProduct(liveProduct);
      if (stock <= 0) {
        changed = true;
        return null;
      }
      const quantity = Math.max(1, Math.floor(Number(item.quantity || 1)));
      const capped = Math.min(quantity, stock);
      if (capped !== quantity) {
        changed = true;
      }
      return { ...liveProduct, quantity: capped };
    })
    .filter(Boolean);

  if (changed && !currentUser) {
    save();
  }
  return changed;
}

async function save() {
  if (!currentUser) {
    localStorage.setItem("cart_guest", JSON.stringify(cart));
    localStorage.setItem("orders_guest", JSON.stringify(orders));
  }
}

async function syncUserData(oldUser, newUser) {
  if (!oldUser && newUser) {
    const guestCart = (JSON.parse(localStorage.getItem("cart_guest")) || []).map(normalizeCartItem);
    if (guestCart.length > 0) {
      await apiRequest("/api/cart/sync", {
        method: "POST",
        body: JSON.stringify({ items: guestCart })
      });
      localStorage.removeItem("cart_guest");
    }

    localStorage.removeItem("orders_guest");

    // Fix: Download accurate server cart even on first page-load session auth
    const [cartPayload, orderPayload] = await Promise.all([
      apiRequest("/api/cart", { method: "GET" }),
      apiRequest("/api/orders", { method: "GET" })
    ]);
    cart = (cartPayload.items || []).map(normalizeCartItem);
    orders = (orderPayload.orders || []).map(normalizeOrder);
  } else if (newUser) {
    const [cartPayload, orderPayload] = await Promise.all([
      apiRequest("/api/cart", { method: "GET" }),
      apiRequest("/api/orders", { method: "GET" })
    ]);
    cart = (cartPayload.items || []).map(normalizeCartItem);
    orders = (orderPayload.orders || []).map(normalizeOrder);
  } else {
    cart = (JSON.parse(localStorage.getItem("cart_guest")) || []).map(normalizeCartItem);
    orders = (JSON.parse(localStorage.getItem("orders_guest")) || []).map(normalizeOrder);
  }

  await save();
  updateCartCount();
  updateAuthUI();
  applyRoleUI();
  renderCart();
  renderCheckout();
}


function updateAuthUI() {
  const activeTheme = getActiveTheme();
  const userIcons = document.querySelectorAll('.nav-icon[title="Account"], .nav-icon[title^="Signed in"]');
  
  userIcons.forEach(icon => {
    if (currentUser) {
      delete icon.dataset.noAuthModal;
      icon.title = `Signed in as ${currentUser.fullName || currentUser.email}`;
      icon.classList.add('logged-in');
      
      const svgIcon = icon.querySelector('svg');
      if (svgIcon && currentUser.avatarData) {
        svgIcon.style.display = 'none';
        let img = icon.querySelector('img.nav-avatar');
        if (!img) {
          img = document.createElement('img');
          img.className = 'nav-avatar';
          img.style.width = '24px';
          img.style.height = '24px';
          img.style.borderRadius = '50%';
          img.style.objectFit = 'cover';
          icon.insertBefore(img, icon.firstChild);
        }
        img.src = currentUser.avatarData;
      }

      let dropdown = icon.querySelector('.account-dropdown');
      if (!dropdown) {
        dropdown = document.createElement('div');
        dropdown.className = 'account-dropdown';
        icon.appendChild(dropdown);
      }

      dropdown.innerHTML = `
        <ul>
          <li><button type="button" data-href="profile.html">Profile Settings</button></li>
          <li><button type="button" data-href="${currentUser.role === "admin" ? "admin.html" : "dashboard.html"}">${currentUser.role === "admin" ? "Admin Panel" : "My Orders"}</button></li>
          <li><button type="button" data-href="shop.html">Shop</button></li>
          <li><button type="button" data-action="set-theme" data-theme="dark" class="theme-option ${activeTheme === "dark" ? "is-active" : ""}" aria-pressed="${activeTheme === "dark"}">Dark mode</button></li>
          <li><button type="button" data-action="set-theme" data-theme="light" class="theme-option ${activeTheme === "light" ? "is-active" : ""}" aria-pressed="${activeTheme === "light"}">Light mode</button></li>
          <li><button type="button" data-action="logout">Log Out</button></li>
        </ul>
      `;

      // Prevent the parent icon click handler from swallowing dropdown clicks.
      dropdown.onclick = (event) => {
        event.stopPropagation();
      };

      icon.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        icon.classList.toggle('dropdown-open');
        syncAccountDropdownState();
      };

      dropdown.querySelectorAll("button[data-href]").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          icon.classList.remove("dropdown-open");
          syncAccountDropdownState();
          navigateWithTransition(button.dataset.href);
        });
      });

      dropdown.querySelectorAll("button[data-action=\"logout\"]").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          icon.classList.remove("dropdown-open");
          syncAccountDropdownState();
          logout();
        });
      });

      dropdown.querySelectorAll("button[data-action=\"set-theme\"]").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          icon.classList.remove("dropdown-open");
          syncAccountDropdownState();
          setTheme(button.dataset.theme || "dark");
        });
      });
    } else {
      icon.title = "Account";
      icon.classList.remove('logged-in', 'dropdown-open');
      icon.dataset.noAuthModal = "";

      let dropdown = icon.querySelector('.account-dropdown');
      if (!dropdown) {
        dropdown = document.createElement('div');
        dropdown.className = 'account-dropdown';
        icon.appendChild(dropdown);
      }

      dropdown.innerHTML = `
        <ul>
          <li><button type="button" data-auth-view="login">Sign In</button></li>
          <li><button type="button" data-action="set-theme" data-theme="dark" class="theme-option ${activeTheme === "dark" ? "is-active" : ""}" aria-pressed="${activeTheme === "dark"}">Dark mode</button></li>
          <li><button type="button" data-action="set-theme" data-theme="light" class="theme-option ${activeTheme === "light" ? "is-active" : ""}" aria-pressed="${activeTheme === "light"}">Light mode</button></li>
          <li><button type="button" data-auth-view="register">Create Account</button></li>
        </ul>
      `;

      dropdown.onclick = (event) => {
        event.stopPropagation();
      };

      if (icon.tagName === 'A') {
        icon.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          icon.classList.toggle('dropdown-open');
          syncAccountDropdownState();
        };
      }

      dropdown.querySelectorAll("button[data-auth-view]").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          icon.classList.remove("dropdown-open");
          syncAccountDropdownState();
          openAuthModal(button.dataset.authView || "promo");
        });
      });

      dropdown.querySelectorAll("button[data-action=\"set-theme\"]").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          icon.classList.remove("dropdown-open");
          syncAccountDropdownState();
          setTheme(button.dataset.theme || "dark");
        });
      });
    }
  });

  if (!window._authDropdownListenerAdded) {
    document.addEventListener('click', (e) => {
      document.querySelectorAll('.nav-icon.dropdown-open').forEach(icon => {
        if (!icon.contains(e.target)) {
          icon.classList.remove('dropdown-open');
        }
      });
      syncAccountDropdownState();
    });
    window._authDropdownListenerAdded = true;
  }

  syncAccountDropdownState();
}

async function logout() {
  try {
    const oldUser = currentUser;
    await apiRequest("/api/auth/logout", { method: "POST" });
    currentUser = null;
    await syncUserData(oldUser, null);
    navigateWithTransition("index.html");
  } catch (error) {
    console.error("Logout failed:", error);
    currentUser = null;
    await syncUserData(oldUser, null);
    navigateWithTransition("index.html");
  }
}

async function apiRequest(path, options = {}) {
  let targetPath = path;
  if (!path.startsWith("http") && path.startsWith("/api/")) {
    const hostname = window.location.hostname || "127.0.0.1";
    const protocol = window.location.protocol === "http:" || window.location.protocol === "https:" ? window.location.protocol : "http:";
    const isIpHost = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
    const isLikelyLocalDev = window.location.protocol === "file:" || hostname === "localhost" || hostname === "127.0.0.1" || isIpHost;

    // When the frontend is served from Live Server / file preview, the Node API is usually on :3000.
    // Keep same-origin requests when already on :3000, and do not rewrite on GitHub Pages.
    if (!isGithubPagesHost() && isLikelyLocalDev && window.location.port !== "3000") {
      targetPath = `${protocol}//${hostname}:3000${path}`;
    }
  }

  const response = await fetch(targetPath, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
    payload = null;
  }

  if (!response.ok) {
    const message = payload?.error || "The request could not be completed.";
    throw new Error(message);
  }

  return payload;
}

function accountServerMessage() {
  const hostname = window.location.hostname || "127.0.0.1";
  const protocol = window.location.protocol === "https:" ? "https:" : "http:";
  const target = `${protocol}//${hostname}:3000`;
  const current = window.location.origin && window.location.origin !== "null" ? window.location.origin : window.location.href;
  const liveServerHint = window.location.port && window.location.port !== "3000" ? `\n(You are currently on ${current}.)` : "";
  const pagesHint = isGithubPagesHost() ? "\n\nNote: GitHub Pages can't run the account server. Run it locally instead." : "";

  return `Account server unavailable.\n\n1) Run: node server.js\n2) Open: ${target}${liveServerHint}${pagesHint}`;
}

function adminStockServerMessage(error) {
  const raw = String(error?.message || "").trim();
  if (!raw) {
    return "Unable to update stock right now.";
  }

  if (/method not allowed/i.test(raw)) {
    const hostname = window.location.hostname || "127.0.0.1";
    const protocol = window.location.protocol === "https:" ? "https:" : "http:";
    return `Stock endpoint unavailable on the running API server.\n\n1) Stop old server process\n2) Run: node server.js\n3) Open: ${protocol}//${hostname}:3000/admin-products.html`;
  }

  return raw;
}

function shouldUseLocalStockFallback(error) {
  const message = String(error?.message || "").trim().toLowerCase();
  if (!message) return false;
  if (message.includes("method not allowed")) return true;
  if (message.includes("failed to fetch")) return true;
  if (message.includes("network")) return true;
  return false;
}

function applyLocalAdminStock(productId, nextStock) {
  const product = getProductById(productId);
  if (!product) return false;

  const stock = normalizeStockValue(nextStock);
  setAdminStockOverride(productId, stock);
  updateProductInState({ ...product, stock });
  return true;
}

function isDashboardPage() {
  return Boolean(document.getElementById("orders"));
}

function isAdminPage() {
  return Boolean(document.getElementById("adminDashboard"));
}

function isAccountPage() {
  return /\/?(login|register)\.html$/i.test(window.location.pathname);
}

function isBuilderPage() {
  return /\/?builder\.html$/i.test(window.location.pathname);
}

function isCartPage() {
  return /\/?cart\.html$/i.test(window.location.pathname);
}

function isCheckoutPage() {
  return /\/?checkout\.html$/i.test(window.location.pathname);
}

function isProfilePage() {
  return /\/?profile\.html$/i.test(window.location.pathname);
}

function isGithubPagesHost() {
  return typeof window !== "undefined" && typeof window.location?.hostname === "string" && window.location.hostname.endsWith(".github.io");
}

function isAdminUser(user = currentUser) {
  return user?.role === "admin";
}

function homeRouteForUser(user = currentUser) {
  return user?.role === "admin" ? "admin.html" : "dashboard.html";
}

function currentPagePath() {
  const path = window.location.pathname.split("/").pop() || "index.html";
  return path.toLowerCase();
}

function currentPageHash() {
  return (window.location.hash || "").toLowerCase();
}

function prefersReducedMotion() {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function navigateWithTransition(targetUrl) {
  if (!targetUrl) return;

  const nextUrl = new URL(targetUrl, window.location.href);
  if (nextUrl.href === window.location.href) return;

  if (prefersReducedMotion()) {
    window.location.href = nextUrl.href;
    return;
  }

  if (document.body.classList.contains("page-leaving")) return;

  document.body.classList.add("page-leaving");
  window.setTimeout(() => {
    window.location.href = nextUrl.href;
  }, 180);
}

function shouldAnimateLinkNavigation(link, event) {
  if (!link || event.defaultPrevented) return false;
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (link.dataset.noTransition !== undefined || link.hasAttribute("download")) return false;

  const href = link.getAttribute("href");
  if (!href || href === "#" || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) {
    return false;
  }

  if (link.target && link.target.toLowerCase() !== "_self") return false;

  const url = new URL(link.href, window.location.href);
  if (url.origin !== window.location.origin) return false;
  if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return false;

  return true;
}

function initPageTransitions() {
  if (window._pageTransitionsReady) return;

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");
    if (!shouldAnimateLinkNavigation(link, event)) return;

    event.preventDefault();
    navigateWithTransition(link.href);
  });

  window.addEventListener("pageshow", () => {
    document.body.classList.remove("page-leaving");
  });

  window._pageTransitionsReady = true;
}

function initBackgroundParticles() {
  if (window._backgroundParticlesReady) return;
  if (!document.body) return;
  if (prefersReducedMotion()) return;

  let canvas = document.getElementById("bgParticles");
  if (canvas && !(canvas instanceof HTMLCanvasElement)) return;

  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.id = "bgParticles";
    canvas.setAttribute("aria-hidden", "true");
    canvas.tabIndex = -1;
    document.body.prepend(canvas);
  }

  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;

  const styles = getComputedStyle(document.documentElement);
  const accent = styles.getPropertyValue("--accent").trim() || "#21d4fd";
  const accent2 = styles.getPropertyValue("--accent-2").trim() || "#00ffa3";

  function parseHexColor(value, fallback) {
    const hex = String(value || "").trim();
    const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
    if (!match) return fallback;

    const raw = match[1];
    const normalized = raw.length === 3 ? raw.split("").map((ch) => ch + ch).join("") : raw;
    const int = Number.parseInt(normalized, 16);
    if (Number.isNaN(int)) return fallback;

    return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
  }

  const accentRgb = parseHexColor(accent, { r: 33, g: 212, b: 253 });
  const accent2Rgb = parseHexColor(accent2, { r: 0, g: 255, b: 163 });
  const whiteRgb = { r: 255, g: 255, b: 255 };
  const palette = [accentRgb, accent2Rgb, whiteRgb];

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  let width = 0;
  let height = 0;
  let particles = [];
  let lastTime = 0;
  let raf = 0;
  let resizeTimer = 0;
  let linkDistance = 140;
  let linkDistance2 = linkDistance * linkDistance;
  let shootingStar = null;
  let nextShootingAt = 0;

  function resize() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    width = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
    height = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const area = width * height;
    const targetCount = Math.round(Math.min(170, Math.max(75, area / 20000)));

    const diag = Math.sqrt(width * width + height * height);
    linkDistance = Math.max(96, Math.min(160, diag / 9));
    linkDistance2 = linkDistance * linkDistance;

    particles = Array.from({ length: targetCount }).map(() => {
      const color = palette[Math.floor(Math.random() * palette.length)];
      const depth = rand(0.4, 1.1);
      return {
        x: rand(0, width),
        y: rand(0, height),
        r: rand(0.9, 2.5) * depth,
        vx: rand(-0.22, 0.22) * depth,
        vy: rand(-0.85, -0.22) * depth,
        a: rand(0.18, 0.58) * depth,
        tw: rand(0.6, 1.8),
        ph: rand(0, Math.PI * 2),
        alpha: 0,
        color
      };
    });

    nextShootingAt = performance.now() + rand(5200, 12000);
  }

  function step(now) {
    raf = window.requestAnimationFrame(step);
    if (document.hidden) {
      lastTime = now;
      return;
    }

    const delta = Math.min(0.05, Math.max(0, (now - (lastTime || now)) / 1000));
    lastTime = now;
    const tick = delta * 60;
    const seconds = now / 1000;

    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = "lighter";

    for (const p of particles) {
      p.x += p.vx * tick;
      p.y += p.vy * tick;

      if (p.y < -12) p.y = height + 12;
      if (p.x < -12) p.x = width + 12;
      if (p.x > width + 12) p.x = -12;

      const twinkle = 0.65 + 0.35 * Math.sin(seconds * p.tw + p.ph);
      p.alpha = Math.max(0, Math.min(1, p.a * twinkle));
    }

    // Constellation links (linked stars)
    ctx.lineCap = "round";
    for (let i = 0; i < particles.length; i++) {
      const a = particles[i];
      if (a.alpha <= 0.01) continue;
      for (let j = i + 1; j < particles.length; j++) {
        const b = particles[j];
        if (b.alpha <= 0.01) continue;

        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist2 = dx * dx + dy * dy;
        if (dist2 > linkDistance2) continue;

        const dist = Math.sqrt(dist2);
        const strength = 1 - dist / linkDistance;
        const alpha = Math.min(0.7, strength * 0.62 * (a.alpha + b.alpha));
        if (alpha <= 0.01) continue;

        const mix = Math.max(0, Math.min(1, (a.x + b.x) / (2 * width)));
        const r = Math.round(accentRgb.r + (accent2Rgb.r - accentRgb.r) * mix);
        const g = Math.round(accentRgb.g + (accent2Rgb.g - accentRgb.g) * mix);
        const bb = Math.round(accentRgb.b + (accent2Rgb.b - accentRgb.b) * mix);
        ctx.strokeStyle = `rgba(${r}, ${g}, ${bb}, ${alpha})`;
        ctx.lineWidth = 0.9 + 1.3 * strength;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    // Occasional shooting star streak
    if (!shootingStar && now >= nextShootingAt) {
      const fromLeft = Math.random() < 0.5;
      const startX = fromLeft ? rand(-width * 0.2, width * 0.25) : rand(width * 0.75, width * 1.2);
      const startY = rand(height * 0.06, height * 0.32);
      const speed = rand(14, 22);
      const angle = fromLeft ? rand(0.32, 0.58) : Math.PI - rand(0.32, 0.58);
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      shootingStar = {
        x: startX,
        y: startY,
        vx,
        vy,
        len: rand(90, 160),
        life: 0,
        duration: rand(0.75, 1.15)
      };
    }

    if (shootingStar) {
      shootingStar.life += delta;
      const progress = shootingStar.life / shootingStar.duration;
      shootingStar.x += shootingStar.vx * tick;
      shootingStar.y += shootingStar.vy * tick;

      const speed = Math.max(0.001, Math.hypot(shootingStar.vx, shootingStar.vy));
      const dirX = shootingStar.vx / speed;
      const dirY = shootingStar.vy / speed;
      const headX = shootingStar.x;
      const headY = shootingStar.y;
      const tailX = headX - dirX * shootingStar.len;
      const tailY = headY - dirY * shootingStar.len;

      const fade = Math.max(0, Math.min(1, 1 - progress));
      const grad = ctx.createLinearGradient(headX, headY, tailX, tailY);
      grad.addColorStop(0, `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, ${0.55 * fade})`);
      grad.addColorStop(0.4, `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, ${0.22 * fade})`);
      grad.addColorStop(1, `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0)`);

      ctx.strokeStyle = grad;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(headX, headY);
      ctx.lineTo(tailX, tailY);
      ctx.stroke();

      ctx.fillStyle = `rgba(${whiteRgb.r}, ${whiteRgb.g}, ${whiteRgb.b}, ${0.45 * fade})`;
      ctx.beginPath();
      ctx.arc(headX, headY, 1.6, 0, Math.PI * 2);
      ctx.fill();

      if (progress >= 1 || headY > height + 220 || headX < -260 || headX > width + 260) {
        shootingStar = null;
        nextShootingAt = now + rand(6200, 14500);
      }
    }

    // Stars (particles)
    for (const p of particles) {
      if (p.alpha <= 0.005) continue;
      ctx.fillStyle = `rgba(${p.color.r}, ${p.color.g}, ${p.color.b}, ${p.alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalCompositeOperation = "source-over";
  }

  resize();
  raf = window.requestAnimationFrame(step);

  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(resize, 160);
  });

  window.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    lastTime = performance.now();
  });

  window._backgroundParticlesReady = true;
  window.__stopBackgroundParticles = () => {
    window._backgroundParticlesReady = false;
    window.cancelAnimationFrame(raf);
    canvas.remove();
  };
}

function initPromoCarousels() {
  if (window._promoCarouselsReady) return;

  document.querySelectorAll("[data-promo-carousel]").forEach((carousel) => {
    const track = carousel.querySelector("[data-promo-track]");
    const slides = Array.from(carousel.querySelectorAll("[data-promo-slide]"));
    if (slides.length <= 1) return;

    let activeIndex = Math.max(0, slides.findIndex((slide) => slide.classList.contains("is-active")));

    const dotsContainer = carousel.querySelector("[data-promo-dots]");
    const dots = [];

    function setActive(index) {
      activeIndex = (index + slides.length) % slides.length;
      slides.forEach((slide, i) => {
        const isActive = i === activeIndex;
        slide.classList.toggle("is-active", isActive);
        slide.setAttribute("aria-hidden", String(!isActive));
        if (isActive) {
          slide.removeAttribute("inert");
        } else {
          slide.setAttribute("inert", "");
        }
      });
      dots.forEach((dot, i) => dot.classList.toggle("is-active", i === activeIndex));
      if (track) {
        track.style.transform = `translateX(-${activeIndex * 100}%)`;
      }
    }

    if (dotsContainer) {
      dotsContainer.innerHTML = slides
        .map(
          (_, i) =>
            `<button type="button" class="promo-dot ${i === activeIndex ? "is-active" : ""}" aria-label="Go to slide ${i + 1}"></button>`
        )
        .join("");
      dots.push(...dotsContainer.querySelectorAll(".promo-dot"));
      dots.forEach((dot, i) => dot.addEventListener("click", () => setActive(i)));
    }

    const prevButton = carousel.querySelector("[data-promo-prev]");
    const nextButton = carousel.querySelector("[data-promo-next]");

    prevButton?.addEventListener("click", () => setActive(activeIndex - 1));
    nextButton?.addEventListener("click", () => setActive(activeIndex + 1));

    const interval = Math.max(2600, Number(carousel.dataset.interval || 6500));
    let timer = null;

    function stop() {
      if (!timer) return;
      window.clearInterval(timer);
      timer = null;
    }

    function start() {
      if (prefersReducedMotion()) return;
      stop();
      timer = window.setInterval(() => setActive(activeIndex + 1), interval);
    }

    setActive(activeIndex);
    start();
    carousel.addEventListener("mouseenter", stop);
    carousel.addEventListener("mouseleave", start);
    carousel.addEventListener("focusin", stop);
    carousel.addEventListener("focusout", start);
  });

  window._promoCarouselsReady = true;
}

function collectScrollRevealTargets(root = document) {
  const scope = root && typeof root.querySelectorAll === "function" ? root : document;
  const nodes = new Set();

  if (scope instanceof Element && scope.matches(scrollRevealSelector)) {
    nodes.add(scope);
  }

  scope.querySelectorAll(scrollRevealSelector).forEach((node) => nodes.add(node));
  return [...nodes].filter((node) => node instanceof Element && node.dataset.noScrollReveal !== "1");
}

function applyScrollReveals(root = document) {
  if (prefersReducedMotion()) return;

  const observer = window._scrollRevealObserver || null;
  const groupCounts = new WeakMap();
  collectScrollRevealTargets(root).forEach((node) => {
    if (node.dataset.scrollRevealReady !== "1") {
      node.dataset.scrollRevealReady = "1";
      node.classList.add("scroll-reveal");

      const parent = node.parentElement || document.body;
      const siblingIndex = groupCounts.get(parent) || 0;
      groupCounts.set(parent, siblingIndex + 1);
      const delay = Math.min(siblingIndex * 0.06, 0.42);
      node.style.setProperty("--reveal-delay", `${delay.toFixed(2)}s`);
    }

    if (node.classList.contains("is-visible")) return;

    if (!observer) {
      node.classList.add("is-visible");
      return;
    }

    observer.observe(node);
  });
}

function refreshScrollReveals(root = document) {
  if (!window._scrollRevealsReady || prefersReducedMotion()) return;

  const queue = window._scrollRevealQueue || (window._scrollRevealQueue = new Set());
  const targetRoot = root && typeof root.querySelectorAll === "function" ? root : document;
  queue.add(targetRoot);

  if (window._scrollRevealRaf) return;

  window._scrollRevealRaf = window.requestAnimationFrame(() => {
    window._scrollRevealRaf = 0;
    const roots = Array.from(queue);
    queue.clear();
    roots.forEach((queuedRoot) => applyScrollReveals(queuedRoot));
  });
}

function initScrollReveals() {
  if (window._scrollRevealsReady) return;

  window._scrollRevealsReady = true;
  if (prefersReducedMotion() || !document.body) return;

  if (typeof IntersectionObserver === "function") {
    window._scrollRevealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const target = entry.target;
          target.classList.add("is-visible");
          window._scrollRevealObserver?.unobserve(target);
        });
      },
      {
        root: null,
        threshold: 0.05,
        rootMargin: "0px 0px -4% 0px"
      }
    );
  }

  applyScrollReveals(document);

  if (typeof MutationObserver === "function") {
    const mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          refreshScrollReveals(node);
        });
      });
    });

    mutationObserver.observe(document.body, { childList: true, subtree: true });
    window._scrollRevealMutationObserver = mutationObserver;
  }
}

function getPrimaryNavItems(user = currentUser) {
  if (isAdminUser(user)) {
    return [
      { href: "index.html", label: "Home", key: "home" },
      { href: "shop.html", label: "Shop", key: "shop" },
      { href: "admin.html", label: "Customer Order", key: "admin-orders" },
      { href: "admin-products.html", label: "Add Products", key: "admin-products" }
    ];
  }

  return [
    { href: "index.html", label: "Home", key: "home" },
    { href: "builder.html", label: "Build a PC", key: "builder" },
    { href: "shop.html", label: "Shop", key: "shop" },
    { href: "dashboard.html", label: "Orders", key: "orders" }
  ];
}

function getActiveNavKey(user = currentUser) {
  const page = currentPagePath();

  if (isAdminUser(user)) {
    if (page === "shop.html") return "shop";
    if (page === "admin-products.html") return "admin-products";
    if (page === "admin.html") return "admin-orders";
    return "home";
  }

  if (page === "builder.html") return "builder";
  if (page === "shop.html" || page === "product.html") return "shop";
  if (page === "cart.html" || page === "checkout.html") return "shop";
  if (page === "dashboard.html") return "orders";
  return "home";
}

function renderPrimaryNavs() {
  const navs = document.querySelectorAll(".nav-links, .forge-home-nav");
  if (!navs.length) return;

  const items = getPrimaryNavItems();
  const activeKey = getActiveNavKey();

  navs.forEach((nav) => {
    nav.innerHTML = items
      .map((item) => `<a class="${item.key === activeKey ? "active" : ""}" href="${item.href}">${item.label}</a>`)
      .join("");
  });

  closeForgeMobileNav();
}

function setMobileNavExpandedState(toggle, expanded) {
  if (!toggle) return;
  toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
  toggle.setAttribute("aria-label", expanded ? "Close navigation menu" : "Open navigation menu");
}

function closeForgeMobileNav() {
  if (!document.body) return;
  document.body.classList.remove("forge-mobile-nav-open");
  setMobileNavExpandedState(document.querySelector(".forge-mobile-nav-toggle"), false);
}

function initForgeMobileNav() {
  if (window._forgeMobileNavReady) return;
  if (!document.body) return;

  const topbar = document.querySelector(".forge-home-topbar");
  const nav = topbar?.querySelector(".forge-home-nav");
  if (!topbar || !nav) return;

  if (!nav.id) {
    nav.id = "forgePrimaryNav";
  }

  let toggle = topbar.querySelector(".forge-mobile-nav-toggle");
  if (!toggle) {
    toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "forge-mobile-nav-toggle";
    toggle.innerHTML = '<span class="forge-mobile-nav-toggle-label">Menu</span><span class="forge-mobile-nav-toggle-bars" aria-hidden="true"></span>';
    topbar.insertBefore(toggle, nav);
  }

  toggle.setAttribute("aria-controls", nav.id);
  setMobileNavExpandedState(toggle, false);

  const mobileMedia = typeof window.matchMedia === "function" ? window.matchMedia(MOBILE_NAV_MEDIA_QUERY) : null;
  const isMobileViewport = () => {
    if (mobileMedia) return mobileMedia.matches;
    return window.innerWidth <= 900;
  };

  const toggleMobileNav = () => {
    if (!isMobileViewport()) return;
    const willOpen = !document.body.classList.contains("forge-mobile-nav-open");
    document.body.classList.toggle("forge-mobile-nav-open", willOpen);
    setMobileNavExpandedState(toggle, willOpen);
  };

  toggle.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleMobileNav();
  });

  nav.addEventListener("click", (event) => {
    if (!event.target.closest("a[href]")) return;
    closeForgeMobileNav();
  });

  document.addEventListener("click", (event) => {
    if (!document.body.classList.contains("forge-mobile-nav-open")) return;
    if (topbar.contains(event.target)) return;
    closeForgeMobileNav();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeForgeMobileNav();
  });

  const handleViewportChange = () => {
    if (isMobileViewport()) return;
    closeForgeMobileNav();
  };

  if (mobileMedia) {
    if (typeof mobileMedia.addEventListener === "function") {
      mobileMedia.addEventListener("change", handleViewportChange);
    } else if (typeof mobileMedia.addListener === "function") {
      mobileMedia.addListener(handleViewportChange);
    }
  } else {
    window.addEventListener("resize", handleViewportChange);
  }

  window._forgeMobileNavReady = true;
}

function syncLandingHomeState() {
  const cta = document.getElementById("landingHeroAuthCta");
  if (cta) {
    cta.style.display = currentUser ? "none" : "";
  }

  const actionTile = document.getElementById("landingActionTile");
  if (!actionTile) return;

  const label = actionTile.querySelector("span");
  if (isAdminUser()) {
    actionTile.href = "admin-products.html";
    if (label) label.textContent = "Add Products";
  } else {
    actionTile.href = "builder.html";
    if (label) label.textContent = "Pre-Build";
  }
}

function syncAccountDropdownState() {
  const hasOpenDropdown = Boolean(document.querySelector(".nav-icon.dropdown-open"));
  document.body.classList.toggle("account-menu-open", hasOpenDropdown);
}

function applyRoleUI() {
  const admin = isAdminUser();

  document.body.classList.toggle("role-admin", admin);
  document.body.classList.toggle("role-customer", !admin);
  renderPrimaryNavs();
  syncLandingHomeState();

  document.querySelectorAll('a[href="builder.html"], a[href="cart.html"], a[href="checkout.html"]').forEach((node) => {
    node.style.display = admin ? "none" : "";
  });

  document.querySelectorAll('.nav-icon[title="Cart"]').forEach((node) => {
    node.style.display = admin ? "none" : "";
  });

  document.querySelectorAll("[data-cart-count]").forEach((node) => {
    const badge = node.closest('.nav-icon[title="Cart"]');
    if (badge) {
      badge.style.display = admin ? "none" : "";
    }
  });

  syncAccountDropdownState();
}

async function loadAuthState() {
  try {
    const payload = await apiRequest("/api/auth/me", { method: "GET" });
    const oldUser = currentUser;
    currentUser = payload.user || null;
    await syncUserData(oldUser, currentUser);
  } catch (error) {
    const oldUser = currentUser;
    currentUser = null;
    await syncUserData(oldUser, null);
    if ((isDashboardPage() || isAdminPage()) && error.message !== "Not authenticated.") {
      alert(accountServerMessage());
    }
  }

  if (isAdminPage()) {
    if (!currentUser) {
      location.href = "login.html";
      return false;
    }
    if (currentUser.role !== "admin") {
      location.href = "dashboard.html";
      return false;
    }
  }

  if (isDashboardPage()) {
    if (!currentUser) {
      location.href = "login.html";
      return false;
    }
    if (currentUser.role === "admin") {
      location.href = "admin.html";
      return false;
    }
  }

  if (isAdminUser() && (isBuilderPage() || isCartPage() || isCheckoutPage() || isProfilePage())) {
    location.href = "admin.html";
    return false;
  }

  if (isAccountPage() && currentUser) {
    location.href = homeRouteForUser(currentUser);
    return false;
  }

  applyRoleUI();
  window.__authResolved = true;
  window.dispatchEvent(new Event("auth:ready"));
  return true;
}

function formatMoney(value) {
  return `PHP ${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function legacyFormatMoney(value) {
  return `â‚±${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function productImagePath(name) {
  return `assets/products/${slugify(name)}.svg`;
}

function resolveProductImage(product) {
  return product.imageUrl || product.image_url || productImagePath(product.name);
}

function formatOrderDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function formatShortDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function estimateDeliveryText(order) {
  const baseDate = new Date(order.createdAt);
  if (Number.isNaN(baseDate.getTime())) return "";
  const status = normalizeStatus(order.status);
  if (status === "cancelled") {
    return "Order cancelled";
  }
  if (status === "delivered") {
    return `Delivered ${formatShortDate(baseDate)}`;
  }

  const start = new Date(baseDate);
  const end = new Date(baseDate);
  start.setDate(start.getDate() + 2);
  end.setDate(end.getDate() + 5);
  return `Estimated ${formatShortDate(start)} - ${formatShortDate(end)}`;
}

function formatPaymentMethod(value) {
  return normalizePaymentMethod(value) === "card" ? "Card" : "Cash on delivery";
}

function statusLabel(value) {
  return orderStatusSteps.find((step) => step.value === normalizeStatus(value))?.label || "Order placed";
}

function isCancellableOrderStatus(value) {
  const status = normalizeStatus(value);
  return status === "placed" || status === "waiting_carrier";
}

function productGlow(accent) {
  const map = {
    cyan: "radial-gradient(circle, rgba(33, 212, 253, 0.18), transparent 65%)",
    green: "radial-gradient(circle, rgba(0, 255, 163, 0.18), transparent 65%)",
    red: "radial-gradient(circle, rgba(255, 95, 123, 0.18), transparent 65%)",
    blue: "radial-gradient(circle, rgba(74, 144, 255, 0.2), transparent 65%)",
    orange: "radial-gradient(circle, rgba(255, 123, 84, 0.18), transparent 65%)",
    gray: "radial-gradient(circle, rgba(184, 184, 184, 0.16), transparent 65%)",
    slate: "radial-gradient(circle, rgba(122, 141, 181, 0.16), transparent 65%)",
    violet: "radial-gradient(circle, rgba(133, 104, 255, 0.18), transparent 65%)"
  };
  return map[accent] || map.cyan;
}

function formatRating(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "0.0";
  return (Math.round(parsed * 10) / 10).toFixed(1);
}

function productRatingValue(product) {
  const seed = Number(product?.id || 0);
  const drift = ((seed * 73) % 60) / 100; // 0.00 - 0.59
  const rating = 4.4 + drift; // 4.4 - 4.99
  return Math.min(5, Math.max(4, Math.round(rating * 10) / 10));
}

function productReviewCount(product) {
  const seed = Number(product?.id || 0);
  return 80 + ((seed * 97) % 920);
}

function getNewReleaseProducts(limit = 10) {
  return [...products].sort((a, b) => Number(b.id) - Number(a.id)).slice(0, Math.max(0, limit));
}

function refreshNewReleaseIds(limit = 10) {
  newReleaseIds = new Set(getNewReleaseProducts(limit).map((product) => Number(product.id)));
}

function isNewReleaseProduct(product) {
  return newReleaseIds.has(Number(product?.id));
}

function getTopSellerProducts(limit = 8) {
  const picks = [...products]
    .map((product) => ({
      product,
      rating: productRatingValue(product),
      reviews: productReviewCount(product)
    }))
    .sort((a, b) => (b.rating - a.rating) || (b.reviews - a.reviews) || (Number(b.product.id) - Number(a.product.id)))
    .slice(0, Math.max(0, limit))
    .map((item) => item.product);

  return picks;
}

function productCardMarkup(product, { mode = "catalog" } = {}) {
  const rating = productRatingValue(product);
  const reviews = productReviewCount(product);
  const ratingText = formatRating(rating);
  const titleHref = `product.html?id=${product.id}`;
  const isNew = isNewReleaseProduct(product);
  const outOfStock = isOutOfStock(product);
  const badgeTag = product.badge ? `<span class="tag">${product.badge}</span>` : "";
  const stockTag = stockTagMarkup(product);

  let productAction = "";
  if (isAdminUser()) {
    productAction = `<div class="product-actions"><button type="button" class="btn btn-secondary btn-small" disabled>Seller account</button></div>`;
  } else if (outOfStock && mode === "featured") {
    productAction = `
      <div class="product-actions">
        <a class="btn btn-secondary btn-small" href="${titleHref}">View Product</a>
        <button type="button" class="btn btn-primary btn-small" disabled>Out of stock</button>
      </div>
    `;
  } else if (outOfStock) {
    productAction = `
      <div class="product-actions">
        <button type="button" class="btn btn-secondary btn-small" disabled>Out of stock</button>
        <button type="button" class="btn btn-primary btn-small" disabled>Buy unavailable</button>
      </div>
    `;
  } else if (mode === "featured") {
    productAction = `
      <div class="product-actions">
        <a class="btn btn-secondary btn-small" href="${titleHref}">View Product</a>
        <button type="button" class="btn btn-primary btn-small" onclick="buyNow(${product.id})">Buy Now</button>
      </div>
    `;
  } else {
    productAction = `
      <div class="product-actions">
        <button type="button" class="btn btn-secondary btn-small" onclick="addCart(${product.id})">Add to cart</button>
        <button type="button" class="btn btn-primary btn-small" onclick="buyNow(${product.id})">Buy Now</button>
      </div>
    `;
  }

  return `
    <article class="product-card" style="--product-glow:${productGlow(product.accent)}">
      <div class="product-media">
        <a href="${titleHref}" aria-label="View ${product.name}">
          <img class="product-image" src="${resolveProductImage(product)}" alt="${product.name}" loading="lazy">
        </a>
      </div>
      <div>
        <div class="product-meta-row">
          <small>${product.category}</small>
          ${isNew ? `<span class="tag is-new">New</span>` : ""}
        </div>
        <h3><a class="product-title-link" href="${titleHref}">${product.name}</a></h3>
        <div class="product-rating" aria-label="Rated ${ratingText} out of 5">
          <span class="stars" style="--rating:${rating}" aria-hidden="true"></span>
          <span class="rating-text">${ratingText} (${reviews.toLocaleString("en-US")})</span>
        </div>
        <p class="card-copy">${product.desc}</p>
      </div>
      <div>
        <div class="product-badges">
          ${badgeTag}
          ${stockTag}
        </div>
        <div class="price-row">
          <span class="price">${formatMoney(product.price)}</span>
          <span class="card-copy">${product.tier.toUpperCase()} tier</span>
        </div>
        ${productAction}
      </div>
    </article>
  `;
}

function renderHeroTiles() {
  const heroGrid = document.getElementById("heroCatalog");
  if (!heroGrid) return;

  heroGrid.innerHTML = featureTiles
    .map(
      (tile) => `
        <a class="hero-card ${tile.className || ""}" href="${tile.href || "shop.html"}" style="--card-glow:${tile.glow}">
          <small>${tile.label}</small>
          <div>
            <strong>${tile.title}</strong>
            <span>${tile.note}</span>
          </div>
        </a>
      `
    )
    .join("");

  refreshScrollReveals(heroGrid);
}

function updateCartCount() {
  const count = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
  document.querySelectorAll("[data-cart-count]").forEach((node) => {
    node.textContent = count;
  });
}

function normalizeFilter(value) {
  const candidate = String(value || "all").trim().toLowerCase();
  return catalogFilters.find((filter) => filter.toLowerCase() === candidate) || "all";
}

function normalizeSort(value) {
  return catalogSorts.includes(value) ? value : "popular";
}

function syncSearchInputs() {
  document.querySelectorAll('input[name="search"], [data-product-search]').forEach((input) => {
    if (input.value !== currentSearch) {
      input.value = currentSearch;
    }
  });
}

function syncCatalogControls() {
  document.querySelectorAll(".filter-chip").forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.filter === currentFilter);
  });

  document.querySelectorAll("[data-sort-select]").forEach((select) => {
    if (select.value !== currentSort) {
      select.value = currentSort;
    }
  });

  syncSearchInputs();
}

function syncCatalogUrl() {
  if (!document.getElementById("products") || !window.history?.replaceState) return;

  const params = new URLSearchParams();
  if (currentSearch) params.set("search", currentSearch);
  if (currentFilter.toLowerCase() !== "all") params.set("filter", currentFilter);
  if (currentSort !== "popular") params.set("sort", currentSort);

  const query = params.toString();
  const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}`;
  window.history.replaceState(null, "", nextUrl);
}

function loadCatalogState() {
  const params = new URLSearchParams(window.location.search);
  currentFilter = normalizeFilter(params.get("filter") || "all");
  currentSearch = (params.get("search") || "").trim();
  currentSort = normalizeSort(params.get("sort") || "popular");
  syncSearchInputs();
}

function renderProducts(filter = currentFilter, search = currentSearch, sort = currentSort) {
  const grid = document.getElementById("products");
  const count = document.getElementById("productCount");
  if (!grid) return;

  currentFilter = normalizeFilter(filter);
  currentSearch = String(search || "").trim();
  currentSort = normalizeSort(sort);

  const normalizedFilter = currentFilter.toLowerCase();
  const normalizedSearch = currentSearch.toLowerCase();
  let visible = products.filter((product) => {
    const matchesSearch = !normalizedSearch || [product.name, product.category, product.badge, product.desc].join(" ").toLowerCase().includes(normalizedSearch);
    if (!matchesSearch) return false;
    if (normalizedFilter === "all") return true;
    if (normalizedFilter === "elite") return product.tier === "elite";
    if (normalizedFilter === "high") return product.tier === "high";
    if (normalizedFilter === "mid") return product.tier === "mid";
    return product.category.toLowerCase() === normalizedFilter;
  });

  if (currentSort === "low-high") {
    visible = [...visible].sort((a, b) => a.price - b.price);
  } else if (currentSort === "high-low") {
    visible = [...visible].sort((a, b) => b.price - a.price);
  } else if (currentSort === "name") {
    visible = [...visible].sort((a, b) => a.name.localeCompare(b.name));
  }

  if (count) {
    count.textContent = currentSearch
      ? `${visible.length} result(s) for "${currentSearch}"`
      : `${visible.length} parts and peripherals available`;
  }

  if (!visible.length) {
    grid.innerHTML = `<div class="empty-state catalog-empty-state">No items matched your current search and filters. Try another keyword or category.</div>`;
  } else {
    grid.innerHTML = visible.map((product) => productCardMarkup(product, { mode: "catalog" })).join("");
  }

  syncCatalogControls();
  syncCatalogUrl();
  refreshScrollReveals(grid);
}

function renderNewReleaseShelf(containerId, limit = 3) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const picks = getNewReleaseProducts(limit);
  if (!picks.length) {
    container.innerHTML = `<div class="empty-state">No new releases available yet.</div>`;
    refreshScrollReveals(container);
    return;
  }

  container.innerHTML = picks.map((product) => productCardMarkup(product, { mode: "featured" })).join("");
  refreshScrollReveals(container);
}

function renderNewReleaseSections() {
  renderNewReleaseShelf("landingNewReleases", 8);
  renderNewReleaseShelf("shopNewReleases", 10);
}

function renderTopSellerShelf(containerId, limit = 8) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const picks = getTopSellerProducts(limit);
  if (!picks.length) {
    container.innerHTML = `<div class="empty-state">No top sellers available yet.</div>`;
    refreshScrollReveals(container);
    return;
  }

  container.innerHTML = picks.map((product) => productCardMarkup(product, { mode: "featured" })).join("");
  refreshScrollReveals(container);
}

function renderTopSellerSections() {
  renderTopSellerShelf("landingTopSellers", 8);
  renderTopSellerShelf("shopTopSellers", 10);
}

function getProductIdFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("id") || params.get("product") || "";
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function renderProductDetailPage() {
  const detail = document.getElementById("productDetailView");
  if (!detail) return;

  const productId = getProductIdFromQuery();
  const product = productId ? products.find((item) => Number(item.id) === Number(productId)) : null;
  const side = document.getElementById("productDetailSide");
  const related = document.getElementById("relatedProducts");

  if (!product) {
    detail.innerHTML = `
      <div class="empty-state">
        Product not found. <a class="btn btn-primary" href="shop.html">Back to shop</a>
      </div>
    `;
    if (side) {
      side.innerHTML = `<div class="empty-state">Choose an item from the catalog to view details.</div>`;
      refreshScrollReveals(side);
    }
    if (related) {
      related.innerHTML = "";
      refreshScrollReveals(related);
    }
    refreshScrollReveals(detail);
    return;
  }

  const rating = productRatingValue(product);
  const reviews = productReviewCount(product);
  const ratingText = formatRating(rating);
  const isNew = isNewReleaseProduct(product);
  const outOfStock = isOutOfStock(product);
  const stockTag = stockTagMarkup(product);

  const actions = isAdminUser()
    ? `<div class="product-actions"><button type="button" class="btn btn-secondary" disabled>Seller account</button></div>`
    : outOfStock
    ? `
      <div class="product-actions">
        <button type="button" class="btn btn-secondary" disabled>Out of stock</button>
        <button type="button" class="btn btn-primary" disabled>Buy unavailable</button>
      </div>
    `
    : `
      <div class="product-actions">
        <button type="button" class="btn btn-secondary" onclick="addCart(${product.id})">Add to cart</button>
        <button type="button" class="btn btn-primary" onclick="buyNow(${product.id})">Buy Now</button>
      </div>
    `;

  detail.innerHTML = `
    <div class="product-detail">
      <div class="product-detail-media">
        <img src="${resolveProductImage(product)}" alt="${product.name}" loading="lazy">
      </div>
      <div class="product-detail-body">
        <p class="section-label">${product.category}${isNew ? " â€¢ New Release" : ""}</p>
        <h1>${product.name}</h1>
        <div class="product-rating" aria-label="Rated ${ratingText} out of 5">
          <span class="stars" style="--rating:${rating}" aria-hidden="true"></span>
          <span class="rating-text">${ratingText} (${reviews.toLocaleString("en-US")})</span>
        </div>
        <p class="product-detail-copy">${product.desc}</p>
        <div class="product-detail-tags">
          ${product.badge ? `<span class="tag">${product.badge}</span>` : ""}
          ${isNew ? `<span class="tag is-new">New</span>` : ""}
          ${stockTag}
          <span class="tag">${product.tier.toUpperCase()} tier</span>
        </div>
        <div class="product-detail-footer">
          <div class="product-detail-price">
            <span class="price">${formatMoney(product.price)}</span>
            <span class="card-copy">Shipping is calculated at checkout.</span>
          </div>
          ${actions}
        </div>
      </div>
    </div>
  `;

  if (side) {
    side.innerHTML = `
      <p class="section-label">LAB U</p>
      <h2>Buy with confidence</h2>
      <ul class="product-side-list">
        <li><strong>Rated</strong> 4.9/5 by builders</li>
        <li><strong>Payment</strong> COD or Card</li>
        <li><strong>Delivery</strong> 2â€“5 days ETA</li>
        <li><strong>Support</strong> Friendly recommendations</li>
      </ul>
      <div class="inline-actions" style="margin-top: 14px;">
        <a class="btn btn-secondary" href="shop.html">Back to shop</a>
        <a class="btn btn-primary" href="builder.html">Build a PC</a>
      </div>
    `;
  }

  if (related) {
    const relatedProducts = products
      .filter((item) => item && item.id !== product.id && item.category === product.category)
      .slice(0, 6);

    related.innerHTML = relatedProducts.length
      ? relatedProducts.map((item) => productCardMarkup(item, { mode: "catalog" })).join("")
      : `<div class="empty-state">No related items found.</div>`;

    refreshScrollReveals(related);
  }

  refreshScrollReveals(detail);
  if (side) refreshScrollReveals(side);
}

function setActiveFilter(nextFilter) {
  currentFilter = normalizeFilter(nextFilter);
  renderProducts(currentFilter, currentSearch, currentSort);
}

function buyNow(productId) {
  const product = getProductById(productId);
  if (!product) return;
  const stock = availableStockForProduct(product);
  if (stock <= 0) {
    alert(`${product.name} is currently out of stock.`);
    return;
  }
  sessionStorage.setItem("buyNowItem", JSON.stringify({ ...product, quantity: 1 }));
  navigateWithTransition("checkout.html");
}

async function addCart(id, qty = 1) {
  if (isAdminUser()) {
    navigateWithTransition("admin.html");
    return;
  }
  if (!currentUser) {
    window.__authModalReturnTo = window.location.href;
    openAuthModal("login");
    return;
  }

  const product = getProductById(id);
  if (!product) return;

  const availableStock = availableStockForProduct(product);
  if (availableStock <= 0) {
    alert(`${product.name} is currently out of stock.`);
    return;
  }

  const stepQty = Math.max(1, Math.floor(Number(qty || 1)));
  const existing = cart.find(item => item.id === id);
  const currentQty = existing ? (existing.quantity || 1) : 0;
  const requestedQty = currentQty + stepQty;
  const newQty = Math.min(requestedQty, availableStock);

  if (newQty <= currentQty) {
    alert(`Only ${availableStock} unit(s) left for ${product.name}.`);
    return;
  }

  if (existing) {
    existing.quantity = newQty;
  } else {
    cart.push({ ...product, quantity: newQty });
  }

  if (requestedQty > availableStock) {
    alert(`Only ${availableStock} unit(s) left for ${product.name}.`);
  }
  
  try {
    await apiRequest("/api/cart/add", {
      method: "POST",
      body: JSON.stringify({ productId: id, quantity: newQty })
    });
  } catch (error) {
    alert(error.message || "Unable to update cart quantity.");
    console.error("Failed to sync cart item to server:", error);
    try {
      const cartPayload = await apiRequest("/api/cart", { method: "GET" });
      cart = (cartPayload.items || []).map(normalizeCartItem);
    } catch (syncError) {
      console.error("Failed to reload cart after sync error:", syncError);
    }
  }
  
  updateCartCount();
  renderCart();
  renderCheckout();
}

async function updateCartQuantity(id, change) {
  if (isAdminUser()) {
    navigateWithTransition("admin.html");
    return;
  }

  const existing = cart.find(item => item.id === id);
  if (!existing) return;

  const stock = Math.max(availableStockForId(id), normalizeStockValue(existing.stock));
  if (stock <= 0) {
    cart = cart.filter(item => item.id !== id);
    alert(`${existing.name} is currently out of stock and was removed from your cart.`);
    updateCartCount();
    if (typeof renderCart === 'function') renderCart();
    if (typeof renderCheckout === 'function') renderCheckout();
    return;
  }

  const newQty = (existing.quantity || 1) + change;
  if (change > 0 && newQty > stock) {
    alert(`Only ${stock} unit(s) left for ${existing.name}.`);
    return;
  }

  if (newQty <= 0) {
    cart = cart.filter(item => item.id !== id);
  } else {
    existing.quantity = newQty;
  }
  
  if (currentUser) {
    try {
      await apiRequest("/api/cart/add", {
        method: "POST",
        body: JSON.stringify({ productId: id, quantity: Math.max(0, newQty) })
      });
    } catch (error) {
      alert(error.message || "Unable to update cart item.");
      console.error("Failed to update cart item:", error);
      try {
        const cartPayload = await apiRequest("/api/cart", { method: "GET" });
        cart = (cartPayload.items || []).map(normalizeCartItem);
      } catch (syncError) {
        console.error("Failed to reload cart after update error:", syncError);
      }
    }
  } else {
    save();
  }
  
  updateCartCount();
  if (typeof renderCart === 'function') renderCart();
  if (typeof renderCheckout === 'function') renderCheckout();
}

async function updateCheckoutQuantity(id, change) {
  if (isAdminUser()) {
    navigateWithTransition("admin.html");
    return;
  }

  const buyNowArrayStr = sessionStorage.getItem("buyNowItemsArray");
  const buyNowItemStr = sessionStorage.getItem("buyNowItem");

  if (buyNowArrayStr) {
    let items;
    try {
      items = JSON.parse(buyNowArrayStr) || [];
    } catch {
      items = [];
    }

    const target = items.find((item) => item && String(item.id) === String(id));
    if (!target) return;

    const stock = Math.max(availableStockForId(id), normalizeStockValue(target.stock));
    if (stock <= 0) {
      alert(`${target.name} is currently out of stock.`);
      return;
    }

    const nextQty = Math.max(1, (target.quantity || 1) + change);
    if (change > 0 && nextQty > stock) {
      alert(`Only ${stock} unit(s) left for ${target.name}.`);
      return;
    }
    target.quantity = nextQty;
    sessionStorage.setItem("buyNowItemsArray", JSON.stringify(items));
    renderCheckout();
    return;
  }

  if (buyNowItemStr) {
    let item;
    try {
      item = JSON.parse(buyNowItemStr);
    } catch {
      item = null;
    }

    if (!item || String(item.id) !== String(id)) return;

    const stock = Math.max(availableStockForId(id), normalizeStockValue(item.stock));
    if (stock <= 0) {
      alert(`${item.name} is currently out of stock.`);
      return;
    }

    const nextQty = Math.max(1, (item.quantity || 1) + change);
    if (change > 0 && nextQty > stock) {
      alert(`Only ${stock} unit(s) left for ${item.name}.`);
      return;
    }
    sessionStorage.setItem("buyNowItem", JSON.stringify({ ...item, quantity: nextQty }));
    renderCheckout();
    return;
  }

  await updateCartQuantity(id, change);
}

async function checkout() {
  if (isAdminUser()) {
    navigateWithTransition("admin.html");
    return;
  }

  const buyNowItemStr = sessionStorage.getItem("buyNowItem");
  const buyNowArrayStr = sessionStorage.getItem("buyNowItemsArray");
  const checkoutItems = buyNowArrayStr ? JSON.parse(buyNowArrayStr) : (buyNowItemStr ? [JSON.parse(buyNowItemStr)] : cart);

  if (!checkoutItems.length) {
    alert("There are no items to checkout.");
    return;
  }

  const requestedByProduct = new Map();
  checkoutItems.forEach((item) => {
    const productId = Number(item?.id);
    const quantity = Math.max(1, Math.floor(Number(item?.quantity || 1)));
    if (!Number.isFinite(productId) || productId <= 0) return;
    requestedByProduct.set(productId, (requestedByProduct.get(productId) || 0) + quantity);
  });

  for (const [productId, quantity] of requestedByProduct.entries()) {
    const product = getProductById(productId);
    const stock = product ? availableStockForProduct(product) : 0;
    const name = product?.name || "This item";
    if (stock <= 0) {
      alert(`${name} is out of stock.`);
      return;
    }
    if (quantity > stock) {
      alert(`Only ${stock} unit(s) left for ${name}.`);
      return;
    }
  }
  
  const nameNode = document.getElementById("checkoutNameDisplay");
  const emailNode = document.getElementById("checkoutEmailDisplay");
  const customerName = currentUser ? (currentUser.fullName || currentUser.email || "") : String(nameNode?.value || "").trim();
  const customerEmail = currentUser ? String(currentUser.email || "").trim() : String(emailNode?.value || "").trim();

  if (!customerName) {
    if (!currentUser) {
      setFieldError(nameNode, "Please provide your name for the order.");
    } else {
      alert("Please provide your name for the order.");
    }
    safeFocus(nameNode);
    return;
  }
  setFieldError(nameNode, "");

  if (!isValidEmailAddress(customerEmail)) {
    if (!currentUser) {
      setFieldError(emailNode, "Please provide a valid email address.");
    } else {
      alert("Please provide a valid email address.");
    }
    safeFocus(emailNode);
    return;
  }
  setFieldError(emailNode, "");

  const addressNode = document.getElementById("checkoutAddressInput");
  const contactNode = document.getElementById("checkoutContactInput");
  const address = addressNode ? addressNode.value.trim() : "";
  const contactNumber = contactNode ? contactNode.value.trim() : "";

  let hasFieldError = false;

  const addressError = deliveryAddressError(address, { required: true });
  if (addressError) {
    setFieldError(addressNode, addressError);
    hasFieldError = true;
  } else {
    setFieldError(addressNode, "");
  }

  let contactDigits = digitsOnly(contactNumber);
  let contactError = "";
  if (!contactNumber) {
    contactError = "Please provide a contact number.";
  } else if (contactDigits.length < 10 || contactDigits.length > 15) {
    contactError = "Please provide a valid contact number.";
  }

  if (contactError) {
    setFieldError(contactNode, contactError);
    hasFieldError = true;
  } else {
    setFieldError(contactNode, "");
  }

  if (hasFieldError) {
    if (addressError) {
      safeFocus(addressNode);
    } else if (contactError) {
      safeFocus(contactNode);
    }
    return;
  }

  if (contactNode) contactNode.value = contactDigits;
   
  const productSubtotal = checkoutItems.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 1)), 0);
  const finalTotal = productSubtotal + 200;
  const paymentMethod = normalizePaymentMethod(document.querySelector('input[name="payment"]:checked')?.value);

  if (paymentMethod === "card") {
    const cardNumberNode = document.getElementById("cardNumberInput");
    const cardNameNode = document.getElementById("cardNameInput");
    const cardExpNode = document.getElementById("cardExpInput");
    const cardCvvNode = document.getElementById("cardCvvInput");

    const cardNumber = digitsOnly(cardNumberNode?.value);
    const cardName = String(cardNameNode?.value || "").trim();
    const cardExp = String(cardExpNode?.value || "").trim();
    const cardCvv = digitsOnly(cardCvvNode?.value);

    if (!cardNumberNode || !cardNameNode || !cardExpNode || !cardCvvNode) {
      alert("Card details are missing from the checkout page.");
      return;
    }

    if (!isValidVisaCardNumber(cardNumber)) {
      alert("Please enter a valid Visa card number (starts with 4).");
      return;
    }

    if (cardName.length < 2) {
      alert("Please enter the name on the card.");
      return;
    }

    const expiry = parseExpiry(cardExp);
    if (!expiry) {
      alert("Please enter a valid expiration date (MM/YY).");
      return;
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    if (expiry.year < currentYear || (expiry.year === currentYear && expiry.month < currentMonth)) {
      alert("This card is expired. Please use a different card.");
      return;
    }

    if (!/^\d{3}$/.test(cardCvv)) {
      alert("Please enter a valid 3-digit security code (CVV).");
      return;
    }
  }
  
  if (currentUser) {
    try {
      await apiRequest("/api/orders/checkout", {
        method: "POST",
        body: JSON.stringify({ items: checkoutItems, paymentMethod, address, contactNumber: contactDigits, isBuyNow: !!(buyNowItemStr || buyNowArrayStr) })
      });
      const orderPayload = await apiRequest("/api/orders", { method: "GET" });
      orders = (orderPayload.orders || []).map(normalizeOrder);
      if (!buyNowItemStr && !buyNowArrayStr) cart = [];
    } catch (error) {
      alert("Checkout failed: " + error.message);
      return;
    }
  } else {
    orders.unshift({
      id: Date.now(),
      createdAt: new Date().toISOString(),
      total: finalTotal,
      status: "placed",
      paymentMethod,
      customerName,
      customerEmail,
      address,
      contactNumber: contactDigits,
      items: checkoutItems.map((item) => ({ ...item }))
    });
    if (!buyNowItemStr && !buyNowArrayStr) cart = [];
    save();
  }
  
  if (buyNowItemStr) sessionStorage.removeItem("buyNowItem");
  if (buyNowArrayStr) sessionStorage.removeItem("buyNowItemsArray");
  updateCartCount();
  navigateWithTransition("dashboard.html");
}

function legacyRenderCart() {
  const container = document.getElementById("cartView");
  const totalSum = document.getElementById("cartTotalSum");
  if (!container) return;

  if (cart.length === 0) {
    container.innerHTML = `<div class="empty-state">Your cart is empty. Try adding some items from the shop!</div>`;
    if (totalSum) totalSum.textContent = "â‚±0.00";
    return;
  }

  let html = "";
  let total = 0;

  cart.forEach(item => {
    const qty = item.quantity || 1;
    total += item.price * qty;
    
    html += `
      <div class="cart-item-row fade-in">
        <label class="forge-checkbox checkbox-offset">
          <input type="checkbox" checked>
          <span class="forge-checkmark"></span>
        </label>
        <div class="cart-item-media">
          <img src="${productImagePath(item.name)}" alt="${item.name}">
        </div>
        <div class="cart-item-details">
          <h4>${item.name}</h4>
          <span class="forge-red-price">${formatMoney(item.price)}</span>
        </div>
        <div class="cart-qty-controls">
          <button onclick="updateCartQuantity(${item.id}, -1)">-</button>
          <span>${qty}</span>
          <button onclick="updateCartQuantity(${item.id}, 1)">+</button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
  if (totalSum) totalSum.textContent = formatMoney(total);
}

function legacyRenderCheckout() {
  const container = document.getElementById("checkoutView");
  const coSubOriginal = document.getElementById("coSubOriginal");
  const coSubDiscount = document.getElementById("coSubDiscount");
  const coGrandTotal = document.getElementById("coGrandTotal");
  if (!container) return;

  if (cart.length === 0) {
    container.innerHTML = `<div class="empty-state">No items found for checkout.</div>`;
    return;
  }

  let html = "";
  let total = 0;

  cart.forEach(item => {
    const qty = item.quantity || 1;
    total += item.price * qty;

    html += `
      <div class="checkout-block cart-item-row fade-in">
        <div class="cart-item-media large-media">
          <img src="${productImagePath(item.name)}" alt="${item.name}">
        </div>
        <div class="cart-item-details expanded-details">
          <h4>${item.name} <br> <small>${item.desc || ''}</small></h4>
          <div class="checkout-price-row">
            <span class="forge-red-price">${formatMoney(item.price)}</span>
          </div>
        </div>
        <div class="checkout-note-col">
          <div class="add-note-link">Add note ></div>
          <div class="cart-qty-controls checkout-qty">
             <button disabled>-</button>
             <span>${qty}</span>
             <button disabled>+</button>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
  
  if (coSubOriginal) coSubOriginal.textContent = formatMoney(total);
  if (coSubDiscount) coSubDiscount.textContent = "-PHP 0.00";
  
  const finalTotal = total + 200; 
  if (coGrandTotal) coGrandTotal.textContent = formatMoney(finalTotal);
}


function renderCart() {
  const container = document.getElementById("cartView");
  const totalSum = document.getElementById("cartTotalSum");
  if (!container) return;

  if (cart.length === 0) {
    container.innerHTML = `<div class="empty-state">Your cart is empty. Try adding some items from the shop.</div>`;
    if (totalSum) totalSum.textContent = formatMoney(0);
    refreshScrollReveals(container);
    return;
  }

  let total = 0;
  container.innerHTML = cart
    .map((item) => {
      const qty = item.quantity || 1;
      const stock = Math.max(availableStockForId(item.id), normalizeStockValue(item.stock));
      const canIncrease = stock > qty;
      total += item.price * qty;
      return `
        <div class="cart-item-row fade-in">
          <label class="forge-checkbox checkbox-offset">
            <input type="checkbox" checked>
            <span class="forge-checkmark"></span>
          </label>
          <div class="cart-item-media">
            <img src="${resolveProductImage(item)}" alt="${item.name}">
          </div>
          <div class="cart-item-details">
            <h4>${item.name}</h4>
            <span class="forge-red-price">${formatMoney(item.price * qty)}</span>
            <small class="cart-stock-note">${stock > 0 ? `Stock: ${stock}` : "Out of stock"}</small>
          </div>
          <div class="cart-qty-controls">
            <button onclick="updateCartQuantity(${item.id}, -1)">-</button>
            <span>${qty}</span>
            <button onclick="updateCartQuantity(${item.id}, 1)" ${canIncrease ? "" : "disabled"}>+</button>
          </div>
        </div>
      `;
    })
    .join("");

  if (totalSum) totalSum.textContent = formatMoney(total);
  refreshScrollReveals(container);
}

function renderCheckout() {
  const container = document.getElementById("checkoutView");
  const coSubOriginal = document.getElementById("coSubOriginal");
  const coSubDiscount = document.getElementById("coSubDiscount");
  const coGrandTotal = document.getElementById("coGrandTotal");
  if (!container) return;

  const buyNowItemStr = sessionStorage.getItem("buyNowItem");
  const buyNowArrayStr = sessionStorage.getItem("buyNowItemsArray");
  const checkoutItems = buyNowArrayStr ? JSON.parse(buyNowArrayStr) : (buyNowItemStr ? [JSON.parse(buyNowItemStr)] : cart);

  const nameDisplay = document.getElementById("checkoutNameDisplay");
  const emailDisplay = document.getElementById("checkoutEmailDisplay");

  if (currentUser) {
    const addressInput = document.getElementById("checkoutAddressInput");
    const contactInput = document.getElementById("checkoutContactInput");
    const codRadio = document.querySelector('input[name="payment"][value="cash_on_delivery"]');
    const cardRadio = document.querySelector('input[name="payment"][value="card"]');
    
    if (nameDisplay) {
      nameDisplay.disabled = true;
      nameDisplay.value = currentUser.fullName || "";
    }
    if (emailDisplay) {
      emailDisplay.disabled = true;
      emailDisplay.value = currentUser.email || "";
      setFieldError(emailDisplay, "");
    }
    if (addressInput && !addressInput.value) addressInput.value = currentUser.address || "";
    if (contactInput && !contactInput.value) contactInput.value = currentUser.phone || "";
    if (currentUser.defaultPayment) {
      if (currentUser.defaultPayment === "card" && cardRadio) cardRadio.checked = true;
      if (currentUser.defaultPayment === "cash_on_delivery" && codRadio) codRadio.checked = true;
    }
  } else {
    if (nameDisplay) {
      nameDisplay.disabled = false;
      if (!nameDisplay.value || nameDisplay.value === "Loading..." || nameDisplay.value === "Guest checkout") {
        nameDisplay.value = "";
      }
    }
    if (emailDisplay && (!emailDisplay.value || emailDisplay.value === "Loading...")) emailDisplay.value = "";
  }

  if (!currentUser && emailDisplay) {
    emailDisplay.disabled = false;
    const raw = String(emailDisplay.value || "");
    if (raw === "Loading...") {
      emailDisplay.value = "";
    }
  }

  bindCheckoutValidation();

  if (checkoutItems.length === 0) {
    container.innerHTML = `<div class="empty-state">No items found for checkout.</div>`;
    refreshScrollReveals(container);
    return;
  }

  let subtotal = 0;

  container.innerHTML = `
    <div class="forge-card">
      <div class="forge-section">
        <div class="forge-section-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4H6z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
          Deliverable Items
        </div>
        ${checkoutItems
          .map((item) => {
            const qty = item.quantity || 1;
            const stock = Math.max(availableStockForId(item.id), normalizeStockValue(item.stock));
            const canIncrease = stock > qty;
            const lineTotal = item.price * qty;
            subtotal += lineTotal;

            return `
              <div class="cart-item-row fade-in" style="border-bottom: 1px solid rgba(255,255,255,0.05); padding: 16px 0;">
                <div class="cart-item-media large-media">
                  <img src="${resolveProductImage(item)}" alt="${item.name}">
                </div>
                <div class="cart-item-details expanded-details">
                  <h4>${item.name} <br> <small>${item.desc || ""}</small></h4>
                  <div class="checkout-price-row">
                    <span class="forge-red-price">${formatMoney(lineTotal)}</span>
                    <small class="cart-stock-note">${stock > 0 ? `Stock: ${stock}` : "Out of stock"}</small>
                  </div>
                </div>
                <div class="checkout-note-col">
                  <div class="add-note-link">Add note ></div>
                  <div class="cart-qty-controls checkout-qty" style="background: rgba(255,255,255,0.05); border-radius: 6px; padding: 4px 8px;">
                    <button type="button" onclick="updateCheckoutQuantity(${item.id}, -1)" ${qty <= 1 ? "disabled" : ""} style="${qty <= 1 ? "color: var(--muted); opacity: 0.6;" : ""}">-</button>
                    <span>${qty}</span>
                    <button type="button" onclick="updateCheckoutQuantity(${item.id}, 1)" ${canIncrease ? "" : "disabled"} style="${canIncrease ? "" : "color: var(--muted); opacity: 0.6;"}">+</button>
                  </div>
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
    </div>
  `;

  if (coSubOriginal) coSubOriginal.textContent = formatMoney(subtotal);
  if (coSubDiscount) coSubDiscount.textContent = "-PHP 0.00";
  if (coGrandTotal) coGrandTotal.textContent = formatMoney(subtotal + 200);

  setupPaymentMethodUI();
  refreshScrollReveals(container);
}

function setupPaymentMethodUI() {
  const cardDetails = document.getElementById("cardDetails");
  if (!cardDetails) return;

  const disclaimer = document.getElementById("cardDisclaimer");
  const cardNumberNode = document.getElementById("cardNumberInput");
  const cardExpNode = document.getElementById("cardExpInput");
  const cardCvvNode = document.getElementById("cardCvvInput");
  const paymentRadios = Array.from(document.querySelectorAll('input[name="payment"]'));

  const updateVisibility = () => {
    const method = normalizePaymentMethod(document.querySelector('input[name="payment"]:checked')?.value);
    const show = method === "card";
    cardDetails.style.display = show ? "grid" : "none";
    if (disclaimer) disclaimer.style.display = show ? "block" : "none";
  };

  if (!cardDetails.dataset.paymentBound) {
    paymentRadios.forEach((radio) => radio.addEventListener("change", updateVisibility));
    cardDetails.dataset.paymentBound = "1";
  }

  if (cardNumberNode && !cardNumberNode.dataset.formatBound) {
    cardNumberNode.addEventListener("input", () => {
      cardNumberNode.value = formatCardNumber(cardNumberNode.value);
    });
    cardNumberNode.dataset.formatBound = "1";
  }

  if (cardExpNode && !cardExpNode.dataset.formatBound) {
    cardExpNode.addEventListener("input", () => {
      cardExpNode.value = formatExpiry(cardExpNode.value);
    });
    cardExpNode.dataset.formatBound = "1";
  }

  if (cardCvvNode && !cardCvvNode.dataset.formatBound) {
    cardCvvNode.addEventListener("input", () => {
      cardCvvNode.value = digitsOnly(cardCvvNode.value).slice(0, 3);
    });
    cardCvvNode.dataset.formatBound = "1";
  }

  updateVisibility();
}

const BUILDER_CATEGORIES = [
  "CPU", "Motherboard", "RAM", "GPU", "SSD", "Cooling", "PSU", "Case"
];

const BUILDER_CATEGORY_IMAGES = {
  CPU: "assets/products/cpu_photo_1775980925159.png",
  GPU: "assets/products/gpu_photo_1775981182746.png",
  Motherboard: "assets/products/motherboard_photo_1775980965324.png",
  RAM: "assets/products/corsair-vengeance-lpx-32gb-ddr4.svg",
  SSD: "assets/products/kingston-nv2-256gb.svg",
  Cooling: "assets/products/cooling_photo_1775981214237.png",
  PSU: "assets/products/psu_photo_1775981197084.png",
  Case: "assets/products/case_photo_1775980947598.png"
};

function loadBuilder() {
  const slotsContainer = document.getElementById("builderSlots");
  if (!slotsContainer) return;

  slotsContainer.innerHTML = BUILDER_CATEGORIES.map(category => {
    const categoryProducts = products.filter(p => p.category === category);
    if (!categoryProducts.length) return "";
    
    const options = categoryProducts
      .map((p) => {
        const stock = availableStockForProduct(p);
        const stockText = stock > 0 ? ` (${stock} in stock)` : " (Out of stock)";
        return `<option value="${p.id}" ${stock <= 0 ? "disabled" : ""}>${p.name} - ${formatMoney(p.price)}${stockText}</option>`;
      })
      .join("");

    const slotImage = BUILDER_CATEGORY_IMAGES[category] || resolveProductImage(categoryProducts[0]);
    
    return `
      <article class="builder-slot">
        <div class="builder-slot-media">
          <img class="builder-slot-image" src="${slotImage}" alt="${category}" loading="lazy" data-builder-slot-image="${category}">
        </div>
        <h3>Choose your ${category}</h3>
        <select class="builder-select" data-category="${category}" onchange="buildTotal()">
          <option value="">Select ${category}...</option>
          ${options}
        </select>
      </article>
    `;
  }).join("");

  buildTotal();
}

function buildTotal() {
  const selects = document.querySelectorAll(".builder-select");
  const totalNode = document.getElementById("total");
  const tierDisplay = document.getElementById("builderTierDisplay");
  const itemsList = document.getElementById("builderItemsList");
  if (!selects.length || !totalNode) return;

  let total = 0;
  let selectedParts = 0;
  let tierCounts = { mid: 0, high: 0, elite: 0 };
  let itemsHtml = "";

  selects.forEach(select => {
    const category = select.dataset.category || "";
    const slotImageNode = category ? document.querySelector(`[data-builder-slot-image="${category}"]`) : null;

    if (!select.value) {
      if (slotImageNode) {
        slotImageNode.src = BUILDER_CATEGORY_IMAGES[category] || slotImageNode.src;
        slotImageNode.alt = category || "Component";
      }
      return;
    }
    const selectedProduct = products.find(p => String(p.id) === select.value);
    if (selectedProduct) {
      if (slotImageNode) {
        slotImageNode.src = resolveProductImage(selectedProduct);
        slotImageNode.alt = selectedProduct.name;
      }
      total += selectedProduct.price;
      selectedParts += 1;
      if (tierCounts[selectedProduct.tier] !== undefined) {
        tierCounts[selectedProduct.tier]++;
      }
      
      itemsHtml += `
        <a class="visual-item-row" href="product.html?id=${selectedProduct.id}">
          <img class="visual-item-thumb" src="${resolveProductImage(selectedProduct)}" alt="${selectedProduct.name}" loading="lazy">
          <div class="visual-item-meta">
            <strong>${selectedProduct.category}</strong>
            <span>${selectedProduct.name}</span>
          </div>
          <div class="visual-item-price">${formatMoney(selectedProduct.price)}</div>
        </a>
      `;
    }
  });

  if (itemsList) {
    itemsList.innerHTML = itemsHtml || `<p class="subtle-hint">No parts selected yet.</p>`;
  }

  totalNode.textContent = formatMoney(total);

  if (tierDisplay) {
    if (!selectedParts) {
      tierDisplay.textContent = "Pending";
      tierDisplay.style.color = "var(--accent)";
      return;
    }

    const totalParts = selectedParts;
    let computedTier = "Pending";
    let color = "var(--accent)";
    
    if (tierCounts.elite >= Math.ceil(totalParts * 0.4)) {
      computedTier = "Elite Setup";
      color = "#8568ff"; 
    } else if (tierCounts.high >= Math.ceil(totalParts * 0.5) || (tierCounts.elite + tierCounts.high > tierCounts.mid)) {
      computedTier = "High Range";
      color = "#00ffa3"; 
    } else {
      computedTier = "Mid Range";
      color = "#21d4fd";
    }
    
    tierDisplay.textContent = computedTier;
    tierDisplay.style.color = color;
  }
}

async function addBuildToCart() {
  if (isAdminUser()) {
    navigateWithTransition("admin.html");
    return;
  }
  if (!currentUser) {
    window.__authModalReturnTo = window.location.href;
    openAuthModal("login");
    return;
  }

  const selects = document.querySelectorAll(".builder-select");
  const selectedIds = Array.from(selects)
    .map(select => Number(select.value))
    .filter(id => Number.isFinite(id) && id > 0);

  if (!selectedIds.length) {
    alert("Please select at least one component.");
    return;
  }

  const btn = document.getElementById("addBuildBtn");
  if (btn) btn.disabled = true;

  try {
    for (const id of selectedIds) {
      // Direct push without ui blocking update
      const product = products.find((item) => item.id === id);
      if (!product) continue;
      
      const existing = cart.find(item => item.id === id);
      let newQty = 1;
      if (existing) {
        existing.quantity = (existing.quantity || 1) + 1;
        newQty = existing.quantity;
      } else {
        cart.push({ ...product, quantity: 1 });
      }
      
      await apiRequest("/api/cart/add", {
        method: "POST",
        body: JSON.stringify({ productId: id, quantity: newQty })
      });
    }
    updateCartCount();
    alert("Full custom setup successfully added to your cart!");
    navigateWithTransition("cart.html");
  } catch (error) {
    console.error("Failed to add setup to cart:", error);
    if (btn) btn.disabled = false;
  }
}

function buyBuildNow() {
  const selects = document.querySelectorAll(".builder-select");
  const items = [];
  const unavailable = [];
  
  selects.forEach(select => {
    const id = Number(select.value);
    if (Number.isFinite(id) && id > 0) {
      const product = products.find((item) => item.id === id);
      if (!product) return;
      if (availableStockForProduct(product) <= 0) {
        unavailable.push(product.name);
        return;
      }
      items.push({ ...product, quantity: 1 });
    }
  });

  if (unavailable.length) {
    alert(`${unavailable[0]} is currently out of stock. Please choose another part.`);
    return;
  }

  if (!items.length) {
    alert("Please select at least one component.");
    return;
  }

  sessionStorage.setItem("buyNowItemsArray", JSON.stringify(items));
  navigateWithTransition("checkout.html");
}

function setAuthFeedback(node, message, { tone = "neutral" } = {}) {
  if (!node) return;
  node.classList.remove("is-success", "is-error");
  if (tone === "success") node.classList.add("is-success");
  if (tone === "error") node.classList.add("is-error");
  node.textContent = String(message || "");
}

function showForgotPasswordPanel(visible = true) {
  const panel = document.getElementById("forgotPasswordPanel");
  if (!panel) return;
  panel.hidden = !visible;
  if (visible) {
    safeFocus(document.getElementById("forgotEmail"));
  }
}

function hideForgotPasswordPanel() {
  showForgotPasswordPanel(false);
}

async function requestPasswordReset() {
  await resetPassword();
}

async function resetPassword() {
  const emailInput = document.getElementById("forgotEmail");
  const passInput = document.getElementById("forgotNewPass");
  const confirmInput = document.getElementById("forgotConfirmPass");
  const feedback = document.getElementById("forgotFeedback");
  if (!emailInput || !passInput || !confirmInput) return;

  const email = emailInput.value.trim();
  const password = passInput.value.trim();
  const confirm = confirmInput.value.trim();

  if (!isValidEmailAddress(email)) {
    setAuthFeedback(feedback, "Please enter a valid email address.", { tone: "error" });
    safeFocus(emailInput);
    return;
  }
  if (password.length < 6) {
    setAuthFeedback(feedback, "Password must be at least 6 characters long.", { tone: "error" });
    safeFocus(passInput);
    return;
  }
  if (password !== confirm) {
    setAuthFeedback(feedback, "Passwords do not match.", { tone: "error" });
    safeFocus(confirmInput);
    return;
  }

  try {
    const payload = await apiRequest("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email, password, confirmPassword: confirm })
    });

    passInput.value = "";
    confirmInput.value = "";
    setAuthFeedback(feedback, payload.message || "Password reset successful. You can now sign in.", { tone: "success" });
    safeFocus(document.getElementById("email") || emailInput);
  } catch (error) {
    setAuthFeedback(feedback, error.message || "Unable to reset password.", { tone: "error" });
  }
}

function initForgotPasswordFromQuery() {
  const hasResetHint = Boolean(new URLSearchParams(window.location.search).get("reset_token"));
  if (!hasResetHint) return;
  const feedback = document.getElementById("forgotFeedback");
  showForgotPasswordPanel(true);
  setAuthFeedback(feedback, "Enter your email and your new password to reset your account.", { tone: "success" });
}

async function register() {
  const name = document.getElementById("name");
  const email = document.getElementById("email");
  const pass = document.getElementById("pass");
  const confirm = document.getElementById("confirmPass");
  if (!name || !email || !pass || !confirm) return;

  const nameVal = name.value.trim();
  const emailVal = email.value.trim();
  const passVal = pass.value.trim();
  const confirmVal = confirm.value.trim();

  if (!nameVal || !emailVal || !passVal || !confirmVal) {
    alert("Please fill in all fields.");
    return;
  }

  if (!isValidEmailAddress(emailVal)) {
    alert("Please enter a valid email address.");
    safeFocus(email);
    return;
  }

  if (passVal !== confirmVal) {
    alert("Passwords do not match.");
    return;
  }

  try {
    const payload = await apiRequest("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ fullName: nameVal, email: emailVal, password: passVal })
    });

    const oldUser = currentUser;
    currentUser = payload.user || null;
    await syncUserData(oldUser, currentUser);
    navigateWithTransition(homeRouteForUser(currentUser));
  } catch (error) {
    const message = error.message === "Failed to fetch" ? accountServerMessage() : error.message;
    alert(message);
  }
}

async function login() {
  const email = document.getElementById("email");
  const pass = document.getElementById("pass");
  if (!email || !pass) return;

  const emailValue = email.value.trim();
  const passValue = pass.value.trim();

  if (!isValidEmailAddress(emailValue)) {
    alert("Please enter a valid email address.");
    safeFocus(email);
    return;
  }

  try {
    const payload = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: emailValue, password: passValue })
    });

    const oldUser = currentUser;
    currentUser = payload.user || null;
    await syncUserData(oldUser, currentUser);
    navigateWithTransition(homeRouteForUser(currentUser));
  } catch (error) {
    const message = error.message === "Failed to fetch" ? accountServerMessage() : error.message;
    alert(message);
  }
}

function legacyLoadDashboard() {
  const orderList = document.getElementById("orders");
  const orderCount = document.getElementById("dashboardOrderCount");
  const totalSpent = document.getElementById("dashboardTotalSpent");
  const cartCount = document.getElementById("dashboardCartCount");
  const lastOrder = document.getElementById("dashboardLastOrder");
  const totalOrderValue = orders.reduce((sum, order) => sum + order.total, 0);

  if (orderCount) orderCount.textContent = String(orders.length);
  if (totalSpent) totalSpent.textContent = formatMoney(totalOrderValue);
  if (cartCount) cartCount.textContent = String(cart.length);
  if (lastOrder) lastOrder.textContent = orders[0]?.date || "No orders yet";
  
  const welcomeNode = document.getElementById("dashboardWelcome");
  if (welcomeNode && currentUser) {
    welcomeNode.textContent = `Welcome back, ${currentUser.fullName || currentUser.email}.`;
  }

  if (!orderList) return;

  if (!orders.length) {
    orderList.innerHTML = `<div class="empty-state">No orders yet. Add parts to cart and checkout from the shop page.</div>`;
    return;
  }

  orderList.innerHTML = orders
    .map(
      (order) => `
        <article class="order-card">
          <strong>${order.date}</strong>
          <p class="card-copy">${order.items.length} item(s) - ${formatMoney(order.total)}</p>
          <div class="summary-list">
            ${order.items.map((item) => `<div><span>${item.name}</span><span>${formatMoney(item.price)}</span></div>`).join("")}
          </div>
        </article>
      `
    )
    .join("");
}

function renderOrderProgress(status) {
  const normalizedStatus = normalizeStatus(status);
  if (normalizedStatus === "cancelled") {
    return `<div class="order-cancel-banner">This order was cancelled.</div>`;
  }

  const activeIndex = orderProgressSteps.findIndex((step) => step.value === normalizedStatus);
  return `
    <div class="order-status-track">
      ${orderProgressSteps
        .map(
          (step, index) => `
            <div class="order-step ${index <= activeIndex ? "is-active" : ""}">
              <span class="order-step-dot"></span>
              <span class="order-step-label">${step.label}</span>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderVisualOrderItemRow(item) {
  const quantity = item.quantity || 1;
  const lineTotal = (item.price || 0) * quantity;
  const label = item.category || "Item";
  const href = Number.isFinite(item.id) ? `product.html?id=${item.id}` : "";
  const wrapperTag = href ? "a" : "div";
  const hrefAttr = href ? ` href="${href}"` : "";

  return `
    <${wrapperTag} class="visual-item-row"${hrefAttr}>
      <img class="visual-item-thumb" src="${resolveProductImage(item)}" alt="${item.name}" loading="lazy">
      <div class="visual-item-meta">
        <strong>${label}</strong>
        <span>${item.name} Ã—${quantity}</span>
      </div>
      <div class="visual-item-price">${formatMoney(lineTotal)}</div>
    </${wrapperTag}>
  `;
}

function renderCustomerOrderCard(order) {
  const canCancel = isCancellableOrderStatus(order.status);
  const cancelHtml = canCancel
    ? `
      <div class="order-actions">
        <button type="button" class="btn btn-secondary order-cancel-btn" onclick="cancelOrder(${order.id})">Cancel order</button>
      </div>
    `
    : "";

  return `
    <article class="order-card tracked-order-card">
      <div class="order-card-head">
        <div>
          <strong>Order #${String(order.id).padStart(6, "0")}</strong>
          <p class="card-copy">${formatOrderDate(order.createdAt)}</p>
        </div>
        <span class="status-pill status-${order.status.replace(/_/g, "-")}">${statusLabel(order.status)}</span>
      </div>
      <p class="order-estimate">${estimateDeliveryText(order)}</p>
      ${renderOrderProgress(order.status)}
      <div class="order-metrics">
        <div>
          <span>Payment</span>
          <strong>${formatPaymentMethod(order.paymentMethod)}</strong>
        </div>
        <div>
          <span>Total</span>
          <strong>${formatMoney(order.total)}</strong>
        </div>
      </div>
      ${cancelHtml}
      <div class="summary-list">
        ${order.items.map(renderVisualOrderItemRow).join("")}
      </div>
    </article>
  `;
}

function loadDashboard() {
  const orderList = document.getElementById("orders");
  const orderCount = document.getElementById("dashboardOrderCount");
  const cartCount = document.getElementById("dashboardCartCount");
  const transitCount = document.getElementById("dashboardTransitCount");
  const deliveredCount = document.getElementById("dashboardDeliveredCount");

  if (!orderList) return;

  if (orderCount) orderCount.textContent = String(orders.length);
  if (cartCount) cartCount.textContent = String(cart.reduce((sum, item) => sum + (item.quantity || 1), 0));
  if (transitCount) transitCount.textContent = String(orders.filter((order) => order.status === "in_transit").length);
  if (deliveredCount) deliveredCount.textContent = String(orders.filter((order) => order.status === "delivered").length);

  const welcomeNode = document.getElementById("dashboardWelcome");
  if (welcomeNode && currentUser) {
    welcomeNode.textContent = `Orders for ${currentUser.fullName || currentUser.email}`;
  }

  if (!orders.length) {
    orderList.innerHTML = `<div class="empty-state">No orders yet. Finish checkout to start tracking deliveries.</div>`;
    refreshScrollReveals(orderList);
    return;
  }

  orderList.innerHTML = orders.map(renderCustomerOrderCard).join("");
  refreshScrollReveals(orderList);
}

async function cancelOrder(orderId) {
  const id = Number(orderId);
  if (Number.isNaN(id)) return;

  const target = orders.find((order) => Number(order.id) === id);
  if (!target) return;

  if (!isCancellableOrderStatus(target.status)) {
    alert("This order can no longer be cancelled once it is in transit.");
    return;
  }

  if (!confirm("Cancel this order?")) return;

  if (currentUser) {
    try {
      await apiRequest("/api/orders/cancel", {
        method: "POST",
        body: JSON.stringify({ orderId: id })
      });
      const orderPayload = await apiRequest("/api/orders", { method: "GET" });
      orders = (orderPayload.orders || []).map(normalizeOrder);
      loadDashboard();
    } catch (error) {
      alert(error.message || "Unable to cancel order.");
    }
    return;
  }

  target.status = "cancelled";
  await save();
  loadDashboard();
}

function renderAdminOrders() {
  const container = document.getElementById("adminOrders");
  if (!container) return;

  if (!adminOrders.length) {
    container.innerHTML = `<div class="empty-state">No customer orders yet.</div>`;
    refreshScrollReveals(container);
    return;
  }

  container.innerHTML = adminOrders
    .map(
      (order) => `
        <article class="order-card admin-order-card">
          <div class="admin-order-header">
            <div>
              <strong>Order #${String(order.id).padStart(6, "0")}</strong>
              <p class="card-copy">${order.customerName || order.customerEmail || "Customer"} â€¢ ${formatOrderDate(order.createdAt)}</p>
            </div>
            <span class="status-pill status-${order.status.replace(/_/g, "-")}">${statusLabel(order.status)}</span>
          </div>
          <div class="admin-order-actions">
            <select id="adminStatus${order.id}" class="sort-select admin-select">
              ${orderStatusSteps.map((step) => `<option value="${step.value}" ${step.value === order.status ? "selected" : ""}>${step.label}</option>`).join("")}
            </select>
            <button type="button" class="btn btn-primary admin-action-btn" onclick="updateOrderStatus(${order.id})">Save Status</button>
          </div>
          <div class="order-metrics">
            <div>
              <span>Payment</span>
              <strong>${formatPaymentMethod(order.paymentMethod)}</strong>
            </div>
            <div>
              <span>Total</span>
              <strong>${formatMoney(order.total)}</strong>
            </div>
          </div>
          <div class="summary-list">
            ${order.items.map(renderVisualOrderItemRow).join("")}
          </div>
        </article>
      `
    )
    .join("");

  refreshScrollReveals(container);
}

function renderAdminInventory() {
  const container = document.getElementById("adminInventory");
  if (!container) return;

  if (!products.length) {
    container.innerHTML = `<div class="empty-state">No inventory loaded.</div>`;
    refreshScrollReveals(container);
    return;
  }

  container.innerHTML = [...products]
    .reverse()
    .slice(0, 12)
    .map(
      (product) => `
        <article class="inventory-item ${availableStockForProduct(product) <= 0 ? "is-empty" : ""}">
          <img src="${resolveProductImage(product)}" alt="${product.name}">
          <div class="inventory-item-body">
            <strong>${product.name}</strong>
            <p>${product.category} • ${formatMoney(product.price)}</p>
            <p class="inventory-stock-line">Stock: <strong>${availableStockForProduct(product)}</strong></p>
            <div class="inventory-stock-controls">
              <input id="adminStockInput${product.id}" type="number" min="0" step="1" value="${availableStockForProduct(product)}">
              <button type="button" class="btn btn-secondary btn-small" onclick="setAdminProductStock(${product.id})">Set</button>
              <button type="button" class="btn btn-primary btn-small" onclick="addAdminProductStock(${product.id}, 5)">+5</button>
            </div>
          </div>
        </article>
      `
    )
    .join("");

  refreshScrollReveals(container);
}

function updateProductInState(productPayload) {
  if (!productPayload) return null;

  const normalized = normalizeProduct(productPayload);
  const index = products.findIndex((item) => Number(item.id) === Number(normalized.id));
  if (index === -1) {
    products.push(normalized);
  } else {
    products[index] = normalized;
  }

  syncCartWithCurrentStock();
  refreshNewReleaseIds(10);
  updateCartCount();
  renderProducts(currentFilter, currentSearch, currentSort);
  renderNewReleaseSections();
  renderTopSellerSections();
  renderProductDetailPage();
  renderCart();
  renderCheckout();
  renderAdminInventory();
  updateAdminOverview();
  return normalized;
}

async function setAdminProductStock(productId) {
  const input = document.getElementById(`adminStockInput${productId}`);
  if (!input) return;

  const stock = Math.floor(Number(input.value || 0));
  if (!Number.isFinite(stock) || stock < 0) {
    alert("Stock must be zero or greater.");
    return;
  }

  try {
    const payload = await apiRequest("/api/admin/products/stock", {
      method: "POST",
      body: JSON.stringify({ productId, stock })
    });
    clearAdminStockOverride(productId);
    updateProductInState(payload.product);
  } catch (error) {
    if (shouldUseLocalStockFallback(error)) {
      const updatedLocally = applyLocalAdminStock(productId, stock);
      if (updatedLocally) {
        alert("Stock updated locally on this browser.");
        return;
      }
    }
    alert(adminStockServerMessage(error));
  }
}

async function addAdminProductStock(productId, amount = 1) {
  const addStock = Math.floor(Number(amount || 0));
  if (!Number.isFinite(addStock) || addStock === 0) return;

  try {
    const payload = await apiRequest("/api/admin/products/stock", {
      method: "POST",
      body: JSON.stringify({ productId, addStock })
    });
    clearAdminStockOverride(productId);
    updateProductInState(payload.product);
  } catch (error) {
    if (shouldUseLocalStockFallback(error)) {
      const current = availableStockForId(productId);
      const nextStock = Math.max(0, current + addStock);
      const updatedLocally = applyLocalAdminStock(productId, nextStock);
      if (updatedLocally) {
        alert("Stock updated locally on this browser.");
        return;
      }
    }
    alert(adminStockServerMessage(error));
  }
}

function updateAdminOverview() {
  const orderCount = document.getElementById("adminOrderCount");
  const productCount = document.getElementById("adminProductCount");
  const waitingCount = document.getElementById("adminWaitingCount");
  const deliveredCount = document.getElementById("adminDeliveredCount");

  if (orderCount) orderCount.textContent = String(adminOrders.length);
  if (productCount) productCount.textContent = String(products.length);
  if (waitingCount) waitingCount.textContent = String(adminOrders.filter((order) => order.status === "waiting_carrier").length);
  if (deliveredCount) deliveredCount.textContent = String(adminOrders.filter((order) => order.status === "delivered").length);

  const welcomeNode = document.getElementById("adminWelcome");
  if (welcomeNode && currentUser) {
    welcomeNode.textContent = "Admin Panel";
  }
}

async function loadAdminDashboard() {
  if (!currentUser || currentUser.role !== "admin") return;

  const payload = await apiRequest("/api/admin/orders", { method: "GET" });
  adminOrders = (payload.orders || []).map(normalizeOrder);
  updateAdminOverview();
  renderAdminOrders();
  renderAdminInventory();
}

async function updateOrderStatus(orderId) {
  const select = document.getElementById(`adminStatus${orderId}`);
  if (!select) return;

  await apiRequest("/api/admin/orders/status", {
    method: "POST",
    body: JSON.stringify({ orderId, status: select.value })
  });

  await loadAdminDashboard();
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Unable to read image file."));
    reader.readAsDataURL(file);
  });
}

async function submitAdminProduct(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const feedback = document.getElementById("adminProductFeedback");
  const submitButton = form.querySelector('button[type="submit"]');
  const imageFile = document.getElementById("adminProductImage")?.files?.[0];

  const payload = {
    name: document.getElementById("adminProductName")?.value.trim(),
    category: document.getElementById("adminProductCategory")?.value.trim(),
    tier: document.getElementById("adminProductTier")?.value.trim(),
    price: Number(document.getElementById("adminProductPrice")?.value || 0),
    stock: Number(document.getElementById("adminProductStock")?.value || 0),
    badge: document.getElementById("adminProductBadge")?.value.trim(),
    accent: document.getElementById("adminProductAccent")?.value.trim(),
    desc: document.getElementById("adminProductDesc")?.value.trim()
  };

  if (imageFile) {
    payload.imageData = await readFileAsDataUrl(imageFile);
  }

  try {
    if (submitButton) submitButton.disabled = true;
    const created = await apiRequest("/api/admin/products", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    if (feedback) feedback.textContent = "Product uploaded.";
    form.reset();
    updateProductInState(created.product);
  } catch (error) {
    if (feedback) feedback.textContent = error.message;
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

function setContactFeedback(node, message, { tone = "neutral" } = {}) {
  if (!node) return;
  node.classList.remove("is-success", "is-error");
  if (tone === "success") node.classList.add("is-success");
  if (tone === "error") node.classList.add("is-error");
  node.textContent = message || "";
}

function submitContactForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submitButton = form?.querySelector('button[type="submit"]');
  const feedback = document.getElementById("contactFeedback");

  const firstName = document.getElementById("contactFirstName")?.value.trim() || "";
  const lastName = document.getElementById("contactLastName")?.value.trim() || "";
  const email = document.getElementById("contactEmail")?.value.trim() || "";
  const subject = document.getElementById("contactSubject")?.value.trim() || "";
  const message = document.getElementById("contactMessage")?.value.trim() || "";

  if (!firstName || !email || !message) {
    setContactFeedback(feedback, "Please fill in all required fields (First Name, Email, Message).", { tone: "error" });
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setContactFeedback(feedback, "Please enter a valid email address.", { tone: "error" });
    return;
  }

  try {
    if (submitButton) submitButton.disabled = true;

    const payload = {
      firstName,
      lastName,
      email,
      subject,
      message,
      createdAt: new Date().toISOString()
    };

    const existing = JSON.parse(localStorage.getItem("contact_messages") || "[]");
    existing.unshift(payload);
    localStorage.setItem("contact_messages", JSON.stringify(existing.slice(0, 30)));

    form.reset();
    setContactFeedback(feedback, "Message sent. Thanks - we'll get back to you soon!", { tone: "success" });
  } catch (error) {
    setContactFeedback(feedback, "Unable to submit right now. Please try again.", { tone: "error" });
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

async function loadStorefront() {
  try {
    const payload = await apiRequest("/api/products", { method: "GET" });
    products = (payload.products || []).map(normalizeProduct);
  } catch (error) {
    try {
      const local = await fetch("products.json", { cache: "no-store" });
      const localPayload = await local.json();
      products = (Array.isArray(localPayload) ? localPayload : (localPayload.products || [])).map(normalizeProduct);
      console.warn("API unavailable; loaded products from products.json.");
    } catch (localError) {
      console.error("Failed to load products from server:", error);
      console.error("Failed to load products.json:", localError);
      return;
    }
  }

  applyAdminStockOverrides();
  refreshNewReleaseIds(10);
  loadCatalogState();

  // GitHub Pages is a static host, so the Node API won't exist there.
  if (isGithubPagesHost()) {
    const oldUser = currentUser;
    currentUser = null;
    await syncUserData(oldUser, null);
    applyRoleUI();
    window.__authResolved = true;
    window.dispatchEvent(new Event("auth:ready"));
  } else {
    const authReady = await loadAuthState();
    if (authReady === false) {
      return;
    }
  }

  syncCartWithCurrentStock();

  if (isAdminPage()) {
    await loadAdminDashboard();
  } else {
    loadDashboard();
  }

  renderHeroTiles();
  updateCartCount();
  renderProducts(currentFilter, currentSearch, currentSort);
  renderNewReleaseSections();
  renderTopSellerSections();
  renderProductDetailPage();
  loadBuilder();
  renderCart();
  renderCheckout();
  renderAdminInventory();
  applyRoleUI();
}

document.addEventListener("DOMContentLoaded", async () => {
  initAuthGateLinks();
  initPageTransitions();
  initForgeMobileNav();
  initBackgroundParticles();
  initPromoCarousels();
  initScrollReveals();
  await loadStorefront();
  refreshScrollReveals(document);
  initTeamCards();

  document.querySelectorAll(".filter-chip").forEach((chip) => {
    chip.addEventListener("click", () => setActiveFilter(chip.dataset.filter || "all"));
  });

  document.querySelectorAll("[data-product-search]").forEach((input) => {
    input.addEventListener("input", (event) => {
      renderProducts(currentFilter, event.target.value, currentSort);
    });
  });

  document.querySelectorAll("[data-sort-select]").forEach((select) => {
    select.addEventListener("change", (event) => {
      renderProducts(currentFilter, currentSearch, event.target.value);
    });
  });

  document.getElementById("adminProductForm")?.addEventListener("submit", submitAdminProduct);
  document.getElementById("contactForm")?.addEventListener("submit", submitContactForm);
  initForgotPasswordFromQuery();
});

window.addEventListener("hashchange", () => {
  renderPrimaryNavs();
  closeForgeMobileNav();
});

function extractPageFromHref(href) {
  if (!href) return "";

  try {
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin) return "";
    return (url.pathname.split("/").pop() || "").toLowerCase();
  } catch {
    return "";
  }
}

function ensureAuthModal() {
  if (!document.body) return;

  const existing = document.getElementById("authModal");
  if (existing) {
    if (existing.parentElement !== document.body) {
      document.body.appendChild(existing);
    }
    return;
  }

  const host = document.createElement("div");
  host.innerHTML = `
    <div id="authModal" class="forge-modal-backdrop" aria-hidden="true" onclick="if(event.target===this) closeAuthModal()">
      <div class="forge-modal">
        <button class="forge-modal-close" onclick="closeAuthModal()" aria-label="Close modal">&times;</button>

        <div id="modalViewPromo" class="forge-modal-content active">
          <div class="forge-modal-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 11V7a4 4 0 0 1 8 0v4m-8 0H4v10h16V11H12z"/>
            </svg>
          </div>
          <h2>Unlock the Full Forge</h2>
          <p>Sign in or create an account to customize parts, save builds, and access member-only pricing.</p>
          <div class="forge-modal-actions">
            <button onclick="switchToAuthView('login')" class="forge-btn-solid">Sign In</button>
            <button onclick="switchToAuthView('register')" class="forge-btn-outline">Create Account</button>
          </div>
        </div>

        <div id="modalViewLogin" class="forge-modal-content">
          <p class="section-label">Account access</p>
          <h2>Sign In</h2>
          <p>Enter your details to enter the system.</p>
          <form onsubmit="handleModalLogin(event)" class="forge-modal-form">
            <label class="forge-form-field">
              <span>Email Address</span>
              <input type="email" id="modalLoginEmail" placeholder="you@example.com" required>
            </label>
            <label class="forge-form-field">
              <span>Password</span>
              <div class="forge-input-wrapper">
                <input type="password" id="modalLoginPass" placeholder="Enter password" required>
                <button type="button" class="forge-eye-toggle" onclick="togglePasswordVisibility(this)" aria-label="Toggle password visibility">
                  <svg class="eye-open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  <svg class="eye-closed" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none;"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24L1 1l22 22-2.12 2.12-2.12-2.12z"/></svg>
                </button>
              </div>
            </label>
            <button type="submit" class="forge-btn-solid">Sign In</button>
          </form>
          <div class="forge-modal-footer">
            Forgot password? <button type="button" onclick="switchToAuthView('forgot')">Reset now</button><br>
            New here? <button onclick="switchToAuthView('register')">Create Account</button>
          </div>
        </div>

        <div id="modalViewForgot" class="forge-modal-content">
          <p class="section-label">Password recovery</p>
          <h2>Reset Password</h2>
          <p>Enter your email and choose a new password.</p>
          <form onsubmit="handleModalForgotPassword(event)" class="forge-modal-form">
            <label class="forge-form-field">
              <span>Email Address</span>
              <input type="email" id="modalForgotEmail" placeholder="you@example.com" required>
            </label>
            <label class="forge-form-field">
              <span>New Password</span>
              <div class="forge-input-wrapper">
                <input type="password" id="modalForgotPass" placeholder="New password" required>
                <button type="button" class="forge-eye-toggle" onclick="togglePasswordVisibility(this)" aria-label="Toggle password visibility">
                  <svg class="eye-open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  <svg class="eye-closed" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none;"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24L1 1l22 22-2.12 2.12-2.12-2.12z"/></svg>
                </button>
              </div>
            </label>
            <label class="forge-form-field">
              <span>Confirm Password</span>
              <div class="forge-input-wrapper">
                <input type="password" id="modalForgotConfirm" placeholder="Repeat new password" required>
                <button type="button" class="forge-eye-toggle" onclick="togglePasswordVisibility(this)" aria-label="Toggle password visibility">
                  <svg class="eye-open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  <svg class="eye-closed" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none;"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24L1 1l22 22-2.12 2.12-2.12-2.12z"/></svg>
                </button>
              </div>
            </label>
            <button type="submit" class="forge-btn-solid">Reset Password</button>
          </form>
          <p id="modalForgotFeedback" class="auth-feedback"></p>
          <div class="forge-modal-footer">
            Remembered your password? <button type="button" onclick="switchToAuthView('login')">Back to Sign In</button>
          </div>
        </div>

        <div id="modalViewRegister" class="forge-modal-content">
          <p class="section-label">Join the forge</p>
          <h2>Create Account</h2>
          <p>Start your journey with a new profile.</p>
          <form onsubmit="handleModalRegister(event)" class="forge-modal-form">
            <label class="forge-form-field">
              <span>Full Name</span>
              <input type="text" id="modalRegisterName" placeholder="John Doe" required>
            </label>
            <label class="forge-form-field">
              <span>Email Address</span>
              <input type="email" id="modalRegisterEmail" placeholder="you@example.com" required>
            </label>
            <label class="forge-form-field">
              <span>Password</span>
              <div class="forge-input-wrapper">
                <input type="password" id="modalRegisterPass" placeholder="Create a password" required>
                <button type="button" class="forge-eye-toggle" onclick="togglePasswordVisibility(this)" aria-label="Toggle password visibility">
                  <svg class="eye-open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  <svg class="eye-closed" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none;"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24L1 1l22 22-2.12 2.12-2.12-2.12z"/></svg>
                </button>
              </div>
            </label>
            <label class="forge-form-field">
              <span>Confirm Password</span>
              <div class="forge-input-wrapper">
                <input type="password" id="modalRegisterConfirm" placeholder="Repeat password" required>
                <button type="button" class="forge-eye-toggle" onclick="togglePasswordVisibility(this)" aria-label="Toggle password visibility">
                  <svg class="eye-open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  <svg class="eye-closed" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none;"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24L1 1l22 22-2.12 2.12-2.12-2.12z"/></svg>
                </button>
              </div>
            </label>
            <button type="submit" class="forge-btn-solid">Create Account</button>
          </form>
          <div class="forge-modal-footer">
            Already registered? <button onclick="switchToAuthView('login')">Sign In</button>
          </div>
        </div>

      </div>
    </div>
  `;

  const modal = host.firstElementChild;
  if (!modal) return;
  document.body.appendChild(modal);
}

function initAuthGateLinks() {
  if (window._authGateLinksReady) return;

  const authGatePages = new Set(["dashboard.html", "admin.html", "admin-products.html", "login.html", "register.html", "profile.html"]);
  const postAuthRedirectPages = new Set(["dashboard.html", "admin.html", "admin-products.html", "profile.html"]);

  document.addEventListener(
    "click",
    (event) => {
      const link = event.target.closest("a[href]");
      if (!link) return;

      if (event.defaultPrevented) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (link.dataset.noAuthModal !== undefined) return;

      const href = link.getAttribute("href") || "";
      if (!href || href === "#" || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) {
        return;
      }

      const page = extractPageFromHref(link.href);
      if (!authGatePages.has(page)) return;

      const authView = page === "dashboard.html" ? "login" : "promo";

      if (window.__authResolved) {
        if (currentUser) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        window.__authModalReturnTo = postAuthRedirectPages.has(page) ? link.href : "";
        document.body.classList.remove("page-leaving");
        openAuthModal(authView);
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();

      const targetHref = link.href;
      window.__authModalReturnTo = postAuthRedirectPages.has(page) ? targetHref : "";
      document.body.classList.remove("page-leaving");
      openAuthModal(authView);
      window.addEventListener(
        "auth:ready",
        () => {
          if (currentUser) {
            closeAuthModal();
            navigateWithTransition(targetHref);
            return;
          }

          const modal = document.getElementById("authModal");
          const isOpen = Boolean(modal?.classList.contains("active"));
          if (isOpen) {
            switchToAuthView(authView);
          }
        },
        { once: true }
      );
    },
    true
  );

  window._authGateLinksReady = true;
}

function openAuthModal(viewName = "promo") {
  ensureAuthModal();
  const modal = document.getElementById('authModal');
  if (modal) {
    if (modal.parentElement !== document.body) {
      document.body.appendChild(modal);
    }
    document.body.classList.remove("page-leaving");
    lockModalScroll();
    switchToAuthView(viewName);
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');

    window.setTimeout(() => {
      if (viewName === "login") {
        safeFocus(document.getElementById("modalLoginEmail"));
      } else if (viewName === "forgot") {
        safeFocus(document.getElementById("modalForgotEmail"));
      } else if (viewName === "register") {
        safeFocus(document.getElementById("modalRegisterName"));
      }
    }, 50);

  }
}

function closeAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal) {
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    unlockModalScroll();
  }
  window.__authModalReturnTo = "";
}

function ensureTeamModal() {
  if (!document.body) return;

  const existing = document.getElementById("teamModal");
  if (existing) {
    if (existing.parentElement !== document.body) {
      document.body.appendChild(existing);
    }
    return;
  }

  const host = document.createElement("div");
  host.innerHTML = `
    <div id="teamModal" class="forge-modal-backdrop" aria-hidden="true">
      <div class="forge-modal" role="dialog" aria-modal="true" aria-labelledby="teamModalName">
        <button type="button" class="forge-modal-close" data-team-modal-close aria-label="Close modal">&times;</button>
        <div class="team-modal-body">
          <p class="section-label">Developer</p>
          <img id="teamModalAvatar" class="team-avatar team-modal-avatar" src="" alt="" loading="lazy" style="display:none;">
          <h2 id="teamModalName">Developer</h2>
          <p id="teamModalRole" class="team-modal-role" style="display:none;"></p>
          <span id="teamModalSection" class="team-section" style="display:none;"></span>
        </div>
      </div>
    </div>
  `.trim();

  const modal = host.firstElementChild;
  if (!modal) return;
  document.body.appendChild(modal);

  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeTeamModal();
  });

  modal.querySelector("[data-team-modal-close]")?.addEventListener("click", closeTeamModal);

  if (!window._teamModalEscReady) {
    window._teamModalEscReady = true;
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      const node = document.getElementById("teamModal");
      if (!node?.classList.contains("active")) return;
      closeTeamModal();
    });
  }
}

function openTeamModal({ name, role, section, avatarUrl } = {}) {
  ensureTeamModal();
  const modal = document.getElementById("teamModal");
  if (!modal) return;

  const safeName = String(name || "").trim() || "Developer";
  const safeRole = String(role || "").trim();
  const safeSection = String(section || "").trim();
  const safeAvatar = String(avatarUrl || "").trim();

  const nameNode = modal.querySelector("#teamModalName");
  if (nameNode) nameNode.textContent = safeName;

  const roleNode = modal.querySelector("#teamModalRole");
  if (roleNode) {
    roleNode.textContent = safeRole;
    roleNode.style.display = safeRole ? "" : "none";
  }

  const sectionNode = modal.querySelector("#teamModalSection");
  if (sectionNode) {
    sectionNode.textContent = safeSection;
    sectionNode.style.display = safeSection ? "inline-flex" : "none";
  }

  const avatarNode = modal.querySelector("#teamModalAvatar");
  if (avatarNode) {
    if (safeAvatar) {
      avatarNode.src = safeAvatar;
      avatarNode.alt = `${safeName} portrait`;
      avatarNode.style.display = "";
    } else {
      avatarNode.removeAttribute("src");
      avatarNode.alt = "";
      avatarNode.style.display = "none";
    }
  }

  document.body.classList.remove("page-leaving");
  lockModalScroll();
  modal.classList.add("active");
  modal.setAttribute("aria-hidden", "false");

  window.setTimeout(() => {
    safeFocus(modal.querySelector("[data-team-modal-close]"));
  }, 50);
}

function closeTeamModal() {
  const modal = document.getElementById("teamModal");
  if (!modal) return;

  modal.classList.remove("active");
  modal.setAttribute("aria-hidden", "true");
  unlockModalScroll();

  const returnTo = window.__teamModalReturnFocus;
  window.__teamModalReturnFocus = null;
  safeFocus(returnTo);
}

function initTeamCards() {
  document.querySelectorAll("[data-team-card]").forEach((card) => {
    if (!card || card.dataset.teamBound === "1") return;
    card.dataset.teamBound = "1";

    card.addEventListener("click", () => {
      window.__teamModalReturnFocus = card;

      openTeamModal({
        name: card.dataset.teamName,
        role: card.dataset.teamRole,
        section: card.dataset.teamSection,
        avatarUrl: card.dataset.teamAvatar
      });
    });
  });
}

function safeFocus(element) {
  if (!element || typeof element.focus !== "function") return;
  try {
    element.focus({ preventScroll: true });
  } catch {
    element.focus();
  }
}

function getFieldErrorNode(input) {
  if (!input) return null;
  const field = input.closest?.(".forge-form-field");
  if (!field) return null;

  let node = field.querySelector(".forge-field-error");
  if (!node) {
    node = document.createElement("div");
    node.className = "forge-field-error";
    node.setAttribute("role", "alert");
    node.setAttribute("aria-live", "polite");
    field.appendChild(node);
  }
  return node;
}

function setFieldError(input, message) {
  if (!input) return;
  const node = getFieldErrorNode(input);
  const text = String(message || "").trim();

  if (text) {
    input.classList.add("is-invalid");
    input.setAttribute("aria-invalid", "true");
    if (node) node.textContent = text;
    return;
  }

  input.classList.remove("is-invalid");
  input.removeAttribute("aria-invalid");
  if (node) node.textContent = "";
}

function bindCheckoutValidation() {
  const emailNode = document.getElementById("checkoutEmailDisplay");
  if (emailNode && !emailNode.dataset.validationBound) {
    emailNode.dataset.validationBound = "1";

    emailNode.addEventListener("input", () => {
      if (!emailNode.classList.contains("is-invalid")) return;
      if (isValidEmailAddress(emailNode.value)) {
        setFieldError(emailNode, "");
      }
    });

    emailNode.addEventListener("blur", () => {
      if (emailNode.disabled) return;
      const value = String(emailNode.value || "").trim();
      if (!value) {
        setFieldError(emailNode, "");
        return;
      }
      if (!isValidEmailAddress(value)) {
        setFieldError(emailNode, "Please provide a valid email address.");
      } else {
        setFieldError(emailNode, "");
      }
    });
  }

  const nameNode = document.getElementById("checkoutNameDisplay");
  if (nameNode && !nameNode.dataset.validationBound) {
    nameNode.dataset.validationBound = "1";
    nameNode.addEventListener("input", () => {
      if (!nameNode.classList.contains("is-invalid")) return;
      if (String(nameNode.value || "").trim()) {
        setFieldError(nameNode, "");
      }
    });
  }

  const addressNode = document.getElementById("checkoutAddressInput");
  if (addressNode && !addressNode.dataset.validationBound) {
    addressNode.dataset.validationBound = "1";

    addressNode.addEventListener("input", () => {
      if (!addressNode.classList.contains("is-invalid")) return;
      const message = deliveryAddressError(addressNode.value, { required: true });
      setFieldError(addressNode, message);
    });

    addressNode.addEventListener("blur", () => {
      if (addressNode.disabled) return;
      const value = String(addressNode.value || "").trim();
      if (!value) {
        setFieldError(addressNode, "");
        return;
      }
      const message = deliveryAddressError(value, { required: false });
      setFieldError(addressNode, message);
    });
  }

  const contactNode = document.getElementById("checkoutContactInput");
  if (contactNode && !contactNode.dataset.validationBound) {
    contactNode.dataset.validationBound = "1";

    contactNode.addEventListener("input", () => {
      if (!contactNode.classList.contains("is-invalid")) return;
      const digits = digitsOnly(contactNode.value);
      if (digits.length >= 10 && digits.length <= 15) {
        setFieldError(contactNode, "");
      }
    });

    contactNode.addEventListener("blur", () => {
      if (contactNode.disabled) return;
      const digits = digitsOnly(contactNode.value);
      if (!digits) {
        setFieldError(contactNode, "");
        return;
      }
      if (digits.length < 10 || digits.length > 15) {
        setFieldError(contactNode, "Please provide a valid contact number.");
      } else {
        setFieldError(contactNode, "");
      }
    });
  }
}

function lockModalScroll() {
  if (window.__modalScrollLocked) return;

  const scrollbarGap = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
  window.__modalScrollLocked = {
    bodyOverflow: document.body.style.overflow,
    htmlOverflow: document.documentElement.style.overflow,
    bodyPaddingRight: document.body.style.paddingRight
  };

  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";
  if (scrollbarGap) {
    document.body.style.paddingRight = `${scrollbarGap}px`;
  }
}

function unlockModalScroll() {
  const state = window.__modalScrollLocked;
  if (!state) return;

  document.body.style.overflow = state.bodyOverflow || "";
  document.documentElement.style.overflow = state.htmlOverflow || "";
  document.body.style.paddingRight = state.bodyPaddingRight || "";
  window.__modalScrollLocked = null;
}

function switchToAuthView(viewName) {
  // Hide all views
  document.querySelectorAll('.forge-modal-content').forEach(view => {
    view.classList.remove('active');
  });
  
  // Show target view
  const safeName = String(viewName || "promo").trim();
  const normalized = safeName ? safeName.charAt(0).toUpperCase() + safeName.slice(1) : "Promo";
  const targetId = 'modalView' + normalized;
  const fallbackId = "modalViewPromo";
  const targetView = document.getElementById(targetId) || document.getElementById(fallbackId);
  targetView?.classList.add('active');
}

async function handleModalLogin(event) {
  event.preventDefault();
  const email = document.getElementById('modalLoginEmail').value.trim();
  const pass = document.getElementById('modalLoginPass').value.trim();
  const submitBtn = event.target.querySelector('button[type="submit"]');

  if (!email || !pass) return;

  try {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing In...';
    
    const payload = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password: pass })
    });

    const oldUser = currentUser;
    currentUser = payload.user || null;
    await syncUserData(oldUser, currentUser);

    const redirect = window.__authModalReturnTo;
    window.__authModalReturnTo = "";
    const nextTarget = redirect && !["login.html", "register.html"].includes(extractPageFromHref(redirect)) ? redirect : "";
    if (nextTarget) {
      navigateWithTransition(nextTarget);
    } else {
      closeAuthModal();
      updateAuthUI();
      applyRoleUI();
    }
  } catch (error) {
    const message = error.message === "Failed to fetch" ? accountServerMessage() : error.message;
    alert(message);
    submitBtn.disabled = false;
    submitBtn.textContent = 'Sign In';
  }
}

async function handleModalRegister(event) {
  event.preventDefault();
  const fullName = document.getElementById('modalRegisterName').value.trim();
  const email = document.getElementById('modalRegisterEmail').value.trim();
  const pass = document.getElementById('modalRegisterPass').value.trim();
  const confirmPass = document.getElementById('modalRegisterConfirm').value.trim();
  const submitBtn = event.target.querySelector('button[type="submit"]');

  if (!fullName || !email || !pass || !confirmPass) {
    alert("Please fill in all fields.");
    return;
  }

  if (pass !== confirmPass) {
    alert("Passwords do not match.");
    return;
  }

  try {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating Account...';
    
    const payload = await apiRequest("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ fullName, email, password: pass })
    });

    const oldUser = currentUser;
    currentUser = payload.user || null;
    await syncUserData(oldUser, currentUser);

    const redirect = window.__authModalReturnTo;
    window.__authModalReturnTo = "";
    const nextTarget = redirect && !["login.html", "register.html"].includes(extractPageFromHref(redirect)) ? redirect : "";
    if (nextTarget) {
      navigateWithTransition(nextTarget);
    } else {
      closeAuthModal();
      updateAuthUI();
      applyRoleUI();
    }
  } catch (error) {
    const message = error.message === "Failed to fetch" ? accountServerMessage() : error.message;
    alert(message);
    submitBtn.disabled = false;
    submitBtn.textContent = 'Create Account';
  }
}

async function handleModalForgotPassword(event) {
  event.preventDefault();
  const emailInput = document.getElementById("modalForgotEmail");
  const passInput = document.getElementById("modalForgotPass");
  const confirmInput = document.getElementById("modalForgotConfirm");
  const loginEmailInput = document.getElementById("modalLoginEmail");
  const feedback = document.getElementById("modalForgotFeedback");
  const submitBtn = event.target.querySelector('button[type="submit"]');
  if (!emailInput || !passInput || !confirmInput || !submitBtn) return;

  const email = emailInput.value.trim();
  const password = passInput.value.trim();
  const confirm = confirmInput.value.trim();
  if (!isValidEmailAddress(email)) {
    setAuthFeedback(feedback, "Please enter a valid email address.", { tone: "error" });
    safeFocus(emailInput);
    return;
  }
  if (password.length < 6) {
    setAuthFeedback(feedback, "Password must be at least 6 characters long.", { tone: "error" });
    safeFocus(passInput);
    return;
  }
  if (password !== confirm) {
    setAuthFeedback(feedback, "Passwords do not match.", { tone: "error" });
    safeFocus(confirmInput);
    return;
  }

  try {
    submitBtn.disabled = true;
    submitBtn.textContent = "Resetting...";
    const payload = await apiRequest("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email, password, confirmPassword: confirm })
    });

    passInput.value = "";
    confirmInput.value = "";
    setAuthFeedback(feedback, payload.message || "Password reset successful. Please sign in.", { tone: "success" });
    switchToAuthView("login");
    if (loginEmailInput) {
      loginEmailInput.value = email;
      safeFocus(loginEmailInput);
    }
  } catch (error) {
    setAuthFeedback(feedback, error.message || "Unable to reset password.", { tone: "error" });
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Reset Password";
  }
}

async function handleModalResetPassword(event) {
  await handleModalForgotPassword(event);
}

function togglePasswordVisibility(button) {
  const wrapper = button.closest('.forge-input-wrapper');
  const input = wrapper.querySelector('input');
  const openEye = button.querySelector('.eye-open');
  const closedEye = button.querySelector('.eye-closed');

  if (input.type === 'password') {
    input.type = 'text';
    openEye.style.display = 'none';
    closedEye.style.display = 'block';
  } else {
    input.type = 'password';
    openEye.style.display = 'block';
    closedEye.style.display = 'none';
  }
}

