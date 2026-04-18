import React, { useState, useRef, useCallback, useEffect, useMemo } from 'https://esm.sh/react@18.2.0';
import { auth, signOut } from './firebase.js';
import { ACCENT, TECLADO, R_CARD, R_BTN, FONT_MONO, FONT_PIXEL } from './constants.js';
import { Btn, Icon, Overlay, Modal, Label } from './ui.js';
import { buildAndDownload, getBaselineRow } from './canvas.js';
import {
  EDITOR_STORAGE_KEYS,
  readBoolSetting,
  readNumberSetting,
  writeSetting,
  defaultGuideRows
} from './editorConfig.js';

const e = React.createElement;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

// Inject pixel font for char preview in AddChar menu
if (!document.getElementById('cs-pixel-font-style')) {
  const s = document.createElement('style');
  s.id = 'cs-pixel-font-style';
  s.textContent = `@font-face { font-family: 'monospace-pixel'; src: url('./src/font/monospace.ttf') format('truetype'); }`;
  document.head.appendChild(s);
}

// ─────────────────────────────────────────────
//  ICON COMPONENT
//  Renders SVG icons from src/icons/ as inline
//  img tags (color via CSS filter) or as raw JSX.
//  We keep a small hardcoded map for the toolbar
//  icons that need currentColor tinting, and use
//  <img> tags for the navbar icons that already
//  have their own filter applied externally.
// ─────────────────────────────────────────────

// These are defined at module level — NEVER inside a render function.
// Each is a stable React element; they never cause re-mounts.
const IC = {
  pencil: e('svg', { width: '15', height: '15', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' },
    e('path', { d: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7' }),
    e('path', { d: 'M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z' })
  ),
  fill: e('svg', { width: '15', height: '15', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' },
    e('path', { d: 'M19 11c0 4-7 11-7 11S5 15 5 11a7 7 0 0 1 14 0z' }),
    e('circle', { cx: '12', cy: '11', r: '1', fill: 'currentColor' })
  ),
  undo: e('svg', { width: '15', height: '15', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' },
    e('polyline', { points: '9 14 4 9 9 4' }),
    e('path', { d: 'M20 20v-7a4 4 0 0 0-4-4H4' })
  ),
  redo: e('svg', { width: '15', height: '15', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' },
    e('polyline', { points: '15 14 20 9 15 4' }),
    e('path', { d: 'M4 20v-7a4 4 0 0 1 4-4h12' })
  ),
  mirrorH: e('svg', { width: '15', height: '15', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' },
    e('path', { d: 'M12 3v18' }),
    e('polyline', { points: '5 8 1 12 5 16' }),
    e('polyline', { points: '19 8 23 12 19 16' })
  ),
  mirrorV: e('svg', { width: '15', height: '15', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' },
    e('path', { d: 'M3 12h18' }),
    e('polyline', { points: '8 5 12 1 16 5' }),
    e('polyline', { points: '8 19 12 23 16 19' })
  ),
  invert: e('svg', { width: '15', height: '15', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' },
    e('circle', { cx: '12', cy: '12', r: '9' }),
    e('path', { d: 'M12 3v18' }),
    e('path', { d: 'M12 3a9 9 0 0 1 0 18z', fill: 'currentColor', stroke: 'none' })
  ),
  arrowUp: e('svg', { width: '13', height: '13', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2.2', strokeLinecap: 'round', strokeLinejoin: 'round' },
    e('line', { x1: '12', y1: '19', x2: '12', y2: '5' }),
    e('polyline', { points: '5 12 12 5 19 12' })
  ),
  arrowDown: e('svg', { width: '13', height: '13', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2.2', strokeLinecap: 'round', strokeLinejoin: 'round' },
    e('line', { x1: '12', y1: '5', x2: '12', y2: '19' }),
    e('polyline', { points: '19 12 12 19 5 12' })
  ),
  arrowLeft: e('svg', { width: '13', height: '13', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2.2', strokeLinecap: 'round', strokeLinejoin: 'round' },
    e('line', { x1: '19', y1: '12', x2: '5', y2: '12' }),
    e('polyline', { points: '12 19 5 12 12 5' })
  ),
  arrowRight: e('svg', { width: '13', height: '13', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2.2', strokeLinecap: 'round', strokeLinejoin: 'round' },
    e('line', { x1: '5', y1: '12', x2: '19', y2: '12' }),
    e('polyline', { points: '12 5 19 12 12 19' })
  ),
  copy: e('svg', { width: '15', height: '15', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' },
    e('rect', { x: '9', y: '9', width: '13', height: '13', rx: '2' }),
    e('path', { d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' })
  ),
  paste: e('svg', { width: '15', height: '15', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' },
    e('path', { d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' }),
    e('rect', { x: '8', y: '2', width: '8', height: '4', rx: '1' })
  ),
  trash: e('svg', { width: '15', height: '15', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' },
    e('polyline', { points: '3 6 5 6 21 6' }),
    e('path', { d: 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6' }),
    e('path', { d: 'M10 11v6' }),
    e('path', { d: 'M14 11v6' }),
    e('path', { d: 'M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2' })
  ),
  exportDown: e('svg', { width: '12', height: '12', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2.5', strokeLinecap: 'round', strokeLinejoin: 'round' },
    e('path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }),
    e('polyline', { points: '7 10 12 15 17 10' }),
    e('line', { x1: '12', y1: '15', x2: '12', y2: '3' })
  ),
  dotsV: e('svg', { width: '14', height: '14', viewBox: '0 0 24 24', fill: 'currentColor' },
    e('circle', { cx: '12', cy: '5', r: '1.8' }),
    e('circle', { cx: '12', cy: '12', r: '1.8' }),
    e('circle', { cx: '12', cy: '19', r: '1.8' })
  ),
};

// ─────────────────────────────────────────────
//  PIXEL PREVIEW
// ─────────────────────────────────────────────
const PixelPreview = ({ text, fontData, gridSize, pixelSize = 3, color = ACCENT, showSpaceMarker = false, letterSpacing = 0, wordSpacing = 10, baselineRow }) => {
  const chars = text.split('');
  const sz = Math.min(gridSize, 32);
  const blRow = (baselineRow != null) ? Math.min(baselineRow, sz - 1) : Math.round(sz * 0.75);

  const getBounds = (glyph) => {
    if (!Array.isArray(glyph)) return null;
    let minCol = sz, maxCol = -1, minRow = sz, maxRow = -1;
    glyph.forEach((on, i) => {
      if (!on) return;
      const col = i % sz; const row = Math.floor(i / sz);
      if (col < minCol) minCol = col; if (col > maxCol) maxCol = col;
      if (row < minRow) minRow = row; if (row > maxRow) maxRow = row;
    });
    return maxCol < 0 ? null : { minCol, maxCol, minRow, maxRow };
  };

  const allBounds = Object.values(fontData).map(g => getBounds(g)).filter(Boolean);
  const refCols = allBounds.length > 0 ? Math.max(...allBounds.map(b => b.maxCol - b.minCol + 1)) : sz;
  const refRows = blRow;

  return e('div', { style: { display: 'flex', flexWrap: 'nowrap', overflowX: 'auto', overflowY: 'hidden', whiteSpace: 'nowrap', padding: '8px', minHeight: '28px', alignItems: 'flex-end', scrollbarWidth: 'thin' } },
    chars.map((ch, ci) => {
      const glyph = fontData[ch];
      const bounds = getBounds(glyph);
      const isSpace = ch === ' ';
      const spacingPx = isSpace ? wordSpacing * 0.22 : letterSpacing * pixelSize;
      const minSpaceWidth = Math.max(pixelSize * 2, 1);
      const computedSpaceWidth = Math.max(minSpaceWidth, pixelSize * 3 + wordSpacing * 0.2);
      const hasDrawing = bounds !== null && !isSpace;
      const glyphCols = hasDrawing ? (bounds.maxCol - bounds.minCol + 1) : (isSpace ? 1 : refCols);
      const glyphRows = hasDrawing ? sz : (isSpace ? 1 : refRows);

      return e('div', {
        key: ci,
        style: {
          display: hasDrawing ? 'grid' : 'flex', alignItems: 'center', justifyContent: 'center',
          gridTemplateColumns: hasDrawing ? `repeat(${glyphCols},${pixelSize}px)` : undefined,
          gridTemplateRows: hasDrawing ? `repeat(${glyphRows},${pixelSize}px)` : undefined,
          width: isSpace ? `${computedSpaceWidth}px` : `${glyphCols * pixelSize}px`,
          height: `${glyphRows * pixelSize}px`,
          minWidth: isSpace ? `${minSpaceWidth}px` : undefined,
          marginRight: `${spacingPx}px`,
          border: (!hasDrawing && !isSpace) ? `1px dashed rgba(255,255,255,0.18)` : (isSpace && showSpaceMarker) ? '1px dashed var(--border)' : 'none',
          borderRadius: '2px', padding: (isSpace && showSpaceMarker) ? '2px' : 0, flexShrink: 0,
          alignSelf: 'flex-end',
          position: 'relative', background: (!hasDrawing && !isSpace) ? 'rgba(255,255,255,0.04)' : 'transparent'
        }
      },
        hasDrawing
          ? Array(glyphCols * glyphRows).fill(0).map((_, pi) => {
              const row = Math.floor(pi / glyphCols); const col = pi % glyphCols;
              const sourceCol = bounds ? col + bounds.minCol : col;
              const sourceIdx = row * sz + sourceCol;
              return e('div', { key: pi, style: { width: `${pixelSize}px`, height: `${pixelSize}px`, background: glyph?.[sourceIdx] ? color : 'transparent' } });
            })
          : isSpace
            ? null
            : e('span', { style: { fontFamily: FONT_MONO, fontSize: `${Math.max(7, pixelSize * 2)}px`, color: 'rgba(255,255,255,0.22)', userSelect: 'none', lineHeight: 1 } }, ch),
        (isSpace && showSpaceMarker) && e('div', { style: { position: 'absolute', top: '2px', bottom: '2px', left: '50%', width: '1px', transform: 'translateX(-50%)', background: 'var(--border-accent)', opacity: .65, pointerEvents: 'none' } })
      );
    })
  );
};

// ─────────────────────────────────────────────
//  TOOLTIP
// ─────────────────────────────────────────────
const TOOLTIP_POS = {
  bottom: { top: 'calc(100% + 8px)',    left: '50%', transform: 'translateX(-50%)' },
  top:    { bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' },
  right:  { left: 'calc(100% + 8px)',   top: '50%',  transform: 'translateY(-50%)' },
  left:   { right: 'calc(100% + 8px)',  top: '50%',  transform: 'translateY(-50%)' },
};

const Tooltip = ({ label, children, placement = 'bottom' }) => {
  const [visible, setVisible] = useState(false);
  return e('div', { style: { position: 'relative', display: 'inline-flex' }, onMouseEnter: () => setVisible(true), onMouseLeave: () => setVisible(false) },
    children,
    visible && label && e('div', { style: { position: 'absolute', ...TOOLTIP_POS[placement], background: 'var(--surface3)', border: '1px solid var(--border)', borderRadius: '6px', padding: '5px 9px', whiteSpace: 'nowrap', fontFamily: FONT_MONO, fontSize: '9px', letterSpacing: '1px', color: 'var(--text)', zIndex: 999, pointerEvents: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.2)' } }, label)
  );
};

// ─────────────────────────────────────────────
//  ZOOM CONTROL
// ─────────────────────────────────────────────
const ZoomControl = ({ zoom, setZoom }) =>
  e('div', { style: { display: 'flex', alignItems: 'center', gap: '2px', background: 'var(--surface2)', borderRadius: R_BTN, border: '1px solid var(--border)', padding: '2px' } },
    e('button', { onClick: () => setZoom(z => Math.max(50, z - 25)), style: { width: '24px', height: '24px', borderRadius: '5px', border: 'none', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontFamily: FONT_MONO, fontSize: '14px', lineHeight: 1 } }, '−'),
    e('span', { style: { fontFamily: FONT_MONO, fontSize: '9px', color: 'var(--text)', minWidth: '34px', textAlign: 'center', letterSpacing: '1px' } }, `${zoom}%`),
    e('button', { onClick: () => setZoom(z => Math.min(200, z + 25)), style: { width: '24px', height: '24px', borderRadius: '5px', border: 'none', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontFamily: FONT_MONO, fontSize: '14px', lineHeight: 1 } }, '+')
  );

// ─────────────────────────────────────────────
//  GUIDE OVERLAY
// ─────────────────────────────────────────────
const GuideOverlay = ({ gridSize, capGuideRow, xHeightGuideRow, baselineGuideRow, descGuideRow, centerGuideCol, showCenterGuide, showCapGuide = true, showXHGuide = true, showBaseGuide = true, showDescGuide = true }) => {
  const lines = [];
  const cap      = clamp(capGuideRow      ?? 7,  0, gridSize - 1);
  const xHeight  = clamp(xHeightGuideRow  ?? 9,  0, gridSize - 1);
  const baseline = clamp(baselineGuideRow ?? 13, 0, gridSize - 1);
  const desc     = clamp(descGuideRow     ?? 15, 0, gridSize - 1);
  const rowPct = (row) => (row / gridSize * 100).toFixed(4);

  if (showBaseGuide) {
    lines.push(e('rect', { key: 'desc-zone', x: '0', y: `${rowPct(baseline)}%`, width: '100%', height: `${(100 - Number(rowPct(baseline))).toFixed(4)}%`, fill: 'rgba(191,69,69,0.04)' }));
  }
  if (showCenterGuide) {
    const colPct = (centerGuideCol / gridSize * 100).toFixed(4);
    lines.push(e('line', { key: 'vl', x1: `${colPct}%`, y1: '0', x2: `${colPct}%`, y2: '100%', stroke: 'rgba(191,69,69,0.70)', strokeWidth: '1.5' }));
  }

  const guide = (key, row, label, opacity, strokeW, dash) => {
    const pct = rowPct(row);
    return [
      e('line', { key: `${key}-l`, x1: '0', y1: `${pct}%`, x2: '100%', y2: `${pct}%`, stroke: `rgba(191,69,69,${opacity})`, strokeWidth: strokeW || '1.4', ...(dash ? { strokeDasharray: dash } : {}) }),
      e('text', { key: `${key}-t`, x: '99%', y: `${Math.max(2.5, Number(pct) - 0.6)}%`, fill: `rgba(191,69,69,${opacity * 0.8})`, fontSize: '6', textAnchor: 'end', fontFamily: 'monospace', fontWeight: '600' }, label)
    ];
  };

  if (showCapGuide)  lines.push(...guide('cap',  cap,      'CAP',  0.45, '1.3'));
  if (showXHGuide)   lines.push(...guide('xh',   xHeight,  'X-H',  0.40, '1.1', '3 3'));
  if (showBaseGuide) lines.push(...guide('base',  baseline, 'BASE', 0.90, '1.8'));
  if (showDescGuide) lines.push(...guide('desc',  desc,     'DESC', 0.35, '1.0', '2 2'));

  return e('svg', { style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 5 }, xmlns: 'http://www.w3.org/2000/svg' }, ...lines);
};

// ─────────────────────────────────────────────
//  DRAG SLIDER
//  FIX: The slider was stalling after one step
//  because mousemove fired before the ref update
//  completed. Solution: use a single stable ref
//  pair — one for dragging state, one for the
//  latest compute callback — registered once via
//  useEffect with an empty dep array. The ref
//  pattern guarantees the closure always calls
//  the current value without stale captures.
// ─────────────────────────────────────────────
const DragSlider = ({ value, onChange, min, max, step = 1 }) => {
  const trackRef   = useRef(null);
  const dragging   = useRef(false);
  // computeRef always points to the latest version of the compute function.
  // This avoids stale closure issues in the global event listeners.
  const computeRef = useRef(null);

  computeRef.current = useCallback((clientX) => {
    if (!trackRef.current) return;
    const rect  = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const raw   = min + ratio * (max - min);
    const snapped = Math.round(raw / step) * step;
    // Clamp to [min, max] after rounding to avoid floating-point overshoot
    onChange(Math.max(min, Math.min(max, snapped)));
  }, [min, max, step, onChange]);

  useEffect(() => {
    const onMove = (ev) => {
      if (!dragging.current) return;
      // Support both mouse and touch, prevent page scroll during drag
      if (ev.cancelable) ev.preventDefault();
      computeRef.current(ev.touches ? ev.touches[0].clientX : ev.clientX);
    };
    const onUp = () => { dragging.current = false; };

    window.addEventListener('mousemove',  onMove,  { passive: false });
    window.addEventListener('mouseup',    onUp);
    window.addEventListener('touchmove',  onMove,  { passive: false });
    window.addEventListener('touchend',   onUp);
    return () => {
      window.removeEventListener('mousemove',  onMove);
      window.removeEventListener('mouseup',    onUp);
      window.removeEventListener('touchmove',  onMove);
      window.removeEventListener('touchend',   onUp);
    };
  }, []); // empty deps — listeners registered once, always call latest computeRef.current

  const pct = ((value - min) / (max - min)) * 100;

  return e('div', {
    ref: trackRef,
    style: { position: 'relative', height: '22px', display: 'flex', alignItems: 'center', cursor: 'pointer', userSelect: 'none', padding: '0 7px', boxSizing: 'border-box' },
    onMouseDown: (ev) => {
      ev.preventDefault();
      dragging.current = true;
      computeRef.current(ev.clientX);
    },
    onTouchStart: (ev) => {
      // Don't call preventDefault on touchstart — it blocks click events on iOS
      dragging.current = true;
      computeRef.current(ev.touches[0].clientX);
    },
  },
    e('div', { style: { position: 'absolute', left: '7px', right: '7px', height: '3px', borderRadius: '2px', background: 'var(--border)' } }),
    e('div', { style: { position: 'absolute', left: '7px', width: `calc(${pct}% - 0px)`, height: '3px', borderRadius: '2px', background: ACCENT, maxWidth: 'calc(100% - 14px)' } }),
    e('div', { style: { position: 'absolute', left: `calc(${pct}% - 0px)`, transform: 'translateX(-50%)', width: '14px', height: '14px', borderRadius: '50%', background: ACCENT, border: '2px solid var(--surface)', boxShadow: `0 0 0 2px ${ACCENT}60`, cursor: 'grab', flexShrink: 0, zIndex: 1 } })
  );
};

// ─────────────────────────────────────────────
//  EXPORT MODAL — Sub-components defined at
//  MODULE LEVEL to prevent re-mounting on each
//  render of ExportModal (which was the root
//  cause of inputs losing focus after one char).
// ─────────────────────────────────────────────

// Field wrapper — stable component, not a closure inside ExportModal
const ExportField = ({ label, hint, children }) =>
  e('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
    e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } },
      e('label', { style: { fontFamily: FONT_MONO, fontSize: '8px', letterSpacing: '2px', color: 'var(--muted)' } }, label),
      hint != null && e('span', { style: { fontFamily: FONT_MONO, fontSize: '9px', color: ACCENT, fontWeight: '700' } }, hint)
    ),
    children
  );

// Shared input style — defined once at module scope
const INPUT_STYLE = {
  background: 'var(--surface2)',
  border: '1px solid var(--border)',
  borderRadius: R_BTN,
  padding: '9px 12px',
  color: 'var(--text)',
  fontSize: '12px',
  outline: 'none',
  fontFamily: FONT_MONO,
  width: '100%',
  transition: 'border-color .15s',
  boxSizing: 'border-box',
};

const ExportModal = ({ projectName, fontData, gridSize, previewText: extText, onClose, onExport, userBaselineRow }) => {
  const [fontName,      setFontName]      = useState(projectName || 'mi-fuente');
  const [version,       setVersion]       = useState('1.000');
  const [author,        setAuthor]        = useState('');
  const [format,        setFormat]        = useState('otf');
  const [letterSpacing, setLetterSpacing] = useState(1);
  const [wordSpacing,   setWordSpacing]   = useState(8);
  const [showAdvanced,  setShowAdvanced]  = useState(false);
  const [unitsPerEm,    setUnitsPerEm]    = useState(1000);
  const [lineGap,       setLineGap]       = useState(0);
  const [license,       setLicense]       = useState('');

  const baselineRow = userBaselineRow != null ? userBaselineRow : getBaselineRow(gridSize);
  const S = Math.round(unitsPerEm / gridSize);
  const defaultAscender  =  Math.round(baselineRow * S);
  const defaultDescender = -Math.round((gridSize - baselineRow) * S);
  const [ascender,  setAscender]  = useState(defaultAscender);
  const [descender, setDescender] = useState(defaultDescender);

  // FIX: input focus handlers — inline onFocus/onBlur to avoid re-creating
  // style objects (the original used object spread which created new refs)
  const onFocusAccent = useCallback((ev) => { ev.target.style.borderColor = ACCENT; }, []);
  const onBlurBorder  = useCallback((ev) => { ev.target.style.borderColor = 'var(--border)'; }, []);

  return e(Overlay, { onClose },
    e('div', { style: { background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: R_CARD, padding: '26px', width: '540px', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 32px 80px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', gap: '16px' } },

      // Header
      e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        e('div', null,
          e('h3', { style: { fontFamily: FONT_PIXEL, fontSize: '10px', color: ACCENT, letterSpacing: '2px', margin: '0 0 2px' } }, 'EXPORTAR FUENTE'),
          e('div', { style: { fontFamily: FONT_MONO, fontSize: '9px', color: 'var(--muted2)' } }, `Grid ${gridSize}×${gridSize} · Baseline fila ${baselineRow} · ${S} u/px`)
        ),
        e('button', { onClick: onClose, style: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '20px', lineHeight: 1, padding: '0 4px' } }, '×')
      ),

      // Preview
      e('div', { style: { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: R_BTN, padding: '12px', minHeight: '60px' } },
        e('div', { style: { fontFamily: FONT_MONO, fontSize: '8px', color: 'var(--muted2)', letterSpacing: '2px', marginBottom: '8px' } }, 'PREVIEW'),
        e(PixelPreview, { text: extText || 'Abc 123', fontData, gridSize, pixelSize: 4, color: ACCENT, letterSpacing, wordSpacing, baselineRow })
      ),

      // Nombre + versión
      e('div', { style: { display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' } },
        e(ExportField, { label: 'NOMBRE DE LA FUENTE' },
          e('input', {
            value: fontName,
            onChange: ev => setFontName(ev.target.value),
            style: INPUT_STYLE,
            onFocus: onFocusAccent,
            onBlur: onBlurBorder,
          })
        ),
        e(ExportField, { label: 'VERSIÓN' },
          e('input', {
            value: version,
            onChange: ev => setVersion(ev.target.value),
            placeholder: '1.000',
            style: INPUT_STYLE,
            onFocus: onFocusAccent,
            onBlur: onBlurBorder,
          })
        )
      ),

      // Autor + licencia
      e('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' } },
        e(ExportField, { label: 'AUTOR / DISEÑADOR' },
          e('input', {
            value: author,
            placeholder: 'Nombre o seudónimo',
            onChange: ev => setAuthor(ev.target.value),
            style: INPUT_STYLE,
            onFocus: onFocusAccent,
            onBlur: onBlurBorder,
          })
        ),
        e(ExportField, { label: 'LICENCIA' },
          e('input', {
            value: license,
            placeholder: 'MIT, OFL, Prop...',
            onChange: ev => setLicense(ev.target.value),
            style: INPUT_STYLE,
            onFocus: onFocusAccent,
            onBlur: onBlurBorder,
          })
        )
      ),

      // Espaciado
      e('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' } },
        e(ExportField, { label: 'LETTER SPACING', hint: `${letterSpacing} px` },
          e(DragSlider, { value: letterSpacing, onChange: setLetterSpacing, min: 0, max: 20 })
        ),
        e(ExportField, { label: 'WORD SPACING', hint: `${wordSpacing} px` },
          e(DragSlider, { value: wordSpacing, onChange: setWordSpacing, min: 1, max: 30 })
        )
      ),

      // Formato
      e('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
        e('label', { style: { fontFamily: FONT_MONO, fontSize: '8px', letterSpacing: '2px', color: 'var(--muted)' } }, 'FORMATO'),
        e('div', { style: { display: 'flex', gap: '8px' } },
          [
            { f: 'otf',  desc: 'PostScript · máx. calidad' },
            { f: 'ttf',  desc: 'TrueType · compatible' },
            { f: 'woff', desc: 'Web · optimizado' }
          ].map(({ f, desc }) =>
            e('button', {
              key: f,
              onClick: () => setFormat(f),
              style: { flex: 1, padding: '10px 6px', borderRadius: R_BTN, cursor: 'pointer', fontFamily: FONT_MONO, fontWeight: '700', fontSize: '11px', letterSpacing: '1px', textTransform: 'uppercase', transition: 'all .13s', background: format === f ? ACCENT : 'var(--surface3)', color: format === f ? '#fff' : 'var(--muted)', border: format === f ? `1px solid ${ACCENT}` : '1px solid var(--border)', boxShadow: format === f ? `0 2px 8px ${ACCENT}40` : 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }
            },
              e('span', null, f),
              e('span', { style: { fontSize: '7px', fontWeight: '400', opacity: .7, letterSpacing: '0' } }, desc)
            )
          )
        )
      ),

      // Avanzados
      e('div', null,
        e('button', {
          onClick: () => setShowAdvanced(v => !v),
          style: { display: 'flex', alignItems: 'center', gap: '7px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT_MONO, fontSize: '9px', letterSpacing: '2px', color: 'var(--muted)', padding: '4px 0' }
        },
          e('span', { style: { transition: 'transform .2s', transform: showAdvanced ? 'rotate(90deg)' : 'none', display: 'inline-block', fontSize: '8px' } }, '▶'),
          'PARÁMETROS AVANZADOS'
        ),
        showAdvanced && e('div', { style: { marginTop: '10px', padding: '14px', background: 'var(--surface2)', borderRadius: R_BTN, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '12px' } },
          e('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px' } },
            [
              ['UNITS PER EM', unitsPerEm, setUnitsPerEm, 500,  4000],
              ['ASCENDER',     ascender,   setAscender,  -200,  2000],
              ['DESCENDER',    descender,  setDescender, -800,   200],
              ['LINE GAP',     lineGap,    setLineGap,      0,   500]
            ].map(([lbl, val, setter, min, max]) =>
              e('div', { key: lbl, style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
                e('label', { style: { fontFamily: FONT_MONO, fontSize: '7px', color: 'var(--muted)', letterSpacing: '1px' } }, lbl),
                e('input', {
                  type: 'number', value: val, min, max,
                  onChange: ev => setter(Number(ev.target.value)),
                  style: { ...INPUT_STYLE, fontSize: '11px', padding: '6px 8px' },
                  onFocus: onFocusAccent,
                  onBlur: onBlurBorder,
                })
              )
            )
          ),
          e('p', { style: { fontFamily: FONT_MONO, fontSize: '9px', color: 'var(--muted2)', lineHeight: '1.6', margin: 0 } },
            `Baseline fila ${baselineRow} → ascender ${defaultAscender} u · descender ${defaultDescender} u`)
        )
      ),

      // Botones
      e('div', { style: { display: 'flex', gap: '10px', paddingTop: '4px' } },
        e('button', { onClick: onClose, style: { flex: 1, padding: '12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: R_BTN, color: 'var(--muted)', fontSize: '11px', fontFamily: FONT_MONO, cursor: 'pointer' } }, 'CANCELAR'),
        e('button', {
          // FIX: pass version correctly in meta so buildAndDownload can inject it into font name tables
          onClick: () => onExport(fontName, format, { fontName, version, author, license, letterSpacing, wordSpacing, lineGap, unitsPerEm, ascender, descender }),
          style: { flex: 2, padding: '12px', background: ACCENT, borderRadius: R_BTN, color: '#fff', fontWeight: '700', fontSize: '11px', fontFamily: FONT_MONO, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }
        },
          IC.exportDown,
          `EXPORTAR .${format.toUpperCase()}`
        )
      )
    )
  );
};

// ─────────────────────────────────────────────
//  PUBLISH MODAL
// ─────────────────────────────────────────────
const PublishModal = ({ projectName, fontData, gridSize, onClose, onPublish, isPublishing, published, showSpaceMarker }) => {
  const [previewText, setPreviewText] = useState('HELLO WORLD');

  if (published) return e(Overlay, { onClose },
    e('div', { style: { background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: R_CARD, padding: '40px 36px', maxWidth: '380px', boxShadow: '0 32px 80px rgba(0,0,0,0.3)', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' } },
      e('div', { style: { fontSize: '40px' } }, '🎉'),
      e('h3', { style: { fontFamily: FONT_PIXEL, fontSize: '10px', color: ACCENT, letterSpacing: '2px', margin: 0 } }, '¡PUBLICADO!'),
      e('p', { style: { fontFamily: FONT_MONO, fontSize: '11px', color: 'var(--muted)', lineHeight: '1.7', margin: 0 } }, `"${projectName}" ya está visible en la galería pública.`),
      e('button', { onClick: onClose, style: { padding: '12px 28px', background: ACCENT, border: 'none', borderRadius: R_BTN, color: '#fff', fontFamily: FONT_MONO, fontWeight: '700', fontSize: '11px', letterSpacing: '2px', cursor: 'pointer' } }, 'CERRAR')
    )
  );

  return e(Overlay, { onClose },
    e('div', { style: { background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: R_CARD, padding: '28px', maxWidth: '440px', boxShadow: '0 32px 80px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', gap: '18px' } },
      e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        e('h3', { style: { fontFamily: FONT_PIXEL, fontSize: '10px', color: ACCENT, letterSpacing: '2px', margin: 0 } }, 'PUBLICAR FUENTE'),
        e('button', { onClick: onClose, style: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '20px', lineHeight: 1, padding: '0 4px' } }, '×')
      ),
      e('p', { style: { fontFamily: FONT_MONO, fontSize: '11px', color: 'var(--muted)', lineHeight: '1.7', margin: 0 } }, `Publicará "${projectName}" en la galería para que otros la vean y descarguen.`),
      e('div', { style: { background: 'var(--canvas-bg)', border: '1px solid var(--border)', borderRadius: R_BTN, padding: '14px' } },
        e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' } },
          e('span', { style: { fontFamily: FONT_MONO, fontSize: '8px', color: 'var(--muted)', letterSpacing: '2px' } }, 'TEXTO DE PREVIEW'),
          e('input', { value: previewText, onChange: ev => setPreviewText(ev.target.value), style: { background: 'none', border: 'none', outline: 'none', color: 'var(--text)', fontSize: '11px', fontFamily: FONT_MONO, textAlign: 'right', maxWidth: '160px' } })
        ),
        e(PixelPreview, { text: previewText, fontData, gridSize, pixelSize: 4, color: ACCENT, showSpaceMarker, baselineRow: getBaselineRow(gridSize) })
      ),
      e('div', { style: { display: 'flex', gap: '10px' } },
        e('button', { onClick: onClose, style: { flex: 1, padding: '12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: R_BTN, color: 'var(--muted)', fontSize: '11px', fontFamily: FONT_MONO, cursor: 'pointer' } }, 'CANCELAR'),
        e('button', { onClick: () => onPublish(previewText), disabled: isPublishing, style: { flex: 2, padding: '12px', background: ACCENT, borderRadius: R_BTN, color: '#fff', fontWeight: '700', fontSize: '11px', fontFamily: FONT_MONO, border: 'none', cursor: 'pointer', opacity: isPublishing ? .6 : 1 } }, isPublishing ? 'PUBLICANDO...' : '🌐 PUBLICAR EN GALERÍA')
      )
    )
  );
};

// Keyboard shortcuts list — static data defined at module scope
const SHORTCUTS = [
  ['P', 'Herramienta Lápiz'], ['F', 'Herramienta Relleno'], ['H', 'Espejo horizontal'], ['V', 'Espejo vertical'],
  ['Ctrl+S', 'Guardar proyecto'], ['Ctrl+Z', 'Deshacer'], ['Ctrl+Y / Ctrl+Shift+Z', 'Rehacer'], ['Ctrl+I', 'Invertir glifo'],
  ['Ctrl+C', 'Copiar glifo'], ['Ctrl+V', 'Pegar glifo'],
  ['← → ↑ ↓', 'Desplazar glifo'],
  ['Delete', 'Limpiar glifo'], ['Escape', 'Cerrar modal'],
];

// ─────────────────────────────────────────────
//  PREFERENCES MODAL — Sub-components at module
//  level to avoid focus loss on re-render.
// ─────────────────────────────────────────────

// MiniToggle — module-level, never re-defined
const MiniToggle = ({ val, setVal }) =>
  e('button', {
    onClick: ev => { ev.preventDefault(); ev.stopPropagation(); setVal(v => !v); },
    style: { flexShrink: 0, padding: '2px 8px', borderRadius: '4px', border: val ? `1px solid ${ACCENT}40` : '1px solid var(--border)', background: val ? `${ACCENT}15` : 'var(--surface3)', color: val ? ACCENT : 'var(--muted2)', fontFamily: FONT_MONO, fontSize: '8px', letterSpacing: '1px', cursor: 'pointer', transition: 'all .13s', lineHeight: '16px' }
  }, val ? 'ON' : 'OFF');

// GuideRow — module-level
const GuideRow = ({ label, value, onChange, min, max, showVal, setShowVal }) =>
  e('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
    e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' } },
      e('span', { style: { fontFamily: FONT_MONO, fontSize: '10px', color: showVal ? 'var(--text)' : 'var(--muted2)', flex: 1, transition: 'color .15s' } }, label),
      e('span', { style: { fontFamily: FONT_MONO, fontSize: '10px', color: showVal ? ACCENT : 'var(--muted2)', minWidth: '16px', textAlign: 'right' } }, value),
      e(MiniToggle, { val: showVal, setVal: setShowVal })
    ),
    e('div', { style: { opacity: showVal ? 1 : 0.35, transition: 'opacity .15s' } },
      e(DragSlider, { value, onChange: v => onChange({ target: { value: v } }), min, max })
    )
  );

// ToggleCard — module-level
const ToggleCard = ({ title, desc, val, setVal }) =>
  e('button', { onClick: () => setVal(v => !v), style: { width: '100%', textAlign: 'left', background: val ? `${ACCENT}08` : 'var(--surface2)', border: val ? `1px solid ${ACCENT}30` : '1px solid var(--border)', borderRadius: R_BTN, padding: '12px 14px', cursor: 'pointer', transition: 'all .15s' } },
    e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' } },
      e('span', { style: { fontFamily: FONT_MONO, fontSize: '11px', color: 'var(--text)' } }, title),
      e('span', { style: { fontFamily: FONT_MONO, fontSize: '9px', letterSpacing: '1px', color: val ? ACCENT : 'var(--muted2)', background: val ? `${ACCENT}10` : 'var(--surface3)', padding: '2px 7px', borderRadius: '4px', border: val ? `1px solid ${ACCENT}30` : '1px solid transparent' } }, val ? 'ON' : 'OFF')
    ),
    e('div', { style: { fontFamily: FONT_MONO, fontSize: '9px', color: 'var(--muted2)', lineHeight: 1.5 } }, desc)
  );

const PreferencesModal = ({
  onClose,
  showSpaceMarker, setShowSpaceMarker,
  showCenterGuide, setShowCenterGuide,
  showCapGuide,    setShowCapGuide,
  showXHGuide,     setShowXHGuide,
  showBaseGuide,   setShowBaseGuide,
  showDescGuide,   setShowDescGuide,
  centerGuideCol,  setCenterGuideCol,
  capGuideRow,     setCapGuideRow,
  xHeightGuideRow, setXHeightGuideRow,
  baselineGuideRow, setBaselineGuideRow,
  descGuideRow,    setDescGuideRow,
  gridSize,
  autosaveEnabled, setAutosaveEnabled,
  autosaveMinutes, setAutosaveMinutes,
}) => {
  const [menu, setMenu] = useState('guides');

  // MenuBtn — local but never passed as a component to React.createElement
  // with variable identity; it's just a helper function called inline.
  // This is fine because it doesn't use hooks and always produces the same
  // element structure for the same arguments.
  const MenuBtn = ({ id, label }) =>
    e('button', {
      onClick: () => setMenu(id),
      style: { width: '100%', textAlign: 'left', padding: '9px 12px', background: menu === id ? `${ACCENT}12` : 'transparent', border: menu === id ? `1px solid ${ACCENT}30` : '1px solid transparent', borderRadius: R_BTN, color: menu === id ? 'var(--text)' : 'var(--muted)', fontFamily: FONT_MONO, fontSize: '10px', letterSpacing: '1px', cursor: 'pointer', transition: 'all .13s' }
    }, label);

  const previewSize = 16;
  const GuidePreview = () => {
    const pct = (row) => `${(row / Math.max(1, gridSize)) * 100}%`;
    return e('div', { style: { width: '160px', height: '160px', alignSelf: 'center', position: 'relative', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden', background: 'var(--surface2)' } },
      e('div', { style: { position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: `repeat(${previewSize}, 1fr)`, gridTemplateRows: `repeat(${previewSize}, 1fr)`, gap: '1px', background: 'var(--grid-line)' } },
        Array(previewSize * previewSize).fill(0).map((_, i) => e('div', { key: i, style: { background: 'var(--empty)' } }))
      ),
      showCapGuide  && e('div', { style: { position: 'absolute', left: 0, right: 0, top: pct(capGuideRow),       height: '1px', background: 'rgba(191,69,69,.45)' } }),
      showXHGuide   && e('div', { style: { position: 'absolute', left: 0, right: 0, top: pct(xHeightGuideRow),  height: '1px', background: 'rgba(191,69,69,.40)', borderTop: '1px dashed rgba(191,69,69,.4)' } }),
      showBaseGuide && e('div', { style: { position: 'absolute', left: 0, right: 0, top: pct(baselineGuideRow), height: '2px', background: 'rgba(191,69,69,.90)' } }),
      showDescGuide && e('div', { style: { position: 'absolute', left: 0, right: 0, top: pct(descGuideRow),     height: '1px', background: 'rgba(191,69,69,.35)', borderTop: '1px dashed rgba(191,69,69,.35)' } }),
      showCenterGuide && e('div', { style: { position: 'absolute', top: 0, bottom: 0, left: `${(centerGuideCol / Math.max(1, gridSize)) * 100}%`, width: '2px', background: 'rgba(191,69,69,.8)' } })
    );
  };

  return e(Overlay, { onClose },
    e(Modal, { style: { maxWidth: '700px', width: '700px', gap: '16px' } },
      e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        e('h3', { style: { margin: 0, fontFamily: FONT_PIXEL, fontSize: '10px', color: ACCENT, letterSpacing: '2px' } }, 'PREFERENCIAS'),
        e('button', { onClick: onClose, style: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '20px', lineHeight: 1, padding: '0 4px' } }, '×')
      ),
      e('div', { style: { display: 'grid', gridTemplateColumns: '160px 1fr', gap: '12px', minHeight: '320px' } },
        e('aside', { style: { border: '1px solid var(--border)', borderRadius: R_BTN, background: 'var(--surface2)', padding: '8px', display: 'flex', flexDirection: 'column', gap: '4px' } },
          e('div', { style: { fontFamily: FONT_MONO, fontSize: '8px', color: 'var(--muted2)', letterSpacing: '2px', padding: '4px 6px 8px' } }, 'SECCIÓN'),
          e(MenuBtn, { id: 'guides',   label: 'Guías' }),
          e(MenuBtn, { id: 'guardado', label: 'Guardado' }),
          e(MenuBtn, { id: 'shortcuts',label: 'Atajos' })
        ),
        e('section', { style: { border: '1px solid var(--border)', borderRadius: R_BTN, background: 'var(--surface)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto' } },
          menu === 'guides' && e(React.Fragment, null,
            e('div', { style: { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: R_BTN, padding: '14px', display: 'flex', flexDirection: 'column', gap: '14px' } },
              e('div', { style: { fontFamily: FONT_MONO, fontSize: '8px', color: 'var(--muted2)', letterSpacing: '2px', marginBottom: '2px' } }, 'LÍNEAS HORIZONTALES'),
              e(GuideRow, { label: `CAP (fila ${capGuideRow})`,           value: capGuideRow,      onChange: ev => setCapGuideRow(Number(ev.target.value)),      min: 0, max: Math.max(0, gridSize - 1), showVal: showCapGuide,  setShowVal: setShowCapGuide }),
              e(GuideRow, { label: `X-Height (fila ${xHeightGuideRow})`,  value: xHeightGuideRow, onChange: ev => setXHeightGuideRow(Number(ev.target.value)),   min: 0, max: Math.max(0, gridSize - 1), showVal: showXHGuide,   setShowVal: setShowXHGuide }),
              e(GuideRow, { label: `Baseline (fila ${baselineGuideRow})`, value: baselineGuideRow,onChange: ev => setBaselineGuideRow(Number(ev.target.value)),  min: 0, max: Math.max(0, gridSize - 1), showVal: showBaseGuide, setShowVal: setShowBaseGuide }),
              e(GuideRow, { label: `Descender (fila ${descGuideRow})`,    value: descGuideRow,    onChange: ev => setDescGuideRow(Number(ev.target.value)),      min: 0, max: Math.max(0, gridSize - 1), showVal: showDescGuide, setShowVal: setShowDescGuide }),
              e('div', { style: { height: '1px', background: 'var(--border)', margin: '4px 0' } }),
              e('div', { style: { fontFamily: FONT_MONO, fontSize: '8px', color: 'var(--muted2)', letterSpacing: '2px' } }, 'LÍNEA VERTICAL'),
              e(GuideRow, { label: `Guía vertical (col ${centerGuideCol})`, value: centerGuideCol, onChange: ev => setCenterGuideCol(Number(ev.target.value)), min: 0, max: Math.max(0, gridSize - 1), showVal: showCenterGuide, setShowVal: setShowCenterGuide })
            ),
            e(GuidePreview)
          ),
          menu === 'guardado' && e(React.Fragment, null,
            e('div', { style: { fontFamily: FONT_MONO, fontSize: '9px', color: 'var(--muted)', lineHeight: '1.6', marginBottom: '4px' } }, 'Configura cuándo se guarda tu proyecto automáticamente. El guardado manual siempre está disponible con Ctrl+S.'),
            e('div', { style: { background: autosaveEnabled ? `${ACCENT}08` : 'var(--surface2)', border: autosaveEnabled ? `1px solid ${ACCENT}30` : '1px solid var(--border)', borderRadius: R_BTN, padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px', transition: 'all .15s' } },
              e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                e('div', null,
                  e('div', { style: { fontFamily: FONT_MONO, fontSize: '11px', color: 'var(--text)', marginBottom: '3px' } }, 'Guardado automático'),
                  e('div', { style: { fontFamily: FONT_MONO, fontSize: '9px', color: 'var(--muted2)', lineHeight: 1.5 } }, 'Guarda en Firebase cada N minutos.')
                ),
                e('button', {
                  onClick: () => setAutosaveEnabled(v => !v),
                  style: { flexShrink: 0, padding: '3px 10px', borderRadius: '4px', border: autosaveEnabled ? `1px solid ${ACCENT}40` : '1px solid var(--border)', background: autosaveEnabled ? ACCENT : 'var(--surface3)', color: autosaveEnabled ? '#fff' : 'var(--muted2)', fontFamily: FONT_MONO, fontSize: '8px', letterSpacing: '1px', cursor: 'pointer', transition: 'all .13s' }
                }, autosaveEnabled ? 'ON' : 'OFF')
              ),
              autosaveEnabled && e('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
                e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                  e('span', { style: { fontFamily: FONT_MONO, fontSize: '10px', color: 'var(--muted)' } }, 'Intervalo'),
                  e('span', { style: { fontFamily: FONT_MONO, fontSize: '12px', color: ACCENT, fontWeight: '700' } }, `${autosaveMinutes} min`)
                ),
                e(DragSlider, { value: autosaveMinutes, onChange: setAutosaveMinutes, min: 1, max: 30 }),
                e('div', { style: { display: 'flex', gap: '4px' } },
                  [1, 2, 5, 10, 15, 30].map(n =>
                    e('button', { key: n, onClick: () => setAutosaveMinutes(n), style: { flex: 1, padding: '5px 0', borderRadius: '4px', border: autosaveMinutes === n ? `1px solid ${ACCENT}` : '1px solid var(--border)', background: autosaveMinutes === n ? ACCENT : 'var(--surface3)', color: autosaveMinutes === n ? '#fff' : 'var(--muted)', fontFamily: FONT_MONO, fontSize: '9px', cursor: 'pointer', transition: 'all .12s' } }, n)
                  )
                )
              )
            ),
            e('div', { style: { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: R_BTN, padding: '12px 14px' } },
              e('div', { style: { fontFamily: FONT_MONO, fontSize: '10px', color: 'var(--text)', marginBottom: '4px' } }, 'Guardado manual'),
              e('div', { style: { fontFamily: FONT_MONO, fontSize: '9px', color: 'var(--muted2)', lineHeight: 1.5 } }, 'Usa Ctrl+S en cualquier momento para guardar el proyecto en Firebase inmediatamente.')
            )
          ),
          menu === 'shortcuts' && e(React.Fragment, null,
            e('p', { style: { margin: 0, fontFamily: FONT_MONO, fontSize: '10px', color: 'var(--muted)', lineHeight: '1.6' } }, 'Atajos de teclado disponibles en el editor.'),
            e('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
              SHORTCUTS.map(([key, desc]) =>
                e('div', { key, style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', borderRadius: R_BTN, background: 'var(--surface2)', border: '1px solid var(--border)' } },
                  e('kbd', { style: { fontFamily: FONT_MONO, fontSize: '9px', color: ACCENT, background: `${ACCENT}10`, border: `1px solid ${ACCENT}25`, borderRadius: '4px', padding: '2px 6px' } }, key),
                  e('span', { style: { fontFamily: FONT_MONO, fontSize: '10px', color: 'var(--muted)' } }, desc)
                )
              )
            )
          )
        )
      ),
      e('div', { style: { display: 'flex', justifyContent: 'flex-end' } },
        e('button', { onClick: onClose, style: { padding: '10px 24px', background: ACCENT, border: 'none', borderRadius: R_BTN, color: '#fff', fontFamily: FONT_MONO, fontWeight: '700', fontSize: '11px', letterSpacing: '1px', cursor: 'pointer' } }, 'LISTO')
      )
    )
  );
};

// ─────────────────────────────────────────────
//  CONSTANTS — module-level, never recreated
// ─────────────────────────────────────────────
const EXTENDED_CHARS = [
  'á','é','í','ó','ú','Á','É','Í','Ó','Ú','ü','Ü','ñ','Ñ',
  '¡','¿','@','#','$','%','&','*','(',')','-','+','=','[',']','{','}',
  '<','>','/','\\','|','_','~','^','`','\'','"',':',';',',','.','!'
];

// Toolbar tool definitions — module-level, never recreated
const EDIT_TOOLS = [
  { id: 'pencil',   icon: IC.pencil,  tooltip: 'Lápiz (P)',          isMode: true },
  { id: 'fill',     icon: IC.fill,    tooltip: 'Relleno (F)',         isMode: true },
];
const TRANSFORM_TOOLS = [
  { id: 'mirror-h', icon: IC.mirrorH, tooltip: 'Espejo H (H)',       isMode: true },
  { id: 'mirror-v', icon: IC.mirrorV, tooltip: 'Espejo V (V)',       isMode: true },
  { id: '_invert',  icon: IC.invert,  tooltip: 'Invertir (Ctrl+I)',  isMode: false },
];

// ─────────────────────────────────────────────
//  EDITOR PAGE
// ─────────────────────────────────────────────
export function EditorPage({
  user, isDark, toggleTheme, gridSize, currentChar, fontData, grid, isSaving,
  tool, setTool, previewText, setPreviewText, onPixelDown, onPixelEnter, onMouseUp,
  onSwitchChar, onClearCanvas, onInvert, onShift, onSave, onUndo, onRedo,
  onBack, onPublish, projectName, isPublishing, publishedOk, onResetPublish,
  onSaveExtraChars, initialExtraChars, onPasteGlyph
}) {
  const [showExport,      setShowExport]      = useState(false);
  const [showPublish,     setShowPublish]     = useState(false);
  const [showPrefs,       setShowPrefs]       = useState(false);
  const [openFileMenu,    setOpenFileMenu]    = useState(false);
  const [openUserMenu,    setOpenUserMenu]    = useState(false);
  const [avatarColor,     setAvatarColor]     = useState(ACCENT);
  const [charFilter,      setCharFilter]      = useState('all');
  const [charSearch,      setCharSearch]      = useState('');
  const [charPage,        setCharPage]        = useState(0);

  // FIX: clipboard must be held in a ref as WELL as state so the keyboard
  // handler always accesses the latest value without needing it in deps.
  // State drives re-renders (paste button disabled state); ref drives the
  // keyboard shortcut handler which is registered once with empty deps.
  const [clipboard,       setClipboard]       = useState(null);
  const clipboardRef                           = useRef(null);

  const [autosaveEnabled, setAutosaveEnabled] = useState(() => localStorage.getItem('cs-autosave-enabled') === '1');
  const [autosaveMinutes, setAutosaveMinutes] = useState(() => Number(localStorage.getItem('cs-autosave-minutes') || 5));
  const [showAddChar,     setShowAddChar]     = useState(false);
  const [addCharInput,    setAddCharInput]    = useState('');
  const [addCharList,     setAddCharList]     = useState([]);
  const [extraChars,      setExtraChars]      = useState(() => Array.isArray(initialExtraChars) ? initialExtraChars : []);
  const addCharRef = useRef(null);

  const [showSpaceMarker, setShowSpaceMarker] = useState(() => localStorage.getItem('cs-show-space-marker') !== '0');
  const [showCenterGuide, setShowCenterGuide] = useState(() => localStorage.getItem('cs-show-center-guide') !== '0');
  const [showCapGuide,    setShowCapGuide]    = useState(() => localStorage.getItem('cs-show-cap-guide') !== '0');
  const [showXHGuide,     setShowXHGuide]     = useState(() => localStorage.getItem('cs-show-xh-guide') !== '0');
  const [showBaseGuide,   setShowBaseGuide]   = useState(() => localStorage.getItem('cs-show-base-guide') !== '0');
  const [showDescGuide,   setShowDescGuide]   = useState(() => localStorage.getItem('cs-show-desc-guide') !== '0');
  const [centerGuideCol,  setCenterGuideCol]  = useState(() => Number(localStorage.getItem('cs-center-guide-col') ?? 2));
  const [capGuideRow,     setCapGuideRow]     = useState(() => readNumberSetting(EDITOR_STORAGE_KEYS.capGuideRow, 7));
  const [xHeightGuideRow, setXHeightGuideRow] = useState(() => readNumberSetting(EDITOR_STORAGE_KEYS.xHeightGuideRow, 9));
  const [baselineGuideRow,setBaselineGuideRow]= useState(() => readNumberSetting(EDITOR_STORAGE_KEYS.baselineGuideRow, 13));
  const [descGuideRow,    setDescGuideRow]    = useState(() => readNumberSetting(EDITOR_STORAGE_KEYS.descGuideRow, 15));

  const avatarInit = (user?.displayName || user?.email || '?')[0].toUpperCase();
  const CANVAS_BASE = 460;

  const totalGlyphs = TECLADO.length;
  const doneGlyphs  = TECLADO.filter(c => fontData?.[c]?.some(Boolean)).length;
  const progress    = Math.round((doneGlyphs / totalGlyphs) * 100);

  // Avatar color from Firestore
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

  // Close menus on outside click
  useEffect(() => {
    const close = () => { setOpenFileMenu(false); setOpenUserMenu(false); };
    if (openFileMenu || openUserMenu) window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [openFileMenu, openUserMenu]);

  // Persist guide visibility settings
  useEffect(() => { writeSetting(EDITOR_STORAGE_KEYS.showSpaceMarker, showSpaceMarker ? '1' : '0'); }, [showSpaceMarker]);
  useEffect(() => {
    localStorage.setItem('cs-show-center-guide', showCenterGuide ? '1' : '0');
    localStorage.setItem('cs-show-cap-guide',    showCapGuide    ? '1' : '0');
    localStorage.setItem('cs-show-xh-guide',     showXHGuide     ? '1' : '0');
    localStorage.setItem('cs-show-base-guide',   showBaseGuide   ? '1' : '0');
    localStorage.setItem('cs-show-desc-guide',   showDescGuide   ? '1' : '0');
  }, [showCenterGuide, showCapGuide, showXHGuide, showBaseGuide, showDescGuide]);

  useEffect(() => {
    const clamped = clamp(centerGuideCol || 0, 0, gridSize - 1);
    if (clamped !== centerGuideCol) setCenterGuideCol(clamped);
    localStorage.setItem('cs-center-guide-col', String(clamped));
  }, [centerGuideCol, gridSize]);
  useEffect(() => {
    const clamped = clamp(capGuideRow || 0, 0, gridSize - 1);
    if (clamped !== capGuideRow) setCapGuideRow(clamped);
    writeSetting(EDITOR_STORAGE_KEYS.capGuideRow, String(clamped));
  }, [capGuideRow, gridSize]);
  useEffect(() => {
    const clamped = clamp(xHeightGuideRow || 0, 0, gridSize - 1);
    if (clamped !== xHeightGuideRow) setXHeightGuideRow(clamped);
    writeSetting(EDITOR_STORAGE_KEYS.xHeightGuideRow, String(clamped));
  }, [xHeightGuideRow, gridSize]);
  useEffect(() => {
    const clamped = clamp(baselineGuideRow || 0, 0, gridSize - 1);
    if (clamped !== baselineGuideRow) setBaselineGuideRow(clamped);
    writeSetting(EDITOR_STORAGE_KEYS.baselineGuideRow, String(clamped));
  }, [baselineGuideRow, gridSize]);
  useEffect(() => {
    const clamped = clamp(descGuideRow || 0, 0, gridSize - 1);
    if (clamped !== descGuideRow) setDescGuideRow(clamped);
    writeSetting(EDITOR_STORAGE_KEYS.descGuideRow, String(clamped));
  }, [descGuideRow, gridSize]);

  // ── Keyboard shortcuts ────────────────────
  // FIX: grid and clipboard are captured via refs so the handler never
  // becomes stale. The handler is registered once (empty deps) and always
  // reads the latest values through the refs.
  const gridRef = useRef(grid);
  useEffect(() => { gridRef.current = grid; }, [grid]);
  useEffect(() => { clipboardRef.current = clipboard; }, [clipboard]);

  // Stable refs for callbacks that change with props
  const onSaveRef         = useRef(onSave);
  const onUndoRef         = useRef(onUndo);
  const onRedoRef         = useRef(onRedo);
  const onInvertRef       = useRef(onInvert);
  const onShiftRef        = useRef(onShift);
  const onClearCanvasRef  = useRef(onClearCanvas);
  const onPasteGlyphRef   = useRef(onPasteGlyph);
  const setToolRef        = useRef(setTool);

  useEffect(() => { onSaveRef.current        = onSave; },        [onSave]);
  useEffect(() => { onUndoRef.current        = onUndo; },        [onUndo]);
  useEffect(() => { onRedoRef.current        = onRedo; },        [onRedo]);
  useEffect(() => { onInvertRef.current      = onInvert; },      [onInvert]);
  useEffect(() => { onShiftRef.current       = onShift; },       [onShift]);
  useEffect(() => { onClearCanvasRef.current = onClearCanvas; }, [onClearCanvas]);
  useEffect(() => { onPasteGlyphRef.current  = onPasteGlyph; },  [onPasteGlyph]);
  useEffect(() => { setToolRef.current       = setTool; },       [setTool]);

  useEffect(() => {
    const handler = (ev) => {
      if (['INPUT', 'TEXTAREA'].includes(ev.target.tagName)) return;
      const ctrl = ev.ctrlKey || ev.metaKey;
      if (ctrl && ev.key === 's') { ev.preventDefault(); onSaveRef.current(); return; }
      if (ctrl && ev.key === 'z' && !ev.shiftKey) { ev.preventDefault(); onUndoRef.current(); return; }
      if (ctrl && (ev.key === 'y' || (ev.key === 'z' && ev.shiftKey))) { ev.preventDefault(); onRedoRef.current(); return; }
      if (ctrl && ev.key === 'i') { ev.preventDefault(); onInvertRef.current(); return; }
      // FIX: use refs for grid and clipboard so we always read fresh values
      if (ctrl && ev.key === 'c') {
        ev.preventDefault();
        const snap = [...gridRef.current];
        clipboardRef.current = snap;
        setClipboard(snap);
        return;
      }
      if (ctrl && ev.key === 'v') {
        ev.preventDefault();
        if (clipboardRef.current) onPasteGlyphRef.current?.(clipboardRef.current);
        return;
      }
      if (!ctrl) {
        if (ev.key === 'p') { setToolRef.current('pencil'); return; }
        if (ev.key === 'f') { setToolRef.current('fill');   return; }
        if (ev.key === 'h') { setToolRef.current('mirror-h'); return; }
        if (ev.key === 'v') { setToolRef.current('mirror-v'); return; }
        if (ev.key === 'ArrowUp')    { ev.preventDefault(); onShiftRef.current('up');    return; }
        if (ev.key === 'ArrowDown')  { ev.preventDefault(); onShiftRef.current('down');  return; }
        if (ev.key === 'ArrowLeft')  { ev.preventDefault(); onShiftRef.current('left');  return; }
        if (ev.key === 'ArrowRight') { ev.preventDefault(); onShiftRef.current('right'); return; }
        if (ev.key === 'Delete' || ev.key === 'Backspace') { onClearCanvasRef.current(); return; }
      }
      if (ev.key === 'Escape') {
        setShowExport(false); setShowPublish(false); setShowPrefs(false);
        setOpenFileMenu(false); setOpenUserMenu(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []); // empty deps — all values accessed via stable refs

  // Persist autosave prefs
  useEffect(() => {
    localStorage.setItem('cs-autosave-enabled', autosaveEnabled ? '1' : '0');
    localStorage.setItem('cs-autosave-minutes', String(autosaveMinutes));
  }, [autosaveEnabled, autosaveMinutes]);

  // Autosave interval
  useEffect(() => {
    if (!autosaveEnabled) return;
    const id = setInterval(() => { onSaveRef.current(); }, autosaveMinutes * 60 * 1000);
    return () => clearInterval(id);
  }, [autosaveEnabled, autosaveMinutes]);

  // All chars = TECLADO + extended + extra
  const allChars = useMemo(() => {
    const base = [...TECLADO];
    EXTENDED_CHARS.forEach(c => { if (!base.includes(c)) base.push(c); });
    extraChars.forEach(c => { if (!base.includes(c)) base.push(c); });
    return base;
  }, [extraChars]);

  // Filtered chars
  const filteredChars = useMemo(() => {
    let chars = allChars;
    if (charSearch) { const q = charSearch.toLowerCase(); chars = chars.filter(c => c.toLowerCase().includes(q)); }
    if (charFilter === 'done')  chars = chars.filter(c => fontData?.[c]?.some(Boolean));
    if (charFilter === 'empty') chars = chars.filter(c => !fontData?.[c]?.some(Boolean));
    return chars;
  }, [charSearch, charFilter, fontData, allChars]);

  // Reset page on filter/search change
  useEffect(() => { setCharPage(0); }, [charSearch, charFilter]);

  // Close addChar menu on outside click
  useEffect(() => {
    if (!showAddChar) return;
    const close = (ev) => { if (addCharRef.current && !addCharRef.current.contains(ev.target)) setShowAddChar(false); };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [showAddChar]);

  // Parse char from code (U+0041, &#65;, 0x41, or direct char)
  const parseCharCode = useCallback((raw) => {
    const s = raw.trim();
    if (!s) return null;
    const uMatch = s.match(/^[Uu]\+([0-9a-fA-F]{1,6})$/);
    if (uMatch) return String.fromCodePoint(parseInt(uMatch[1], 16));
    const htmlMatch = s.match(/^&#(\d+);?$/);
    if (htmlMatch) return String.fromCodePoint(parseInt(htmlMatch[1]));
    const hexMatch = s.match(/^0[xX]([0-9a-fA-F]+)$/);
    if (hexMatch) return String.fromCodePoint(parseInt(hexMatch[1], 16));
    if (s.length === 1 || (s.length === 2 && s.codePointAt(0) > 0xFFFF)) return s;
    return null;
  }, []);

  const addToList = useCallback(() => {
    const ch = parseCharCode(addCharInput);
    if (!ch) return;
    if (addCharList.find(item => item.char === ch)) return;
    setAddCharList(prev => [...prev, { char: ch, code: addCharInput.trim() }]);
    setAddCharInput('');
  }, [parseCharCode, addCharInput, addCharList]);

  const removeFromList = useCallback((ch) => setAddCharList(prev => prev.filter(item => item.char !== ch)), []);

  const addAllChars = useCallback(() => {
    const toAdd = addCharList.map(item => item.char).filter(ch => !extraChars.includes(ch));
    if (toAdd.length === 0) return;
    const next = [...extraChars, ...toAdd];
    setExtraChars(next);
    onSaveExtraChars?.(next);
    setAddCharList([]);
    setShowAddChar(false);
    if (toAdd[0]) onSwitchChar(toAdd[0]);
  }, [addCharList, extraChars, onSwitchChar, onSaveExtraChars]);

  // FIX: copy/paste button handlers use refs so they're always current
  const onCopyGlyph = useCallback(() => {
    const snap = [...gridRef.current];
    clipboardRef.current = snap;
    setClipboard(snap);
  }, []);

  const onPaste = useCallback(() => {
    if (clipboardRef.current) onPasteGlyphRef.current?.(clipboardRef.current);
  }, []);

  // Toolbar style helpers — computed once per render but kept out of JSX
  const toolbarBase = { padding: '7px', borderRadius: R_BTN, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '34px', fontFamily: FONT_MONO, border: '1px solid var(--border)', transition: 'all .13s' };
  const btnBase     = { ...toolbarBase, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' };
  const btnActive   = { ...toolbarBase, background: ACCENT, border: `1px solid ${ACCENT}`, color: '#fff', boxShadow: `0 2px 8px ${ACCENT}40` };
  const divider     = e('div', { style: { width: '1px', height: '28px', background: 'var(--border)', margin: '0 5px', flexShrink: 0 } });

  // ActionBtn — local helper, no hooks, safe to define inside render
  const ActionBtn = ({ tooltip, icon, onClick, style: extraStyle = {}, disabled = false }) =>
    e(Tooltip, { label: tooltip, placement: 'bottom' },
      e('button', {
        onClick, disabled,
        style: { ...btnBase, ...extraStyle, opacity: disabled ? .35 : 1, cursor: disabled ? 'not-allowed' : 'pointer' },
        onMouseEnter: ev => { if (!disabled) { ev.currentTarget.style.background = 'var(--surface3)'; ev.currentTarget.style.borderColor = 'var(--border2)'; } },
        onMouseLeave: ev => { if (!disabled) { ev.currentTarget.style.background = 'var(--surface)';  ev.currentTarget.style.borderColor = 'var(--border)'; } },
      }, icon)
    );

  // ─────────────────────────────────────────────
  //  RENDER
  // ─────────────────────────────────────────────
  return e('div', { style: { display: 'flex', flexDirection: 'column', minHeight: '100vh' } },

    // ── NAVBAR ──────────────────────────────────
    e('nav', { style: { height: '52px', padding: '0 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', background: 'var(--nav-bg)', backdropFilter: 'blur(16px)', position: 'sticky', top: 0, zIndex: 200 } },
      e('div', { style: { display: 'flex', alignItems: 'center', gap: '4px' } },
        e('span', { onClick: onBack, style: { fontFamily: FONT_PIXEL, fontSize: '11px', color: ACCENT, letterSpacing: '2px', cursor: 'pointer', padding: '6px 10px', borderRadius: R_BTN, transition: 'opacity .15s' } }, 'CODESHELF'),

        // File menu
        e('div', { style: { position: 'relative' } },
          e('button', { onClick: ev => { ev.stopPropagation(); setOpenFileMenu(v => !v); }, style: { fontFamily: FONT_MONO, fontSize: '9px', letterSpacing: '2px', color: openFileMenu ? 'var(--text)' : 'var(--muted)', padding: '6px 12px', borderRadius: R_BTN, background: openFileMenu ? 'var(--surface2)' : 'none', border: openFileMenu ? '1px solid var(--border)' : '1px solid transparent', cursor: 'pointer', transition: 'all .15s' } }, 'ARCHIVO'),
          openFileMenu && e('div', { onClick: ev => ev.stopPropagation(), style: { position: 'absolute', top: 'calc(100% + 8px)', left: 0, background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: '12px', minWidth: '230px', zIndex: 300, boxShadow: '0 20px 60px rgba(0,0,0,0.22)', overflow: 'hidden', padding: '6px' } },
            [
              { icon: 'fonts',   label: 'Mis proyectos',       kbd: '',       fn: onBack },
              { icon: 'save',    label: 'Guardar',             kbd: 'Ctrl+S', fn: onSave },
              { icon: 'theme',   label: 'Preferencias',        kbd: '',       fn: () => { setShowPrefs(true); setOpenFileMenu(false); } },
              { icon: 'export',  label: 'Exportar fuente',     kbd: '',       fn: () => { setShowExport(true); setOpenFileMenu(false); } },
              { icon: 'publish', label: 'Publicar en galería', kbd: '',       fn: () => { setShowPublish(true); setOpenFileMenu(false); } },
            ].map(({ icon, label, kbd, fn }) =>
              e('button', { key: label, onClick: () => { fn(); setOpenFileMenu(false); }, style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '9px 12px', background: 'none', border: '1px solid transparent', borderRadius: '8px', cursor: 'pointer', fontFamily: FONT_MONO, color: 'var(--muted)', textAlign: 'left', transition: 'all .12s' }, onMouseEnter: ev => { ev.currentTarget.style.background = 'var(--surface2)'; ev.currentTarget.style.borderColor = 'var(--border)'; ev.currentTarget.style.color = 'var(--text)'; }, onMouseLeave: ev => { ev.currentTarget.style.background = 'none'; ev.currentTarget.style.borderColor = 'transparent'; ev.currentTarget.style.color = 'var(--muted)'; } },
                e('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
                  e('img', { src: `./src/icons/${icon}.svg`, style: { width: '14px', height: '14px', filter: 'var(--icon-filter)', opacity: .5 } }),
                  e('span', { style: { fontSize: '11px' } }, label)
                ),
                kbd && e('kbd', { style: { fontFamily: FONT_MONO, fontSize: '8px', color: 'var(--muted2)', background: 'var(--surface3)', borderRadius: '3px', padding: '1px 5px', border: '1px solid var(--border)' } }, kbd)
              )
            )
          )
        ),
        e('span', { style: { fontFamily: FONT_MONO, fontSize: '9px', letterSpacing: '2px', color: 'var(--muted2)', paddingLeft: '8px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, projectName || '')
      ),

      // Navbar right
      e('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
        isSaving && e('div', { style: { fontFamily: FONT_MONO, fontSize: '9px', letterSpacing: '1px', color: ACCENT, display: 'flex', alignItems: 'center', gap: '5px' } }, '◐ GUARDANDO'),

        e(Tooltip, { label: `${doneGlyphs}/${totalGlyphs} glifos (${progress}%)`, placement: 'bottom' },
          e('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: R_BTN, padding: '5px 10px', cursor: 'default' } },
            e('div', { style: { width: '48px', height: '4px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' } },
              e('div', { style: { width: `${progress}%`, height: '100%', background: ACCENT, borderRadius: '2px', transition: 'width .3s ease' } })
            ),
            e('span', { style: { fontFamily: FONT_MONO, fontSize: '9px', color: 'var(--muted)', letterSpacing: '1px' } }, `${progress}%`)
          )
        ),

        e(Tooltip, { label: isDark ? 'Modo claro' : 'Modo oscuro', placement: 'bottom' },
          e('button', { onClick: toggleTheme, style: { width: '32px', height: '32px', borderRadius: '50%', background: 'var(--surface2)', border: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .15s' } },
            e('img', { src: './src/icons/theme.svg', style: { width: '14px', height: '14px', filter: 'var(--icon-filter)' } })
          )
        ),

        // Avatar + user menu
        e('div', { style: { position: 'relative' } },
          e('div', { onClick: ev => { ev.stopPropagation(); setOpenUserMenu(v => !v); }, style: { width: '32px', height: '32px', borderRadius: '50%', border: `1.5px solid ${avatarColor}`, background: `${avatarColor}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT_PIXEL, fontSize: '9px', color: avatarColor, cursor: 'pointer', userSelect: 'none', transition: 'background .15s' } }, avatarInit),
          openUserMenu && e('div', { onClick: ev => ev.stopPropagation(), style: { position: 'absolute', top: 'calc(100% + 10px)', right: 0, background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: '12px', minWidth: '210px', zIndex: 300, boxShadow: '0 20px 56px rgba(0,0,0,0.18)', overflow: 'hidden', padding: '5px 0' } },
            e('div', { style: { padding: '12px 16px', borderBottom: '1px solid var(--border)', fontFamily: FONT_MONO, fontSize: '10px', color: 'var(--muted)' } }, user?.email || ''),
            [
              { icon: 'explore', label: 'Explorar fuentes', fn: () => window.location.href = 'social.html' },
              { icon: 'fonts',   label: 'Mis proyectos',    fn: onBack },
              { icon: 'user',    label: 'Mi perfil',        fn: () => window.location.href = 'profile.html' },
            ].map(({ icon, label, fn }) =>
              e('button', { key: label, onClick: () => { fn(); setOpenUserMenu(false); }, style: { display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '9px 16px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT_MONO, fontSize: '11px', color: 'var(--muted)', textAlign: 'left', transition: 'all .12s' }, onMouseEnter: ev => { ev.currentTarget.style.background = 'var(--surface2)'; ev.currentTarget.style.color = 'var(--text)'; }, onMouseLeave: ev => { ev.currentTarget.style.background = 'none'; ev.currentTarget.style.color = 'var(--muted)'; } },
                e('img', { src: `./src/icons/${icon}.svg`, style: { width: '14px', height: '14px', filter: 'var(--icon-filter)', opacity: .5 } }), label
              )
            ),
            e('div', { style: { borderTop: '1px solid var(--border)', marginTop: '4px', paddingTop: '4px' } },
              e('button', { onClick: () => signOut(auth).then(() => window.location.replace('index.html')), style: { display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '9px 16px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT_MONO, fontSize: '11px', color: ACCENT, textAlign: 'left' } },
                e('img', { src: './src/icons/logout.svg', style: { width: '14px', height: '14px', opacity: .65, filter: 'var(--icon-filter)' } }), 'Cerrar sesión'
              )
            )
          )
        )
      )
    ),

    // ── MAIN LAYOUT ────────────────────────────
    e('main', { style: { padding: '20px', maxWidth: '1280px', margin: '0 auto', width: '100%', display: 'grid', gridTemplateColumns: '230px 1fr 360px', gap: '18px', alignItems: 'start' } },

      // ── LEFT PANEL ───────────────────────────
      e('aside', { style: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', position: 'sticky', top: '68px', boxShadow: 'var(--shadow-card)', display: 'flex', flexDirection: 'column', gap: '12px' } },
        e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
          e('span', { style: { fontFamily: FONT_MONO, fontSize: '8px', letterSpacing: '3px', color: 'var(--muted)' } }, 'PREVIEW'),
          e('input', { value: previewText, onChange: ev => setPreviewText(ev.target.value), placeholder: 'texto...', style: { background: 'none', border: 'none', outline: 'none', color: 'var(--muted2)', fontSize: '10px', fontFamily: FONT_MONO, textAlign: 'right', width: '100px' } })
        ),
        e('div', { style: { background: 'var(--canvas-bg)', borderRadius: '8px', padding: '6px 8px', minHeight: '40px', overflowX: 'auto', overflowY: 'hidden', border: '1px solid var(--border)' } },
          e(PixelPreview, { text: previewText || ' ', fontData, gridSize, pixelSize: 2, color: ACCENT, letterSpacing: 1, baselineRow: baselineGuideRow })
        ),
        e('div', { style: { height: '1px', background: 'var(--border)' } }),
        e('div', { style: { display: 'flex', gap: '6px' } },
          [{ val: doneGlyphs, lbl: 'GLIFOS' }, { val: gridSize, lbl: 'GRID' }, { val: grid.filter(Boolean).length, lbl: 'PX' }].map(({ val, lbl }) =>
            e('div', { key: lbl, style: { flex: 1, textAlign: 'center', padding: '8px 4px', background: 'var(--surface2)', borderRadius: R_BTN, border: '1px solid var(--border)' } },
              e('div', { style: { fontSize: '16px', fontWeight: '700', color: ACCENT, fontFamily: FONT_MONO } }, val),
              e('div', { style: { fontSize: '7px', color: 'var(--muted)', letterSpacing: '2px', fontFamily: FONT_MONO, marginTop: '2px' } }, lbl)
            )
          )
        )
      ),

      // ── CENTRAL CANVAS ───────────────────────
      e('section', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', background: 'var(--surface)', borderRadius: R_CARD, border: '1px solid var(--border)', padding: '20px', boxShadow: 'var(--shadow-card)' } },
        // Active char header
        e('div', { style: { display: 'flex', alignItems: 'center', gap: '16px', width: '100%' } },
          e('div', { style: { fontFamily: FONT_PIXEL, fontSize: '36px', lineHeight: 1, color: ACCENT, minWidth: '52px', textAlign: 'center', textShadow: `0 0 20px ${ACCENT}40` } }, currentChar === ' ' ? '·' : currentChar),
          e('div', { style: { flex: 1 } },
            e('div', { style: { fontFamily: FONT_MONO, fontSize: '9px', color: 'var(--muted)', letterSpacing: '2px', marginBottom: '4px' } }, 'EDITANDO CARÁCTER'),
            e('div', { style: { fontFamily: FONT_MONO, fontSize: '11px', color: 'var(--text)', letterSpacing: '1px' } }, `U+${(currentChar.codePointAt(0) || 0).toString(16).toUpperCase().padStart(4,'0')} · Grid ${gridSize}×${gridSize}`),
            (currentChar === ' ' && showSpaceMarker) && e('div', { style: { fontFamily: FONT_MONO, fontSize: '9px', color: 'var(--muted2)', letterSpacing: '1px', marginTop: '3px' } }, 'Marcador de espacio activo')
          )
        ),

        // ── Toolbar ─────────────────────────────
        e('div', { style: { display: 'flex', gap: '2px', alignItems: 'center', flexWrap: 'wrap', padding: '5px 8px', background: 'var(--surface2)', borderRadius: R_CARD, border: '1px solid var(--border)', width: '100%', boxSizing: 'border-box' } },

          // Group A: Edit
          ...EDIT_TOOLS.map(t =>
            e(Tooltip, { key: t.id, label: t.tooltip, placement: 'bottom' },
              e('button', {
                onClick: () => setTool(t.id),
                style: tool === t.id ? btnActive : btnBase,
                onMouseEnter: ev => { if (tool !== t.id) { ev.currentTarget.style.background = 'var(--surface3)'; ev.currentTarget.style.borderColor = 'var(--border2)'; } },
                onMouseLeave: ev => { if (tool !== t.id) { ev.currentTarget.style.background = 'var(--surface)';  ev.currentTarget.style.borderColor = 'var(--border)'; } },
              }, t.icon)
            )
          ),

          divider,

          // Group B: History
          e(ActionBtn, { tooltip: 'Deshacer (Ctrl+Z)', icon: IC.undo, onClick: onUndo }),
          e(ActionBtn, { tooltip: 'Rehacer (Ctrl+Y)',  icon: IC.redo, onClick: onRedo }),

          divider,

          // Group C: Transform
          ...TRANSFORM_TOOLS.map(t =>
            t.isMode
              ? e(Tooltip, { key: t.id, label: t.tooltip, placement: 'bottom' },
                  e('button', {
                    onClick: () => setTool(t.id),
                    style: tool === t.id ? btnActive : btnBase,
                    onMouseEnter: ev => { if (tool !== t.id) { ev.currentTarget.style.background = 'var(--surface3)'; ev.currentTarget.style.borderColor = 'var(--border2)'; } },
                    onMouseLeave: ev => { if (tool !== t.id) { ev.currentTarget.style.background = 'var(--surface)';  ev.currentTarget.style.borderColor = 'var(--border)'; } },
                  }, t.icon)
                )
              : e(ActionBtn, { key: t.id, tooltip: t.tooltip, icon: t.icon, onClick: onInvert })
          ),

          divider,

          // Group D: Shift
          e('div', { style: { display: 'flex', gap: '1px', alignItems: 'center' } },
            e(ActionBtn, { tooltip: 'Subir (↑)',     icon: IC.arrowUp,    onClick: () => onShift('up') }),
            e(ActionBtn, { tooltip: 'Bajar (↓)',     icon: IC.arrowDown,  onClick: () => onShift('down') }),
            e(ActionBtn, { tooltip: 'Izquierda (←)', icon: IC.arrowLeft,  onClick: () => onShift('left') }),
            e(ActionBtn, { tooltip: 'Derecha (→)',   icon: IC.arrowRight, onClick: () => onShift('right') }),
          ),

          divider,

          // Group E: Glyph management
          e(ActionBtn, { tooltip: 'Copiar glifo (Ctrl+C)', icon: IC.copy,  onClick: onCopyGlyph }),
          e(ActionBtn, {
            tooltip:  clipboard ? 'Pegar glifo (Ctrl+V)' : 'Portapapeles vacío',
            icon:     IC.paste,
            onClick:  onPaste,
            disabled: !clipboard,
          }),
          e(Tooltip, { label: 'Eliminar glifo (Delete)', placement: 'bottom' },
            e('button', {
              onClick: onClearCanvas,
              style: { ...toolbarBase, background: 'rgba(191,69,69,0.07)', border: '1px solid rgba(191,69,69,0.22)', color: ACCENT, cursor: 'pointer' },
              onMouseEnter: ev => { ev.currentTarget.style.background = 'rgba(191,69,69,0.16)'; ev.currentTarget.style.borderColor = 'rgba(191,69,69,0.45)'; },
              onMouseLeave: ev => { ev.currentTarget.style.background = 'rgba(191,69,69,0.07)'; ev.currentTarget.style.borderColor = 'rgba(191,69,69,0.22)'; },
            }, IC.trash)
          )
        ),

        // Pixel canvas
        e('div', { style: { position: 'relative', width: `${CANVAS_BASE}px`, height: `${CANVAS_BASE}px` } },
          e('div', {
            style: { display: 'grid', gridTemplateColumns: `repeat(${gridSize}, 1fr)`, width: '100%', height: '100%', gap: '1px', background: 'var(--grid-line)', borderRadius: R_CARD, overflow: 'hidden', border: `2px solid var(--border-accent)`, cursor: 'crosshair', userSelect: 'none', boxShadow: `var(--shadow-card), 0 0 0 1px ${ACCENT}10` },
            onMouseUp: onMouseUp, onMouseLeave: onMouseUp
          },
            grid.map((active, i) =>
              e('div', { key: i, onMouseDown: ev => { ev.preventDefault(); onPixelDown(i, active, ev.button === 2); }, onMouseEnter: () => onPixelEnter(i), onContextMenu: ev => ev.preventDefault(), style: { width: '100%', height: '100%', background: active ? ACCENT : 'var(--empty)', transition: 'background .03s' } })
            )
          ),
          (showSpaceMarker && currentChar === ' ') && e('div', { style: { position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 4 } },
            e('div', { style: { position: 'absolute', top: '2px', bottom: '2px', left: '50%', width: '1px', transform: 'translateX(-50%)', background: 'var(--border-accent)', opacity: .8 } })
          ),
          e(GuideOverlay, { gridSize, capGuideRow, xHeightGuideRow, baselineGuideRow, descGuideRow, centerGuideCol, showCenterGuide, showCapGuide, showXHGuide, showBaseGuide, showDescGuide })
        )
      ),

      // ── RIGHT COLUMN ─────────────────────────
      e('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', position: 'sticky', top: '68px' } },
        e('aside', { style: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: R_CARD, padding: '16px', boxShadow: 'var(--shadow-card)', display: 'flex', flexDirection: 'column', gap: '12px' } },

          // Header
          e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
            e('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
              e('span', { style: { fontFamily: FONT_MONO, fontSize: '8px', letterSpacing: '3px', color: 'var(--muted)' } }, 'CARACTERES'),
              e('span', { style: { fontFamily: FONT_MONO, fontSize: '10px', color: 'var(--muted2)' } }, `${doneGlyphs}/${allChars.length}`)
            ),
            // AddChar button + floating menu
            e('div', { ref: addCharRef, style: { position: 'relative' } },
              e('button', {
                onClick: ev => { ev.stopPropagation(); setShowAddChar(v => !v); },
                title: 'Agregar carácter especial',
                style: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', padding: '0', background: showAddChar ? `${ACCENT}15` : 'var(--surface2)', border: showAddChar ? `1px solid ${ACCENT}40` : '1px solid var(--border)', borderRadius: R_BTN, cursor: 'pointer', color: showAddChar ? ACCENT : 'var(--muted)', transition: 'all .13s' }
              }, IC.dotsV),

              showAddChar && e('div', {
                onClick: ev => ev.stopPropagation(),
                style: { position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: '280px', background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: '12px', boxShadow: '0 20px 60px rgba(0,0,0,0.32)', zIndex: 400, padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }
              },
                e('div', { style: { fontFamily: FONT_MONO, fontSize: '8px', color: 'var(--muted2)', letterSpacing: '2px' } }, 'AGREGAR CARÁCTER ESPECIAL'),
                e('div', { style: { fontFamily: FONT_MONO, fontSize: '9px', color: 'var(--muted)', lineHeight: '1.5' } }, 'Ingresa el código (U+0041, &#65;, 0x41) o el carácter directamente.'),
                e('div', { style: { display: 'flex', gap: '6px' } },
                  e('input', {
                    value: addCharInput,
                    onChange: ev => setAddCharInput(ev.target.value),
                    onKeyDown: ev => { if (ev.key === 'Enter') addToList(); },
                    placeholder: 'U+00E1, &#233;, á...',
                    style: { flex: 1, padding: '8px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: R_BTN, fontFamily: FONT_MONO, fontSize: '10px', color: 'var(--text)', outline: 'none', transition: 'border-color .15s' },
                    onFocus: ev => ev.target.style.borderColor = ACCENT,
                    onBlur:  ev => ev.target.style.borderColor = 'var(--border)'
                  }),
                  e('button', {
                    onClick: addToList,
                    style: { width: '34px', height: '34px', borderRadius: R_BTN, background: ACCENT, border: 'none', color: '#fff', fontSize: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, flexShrink: 0 }
                  }, '+')
                ),
                addCharList.length > 0 && e('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '180px', overflowY: 'auto', scrollbarWidth: 'thin' } },
                  addCharList.map(({ char, code }) =>
                    e('div', { key: char, style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: R_BTN } },
                      e('div', { style: { width: '28px', height: '28px', borderRadius: '4px', background: 'var(--surface3)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 } },
                        e('span', { style: { fontFamily: "'monospace-pixel', monospace", fontSize: '16px', color: ACCENT, lineHeight: 1 } }, char)
                      ),
                      e('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: '1px' } },
                        e('span', { style: { fontFamily: FONT_MONO, fontSize: '11px', color: 'var(--text)' } }, char),
                        e('span', { style: { fontFamily: FONT_MONO, fontSize: '8px', color: 'var(--muted2)' } }, `U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4,'0')} · ${code}`)
                      ),
                      e('button', {
                        onClick: () => removeFromList(char),
                        style: { width: '22px', height: '22px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--surface3)', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', lineHeight: 1, flexShrink: 0 }
                      }, '−')
                    )
                  )
                ),
                addCharList.length > 0 && e('button', {
                  onClick: addAllChars,
                  style: { width: '100%', padding: '9px', background: ACCENT, border: 'none', borderRadius: R_BTN, color: '#fff', fontFamily: FONT_MONO, fontWeight: '700', fontSize: '10px', letterSpacing: '1px', cursor: 'pointer', boxShadow: `0 2px 8px ${ACCENT}40` }
                }, `AGREGAR ${addCharList.length > 1 ? `TODOS (${addCharList.length})` : 'CARÁCTER'}`)
              )
            )
          ),

          // Search
          e('div', { style: { position: 'relative' } },
            e('input', { value: charSearch, onChange: ev => setCharSearch(ev.target.value), placeholder: 'Buscar carácter...', style: { width: '100%', padding: '8px 10px 8px 30px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: R_BTN, fontFamily: FONT_MONO, fontSize: '10px', color: 'var(--text)', outline: 'none', transition: 'border-color .15s' }, onFocus: ev => ev.target.style.borderColor = ACCENT, onBlur: ev => ev.target.style.borderColor = 'var(--border)' }),
            e('span', { style: { position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontFamily: FONT_MONO, fontSize: '11px', color: 'var(--muted2)', pointerEvents: 'none' } }, '⌕')
          ),

          // Filters
          e('div', { style: { display: 'flex', gap: '4px' } },
            [{ id: 'all', label: 'Todos' }, { id: 'done', label: 'Listos' }, { id: 'empty', label: 'Vacíos' }].map(({ id, label }) =>
              e('button', { key: id, onClick: () => { setCharFilter(id); setCharPage(0); }, style: { flex: 1, padding: '5px 6px', borderRadius: R_BTN, cursor: 'pointer', fontFamily: FONT_MONO, fontSize: '8px', background: charFilter === id ? ACCENT : 'var(--surface2)', color: charFilter === id ? '#fff' : 'var(--muted)', border: charFilter === id ? 'none' : '1px solid var(--border)', transition: 'all .13s' } }, label)
            )
          ),

          // Paginated char grid
          (() => {
            const PAGE_SIZE  = 30;
            const totalPages = Math.ceil(filteredChars.length / PAGE_SIZE);
            const pageChars  = filteredChars.slice(charPage * PAGE_SIZE, (charPage + 1) * PAGE_SIZE);
            return filteredChars.length === 0
              ? e('div', { style: { padding: '24px', textAlign: 'center', fontFamily: FONT_MONO, fontSize: '10px', color: 'var(--muted2)' } }, 'Sin resultados')
              : e('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
                  e('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '4px' } },
                    pageChars.map(t => {
                      const configured = fontData?.[t]?.some(Boolean);
                      const isActive   = currentChar === t;
                      const isExtra    = extraChars.includes(t);
                      return e('button', { key: t, onClick: () => onSwitchChar(t), title: t === ' ' ? 'Espacio' : t, style: { height: '40px', borderRadius: R_BTN, cursor: 'pointer', border: isActive ? 'none' : `1px solid ${configured ? `${ACCENT}30` : isExtra ? 'rgba(120,120,200,0.3)' : 'var(--border)'}`, background: isActive ? ACCENT : configured ? `${ACCENT}08` : isExtra ? 'rgba(120,120,200,0.07)' : 'var(--surface2)', color: isActive ? '#fff' : configured ? ACCENT : isExtra ? 'rgba(160,160,220,0.9)' : 'var(--muted)', fontWeight: '700', fontSize: '13px', fontFamily: FONT_MONO, position: 'relative', boxShadow: isActive ? `0 3px 10px ${ACCENT}40` : 'none', transition: 'all .1s' } },
                        t === ' ' ? '·' : t,
                        (showSpaceMarker && t === ' ') && e('div', { style: { position: 'absolute', top: '8px', bottom: '8px', left: '50%', width: '1px', transform: 'translateX(-50%)', background: isActive ? 'rgba(255,255,255,0.9)' : 'var(--border-accent)', opacity: .8 } }),
                        configured && !isActive && e('div', { style: { position: 'absolute', top: '4px', right: '4px', width: '4px', height: '4px', borderRadius: '50%', background: ACCENT } })
                      );
                    })
                  ),
                  totalPages > 1 && e('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px', marginTop: '2px' } },
                    e('button', { onClick: () => setCharPage(p => Math.max(0, p - 1)), disabled: charPage === 0, style: { width: '28px', height: '24px', borderRadius: R_BTN, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--muted)', cursor: charPage === 0 ? 'not-allowed' : 'pointer', fontFamily: FONT_MONO, fontSize: '11px', opacity: charPage === 0 ? .35 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' } }, '‹'),
                    e('span', { style: { fontFamily: FONT_MONO, fontSize: '8px', color: 'var(--muted2)', letterSpacing: '1px' } }, `${charPage + 1} / ${totalPages}`),
                    e('button', { onClick: () => setCharPage(p => Math.min(totalPages - 1, p + 1)), disabled: charPage >= totalPages - 1, style: { width: '28px', height: '24px', borderRadius: R_BTN, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--muted)', cursor: charPage >= totalPages - 1 ? 'not-allowed' : 'pointer', fontFamily: FONT_MONO, fontSize: '11px', opacity: charPage >= totalPages - 1 ? .35 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' } }, '›')
                  )
                );
          })()
        ),

        // Export button — below char panel
        e('button', {
          onClick: () => setShowExport(true),
          style: { width: '100%', padding: '10px 12px', background: 'var(--surface2)', border: `1px solid ${ACCENT}50`, borderRadius: R_BTN, color: ACCENT, fontFamily: FONT_MONO, fontWeight: '700', fontSize: '9px', letterSpacing: '2px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', transition: 'all .15s' },
          onMouseEnter: ev => { ev.currentTarget.style.background = ACCENT; ev.currentTarget.style.color = '#fff'; ev.currentTarget.style.borderColor = ACCENT; },
          onMouseLeave: ev => { ev.currentTarget.style.background = 'var(--surface2)'; ev.currentTarget.style.color = ACCENT; ev.currentTarget.style.borderColor = `${ACCENT}50`; }
        },
          IC.exportDown,
          'EXPORTAR FUENTE'
        )
      )
    ),

    // ── MODALS ────────────────────────────────
    showExport && e(ExportModal, {
      projectName, fontData, gridSize, previewText,
      userBaselineRow: baselineGuideRow,
      onClose: () => setShowExport(false),
      onExport: (filename, format, meta) => {
        try {
          const safe = (filename || projectName || 'mi-fuente').replace(/[^a-zA-Z0-9_\-\.]/g, '-').trim() || 'mi-fuente';
          // FIX: meta now includes `version` field — buildAndDownload must use
          // meta.version to populate the font's name table (nameID 5).
          buildAndDownload(fontData, gridSize, safe, format, { ...meta, baselineRow: baselineGuideRow });
          setShowExport(false);
        } catch (err) { alert(err?.message || 'No se pudo exportar.'); }
      }
    }),

    showPublish && e(PublishModal, {
      projectName, fontData, gridSize, showSpaceMarker,
      isPublishing, published: publishedOk,
      onClose: () => { setShowPublish(false); onResetPublish?.(); },
      onPublish: (prevText) => onPublish?.(prevText)
    }),

    showPrefs && e(PreferencesModal, {
      onClose: () => setShowPrefs(false),
      showSpaceMarker, setShowSpaceMarker,
      showCenterGuide, setShowCenterGuide,
      showCapGuide, setShowCapGuide,
      showXHGuide, setShowXHGuide,
      showBaseGuide, setShowBaseGuide,
      showDescGuide, setShowDescGuide,
      centerGuideCol, setCenterGuideCol,
      capGuideRow, setCapGuideRow,
      xHeightGuideRow, setXHeightGuideRow,
      baselineGuideRow, setBaselineGuideRow,
      descGuideRow, setDescGuideRow,
      gridSize,
      autosaveEnabled, setAutosaveEnabled,
      autosaveMinutes, setAutosaveMinutes
    })
  );
}
