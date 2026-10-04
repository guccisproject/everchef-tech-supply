/* Vantelia Home Technologies — site script
   Shared header/footer, cart, cookie consent, glimmer background and page renderers. */
(function () {
  "use strict";

  const BUSINESS = {
    name: "Vantelia Home Technologies",
    legal: "Vantelia Home Technologies LLC",
    email: "everchef.tech@outlook.com",
    phone: "412-378-2417",
    phoneHref: "+14123782417",
    location: "East McKeesport, PA",
  };

  const CART_KEY = "vantelia_cart_v1";
  const CONSENT_KEY = "vantelia_cookie_consent_v1";
  const MAX_QTY = 10;

  const page = document.body.dataset.page || "";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------------------------------------------ utils */

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const money = (cents) =>
    (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

  const esc = (str) =>
    String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function safeGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function safeSet(key, val) {
    try { localStorage.setItem(key, val); } catch (e) { /* storage unavailable */ }
  }

  let toastTimer;
  function toast(msg) {
    let el = $(".toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "toast";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
  }

  /* --------------------------------------------------------------- catalog */

  let catalogPromise;
  function loadCatalog() {
    if (!catalogPromise) {
      catalogPromise = fetch("data/products.json")
        .then((r) => {
          if (!r.ok) throw new Error("Catalog unavailable");
          return r.json();
        })
        .then((data) => {
          data.byId = Object.fromEntries(data.products.map((p) => [p.id, p]));
          return data;
        });
    }
    return catalogPromise;
  }

  /* ------------------------------------------------------------------ cart */

  const Cart = {
    read() {
      try {
        const items = JSON.parse(safeGet(CART_KEY) || "[]");
        return Array.isArray(items) ? items.filter((i) => i && i.id && i.qty > 0) : [];
      } catch (e) { return []; }
    },
    write(items) {
      safeSet(CART_KEY, JSON.stringify(items));
      updateCartCount();
      document.dispatchEvent(new CustomEvent("cart:change"));
    },
    add(id, qty = 1) {
      const items = Cart.read();
      const found = items.find((i) => i.id === id);
      if (found) found.qty = Math.min(MAX_QTY, found.qty + qty);
      else items.push({ id, qty: Math.min(MAX_QTY, qty) });
      Cart.write(items);
    },
    set(id, qty) {
      let items = Cart.read();
      if (qty <= 0) items = items.filter((i) => i.id !== id);
      else items.forEach((i) => { if (i.id === id) i.qty = Math.min(MAX_QTY, qty); });
      Cart.write(items);
    },
    clear() { Cart.write([]); },
    count() { return Cart.read().reduce((n, i) => n + i.qty, 0); },
  };

  function cartLines(catalog) {
    return Cart.read()
      .map((i) => ({ ...i, product: catalog.byId[i.id] }))
      .filter((l) => l.product);
  }

  function updateCartCount() {
    const n = Cart.count();
    $$(".cart-count").forEach((el) => { el.textContent = n; });
    $$(".cart-link").forEach((el) => el.setAttribute("aria-label", `Cart, ${n} item${n === 1 ? "" : "s"}`));
  }

  /* ----------------------------------------------------- header & footer */

  const NAV = [
    { href: "index.html", label: "Home", key: "home" },
    { href: "products.html", label: "Shop", key: "products" },
    { href: "about.html", label: "About", key: "about" },
    { href: "contact.html", label: "Contact", key: "contact" },
  ];

  const POLICIES = [
    { href: "shipping.html", label: "Shipping Policy", key: "shipping" },
    { href: "returns.html", label: "Returns & Refunds", key: "returns" },
    { href: "terms.html", label: "Terms & Conditions", key: "terms" },
    { href: "privacy.html", label: "Privacy Policy", key: "privacy" },
    { href: "legal.html", label: "Legal Notice", key: "legal" },
  ];

  const ICON_BAG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><path d="M5 8h14l-1 12H6L5 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>';

  function renderHeader() {
    const header = document.createElement("header");
    header.className = "site-header";
    const current = (k) => (k === page ? ' aria-current="page"' : "");
    header.innerHTML = `
      <div class="container">
        <a class="brand" href="index.html" aria-label="${BUSINESS.name} home">
          <span class="brand-name">Vantelia</span>
          <span class="brand-sub">Home Technologies</span>
        </a>
        <a class="cart-link mobile-cart nav-cart" href="cart.html">${ICON_BAG}<span class="cart-count">0</span></a>
        <button class="menu-toggle" aria-label="Open menu" aria-expanded="false" aria-controls="site-nav"><span></span></button>
        <nav class="nav" id="site-nav" aria-label="Main">
          ${NAV.map((n) => `<a href="${n.href}"${current(n.key)}>${n.label}</a>`).join("")}
          <a class="cart-link" href="cart.html"${current("cart")}>${ICON_BAG}<span>Cart</span><span class="cart-count">0</span></a>
        </nav>
      </div>`;
    document.body.prepend(header);

    const toggle = $(".menu-toggle", header);
    const nav = $(".nav", header);
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    });
  }

  function renderFooter() {
    const footer = document.createElement("footer");
    footer.className = "site-footer";
    footer.innerHTML = `
      <div class="container">
        <div class="footer-grid">
          <div>
            <a class="brand" href="index.html">
              <span class="brand-name">Vantelia</span>
              <span class="brand-sub">Home Technologies</span>
            </a>
            <p style="margin-top:18px">Refined kitchen hardware and home electronics, chosen to perform beautifully every day.</p>
          </div>
          <div>
            <h4>Explore</h4>
            <ul>
              ${NAV.map((n) => `<li><a href="${n.href}">${n.label}</a></li>`).join("")}
              <li><a href="cart.html">Cart</a></li>
            </ul>
          </div>
          <div>
            <h4>Policies</h4>
            <ul>
              ${POLICIES.map((p) => `<li><a href="${p.href}">${p.label}</a></li>`).join("")}
              <li><button type="button" class="link-btn" data-cookie-settings>Cookie Preferences</button></li>
            </ul>
          </div>
          <div>
            <h4>Contact</h4>
            <ul>
              <li><a href="mailto:${BUSINESS.email}">${BUSINESS.email}</a></li>
              <li><a href="tel:${BUSINESS.phoneHref}">${BUSINESS.phone}</a></li>
              <li><span class="muted">${BUSINESS.location}</span></li>
            </ul>
          </div>
        </div>
        <div class="footer-bottom">
          <span>&copy; Copyright ${BUSINESS.legal} 2026. All rights reserved.</span>
          <span>Secure checkout powered by Stripe</span>
        </div>
      </div>`;
    document.body.appendChild(footer);
  }

  /* ------------------------------------------------------ cookie consent */

  function initCookieBanner() {
    const banner = document.createElement("div");
    banner.className = "cookie-banner glass";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-live", "polite");
    banner.setAttribute("aria-label", "Cookie consent");
    banner.innerHTML = `
      <p>We use essential cookies and local storage to keep your cart and preferences working. With your permission we may also use optional analytics to improve the store. Read our <a href="privacy.html"><u>Privacy Policy</u></a>.</p>
      <div class="btn-row">
        <button type="button" class="btn btn-ghost btn-sm" data-consent="essential">Essential Only</button>
        <button type="button" class="btn btn-sm" data-consent="all">Accept All</button>
      </div>`;
    document.body.appendChild(banner);

    const show = () => banner.classList.add("show");
    const hide = () => banner.classList.remove("show");

    $$("[data-consent]", banner).forEach((btn) =>
      btn.addEventListener("click", () => {
        const choice = btn.dataset.consent;
        safeSet(CONSENT_KEY, JSON.stringify({ choice, date: new Date().toISOString() }));
        window.vanteliaConsent = choice;
        document.dispatchEvent(new CustomEvent("consent:change", { detail: choice }));
        hide();
      })
    );

    document.addEventListener("click", (e) => {
      if (e.target.closest("[data-cookie-settings]")) show();
    });

    try {
      const saved = JSON.parse(safeGet(CONSENT_KEY) || "null");
      if (saved && saved.choice) window.vanteliaConsent = saved.choice;
      else setTimeout(show, 900);
    } catch (e) { setTimeout(show, 900); }
  }

  /* ------------------------------------------------------ glimmer layer */

  function initBackdrop() {
    const bg = document.createElement("div");
    bg.className = "backdrop";
    bg.setAttribute("aria-hidden", "true");
    document.body.prepend(bg);

    const canvas = document.createElement("canvas");
    canvas.id = "glimmer";
    canvas.setAttribute("aria-hidden", "true");
    bg.after(canvas);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let w, h, dpr, specks = [];

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.width = Math.floor(window.innerWidth * dpr);
      h = canvas.height = Math.floor(window.innerHeight * dpr);
      const count = Math.round(Math.min(140, (window.innerWidth * window.innerHeight) / 11000));
      specks = Array.from({ length: count }, makeSpeck);
    }

    function makeSpeck() {
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        r: (Math.random() * 0.9 + 0.35) * dpr,
        phase: Math.random() * Math.PI * 2,
        speed: 0.004 + Math.random() * 0.012,
        peak: 0.35 + Math.random() * 0.65,
        flare: Math.random() < 0.12, // a few catch the light with a faint glint
      };
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);
      for (const s of specks) {
        s.phase += s.speed;
        const tw = Math.pow((Math.sin(s.phase) + 1) / 2, 3); // long rests, brief sparkle
        const a = s.peak * tw;
        if (a < 0.02) continue;

        const glow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 6);
        glow.addColorStop(0, `rgba(255,255,255,${a})`);
        glow.addColorStop(0.25, `rgba(255,255,255,${a * 0.35})`);
        glow.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * 6, 0, Math.PI * 2);
        ctx.fill();

        if (s.flare && a > 0.45) {
          const len = s.r * 12 * a;
          ctx.lineWidth = 0.6 * dpr;
          // a soft horizontal glint, like light catching a facet
          const streak = ctx.createLinearGradient(s.x - len, s.y, s.x + len, s.y);
          streak.addColorStop(0, "rgba(255,255,255,0)");
          streak.addColorStop(0.5, `rgba(255,255,255,${a * 0.4})`);
          streak.addColorStop(1, "rgba(255,255,255,0)");
          ctx.strokeStyle = streak;
          ctx.beginPath();
          ctx.moveTo(s.x - len, s.y); ctx.lineTo(s.x + len, s.y);
          ctx.stroke();
        }
      }
      if (!reduceMotion) requestAnimationFrame(draw);
    }

    resize();
    let rt;
    window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { resize(); if (reduceMotion) draw(); }, 150); });
    if (reduceMotion) specks.forEach((s) => (s.phase = Math.PI / 2));
    draw();
  }

  /* ------------------------------------------------------- scroll reveal */

  function initReveal(root = document) {
    const els = $$(".reveal:not(.in)", root);
    if (reduceMotion || !("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      }),
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    els.forEach((el) => io.observe(el));
  }

  /* -------------------------------------------------------- product UI */

  function productCard(p) {
    const price = p.compareAt
      ? `${money(p.price)}<s>${money(p.compareAt)}</s>`
      : money(p.price);
    return `
      <article class="product-card glass reveal">
        <a class="product-media" href="product.html?id=${encodeURIComponent(p.id)}" aria-label="${esc(p.name)}">
          <img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" width="1000" height="850">
          ${p.badge ? `<span class="badge">${esc(p.badge)}</span>` : ""}
        </a>
        <div class="product-body">
          <h3><a href="product.html?id=${encodeURIComponent(p.id)}">${esc(p.name)}</a></h3>
          <p>${esc(p.short)}</p>
          <div class="product-foot">
            <span class="price">${price}</span>
            <button type="button" class="btn btn-ghost btn-sm" data-add="${esc(p.id)}">Add to Cart</button>
          </div>
        </div>
      </article>`;
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-add]");
    if (!btn) return;
    loadCatalog().then((cat) => {
      const p = cat.byId[btn.dataset.add];
      if (!p) return;
      Cart.add(p.id, 1);
      toast(`${p.name} added to your cart`);
    });
  });

  function renderGrid(el, products) {
    el.innerHTML = products.map(productCard).join("");
    initReveal(el);
  }

  /* -------------------------------------------------------------- pages */

  const pages = {
    home() {
      loadCatalog().then((cat) => {
        const featured = ["barista-espresso", "aero-air-fryer", "atelier-stand-mixer", "lumen-glass-kettle"]
          .map((id) => cat.byId[id]).filter(Boolean);
        const bundles = cat.products.filter((p) => p.category === "bundles").slice(0, 3);
        const f = $("#featured"); if (f) renderGrid(f, featured);
        const b = $("#bundles"); if (b) renderGrid(b, bundles);
      }).catch(showCatalogError);
    },

    products() {
      loadCatalog().then((cat) => {
        const grid = $("#product-grid");
        const filters = $("#filters");
        const params = new URLSearchParams(location.search);
        let active = params.get("category") || "all";
        if (active !== "all" && !cat.categories.some((c) => c.id === active)) active = "all";

        filters.innerHTML = [{ id: "all", name: "All" }, ...cat.categories]
          .map((c) => `<button type="button" class="filter${c.id === active ? " active" : ""}" data-filter="${c.id}" aria-pressed="${c.id === active}">${esc(c.name)}</button>`)
          .join("");

        const draw = () => {
          const list = active === "all" ? cat.products : cat.products.filter((p) => p.category === active);
          renderGrid(grid, list);
        };

        filters.addEventListener("click", (e) => {
          const btn = e.target.closest("[data-filter]");
          if (!btn) return;
          active = btn.dataset.filter;
          $$(".filter", filters).forEach((b) => {
            const on = b === btn;
            b.classList.toggle("active", on);
            b.setAttribute("aria-pressed", String(on));
          });
          const url = new URL(location.href);
          if (active === "all") url.searchParams.delete("category"); else url.searchParams.set("category", active);
          history.replaceState(null, "", url);
          draw();
        });
        draw();
      }).catch(showCatalogError);
    },

    product() {
      loadCatalog().then((cat) => {
        const id = new URLSearchParams(location.search).get("id");
        const p = cat.byId[id];
        const wrap = $("#product-detail");
        if (!p) {
          wrap.innerHTML = `<div class="glass panel empty"><h2>Product not found</h2><p class="muted">This item may no longer be available.</p><a class="btn" href="products.html">Browse the Collection</a></div>`;
          return;
        }
        document.title = `${p.name} — ${BUSINESS.name}`;
        const catName = (cat.categories.find((c) => c.id === p.category) || {}).name || "";
        const includes = (p.includes || []).map((iid) => cat.byId[iid]).filter(Boolean);
        const specs = p.specs ? Object.entries(p.specs) : [];

        wrap.innerHTML = `
          <article class="detail glass">
            <div class="detail-media"><img src="${esc(p.image)}" alt="${esc(p.name)}"></div>
            <div class="detail-info">
              <span class="eyebrow">${esc(catName)}</span>
              <h1 style="font-size:clamp(1.5rem,3vw,2.1rem)">${esc(p.name)}</h1>
              <span class="price">${money(p.price)}${p.compareAt ? `<s>${money(p.compareAt)}</s>` : ""}</span>
              <p>${esc(p.description)}</p>
              ${includes.length ? `
                <h4 style="margin-top:24px">Included in this set</h4>
                <ul class="includes">${includes.map((i) => `<li><a href="product.html?id=${encodeURIComponent(i.id)}">${esc(i.name)}</a><span>${money(i.price)}</span></li>`).join("")}</ul>` : ""}
              ${p.features ? `<ul class="feature-list">${p.features.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}
              <div class="qty-row">
                <div class="qty" aria-label="Quantity">
                  <button type="button" data-step="-1" aria-label="Decrease quantity">&minus;</button>
                  <input type="number" id="qty" value="1" min="1" max="${MAX_QTY}" inputmode="numeric" aria-label="Quantity">
                  <button type="button" data-step="1" aria-label="Increase quantity">+</button>
                </div>
                <button type="button" class="btn" id="add-detail" style="flex:1">Add to Cart</button>
              </div>
              <p class="note">Free standard shipping on orders over ${money(cat.shipping.freeThreshold)} &middot; 30-day returns</p>
              ${specs.length ? `
                <h4 style="margin-top:28px">Specifications</h4>
                <table class="spec-table">${specs.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</table>` : ""}
            </div>
          </article>`;

        const qty = $("#qty");
        $$("[data-step]", wrap).forEach((b) =>
          b.addEventListener("click", () => {
            qty.value = Math.max(1, Math.min(MAX_QTY, (parseInt(qty.value, 10) || 1) + Number(b.dataset.step)));
          })
        );
        $("#add-detail").addEventListener("click", () => {
          const n = Math.max(1, Math.min(MAX_QTY, parseInt(qty.value, 10) || 1));
          Cart.add(p.id, n);
          toast(`${n} × ${p.name} added to your cart`);
        });

        const related = cat.products.filter((x) => x.id !== p.id && x.category === p.category).slice(0, 3);
        const rel = $("#related");
        if (rel && related.length) {
          rel.closest("section").hidden = false;
          renderGrid(rel, related);
        }
      }).catch(showCatalogError);
    },

    cart() {
      loadCatalog().then((cat) => {
        const draw = () => {
          const lines = cartLines(cat);
          const list = $("#cart-items");
          const summary = $("#cart-summary");
          $("#cart-empty").hidden = lines.length > 0;
          $("#cart-layout").hidden = !lines.length;
          if (!lines.length) return;
          list.innerHTML = lines.map((l) => `
            <div class="cart-item">
              <img src="${esc(l.product.image)}" alt="${esc(l.product.name)}" loading="lazy">
              <div>
                <h3><a href="product.html?id=${encodeURIComponent(l.id)}">${esc(l.product.name)}</a></h3>
                <span class="muted">${money(l.product.price)} each</span>
                <div class="controls">
                  <div class="qty" aria-label="Quantity for ${esc(l.product.name)}">
                    <button type="button" data-dec="${esc(l.id)}" aria-label="Decrease quantity">&minus;</button>
                    <input type="number" value="${l.qty}" min="1" max="${MAX_QTY}" data-qty="${esc(l.id)}" aria-label="Quantity">
                    <button type="button" data-inc="${esc(l.id)}" aria-label="Increase quantity">+</button>
                  </div>
                  <button type="button" class="link-btn" data-remove="${esc(l.id)}">Remove</button>
                </div>
              </div>
              <span class="price line-total">${money(l.product.price * l.qty)}</span>
            </div>`).join("");
          summary.innerHTML = summaryHtml(cat, lines) + `
            <a class="btn btn-block" href="checkout.html" style="margin-top:20px">Proceed to Checkout</a>
            <a class="btn btn-ghost btn-block" href="products.html" style="margin-top:12px">Continue Shopping</a>`;
        };

        $("#cart-layout").addEventListener("click", (e) => {
          const t = e.target.closest("button");
          if (!t) return;
          const qtyOf = (id) => (Cart.read().find((i) => i.id === id) || { qty: 0 }).qty;
          if (t.dataset.inc) Cart.set(t.dataset.inc, Math.min(MAX_QTY, qtyOf(t.dataset.inc) + 1));
          if (t.dataset.dec) Cart.set(t.dataset.dec, qtyOf(t.dataset.dec) - 1);
          if (t.dataset.remove) Cart.set(t.dataset.remove, 0);
        });
        $("#cart-layout").addEventListener("change", (e) => {
          const input = e.target.closest("[data-qty]");
          if (!input) return;
          const n = parseInt(input.value, 10);
          Cart.set(input.dataset.qty, Number.isFinite(n) ? Math.max(0, Math.min(MAX_QTY, n)) : 1);
        });
        document.addEventListener("cart:change", draw);
        draw();
      }).catch(showCatalogError);
    },

    checkout() {
      loadCatalog().then((cat) => {
        const lines = cartLines(cat);
        const wrap = $("#checkout-layout");
        if (!lines.length) {
          wrap.innerHTML = `
            <div class="glass panel empty" style="grid-column:1/-1">
              <h2>Nothing to check out yet</h2>
              <p class="muted">Add a few pieces to your cart to continue.</p>
              <a class="btn" href="products.html">Shop the Collection</a>
            </div>`;
          return;
        }
        $("#checkout-items").innerHTML = lines.map((l) => `
          <div class="cart-item">
            <img src="${esc(l.product.image)}" alt="${esc(l.product.name)}" loading="lazy">
            <div><h3>${esc(l.product.name)}</h3><span class="muted">Qty ${l.qty} &middot; ${money(l.product.price)} each</span></div>
            <span class="price line-total">${money(l.product.price * l.qty)}</span>
          </div>`).join("");
        $("#checkout-summary-rows").innerHTML = summaryHtml(cat, lines, true);

        const form = $("#checkout-form");
        const msg = $("#checkout-msg");
        const btn = $("#pay-btn");

        form.addEventListener("change", () => {
          $("#checkout-summary-rows").innerHTML = summaryHtml(cat, lines, true, form.shipping.value);
        });

        form.addEventListener("submit", async (e) => {
          e.preventDefault();
          msg.innerHTML = "";
          if (!form.agree.checked) {
            msg.innerHTML = `<div class="alert error">Please agree to the Terms & Conditions and Returns Policy to continue.</div>`;
            return;
          }
          btn.disabled = true;
          btn.textContent = "Connecting to secure checkout…";
          try {
            const res = await fetch("/api/checkout", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                items: Cart.read().map(({ id, qty }) => ({ id, qty })),
                shipping: form.shipping.value,
                email: form.email.value.trim() || undefined,
                giftNote: form.giftNote.value.trim().slice(0, 300) || undefined,
              }),
            });
            const data = await res.json().catch(() => ({}));
            if (data.code === "checkout_disabled") {
              msg.innerHTML = `<div class="alert">Online checkout is opening soon. To place your order today, email us at <a href="mailto:${BUSINESS.email}?subject=${encodeURIComponent("Order request")}"><u>${BUSINESS.email}</u></a> or call <a href="tel:${BUSINESS.phoneHref}"><u>${BUSINESS.phone}</u></a> and we'll take care of it personally.</div>`;
              btn.disabled = false;
              btn.textContent = "Continue to Secure Payment";
              return;
            }
            if (!res.ok || !data.url) throw new Error(data.error || "Checkout is temporarily unavailable.");
            window.location.href = data.url;
          } catch (err) {
            msg.innerHTML = `<div class="alert error">${esc(err.message)} Please try again, or contact us at <a href="mailto:${BUSINESS.email}"><u>${BUSINESS.email}</u></a>.</div>`;
            btn.disabled = false;
            btn.textContent = "Continue to Secure Payment";
          }
        });
      }).catch(showCatalogError);
    },

    success() {
      const id = new URLSearchParams(location.search).get("session_id");
      const out = $("#order-info");
      if (!id) return;
      Cart.clear();
      fetch(`/api/order?session_id=${encodeURIComponent(id)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((o) => {
          if (!o || !out) return;
          out.innerHTML = `
            <div class="summary-row"><span>Order reference</span><span>${esc(o.reference)}</span></div>
            ${o.email ? `<div class="summary-row"><span>Confirmation sent to</span><span>${esc(o.email)}</span></div>` : ""}
            <div class="summary-row total"><span>Total paid</span><span>${money(o.amountTotal)}</span></div>`;
        })
        .catch(() => {});
    },

    contact() {
      const form = $("#contact-form");
      const msg = $("#contact-msg");
      const params = new URLSearchParams(location.search);
      if (params.get("subject")) form.subject.value = params.get("subject");

      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        msg.innerHTML = "";
        if (!form.checkValidity()) { form.reportValidity(); return; }
        const payload = {
          name: form.name.value.trim(),
          email: form.email.value.trim(),
          order: form.order.value.trim(),
          subject: form.subject.value,
          message: form.message.value.trim(),
          company: form.company.value, // honeypot
        };
        const btn = $("button[type=submit]", form);
        btn.disabled = true;
        btn.textContent = "Sending…";
        try {
          let res, data = {};
          try {
            res = await fetch("/api/contact", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            data = await res.json().catch(() => ({}));
          } catch (networkErr) {
            res = null;
          }
          if (res && res.ok) {
            form.reset();
            msg.innerHTML = `<div class="alert">Thank you — your message has been received. Our team typically replies within one business day.</div>`;
          } else if (!res || data.fallback === "mailto" || res.status === 404 || res.status === 405) {
            // Static hosting without the API, or email not configured: use the visitor's email app.
            openMailto(payload);
          } else {
            msg.innerHTML = `<div class="alert error">${esc(data.error || "We couldn't send your message. Please try again.")}</div>`;
          }
        } finally {
          btn.disabled = false;
          btn.textContent = "Send Message";
        }
      });

      function openMailto(p) {
        const body = `Name: ${p.name}\nEmail: ${p.email}\nOrder #: ${p.order || "—"}\n\n${p.message}`;
        window.location.href = `mailto:${BUSINESS.email}?subject=${encodeURIComponent(`[${p.subject}] Website inquiry`)}&body=${encodeURIComponent(body)}`;
        msg.innerHTML = `<div class="alert">Your email app should open with your message ready to send. If it doesn't, write to us directly at <a href="mailto:${BUSINESS.email}"><u>${BUSINESS.email}</u></a>.</div>`;
      }
    },
  };

  function shippingFor(cat, subtotal, method = "standard") {
    if (method === "expedited") return cat.shipping.expedited.amount;
    return subtotal >= cat.shipping.freeThreshold ? 0 : cat.shipping.standard.amount;
  }

  function summaryHtml(cat, lines, isCheckout = false, method = "standard") {
    const subtotal = lines.reduce((s, l) => s + l.product.price * l.qty, 0);
    const ship = shippingFor(cat, subtotal, method);
    const remaining = cat.shipping.freeThreshold - subtotal;
    const pct = Math.min(100, (subtotal / cat.shipping.freeThreshold) * 100);
    return `
      ${!isCheckout ? `<h3>Order Summary</h3>` : ""}
      ${remaining > 0
        ? `<p class="note" style="margin:0">You're ${money(remaining)} away from free standard shipping.</p>`
        : `<p class="note" style="margin:0">Your order qualifies for free standard shipping.</p>`}
      <div class="progress" aria-hidden="true"><span style="width:${pct}%"></span></div>
      <div class="summary-row"><span>Subtotal</span><span>${money(subtotal)}</span></div>
      <div class="summary-row"><span>Shipping</span><span>${ship === 0 ? "Free" : money(ship)}</span></div>
      <div class="summary-row"><span>Sales tax</span><span class="muted">Calculated at payment</span></div>
      <div class="summary-row total"><span>Estimated total</span><span>${money(subtotal + ship)}</span></div>`;
  }

  function showCatalogError() {
    const target = $("main .container") || $("main");
    if (target) target.insertAdjacentHTML("afterbegin", `<div class="alert error">We're having trouble loading our collection. Please refresh the page.</div>`);
  }

  /* --------------------------------------------------------------- boot */

  initBackdrop();
  renderHeader();
  renderFooter();
  initCookieBanner();
  updateCartCount();
  initReveal();
  if (pages[page]) pages[page]();

  window.addEventListener("storage", (e) => { if (e.key === CART_KEY) { updateCartCount(); document.dispatchEvent(new CustomEvent("cart:change")); } });
})();
