/* ============================================================
   File:        apps/web/public/theme-init.js
   Module:      web
   Brief:       Sets the theme on <html> before the first paint (no flash of the wrong theme).
   Responsibility: the Seasonal Entertainment website's theme logic: a stored choice
                (localStorage `se.theme`, "light" or "dark") wins; otherwise the system
                setting (prefers-color-scheme). Loaded synchronously from index.html as an
                external file, because the strict CSP forbids inline scripts. Storage access
                may throw (blocked storage); the system setting applies then. React keeps the
                attribute in step afterwards (../src/shell/theme.ts, same resolution).
   Spec:        docs/spec/01-game-design.md §13; Seasonal Entertainment docs/DESIGN.md "Theme logic"
   ============================================================ */
(function () {
  var stored = null;
  try {
    stored = window.localStorage.getItem('se.theme');
  } catch (e) {
    stored = null;
  }
  var theme =
    stored === 'light' || stored === 'dark'
      ? stored
      : window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
  document.documentElement.setAttribute('data-theme', theme);
})();
