// ─────────────────────────────────────────────
//  EDITOR — src/Editor.js
// ─────────────────────────────────────────────
import React, { useState, useRef, useCallback, useEffect } from 'https://esm.sh/react@18.2.0';
import { auth, signOut } from './firebase.js'; // Necesario para el menú de usuario
import { ACCENT, TECLADO, R_CARD, R_BTN, FONT_MONO, FONT_PIXEL } from './constants.js';
import { Btn, Icon, Overlay, Modal, Label } from './ui.js';
import { floodFill, shiftGrid, buildAndDownload } from './canvas.js';


// ── Export modal ─────────────────────────────
const ExportModal = ({ projectName, onClose, onExport }) => {
  const [filename, setFilename] = useState(projectName || 'mi-fuente');
  const [format,   setFormat]   = useState('otf');

  return React.createElement(Overlay, { onClose },
    React.createElement(Modal, { style: { width: '320px' } },
      React.createElement('h3', {
        style: { fontFamily: FONT_PIXEL, fontSize: '10px', color: ACCENT, letterSpacing: '2px', margin: 0 }
      }, 'EXPORTAR FUENTE'),

      /* Nombre */
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
        React.createElement(Label, null, 'NOMBRE DEL ARCHIVO'),
        React.createElement('input', {
          value: filename,
          onChange: e => setFilename(e.target.value),
          style: {
            background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: R_BTN, padding: '10px 13px',
            color: 'var(--text)', fontSize: '13px', outline: 'none', fontFamily: FONT_MONO
          }
        })
      ),

      /* Formato */
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
        React.createElement(Label, null, 'FORMATO'),
        React.createElement('div', { style: { display: 'flex', gap: '8px' } },
          ['otf', 'ttf', 'woff'].map(f =>
            React.createElement('button', {
              key: f, onClick: () => setFormat(f),
              style: {
                flex: 1, padding: '9px', borderRadius: R_BTN, cursor: 'pointer',
                fontFamily: FONT_MONO, fontWeight: '700', fontSize: '11px',
                letterSpacing: '1px', textTransform: 'uppercase', transition: 'all .13s',
                background: format === f ? ACCENT : 'var(--surface2)',
                color: format === f ? '#fff' : 'var(--text-muted)',
                border: format === f ? 'none' : '1px solid var(--border)'
              }
            }, f)
          )
        )
      ),

      /* Botones */
      React.createElement('div', { style: { display: 'flex', gap: '10px' } },
        React.createElement(Btn, {
          onClick: onClose,
          style: {
            flex: 1, padding: '11px',
            background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: R_BTN, color: 'var(--text-muted)', fontSize: '11px'
          }
        }, 'CANCELAR'),
        React.createElement(Btn, {
          onClick: () => onExport(filename, format),
          style: {
            flex: 1, padding: '11px',
            background: ACCENT, borderRadius: R_BTN,
            color: '#fff', fontWeight: '700', fontSize: '11px'
          }
        }, 'EXPORTAR')
      )
    )
  );
};

// ── Editor page ──────────────────────────────
export function EditorPage({
  isDark, toggleTheme,
  gridSize, currentChar, fontData, grid, isSaving,
  tool, setTool, previewText, setPreviewText,
  onPixelDown, onPixelEnter, onMouseUp,
  onSwitchChar, onClearCanvas, onInvert, onShift, onSave,
  projectName, user // Asegúrate de pasar 'user' desde App.js
}) {
  const [showExport, setShowExport] = useState(false);
  const [openFileMenu, setOpenFileMenu] = useState(false);
  const [openUserMenu, setOpenUserMenu] = useState(false);

  // --- SOLUCIÓN A avatarInit ---
  // Calculamos la inicial del usuario (del nombre o del correo)
  const avatarInit = (user?.displayName || user?.email || '?')[0].toUpperCase();

  // Cerrar menús al hacer clic en cualquier parte del editor
  useEffect(() => {
    const closeMenus = () => {
      setOpenFileMenu(false);
      setOpenUserMenu(false);
    };
    if (openFileMenu || openUserMenu) {
      window.addEventListener('click', closeMenus);
    }
    return () => window.removeEventListener('click', closeMenus);
  }, [openFileMenu, openUserMenu]);

  const modeTools = [
    { id: 'pencil',   iconName: 'pencil',   label: 'Libre'    },
    { id: 'fill',     iconName: 'fill',     label: 'Relleno'  },
    { id: 'mirror-h', iconName: 'mirror-h', label: 'Espejo H' },
    { id: 'mirror-v', iconName: 'mirror-v', label: 'Espejo V' },
  ];

  const actionTools = [
    { icon: '⚡', label: 'Inv',    fn: onInvert },
    { icon: '↑',  label: 'Arriba', fn: () => onShift('up')    },
    { icon: '↓',  label: 'Abajo',  fn: () => onShift('down')  },
    { icon: '←',  label: 'Izq',    fn: () => onShift('left')  },
    { icon: '→',  label: 'Der',    fn: () => onShift('right') },
  ];

  return React.createElement('div', { className: 'editor-layout' },
    // NAVBAR
    React.createElement('nav', { className: 'navbar' },
      React.createElement('div', { className: 'nav-left' },
        React.createElement('span', { className: 'logo', onClick: () => window.location.href='feed.html', style: {cursor:'pointer'} }, 'CODESHELF'),
        
        React.createElement('div', { className: 'dropdown-container' },
          React.createElement('button', { 
            className: 'menu-trigger',
            onClick: (e) => { e.stopPropagation(); setOpenFileMenu(!openFileMenu); } 
          }, 'Archivo'),
          
          openFileMenu && React.createElement('div', { 
            className: 'dd-menu show', 
            style: { left: 0, right: 'auto' } 
          },
            React.createElement('button', { className: 'dd-item', onClick: () => window.location.href = 'feed.html' }, '📁 Mis Proyectos'),
            React.createElement('button', { className: 'dd-item', onClick: onSave }, '💾 Guardar (Ctrl+S)'),
            React.createElement('button', { className: 'dd-item', onClick: () => setShowExport(true) }, '📤 Exportar Fuente')
          )
        )
      ),

      React.createElement('div', { className: 'nav-right' },
        React.createElement('button', { className: 'nav-btn', onClick: toggleTheme }, isDark ? '🌙' : '☀️'),
        React.createElement('div', { 
          className: 'user-avatar', 
          onClick: (e) => { e.stopPropagation(); setOpenUserMenu(!openUserMenu); } 
        }, avatarInit),
        
        openUserMenu && React.createElement('div', { className: 'dd-menu show' },
          React.createElement('div', { className: 'dd-header' }, user?.email),
          React.createElement('button', { 
            className: 'dd-item danger', 
            onClick: () => signOut(auth).then(() => window.location.href='index.html') 
          }, '🚪 Cerrar Sesión')
        )
      )
    ),

    /* LAYOUT */
    React.createElement('main', {
      style: {
        padding: '20px', maxWidth: '1200px', margin: '0 auto',
        display: 'grid', gridTemplateColumns: '1fr 280px', gap: '18px', alignItems: 'start'
      }
    },

      /* ── Canvas section ── */
      React.createElement('section', {
        style: {
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px',
          background: 'var(--surface)', borderRadius: R_CARD,
          border: '1px solid var(--border)', padding: '24px'
        }
      },

        /* Char display */
        React.createElement('div', {
          style: {
            fontFamily: FONT_PIXEL, fontSize: '48px', lineHeight: 1,
            color: ACCENT, minHeight: '60px',
            display: 'flex', alignItems: 'center'
          }
        }, currentChar === ' ' ? '[ ]' : currentChar),

        /* Tool palette */
        React.createElement('div', {
          style: { display: 'flex', gap: '5px', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }
        },
          /* Mode tools */
          ...modeTools.map(t =>
            React.createElement(Btn, {
              key: t.id, onClick: () => setTool(t.id), title: t.label,
              style: {
                padding: '8px 10px', borderRadius: R_BTN,
                background: tool === t.id ? ACCENT : 'var(--surface2)',
                border: tool === t.id ? 'none' : '1px solid var(--border)',
                color: tool === t.id ? '#fff' : 'var(--text-muted)',
                boxShadow: tool === t.id ? `0 3px 10px rgba(230,34,34,0.35)` : 'none',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', minWidth: '50px'
              }
            },
              React.createElement(Icon, { name: t.iconName, size: 16, isDark: tool === t.id ? true : isDark }),
              React.createElement('span', { style: { fontSize: '7px', letterSpacing: '1px', fontFamily: FONT_MONO } }, t.label)
            )
          ),
          /* Divider */
          React.createElement('div', { style: { width: '1px', height: '44px', background: 'var(--border)', margin: '0 3px' } }),
          /* Action tools */
          ...actionTools.map((t, i) =>
            React.createElement(Btn, {
              key: i, onClick: t.fn, title: t.label,
              style: {
                padding: '8px 10px', borderRadius: R_BTN,
                background: 'var(--surface2)', border: '1px solid var(--border)',
                color: 'var(--text-muted)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', minWidth: '44px'
              }
            },
              React.createElement('span', { style: { fontSize: '16px' } }, t.icon),
              React.createElement('span', { style: { fontSize: '7px', fontFamily: FONT_MONO } }, t.label)
            )
          ),
          /* Hint */
          React.createElement('div', {
            style: {
              width: '100%', textAlign: 'center', fontSize: '8px', letterSpacing: '2px',
              color: 'var(--text-muted)', marginTop: '2px', fontFamily: FONT_MONO
            }
          }, '← IZQ: DIBUJAR  ·  DER: BORRAR →')
        ),

        /* Pixel canvas */
        React.createElement('div', {
          style: {
            display: 'grid',
            gridTemplateColumns: `repeat(${gridSize}, 1fr)`,
            width: 'min(78vw, 460px)', height: 'min(78vw, 460px)',
            gap: '1px',
            background: 'var(--grid-line)',
            borderRadius: R_CARD, overflow: 'hidden',
            border: `2px solid ${isDark ? '#2a0000' : '#ffdddd'}`,
            cursor: 'crosshair', userSelect: 'none'
          },
          onMouseLeave: () => { /* handled in App */ }
        },
          grid.map((active, i) =>
            React.createElement('div', {
              key: i,
              onMouseDown: e => { e.preventDefault(); onPixelDown(i, active, e.button === 2); },
              onMouseEnter: () => onPixelEnter(i),
              onContextMenu: e => e.preventDefault(),
              style: {
                width: '100%', height: '100%', transition: 'background .03s',
                background: active ? ACCENT : 'var(--empty)',
                boxShadow: active ? 'inset 0 0 0 1px rgba(230,34,34,0.2)' : 'none'
              }
            })
          )
        ),

        /* Preview */
        React.createElement('div', {
          style: {
            width: '100%', maxWidth: '460px',
            background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: R_BTN, padding: '14px 16px'
          }
        },
          React.createElement('div', {
            style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }
          },
            React.createElement(Label, null, 'PREVIEW'),
            React.createElement('input', {
              value: previewText,
              onChange: e => setPreviewText(e.target.value),
              style: {
                background: 'none', border: 'none', outline: 'none',
                color: 'var(--text-muted)', fontSize: '11px', fontFamily: FONT_MONO,
                textAlign: 'right', width: '150px'
              }
            })
          ),
          React.createElement('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap', minHeight: '28px' } },
            previewText.split('').map((ch, ci) => {
              const glyph = fontData[ch];
              const sz    = Math.min(gridSize, 16);
              const px    = 3;
              return React.createElement('div', {
                key: ci,
                style: { display: 'grid', gridTemplateColumns: `repeat(${sz},${px}px)`, marginRight: '2px' }
              },
                Array(sz * sz).fill(0).map((_, pi) =>
                  React.createElement('div', {
                    key: pi,
                    style: { width: `${px}px`, height: `${px}px`, background: glyph?.[pi] ? ACCENT : 'transparent' }
                  })
                )
              );
            })
          )
        ),

      /* ── Characters panel ── */
      React.createElement('aside', {
        style: {
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: R_CARD, padding: '18px', position: 'sticky', top: '68px'
        }
      },
        React.createElement('div', {
          style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }
        },
          React.createElement(Label, null, 'CARACTERES'),
          React.createElement(Btn, {
            onClick: onClearCanvas,
            style: {
              background: 'rgba(230,34,34,0.07)', border: '1px solid rgba(230,34,34,0.18)',
              borderRadius: R_BTN, padding: '5px 10px', color: ACCENT, fontSize: '9px', fontFamily: FONT_MONO
            }
          }, 'LIMPIAR')
        ),

        /* Stats */
        React.createElement('div', {
          style: {
            display: 'flex', gap: '8px', marginBottom: '12px',
            padding: '9px', background: 'var(--surface2)', borderRadius: R_BTN
          }
        },
          [
            { val: Object.values(fontData).filter(g => g?.some(Boolean)).length, lbl: 'GLIFOS' },
            { val: gridSize, lbl: 'PX GRID' },
            { val: grid.filter(Boolean).length, lbl: 'PÍXELES' }
          ].map(({ val, lbl }) =>
            React.createElement('div', { key: lbl, style: { flex: 1, textAlign: 'center' } },
              React.createElement('div', { style: { fontSize: '17px', fontWeight: '700', color: ACCENT, fontFamily: FONT_MONO } }, val),
              React.createElement('div', { style: { fontSize: '7px', color: 'var(--text-muted)', letterSpacing: '2px', fontFamily: FONT_MONO } }, lbl)
            )
          )
        ),

        /* Char grid */
        React.createElement('div', {
          style: {
            display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '4px',
            maxHeight: '58vh', overflowY: 'auto', paddingRight: '2px'
          }
        },
          TECLADO.map(t => {
            const configured = fontData?.[t]?.some(Boolean);
            const isActive   = currentChar === t;
            return React.createElement(Btn, {
              key: t, onClick: () => onSwitchChar(t), title: t,
              style: {
                height: '46px', borderRadius: R_BTN,
                border: isActive ? 'none' : `1px solid ${configured ? 'rgba(230,34,34,0.22)' : 'var(--border)'}`,
                background: isActive ? ACCENT : configured ? 'rgba(230,34,34,0.07)' : 'var(--surface2)',
                color: isActive ? '#fff' : configured ? ACCENT : 'var(--text-muted)',
                fontWeight: '700', fontSize: '13px', position: 'relative',
                boxShadow: isActive ? '0 3px 10px rgba(230,34,34,0.3)' : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: FONT_MONO
              }
            },
              t === ' ' ? '·' : t,
              configured && !isActive && React.createElement('div', {
                style: {
                  position: 'absolute', top: '4px', right: '4px',
                  width: '4px', height: '4px', borderRadius: '50%', background: ACCENT
                }
              })
            );
          })
        )
      )
    )


