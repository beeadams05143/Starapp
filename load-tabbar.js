// load-tabbar.js

function pathActive(which) {
  const p = location.pathname.toLowerCase();

  if (which === "home") {
    // treat dashboard as HOME (and also handle root or old /index.html)
    return (
      p.endsWith("/dashboard.html") ||
      p.endsWith("/index.html") ||
      p === "/" ||
      p === ""
    );
  }

  if (which === "calendar") {
    // adjust if you later move calendar into a folder
    return p.endsWith("/calendar.html") || p.includes("/calendar/");
  }

  if (which === "reports") {
    // mark reports active on either report page
    return p.includes("/mood-report") || p.includes("/caregiver-report");
  }

  if (which === "docs") {
    return p.includes("/documents/");
  }

  return false;
}

function ensureHost() {
  let el = document.getElementById("tabbar");
  if (!el) {
    el = document.createElement("div");
    el.id = "tabbar";
    document.body.appendChild(el);
  }
  return el;
}

function toAbs(href) {
  if (/^https?:\/\//i.test(href) || href.startsWith("/")) return href;
  return "/" + href.replace(/^\/+/, "");
}

function renderTabbar() {
  const host = ensureHost();

  // ROUTES — make HOME point to dashboard
  const ROUTES = {
    home: "dashboard.html",
    calendar: "calendar.html",            // use "calendar/calendar.html" if yours lives in a folder
    reports: "dashboard.html",            // OR set to "mood-report.html" if you prefer
    docs: "documents/documents.html"
  };

  const tabs = [
    { key: "home",     label: "🏠 Home",     href: ROUTES.home },
    { key: "calendar", label: "📅 Calendar", href: ROUTES.calendar },
    { key: "reports",  label: "📊 Reports",  href: ROUTES.reports },
    { key: "docs",     label: "📄 Docs",     href: ROUTES.docs }
  ];

  const html = `
    <nav class="tabbar"
         style="position:fixed;left:0;right:0;bottom:0;display:flex;gap:8px;justify-content:space-around;align-items:center;padding:10px 8px;background:#fff;border-top:1px solid #e5e7eb;z-index:50;">
      ${tabs.map(t => `
        <a href="${toAbs(t.href)}"
           data-key="${t.key}"
           style="flex:1;text-align:center;text-decoration:none;color:${pathActive(t.key) ? '#0ea5e9' : '#334155'};font-weight:${pathActive(t.key) ? '600' : '500'};padding:6px 0;border-radius:10px;">
          <span>${t.label}</span>
        </a>
      `).join("")}
    </nav>
  `;
  host.innerHTML = html;

  // normalize navigation
  host.querySelectorAll('a[data-key]').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = toAbs(a.getAttribute('href'));
    });
  });
}

renderTabbar();
