// navbar-shared.js
// Include this script at the bottom of every page that uses the shared navbar.
// It handles: theme toggle, dropdown, and initial avatar hydration.

export function initNavbar({ auth, db, onAuthStateChanged, doc, getDoc }) {
  // ── Theme ─────────────────────────────────────
  function getTheme() {
    return localStorage.getItem('cs-theme') || 'light';
  }
  function applyTheme(t) {
    document.documentElement.className = t;
    localStorage.setItem('cs-theme', t);
    const lbl = document.getElementById('dd-theme-label');
    if (lbl) lbl.textContent = t === 'dark' ? 'Tema claro' : 'Tema oscuro';
    const icon = document.getElementById('dd-theme-icon');
    if (icon) icon.src = t === 'dark' ? 'src/icons/sun.svg' : 'src/icons/moon.svg';
  }
  applyTheme(getTheme());

  // ── Dropdown ──────────────────────────────────
  const avatarBtn = document.getElementById('nav-avatar');
  const dropdown  = document.getElementById('nav-dropdown');

  if (avatarBtn && dropdown) {
    const openDD  = () => { dropdown.classList.add('open'); avatarBtn.classList.add('open'); };
    const closeDD = () => { dropdown.classList.remove('open'); avatarBtn.classList.remove('open'); };
    avatarBtn.addEventListener('click', e => { e.stopPropagation(); dropdown.classList.contains('open') ? closeDD() : openDD(); });
    document.addEventListener('click',   e => { if (!dropdown.contains(e.target) && e.target !== avatarBtn) closeDD(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDD(); });
  }

  const themeBtn = document.getElementById('dd-theme');
  if (themeBtn) themeBtn.addEventListener('click', () => applyTheme(getTheme() === 'dark' ? 'light' : 'dark'));

  // ── Avatar hydration ──────────────────────────
  if (auth && onAuthStateChanged) {
    onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      const avatarEl = document.getElementById('nav-avatar');
      const ddAvatar = document.getElementById('dd-avatar-sm');
      const ddName   = document.getElementById('dd-user-name');
      const ddEmail  = document.getElementById('dd-user-email');
      if (ddEmail) ddEmail.textContent = user.email || '';
      try {
        const snap = await getDoc(doc(db, 'usuarios', user.uid, 'config', 'perfil'));
        const d    = snap.exists() ? snap.data() : {};
        const name = d.displayName || user.email?.split('@')[0] || '?';
        const ini  = name[0].toUpperCase();
        if (avatarEl) avatarEl.textContent = ini;
        if (ddAvatar) ddAvatar.textContent = ini;
        if (ddName)   ddName.textContent   = name;
        if (d.avatarColor && avatarEl) {
          avatarEl.style.borderColor  = d.avatarColor;
          avatarEl.style.color        = d.avatarColor;
          avatarEl.style.background   = d.avatarColor + '20';
        }
      } catch {
        const ini = (user.email || '?')[0].toUpperCase();
        if (avatarEl) avatarEl.textContent = ini;
        if (ddAvatar) ddAvatar.textContent = ini;
        if (ddName)   ddName.textContent   = user.email?.split('@')[0] || '—';
      }
    });
  }
}
