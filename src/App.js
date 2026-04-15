// ─────────────────────────────────────────────
//  App.js  —  Editor React
// ─────────────────────────────────────────────
import React, { useState, useEffect, useRef, useCallback } from 'https://esm.sh/react@18.2.0';
import ReactDOM from 'https://esm.sh/react-dom@18.2.0/client';
import opentype from 'https://esm.sh/opentype.js';

import { auth, db, onAuthStateChanged, doc, setDoc } from './firebase.js';
import { ACCENT, FONT_MONO, FONT_PIXEL } from './constants.js';
import { floodFill, shiftGrid } from './canvas.js';
import { EditorPage } from './Editor.js';
import { publishFont } from './publish.js';
import { Overlay, Modal, Btn } from './ui.js';

window.__opentype__ = opentype;

// ── ConfirmDialog — reemplaza confirm() nativo ─────────────────
function ConfirmDialog({ message, onConfirm, onCancel }) {
  return React.createElement(Overlay, { onClose: onCancel },
    React.createElement(Modal, { style: { maxWidth: '320px', gap: '20px' } },
      React.createElement('p', {
        style: { fontFamily: FONT_MONO, fontSize: '13px', color: 'var(--text)', lineHeight: 1.5, margin: 0 }
      }, message),
      React.createElement('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end' } },
        React.createElement(Btn, { onClick: onCancel,
          style: { background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', fontSize: '12px', padding: '6px 14px' }
        }, 'Cancelar'),
        React.createElement(Btn, { onClick: onConfirm,
          style: { background: '#E24B4A', border: 'none', color: '#fff', fontSize: '12px', padding: '6px 14px' }
        }, 'Confirmar')
      )
    )
  );
}

function App() {
  // ── Theme ──────────────────────────────────
  const [theme, setTheme] = useState(() => localStorage.getItem('cs-theme') || 'light');
  const isDark = theme === 'dark';
  const toggleTheme = () => {
    const t = theme === 'dark' ? 'light' : 'dark';
    setTheme(t); localStorage.setItem('cs-theme', t);
  };
  useEffect(() => { document.documentElement.className = theme; }, [theme]);

  // ── Estado ──────────────────────────────────
  const [status,        setStatus]        = useState('loading');
  const [user,          setUser]          = useState(null);
  const [errorMsg,      setErrorMsg]      = useState('');
  const [proyectoActivo,setProyectoActivo] = useState(null);
  const [proyectoNombre,setProyectoNombre] = useState('mi-fuente');
  const [gridSize,      setGridSize]      = useState(8);
  const [currentChar,   setCurrentChar]   = useState('A');
  const [fontData,      setFontData]      = useState({});
  const [grid,          setGrid]          = useState([]);
  const [isSaving,      setIsSaving]      = useState(false);
  const [tool,          setTool]          = useState('pencil');
  const [previewText,   setPreviewText]   = useState('CodeShelf');
  const [isPublishing,  setIsPublishing]  = useState(false);
  const [publishedOk,   setPublishedOk]   = useState(false);
  // Para reemplazar confirm() nativo con modal personalizado
  const [confirmDialog, setConfirmDialog] = useState(null); // { message, onConfirm }

  // ── Undo / Redo ──────────────────────────────
  const undoStack = useRef([]);   // array de snapshots { char, grid }
  const redoStack = useRef([]);

  const pushHistory = useCallback((char, g) => {
    undoStack.current.push({ char, grid: [...g] });
    if (undoStack.current.length > 50) undoStack.current.shift(); // máx 50 pasos
    redoStack.current = []; // nueva acción borra el redo
  }, []);

  const handleUndo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push({ char: currentChar, grid: [...(fontData[currentChar] || [])] });
    setCurrentChar(prev.char);
    setGrid(prev.grid);
    setFontData(fd => {
      const nfd = { ...fd, [prev.char]: prev.grid };
      scheduleSave(nfd);
      return nfd;
    });
  }, [currentChar, fontData, scheduleSave]);

  const handleRedo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push({ char: currentChar, grid: [...(fontData[currentChar] || [])] });
    setCurrentChar(next.char);
    setGrid(next.grid);
    setFontData(fd => {
      const nfd = { ...fd, [next.char]: next.grid };
      scheduleSave(nfd);
      return nfd;
    });
  }, [currentChar, fontData, scheduleSave]);

  const isDrawing = useRef(false);
  const drawMode  = useRef(true);
  // Debounce: evita escribir a Firestore en cada pixel mientras se dibuja
  const debouncedSaveTimer = useRef(null);
  const scheduleSave = useCallback((data) => {
    clearTimeout(debouncedSaveTimer.current);
    debouncedSaveTimer.current = setTimeout(() => handleSaveFont(data), 800);
  }, [handleSaveFont]);

  // ── Init ────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) { window.location.replace('feed.html'); return; }
      const raw = sessionStorage.getItem('proyectoActivo');
      if (!raw) { window.location.replace('feed.html'); return; }
      try {
        const p = JSON.parse(raw);
        if (!p || !p.id) throw new Error('Proyecto sin id');
        setUser(u);
        setProyectoActivo(p.id);
        setProyectoNombre(p.nombre || 'mi-fuente');
        setGridSize(p.gridSize || 8);
        setFontData(p.font || {});
        setGrid((p.font?.['A']) ? p.font['A'] : Array((p.gridSize || 8) * (p.gridSize || 8)).fill(false));
        setCurrentChar('A');
        setStatus('ready');
      } catch (e) {
        setErrorMsg('Proyecto inválido. Volviendo...');
        setStatus('error');
        setTimeout(() => window.location.replace('feed.html'), 2000);
      }
    });
    return unsub;
  }, []);

  // ── Save ────────────────────────────────────
  const handleSaveFont = useCallback(async (data) => {
    if (!user || !proyectoActivo) return;
    setIsSaving(true);
    try {
      await setDoc(
        doc(db, 'usuarios', user.uid, 'proyectos', proyectoActivo),
        { font: data, gridSize, updatedAt: new Date() },
        { merge: true }
      );
      const raw = sessionStorage.getItem('proyectoActivo');
      if (raw) {
        const p = JSON.parse(raw);
        sessionStorage.setItem('proyectoActivo', JSON.stringify({ ...p, font: data, gridSize }));
      }
    } catch (err) { console.error(err); alert('Error al guardar'); }
    setIsSaving(false);
  }, [user, proyectoActivo, gridSize]);

  // ── Publish ─────────────────────────────────
  const handlePublish = useCallback(async (prevText) => {
    if (!user || !proyectoActivo) return;
    setIsPublishing(true);
    try {
      await publishFont(user, {
        id:       proyectoActivo,
        nombre:   proyectoNombre,
        gridSize,
        font:     fontData
      }, prevText || 'HELLO');
      setPublishedOk(true);
    } catch (err) {
      console.error(err);
      alert('Error al publicar: ' + err.message);
    }
    setIsPublishing(false);
  }, [user, proyectoActivo, proyectoNombre, gridSize, fontData]);

  // ── Canvas tools ────────────────────────────
  const applyPixelTool = useCallback((prevGrid, i) => {
    const g = [...prevGrid], r = Math.floor(i / gridSize), c = i % gridSize, dv = drawMode.current;
    if (tool === 'fill')     return floodFill(prevGrid, gridSize, i, dv);
    if (tool === 'mirror-h') { g[i] = dv; g[r * gridSize + (gridSize - 1 - c)] = dv; return g; }
    if (tool === 'mirror-v') { g[i] = dv; g[(gridSize - 1 - r) * gridSize + c] = dv; return g; }
    g[i] = dv; return g;
  }, [tool, gridSize]);

  const handlePixelDown = useCallback((i, _val, isRight) => {
    isDrawing.current = true; drawMode.current = !isRight;
    pushHistory(currentChar, grid);
    if (tool === 'fill') {
      const filled = floodFill(grid, gridSize, i, drawMode.current);
      setGrid(filled);
      setFontData(fd => { const nfd = { ...fd, [currentChar]: filled }; handleSaveFont(nfd); return nfd; });
      return;
    }
    setGrid(prev => { const next = applyPixelTool(prev, i); setFontData(fd => ({ ...fd, [currentChar]: next })); return next; });
  }, [tool, grid, gridSize, currentChar, applyPixelTool, handleSaveFont, pushHistory]);

  const handlePixelEnter = useCallback((i) => {
    if (!isDrawing.current || tool === 'fill') return;
    setGrid(prev => {
      const next = applyPixelTool(prev, i);
      setFontData(fd => {
        const nfd = { ...fd, [currentChar]: next };
        scheduleSave(nfd); // debounced — no escribe en cada pixel
        return nfd;
      });
      return next;
    });
  }, [tool, currentChar, applyPixelTool, scheduleSave]);

  const handleMouseUp = useCallback(() => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    setFontData(fd => { handleSaveFont(fd); return fd; });
  }, [handleSaveFont]);

  const switchChar = (char) => {
    if (currentChar === char) return;
    setCurrentChar(char);
    setGrid(fontData[char] || Array(gridSize * gridSize).fill(false));
  };

  const clearCanvas = () => {
    setConfirmDialog({
      message: '¿Limpiar esta letra? Esta acción no se puede deshacer.',
      onConfirm: () => {
        const empty = Array(gridSize * gridSize).fill(false);
        setGrid(empty);
        setFontData(prev => { const fd = { ...prev, [currentChar]: empty }; handleSaveFont(fd); return fd; });
        setConfirmDialog(null);
      }
    });
  };

  const invertCanvas = () => {
    pushHistory(currentChar, grid);
    setGrid(prev => {
      const inv = prev.map(p => !p);
      setFontData(fd => { const nfd = { ...fd, [currentChar]: inv }; handleSaveFont(nfd); return nfd; });
      return inv;
    });
  };

  const doShift = (dir) => {
    pushHistory(currentChar, grid);
    setGrid(prev => {
      const s = shiftGrid(prev, gridSize, dir);
      setFontData(fd => { const nfd = { ...fd, [currentChar]: s }; handleSaveFont(nfd); return nfd; });
      return s;
    });
  };

  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 's') { e.preventDefault(); handleSaveFont(fontData); return; }
        if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); return; }
        if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); handleRedo(); return; }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [fontData, handleSaveFont, handleUndo, handleRedo]);

  // ── Loading / error states ───────────────────
  if (status === 'loading') {
    return React.createElement('div', {
      style: { height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '18px' }
    },
      React.createElement('style', null, '@keyframes cs-pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }'),
      React.createElement('span', {
        style: { fontFamily: FONT_PIXEL, fontSize: '10px', color: ACCENT, letterSpacing: '4px', animation: 'cs-pulse 1.4s ease-in-out infinite' }
      }, 'CARGANDO...'),
      React.createElement('div', {
        style: { width: '160px', height: '1px', background: `linear-gradient(90deg, transparent, ${ACCENT}, transparent)`, animation: 'cs-pulse 1.4s ease-in-out infinite' }
      })
    );
  }

  if (status === 'error') {
    return React.createElement('div', {
      style: { height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT_MONO, color: ACCENT, fontSize: '12px', letterSpacing: '2px' }
    }, errorMsg);
  }

  return React.createElement(React.Fragment, null,
    React.createElement(EditorPage, {
      user, isDark, toggleTheme,
      gridSize, currentChar, fontData, grid, isSaving,
      tool, setTool, previewText, setPreviewText,
      onPixelDown:   handlePixelDown,
      onPixelEnter:  handlePixelEnter,
      onMouseUp:     handleMouseUp,
      onSwitchChar:  switchChar,
      onClearCanvas: clearCanvas,
      onInvert:      invertCanvas,
      onShift:       doShift,
      onUndo:        handleUndo,
      onRedo:        handleRedo,
      onSave:        () => handleSaveFont(fontData),
      onBack:        () => window.location.replace('feed.html'),
      onPublish:     handlePublish,
      isPublishing,
      publishedOk,
      onResetPublish: () => setPublishedOk(false),
      projectName:   proyectoNombre
    }),
    confirmDialog && React.createElement(ConfirmDialog, {
      message:   confirmDialog.message,
      onConfirm: confirmDialog.onConfirm,
      onCancel:  () => setConfirmDialog(null)
    })
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(App));
