// ─────────────────────────────────────────────
//  Feed.js  —  DOM vanilla puro
//  Soporte vista grid / lista. Icono delete SVG.
// ─────────────────────────────────────────────
import { signOut } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { auth }    from './firebase.js';

export function renderFeed(proyectos, onOpen, onDelete) {
  const container = document.getElementById('projects-list');
  if (!container) return;
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
    const card = document.createElement('div');
    card.className = 'card';
    const glyphCount = Object.values(proyecto.font || {})
      .filter(g => Array.isArray(g) && g.some(Boolean)).length;

    card.innerHTML = `
      <div class="card-top-line"></div>
      <div class="card-inner">
        <div class="card-header">
          <div class="card-icon">F</div>
          <div class="card-info">
            <div class="p-title">${proyecto.nombre || 'Sin nombre'}</div>
            <div class="p-meta">${proyecto.gridSize || 8}PX · ${glyphCount} GLIFO${glyphCount !== 1 ? 'S' : ''}</div>
          </div>
        </div>
        <div class="card-preview p-preview"></div>
        <div class="card-actions">
          <button class="btn-open">ABRIR</button>
          <button class="btn-del" title="Eliminar"><img src="src/icons/delete.svg" alt="Agregar"></button>
        </div>
      </div>`;

    renderMiniPreview(card.querySelector('.p-preview'), proyecto);
    card.querySelector('.btn-open').onclick = () => onOpen(proyecto);
    card.querySelector('.btn-del').onclick  = (e) => {
      e.stopPropagation();
      if (confirm(`¿Borrar "${proyecto.nombre}"?`)) onDelete(proyecto.id);
    };
    card.ondblclick = () => onOpen(proyecto);
    container.appendChild(card);
  });
}

function renderMiniPreview(container, proyecto) {
  container.innerHTML = '';
  const size = proyecto.gridSize || 8;
  ['A','B','C'].forEach(char => {
    const glyph = proyecto.font?.[char] || [];
    const grid  = document.createElement('div');
    grid.style.cssText = `display:grid;grid-template-columns:repeat(${size},3px);gap:0;`;
    for (let i = 0; i < size * size; i++) {
      const px = document.createElement('div');
      px.style.cssText = `width:3px;height:3px;background:${glyph[i] ? 'var(--accent)' : 'rgba(200,185,230,0.05)'};`;
      grid.appendChild(px);
    }
    container.appendChild(grid);
  });
}

let feedEventsInit = false;
export function initFeedEvents(onCreateProject) {
  if (feedEventsInit) {
    const btn = document.getElementById('confirm-create');
    if (btn) btn._onCreate = onCreateProject;
    return;
  }
  feedEventsInit = true;

  const modal     = document.getElementById('modal-overlay');
  const btnNew    = document.getElementById('btn-new-font');
  const btnClose  = document.getElementById('close-modal');
  const btnConf   = document.getElementById('confirm-create');
  const inputName = document.getElementById('new-font-name');

  if (!modal || !btnNew || !btnClose || !btnConf || !inputName) return;

  btnConf._onCreate = onCreateProject;

  btnNew.onclick    = () => { modal.classList.remove('hidden'); inputName.value = ''; inputName.focus(); };
  btnClose.onclick  = () => modal.classList.add('hidden');
  modal.onclick     = (e) => { if (e.target === modal) modal.classList.add('hidden'); };
  inputName.onkeydown = (e) => { if (e.key === 'Enter') btnConf.click(); };

  btnConf.onclick = async () => {
    const nombre = inputName.value.trim();
    if (!nombre) { inputName.focus(); inputName.style.borderColor = 'var(--accent)'; setTimeout(() => inputName.style.borderColor = '', 1000); return; }
    btnConf.disabled = true; btnConf.textContent = '...';
    try { await btnConf._onCreate(nombre, 8); }
    catch (err) { console.error(err); alert('No se pudo crear el proyecto.'); }
    finally { btnConf.disabled = false; btnConf.textContent = 'CREAR'; modal.classList.add('hidden'); }
  };
}