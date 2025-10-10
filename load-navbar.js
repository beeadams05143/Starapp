// load-navbar.js — single source of truth for the hamburger + drawer
// It loads navbar.html and removes any duplicate/legacy menus.

// IDs used by our shared navbar.html
const NAV_ID = "app-drawer";
const APPBAR_ID = "appbar-shell";

// Remove any existing menus so we never have two
function removeLegacyMenus() {
  // Our IDs (from current/previous loads)
  document.querySelectorAll(`#${NAV_ID}, #${APPBAR_ID}`).forEach(el => el.remove());

  // Common legacy containers from older builds (safe to remove if present)
  document.querySelectorAll('.drawer-overlay, .drawer-panel').forEach(el => {
    // Only remove if they live under an orphaned drawer (not ours)
    if (!el.closest(`#${NAV_ID}`)) el.remove();
  });

  // If someone inlined a whole older menu, nuke any top-level asides with similar role
  document.querySelectorAll('aside[aria-hidden][role="dialog"], aside[aria-label="Main"]').forEach(el => {
    if (!el.id || el.id !== NAV_ID) el.remove();
  });
}

async function injectNavbar() {
  // If we already have an injected navbar, stop
  if (document.getElementById(NAV_ID) || document.getElementById(APPBAR_ID)) return;

  // Make absolutely sure no legacy menus are hanging around
  removeLegacyMenus();

  // Try to load navbar.html from THIS folder first, then root as a fallback
  const candidates = ["./navbar.html", "/navbar.html"];

  let html = "";
  for (const url of candidates) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) { html = await res.text(); break; }
    } catch (_) {}
  }
  if (!html) return;

  // Insert at very top of <body>
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  document.body.insertBefore(wrapper, document.body.firstChild);

  // Wire up open/close
  const drawer  = document.getElementById(NAV_ID);
  const appbar  = document.getElementById(APPBAR_ID);
  const overlay = drawer?.querySelector(".drawer-overlay");
  const openBtn = appbar?.querySelector("[data-open-drawer]");

  const openDrawer  = () => drawer?.classList.add("open");
  const closeDrawer = () => drawer?.classList.remove("open");

  openBtn?.addEventListener("click", openDrawer);
  overlay?.addEventListener("click", closeDrawer);
  drawer?.querySelectorAll("a").forEach(a => a.addEventListener("click", closeDrawer));
}

// Prevent double-running if script is included twice
if (!window.__navbarLoaded) {
  window.__navbarLoaded = true;
  document.addEventListener("DOMContentLoaded", injectNavbar);
}
