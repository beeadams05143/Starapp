// Staging only: keep the test warning visible without obscuring fields or navigation.
(function () {
  function mount() {
    if (document.getElementById('starSandboxBanner')) return;
    const banner = document.createElement('div');
    banner.id = 'starSandboxBanner';
    banner.setAttribute('role', 'status');
    banner.textContent = '🧪 TEST ENVIRONMENT · Fictional Data Only';
    banner.style.cssText = [
      'position:sticky', 'top:var(--appbar-h,56px)', 'z-index:997',
      'box-sizing:border-box', 'width:max-content', 'max-width:calc(100% - 24px)',
      'margin:4px auto 0', 'padding:5px 11px', 'border:1px solid #c69a42',
      'border-radius:9px', 'background:#fff1c7', 'color:#50350a',
      'font:700 11px system-ui,sans-serif', 'letter-spacing:.015em',
      'text-align:center', 'pointer-events:none'
    ].join(';');
    const appbar = document.getElementById('appbar-host');
    if (appbar) appbar.insertAdjacentElement('afterend', banner);
    else document.body.prepend(banner);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
