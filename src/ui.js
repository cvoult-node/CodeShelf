// ─────────────────────────────────────────────
//  UI PRIMITIVES — src/ui.js
// ─────────────────────────────────────────────
import React from 'https://esm.sh/react@18.2.0';
import { ACCENT, R_BTN, FONT_MONO } from './constants.js';

// ── Button ───────────────────────────────────
export const Btn = ({ onClick, style, children, disabled, title, className = '' }) =>
  React.createElement('button', {
    onClick, disabled, title, className,
    style: {
      fontFamily: FONT_MONO,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.4 : 1,
      transition: 'transform .13s, opacity .13s',
      border: 'none',
      background: 'none',
      padding: 0,
      ...style
    },
    onMouseEnter: e => { if (!disabled) e.currentTarget.style.transform = 'translateY(-1px)'; },
    onMouseLeave: e => { e.currentTarget.style.transform = 'translateY(0)'; }
  }, children);

// ── Icon (SVG inline via <object> para que herede currentColor) ───────────────
// Los SVG deben usar fill="currentColor" para cambiar con el tema.
// Usamos una <img> con CSS filter para temas: en dark invertimos.
export const Icon = ({ name, size = 18, isDark = false, style = {} }) => {
  // Calculamos el filtro: en dark mode queremos iconos claros,
  // en light mode queremos iconos oscuros. Como los SVG son negros por defecto:
  // dark → invert(1) brightness(0.85)
  // light → nada (negro)
  const colorFilter = isDark
    ? 'invert(1) brightness(0.85)'
    : 'invert(0)';

  return React.createElement('img', {
    src: `./src/icons/${name}.svg`,
    width: size,
    height: size,
    style: {
      display: 'inline-block',
      verticalAlign: 'middle',
      imageRendering: 'pixelated',
      flexShrink: 0,
      filter: colorFilter,
      ...style
    },
    onError: e => { e.target.style.display = 'none'; }
  });
};

// ── Overlay backdrop ─────────────────────────
export const Overlay = ({ onClose, children }) =>
  React.createElement('div', {
    onClick: onClose,
    style: {
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, backdropFilter: 'blur(3px)'
    }
  },
    React.createElement('div', {
      onClick: e => e.stopPropagation()
    }, children)
  );

// ── Modal shell ──────────────────────────────
export const Modal = ({ children, style = {} }) =>
  React.createElement('div', {
    style: {
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: '14px',
      padding: '28px',
      display: 'flex', flexDirection: 'column', gap: '16px',
      minWidth: '300px',
      ...style
    }
  }, children);

// ── Section label ────────────────────────────
export const Label = ({ children, style = {} }) =>
  React.createElement('span', {
    style: {
      fontFamily: FONT_MONO,
      fontSize: '9px',
      letterSpacing: '3px',
      color: 'var(--text-muted)',
      textTransform: 'uppercase',
      ...style
    }
  }, children);
