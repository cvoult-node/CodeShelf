// ─────────────────────────────────────────────
//  APP — App.js  (orquestador principal)
// ─────────────────────────────────────────────
import React, { useState, useEffect, useRef, useCallback } from 'https://esm.sh/react@18.2.0';
import ReactDOM from 'https://esm.sh/react-dom@18.2.0/client';
import opentype from 'https://esm.sh/opentype.js';
import {
  auth, provider, db, signInWithPopup, signOut, onAuthStateChanged,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  doc, setDoc, getDocs, collection, query, orderBy, deleteDoc
} from './firebase.js';

import { ACCENT, FONT_MONO, FONT_PIXEL } from './constants.js';
import { Btn }                           from './ui.js';
import { renderFeed, initFeedEvents } from './Feed.js';
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
  const [user,     setUser]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');

  // ── Projects ────────────────────────────────
  const [proyectos,      setProyectos]      = useState([]);
  const [proyectoActivo, setProyectoActivo] = useState(null);
  const [proyectoNombre, setProyectoNombre] = useState('mi-fuente');
  const [setupMode,      setSetupMode]      = useState(true);

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

  // ── Firebase ─────────────────────────────────
  const cargarProyectos = useCallback(async (u) => {
    try {
      const q   = query(collection(db, 'usuarios', u.uid, 'proyectos'), orderBy('updatedAt', 'desc'));
      const snp = await getDocs(q);
      setProyectos(snp.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => {
      setUser(u);
      if (u) cargarProyectos(u);
      setLoading(false);
    });
    return unsub;
  }, [cargarProyectos]);

  const handleSaveFont = useCallback(async (data) => {
    if (!user || !proyectoActivo) return;
    setIsSaving(true);
    try {
      await setDoc(
        doc(db, 'usuarios', user.uid, 'proyectos', proyectoActivo),
        { font: data, gridSize, updatedAt: new Date() },
        { merge: true }
      );
    } catch { alert('Error al guardar'); }
    setIsSaving(false);
  }, [user, proyectoActivo, gridSize]);

  // ── Project actions ──────────────────────────
  const handleCreateProject = async (nombre, size) => {
    const id   = Date.now().toString();
    const ref  = doc(db, 'usuarios', user.uid, 'proyectos', id);
    const data = { nombre, gridSize: size, font: {}, updatedAt: new Date() };
    await setDoc(ref, data);
    abrirProyecto({ id, ...data });
    cargarProyectos(user);
  };

  const handleDeleteProject = async (id) => {
    if (!confirm('¿Borrar este proyecto?')) return;
    await deleteDoc(doc(db, 'usuarios', user.uid, 'proyectos', id));
    cargarProyectos(user);
  };

  const abrirProyecto = (p) => {
    setProyectoActivo(p.id);
    setProyectoNombre(p.nombre || 'mi-fuente');
    setGridSize(p.gridSize);
    setFontData(p.font || {});
    setGrid(p.font?.['A'] || Array(p.gridSize * p.gridSize).fill(false));
    setCurrentChar('A');
    setSetupMode(false);
  };

  // ── Canvas actions ───────────────────────────
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

  // ─────────────────────────────────────────
  //  VIEWS
  // ─────────────────────────────────────────

  if (loading) return React.createElement('div', {
    style: {
      height: '100vh', background: '#0a0a0a',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: '18px'
    }
  },
    React.createElement('span', {
      style: { fontFamily: FONT_PIXEL, fontSize: '12px', color: ACCENT, letterSpacing: '3px', animation: 'pulse 1.4s infinite' }
    }, 'CARGANDO...'),
    React.createElement('div', { style: { width: '160px', height: '2px', background: ACCENT, borderRadius: '2px' } })
  );

  if (!user) return React.createElement('div', {
    style: { minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }
  },
    React.createElement('div', {
      style: {
        width: '100%', maxWidth: '380px',
        background: isDark ? '#0f0f0f' : '#fff',
        border: '1px solid var(--border)',
        borderRadius: '14px', padding: '40px 36px',
        boxShadow: isDark ? '0 24px 60px rgba(0,0,0,0.6)' : '0 24px 60px rgba(0,0,0,0.1)'
      }
    },
      React.createElement('div', { style: { textAlign: 'center', marginBottom: '32px' } },
        React.createElement('div', { style: { fontFamily: FONT_PIXEL, fontSize: '20px', lineHeight: 1.8, color: ACCENT } }, 'CODE\nSHELF'),
        React.createElement('p', { style: { color: 'var(--text-muted)', fontSize: '9px', letterSpacing: '5px', marginTop: '8px', fontFamily: FONT_MONO } }, 'PIXEL FONT STUDIO')
      ),
      React.createElement('form', {
        onSubmit: e => {
          e.preventDefault();
          signInWithEmailAndPassword(auth, email, password)
            .catch(() => createUserWithEmailAndPassword(auth, email, password));
        },
        style: { display: 'flex', flexDirection: 'column', gap: '10px' }
      },
        ...[
          { type: 'email',    placeholder: 'Email',      value: email,    setter: setEmail },
          { type: 'password', placeholder: 'Contraseña', value: password, setter: setPassword }
        ].map(({ type, placeholder, value, setter }) =>
          React.createElement('input', {
            key: type, type, placeholder, value,
            onChange: e => setter(e.target.value),
            style: {
              background: 'var(--surface2)', border: '1px solid var(--border)',
              borderRadius: '6px', padding: '12px 15px',
              color: 'var(--text)', fontSize: '13px', outline: 'none', fontFamily: FONT_MONO
            }
          })
        ),
        React.createElement(Btn, {
          style: {
            background: ACCENT, color: '#fff', borderRadius: '6px',
            padding: '13px', fontWeight: '700', fontSize: '12px',
            letterSpacing: '2px', width: '100%', marginTop: '4px', fontFamily: FONT_MONO
          }
        }, 'ENTRAR')
      ),
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', margin: '18px 0' } },
        React.createElement('div', { style: { flex: 1, height: '1px', background: 'var(--border)' } }),
        React.createElement('span', { style: { color: 'var(--text-muted)', fontSize: '9px', letterSpacing: '2px', fontFamily: FONT_MONO } }, 'O'),
        React.createElement('div', { style: { flex: 1, height: '1px', background: 'var(--border)' } })
      ),
      React.createElement(Btn, {
        onClick: () => signInWithPopup(auth, provider),
        style: {
          width: '100%', padding: '12px',
          background: isDark ? 'rgba(255,255,255,0.05)' : '#fff',
          border: '1px solid var(--border)', borderRadius: '6px',
          color: 'var(--text)', fontSize: '12px', fontWeight: '700', fontFamily: FONT_MONO
        }
      }, '🔑  Continuar con Google'),
      React.createElement('div', { style: { textAlign: 'center', marginTop: '20px' } },
        React.createElement(Btn, {
          onClick: toggleTheme,
          style: { background: 'none', color: 'var(--text-muted)', fontSize: '18px', padding: '4px 10px', borderRadius: '6px' }
        }, isDark ? '☀️' : '🌙')
      )
    )
  );

 if (setupMode) return React.createElement(FeedBridge, {
  proyectos,
  onOpen: abrirProyecto,
  onCreate: handleCreateProject,
  onDelete: handleDeleteProject
});

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
    onBack:        () => setSetupMode(true),
    projectName:   proyectoNombre
  });
}

function FeedBridge({ proyectos, onOpen, onCreate, onDelete }) {
  useEffect(() => {
    renderFeed(proyectos, onOpen, onDelete);
    initFeedEvents(onCreate);
  }, [proyectos]);
  return null; 
}

// ─────────────────────────────────────────────
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(App));
