// ─────────────────────────────────────────────
//  SOCIAL FEED — src/Feed.js
// ─────────────────────────────────────────────
import React from 'https://esm.sh/react@18.2.0';
import { getAuth, signOut as firebaseSignOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { ACCENT, R_CARD, R_BTN, FONT_MONO, FONT_PIXEL } from './constants.js';
import { Btn, Icon, Overlay, Modal, Label } from './ui.js';

// ── User menu dropdown ───────────────────────
const UserMenu = ({ user, isDark, onClose, onSignOut }) =>
  React.createElement('div', {
    style: {
      position: 'absolute', top: '52px', right: 0,
      background: isDark ? '#111' : '#fff',
      border: '1px solid var(--border)',
      borderRadius: R_CARD, padding: '8px',
      minWidth: '210px', zIndex: 60,
      boxShadow: '0 8px 28px rgba(0,0,0,0.18)'
    }
  },
    /* Perfil */
    React.createElement('div', {
      style: { padding: '10px 12px 12px', borderBottom: '1px solid var(--border)', marginBottom: '6px' }
    },
      React.createElement('div', { style: { fontSize: '13px', fontWeight: '700', color: 'var(--text)', fontFamily: FONT_MONO } },
        user?.displayName || 'Usuario'
      ),
      React.createElement('div', { style: { fontSize: '10px', color: 'var(--text-muted)', marginTop: '3px', fontFamily: FONT_MONO } },
        user?.email || ''
      )
    ),
    /* Items */
    ...[
      { label: 'Mis proyectos', icon: 'projects' },
      { label: 'Configuración', icon: 'settings' },
      { label: 'Cuenta',        icon: 'user'     },
    ].map(item =>
      React.createElement('button', {
        key: item.label, onClick: onClose,
        style: {
          width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
          padding: '9px 12px', borderRadius: R_BTN, border: 'none',
          background: 'none', cursor: 'pointer',
          color: 'var(--text)', fontFamily: FONT_MONO, fontSize: '11px', textAlign: 'left',
          transition: 'background .1s'
        },
        onMouseEnter: e => { e.currentTarget.style.background = 'rgba(230,34,34,0.07)'; },
        onMouseLeave: e => { e.currentTarget.style.background = 'none'; }
      },
        React.createElement(Icon, { name: item.icon, size: 14, isDark }),
        item.label
      )
    ),
    React.createElement('div', { style: { height: '1px', background: 'var(--border)', margin: '6px 0' } }),
    React.createElement('button', {
      onClick: onSignOut,
      style: {
        width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
        padding: '9px 12px', borderRadius: R_BTN, border: 'none',
        background: 'none', cursor: 'pointer',
        color: ACCENT, fontFamily: FONT_MONO, fontSize: '11px', textAlign: 'left',
        transition: 'background .1s'
      },
      onMouseEnter: e => { e.currentTarget.style.background = 'rgba(230,34,34,0.07)'; },
      onMouseLeave: e => { e.currentTarget.style.background = 'none'; }
    },
      React.createElement(Icon, { name: 'logout', size: 14, isDark: false, style: { filter: 'none', opacity: 0.7 } }),
      'Cerrar sesión'
    )
  );

// ── Project feed card ────────────────────────
const FeedCard = ({ proyecto, isDark, onOpen, onDelete }) => {
  const glyphs  = Object.values(proyecto.font || {}).filter(g => g?.some(Boolean)).length;
  const preview = 'ABC';

  return React.createElement('div', {
    style: {
      background: 'var(--card-bg)',
      border: '1px solid var(--border)',
      borderRadius: R_CARD,
      overflow: 'hidden'
    }
  },
    React.createElement('div', { style: { height: '3px', background: ACCENT } }),
    React.createElement('div', { style: { padding: '18px' } },

      /* Header */
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' } },
        React.createElement('div', {
          style: {
            width: '38px', height: '38px', borderRadius: '50%', flexShrink: 0,
            background: 'rgba(230,34,34,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: FONT_PIXEL, fontSize: '11px', color: ACCENT
          }
        }, (proyecto.nombre?.[0] || 'F').toUpperCase()),
        React.createElement('div', null,
          React.createElement('div', { style: { fontFamily: FONT_MONO, fontSize: '13px', fontWeight: '700', color: 'var(--text)' } },
            proyecto.nombre || 'Sin nombre'
          ),
          React.createElement('div', { style: { fontFamily: FONT_MONO, fontSize: '9px', color: 'var(--text-muted)', letterSpacing: '2px', marginTop: '2px' } },
            `${proyecto.gridSize}PX · ${glyphs} GLIFOS`
          )
        )
      ),

      /* Pixel preview */
      React.createElement('div', {
        style: {
          background: isDark ? '#0d0d0d' : '#f3f3f3',
          borderRadius: R_BTN, padding: '12px', marginBottom: '14px',
          display: 'flex', gap: '6px', minHeight: '44px', alignItems: 'center'
        }
      },
        preview.split('').map((ch, ci) => {
          const glyph = proyecto.font?.[ch];
          const sz    = Math.min(proyecto.gridSize || 8, 12);
          const px    = 3;
          return React.createElement('div', {
            key: ci,
            style: { display: 'grid', gridTemplateColumns: `repeat(${sz},${px}px)` }
          },
            Array(sz * sz).fill(0).map((_, pi) =>
              React.createElement('div', {
                key: pi,
                style: { width: `${px}px`, height: `${px}px`, background: glyph?.[pi] ? ACCENT : 'transparent' }
              })
            )
          );
        })
      ),

      /* Actions */
      React.createElement('div', { style: { display: 'flex', gap: '8px' } },
        React.createElement(Btn, {
          onClick: () => onOpen(proyecto),
          style: {
            flex: 1, padding: '10px',
            background: ACCENT, borderRadius: R_BTN,
            color: '#fff', fontSize: '10px', fontWeight: '700', letterSpacing: '2px'
          }
        }, 'ABRIR'),
        React.createElement(Btn, {
          onClick: e => { e.stopPropagation(); onDelete(proyecto.id); },
          style: {
            width: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(230,34,34,0.06)', border: '1px solid rgba(230,34,34,0.18)',
            borderRadius: R_BTN
          }
        }, React.createElement(Icon, { name: 'delete', size: 15, isDark }))
      )
    )
  );
};

// ── New project modal ────────────────────────
const NewProjectModal = ({ isDark, onClose, onCreate }) => {
  const [nombre,   setNombre]   = React.useState('');
  const [gridSize, setGridSize] = React.useState(8);
  const [saving,   setSaving]   = React.useState(false);

  const handleCreate = async () => {
    if (!nombre.trim()) return alert('Escribe un nombre para la fuente');
    setSaving(true);
    await onCreate(nombre, gridSize);
    setSaving(false);
    onClose();
  };

  return React.createElement(Overlay, { onClose },
    React.createElement(Modal, { style: { width: '340px' } },
      React.createElement('h3', {
        style: { fontFamily: FONT_PIXEL, fontSize: '10px', color: ACCENT, letterSpacing: '2px', margin: 0 }
      }, 'NUEVA FUENTE'),

      React.createElement('input', {
        placeholder: 'Nombre de la fuente', value: nombre,
        onChange: e => setNombre(e.target.value),
        autoFocus: true,
        style: {
          background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: R_BTN, padding: '11px 14px',
          color: 'var(--text)', fontSize: '13px', outline: 'none', fontFamily: FONT_MONO
        }
      }),

      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
        React.createElement(Label, null, 'TAMAÑO DE CUADRÍCULA'),
        React.createElement('div', { style: { display: 'flex', gap: '8px' } },
          [8, 12, 16].map(s =>
            React.createElement(Btn, {
              key: s, onClick: () => setGridSize(s),
              style: {
                flex: 1, padding: '9px',
                background: gridSize === s ? ACCENT : 'var(--surface2)',
                border: gridSize === s ? 'none' : '1px solid var(--border)',
                borderRadius: R_BTN,
                color: gridSize === s ? '#fff' : 'var(--text-muted)',
                fontSize: '12px', fontWeight: '700'
              }
            }, `${s}px`)
          )
        )
      ),

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
          onClick: handleCreate, disabled: saving,
          style: {
            flex: 1, padding: '11px',
            background: ACCENT, borderRadius: R_BTN,
            color: '#fff', fontWeight: '700', fontSize: '11px'
          }
        }, saving ? '...' : 'CREAR')
      )
    )
  );
};

// ── Feed page (página principal) ─────────────
export function FeedPage({ user, isDark, toggleTheme, proyectos, onOpenProject, onCreateProject, onDeleteProject }) {
  const [showUserMenu, setShowUserMenu] = React.useState(false);
  const [showNewModal, setShowNewModal] = React.useState(false);

  return React.createElement('div', {
    style: { minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' },
    onClick: () => { if (showUserMenu) setShowUserMenu(false); }
  },

    /* NAV */
    React.createElement('nav', {
      style: {
        height: '52px', padding: '0 20px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: '1px solid var(--border)',
        background: 'var(--nav-bg)', backdropFilter: 'blur(16px)',
        position: 'sticky', top: 0, zIndex: 40
      }
    },
      React.createElement('span', {
        style: { fontFamily: FONT_PIXEL, fontSize: '11px', color: ACCENT, letterSpacing: '2px' }
      }, 'CODESHELF'),

      React.createElement('div', {
        style: { display: 'flex', gap: '8px', alignItems: 'center', position: 'relative' }
      },
        React.createElement(Btn, {
          onClick: toggleTheme,
          style: {
            background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: R_BTN, padding: '7px', display: 'flex', alignItems: 'center'
          }
        }, React.createElement(Icon, { name: isDark ? 'sun' : 'moon', size: 16, isDark })),

        /* Avatar */
        React.createElement('button', {
          onClick: e => { e.stopPropagation(); setShowUserMenu(v => !v); },
          style: {
            width: '34px', height: '34px', borderRadius: '50%',
            border: `2px solid ${ACCENT}`, overflow: 'hidden', cursor: 'pointer',
            padding: 0, background: 'rgba(230,34,34,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
          }
        },
          user?.photoURL
            ? React.createElement('img', { src: user.photoURL, style: { width: '100%', height: '100%', objectFit: 'cover' } })
            : React.createElement('span', {
                style: { fontFamily: FONT_PIXEL, fontSize: '9px', color: ACCENT }
              }, (user?.displayName?.[0] || user?.email?.[0] || 'U').toUpperCase())
        ),

    showUserMenu && React.createElement(UserMenu, {
      user, isDark,
      onClose: () => setShowUserMenu(false),
      onSignOut: signOut
    })
      )
    ),

    /* FEED */
    React.createElement('div', { style: { maxWidth: '620px', margin: '0 auto', padding: '24px 16px' } },

      /* New project trigger */
      React.createElement('div', {
        onClick: () => setShowNewModal(true),
        style: {
          border: '2px dashed var(--border)', borderRadius: R_CARD,
          padding: '18px 20px',
          display: 'flex', alignItems: 'center', gap: '14px',
          cursor: 'pointer', marginBottom: '20px', transition: 'all .15s'
        },
        onMouseEnter: e => {
          e.currentTarget.style.borderColor = ACCENT;
          e.currentTarget.style.background = 'rgba(230,34,34,0.03)';
        },
        onMouseLeave: e => {
          e.currentTarget.style.borderColor = '';
          e.currentTarget.style.background = '';
        }
      },
        React.createElement('div', {
          style: {
            width: '38px', height: '38px', borderRadius: R_BTN,
            background: ACCENT, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }
        }, React.createElement(Icon, { name: 'plus', size: 18, isDark: true })),
        React.createElement('div', null,
          React.createElement('div', { style: { fontFamily: FONT_MONO, fontSize: '13px', fontWeight: '700', color: 'var(--text)' } }, 'Nueva fuente'),
          React.createElement('div', { style: { fontFamily: FONT_MONO, fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' } }, 'Crea un nuevo proyecto de pixel font')
        )
      ),

      /* Cards */
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
        proyectos.length === 0
          ? React.createElement('div', {
              style: { textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)', fontFamily: FONT_MONO, fontSize: '10px', letterSpacing: '3px' }
            }, 'SIN PROYECTOS AÚN')
          : proyectos.map(p =>
              React.createElement(FeedCard, {
                key: p.id, proyecto: p, isDark,
                onOpen: onOpenProject,
                onDelete: onDeleteProject
              })
            )
      )
    ),

    /* Modal */
    showNewModal && React.createElement(NewProjectModal, {
      isDark,
      onClose: () => setShowNewModal(false),
      onCreate: onCreateProject
    })
  );
}
