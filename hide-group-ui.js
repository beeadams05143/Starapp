// hide-group-ui.js — remove legacy dropdown navbar / placeholders
(() => {
  const zap = () => {
    // direct hits
    document.querySelectorAll('#navMenu, label[for="navMenu"], #navbar').forEach(el => el.remove());

    // any <select> that looks like the old "Menu" control
    document.querySelectorAll('select').forEach(sel => {
      const idIsMenu = sel.id && /navmenu|menu/i.test(sel.id);
      const nameIsMenu = sel.name && /menu/i.test(sel.name);
      const label = (sel.labels && sel.labels[0]) || sel.closest('label');
      const textIsMenu = label && /menu/i.test(label.textContent || '');
      if (idIsMenu || nameIsMenu || textIsMenu) {
        if (label) label.remove();
        else sel.remove();
      }
    });
  };

  zap();
  // keep it gone if something injects it later
  new MutationObserver(zap).observe(document.documentElement, { childList: true, subtree: true });
})();
