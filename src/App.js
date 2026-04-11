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

const ACCENT   = '#ff0000';
const ACCENT_S = '#ff0000';

// ─────────────────────────────────────────────
//  CANVAS ALGORITHMS
// ─────────────────────────────────────────────

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
//  REUSABLE STYLED PRIMITIVES
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

const Icon = ({ name, size = 18, style = {} }) =>
  React.createElement('img', {
    src: `./src/icons/${name}.svg`,
    style: {
      width: `${size}px`, height: `${size}px`,
      imageRendering: 'pixelated',
      display: 'inline-block', verticalAlign: 'middle',
      ...style
    },
    onError: e => { e.target.style.display = 'none'; }
  });

// ─────────────────────────────────────────────
//  EXPORT MODAL
// ─────────────────────────────────────────────

const ExportModal = ({ projectName, onClose, onExport }) => {
  const [filename, setFilename] = useState(projectName || 'mi-fuente');
  const [format,   setFormat]   = useState('otf');

  return React.createElement('div', {
    style: {
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, backdropFilter: 'blur(4px)'
    },
    onClick: onClose
  },
    React.createElement('div', {
      style: {
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: '8px', padding: '32px', width: '340px',
        display: 'flex', flexDirection: 'column', gap: '18px'
      },
      onClick: e => e.stopPropagation()
    },
      React.createElement('h3', {
        style: { fontFamily: '"Press Start 2P",cursive', fontSize: '11px', color: ACCENT, letterSpacing: '2px' }
      }, 'EXPORTAR FUENTE'),

      /* Nombre */
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
        React.createElement('label', {
          style: { fontSize: '9px', letterSpacing: '3px', color: 'var(--text-muted)' }
        }, 'NOMBRE DEL ARCHIVO'),
        React.createElement('input', {
          value: filename,
          onChange: e => setFilename(e.target.value),
          style: {
            background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: '6px', padding: '10px 14px',
            color: 'var(--text)', fontSize: '13px', outline: 'none', fontFamily: "'Space Mono', monospace"
          }
        })
      ),

      /* Formato */
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
        React.createElement('label', {
          style: { fontSize: '9px', letterSpacing: '3px', color: 'var(--text-muted)' }
        }, 'FORMATO'),
        React.createElement('div', { style: { display: 'flex', gap: '8px' } },
          ['otf', 'ttf', 'woff'].map(f =>
            React.createElement('button', {
              key: f,
              onClick: () => setFormat(f),
              style: {
                flex: 1, padding: '10px', borderRadius: '6px', cursor: 'pointer',
                fontFamily: "'Space Mono', monospace", fontWeight: '700', fontSize: '11px',
                letterSpacing: '1px', textTransform: 'uppercase',
                background: format === f ? ACCENT : 'var(--surface2)',
                color: format === f ? '#fff' : 'var(--text-muted)',
                border: format === f ? 'none' : '1px solid var(--border)',
                transition: 'all .15s'
              }
            }, f)
          )
        )
      ),

      /* Botones */
      React.createElement('div', { style: { display: 'flex', gap: '10px', marginTop: '4px' } },
        React.createElement(Btn, {
          onClick: onClose,
          style: {
            flex: 1, padding: '12px',
            background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: '6px', color: 'var(--text-muted)', fontSize: '11px'
          }
        }, 'CANCELAR'),
        React.createElement(Btn, {
          onClick: () => onExport(filename, format),
          style: {
            flex: 1, padding: '12px',
            background: ACCENT, borderRadius: '6px',
            color: '#fff', fontWeight: '700', fontSize: '11px'
          }
        }, 'EXPORTAR')
      )
    )
  );
};

// ─────────────────────────────────────────────
//  USER MENU DROPDOWN
// ─────────────────────────────────────────────

const UserMenu = ({ user, isDark, onClose, onProyectos, onSignOut }) =>
  React.createElement('div', {
    style: {
      position: 'absolute', top: '60px', right: '16px',
      background: isDark ? '#0f1523' : '#fff',
      border: '1px solid var(--border)',
      borderRadius: '8px', padding: '8px',
      minWidth: '200px', zIndex: 50,
      boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
    }
  },
    /* User info */
    React.createElement('div', {
      style: {
        padding: '10px 12px 12px', borderBottom: '1px solid var(--border)', marginBottom: '6px'
      }
    },
      React.createElement('div', {
        style: { fontSize: '12px', fontWeight: '700', color: 'var(--text)' }
      }, user?.displayName || 'Usuario'),
      React.createElement('div', {
        style: { fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }
      }, user?.email || '')
    ),
    /* Menu items */
    ...[
      { label: 'Mis Proyectos', icon: 'projects', fn: onProyectos },
      { label: 'Configuración', icon: 'settings', fn: onClose },
      { label: 'Cuenta',        icon: 'user',     fn: onClose },
    ].map(item =>
      React.createElement('button', {
        key: item.label,
        onClick: item.fn,
        style: {
          width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
          padding: '9px 12px', borderRadius: '6px', border: 'none',
          background: 'none', cursor: 'pointer', color: 'var(--text)',
          fontFamily: "'Space Mono', monospace", fontSize: '11px', textAlign: 'left',
          transition: 'background .1s'
        },
        onMouseEnter: e => { e.currentTarget.style.background = 'rgba(255,0,0,0.07)'; },
        onMouseLeave: e => { e.currentTarget.style.background = 'none'; }
      },
        React.createElement(Icon, { name: item.icon, size: 14 }),
        item.label
      )
    ),
    /* Divider */
    React.createElement('div', { style: { height: '1px', background: 'var(--border)', margin: '6px 0' } }),
    React.createElement('button', {
      onClick: onSignOut,
      style: {
        width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
        padding: '9px 12px', borderRadius: '6px', border: 'none',
        background: 'none', cursor: 'pointer', color: '#ff0000',
        fontFamily: "'Space Mono', monospace", fontSize: '11px', textAlign: 'left',
        transition: 'background .1s'
      },
      onMouseEnter: e => { e.currentTarget.style.background = 'rgba(255,0,0,0.07)'; },
      onMouseLeave: e => { e.currentTarget.style.background = 'none'; }
    },
      React.createElement(Icon, { name: 'logout', size: 14 }),
      'Cerrar sesión'
    )
  );

// ─────────────────────────────────────────────
//  SOCIAL FEED CARD
// ─────────────────────────────────────────────

const FeedCard = ({ proyecto, cv, isDark, onOpen }) => {
  const glyphs     = Object.values(proyecto.font || {}).filter(g => g?.some(Boolean)).length;
  const totalChars = Object.keys(proyecto.font || {}).length;
  const preview    = 'ABC';

  return React.createElement('div', {
    style: {
      background: cv('--card-bg'), border: '1px solid var(--border)',
      borderRadius: '8px', overflow: 'hidden'
    }
  },
    /* Accent bar */
    React.createElement('div', { style: { height: '3px', background: ACCENT } }),

    React.createElement('div', { style: { padding: '18px' } },
      /* Header */
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' } },
        /* Avatar circle */
        React.createElement('div', {
          style: {
            width: '36px', height: '36px', borderRadius: '50%',
            background: 'rgba(255,0,0,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '14px', fontWeight: '700', color: ACCENT,
            fontFamily: '"Press Start 2P",cursive', flexShrink: 0
          }
        }, (proyecto.nombre?.[0] || 'F').toUpperCase()),
        React.createElement('div', null,
          React.createElement('div', { style: { fontSize: '13px', fontWeight: '700', color: 'var(--text)' } }, proyecto.nombre || 'Sin nombre'),
          React.createElement('div', { style: { fontSize: '9px', color: 'var(--text-muted)', letterSpacing: '2px', marginTop: '2px' } },
            `${proyecto.gridSize}PX · ${glyphs} GLIFOS`
          )
        )
      ),

      /* Pixel preview */
      React.createElement('div', {
        style: {
          background: isDark ? '#0a0a0a' : '#f5f5f5',
          borderRadius: '4px', padding: '12px', marginBottom: '14px',
          display: 'flex', gap: '6px', minHeight: '44px', alignItems: 'center'
        }
      },
        preview.split('').map((ch, ci) => {
          const glyph = proyecto.font?.[ch];
          const sz = Math.min(proyecto.gridSize || 8, 12);
          const px = 3;
          return React.createElement('div', {
            key: ci,
            style: { display: 'grid', gridTemplateColumns: `repeat(${sz},${px}px)` }
          },
            Array(sz * sz).fill(0).map((_, pi) =>
              React.createElement('div', {
                key: pi,
                style: {
                  width: `${px}px`, height: `${px}px`,
                  background: glyph?.[pi] ? ACCENT : 'transparent'
                }
              })
            )
          );
        })
      ),

      /* Open button */
      React.createElement(Btn, {
        onClick: () => onOpen(proyecto),
        style: {
          width: '100%', padding: '10px',
          background: ACCENT, borderRadius: '4px',
          color: '#fff', fontSize: '10px', fontWeight: '700', letterSpacing: '2px'
        }
      }, 'ABRIR EDITOR')
    )
  );
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

  const cv = (v) => `var(${v})`;

  // ── auth ──
  const [user,     setUser]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');

  // ── projects ──
  const [proyectos,      setProyectos]      = useState([]);
  const [proyectoActivo, setProyectoActivo] = useState(null);
  const [proyectoNombre, setProyectoNombre] = useState('mi-fuente');
  const [setupMode,      setSetupMode]      = useState(true);
  const [showModal,      setShowModal]      = useState(false);
  const [nuevoNombre,    setNuevoNombre]    = useState('');
  const [nuevoSize,      setNuevoSize]      = useState(8);

  // ── editor ──
  const [gridSize,    setGridSize]    = useState(8);
  const [currentChar, setCurrentChar] = useState('A');
  const [fontData,    setFontData]    = useState({});
  const [grid,        setGrid]        = useState([]);
  const [isSaving,    setIsSaving]    = useState(false);
  const [tool,        setTool]        = useState('fill');
  const [previewText, setPreviewText] = useState('CodeShelf');

  // ── UI state ──
  const [showUserMenu,   setShowUserMenu]   = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  // drawing refs
  const isDrawing = useRef(false);
  const drawMode  = useRef(true);

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
    setProyectoNombre(p.nombre || 'mi-fuente');
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
  // LEFT CLICK = draw, RIGHT CLICK = erase
  const applyPixelTool = useCallback((prevGrid, i) => {
    const g = [...prevGrid];
    const r = Math.floor(i / gridSize);
    const c = i % gridSize;
    const dv = drawMode.current;

    if (tool === 'fill') {
      return floodFill(prevGrid, gridSize, i, dv);
    }
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
    // pencil (default)
    g[i] = dv;
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

  const handlePixelDown = useCallback((i, currentVal, isRightClick) => {
    isDrawing.current = true;
    // Right click always erases, left click always draws
    drawMode.current = isRightClick ? false : true;

    if (tool === 'fill') {
      const filled = floodFill(grid, gridSize, i, drawMode.current);
      commitGrid(filled);
      return;
    }
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

  // ── Export ──
  const handleExport = (filename, format) => {
    const glyphs = [new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 650, path: new opentype.Path() })];
    Object.keys(fontData).forEach(char => {
      const path = new opentype.Path();
      const s = 100;
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
    const font = new opentype.Font({
      familyName: filename, styleName: 'Regular',
      unitsPerEm: 1000, ascender: 800, descender: -200, glyphs
    });
    // opentype.js download() always produces OTF data, rename extension accordingly
    const arrayBuffer = font.download ? font.download(`${filename}.${format}`) : font.download();
    setShowExportModal(false);
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
        color: ACCENT, letterSpacing:'3px', animation:'pulse 1.4s infinite'
      }
    }, 'CARGANDO...'),
    React.createElement('div', {
      style: {
        width:'180px', height:'3px', borderRadius:'2px',
        background: ACCENT, animation:'shimmer 1.8s linear infinite'
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
        borderRadius:'8px', padding:'44px 40px',
        boxShadow: isDark ? '0 30px 80px rgba(0,0,0,0.7)' : '0 30px 80px rgba(0,0,0,0.12)'
      }
    },
      React.createElement('div', { style:{ textAlign:'center', marginBottom:'36px' }},
        React.createElement('div', {
          style:{
            fontFamily:'"Press Start 2P",cursive', fontSize:'22px', lineHeight:1.6, color: ACCENT
          }
        }, 'CODE\nSHELF'),
        React.createElement('p', {
          style:{ color: cv('--text-muted'), fontSize:'9px', letterSpacing:'5px', marginTop:'10px' }
        }, 'PIXEL FONT STUDIO')
      ),
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
              borderRadius:'6px', padding:'14px 18px',
              color: cv('--text'), fontSize:'14px', outline:'none',
            }
          })
        ),
        React.createElement(Btn, {
          style:{
            background: ACCENT_S, color:'#fff', borderRadius:'6px',
            padding:'14px', fontWeight:'700', fontSize:'13px', letterSpacing:'2px',
            width:'100%', marginTop:'4px'
          }
        }, 'ENTRAR')
      ),
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
          border:`1px solid ${cv('--border')}`, borderRadius:'6px',
          color: cv('--text'), fontSize:'13px', fontWeight:'700'
        }
      }, '🔑  Continuar con Google'),
      React.createElement('div', { style:{ textAlign:'center', marginTop:'24px' }},
        React.createElement(Btn, {
          onClick: toggleTheme,
          style:{ background:'none', color: cv('--text-muted'), fontSize:'20px', padding:'4px 12px', borderRadius:'6px' }
        }, isDark ? '☀️' : '🌙')
      )
    )
  );

  /* ── Dashboard / Social Feed ── */
  if (setupMode) return React.createElement('div', {
    style: { minHeight: '100vh', background: cv('--bg'), color: cv('--text') },
    onClick: () => { if (showUserMenu) setShowUserMenu(false); }
  },

    /* NAV */
    React.createElement('nav', {
      style: {
        padding: '0 24px', height: '56px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: `1px solid ${cv('--border')}`,
        background: cv('--nav-bg'), backdropFilter: 'blur(20px)',
        position: 'sticky', top: 0, zIndex: 40
      }
    },
      /* Brand */
      React.createElement('span', {
        style: { fontFamily: '"Press Start 2P",cursive', fontSize: '11px', color: ACCENT, letterSpacing: '2px' }
      }, 'CODESHELF'),

      /* Right: theme + user */
      React.createElement('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', position: 'relative' } },
        React.createElement(Btn, {
          onClick: toggleTheme,
          style: {
            background: cv('--surface2'), border: `1px solid ${cv('--border')}`,
            borderRadius: '4px', padding: '8px', display: 'flex', alignItems: 'center'
          }
        }, React.createElement(Icon, { name: isDark ? 'sun' : 'moon', size: 16 })),

        /* User avatar button */
        React.createElement('button', {
          onClick: e => { e.stopPropagation(); setShowUserMenu(v => !v); },
          style: {
            width: '36px', height: '36px', borderRadius: '50%', border: `2px solid ${ACCENT}`,
            overflow: 'hidden', cursor: 'pointer', padding: 0, background: 'rgba(255,0,0,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
          }
        },
          user?.photoURL
            ? React.createElement('img', { src: user.photoURL, style: { width: '100%', height: '100%', objectFit: 'cover' } })
            : React.createElement('span', {
                style: { fontFamily: '"Press Start 2P",cursive', fontSize: '10px', color: ACCENT }
              }, (user?.displayName?.[0] || user?.email?.[0] || 'U').toUpperCase())
        ),

        /* Dropdown */
        showUserMenu && React.createElement(UserMenu, {
          user, isDark,
          onClose: () => setShowUserMenu(false),
          onProyectos: () => { setShowUserMenu(false); },
          onSignOut: () => signOut(auth)
        })
      )
    ),

    /* Feed */
    React.createElement('div', { style: { maxWidth: '640px', margin: '0 auto', padding: '24px 16px' } },

      /* New project button */
      React.createElement('div', {
        onClick: () => setShowModal(true),
        style: {
          border: `2px dashed ${cv('--border')}`, borderRadius: '8px',
          padding: '20px', display: 'flex', alignItems: 'center', gap: '14px',
          cursor: 'pointer', marginBottom: '20px', transition: 'all .15s'
        },
        onMouseEnter: e => { e.currentTarget.style.borderColor = ACCENT; e.currentTarget.style.background = 'rgba(255,0,0,0.03)'; },
        onMouseLeave: e => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.background = ''; }
      },
        React.createElement('div', {
          style: {
            width: '40px', height: '40px', borderRadius: '4px', background: ACCENT, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }
        }, React.createElement(Icon, { name: 'plus', size: 20 })),
        React.createElement('div', null,
          React.createElement('div', { style: { fontSize: '13px', fontWeight: '700', color: cv('--text') } }, 'Nueva fuente'),
          React.createElement('div', { style: { fontSize: '10px', color: cv('--text-muted'), marginTop: '2px' } }, 'Crea un nuevo proyecto de pixel font')
        )
      ),

      /* Feed posts (proyectos) */
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } },
        proyectos.length === 0
          ? React.createElement('div', {
              style: { textAlign: 'center', padding: '48px 0', color: cv('--text-muted'), fontSize: '10px', letterSpacing: '3px' }
            }, 'SIN PROYECTOS AÚN')
          : proyectos.map(p =>
              React.createElement(FeedCard, {
                key: p.id, proyecto: p, cv, isDark,
                onOpen: abrirProyecto
              })
            )
      )
    ),

    /* New project modal */
    showModal && React.createElement('div', {
      style: {
        position:'fixed', inset:0, background:'rgba(0,0,0,0.6)',
        display:'flex', alignItems:'center', justifyContent:'center',
        zIndex:100, backdropFilter:'blur(4px)'
      },
      onClick: () => setShowModal(false)
    },
      React.createElement('div', {
        style: {
          background: isDark ? '#0f1523' : '#fff',
          border:`1px solid ${cv('--border')}`,
          borderRadius:'8px', padding:'36px', width:'360px',
          display:'flex', flexDirection:'column', gap:'16px'
        },
        onClick: e => e.stopPropagation()
      },
        React.createElement('h3', {
          style:{ fontFamily:'"Press Start 2P",cursive', fontSize:'11px', color: ACCENT, letterSpacing:'2px' }
        }, 'NUEVA FUENTE'),
        React.createElement('input', {
          placeholder:'Nombre de la fuente',
          value: nuevoNombre, onChange: e => setNuevoNombre(e.target.value),
          autoFocus: true,
          style:{
            background: cv('--surface2'), border:`1px solid ${cv('--border')}`,
            borderRadius:'6px', padding:'12px 16px',
            color: cv('--text'), fontSize:'14px', outline:'none',
            fontFamily:"'Space Mono', monospace"
          }
        }),
        React.createElement('div', { style:{ display:'flex', flexDirection:'column', gap:'8px' }},
          React.createElement('label', {
            style:{ fontSize:'9px', letterSpacing:'3px', color: cv('--text-muted') }
          }, 'TAMAÑO DE CUADRÍCULA'),
          React.createElement('div', { style:{ display:'flex', gap:'8px' }},
            [8, 12, 16].map(s =>
              React.createElement(Btn, {
                key: s, onClick: () => setNuevoSize(s),
                style:{
                  flex:1, padding:'10px',
                  background: nuevoSize === s ? ACCENT : cv('--surface2'),
                  border: nuevoSize === s ? 'none' : `1px solid ${cv('--border')}`,
                  borderRadius:'4px', color: nuevoSize === s ? '#fff' : cv('--text-muted'),
                  fontSize:'12px', fontWeight:'700'
                }
              }, `${s}px`)
            )
          )
        ),
        React.createElement('div', { style:{ display:'flex', gap:'10px' }},
          React.createElement(Btn, {
            onClick: () => setShowModal(false),
            style:{
              flex:1, padding:'12px', background: cv('--surface2'),
              border:`1px solid ${cv('--border')}`, borderRadius:'6px',
              color: cv('--text-muted'), fontSize:'11px'
            }
          }, 'CANCELAR'),
          React.createElement(Btn, {
            onClick: confirmarNuevoProyecto, disabled: isSaving,
            style:{
              flex:1, padding:'12px', background: ACCENT,
              borderRadius:'6px', color:'#fff', fontWeight:'700', fontSize:'11px'
            }
          }, isSaving ? '...' : 'CREAR')
        )
      )
    )
  );

  /* ─────────────────────────────────────────
     ── EDITOR PRINCIPAL ──
  ───────────────────────────────────────── */

  // Tools: pencil+eraser removed, now controlled by mouse button
  const actionTools = [
    { icon:'⚡', label:'Invertir', fn: invertCanvas },
    { icon:'⬆', label:'Arriba',   fn: () => doShift('up')    },
    { icon:'⬇', label:'Abajo',    fn: () => doShift('down')  },
    { icon:'⬅', label:'Izq',      fn: () => doShift('left')  },
    { icon:'➡', label:'Der',      fn: () => doShift('right') },
  ];

  const modeTools = [
    { id:'pencil',   icon: React.createElement(Icon, { name:'pencil',   size:18 }), label:'Libre'    },
    { id:'fill',     icon: React.createElement(Icon, { name:'fill',     size:18 }), label:'Relleno'  },
    { id:'mirror-h', icon: React.createElement(Icon, { name:'mirror-h', size:18 }), label:'Espejo H' },
    { id:'mirror-v', icon: React.createElement(Icon, { name:'mirror-v', size:18 }), label:'Espejo V' },
  ];

  return React.createElement('div', {
    style:{ minHeight:'100vh', background: cv('--bg'), color: cv('--text') },
    onMouseUp: handleMouseUp,
    onContextMenu: e => e.preventDefault() // prevent right-click browser menu on canvas
  },

    /* Export modal */
    showExportModal && React.createElement(ExportModal, {
      projectName: proyectoNombre,
      onClose: () => setShowExportModal(false),
      onExport: handleExport
    }),

    /* ── NAV ── */
    React.createElement('nav', {
      style:{
        padding:'0 20px', height:'52px', borderBottom:`1px solid ${cv('--border')}`,
        display:'flex', justifyContent:'space-between', alignItems:'center',
        backdropFilter:'blur(20px)', background: cv('--nav-bg'),
        position:'sticky', top:0, zIndex:40
      }
    },
      React.createElement(Btn, {
        onClick: () => setSetupMode(true),
        style:{
          background: cv('--surface2'), border:`1px solid ${cv('--border')}`,
          borderRadius:'6px', padding:'7px 14px', color: cv('--text-muted'), fontSize:'11px'
        }
      }, '← Feed'),
      /* Brand */
      React.createElement('span', {
        style:{
          fontFamily:'"Press Start 2P",cursive', fontSize:'11px', color: ACCENT
        }
      }, 'CODE SHELF'),
      /* Right nav */
      React.createElement('div', { style:{ display:'flex', gap:'8px', alignItems:'center' }},
        React.createElement(Btn, {
          onClick: toggleTheme,
          style:{
            background: cv('--surface2'), border:`1px solid ${cv('--border')}`,
            borderRadius:'6px', padding:'7px 10px', fontSize:'15px', color: cv('--text')
          }
        }, isDark ? '☀️' : '🌙'),
        React.createElement(Btn, {
          onClick: () => setShowExportModal(true),
          style:{
            background: ACCENT, borderRadius:'6px',
            padding:'7px 18px', color:'#fff', fontWeight:'700', fontSize:'11px', letterSpacing:'1px'
          }
        }, '↓ EXPORTAR'),
        isSaving && React.createElement('div', {
          style:{
            width:'8px', height:'8px', borderRadius:'50%', border:`2px solid ${ACCENT}`,
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
          background: cv('--surface'), borderRadius:'12px',
          border:`1px solid ${cv('--border')}`, padding:'28px'
        }
      },

        /* Current char display */
        React.createElement('div', {
          style:{
            fontFamily:'"Press Start 2P",cursive', fontSize:'52px', lineHeight:1,
            color: ACCENT, minHeight:'64px', display:'flex', alignItems:'center'
          }
        }, currentChar === ' ' ? '[ ]' : currentChar),

        /* ── Tool mode palette (no pencil/eraser) ── */
        React.createElement('div', {
          style:{ display:'flex', gap:'6px', flexWrap:'wrap', justifyContent:'center', alignItems:'center' }
        },
          /* Mode tools */
          ...modeTools.map(t =>
            React.createElement(Btn, {
              key: t.id, onClick: () => setTool(t.id), title: t.label,
              style:{
                padding:'9px 11px', borderRadius:'8px', fontSize:'18px',
                background: tool === t.id ? ACCENT : cv('--surface2'),
                border: tool === t.id ? 'none' : `1px solid ${cv('--border')}`,
                color: tool === t.id ? '#fff' : cv('--text-muted'),
                boxShadow: tool === t.id ? `0 4px 12px rgba(255,0,0,0.35)` : 'none',
                display:'flex', flexDirection:'column', alignItems:'center', gap:'3px', minWidth:'52px'
              }
            },
              t.icon,
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
                padding:'9px 11px', borderRadius:'8px', fontSize:'18px',
                background: cv('--surface2'), border:`1px solid ${cv('--border')}`,
                color: cv('--text-muted'),
                display:'flex', flexDirection:'column', alignItems:'center', gap:'3px', minWidth:'48px'
              }
            },
              React.createElement('span', null, t.icon),
              React.createElement('span', { style:{ fontSize:'7px' }}, t.label)
            )
          ),
          /* Hint: right click = erase */
          React.createElement('div', {
            style:{
              width: '100%', textAlign:'center', fontSize:'8px', letterSpacing:'2px',
              color: cv('--text-muted'), marginTop:'2px'
            }
          }, '← CLIC IZQ: DIBUJAR  ·  CLIC DER: BORRAR →')
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
            borderRadius:'8px', overflow:'hidden',
            border:`2px solid ${isDark ? '#330000' : '#ffcccc'}`,
            cursor: 'crosshair'
          },
          onMouseLeave: () => { isDrawing.current = false; }
        },
          grid.map((active, i) =>
            React.createElement('div', {
              key: i,
              onMouseDown: e => {
                e.preventDefault();
                handlePixelDown(i, active, e.button === 2);
              },
              onMouseEnter: () => handlePixelEnter(i),
              onContextMenu: e => e.preventDefault(),
              style:{
                width:'100%', height:'100%', transition:'background .04s',
                background: active ? ACCENT : cv('--empty'),
                boxShadow: active ? `inset 0 0 0 1px rgba(255,0,0,0.25)` : 'none'
              }
            })
          )
        ),

        /* ── Text preview ── */
        React.createElement('div', {
          style:{
            width:'100%', maxWidth:'480px',
            background: cv('--surface2'), border:`1px solid ${cv('--border')}`,
            borderRadius:'8px', padding:'16px 18px'
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
                textAlign:'right', width:'160px', fontFamily:"'Space Mono', monospace"
              }
            })
          ),
          React.createElement('div', { style:{ display:'flex', gap:'4px', flexWrap:'wrap', minHeight:'32px' }},
            previewText.split('').map((ch, ci) => {
              const glyphData = fontData[ch];
              const sz = Math.min(gridSize, 16);
              const px = 3;
              return React.createElement('div', {
                key: ci,
                style:{ display:'grid', gridTemplateColumns:`repeat(${sz},${px}px)`, gap:'0px', marginRight:'2px' }
              },
                Array(sz * sz).fill(0).map((_, pi) =>
                  React.createElement('div', {
                    key: pi,
                    style:{ width:`${px}px`, height:`${px}px`, background: glyphData?.[pi] ? ACCENT : 'transparent' }
                  })
                )
              );
            })
          )
        ),

        /* Save button */
        React.createElement(Btn, {
          onClick: () => handleSaveFont(fontData),
          style:{
            width:'100%', maxWidth:'480px', padding:'13px',
            background: isSaving ? cv('--surface2') : ACCENT,
            borderRadius:'8px', color: isSaving ? cv('--text-muted') : '#fff',
            fontWeight:'700', fontSize:'12px', letterSpacing:'2px'
          }
        }, isSaving ? '⏳  GUARDANDO...' : '💾  GUARDAR CAMBIOS')
      ),

      /* ── RIGHT: Characters panel ── */
      React.createElement('aside', {
        style:{
          background: cv('--surface'), border:`1px solid ${cv('--border')}`,
          borderRadius:'12px', padding:'20px', position:'sticky', top:'70px'
        }
      },
        React.createElement('div', {
          style:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'14px' }
        },
          React.createElement('span', { style:{ color: cv('--text-muted'), fontSize:'9px', letterSpacing:'3px' }}, 'CARACTERES'),
          React.createElement(Btn, {
            onClick: clearCanvas,
            style:{
              background:'rgba(255,0,0,0.08)', border:'1px solid rgba(255,0,0,0.2)',
              borderRadius:'6px', padding:'5px 10px', color:'#ff4444', fontSize:'9px'
            }
          }, 'LIMPIAR')
        ),
        /* Stats */
        React.createElement('div', {
          style:{
            display:'flex', gap:'10px', marginBottom:'14px',
            padding:'10px', background: cv('--surface2'), borderRadius:'8px'
          }
        },
          React.createElement('div', { style:{ flex:1, textAlign:'center' }},
            React.createElement('div', { style:{ fontSize:'18px', fontWeight:'700', color: ACCENT }},
              Object.values(fontData).filter(g => g?.some(Boolean)).length
            ),
            React.createElement('div', { style:{ fontSize:'7px', color: cv('--text-muted'), letterSpacing:'2px' }}, 'GLIFOS')
          ),
          React.createElement('div', { style:{ flex:1, textAlign:'center' }},
            React.createElement('div', { style:{ fontSize:'18px', fontWeight:'700', color: ACCENT }}, gridSize),
            React.createElement('div', { style:{ fontSize:'7px', color: cv('--text-muted'), letterSpacing:'2px' }}, 'PX GRID')
          ),
          React.createElement('div', { style:{ flex:1, textAlign:'center' }},
            React.createElement('div', { style:{ fontSize:'18px', fontWeight:'700', color: ACCENT }},
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
                height:'50px', borderRadius:'6px',
                border: isActive ? 'none' : `1px solid ${configured ? 'rgba(255,0,0,0.25)' : cv('--border')}`,
                background: isActive
                  ? ACCENT
                  : configured ? 'rgba(255,0,0,0.08)' : cv('--surface2'),
                color: isActive ? '#fff' : configured ? '#ff4444' : cv('--text-muted'),
                fontWeight:'700', fontSize:'14px', position:'relative',
                boxShadow: isActive ? '0 4px 12px rgba(255,0,0,0.35)' : 'none',
                display:'flex', alignItems:'center', justifyContent:'center'
              }
            },
              t === ' ' ? '·' : t,
              configured && !isActive && React.createElement('div', {
                style:{
                  position:'absolute', top:'5px', right:'5px',
                  width:'4px', height:'4px', borderRadius:'50%', background: ACCENT
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
