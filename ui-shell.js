// ui-shell.js  — injects top app bar + bottom tab bar (with Emergency)
(() => {
  const BUILD_VERSION = (typeof window !== 'undefined' && window.STAR_BUILD_VERSION) || '2025.10.16d';
  if (typeof window !== 'undefined' && !window.STAR_BUILD_VERSION) {
    window.STAR_BUILD_VERSION = BUILD_VERSION;
  }

  // ----- styles for bars (thick black, consistent) -----
  const css = `
    :root{ --appbar-h:56px; --tabbar-h:72px; }
    body{ padding-top:var(--appbar-h); padding-bottom:calc(var(--tabbar-h) + 8px); }

    /* TOP APP BAR */
    .appbar{ position:fixed; inset:0 0 auto 0; z-index:1000;
      display:flex; align-items:center; gap:12px;
      padding:10px 16px; background:#111; color:#fff; }
    .appbar .iconbtn{ appearance:none; border:0; background:#222; color:#fff;
      font-size:20px; line-height:1; padding:8px 10px; border-radius:10px; }
    .appbar .brand .title{ font-weight:800; color:#fff; }

    /* BOTTOM TABS */
    .tabbar{ position:fixed; inset:auto 0 0 0; z-index:999;
      height:var(--tabbar-h); background:#111; color:#fff;
      border-top:8px solid #000; } /* thick black line */
    .tabbar__inner{ max-width:980px; height:100%; margin:0 auto; padding:0 16px;
      display:flex; align-items:center; justify-content:space-around; gap:8px; }
    .tabbar .tab{ display:inline-flex; flex-direction:column; align-items:center;
      gap:4px; min-width:68px; padding:6px 10px; border-radius:12px;
      text-decoration:none; color:#ddd; font-weight:700; font-size:12px; }
    .tabbar .tab .icon{ font-size:20px; line-height:1; }
    .tabbar .tab:is(:hover,.is-active,[aria-current="page"]){ color:#fff; background:#222; }
  `;
  if (!document.getElementById('ui-shell-css')) {
    const s = document.createElement('style');
    s.id = 'ui-shell-css';
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ----- mount points -----
  let top = document.getElementById('appbar-host');
  if (!top) { top = document.createElement('div'); top.id = 'appbar-host'; document.body.prepend(top); }
  let bottom = document.getElementById('tabbar-host');
  if (!bottom) { bottom = document.createElement('div'); bottom.id = 'tabbar-host'; document.body.appendChild(bottom); }

  // ----- TOP BAR (brand + menu button only) -----
 top.innerHTML = `
  <header class="appbar" role="banner">
    <button class="iconbtn" id="openMenu" aria-label="Open menu" aria-controls="appDrawer" aria-expanded="false">☰</button>
    <a class="brand" href="/dashboard.html" style="text-decoration:none;color:inherit">
      <div class="title">⭐️ STAR</div>
    </a>
  </header>
`;


  // ----- BOTTOM BAR (includes Emergency) -----
  bottom.innerHTML = `
    <nav class="tabbar" aria-label="Primary">
      <div class="tabbar__inner">
        <a href="/dashboard.html"class="tab"><span class="icon">🏠</span><span class="label">Home</span></a>
     <a href="/calendar.html"class="tab"><span class="icon">📅</span><span class="label">Calendar</span></a>
        <a href="/caregiver-report.html"class="tab"><span class="icon">📊</span><span class="label">Reports</span></a>
        <a href="/documents/documents.html"class="tab"><span class="icon">📂</span><span class="label">Docs</span></a>
        <a href="/emergency-medical.html"class="tab"><span class="icon">🚑</span><span class="label">Emergency</span></a>
      </div>
    </nav>
  `;


  // ----- build version footer -----
  if (!document.getElementById('star-build-version')) {
    const footer = document.createElement('footer');
    footer.id = 'star-build-version';
    footer.style.cssText = `
      position:fixed;
      right:12px;
      bottom:calc(var(--tabbar-h,72px) + 12px);
      background:rgba(17,17,17,0.85);
      color:#f9fafb;
      font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
      font-size:11px;
      font-weight:600;
      letter-spacing:0.02em;
      padding:6px 10px;
      border-radius:10px;
      box-shadow:0 6px 18px rgba(0,0,0,0.18);
      z-index:998;
      pointer-events:none;
    `;
    footer.textContent = `Build ${BUILD_VERSION}`;
    document.body.appendChild(footer);
  }

})();
// ui-shell.js — remove the inline "Menu" <details> that appears under the app bar
(function killInlineMenu(){
  const nuke = () => {
    document.querySelectorAll('details').forEach(d => {
      const s = d.querySelector('summary');
      if (!s) return;
      const label = (s.innerText || s.textContent || '').trim().toLowerCase();
      // catches "Menu", "📁 Menu", etc.
      if (label === 'menu' || label.startsWith('📁 menu') || /\bmenu\b/i.test(label)) {
        d.remove();
      }
    });
  };

  // run after DOM is ready and again after navbar scripts inject
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', nuke, { once: true });
  } else {
    nuke();
  }
  setTimeout(nuke, 500);
})();
// --- kill the inline "Menu" dropdown no matter when it's injected ---
(function removeInlineMenus(){
  const isMenuDetails = (el) => {
    if (!el || el.tagName !== 'DETAILS') return false;
    const s = el.querySelector('summary');
    if (!s) return false;
    const text = (s.innerText || s.textContent || '')
      .replace(/\s+/g,' ')
      .trim()
      .toLowerCase();
    return text === 'menu' || /\bmenu\b/.test(text);
  };

  const kill = () => {
    document.querySelectorAll('details').forEach(d => {
      if (isMenuDetails(d)) d.remove();
    });
  };

  // Run now, when DOM is ready, and after full load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', kill, { once: true });
  } else {
    kill();
  }
  window.addEventListener('load', () => setTimeout(kill, 0));

  // Watch for anything added later (e.g., appbar-drawer.js)
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      m.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;
        if (isMenuDetails(node)) { node.remove(); return; }
        if (node.querySelectorAll) {
          node.querySelectorAll('details').forEach(d => {
            if (isMenuDetails(d)) d.remove();
          });
        }
      });
    }
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
})();
