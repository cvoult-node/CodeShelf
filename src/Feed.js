import { auth, db, signOut, doc, deleteDoc } from './firebase.js';

export function renderFeed(proyectos, onOpen, onDelete) {
  const container = document.getElementById('projects-list');
  const template = document.getElementById('tpl-project'); // El ID que pusimos en el HTML
  
  if (!container || !template) return;
  container.innerHTML = ''; 

  if (proyectos.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:40px; opacity:0.5;">SIN PROYECTOS AÚN</div>';
    return;
  }

  proyectos.forEach(proyecto => {
    const clone = template.content.cloneNode(true);
    
    // Rellenar datos en el HTML real
    clone.querySelector('.p-title').textContent = proyecto.nombre || 'Sin nombre';
    const glyphsCount = Object.keys(proyecto.font || {}).length;
    clone.querySelector('.p-meta').textContent = `${proyecto.gridSize}PX · ${glyphsCount} GLIFOS`;
    
    // Configurar botones
    clone.querySelector('.btn-open').onclick = () => onOpen(proyecto);
    clone.querySelector('.btn-del').onclick = () => {
        if(confirm(`¿Borrar ${proyecto.nombre}?`)) onDelete(proyecto.id);
    };

    container.appendChild(clone);
  });
}

// Función interna para dibujar los mini-píxeles de la tarjeta
function renderPreview(container, proyecto) {
  const chars = ['A', 'B', 'C'];
  chars.forEach(char => {
    const glyph = proyecto.font?.[char] || [];
    const miniGrid = document.createElement('div');
    miniGrid.className = 'mini-grid';
    miniGrid.style.gridTemplateColumns = `repeat(${proyecto.gridSize}, 3px)`;
    
    glyph.forEach(active => {
      const px = document.createElement('div');
      px.style.width = '3px';
      px.style.height = '3px';
      px.style.background = active ? '#ff0000' : 'transparent';
      miniGrid.appendChild(px);
    });
    container.appendChild(miniGrid);
  });
}

// Manejo del Logout
document.getElementById('logout-btn').onclick = () => signOut(auth);