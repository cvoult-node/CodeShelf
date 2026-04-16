// navbar-html.js — returns the full navbar HTML string
// activeLink: 'explore' | 'feed' | 'profile' | null
export function navbarHTML(activeLink = null) {
  const a = (id) => id === activeLink ? ' active' : '';
  return `
<nav class="navbar">
  <a href="social.html" class="navbar-logo">CODESHELF</a>
  <div class="navbar-links">
    <a href="social.html" class="nav-link${a('explore')}">EXPLORAR</a>
    <a href="feed.html"   class="nav-link${a('feed')}">MIS FUENTES</a>
    <div class="nav-avatar-wrap">
      <div class="nav-avatar" id="nav-avatar" tabindex="0" role="button" aria-label="Menú de usuario">U</div>
      <div class="nav-dropdown" id="nav-dropdown">
        <div class="dd-user">
          <div class="dd-avatar-sm" id="dd-avatar-sm">U</div>
          <div>
            <div class="dd-user-name"  id="dd-user-name">—</div>
            <div class="dd-user-email" id="dd-user-email">—</div>
          </div>
        </div>
        <div class="dd-section">
          <div class="dd-label">NAVEGAR</div>
          <a href="social.html" class="dd-item">
            <img class="dd-icon" src="src/icons/explore.svg" alt="">Explorar fuentes
          </a>
          <a href="feed.html" class="dd-item">
            <img class="dd-icon" src="src/icons/fonts.svg" alt="">Mis fuentes
          </a>
        </div>
        <div class="dd-section">
          <div class="dd-label">CUENTA</div>
          <a href="profile.html" class="dd-item">
            <img class="dd-icon" src="src/icons/user.svg" alt="">Mi perfil
          </a>
          <button class="dd-item" id="dd-theme">
            <img class="dd-icon theme-icon" src="src/icons/theme.svg" id="dd-theme-icon" alt="">
            <span id="dd-theme-label">Tema oscuro</span>
          </button>
          <button class="dd-item danger" id="dd-logout">
            <img class="dd-icon" src="src/icons/logout.svg" alt="">Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  </div>
</nav>`;
}
