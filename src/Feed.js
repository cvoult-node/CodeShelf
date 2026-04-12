
import { signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { auth, db } from './firebase.js'; 
import { doc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
/**
 * RENDERIZA LA LISTA DE PROYECTOS
 */
export function renderFeed(proyectos, onOpen, onDelete) {
    const container = document.getElementById('projects-list');
    const template = document.getElementById('tpl-project');
    
    if (!container || !template) return;
    container.innerHTML = ''; 

    if (proyectos.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:48px; color:var(--text-muted); font-size:10px; letter-spacing:3px;">SIN PROYECTOS AÚN</div>';
        return;
    }

    proyectos.forEach(proyecto => {
        const clone = template.content.cloneNode(true);
        
        // 1. Rellenar textos
        clone.querySelector('.p-title').textContent = proyecto.nombre || 'Sin nombre';
        
        // Calcular glifos reales (que tengan algún píxel pintado)
        const glyphsCount = Object.values(proyecto.font || {}).filter(g => g?.some(Boolean)).length;
        clone.querySelector('.p-meta').textContent = `${proyecto.gridSize}PX · ${glyphsCount} GLIFOS`;
        
        // 2. Dibujar Preview (Llamada a la función interna)
        const previewContainer = clone.querySelector('.p-preview');
        if (previewContainer) {
            renderPreview(previewContainer, proyecto);
        }

        // 3. Configurar botones
        const btnOpen = clone.querySelector('.btn-open');
        if (btnOpen) btnOpen.onclick = () => onOpen(proyecto);

        const btnDel = clone.querySelector('.btn-del');
        if (btnDel) {
            btnDel.onclick = (e) => {
                e.stopPropagation();
                if(confirm(`¿Seguro que quieres borrar "${proyecto.nombre}"?`)) {
                    onDelete(proyecto.id);
                }
            };
        }

        container.appendChild(clone);
    });
}

/**
 * DIBUJA LOS MINI PÍXELES (ABC)
 */
function renderPreview(container, proyecto) {
    container.innerHTML = ''; // Limpiar previo
    const chars = ['A', 'B', 'C'];
    
    chars.forEach(char => {
        const glyph = proyecto.font?.[char] || [];
        const size = proyecto.gridSize || 8;
        
        const miniGrid = document.createElement('div');
        miniGrid.style.display = 'grid';
        miniGrid.style.gridTemplateColumns = `repeat(${size}, 3px)`;
        miniGrid.style.gap = '0px';
        
        // Dibujamos solo si hay datos, si no, mostramos rejilla vacía
        const totalPixels = size * size;
        for (let i = 0; i < totalPixels; i++) {
            const px = document.createElement('div');
            px.style.width = '3px';
            px.style.height = '3px';
            // Si el píxel está activo, rojo. Si no, transparente u oscuro.
            px.style.background = glyph[i] ? '#e62222' : 'rgba(255,255,255,0.03)';
            miniGrid.appendChild(px);
        }
        container.appendChild(miniGrid);
    });
}

/**
 * INICIALIZA EVENTOS ESTÁTICOS (Botones que no cambian)
 */
export function initStaticEvents() {
    // Logout
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.onclick = async () => {
            try {
                await signOut(auth);
                window.location.reload();
            } catch (err) {
                console.error("Error al cerrar sesión:", err);
            }
        };
    }

    // Avatar / Menú de usuario
    const profileBtn = document.getElementById('profile-btn');
    if (profileBtn) {
        profileBtn.onclick = () => {
            const menu = document.getElementById('user-menu');
            if (menu) menu.classList.toggle('hidden');
        };
    }
}

export function initFeedEvents(onCreateProject) {
    const btnNew = document.getElementById('btn-new-font'); // El botón con el +
    const modal = document.getElementById('modal-overlay');
    const btnClose = document.getElementById('close-modal');
    const btnConfirm = document.getElementById('confirm-create');
    const inputName = document.getElementById('new-font-name');

    // 1. Abrir Modal
    if (btnNew) {
        btnNew.onclick = () => {
            modal.classList.remove('hidden');
            inputName.focus();
        };
    }

    // 2. Cerrar Modal
    if (btnClose) {
        btnClose.onclick = () => modal.classList.add('hidden');
    }

    // 3. Confirmar Creación
    if (btnConfirm) {
        btnConfirm.onclick = async () => {
            const nombre = inputName.value.trim();
            if (!nombre) return alert("Escribe un nombre");
            
            btnConfirm.disabled = true;
            btnConfirm.textContent = "...";
            
            await onCreateProject(nombre, 8); // Creamos con tamaño 8 por defecto
            
            btnConfirm.disabled = false;
            btnConfirm.textContent = "CREAR";
            inputName.value = "";
            modal.classList.add('hidden');
        };
    }

    // 4. Logout
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.onclick = () => signOut(auth).then(() => window.location.reload());
    }
}