// ─────────────────────────────────────────────
//  Feed.js  —  DOM vanilla puro
//  Sin dependencias de React.
//  Llamado desde feed.html vía script type="module"
// ─────────────────────────────────────────────

import { signOut } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { auth }    from './firebase.js';

// ── Render lista de proyectos ─────────────────
export function renderFeed(proyectos, onOpen, onDelete) {
  const container = document.getElementById('projects-list');
  const template  = document.getElementById('tpl-project');
  if (!container || !template) return;

  container.innerHTML = '';

  if (!proyectos || proyectos.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span>✏️</span>
        SIN PROYECTOS AÚN<br><br>
        <span style="font-size:9px;opacity:0.7">Crea tu primera fuente pixel</span>
      </div>`;
    return;
  }

  proyectos.forEach(proyecto => {
    const clone = template.content.cloneNode(true);

    // Textos
    clone.querySelector('.p-title').textContent = proyecto.nombre || 'Sin nombre';
    const glyphCount = Object.values(proyecto.font || {})
      .filter(g => Array.isArray(g) && g.some(Boolean)).length;
    clone.querySelector('.p-meta').textContent =
      `${proyecto.gridSize || 8}PX · ${glyphCount} GLIFO${glyphCount !== 1 ? 'S' : ''}`;

    // Preview ABC
    const preview = clone.querySelector('.p-preview');
    if (preview) renderMiniPreview(preview, proyecto);

    // Botones
    clone.querySelector('.btn-open').onclick = () => onOpen(proyecto);
    clone.querySelector('.btn-del').onclick  = (e) => {
      e.stopPropagation();
      if (confirm(`¿Borrar "${proyecto.nombre}"?`)) onDelete(proyecto.id);
    };

    container.appendChild(clone);
  });
}

// ── Mini preview (A B C) ──────────────────────
function renderMiniPreview(container, proyecto) {
  container.innerHTML = '';
  const chars = ['A', 'B', 'C'];
  const size  = proyecto.gridSize || 8;

  chars.forEach(char => {
    const glyph = proyecto.font?.[char] || [];

    const grid = document.createElement('div');
    grid.style.cssText = `
      display: grid;
      grid-template-columns: repeat(${size}, 3px);
      gap: 0;
    `;

    for (let i = 0; i < size * size; i++) {
      const px = document.createElement('div');
      px.style.cssText = `
        width: 3px; height: 3px;
        background: ${glyph[i] ? '#e62222' : 'rgba(255,255,255,0.04)'};
      `;
      grid.appendChild(px);
    }
    container.appendChild(grid);
  });
}

// ── Eventos del modal de creación ────────────
//    Se llama UNA sola vez tras montar el feed.
let feedEventsInit = false;
export function initFeedEvents(onCreateProject) {
  // Evitar doble-bind si renderFeed se llama varias veces
  if (feedEventsInit) {
    // Re-bind solo el confirm por si onCreateProject cambió
    const btn = document.getElementById('confirm-create');
    if (btn) btn._onCreate = onCreateProject;
    return;
  }
  feedEventsInit = true;

  const modal      = document.getElementById('modal-overlay');
  const btnNew     = document.getElementById('btn-new-font');
  const btnClose   = document.getElementById('close-modal');
  const btnConfirm = document.getElementById('confirm-create');
  const inputName  = document.getElementById('new-font-name');

  if (!modal || !btnNew || !btnClose || !btnConfirm || !inputName) {
    console.warn('Feed: faltan elementos del modal');
    return;
  }

  // Guardar referencia mutable al callback
  btnConfirm._onCreate = onCreateProject;

  // Abrir modal
  btnNew.onclick = () => {
    modal.classList.remove('hidden');
    inputName.value = '';
    inputName.focus();
  };

  // Cerrar modal
  btnClose.onclick = () => modal.classList.add('hidden');

  // Cerrar al click fuera del box
  modal.onclick = (e) => {
    if (e.target === modal) modal.classList.add('hidden');
  };

  // Enter en el input
  inputName.onkeydown = (e) => {
    if (e.key === 'Enter') btnConfirm.click();
  };

  // Confirmar creación
  btnConfirm.onclick = async () => {
    const nombre = inputName.value.trim();
    if (!nombre) {
      inputName.focus();
      inputName.style.borderColor = '#e62222';
      setTimeout(() => inputName.style.borderColor = '', 1000);
      return;
    }

    btnConfirm.disabled    = true;
    btnConfirm.textContent = '...';

    try {
      await btnConfirm._onCreate(nombre, 8);
    } catch (err) {
      console.error('Error creando proyecto:', err);
      alert('No se pudo crear el proyecto. Inténtalo de nuevo.');
    } finally {
      btnConfirm.disabled    = false;
      btnConfirm.textContent = 'CREAR';
      modal.classList.add('hidden');
    }
  };
}