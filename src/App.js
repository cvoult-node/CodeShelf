import React, { useState, useEffect, useRef, useCallback } from 'https://esm.sh/react@18.2.0';
import ReactDOM from 'https://esm.sh/react-dom@18.2.0/client';
import opentype from 'https://esm.sh/opentype.js';
import {
  auth, provider, db, signInWithPopup, signOut, onAuthStateChanged,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  doc, setDoc, getDocs, collection, query, orderBy, deleteDoc
} from './firebase.js';

// ─────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────
const TECLADO = [
  'A','B','C','D','E','F','G','H','I','J','K','L','M','N','Ñ','O','P','Q','R','S','T','U','V','W','X','Y','Z',
  'a','b','c','d','e','f','g','h','i','j','k','l','m','n','ñ','o','p','q','r','s','t','u','v','w','x','y','z',
  '0','1','2','3','4','5','6','7','8','9',' ',',','.',':',';','!','?'
];

const ACCENT = '#ff0000'; 
const ACCENT_S = '#ff0000'; // Definimos ACCENT_S como rojo para que no de error
const RED_GRADIENT = 'linear-gradient(135deg, #ff0000 0%, #990000 100%)';

// ─────────────────────────────────────────────
//  CANVAS ALGORITHMS
// ─────────────────────────────────────────────

/** Flood fill (4-connected) */
function floodFill(grid, size, startIdx, fillVal) {
  const target = grid[startIdx];
  if (target === fillVal) return grid;
  const next = [...grid];
  const stack = [startIdx];
  while (stack.length) {
    const i = stack.pop();
    if (i < 0 || i >= size * size || next[i] !== target) continue;
    next[i] = fillVal;
    const r = Math.floor(i / size), c = i % size;
    if (c > 0)        stack.push(i - 1);
    if (c < size - 1) stack.push(i + 1);
    if (r > 0)        stack.push(i - size);
    if (r < size - 1) stack.push(i + size);
  }
  return next;
}

/** Wrap-around pixel shift */
function shiftGrid(grid, size, dir) {
  const next = Array(size * size).fill(false);
  grid.forEach((v, i) => {
    if (!v) return;
    const r = Math.floor(i / size), c = i % size;
    let nr = r, nc = c;
    if (dir === 'up')    nr = (r - 1 + size) % size;
    if (dir === 'down')  nr = (r + 1) % size;
    if (dir === 'left')  nc = (c - 1 + size) % size;
    if (dir === 'right') nc = (c + 1) % size;
    next[nr * size + nc] = true;
  });
  return next;
}

// ─────────────────────────────────────────────
//  REUSABLE STYLED PRIMITIVES  (inline-style based)
// ─────────────────────────────────────────────

const Btn = ({ onClick, style, children, disabled, title, className = '' }) =>
  React.createElement('button', {
    onClick, disabled, title, className,
    style: {
      fontFamily: "'Space Mono', monospace",
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.45 : 1,
      transition: 'transform .15s, opacity .15s',
      border: 'none',
      ...style
    },
    onMouseEnter: e => { if (!disabled) e.currentTarget.style.transform = 'translateY(-2px)'; },
    onMouseLeave: e => { e.currentTarget.style.transform = 'translateY(0)'; }
  }, children);

// Componente para cargar tus iconos SVG de Pixel Art
const Icon = ({ name, size = 18, isDark, style = {} }) => {
  return React.createElement('img', {
    src: `./src/icons/${name}.svg`,
    style: { 
      width: `${size}px`, 
      height: `${size}px`, 
      imageRendering: 'pixelated',
      display: 'inline-block',
      verticalAlign: 'middle',
      // Ahora sí reconoce isDark porque se lo pasamos
      filter: isDark ? 'brightness(0) invert(1)' : 'none', 
      ...style
    },
    onError: (e) => { e.target.style.display = 'none'; }
  });
};

// ─────────────────────────────────────────────
//  MAIN APP
// ─────────────────────────────────────────────

function App() {
  // ── theme ──
 const [theme, setTheme] = useState('light');
  const isDark = theme === 'dark';
  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');
  useEffect(() => { document.documentElement.className = theme; }, [theme]);

  // CSS variable shortcuts (reads computed values from :root)
  const cv = (v) => `var(${v})`;

  // ── auth ──
  const [user,     setUser]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');

  // ── projects ──
  const [proyectos,      setProyectos]      = useState([]);
  const [proyectoActivo, setProyectoActivo] = useState(null);
  const [setupMode,      setSetupMode]      = useState(true);
  const [showModal,      setShowModal]      = useState(false);
  const [nuevoNombre,    setNuevoNombre]    = useState('');
  const [nuevoSize,      setNuevoSize]      = useState(8);

  // ── editor ──
  const [gridSize,     setGridSize]     = useState(8);
  const [currentChar,  setCurrentChar]  = useState('A');
  const [fontData,     setFontData]     = useState({});
  const [grid,         setGrid]         = useState([]);
  const [isSaving,     setIsSaving]     = useState(false);
  const [tool,         setTool]         = useState('pencil');
  const [previewText,  setPreviewText]  = useState('CodeShelf');

  // drawing state kept in refs (no re-render needed)
  const isDrawing = useRef(false);
  const drawMode  = useRef(true); // true=paint, false=erase

  // ── Firebase helpers ──
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

  const confirmarNuevoProyecto = async () => {
    if (!nuevoNombre.trim()) return alert('Escribe un nombre para la fuente');
    setIsSaving(true);
    try {
      const id  = Date.now().toString();
      const ref = doc(db, 'usuarios', user.uid, 'proyectos', id);
      const data = { nombre: nuevoNombre, gridSize: nuevoSize, font: {}, updatedAt: new Date() };
      await setDoc(ref, data);
      abrirProyecto({ id, ...data });
      cargarProyectos(user);
      setShowModal(false);
      setNuevoNombre('');
    } catch { alert('Error al crear el proyecto'); }
    finally { setIsSaving(false); }
  };

  const eliminarProyecto = async (id) => {
    if (!confirm('¿Borrar este proyecto?')) return;
    await deleteDoc(doc(db, 'usuarios', user.uid, 'proyectos', id));
    cargarProyectos(user);
  };

  const abrirProyecto = (p) => {
    setProyectoActivo(p.id);
    setGridSize(p.gridSize);
    setFontData(p.font || {});
    setGrid(p.font?.['A'] || Array(p.gridSize * p.gridSize).fill(false));
    setCurrentChar('A');
    setSetupMode(false);
  };

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

  // ── canvas helpers ──
  const applyPixelTool = useCallback((prevGrid, i) => {
    const g  = [...prevGrid];
    const r  = Math.floor(i / gridSize);
    const c  = i % gridSize;
    const dv = drawMode.current;

    if (tool === 'eraser') { g[i] = false; return g; }
    if (tool === 'pencil') { g[i] = dv; return g; }
    if (tool === 'mirror-h') {
      g[i] = dv;
      g[r * gridSize + (gridSize - 1 - c)] = dv;
      return g;
    }
    if (tool === 'mirror-v') {
      g[i] = dv;
      g[(gridSize - 1 - r) * gridSize + c] = dv;
      return g;
    }
    return g;
  }, [tool, gridSize]);

  const commitGrid = useCallback((newGrid) => {
    setGrid(newGrid);
    setFontData(prev => {
      const fd = { ...prev, [currentChar]: newGrid };
      handleSaveFont(fd);
      return fd;
    });
  }, [currentChar, handleSaveFont]);

  const handlePixelDown = useCallback((i, currentVal) => {
    isDrawing.current = true;

    if (tool === 'fill') {
      const filled = floodFill(grid, gridSize, i, !currentVal);
      commitGrid(filled);
      return;
    }
    drawMode.current = tool === 'eraser' ? false : !currentVal;
    setGrid(prev => {
      const next = applyPixelTool(prev, i);
      setFontData(fd => ({ ...fd, [currentChar]: next }));
      return next;
    });
  }, [tool, grid, gridSize, currentChar, applyPixelTool, commitGrid]);

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

  // ── TTF Export ──
  const exportTTF = () => {
    const glyphs = [new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 650, path: new opentype.Path() })];
    Object.keys(fontData).forEach(char => {
      const path = new opentype.Path();
      const s    = 100;
      fontData[char].forEach((on, i) => {
        if (!on) return;
        const x = (i % gridSize) * s;
        const y = (gridSize - 1 - Math.floor(i / gridSize)) * s;
        path.moveTo(x, y); path.lineTo(x+s, y); path.lineTo(x+s, y+s); path.lineTo(x, y+s); path.close();
      });
      glyphs.push(new opentype.Glyph({
        name: char === ' ' ? 'space' : char,
        unicode: char.charCodeAt(0),
        advanceWidth: gridSize * 110,
        path
      }));
    });
    new opentype.Font({
      familyName: 'CodeShelf', styleName: 'Regular',
      unitsPerEm: 1000, ascender: 800, descender: -200, glyphs
    }).download();
  };

  // ─────────────────────────────────────────
  //  VIEWS
  // ─────────────────────────────────────────

  /* ── Loading ── */
  if (loading) return React.createElement('div', {
    style: {
      height:'100vh', background:'#080b14',
      display:'flex', flexDirection:'column',
      alignItems:'center', justifyContent:'center', gap:'20px'
    }
  },
    React.createElement('div', {
      style: {
        fontFamily:'"Press Start 2P",cursive', fontSize:'14px',
        background: ACCENT, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent',
        letterSpacing:'3px', animation:'pulse 1.4s infinite'
      }
    }, 'CARGANDO...'),
    React.createElement('div', {
      style: {
        width:'180px', height:'3px', borderRadius:'2px',
        background: ACCENT, backgroundSize:'200% auto',
        animation:'shimmer 1.8s linear infinite'
      }
    })
  );

  /* ── Login ── */
  if (!user) return React.createElement('div', {
    style: {
      minHeight:'100vh', background: cv('--bg'), display:'flex',
      alignItems:'center', justifyContent:'center', padding:'16px'
    }
  },
    React.createElement('div', {
      style: {
        width:'100%', maxWidth:'400px',
        background: isDark ? '#0f1523' : '#fff',
        border:`1px solid ${cv('--border')}`,
        borderRadius:'28px', padding:'44px 40px',
        boxShadow: isDark
          ? '0 30px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(124,58,237,0.1)'
          : '0 30px 80px rgba(0,0,0,0.12)'
      }
    },
      /* Logo */
      React.createElement('div', { style:{ textAlign:'center', marginBottom:'36px' }},
        React.createElement('div', {
          style:{
            fontFamily:'"Press Start 2P",cursive', fontSize:'22px', lineHeight:1.6,
            background: ACCENT, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent',
          }
        }, 'CODE\nSHELF'),
        React.createElement('p', {
          style:{ color: cv('--text-muted'), fontSize:'9px', letterSpacing:'5px', marginTop:'10px' }
        }, 'PIXEL FONT STUDIO')
      ),
      /* Form */
      React.createElement('form', {
        onSubmit: e => {
          e.preventDefault();
          signInWithEmailAndPassword(auth, email, password)
            .catch(() => createUserWithEmailAndPassword(auth, email, password));
        },
        style:{ display:'flex', flexDirection:'column', gap:'12px' }
      },
        ...[
          { type:'email',    placeholder:'Email',       value:email,    setter:setEmail },
          { type:'password', placeholder:'Contraseña',  value:password, setter:setPassword }
        ].map(({ type, placeholder, value, setter }) =>
          React.createElement('input', {
            key: type, type, placeholder, value,
            onChange: e => setter(e.target.value),
            style:{
              background: cv('--surface2'), border:`1px solid ${cv('--border')}`,
              borderRadius:'14px', padding:'14px 18px',
              color: cv('--text'), fontSize:'14px', outline:'none',
            }
          })
        ),
        React.createElement(Btn, {
          style:{
            background: ACCENT_S, color:'#fff', borderRadius:'14px',
            padding:'14px', fontWeight:'700', fontSize:'13px', letterSpacing:'2px',
            width:'100%', marginTop:'4px'
          }
        }, 'ENTRAR')
      ),
      /* Divider */
      React.createElement('div', {
        style:{ display:'flex', alignItems:'center', gap:'12px', margin:'20px 0' }
      },
        React.createElement('div', { style:{ flex:1, height:'1px', background: cv('--border') }}),
        React.createElement('span', { style:{ color: cv('--text-muted'), fontSize:'9px', letterSpacing:'2px' }}, 'O'),
        React.createElement('div', { style:{ flex:1, height:'1px', background: cv('--border') }})
      ),
      React.createElement(Btn, {
        onClick: () => signInWithPopup(auth, provider),
        style:{
          width:'100%', padding:'14px',
          background: isDark ? 'rgba(255,255,255,0.06)' : '#fff',
          border:`1px solid ${cv('--border')}`, borderRadius:'14px',
          color: cv('--text'), fontSize:'13px', fontWeight:'700'
        }
      }, '🔑  Continuar con Google'),
      /* Theme toggle */
      React.createElement('div', { style:{ textAlign:'center', marginTop:'24px' }},
        React.createElement(Btn, {
          onClick: toggleTheme,
          style:{
            background:'none', color: cv('--text-muted'), fontSize:'20px',
            padding:'4px 12px', borderRadius:'8px'
          }
        }, isDark ? '☀️' : '🌙')
      )
    )
  );

/* ── Dashboard ── */
if (setupMode) return React.createElement('div', {
  style: { minHeight: '100vh', background: cv('--bg'), color: cv('--text'), padding: '32px' }
},
  React.createElement('div', { style: { maxWidth: '1100px', margin: '0 auto' } },
    /* Header */
    React.createElement('header', {
      style: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '48px', paddingBottom: '24px',
        borderBottom: `1px solid ${cv('--border')}`
      }
    },
      React.createElement('div', null,
        React.createElement('h1', {
          style: {
            fontFamily: '"Press Start 2P",cursive', fontSize: '16px', lineHeight: 1.7,
            color: '#ff0000'
          }
        }, 'CODESHELF'),
        React.createElement('p', {
          style: { color: cv('--text-muted'), fontSize: '9px', letterSpacing: '4px', marginTop: '8px' }
        }, 'SOCIAL FEED')
      ),
      React.createElement('div', { style: { display: 'flex', gap: '10px', alignItems: 'center' } },
        /* Toggle de Tema con Iconos SVG */
        React.createElement(Btn, {
          onClick: toggleTheme,
          style: {
            background: cv('--surface2'), border: `1px solid ${cv('--border')}`,
            borderRadius: '4px', padding: '10px', display: 'flex', alignItems: 'center'
          }
        }, React.createElement(Icon, { name: isDark ? 'sun' : 'moon', size: 18 })),
        
        /* Botón de Usuario */
        React.createElement(Btn, {
          onClick: () => setShowUserMenu(!showUserMenu),
          style: {
            background: '#ff0000', border: 'none',
            borderRadius: '4px', padding: '8px',
            color: '#fff', display: 'flex', alignItems: 'center'
          }
        }, React.createElement(Icon, { name: 'user', size: 24 })),

        /* Salir con Icono SVG */
        React.createElement(Btn, {
          onClick: () => signOut(auth),
          style: {
            background: cv('--surface2'), border: `1px solid ${cv('--border')}`,
            borderRadius: '4px', padding: '10px 16px',
            color: cv('--text-muted'), fontSize: '11px', letterSpacing: '1px',
            display: 'flex', alignItems: 'center', gap: '8px'
          }
        }, 
          React.createElement(Icon, { name: 'logout', size: 14 }),
          'SALIR'
        )
      )
    ),

    /* Grid de Proyectos */
    React.createElement('div', {
      style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: '20px' }
    },
      /* New project card */
      React.createElement('div', {
        onClick: () => setShowModal(true),
        className: 'fade-up',
        style: {
          border: `2px dashed ${cv('--border')}`,
          borderRadius: '4px', padding: '44px 20px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', minHeight: '210px', gap: '14px', transition: 'all .2s'
        },
        onMouseEnter: e => { e.currentTarget.style.borderColor = '#ff0000'; e.currentTarget.style.background = 'rgba(255,0,0,0.05)'; },
        onMouseLeave: e => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.background = ''; }
      },
        React.createElement('div', {
          style: {
            width: '52px', height: '52px', borderRadius: '4px',
            background: '#ff0000', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }
        }, React.createElement(Icon, { name: 'plus', size: 24 })),
        React.createElement('span', {
          style: { color: cv('--text-muted'), fontSize: '9px', letterSpacing: '4px' }
        }, 'NUEVO DISEÑO')
      ),

      /* Lista de Proyectos */
      ...proyectos.map((p, idx) =>
        React.createElement('div', {
          key: p.id, className: 'fade-up',
          style: {
            background: cv('--card-bg'), border: `1px solid ${cv('--border')}`,
            borderRadius: '4px', padding: '0 0 24px', position: 'relative', overflow: 'hidden'
          }
        },
          React.createElement('div', { style: { height: '4px', background: '#ff0000' } }),
          React.createElement('div', { style: { padding: '24px 24px 0' } },
            React.createElement('h3', {
              style: { fontSize: '14px', fontWeight: '700', marginBottom: '12px', color: cv('--text') }
            }, p.nombre || 'Sin nombre'),
            React.createElement('div', { style: { display: 'flex', gap: '8px', marginBottom: '20px' } },
              React.createElement('span', {
                style: { fontSize: '9px', padding: '4px 10px', borderRadius: '2px', background: 'rgba(255,0,0,0.1)', color: '#ff0000' }
              }, `${p.gridSize}px`),
              React.createElement('span', {
                style: { fontSize: '9px', padding: '4px 10px', borderRadius: '2px', background: cv('--surface2'), color: cv('--text-muted'), display: 'flex', alignItems: 'center', gap: '4px' }
              }, React.createElement(Icon, { name: 'projects', size: 10 }), `${Object.keys(p.font || {}).length} glifos`)
            ),
            React.createElement('div', { style: { display: 'flex', gap: '8px' } },
              React.createElement(Btn, {
                onClick: () => abrirProyecto(p),
                style: { flex: 1, padding: '12px', background: '#ff0000', borderRadius: '4px', color: '#fff', fontSize: '11px', fontWeight: '700' }
              }, 'ABRIR'),
              React.createElement(Btn, {
                onClick: e => { e.stopPropagation(); eliminarProyecto(p.id); },
                style: { width: '44px', background: 'rgba(255,0,0,0.05)', border: '1px solid rgba(255,0,0,0.2)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }
              }, React.createElement(Icon, { name: 'delete', size: 16 }))
            )
          )
        )
      )
    )
  )
);
                                            
  /* ─────────────────────────────────────────
     ── EDITOR PRINCIPAL ──
  ───────────────────────────────────────── */
  const drawTools = [
    { id:'pencil',   icon:'✏️',  label:'Lápiz'    },
    { id:'eraser',   icon:'⬜',  label:'Borrar'   },
    { id:'fill',     icon:'🪣', label:'Relleno'  },
    { id:'mirror-h', icon:'↔️',  label:'Espejo H' },
    { id:'mirror-v', icon:'↕️',  label:'Espejo V' },
  ];
  const actionTools = [
    { icon:'⚡', label:'Invertir', fn: invertCanvas },
    { icon:'⬆', label:'Arriba',   fn: () => doShift('up')    },
    { icon:'⬇', label:'Abajo',    fn: () => doShift('down')  },
    { icon:'⬅', label:'Izq',      fn: () => doShift('left')  },
    { icon:'➡', label:'Der',      fn: () => doShift('right') },
  ];

  const toolCursor = { pencil:'crosshair', eraser:'cell', fill:'pointer', 'mirror-h':'crosshair', 'mirror-v':'crosshair' };

  return React.createElement('div', {
    style:{ minHeight:'100vh', background: cv('--bg'), color: cv('--text') },
    onMouseUp: handleMouseUp
  },

    /* ── NAV ── */
    React.createElement('nav', {
      style:{
        padding:'10px 20px', borderBottom:`1px solid ${cv('--border')}`,
        display:'flex', justifyContent:'space-between', alignItems:'center',
        backdropFilter:'blur(20px)', background: cv('--nav-bg'),
        position:'sticky', top:0, zIndex:40
      }
    },
      React.createElement(Btn, {
        onClick: () => setSetupMode(true),
        style:{
          background: cv('--surface2'), border:`1px solid ${cv('--border')}`,
          borderRadius:'10px', padding:'8px 14px', color: cv('--text-muted'), fontSize:'11px'
        }
      }, '← Proyectos'),
      /* Brand */
      React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'8px' }},
        React.createElement('div', {
          style:{
            width:'10px', height:'10px', borderRadius:'50%', background: ACCENT_S,
            boxShadow:'0 0 10px #7c3aed', animation:'pulse 2s infinite'
          }
        }),
        React.createElement('span', {
          style:{
            fontFamily:'"Press Start 2P",cursive', fontSize:'11px',
            background: ACCENT_S, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent'
          }
        }, 'CODE SHELF')
      ),
      /* Right nav actions */
      React.createElement('div', { style:{ display:'flex', gap:'8px', alignItems:'center' }},
        React.createElement(Btn, {
          onClick: toggleTheme,
          style:{
            background: cv('--surface2'), border:`1px solid ${cv('--border')}`,
            borderRadius:'10px', padding:'8px 12px', fontSize:'16px', color: cv('--text')
          }
        }, isDark ? '☀️' : '🌙'),
        React.createElement(Btn, {
          onClick: exportTTF,
          style:{
            background: ACCENT_S, borderRadius:'10px',
            padding:'8px 20px', color:'#fff', fontWeight:'700', fontSize:'11px', letterSpacing:'1px'
          }
        }, '⬇  EXPORTAR TTF'),
        isSaving && React.createElement('div', {
          style:{
            width:'8px', height:'8px', borderRadius:'50%', border:'2px solid #7c3aed',
            borderTopColor:'transparent', animation:'spin 0.8s linear infinite'
          }
        })
      )
    ),

    /* ── MAIN LAYOUT ── */
    React.createElement('main', {
      style:{
        padding:'20px', maxWidth:'1200px', margin:'0 auto',
        display:'grid', gridTemplateColumns:'1fr 290px', gap:'18px', alignItems:'start'
      }
    },

      /* ── LEFT: Canvas section ── */
      React.createElement('section', {
        style:{
          display:'flex', flexDirection:'column', alignItems:'center', gap:'18px',
          background: cv('--surface'), borderRadius:'28px',
          border:`1px solid ${cv('--border')}`, padding:'28px'
        }
      },

        /* Current char big display */
        React.createElement('div', {
          style:{
            fontFamily:'"Press Start 2P",cursive', fontSize:'52px', lineHeight:1,
            background: ACCENT, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent',
            filter:'drop-shadow(0 0 24px rgba(124,58,237,0.5))',
            minHeight:'64px', display:'flex', alignItems:'center'
          }
        }, currentChar === ' ' ? '[ ]' : currentChar),

        /* ── Tool palette ── */
        React.createElement('div', {
          style:{ display:'flex', gap:'6px', flexWrap:'wrap', justifyContent:'center', alignItems:'center' }
        },
          /* Drawing tools */
          ...drawTools.map(t =>
            React.createElement(Btn, {
              key: t.id, onClick: () => setTool(t.id), title: t.label,
              style:{
                padding:'10px 12px', borderRadius:'12px', fontSize:'18px',
                background: tool === t.id ? ACCENT_S : cv('--surface2'),
                border: tool === t.id ? 'none' : `1px solid ${cv('--border')}`,
                color: tool === t.id ? '#fff' : cv('--text-muted'),
                boxShadow: tool === t.id ? '0 4px 14px rgba(124,58,237,0.4)' : 'none',
                display:'flex', flexDirection:'column', alignItems:'center', gap:'3px', minWidth:'52px'
              }
            },
              React.createElement('span', null, t.icon),
              React.createElement('span', { style:{ fontSize:'7px', letterSpacing:'1px', whiteSpace:'nowrap' }}, t.label)
            )
          ),
          /* Divider */
          React.createElement('div', { style:{ width:'1px', height:'48px', background: cv('--border'), margin:'0 4px' }}),
          /* Action tools */
          ...actionTools.map((t, i) =>
            React.createElement(Btn, {
              key: i, onClick: t.fn, title: t.label,
              style:{
                padding:'10px 12px', borderRadius:'12px', fontSize:'18px',
                background: cv('--surface2'), border:`1px solid ${cv('--border')}`,
                color: cv('--text-muted'),
                display:'flex', flexDirection:'column', alignItems:'center', gap:'3px', minWidth:'48px'
              }
            },
              React.createElement('span', null, t.icon),
              React.createElement('span', { style:{ fontSize:'7px' }}, t.label)
            )
          )
        ),

        /* ── Pixel Canvas ── */
        React.createElement('div', {
          id:'canvas-wrap',
          style:{
            display:'grid',
            gridTemplateColumns:`repeat(${gridSize}, 1fr)`,
            width:'min(80vw, 480px)', height:'min(80vw, 480px)',
            gap:'1px',
            background: cv('--grid-line'),
            borderRadius:'18px', overflow:'hidden',
            border:`3px solid ${isDark ? '#2a2050' : '#b8b0cc'}`,
            boxShadow: isDark
              ? '0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(124,58,237,0.15)'
              : '0 20px 60px rgba(0,0,0,0.15)',
            cursor: toolCursor[tool] || 'crosshair'
          },
          onMouseLeave: () => { isDrawing.current = false; }
        },
          grid.map((active, i) =>
            React.createElement('div', {
              key: i,
              onMouseDown: () => handlePixelDown(i, active),
              onMouseEnter: () => handlePixelEnter(i),
              style:{
                width:'100%', height:'100%', transition:'background .05s',
                background: active
                  ? `linear-gradient(135deg, #7c3aed, #a855f7)`
                  : cv('--empty'),
                boxShadow: active ? `inset 0 0 0 1px rgba(167,139,250,0.3)` : 'none'
              }
            })
          )
        ),

        /* ── Text preview ── */
        React.createElement('div', {
          style:{
            width:'100%', maxWidth:'480px',
            background: cv('--surface2'), border:`1px solid ${cv('--border')}`,
            borderRadius:'16px', padding:'16px 18px'
          }
        },
          React.createElement('div', {
            style:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }
          },
            React.createElement('span', { style:{ color: cv('--text-muted'), fontSize:'9px', letterSpacing:'3px' }}, 'PREVIEW'),
            React.createElement('input', {
              value: previewText,
              onChange: e => setPreviewText(e.target.value),
              style:{
                background:'none', border:'none', outline:'none',
                color: cv('--text-muted'), fontSize:'11px',
                textAlign:'right', width:'160px'
              }
            })
          ),
          /* Pixel preview render */
          React.createElement('div', { style:{ display:'flex', gap:'4px', flexWrap:'wrap', minHeight:'32px' }},
            previewText.split('').map((ch, ci) => {
              const glyphData = fontData[ch];
              const sz = Math.min(gridSize, 16);
              const px = 3;
              return React.createElement('div', {
                key: ci,
                style:{ display:'grid', gridTemplateColumns:`repeat(${sz},${px}px)`, gap:'0px', marginRight:'2px' }
              },
                Array(sz * sz).fill(0).map((_, pi) => {
                  const on = glyphData ? glyphData[pi] : false;
                  return React.createElement('div', {
                    key: pi,
                    style:{ width:`${px}px`, height:`${px}px`, background: on ? '#a78bfa' : 'transparent' }
                  });
                })
              );
            })
          )
        ),

        /* Save button */
        React.createElement(Btn, {
          onClick: () => handleSaveFont(fontData),
          style:{
            width:'100%', maxWidth:'480px', padding:'14px',
            background: isSaving ? cv('--surface2') : ACCENT_S,
            borderRadius:'16px', color: isSaving ? cv('--text-muted') : '#fff',
            fontWeight:'700', fontSize:'12px', letterSpacing:'2px'
          }
        }, isSaving ? '⏳  GUARDANDO...' : '💾  GUARDAR CAMBIOS')
      ),

      /* ── RIGHT: Characters panel ── */
      React.createElement('aside', {
        style:{
          background: cv('--surface'), border:`1px solid ${cv('--border')}`,
          borderRadius:'28px', padding:'20px', position:'sticky', top:'70px'
        }
      },
        React.createElement('div', {
          style:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'14px' }
        },
          React.createElement('span', { style:{ color: cv('--text-muted'), fontSize:'9px', letterSpacing:'3px' }}, 'CARACTERES'),
          React.createElement(Btn, {
            onClick: clearCanvas,
            style:{
              background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.25)',
              borderRadius:'8px', padding:'5px 10px', color:'#f87171', fontSize:'9px'
            }
          }, 'LIMPIAR')
        ),
        /* Stats */
        React.createElement('div', {
          style:{
            display:'flex', gap:'10px', marginBottom:'14px',
            padding:'10px', background: cv('--surface2'), borderRadius:'12px'
          }
        },
          React.createElement('div', { style:{ flex:1, textAlign:'center' }},
            React.createElement('div', { style:{ fontSize:'18px', fontWeight:'700', color:'#a78bfa' }},
              Object.values(fontData).filter(g => g?.some(Boolean)).length
            ),
            React.createElement('div', { style:{ fontSize:'7px', color: cv('--text-muted'), letterSpacing:'2px' }}, 'GLIFOS')
          ),
          React.createElement('div', { style:{ flex:1, textAlign:'center' }},
            React.createElement('div', { style:{ fontSize:'18px', fontWeight:'700', color:'#06b6d4' }}, gridSize),
            React.createElement('div', { style:{ fontSize:'7px', color: cv('--text-muted'), letterSpacing:'2px' }}, 'PX GRID')
          ),
          React.createElement('div', { style:{ flex:1, textAlign:'center' }},
            React.createElement('div', { style:{ fontSize:'18px', fontWeight:'700', color:'#ec4899' }},
              grid.filter(Boolean).length
            ),
            React.createElement('div', { style:{ fontSize:'7px', color: cv('--text-muted'), letterSpacing:'2px' }}, 'PÍXELES')
          )
        ),
        /* Char grid */
        React.createElement('div', {
          style:{
            display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'5px',
            maxHeight:'60vh', overflowY:'auto', paddingRight:'2px'
          }
        },
          TECLADO.map(t => {
            const configured = fontData?.[t]?.some(Boolean);
            const isActive   = currentChar === t;
            return React.createElement(Btn, {
              key: t, onClick: () => switchChar(t), title: t,
              style:{
                height:'50px', borderRadius:'10px',
                border: isActive ? 'none' : `1px solid ${configured ? 'rgba(124,58,237,0.3)' : cv('--border')}`,
                background: isActive
                  ? ACCENT_S
                  : configured ? (isDark ? 'rgba(124,58,237,0.12)' : 'rgba(124,58,237,0.08)')
                  : cv('--surface2'),
                color: isActive ? '#fff' : configured ? '#a78bfa' : cv('--text-muted'),
                fontWeight:'700', fontSize:'14px', position:'relative',
                boxShadow: isActive ? '0 4px 14px rgba(124,58,237,0.4)' : 'none',
                display:'flex', alignItems:'center', justifyContent:'center'
              }
            },
              t === ' ' ? '·' : t,
              configured && !isActive && React.createElement('div', {
                style:{
                  position:'absolute', top:'5px', right:'5px',
                  width:'5px', height:'5px', borderRadius:'50%', background: ACCENT_S
                }
              })
            );
          })
        )
      )
    )
  );
}

// ─────────────────────────────────────────────
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(App));
