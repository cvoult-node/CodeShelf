import { auth, db, signOut, doc, deleteDoc } from './firebase.js';

export function renderFeed(proyectos, onOpen) {
  const listContainer = document.getElementById('projects-list');
  const template = document.getElementById('card-template');
  
  listContainer.innerHTML = ''; // Limpiar lista

  if (proyectos.length === 0) {
    listContainer.innerHTML = '<p class="empty-msg">SIN PROYECTOS AÚN</p>';
    return;
  }

  proyectos.forEach(proyecto => {
    const clone = template.content.cloneNode(true);
    
    // Inyectar datos
    clone.querySelector('.project-name').textContent = proyecto.nombre || 'Sin nombre';
    clone.querySelector('.project-initial').textContent = (proyecto.nombre?.[0] || 'F').toUpperCase();
    
    const glyphsCount = Object.keys(proyecto.font || {}).length;
    clone.querySelector('.project-details').textContent = `${proyecto.gridSize}PX · ${glyphsCount} GLIFOS`;

    // Lógica del botón Abrir
    clone.querySelector('.btn-open').onclick = () => onOpen(proyecto);

    // Lógica del botón Borrar
    clone.querySelector('.btn-delete').onclick = async () => {
      if(confirm(`¿Eliminar ${proyecto.nombre}?`)) {
        await deleteDoc(doc(db, "proyectos", proyecto.id));
        // Aquí podrías disparar un refresco de la lista
      }
    };

    // Generar Preview de Píxeles (ABC)
    const previewDiv = clone.querySelector('.pixel-preview');
    renderPreview(previewDiv, proyecto);

    listContainer.appendChild(clone);
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