// scripts/load-bottom-tabs.js
(() => {
  const ID = "bottom-tabs";

  // Single source of truth for tabs (Emergency included)
  const ITEMS = [
    { href: "index.html",               icon: "🏠", label: "Home"      },
    { href: "calendar.html",            icon: "🗓️", label: "Calendar"  },
    { href: "dashboard.html",           icon: "📊", label: "Reports"   },
    { href: "documents/documents.html", icon: "🗂️", label: "Docs"      },
    { href: "chat.html",                icon: "💬", label: "Chat"      },
    { href: "emergency-medical.html",   icon: "🚑", label: "Emergency" },
  ];

  function normalize(href) {
    // treat absolute/relative uniformly when comparing to current page
    const a = document.createElement("a");
    a.href = href;
    return (a.pathname.split("/").pop() || "").toLowerCase();
  }

  function hereName() {
    return (location.pathname.split("/").pop() || "").toLowerCase();
  }

  function render() {
    let bar = document.getElementById(ID);
    if (!bar) {
      bar = document.createElement("nav");
      bar.id = ID;
      bar.className = "bottom-tabs tabs tabs--six";
      document.body.appendChild(bar);
    }
    if (bar.dataset.wired === "1") return;

    const current = hereName();

    bar.innerHTML = ITEMS.map(i => {
      const match = normalize(i.href) === current;
      return `
        <a href="${i.href}" class="${match ? "active" : ""}" aria-label="${i.label}">
          <span class="icon">${i.icon}</span>
          <span class="label">${i.label}</span>
        </a>`;
    }).join("");

    bar.dataset.wired = "1";
  }

  document.addEventListener("DOMContentLoaded", render);
})();
