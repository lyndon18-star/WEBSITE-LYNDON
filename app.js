let products = [];

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
const orderStatusSteps = [
  { value: "placed", label: "Order placed" },
  { value: "waiting_carrier", label: "Waiting for carrier" },
  { value: "in_transit", label: "In transit" },
  { value: "delivered", label: "Order delivered" }
];

function normalizeStatus(value) {
  const map = {
    completed: "delivered",
    waiting_for_carrier: "waiting_carrier",
    waiting: "waiting_carrier",
    transit: "in_transit"
  };
  const normalized = map[String(value || "").trim().toLowerCase()] || String(value || "").trim().toLowerCase();
  return orderStatusSteps.some((step) => step.value === normalized) ? normalized : "placed";
}

function normalizePaymentMethod(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "card" ? "card" : "cash_on_delivery";
}

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
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

function normalizeProduct(product) {
  return {
    ...product,
    id: Number(product.id),
    price: Number(product.price || 0),
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
  const userIcons = document.querySelectorAll('.nav-icon[title="Account"], .nav-icon[title^="Signed in"]');
  
  userIcons.forEach(icon => {
    if (currentUser) {
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
          ${currentUser.role !== "admin" ? `<li><button type="button" data-href="profile.html">Profile Settings</button></li>` : ""}
          <li><button type="button" data-href="${currentUser.role === "admin" ? "admin.html" : "dashboard.html"}">${currentUser.role === "admin" ? "Admin Panel" : "My Orders"}</button></li>
          <li><button type="button" data-href="shop.html">Shop</button></li>
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
    } else {
      icon.title = "Account";
      icon.classList.remove('logged-in', 'dropdown-open');
      const dropdown = icon.querySelector('.account-dropdown');
      if (dropdown) icon.removeChild(dropdown);
      if (icon.tagName === 'A') {
        icon.onclick = null;
      }
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
  if (!path.startsWith("http")) {
    const isLiveServer = window.location.port === "5501";
    if (isLiveServer) {
      // Use the same hostname as the page (127.0.0.1 vs localhost) so SameSite cookies work.
      const apiOrigin = `${window.location.protocol}//${window.location.hostname}:3000`;
      targetPath = `${apiOrigin}${path}`;
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
  return "Account server unavailable. Start the app with `node server.js` and open http://127.0.0.1:3000.";
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
  if (page === "shop.html") return "shop";
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
  return `₱${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
  if (order.status === "delivered") {
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
    grid.innerHTML = visible
      .map(
        (product) => {
          const productAction = isAdminUser()
            ? `<button type="button" disabled>Seller account</button>`
            : `<div style="display: flex; gap: 8px;">
                 <button style="flex: 1;" onclick="addCart(${product.id})">Add to cart</button>
                 <button style="flex: 1; background: var(--accent); color: var(--bg); border: none;" onclick="buyNow(${product.id})">Buy Now</button>
               </div>`;

          return `
          <article class="product-card" style="--product-glow:${productGlow(product.accent)}">
            <div class="product-media">
              <img class="product-image" src="${resolveProductImage(product)}" alt="${product.name}" loading="lazy">
            </div>
            <div>
              <small>${product.category}</small>
              <h3>${product.name}</h3>
              <p class="card-copy">${product.desc}</p>
            </div>
            <div>
              <span class="tag">${product.badge}</span>
              <div class="price-row">
                <span class="price">${formatMoney(product.price)}</span>
                <span class="card-copy">${product.tier.toUpperCase()} tier</span>
              </div>
              ${productAction}
            </div>
          </article>
        `;
        }
      )
      .join("");
  }

  syncCatalogControls();
  syncCatalogUrl();
}

function setActiveFilter(nextFilter) {
  currentFilter = normalizeFilter(nextFilter);
  renderProducts(currentFilter, currentSearch, currentSort);
}

function buyNow(productId) {
  const product = products.find((p) => p.id === productId);
  if (!product) return;
  sessionStorage.setItem("buyNowItem", JSON.stringify({ ...product, quantity: 1 }));
  navigateWithTransition("checkout.html");
}

async function addCart(id, qty = 1) {
  if (isAdminUser()) {
    navigateWithTransition("admin.html");
    return;
  }

  const product = products.find((item) => item.id === id);
  if (!product) return;
  
  const existing = cart.find(item => item.id === id);
  let newQty = qty;
  if (existing) {
    existing.quantity = (existing.quantity || 1) + qty;
    newQty = existing.quantity;
  } else {
    cart.push({ ...product, quantity: qty });
  }
  
  if (currentUser) {
    try {
      await apiRequest("/api/cart/add", {
        method: "POST",
        body: JSON.stringify({ productId: id, quantity: newQty })
      });
    } catch (error) {
      console.error("Failed to sync cart item to server:", error);
    }
  } else {
    save();
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
  
  const newQty = (existing.quantity || 1) + change;
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
      console.error("Failed to update cart item:", error);
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

    const nextQty = Math.max(1, (target.quantity || 1) + change);
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

    const nextQty = Math.max(1, (item.quantity || 1) + change);
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
  
  const addressNode = document.getElementById("checkoutAddressInput");
  const contactNode = document.getElementById("checkoutContactInput");
  const address = addressNode ? addressNode.value.trim() : "";
  const contactNumber = contactNode ? contactNode.value.trim() : "";

  if (!address || !contactNumber) {
    alert("Please provide both a delivery address and a contact number.");
    return;
  }
  
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
        body: JSON.stringify({ items: checkoutItems, paymentMethod, address, contactNumber, isBuyNow: !!(buyNowItemStr || buyNowArrayStr) })
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
      address,
      contactNumber,
      items: checkoutItems.map((item) => ({ ...item }))
    });
    if (!buyNowItemStr && !buyNowArrayStr) cart = [];
    save();
  }
  
  if (buyNowItemStr) sessionStorage.removeItem("buyNowItem");
  if (buyNowArrayStr) sessionStorage.removeItem("buyNowItemsArray");
  updateCartCount();
  navigateWithTransition(currentUser ? "dashboard.html" : "login.html");
}

function legacyRenderCart() {
  const container = document.getElementById("cartView");
  const totalSum = document.getElementById("cartTotalSum");
  if (!container) return;

  if (cart.length === 0) {
    container.innerHTML = `<div class="empty-state">Your cart is empty. Try adding some items from the shop!</div>`;
    if (totalSum) totalSum.textContent = "₱0.00";
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
    return;
  }

  let total = 0;
  container.innerHTML = cart
    .map((item) => {
      const qty = item.quantity || 1;
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
          </div>
          <div class="cart-qty-controls">
            <button onclick="updateCartQuantity(${item.id}, -1)">-</button>
            <span>${qty}</span>
            <button onclick="updateCartQuantity(${item.id}, 1)">+</button>
          </div>
        </div>
      `;
    })
    .join("");

  if (totalSum) totalSum.textContent = formatMoney(total);
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

  if (currentUser) {
    const nameDisplay = document.getElementById("checkoutNameDisplay");
    const emailDisplay = document.getElementById("checkoutEmailDisplay");
    const addressInput = document.getElementById("checkoutAddressInput");
    const contactInput = document.getElementById("checkoutContactInput");
    const codRadio = document.querySelector('input[name="payment"][value="cash_on_delivery"]');
    const cardRadio = document.querySelector('input[name="payment"][value="card"]');
    
    if (nameDisplay) nameDisplay.value = currentUser.fullName || "";
    if (emailDisplay) emailDisplay.value = currentUser.email || "";
    if (addressInput && !addressInput.value) addressInput.value = currentUser.address || "";
    if (contactInput && !contactInput.value) contactInput.value = currentUser.phone || "";
    if (currentUser.defaultPayment) {
      if (currentUser.defaultPayment === "card" && cardRadio) cardRadio.checked = true;
      if (currentUser.defaultPayment === "cash_on_delivery" && codRadio) codRadio.checked = true;
    }
  }

  if (checkoutItems.length === 0) {
    container.innerHTML = `<div class="empty-state">No items found for checkout.</div>`;
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
                  </div>
                </div>
                <div class="checkout-note-col">
                  <div class="add-note-link">Add note ></div>
                  <div class="cart-qty-controls checkout-qty" style="background: rgba(255,255,255,0.05); border-radius: 6px; padding: 4px 8px;">
                    <button type="button" onclick="updateCheckoutQuantity(${item.id}, -1)" ${qty <= 1 ? "disabled" : ""} style="${qty <= 1 ? "color: var(--muted); opacity: 0.6;" : ""}">-</button>
                    <span>${qty}</span>
                    <button type="button" onclick="updateCheckoutQuantity(${item.id}, 1)">+</button>
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

function loadBuilder() {
  const slotsContainer = document.getElementById("builderSlots");
  if (!slotsContainer) return;

  slotsContainer.innerHTML = BUILDER_CATEGORIES.map(category => {
    const categoryProducts = products.filter(p => p.category === category);
    if (!categoryProducts.length) return "";
    
    const options = categoryProducts
      .map(p => `<option value="${p.id}">${p.name} - ${formatMoney(p.price)}</option>`)
      .join("");
    
    return `
      <article class="builder-slot">
        <h3>Choose your ${category}</h3>
        <select class="builder-select" data-category="${category}" onchange="buildTotal()">
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
  let tierCounts = { mid: 0, high: 0, elite: 0 };
  let itemsHtml = "";

  selects.forEach(select => {
    const selectedProduct = products.find(p => String(p.id) === select.value);
    if (selectedProduct) {
      total += selectedProduct.price;
      if (tierCounts[selectedProduct.tier] !== undefined) {
        tierCounts[selectedProduct.tier]++;
      }
      
      itemsHtml += `<div class="forge-summary-row"><span><strong style="color:var(--accent);">${selectedProduct.category}:</strong> ${selectedProduct.name}</span><span>${formatMoney(selectedProduct.price)}</span></div>`;
    }
  });

  if (itemsList) {
    itemsList.innerHTML = itemsHtml || `<p style="color: var(--muted); font-size: 0.9rem;">No parts selected yet.</p>`;
  }

  totalNode.textContent = formatMoney(total);

  if (tierDisplay) {
    const totalParts = selects.length;
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

  const selects = document.querySelectorAll(".builder-select");
  const selectedIds = Array.from(selects)
    .map(select => Number(select.value))
    .filter(id => !Number.isNaN(id));

  if (!selectedIds.length) return;

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
      
      if (currentUser) {
        await apiRequest("/api/cart/add", {
          method: "POST",
          body: JSON.stringify({ productId: id, quantity: newQty })
        });
      } else {
        save();
      }
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
  
  selects.forEach(select => {
    const id = Number(select.value);
    if (!Number.isNaN(id)) {
      const product = products.find((item) => item.id === id);
      if (product) items.push({ ...product, quantity: 1 });
    }
  });

  if (!items.length) {
    alert("Please select at least one component.");
    return;
  }

  sessionStorage.setItem("buyNowItemsArray", JSON.stringify(items));
  navigateWithTransition("checkout.html");
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
  const activeIndex = orderStatusSteps.findIndex((step) => step.value === normalizeStatus(status));
  return `
    <div class="order-status-track">
      ${orderStatusSteps
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

function renderCustomerOrderCard(order) {
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
      <div class="summary-list">
        ${order.items.map((item) => `<div><span>${item.name} x${item.quantity || 1}</span><span>${formatMoney((item.price || 0) * (item.quantity || 1))}</span></div>`).join("")}
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
    return;
  }

  orderList.innerHTML = orders.map(renderCustomerOrderCard).join("");
}

function renderAdminOrders() {
  const container = document.getElementById("adminOrders");
  if (!container) return;

  if (!adminOrders.length) {
    container.innerHTML = `<div class="empty-state">No customer orders yet.</div>`;
    return;
  }

  container.innerHTML = adminOrders
    .map(
      (order) => `
        <article class="order-card admin-order-card">
          <div class="admin-order-header">
            <div>
              <strong>Order #${String(order.id).padStart(6, "0")}</strong>
              <p class="card-copy">${order.customerName || order.customerEmail || "Customer"} • ${formatOrderDate(order.createdAt)}</p>
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
            ${order.items.map((item) => `<div><span>${item.name} x${item.quantity || 1}</span><span>${formatMoney((item.price || 0) * (item.quantity || 1))}</span></div>`).join("")}
          </div>
        </article>
      `
    )
    .join("");
}

function renderAdminInventory() {
  const container = document.getElementById("adminInventory");
  if (!container) return;

  if (!products.length) {
    container.innerHTML = `<div class="empty-state">No inventory loaded.</div>`;
    return;
  }

  container.innerHTML = [...products]
    .reverse()
    .slice(0, 8)
    .map(
      (product) => `
        <article class="inventory-item">
          <img src="${resolveProductImage(product)}" alt="${product.name}">
          <div>
            <strong>${product.name}</strong>
            <p>${product.category} • ${formatMoney(product.price)}</p>
          </div>
        </article>
      `
    )
    .join("");
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
    badge: document.getElementById("adminProductBadge")?.value.trim(),
    accent: document.getElementById("adminProductAccent")?.value.trim(),
    desc: document.getElementById("adminProductDesc")?.value.trim()
  };

  if (imageFile) {
    payload.imageData = await readFileAsDataUrl(imageFile);
  }

  try {
    if (submitButton) submitButton.disabled = true;
    await apiRequest("/api/admin/products", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    if (feedback) feedback.textContent = "Product uploaded.";
    form.reset();

    const productPayload = await apiRequest("/api/products", { method: "GET" });
    products = (productPayload.products || []).map(normalizeProduct);
    renderProducts(currentFilter, currentSearch, currentSort);
    renderAdminInventory();
    updateAdminOverview();
  } catch (error) {
    if (feedback) feedback.textContent = error.message;
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

  if (isAdminPage()) {
    await loadAdminDashboard();
  } else {
    loadDashboard();
  }

  renderHeroTiles();
  updateCartCount();
  renderProducts(currentFilter, currentSearch, currentSort);
  loadBuilder();
  renderCart();
  renderCheckout();
  renderAdminInventory();
  applyRoleUI();
}

document.addEventListener("DOMContentLoaded", async () => {
  initPageTransitions();
  await loadStorefront();

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

  if (document.body.classList.contains('forge-home-body')) {
    const authRequiredElements = document.querySelectorAll(
      '.forge-photo-card, .forge-cta-btn, .forge-home-nav a, .forge-home-icons a, .forge-home-brand'
    );
    
    authRequiredElements.forEach(el => {
      el.addEventListener('click', (e) => {
        if (!currentUser) {
          e.preventDefault();
          openAuthModal();
        }
      });
    });
  }
});

window.addEventListener("hashchange", () => {
  renderPrimaryNavs();
});

function openAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal) {
    switchToAuthView('promo'); // Reset to promo view on open
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden'; // Lock scroll
  }
}

function closeAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal) {
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = ''; // Unlock scroll
  }
}

function switchToAuthView(viewName) {
  // Hide all views
  document.querySelectorAll('.forge-modal-content').forEach(view => {
    view.classList.remove('active');
  });
  
  // Show target view
  const targetId = 'modalView' + viewName.charAt(0).toUpperCase() + viewName.slice(1);
  const targetView = document.getElementById(targetId);
  if (targetView) {
    targetView.classList.add('active');
  }
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
    navigateWithTransition(homeRouteForUser(currentUser));
  } catch (error) {
    alert(error.message);
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
    navigateWithTransition(homeRouteForUser(currentUser));
  } catch (error) {
    alert(error.message);
    submitBtn.disabled = false;
    submitBtn.textContent = 'Create Account';
  }
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
