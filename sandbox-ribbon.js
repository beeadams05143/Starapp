// Staging branch only: persistent visible reminder not to enter real care information.
(function () {
  function mount() {
    if (document.getElementById('starSandboxBanner')) return;
    const banner = document.createElement('div');
    banner.id = 'starSandboxBanner';
    banner.setAttribute('role', 'status');
    banner.textContent = '🧪 STAR TEST · FICTIONAL DATA ONLY';
    banner.style.cssText = 'position:fixed;bottom:64px;left:50%;transform:translateX(-50%);max-width:calc(100% - 20px);box-sizing:border-box;padding:8px 13px;border:2px solid #a46b13;border-radius:12px;z-index:2000;background:#fff0be;color:#50350a;font:700 12px system-ui,sans-serif;letter-spacing:.035em;text-align:center;box-shadow:0 5px 14px rgba(0,0,0,.15);pointer-events:none;';
    document.body.appendChild(banner);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();