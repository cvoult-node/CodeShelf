// ─────────────────────────────────────────────
//  Feed.js  —  DOM vanilla puro
// ─────────────────────────────────────────────
import { signOut } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { auth, db, setDoc, doc, collection, query, where, orderBy, limit, getDocs } from './firebase.js';
import { createGlyphGrid, countGlyphs } from './pixelRenderer.js';

export function renderFeed(proyectos, onOpen, onDelete, onRename, onConfirm) {
  const container = document.getElementById('projects-list');
  if (!container) return;
  container.innerHTML = '';

  if (!proyectos || proyectos.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <img class="empty-icon" src="src/icons/fonts.svg" alt="">
        <div class="empty-title">SIN PROYECTOS AÚN</div>
        <p class="empty-sub">Crea tu primera fuente pixel con el botón de arriba</p>
      </div>`;
    return;
  }

  proyectos.forEach(proyecto => {
    const card = document.createElement('div');
    card.className = 'card';
    const glyphCount = countGlyphs(proyecto.font);

    const GRID_LABEL = `${proyecto.gridSize || 8}×${proyecto.gridSize || 8}PX`;

    card.innerHTML = `
      <div class="card-top-line"></div>
      <div class="card-inner">
        <div class="card-header">
          <div class="card-icon">F</div>
          <div class="card-info">
            <div class="card-title-row">
              <div class="p-title" data-id="${proyecto.id}">${proyecto.nombre || 'Sin nombre'}</div>
              <button class="btn-edit-name" title="Renombrar" data-id="${proyecto.id}">
                <img src="src/icons/edit.svg" style="width:12px;height:12px;filter:var(--icon-filter);opacity:.4;">
              </button>
            </div>
            <div class="p-meta">${GRID_LABEL} · ${glyphCount} GLIFO${glyphCount !== 1 ? 'S' : ''}</div>
          </div>
        </div>
        <div class="card-preview p-preview"></div>
        <div class="card-actions">
          <button class="btn-open">ABRIR</button>
          <button class="btn-del" title="Eliminar">
            <img src="src/icons/delete.svg" alt="Eliminar" style="width:15px;height:15px;filter:var(--icon-filter);opacity:.45;">
          </button>
        </div>
      </div>`;

    renderMiniPreview(card.querySelector('.p-preview'), proyecto);
    card.querySelector('.btn-open').onclick = () => onOpen(proyecto);
    card.querySelector('.btn-del').onclick  = (e) => {
      e.stopPropagation();
      if (typeof onConfirm === 'function') {
        onConfirm(`¿Borrar "${proyecto.nombre}"?`, () => onDelete(proyecto.id));
      } else if (confirm(`¿Borrar "${proyecto.nombre}"?`)) {
        onDelete(proyecto.id);
      }
    };

    // ── Inline rename ──
    const titleEl  = card.querySelector('.p-title');
    const editBtn  = card.querySelector('.btn-edit-name');
    editBtn.onclick = (e) => {
      e.stopPropagation();
      activateRename(titleEl, proyecto, onRename);
    };
    titleEl.ondblclick = (e) => {
      e.stopPropagation();
      activateRename(titleEl, proyecto, onRename);
    };

    card.ondblclick = (e) => {
      if (!e.target.closest('.btn-edit-name') && !e.target.closest('.p-title')) {
        onOpen(proyecto);
      }
    };
    container.appendChild(card);
  });
}

function activateRename(titleEl, proyecto, onRename) {
  const currentName = proyecto.nombre || '';
  const input = document.createElement('input');
  input.value = currentName;
  input.className = 'inline-rename-input';
  input.style.cssText = `
    background: var(--surface3); border: 1px solid var(--accent);
    border-radius: 5px; padding: 2px 8px; color: var(--text);
    font-family: var(--mono); font-weight: 700; font-size: 13px;
    outline: none; width: 100%; max-width: 220px;
  `;
  titleEl.replaceWith(input);
  input.focus(); input.select();

  const commit = () => {
    const newName = input.value.trim() || currentName;
    const newTitleEl = document.createElement('div');
    newTitleEl.className = 'p-title';
    newTitleEl.dataset.id = proyecto.id;
    newTitleEl.textContent = newName;
    input.replaceWith(newTitleEl);
    if (newName !== currentName) {
      proyecto.nombre = newName;
      onRename && onRename(proyecto.id, newName);
    }
    // re-attach dblclick handler
    newTitleEl.ondblclick = (e) => { e.stopPropagation(); activateRename(newTitleEl, proyecto, onRename); };
  };

  input.onblur  = commit;
  input.onkeydown = (e) => {
    if (e.key === 'Enter')  { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.value = currentName; input.blur(); }
  };
}

function renderMiniPreview(container, proyecto) {
  container.innerHTML = '';
  const size = proyecto.gridSize || 8;
  ['A','B','C','D'].forEach(char => {
    const glyph = proyecto.font?.[char] || [];
    const grid  = createGlyphGrid(glyph, size, 3, 'var(--accent)');
    container.appendChild(grid);
  });
}

export async function cargarFuentesComunidad(currentUid) {
  const q = query(collection(db, 'posts'), where('uid', '!=', currentUid), orderBy('uid'), orderBy('publishedAt', 'desc'), limit(12));
  const snp = await getDocs(q);
  return snp.docs.map(d => ({ id: d.id, ...d.data() }));
}

export function renderComunidad(posts, onImport) {
  const list = document.getElementById('community-list');
  const count = document.getElementById('community-count');
  if (count) count.textContent = `${posts.length} DISPONIBLE${posts.length === 1 ? '' : 'S'}`;
  if (!list) return;
  list.innerHTML = '';
  if (!posts.length) {
    list.innerHTML = '<div class="community-card"><div class="community-meta">No hay fuentes publicadas por otros usuarios todavía.</div></div>';
    return;
  }
  posts.forEach(post => {
    const card = document.createElement('div');
    card.className = 'community-card';
    card.innerHTML = `
      <div>
        <div class="community-name">${post.fontNombre || 'Sin nombre'}</div>
        <div class="community-meta">por ${post.autorNombre || post.autorEmail || 'Anónimo'} · ${post.gridSize || 8}px</div>
      </div>
      <button class="btn-download">IMPORTAR</button>
    `;
    card.querySelector('.btn-download').onclick = () => onImport(post);
    list.appendChild(card);
  });
}

export function importarFuente(user, post, onSuccess, onConfirm) {
  const doImport = () => {
    const id = Date.now().toString();
    const nuevoProyecto = {
      nombre: `${post.fontNombre} (Copia)`,
      gridSize: post.gridSize || 8,
      font: post.font || {},
      updatedAt: new Date(),
      importadoDe: post.id
    };
    setDoc(doc(db, 'usuarios', user.uid, 'proyectos', id), nuevoProyecto)
      .then(() => { onSuccess && onSuccess(); })
      .catch(err => {
        console.error(err);
        alert('Error al importar la fuente.');
      });
  };

  if (typeof onConfirm === 'function') {
    onConfirm(`¿Importar "${post.fontNombre}" a tus proyectos?`, doImport);
  } else if (confirm(`¿Importar "${post.fontNombre}" a tus proyectos?`)) {
    doImport();
  }
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

  let selectedSize = 8;

  const sizeButtons = document.querySelectorAll('.grid-size-btn');
  sizeButtons.forEach(btn => {
    btn.onclick = () => {
      sizeButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedSize = parseInt(btn.dataset.size, 10);
    };
  });

  const defaultBtn = document.querySelector('.grid-size-btn[data-size="8"]');
  if (defaultBtn) defaultBtn.classList.add('active');

  btnConf._onCreate = onCreateProject;

  btnNew.onclick    = () => {
    modal.classList.remove('hidden');
    inputName.value = '';
    inputName.focus();
    selectedSize = 8;
    sizeButtons.forEach(b => b.classList.remove('active'));
    if (defaultBtn) defaultBtn.classList.add('active');
  };
  btnClose.onclick  = () => modal.classList.add('hidden');
  modal.onclick     = (e) => { if (e.target === modal) modal.classList.add('hidden'); };
  inputName.onkeydown = (e) => { if (e.key === 'Enter') btnConf.click(); };

  btnConf.onclick = async () => {
    const nombre = inputName.value.trim();
    if (!nombre) {
      inputName.focus();
      inputName.style.borderColor = 'var(--accent)';
      setTimeout(() => inputName.style.borderColor = '', 1000);
      return;
    }
    const validName = /^[A-Za-z0-9À-ÖØ-öø-ÿ\u00C0-\u024F\- ]+$/.test(nombre)
    if (!validName) {
      inputName.focus();
      inputName.style.borderColor = 'var(--accent)';
      setTimeout(() => inputName.style.borderColor = '', 1000);
      alert('Usa solo letras, números, espacios y guiones.');
      return;
    }
    btnConf.disabled = true; btnConf.textContent = '...';
    try { await btnConf._onCreate(nombre, selectedSize); }
    catch (err) { console.error(err); alert('No se pudo crear el proyecto.'); }
    finally { btnConf.disabled = false; btnConf.textContent = 'CREAR'; modal.classList.add('hidden'); }
  };
}
