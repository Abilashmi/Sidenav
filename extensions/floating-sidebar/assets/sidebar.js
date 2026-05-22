/**
 * Floating Side Navigation — Storefront Script
 * Renders a collapsible sidebar of collections with a toggle tab.
 */

(function () {
  "use strict";

  const ROOT_SELECTOR = "#fsn-root";
  const SIDEBAR_ID    = "fsn-sidebar";
  const TOGGLE_ID     = "fsn-toggle";
  const PLACEHOLDER_IMG = "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-collection-1.png";
  const STORAGE_KEY   = "fsn-expanded";

  function getRoot() {
    return document.querySelector(ROOT_SELECTOR);
  }

  function getShop() {
    const root = getRoot();
    return root ? root.dataset.shop : null;
  }

  function getAppUrl() {
    const root = getRoot();
    return window.FSN_APP_URL || (root && root.dataset.appUrl) || "";
  }

  async function fetchSidebarData(shop) {
    const appUrl = getAppUrl();
    if (!appUrl) {
      console.warn("[FSN] No app URL configured. Cannot load sidebar.");
      return null;
    }
    try {
      const res = await fetch(
        `${appUrl}/api/sidebar-data?shop=${encodeURIComponent(shop)}`,
        { headers: { Accept: "application/json" } }
      );
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.warn("[FSN] Failed to fetch sidebar data:", e);
      return null;
    }
  }

  function buildToggle(isRight, bg, text, zIndex, shadow) {
    const btn = document.createElement("button");
    btn.id   = TOGGLE_ID;
    btn.type = "button";
    btn.className = isRight ? "fsn-right" : "fsn-left";
    if (shadow) btn.classList.add("fsn-shadow");
    btn.setAttribute("aria-label", "Toggle collection sidebar");
    btn.setAttribute("aria-expanded", "false");
    btn.style.setProperty("--fsn-bg",   bg);
    btn.style.setProperty("--fsn-text", text);
    btn.style.setProperty("--fsn-z",    String(zIndex));

    /* Hamburger icon */
    const bars = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    bars.setAttribute("class",    "fsn-icon-bars");
    bars.setAttribute("viewBox",  "0 0 24 24");
    bars.setAttribute("fill",     "none");
    bars.setAttribute("stroke",   "currentColor");
    bars.setAttribute("stroke-width",   "2.5");
    bars.setAttribute("stroke-linecap", "round");
    bars.innerHTML =
      '<line x1="3" y1="7"  x2="21" y2="7"/>' +
      '<line x1="3" y1="12" x2="21" y2="12"/>' +
      '<line x1="3" y1="17" x2="21" y2="17"/>';

    /* Close (×) icon */
    const cross = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    cross.setAttribute("class",    "fsn-icon-x");
    cross.setAttribute("viewBox",  "0 0 24 24");
    cross.setAttribute("fill",     "none");
    cross.setAttribute("stroke",   "currentColor");
    cross.setAttribute("stroke-width",   "2.5");
    cross.setAttribute("stroke-linecap", "round");
    cross.innerHTML =
      '<line x1="6"  y1="6"  x2="18" y2="18"/>' +
      '<line x1="18" y1="6"  x2="6"  y2="18"/>';

    btn.appendChild(bars);
    btn.appendChild(cross);
    return btn;
  }

  function buildItem(collection, shopDomain) {
    const a = document.createElement("a");
    a.className = "fsn-item";
    a.href = `https://${shopDomain}/collections/${collection.handle}`;
    a.setAttribute("aria-label", collection.title);

    const iconDiv = document.createElement("div");
    iconDiv.className = "fsn-icon";

    const img = document.createElement("img");
    img.src      = collection.image || PLACEHOLDER_IMG;
    img.alt      = collection.title;
    img.loading  = "lazy";
    img.decoding = "async";
    img.width    = 80;
    img.height   = 80;
    img.onerror  = function () { this.src = PLACEHOLDER_IMG; };

    iconDiv.appendChild(img);

    const label = document.createElement("span");
    label.className   = "fsn-label";
    label.textContent = collection.title;

    a.appendChild(iconDiv);
    a.appendChild(label);
    return a;
  }

  function renderSidebar(data) {
    const { settings, collections } = data;
    if (!settings.enabled) return;
    if (!collections || collections.length === 0) return;

    /* Remove stale instances from a previous render */
    document.getElementById(SIDEBAR_ID)?.remove();
    document.getElementById(TOGGLE_ID)?.remove();

    const isRight  = settings.position === "right";
    const bg       = settings.backgroundColor || "#ffffff";
    const text     = settings.textColor       || "#1a1a1a";
    const radius   = settings.borderRadius    ?? 12;
    const iconSize = settings.iconSize        ?? 56;
    const zIndex   = settings.zIndex          ?? 9999;
    const opacity  = settings.opacity         ?? 1;
    const shadow   = !!settings.shadow;

    /* Build sidebar */
    const sidebar = document.createElement("div");
    sidebar.id = SIDEBAR_ID;
    sidebar.setAttribute("role",       "navigation");
    sidebar.setAttribute("aria-label", "Collection Navigation");
    sidebar.className = isRight ? "fsn-right" : "fsn-left";
    if (shadow)              sidebar.classList.add("fsn-shadow");
    if (settings.mobileOnly) sidebar.classList.add("fsn-mobile-only");

    sidebar.style.setProperty("--fsn-bg",       bg);
    sidebar.style.setProperty("--fsn-text",     text);
    sidebar.style.setProperty("--fsn-radius",   `${radius}px`);
    sidebar.style.setProperty("--fsn-icon-size",`${iconSize}px`);
    sidebar.style.setProperty("--fsn-z",        String(zIndex));
    sidebar.style.setProperty("--fsn-opacity",  String(opacity));

    const animStyle = settings.animationStyle || "slide";
    if (animStyle !== "slide") {
      sidebar.classList.add(`fsn-anim-${animStyle}`);
    }

    const shopDomain = getShop();
    collections.forEach(function (col) {
      sidebar.appendChild(buildItem(col, shopDomain));
    });

    /* Build toggle */
    const toggle = buildToggle(isRight, bg, text, zIndex, shadow);
    if (settings.mobileOnly) toggle.classList.add("fsn-mobile-only");

    /* Restore last open/close state */
    var isOpen;
    try { isOpen = localStorage.getItem(STORAGE_KEY) === "true"; } catch (_) { isOpen = false; }

    function setOpen(open) {
      if (open) {
        sidebar.classList.add("fsn-open");
        toggle.classList.add("fsn-open");
        toggle.setAttribute("aria-expanded", "true");
      } else {
        sidebar.classList.remove("fsn-open");
        toggle.classList.remove("fsn-open");
        toggle.setAttribute("aria-expanded", "false");
      }
      try { localStorage.setItem(STORAGE_KEY, String(open)); } catch (_) {}
    }

    toggle.addEventListener("click", function () {
      setOpen(!sidebar.classList.contains("fsn-open"));
    });

    document.body.appendChild(toggle);
    document.body.appendChild(sidebar);

    setOpen(isOpen);
  }

  async function init() {
    /* Guard: don't run twice */
    if (document.getElementById(SIDEBAR_ID)) return;

    var shop = getShop();
    if (!shop) return;

    var data = await fetchSidebarData(shop);
    if (!data || data.error) return;

    renderSidebar(data);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
