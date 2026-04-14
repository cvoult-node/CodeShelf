// ─────────────────────────────────────────────
//  EDITOR — src/Editor.js
// ─────────────────────────────────────────────
import React, { useState, useRef, useCallback, useEffect } from 'https://esm.sh/react@18.2.0';
import { auth, signOut } from './firebase.js';
import { ACCENT, TECLADO, R_CARD, R_BTN, FONT_MONO, FONT_PIXEL } from './constants.js';
import { Btn, Icon, Overlay, Modal, Label } from './ui.js';
import { buildAndDownload } from './canvas.js';

// ── Export modal ─────────────────────────────
const ExportModal = ({ projectName, onClose, onExport }) => {
  const [filename, setFilename] = useState(projectName || 'mi-fuente');
  const [format,   setFormat]   = useState('otf');

  return React.createElement(Overlay, { onClose },
    React.createElement(Modal, { style: { width: '320px' } },
      React.createElement('h3', {
        style: { fontFamily: FONT_PIXEL, fontSize: '10px', color: ACCENT, letterSpacing: '2px', margin: 0 }
      }, 'EXPORTAR FUENTE'),

      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
        React.createElement(Label, null, 'NOMBRE DEL ARCHIVO'),
        React.createElement('input', {
          value: filename,
          onChange: e => setFilename(e.target.value),
          style: {
            background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: R_BTN, padding: '10px 13px', color: 'var(--text)',
            fontSize: '13px', outline: 'none', fontFamily: FONT_MONO
          }
        })
      ),

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
                color: format === f ? '#fff' : 'var(--muted)',
                border: format === f ? 'none' : '1px solid var(--border)'
              }
            }, f)
          )
        )
      ),

      React.createElement('div', { style: { display: 'flex', gap: '10px' } },
        React.createElement(Btn, {
          onClick: onClose,
          style: {
            flex: 1, padding: '11px',
            background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: R_BTN, color: 'var(--muted)', fontSize: '11px'
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

// ── Small SVG icon helper (inline img) ───────
const SvgIcon = ({ name, size = 14, style = {} }) =>
  React.createElement('img', {
    src: `./src/icons/${name}.svg`,
    width: size, height: size,
    style: {
      display: 'inline-block', verticalAlign: 'middle',
      flexShrink: 0, filter: 'var(--icon-filter)',
      opacity: .7, ...style
    }
  });

// ── Editor page ──────────────────────────────
export function EditorPage({
  user, isDark, toggleTheme,
  gridSize, currentChar, fontData, grid, isSaving,
  tool, setTool, previewText, setPreviewText,
  onPixelDown, onPixelEnter, onMouseUp,
  onSwitchChar, onClearCanvas, onInvert, onShift, onSave,
  onBack, projectName
}) {
  const [showExport,    setShowExport]    = useState(false);
  const [openFileMenu,  setOpenFileMenu]  = useState(false);
  const [openUserMenu,  setOpenUserMenu]  = useState(false);
  const [avatarColor,   setAvatarColor]   = useState(ACCENT);

  const avatarInit = (user?.displayName || user?.email || '?')[0].toUpperCase();

  // Load avatar color from profile
  useEffect(() => {
    if (!user) return;
    import('./firebase.js').then(({ db }) => {
      import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js').then(({ doc, getDoc }) => {
        getDoc(doc(db, 'usuarios', user.uid, 'config', 'perfil')).then(snap => {
          if (snap.exists() && snap.data().avatarColor) setAvatarColor(snap.data().avatarColor);
        }).catch(() => {});
      });
    });
  }, [user]);

  useEffect(() => {
    const close = () => { setOpenFileMenu(false); setOpenUserMenu(false); };
    if (openFileMenu || openUserMenu) window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [openFileMenu, openUserMenu]);

  const modeTools = [
    { id: 'pencil',   iconName: 'pencil',   label: 'LIBRE'    },
    { id: 'fill',     iconName: 'fill',     label: 'RELLENO'  },
    { id: 'mirror-h', iconName: 'mirror-h', label: 'ESP. H'   },
    { id: 'mirror-v', iconName: 'mirror-v', label: 'ESP. V'   },
  ];

  const actionTools = [
    { iconName: 'invert',      label: 'INV',    fn: onInvert },
    { iconName: 'arrow-up',    label: 'ARRIBA', fn: () => onShift('up')    },
    { iconName: 'arrow-down',  label: 'ABAJO',  fn: () => onShift('down')  },
    { iconName: 'arrow-left',  label: 'IZQ',    fn: () => onShift('left')  },
    { iconName: 'arrow-right', label: 'DER',    fn: () => onShift('right') },
  ];

  const toolbarBase = {
    padding: '8px 10px', borderRadius: R_BTN, cursor: 'pointer',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', minWidth: '52px',
    fontFamily: FONT_MONO, border: 'none', transition: 'all .13s'
  };

  return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', minHeight: '100vh' } },

    /* ── NAVBAR ──────────────────────────── */
    React.createElement('nav', {
      style: {
        height: '52px', padding: '0 20px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: '1px solid var(--border)',
        background: 'var(--nav-bg)',
        backdropFilter: 'blur(16px)',
        position: 'sticky', top: 0, zIndex: 200
      }
    },
      // Left: logo + file menu
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '4px' } },
        React.createElement('span', {
          onClick: onBack,
          style: {
            fontFamily: FONT_PIXEL, fontSize: '11px', color: ACCENT,
            letterSpacing: '2px', cursor: 'pointer', padding: '6px 10px',
            borderRadius: R_BTN, transition: 'opacity .15s'
          }
        }, 'CODESHELF'),

        // File dropdown
        React.createElement('div', { style: { position: 'relative' } },
          React.createElement('button', {
            onClick: e => { e.stopPropagation(); setOpenFileMenu(v => !v); },
            style: {
              fontFamily: FONT_MONO, fontSize: '9px', letterSpacing: '2px',
              color: 'var(--muted)', padding: '6px 12px', borderRadius: R_BTN,
              background: 'none', border: 'none', cursor: 'pointer',
              transition: 'color .15s, background .15s'
            }
          }, 'ARCHIVO'),
          openFileMenu && React.createElement('div', {
            onClick: e => e.stopPropagation(),
            style: {
              position: 'absolute', top: 'calc(100% + 8px)', left: 0,
              background: 'var(--surface)', border: '1px solid var(--border2)',
              borderRadius: '10px', minWidth: '200px', zIndex: 300,
              boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
              overflow: 'hidden', padding: '5px 0'
            }
          },
            [
              { icon: 'fonts',  label: 'Mis proyectos', fn: onBack },
              { icon: 'save',   label: `Guardar${isSaving ? '...' : '  (Ctrl+S)'}`, fn: onSave },
              { icon: 'export', label: 'Exportar fuente', fn: () => { setShowExport(true); setOpenFileMenu(false); } },
            ].map(({ icon, label, fn }) =>
              React.createElement('button', {
                key: label,
                onClick: () => { fn(); setOpenFileMenu(false); },
                style: {
                  display: 'flex', alignItems: 'center', gap: '10px',
                  width: '100%', padding: '9px 16px',
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontFamily: FONT_MONO, fontSize: '11px', color: 'var(--muted)',
                  textAlign: 'left', transition: 'background .12s, color .12s'
                },
                onMouseEnter: e => { e.currentTarget.style.background = 'rgba(130,100,200,0.07)'; e.currentTarget.style.color = 'var(--text)'; },
                onMouseLeave: e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--muted)'; }
              },
                React.createElement('img', { src: `./src/icons/${icon}.svg`, width: 14, height: 14, style: { filter: 'var(--icon-filter)', opacity: .5 } }),
                label
              )
            )
          )
        ),

        // Project name
        React.createElement('span', {
          style: {
            fontFamily: FONT_MONO, fontSize: '9px', letterSpacing: '2px',
            color: 'var(--muted2)', paddingLeft: '8px'
          }
        }, projectName || '')
      ),

      // Right: save indicator + theme + avatar
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
        isSaving && React.createElement('span', {
          style: { fontFamily: FONT_MONO, fontSize: '9px', color: 'var(--muted2)', letterSpacing: '2px' }
        }, 'GUARDANDO...'),

        // Theme toggle
        React.createElement('button', {
          onClick: toggleTheme,
          title: isDark ? 'Tema claro' : 'Tema oscuro',
          style: {
            width: '32px', height: '32px', borderRadius: '50%',
            background: 'var(--surface2)', border: '1px solid var(--border)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background .15s'
          }
        },
          React.createElement('img', {
            src: './src/icons/theme.svg', width: 14, height: 14,
            style: { filter: 'var(--icon-filter)', opacity: .6 }
          })
        ),

        // Avatar / user menu
        React.createElement('div', { style: { position: 'relative' } },
          React.createElement('div', {
            onClick: e => { e.stopPropagation(); setOpenUserMenu(v => !v); },
            style: {
              width: '32px', height: '32px', borderRadius: '50%',
              border: `1.5px solid ${avatarColor}`, background: avatarColor + '20',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: FONT_PIXEL, fontSize: '9px', color: avatarColor,
              cursor: 'pointer', userSelect: 'none', transition: 'background .15s'
            }
          }, avatarInit),

          openUserMenu && React.createElement('div', {
            onClick: e => e.stopPropagation(),
            style: {
              position: 'absolute', top: 'calc(100% + 10px)', right: 0,
              background: 'var(--surface)', border: '1px solid var(--border2)',
              borderRadius: '12px', minWidth: '210px', zIndex: 300,
              boxShadow: '0 20px 56px rgba(0,0,0,0.18)', overflow: 'hidden',
              padding: '5px 0'
            }
          },
            React.createElement('div', {
              style: {
                padding: '12px 16px', borderBottom: '1px solid var(--border)',
                fontFamily: FONT_MONO, fontSize: '10px', color: 'var(--muted)'
              }
            }, user?.email || ''),
            [
              { icon: 'explore', label: 'Explorar fuentes',  fn: () => window.location.href = 'social.html' },
              { icon: 'fonts',   label: 'Mis proyectos',     fn: onBack },
              { icon: 'user',    label: 'Mi perfil',         fn: () => window.location.href = 'profile.html' },
            ].map(({ icon, label, fn }) =>
              React.createElement('button', {
                key: label,
                onClick: () => { fn(); setOpenUserMenu(false); },
                style: {
                  display: 'flex', alignItems: 'center', gap: '10px',
                  width: '100%', padding: '9px 16px',
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontFamily: FONT_MONO, fontSize: '11px', color: 'var(--muted)',
                  textAlign: 'left', transition: 'background .12s, color .12s'
                },
                onMouseEnter: e => { e.currentTarget.style.background = 'rgba(130,100,200,0.07)'; e.currentTarget.style.color = 'var(--text)'; },
                onMouseLeave: e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--muted)'; }
              },
                React.createElement('img', { src: `./src/icons/${icon}.svg`, width: 14, height: 14, style: { filter: 'var(--icon-filter)', opacity: .5 } }),
                label
              )
            ),
            React.createElement('div', { style: { borderTop: '1px solid var(--border)', marginTop: '4px', paddingTop: '4px' } },
              React.createElement('button', {
                onClick: () => signOut(auth).then(() => window.location.href = 'index.html'),
                style: {
                  display: 'flex', alignItems: 'center', gap: '10px',
                  width: '100%', padding: '9px 16px',
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontFamily: FONT_MONO, fontSize: '11px', color: ACCENT,
                  textAlign: 'left'
                }
              },
                React.createElement('img', { src: './src/icons/logout.svg', width: 14, height: 14, style: { opacity: .65 } }),
                'Cerrar sesión'
              )
            )
          )
        )
      )
    ),

    /* ── MAIN LAYOUT ─────────────────────── */
    React.createElement('main', {
      style: {
        padding: '20px', maxWidth: '1000px', margin: '0 auto', width: '100%',
        display: 'grid', gridTemplateColumns: '1fr 280px', gap: '18px', alignItems: 'start'
      }
    },

      /* Canvas section */
      React.createElement('section', {
        style: {
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px',
          background: 'var(--surface)', borderRadius: R_CARD,
          border: '1px solid var(--border)', padding: '24px',
          boxShadow: 'var(--shadow-card)'
        }
      },
        /* Char header */
        React.createElement('div', {
          style: { display: 'flex', alignItems: 'center', gap: '16px', width: '100%' }
        },
          React.createElement('div', {
            style: {
              fontFamily: FONT_PIXEL, fontSize: '40px', lineHeight: 1,
              color: ACCENT, minWidth: '52px', textAlign: 'center'
            }
          }, currentChar === ' ' ? '·' : currentChar),
          React.createElement('div', { style: { flex: 1 } },
            React.createElement('div', {
              style: { fontFamily: FONT_MONO, fontSize: '9px', color: 'var(--muted)', letterSpacing: '2px', marginBottom: '4px' }
            }, 'EDITANDO CARÁCTER'),
            React.createElement('div', {
              style: { fontFamily: FONT_MONO, fontSize: '11px', color: 'var(--text)', letterSpacing: '1px' }
            }, `U+${(currentChar.codePointAt(0) || 0).toString(16).toUpperCase().padStart(4,'0')}`)
          )
        ),

        /* Toolbar */
        React.createElement('div', {
          style: {
            display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap',
            padding: '8px', background: 'var(--surface2)', borderRadius: R_CARD,
            border: '1px solid var(--border)', width: '100%'
          }
        },
          // Draw tools
          ...modeTools.map(t =>
            React.createElement('button', {
              key: t.id,
              onClick: () => setTool(t.id),
              title: t.label,
              style: {
                ...toolbarBase,
                background: tool === t.id ? ACCENT : 'var(--surface)',
                border: tool === t.id ? 'none' : '1px solid var(--border)',
                color: tool === t.id ? '#fff' : 'var(--muted)',
                boxShadow: tool === t.id ? `0 3px 10px ${ACCENT}40` : 'none',
              }
            },
              React.createElement('img', {
                src: `./src/icons/${t.iconName}.svg`, width: 15, height: 15,
                style: { filter: tool === t.id ? 'invert(1)' : 'var(--icon-filter)', opacity: tool === t.id ? 1 : .65 }
              }),
              React.createElement('span', { style: { fontSize: '6px', letterSpacing: '1px' } }, t.label)
            )
          ),

          // Divider
          React.createElement('div', { style: { width: '1px', height: '44px', background: 'var(--border)', margin: '0 2px' } }),

          // Action tools
          ...actionTools.map((t, i) =>
            React.createElement('button', {
              key: i, onClick: t.fn, title: t.label,
              style: {
                ...toolbarBase,
                background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)'
              },
              onMouseEnter: e => { e.currentTarget.style.background = 'var(--surface3)'; e.currentTarget.style.borderColor = 'var(--border2)'; },
              onMouseLeave: e => { e.currentTarget.style.background = 'var(--surface)'; e.currentTarget.style.borderColor = 'var(--border)'; }
            },
              React.createElement('img', {
                src: `./src/icons/${t.iconName}.svg`, width: 15, height: 15,
                style: { filter: 'var(--icon-filter)', opacity: .65 }
              }),
              React.createElement('span', { style: { fontSize: '6px', letterSpacing: '1px' } }, t.label)
            )
          ),
        ),

        /* Pixel canvas */
        React.createElement('div', {
          style: {
            display: 'grid',
            gridTemplateColumns: `repeat(${gridSize}, 1fr)`,
            width: 'min(78vw, 460px)', height: 'min(78vw, 460px)',
            gap: '1px', background: 'var(--grid-line)',
            borderRadius: R_CARD, overflow: 'hidden',
            border: `2px solid var(--border-accent)`,
            cursor: 'crosshair', userSelect: 'none',
            boxShadow: 'var(--shadow-card)'
          },
          onMouseUp: onMouseUp,
          onMouseLeave: onMouseUp
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
            React.createElement(Label, { style: { fontSize: '8px', letterSpacing: '3px', color: 'var(--muted)' } }, 'PREVIEW'),
            React.createElement('input', {
              value: previewText,
              onChange: e => setPreviewText(e.target.value),
              placeholder: 'Texto de preview...',
              style: {
                background: 'none', border: 'none', outline: 'none',
                color: 'var(--muted2)', fontSize: '11px', fontFamily: FONT_MONO,
                textAlign: 'right', width: '160px'
              }
            })
          ),
          React.createElement('div', {
            style: {
              display: 'flex', gap: '4px', flexWrap: 'wrap', minHeight: '28px',
              background: 'var(--canvas-bg)', borderRadius: '6px', padding: '8px'
            }
          },
            previewText.split('').map((ch, ci) => {
              const glyph = fontData[ch];
              const sz = Math.min(gridSize, 16), px = 3;
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
      ),

      /* ── Characters panel ── */
      React.createElement('aside', {
        style: {
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: R_CARD, padding: '18px', position: 'sticky', top: '68px',
          boxShadow: 'var(--shadow-card)'
        }
      },
        React.createElement('div', {
          style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }
        },
          React.createElement(Label, { style: { fontSize: '8px', letterSpacing: '3px', color: 'var(--muted)' } }, 'CARACTERES'),
          React.createElement('button', {
            onClick: onClearCanvas,
            style: {
              background: 'rgba(191,69,69,0.07)', border: '1px solid rgba(191,69,69,0.18)',
              borderRadius: R_BTN, padding: '5px 10px', color: ACCENT, fontSize: '9px',
              fontFamily: FONT_MONO, cursor: 'pointer', letterSpacing: '1px'
            }
          }, 'LIMPIAR')
        ),

        /* Stats */
        React.createElement('div', {
          style: {
            display: 'flex', gap: '8px', marginBottom: '14px',
            padding: '10px', background: 'var(--surface2)', borderRadius: R_BTN,
            border: '1px solid var(--border)'
          }
        },
          [
            { val: Object.values(fontData).filter(g => g?.some(Boolean)).length, lbl: 'GLIFOS'  },
            { val: gridSize,                                                      lbl: 'GRID PX' },
            { val: grid.filter(Boolean).length,                                  lbl: 'PÍXELES' }
          ].map(({ val, lbl }) =>
            React.createElement('div', { key: lbl, style: { flex: 1, textAlign: 'center' } },
              React.createElement('div', {
                style: { fontSize: '17px', fontWeight: '700', color: ACCENT, fontFamily: FONT_MONO }
              }, val),
              React.createElement('div', {
                style: { fontSize: '7px', color: 'var(--muted)', letterSpacing: '2px', fontFamily: FONT_MONO, marginTop: '2px' }
              }, lbl)
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
            return React.createElement('button', {
              key: t, onClick: () => onSwitchChar(t), title: t,
              style: {
                height: '46px', borderRadius: R_BTN,
                border: isActive ? 'none' : `1px solid ${configured ? 'rgba(191,69,69,0.22)' : 'var(--border)'}`,
                background: isActive ? ACCENT : configured ? 'rgba(191,69,69,0.07)' : 'var(--surface2)',
                color: isActive ? '#fff' : configured ? ACCENT : 'var(--muted)',
                fontWeight: '700', fontSize: '13px',
                fontFamily: FONT_MONO, cursor: 'pointer',
                position: 'relative',
                boxShadow: isActive ? `0 3px 10px ${ACCENT}40` : 'none',
                transition: 'all .1s'
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
    ),

    showExport && React.createElement(ExportModal, {
      projectName,
      onClose: () => setShowExport(false),
      onExport: (filename, format) => {
        buildAndDownload(fontData, gridSize, filename, format);
        setShowExport(false);
      }
    })
  );
}