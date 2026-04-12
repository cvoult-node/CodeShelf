// ─────────────────────────────────────────────
//  App.js  —  Editor React
//  Lee el proyecto activo de sessionStorage.
//  Si no hay proyecto, redirige a feed.html.
// ─────────────────────────────────────────────
import React, { useState, useEffect, useRef, useCallback } from 'https://esm.sh/react@18.2.0';
import ReactDOM from 'https://esm.sh/react-dom@18.2.0/client';
import opentype from 'https://esm.sh/opentype.js';

import {
  auth, db, onAuthStateChanged,
  doc, setDoc
} from './firebase.js';

import { ACCENT, FONT_MONO, FONT_PIXEL } from './constants.js';
import { Btn }                           from './ui.js';
import { floodFill, shiftGrid }          from './canvas.js';
import { EditorPage }                    from './Editor.js';

// Exponer opentype globalmente para canvas.js
window.__opentype__ = opentype;

// ─────────────────────────────────────────────
function App() {
  // ── Theme ──────────────────────────────────
  const [theme, setTheme] = useState(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  );
  const isDark      = theme === 'dark';
  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');
  useEffect(() => { document.documentElement.className = theme; }, [theme]);

  // ── Auth ────────────────────────────────────
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  // ── Proyecto (desde sessionStorage) ─────────
  const [proyectoActivo, setProyectoActivo] = useState(null);
  const [proyectoNombre, setProyectoNombre] = useState('mi-fuente');

  // ── Editor state ────────────────────────────
  const [gridSize,    setGridSize]    = useState(8);
  const [currentChar, setCurrentChar] = useState('A');
  const [fontData,    setFontData]    = useState({});
  const [grid,        setGrid]        = useState([]);
  const [isSaving,    setIsSaving]    = useState(false);
  const [tool,        setTool]        = useState('pencil');
  const [previewText, setPreviewText] = useState('CodeShelf');

  const isDrawing = useRef(false);
  const drawMode  = useRef(true);

  // ── Leer proyecto de sessionStorage ─────────
  useEffect(() => {
    const raw = sessionStorage.getItem('proyectoActivo');
    if (!raw) {
      // Sin proyecto activo → volver al feed
      window.location.href = 'feed.html';
      return;
    }
    try {
      const p = JSON.parse(raw);
      setProyectoActivo(p.id);
      setProyectoNombre(p.nombre || 'mi-fuente');
      setGridSize(p.gridSize || 8);
      setFontData(p.font || {});
      setGrid(p.font?.['A'] || Array((p.gridSize || 8) * (p.gridSize || 8)).fill(false));
      setCurrentChar('A');
    } catch (e) {
      console.error('Error leyendo proyecto:', e);
      window.location.href = 'feed.html';
    }
  }, []);

  // ── Auth ─────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => {
      if (!u) {
        // No autenticado → volver al feed (que maneja el login)
        window.location.href = 'feed.html';
        return;
      }
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  // ── Guardar fuente ───────────────────────────
  const handleSaveFont = useCallback(async (data) => {
    if (!user || !proyectoActivo) return;
    setIsSaving(true);
    try {
      await setDoc(
        doc(db, 'usuarios', user.uid, 'proyectos', proyectoActivo),
        { font: data, gridSize, updatedAt: new Date() },
        { merge: true }
      );
      // Actualizar sessionStorage con los nuevos datos
      const raw = sessionStorage.getItem('proyectoActivo');
      if (raw) {
        const p = JSON.parse(raw);
        sessionStorage.setItem('proyectoActivo', JSON.stringify({ ...p, font: data, gridSize }));
      }
    } catch (err) {
      console.error('Error guardando:', err);
      alert('Error al guardar');
    }
    setIsSaving(false);
  }, [user, proyectoActivo, gridSize]);

  // ── Canvas tools ─────────────────────────────
  const applyPixelTool = useCallback((prevGrid, i) => {
    const g  = [...prevGrid];
    const r  = Math.floor(i / gridSize);
    const c  = i % gridSize;
    const dv = drawMode.current;
    if (tool === 'fill')     return floodFill(prevGrid, gridSize, i, dv);
    if (tool === 'mirror-h') { g[i] = dv; g[r * gridSize + (gridSize - 1 - c)] = dv; return g; }
    if (tool === 'mirror-v') { g[i] = dv; g[(gridSize - 1 - r) * gridSize + c] = dv; return g; }
    g[i] = dv;
    return g;
  }, [tool, gridSize]);

  const handlePixelDown = useCallback((i, _val, isRight) => {
    isDrawing.current = true;
    drawMode.current  = !isRight;
    if (tool === 'fill') {
      const filled = floodFill(grid, gridSize, i, drawMode.current);
      setGrid(filled);
      setFontData(fd => { const nfd = { ...fd, [currentChar]: filled }; handleSaveFont(nfd); return nfd; });
      return;
    }
    setGrid(prev => {
      const next = applyPixelTool(prev, i);
      setFontData(fd => ({ ...fd, [currentChar]: next }));
      return next;
    });
  }, [tool, grid, gridSize, currentChar, applyPixelTool, handleSaveFont]);

  const handlePixelEnter = useCallback((i) => {
    if (!isDrawing.current || tool === 'fill') return;
    setGrid(prev => {
      const next = applyPixelTool(prev, i);
      setFontData(fd => ({ ...fd, [currentChar]: next }));
      return next;
    });
  }, [tool, currentChar, applyPixelTool]);

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
    if (!confirm('¿Limpiar esta letra?')) return;
    const empty = Array(gridSize * gridSize).fill(false);
    setGrid(empty);
    setFontData(prev => { const fd = { ...prev, [currentChar]: empty }; handleSaveFont(fd); return fd; });
  };

  const invertCanvas = () => {
    setGrid(prev => {
      const inv = prev.map(p => !p);
      setFontData(fd => { const nfd = { ...fd, [currentChar]: inv }; handleSaveFont(nfd); return nfd; });
      return inv;
    });
  };

  const doShift = (dir) => {
    setGrid(prev => {
      const s = shiftGrid(prev, gridSize, dir);
      setFontData(fd => { const nfd = { ...fd, [currentChar]: s }; handleSaveFont(nfd); return nfd; });
      return s;
    });
  };

  // ── Loading ──────────────────────────────────
  if (loading || !proyectoActivo) {
    return React.createElement('div', {
      style: {
        height: '100vh', background: '#0a0a0a',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: '18px'
      }
    },
      React.createElement('span', {
        style: {
          fontFamily: FONT_PIXEL, fontSize: '10px',
          color: ACCENT, letterSpacing: '4px',
          animation: 'pulse 1.4s infinite'
        }
      }, 'CARGANDO...'),
      React.createElement('div', {
        style: { width: '160px', height: '2px', background: ACCENT, borderRadius: '2px' }
      })
    );
  }

  // ── Editor ───────────────────────────────────
  return React.createElement(EditorPage, {
    isDark, toggleTheme,
    gridSize, currentChar, fontData, grid, isSaving,
    tool, setTool, previewText, setPreviewText,
    onPixelDown:   handlePixelDown,
    onPixelEnter:  handlePixelEnter,
    onMouseUp:     handleMouseUp,
    onSwitchChar:  switchChar,
    onClearCanvas: clearCanvas,
    onInvert:      invertCanvas,
    onShift:       doShift,
    onSave:        () => handleSaveFont(fontData),
    onBack:        () => window.location.href = 'feed.html',
    projectName:   proyectoNombre
  });
}

// ─────────────────────────────────────────────
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(App));