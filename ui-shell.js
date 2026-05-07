// ui-shell.js  — injects top app bar + bottom tab bar (with Emergency)
(() => {
  const BUILD_VERSION = (typeof window !== 'undefined' && window.STAR_BUILD_VERSION) || '2026.03.29A';
  if (typeof window !== 'undefined' && !window.STAR_BUILD_VERSION) {
    window.STAR_BUILD_VERSION = BUILD_VERSION;
  }

  // ----- styles for bars (soft, consistent) -----
  const css = `
    :root{ --appbar-h:56px; --tabbar-h:56px; }
    body{ padding-top:var(--appbar-h); padding-bottom:calc(var(--tabbar-h) + 8px); }

    /* TOP APP BAR */
    .appbar{ position:fixed; inset:0 0 auto 0; z-index:1000;
      display:flex; align-items:center; gap:12px;
      padding:10px 16px; background:#f9f7f2; color:#2c2c2c;
      border-bottom:1px solid #e5dfd3; box-shadow:none; }
    .appbar .menu-btn{ appearance:none; width:40px; height:40px; background:#F4F1EA;
      border-radius:10px; border:1px solid #E0D8CC; display:flex; flex-direction:column;
      justify-content:center; align-items:center; gap:4px; cursor:pointer; padding:0; }
    .appbar .menu-btn span{ width:18px; height:2px; background:#3A3A3A;
      display:block; border-radius:2px; }
    .appbar .menu-btn:hover{ background:#EDE6DA; }
    .appbar .iconbtn{ appearance:none; border:1px solid #E0D8CC; background:#F4F1EA; color:#2c2c2c;
      font-size:20px; line-height:1; padding:8px 10px; border-radius:10px; }
    .appbar .brand .title{ font-weight:800; color:#2c2c2c; }

    /* BOTTOM TABS */
    .tabbar{ position:fixed; inset:auto 0 0 0; z-index:999;
      height:var(--tabbar-h); background:#f9f7f2; color:#2c2c2c;
      border-top:1px solid #e5dfd3; box-shadow:none; }
    .tabbar__inner{ max-width:980px; height:100%; margin:0 auto; padding:0 16px;
      display:flex; align-items:center; justify-content:space-around; gap:8px; }
    .tabbar .tab, .bottom-nav .nav-item{ position:relative; display:inline-flex; flex-direction:column; align-items:center;
      gap:4px; min-width:60px; padding:4px 8px; border-radius:10px;
      text-decoration:none; color:#5F5E5A; font-weight:400; font-size:12px; }
    .tabbar .tab svg, .bottom-nav svg{ color:#5F5E5A; width:22px; height:22px; }
    .tabbar .tab span, .bottom-nav span{ color:#5F5E5A; font-weight:400; }
    .tabbar .tab.active, .tabbar .tab:is(:hover,.is-active,[aria-current="page"]),
    .bottom-nav .active{ background:#f4f1ea; }
    .tabbar .tab.active svg, .tabbar .tab.active span,
    .tabbar .tab:is(:hover,.is-active,[aria-current="page"]) svg,
    .tabbar .tab:is(:hover,.is-active,[aria-current="page"]) span,
    .bottom-nav .active svg, .bottom-nav .active span{ color:#854F0B; font-weight:500; }
    .tabbar .badge, .bottom-nav .badge{ position:absolute; top:-4px; right:6px; background:#E54848; color:white;
      font-size:10px; padding:2px 5px; border-radius:999px; font-weight:600;
      min-width:16px; text-align:center; line-height:1; }

    @media (max-width: 640px){
      :root{ --appbar-h:52px; --tabbar-h:52px; }
      body{ padding-top:var(--appbar-h); padding-bottom:calc(var(--tabbar-h) + 6px); }
      .appbar{ padding:8px 12px; }
      .tabbar{ border-top:1px solid #e5dfd3; }
      .tabbar__inner{ padding:0 10px; }
      .tabbar .tab{ min-width:52px; padding:2px 6px; font-size:10px; }
      .tabbar .tab svg{ width:20px; height:20px; }
    }
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
    <button class="menu-btn iconbtn" id="openMenu" aria-label="Open menu" aria-controls="appDrawer" aria-expanded="false">
      <span></span>
      <span></span>
      <span></span>
    </button>
    <a class="brand" href="/dashboard.html" style="text-decoration:none;color:inherit">
      <div style="display:flex;align-items:center;gap:8px;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2C2C2A" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true">
          <polygon points="12,2 14.9,9.3 22.6,9.3 16.4,14 18.8,21.5 12,17.2 5.2,21.5 7.6,14 1.4,9.3 9.1,9.3"></polygon>
        </svg>
        <span style="font-size:15px;font-weight:400;color:#2C2C2A;letter-spacing:0.15em;text-transform:uppercase;">STAR</span>
      </div>
    </a>
  </header>
`;


  const MODE_KEY = 'star_menu_mode';
  const APP_CONFIG_KEY = 'star_app_config';
  const getMenuMode = () => {
    try {
      const stored = localStorage.getItem(MODE_KEY);
      return stored === 'individual' ? 'individual' : 'caregiver';
    } catch {
      return 'caregiver';
    }
  };

  const getAppFeatures = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(APP_CONFIG_KEY) || 'null');
      return {
        chat: parsed?.appFeatures?.chat !== false,
        calendar: parsed?.appFeatures?.calendar !== false,
        focus: parsed?.appFeatures?.focus !== false,
        documents: parsed?.appFeatures?.documents !== false,
      };
    } catch {
      return { chat: true, calendar: true, focus: true, documents: true };
    }
  };

  const attentionItems = [
    'document',
    'chat',
    'emergency',
  ];

  function updateHomeBadge() {
    const badge = document.getElementById('homeBadge');
    if (!badge) return;

    const count = attentionItems.length;

    if (count === 0) {
      badge.style.display = 'none';
    } else {
      badge.style.display = 'inline-block';
      badge.textContent = count;
    }
  }

  const iconSvg = {
    home: '<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" fill="none" stroke-width="2" aria-hidden="true"><path d="M3 12l9 -9l9 9"></path><path d="M9 21v-6h6v6"></path></svg>',
    checkin: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 11l3 3l6 -6"></path><rect x="3" y="3" width="18" height="18" rx="2"></rect></svg>',
    reports: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="4" y="10" width="3" height="10"></rect><rect x="10" y="6" width="3" height="14"></rect><rect x="16" y="2" width="3" height="18"></rect></svg>',
    calendar: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"></rect><path d="M8 3v4M16 3v4M4 10h16"></path></svg>',
    focus: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polygon points="12 2 15 9 22 9 17 14 19 21 12 17 5 21 7 14 2 9 9 9"></polygon></svg>',
    docs: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="4" y="4" width="14" height="14"></rect><path d="M8 8h6M8 12h6M8 16h4"></path></svg>',
    chat: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 5h16v11H8l-4 4z"></path></svg>',
    emergency: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3l8 4v5c0 5 -3.5 8 -8 9c-4.5 -1 -8 -4 -8 -9v-5z"></path><path d="M12 8v8M8 12h8"></path></svg>',
    mood: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M9 10h.01M15 10h.01M9 15c1.5 1 4.5 1 6 0"></path></svg>',
    voice: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 9a3 3 0 0 1 6 0v4a3 3 0 0 1 -6 0z"></path><path d="M5 11a7 7 0 0 0 14 0M12 18v3"></path></svg>',
  };

  function renderBottomBar(){
    const mode = getMenuMode();
    const features = getAppFeatures();
    const tabs = mode === 'individual'
      ? [
          { href: '/dashboard.html', icon: 'home', label: 'Home' },
          ...(features.calendar ? [{ href: '/calendar.html', icon: 'calendar', label: 'Calendar' }] : []),
          { href: '/home.html', icon: 'mood', label: 'Mood' },
          { href: '/my-star-voice.html', icon: 'voice', label: 'Voice' },
          ...(features.chat ? [{ href: '/chat.html', icon: 'chat', label: 'Chat' }] : []),
          { href: '/emergency-medical.html', icon: 'emergency', label: 'Emergency' },
        ]
      : [
          { href: '/dashboard.html', icon: 'home', label: 'Home' },
          { href: '/caregiver-checkin.html', icon: 'checkin', label: 'Check-in' },
          { href: '/caregiver-report.html', icon: 'reports', label: 'Reports' },
          ...(features.calendar ? [{ href: '/calendar.html', icon: 'calendar', label: 'Calendar' }] : []),
          ...(features.focus ? [{ href: '/focus-week.html', icon: 'focus', label: 'Focus' }] : []),
          ...(features.documents ? [{ href: '/documents/index.html', icon: 'docs', label: 'Docs' }] : []),
          ...(features.chat ? [{ href: '/chat.html', icon: 'chat', label: 'Chat' }] : []),
          { href: '/emergency-medical.html', icon: 'emergency', label: 'Emergency' },
        ];
    bottom.innerHTML = `
      <nav class="tabbar" aria-label="Primary">
        <div class="tabbar__inner">
          ${tabs.map((tab) => {
            const isHome = tab.label === 'Home';
            return `<a href="${tab.href}" class="tab nav-item${isHome ? ' active' : ''}"${isHome ? ' id="homeNav"' : ''}>` +
              `${iconSvg[tab.icon] || iconSvg.home}` +
              `<span>${tab.label}</span>` +
              `${isHome ? '<div class="badge" id="homeBadge">3</div>' : ''}` +
            `</a>`;
          }).join('')}
        </div>
      </nav>
    `;
    updateHomeBadge();
    document.getElementById('homeNav')?.addEventListener('click', () => {
      const badge = document.getElementById('homeBadge');
      if (badge) badge.style.display = 'none';
    });
  }
  renderBottomBar();
  window.addEventListener('storage', (event) => {
    if (event.key === MODE_KEY || event.key === APP_CONFIG_KEY) renderBottomBar();
  });


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
