// ─────────────────────────────────────────────
//  EDITOR — src/Editor.js  (v2.2)
//  Cambios v2.2:
//  • Quitada barra de progreso del panel izquierdo
//  • Glifos exportados a tamaño correcto: S dinámico según gridSize y unitsPerEm
//  • Defaults de ascender/descender calculados automáticamente
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
//  PIXEL PREVIEW
// ─────────────────────────────────────────────
const PixelPreview = ({ text, fontData, gridSize, pixelSize = 3, color = ACCENT, showSpaceMarker = false, letterSpacing = 0, wordSpacing = 10 }) => {
  const chars = text.split('');
  const sz = Math.min(gridSize, 32);

  const getBounds = (glyph) => {
    if (!Array.isArray(glyph)) return null;
    let minCol = sz, maxCol = -1;
    glyph.forEach((on, i) => { if (!on) return; const col = i % sz; if (col < minCol) minCol = col; if (col > maxCol) maxCol = col; });
    return maxCol < 0 ? null : { minCol, maxCol };
  };

  return e('div', { style: { display: 'flex', flexWrap: 'nowrap', overflowX: 'auto', overflowY: 'hidden', whiteSpace: 'nowrap', padding: '8px', minHeight: '28px', alignItems: 'flex-end', scrollbarWidth: 'thin' } },
    chars.map((ch, ci) => {
      const glyph = fontData[ch];
      const bounds = getBounds(glyph);
      const isSpace = ch === ' ';
      const spacingPx = isSpace ? wordSpacing * 0.22 : letterSpacing * pixelSize;
      const minSpaceWidth = Math.max(pixelSize * 2, 1);
      const computedSpaceWidth = Math.max(minSpaceWidth, pixelSize * 3 + wordSpacing * 0.2);
      const glyphCols = bounds ? (bounds.maxCol - bounds.minCol + 1) : sz;
      const glyphRows = sz;

      return e('div', {
        key: ci,
        style: {
          display: 'grid', gridTemplateColumns: `repeat(${glyphCols},${pixelSize}px)`, gridTemplateRows: `repeat(${glyphRows},${pixelSize}px)`,
          position: 'relative', width: isSpace ? `${computedSpaceWidth}px` : undefined, minWidth: isSpace ? `${minSpaceWidth}px` : undefined,
          marginRight: `${spacingPx}px`, border: (isSpace && showSpaceMarker) ? '1px dashed var(--border)' : 'none',
          borderRadius: '4px', padding: (isSpace && showSpaceMarker) ? '2px' : 0, flexShrink: 0, alignSelf: 'flex-end'
        }
      },
        Array(glyphCols * glyphRows).fill(0).map((_, pi) => {
          const row = Math.floor(pi / glyphCols); const col = pi % glyphCols;
          const sourceCol = bounds ? col + bounds.minCol : col;
          const sourceIdx = row * sz + sourceCol;
          return e('div', { key: pi, style: { width: `${pixelSize}px`, height: `${pixelSize}px`, background: glyph?.[sourceIdx] ? color : 'transparent' } });
        }),
        (isSpace && showSpaceMarker) && e('div', { style: { position: 'absolute', top: '2px', bottom: '2px', left: '50%', width: '1px', transform: 'translateX(-50%)', background: 'var(--border-accent)', opacity: .65, pointerEvents: 'none' } })
      );
    })
  );
};

// ─────────────────────────────────────────────
//  TOOLTIP
// ─────────────────────────────────────────────
const Tooltip = ({ label, children, placement = 'bottom' }) => {
  const [visible, setVisible] = useState(false);
  const pos = { bottom: { top: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' }, top: { bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' }, right: { left: 'calc(100% + 8px)', top: '50%', transform: 'translateY(-50%)' }, left: { right: 'calc(100% + 8px)', top: '50%', transform: 'translateY(-50%)' } };
  return e('div', { style: { position: 'relative', display: 'inline-flex' }, onMouseEnter: () => setVisible(true), onMouseLeave: () => setVisible(false) },
    children,
    visible && label && e('div', { style: { position: 'absolute', ...pos[placement], background: 'var(--surface3)', border: '1px solid var(--border)', borderRadius: '6px', padding: '5px 9px', whiteSpace: 'nowrap', fontFamily: FONT_MONO, fontSize: '9px', letterSpacing: '1px', color: 'var(--text)', zIndex: 999, pointerEvents: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.2)' } }, label)
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
const GuideOverlay = ({ gridSize, capGuideRow, xHeightGuideRow, baselineGuideRow, descGuideRow, centerGuideCol, showCenterGuide, showHGuides = true }) => {
  const lines = [];
  const cap      = clamp(capGuideRow      ?? 1,                           0, gridSize - 1);
  const xHeight  = clamp(xHeightGuideRow  ?? Math.round(gridSize * 0.33), 0, gridSize - 1);
  const baseline = clamp(baselineGuideRow ?? Math.round(gridSize * 0.75), 0, gridSize - 1);
  const desc     = clamp(descGuideRow     ?? gridSize - 1,                0, gridSize - 1);
  const rowPct = (row) => (row / gridSize * 100).toFixed(4);

  // Descendente zone background (solo si las guías h están activas)
  if (showHGuides) {
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

  if (showHGuides) {
    lines.push(...guide('cap', cap, 'CAP', 0.45, '1.3'), ...guide('xh', xHeight, 'X-H', 0.40, '1.1', '3 3'), ...guide('base', baseline, 'BASE', 0.90, '1.8'), ...guide('desc', desc, 'DESC', 0.35, '1.0', '2 2'));
  }

  return e('svg', { style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 5 }, xmlns: 'http://www.w3.org/2000/svg' }, ...lines);
};

// ─────────────────────────────────────────────
//  EXPORT MODAL
// ─────────────────────────────────────────────
const ExportModal = ({ projectName, fontData, gridSize, previewText: extText, onClose, onExport }) => {
  const [filename, setFilename] = useState(projectName || 'mi-fuente');
  const [fontName, setFontName] = useState(projectName || 'mi-fuente');
  const [author, setAuthor] = useState('');
  const [format, setFormat] = useState('otf');
  const [letterSpacing, setLetterSpacing] = useState(1);
  const [wordSpacing, setWordSpacing] = useState(10);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [unitsPerEm, setUnitsPerEm] = useState(1000);

  // S dinámico = mismo cálculo que canvas.js — glifos llenan ~80% del em
  const S = Math.round((unitsPerEm * 0.80) / gridSize);
  const baselineRow = getBaselineRow(gridSize);
  // ascender: desde baseline hasta arriba del grid, en unidades opentype
  const defaultAscender = Math.round(baselineRow * S);
  // descender: filas debajo de baseline (negativo)
  const defaultDescender = -Math.round((gridSize - baselineRow) * S);

  const [ascender,  setAscender]  = useState(defaultAscender);
  const [descender, setDescender] = useState(defaultDescender);

  const inputStyle = { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: R_BTN, padding: '10px 13px', color: 'var(--text)', fontSize: '13px', outline: 'none', fontFamily: FONT_MONO, width: '100%', transition: 'border-color .15s' };
  const sliderStyle = { width: '100%', accentColor: ACCENT, cursor: 'pointer' };
  const Field = ({ label, children }) => e('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } }, e('label', { style: { fontFamily: FONT_MONO, fontSize: '8px', letterSpacing: '2px', color: 'var(--muted)' } }, label), children);

  return e(Overlay, { onClose },
    e('div', { style: { background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: R_CARD, padding: '28px', width: '540px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 32px 80px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', gap: '18px' } },
      e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        e('h3', { style: { fontFamily: FONT_PIXEL, fontSize: '10px', color: ACCENT, letterSpacing: '2px', margin: 0 } }, 'EXPORTAR FUENTE'),
        e('button', { onClick: onClose, style: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '20px', lineHeight: 1, padding: '0 4px' } }, '×')
      ),
      e('div', { style: { background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: R_BTN, padding: '14px', minHeight: '100px' } },
        e('div', { style: { fontFamily: FONT_MONO, fontSize: '8px', color: 'var(--muted2)', letterSpacing: '2px', marginBottom: '10px' } }, 'PREVIEW'),
        e(PixelPreview, { text: extText || 'Lorem ipsum', fontData, gridSize, pixelSize: 5, color: ACCENT, letterSpacing, wordSpacing })
      ),
      e(Field, { label: 'NOMBRE DEL ARCHIVO' }, e('input', { value: filename, onChange: ev => setFilename(ev.target.value), style: inputStyle, onFocus: ev => ev.target.style.borderColor = ACCENT, onBlur: ev => ev.target.style.borderColor = 'var(--border)' })),
      e(Field, { label: 'NOMBRE DE LA FAMILIA' }, e('input', { value: fontName, onChange: ev => setFontName(ev.target.value), style: inputStyle, onFocus: ev => ev.target.style.borderColor = ACCENT, onBlur: ev => ev.target.style.borderColor = 'var(--border)' })),
      e(Field, { label: 'AUTOR' }, e('input', { value: author, placeholder: 'Tu nombre o seudónimo', onChange: ev => setAuthor(ev.target.value), style: inputStyle, onFocus: ev => ev.target.style.borderColor = ACCENT, onBlur: ev => ev.target.style.borderColor = 'var(--border)' })),
      e(Field, { label: 'LETTER SPACING (px canvas)' },
        e('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
          e('div', { style: { display: 'flex', justifyContent: 'space-between' } }, e('span', { style: { fontFamily: FONT_MONO, fontSize: '9px', color: 'var(--muted2)' } }, '1px ≈ 10 unidades'), e('span', { style: { fontFamily: FONT_MONO, fontSize: '12px', color: ACCENT } }, `${letterSpacing} px`)),
          e('input', { type: 'range', min: -5, max: 20, value: letterSpacing, onChange: ev => setLetterSpacing(Number(ev.target.value)), style: sliderStyle })
        )
      ),
      e(Field, { label: 'WORD SPACING' },
        e('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
          e('div', { style: { display: 'flex', justifyContent: 'space-between' } }, e('span', { style: { fontFamily: FONT_MONO, fontSize: '9px', color: 'var(--muted2)' } }, 'Ancho del espacio'), e('span', { style: { fontFamily: FONT_MONO, fontSize: '12px', color: ACCENT } }, wordSpacing)),
          e('input', { type: 'range', min: -30, max: 80, value: wordSpacing, onChange: ev => setWordSpacing(Number(ev.target.value)), style: sliderStyle })
        )
      ),
      e('div', null,
        e('button', { onClick: () => setShowAdvanced(v => !v), style: { display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT_MONO, fontSize: '9px', letterSpacing: '2px', color: 'var(--muted)', padding: '4px 0' } },
          e('span', { style: { transition: 'transform .2s', transform: showAdvanced ? 'rotate(90deg)' : 'none', display: 'inline-block' } }, '▶'), 'OPCIONES AVANZADAS'
        ),
        showAdvanced && e('div', { style: { marginTop: '12px', padding: '16px', background: 'var(--surface2)', borderRadius: R_BTN, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '12px' } },
          e('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' } },
            [['UNITS PER EM', unitsPerEm, setUnitsPerEm, 500, 4000], ['ASCENDENTE', ascender, setAscender, -200, 2000], ['DESCENDENTE', descender, setDescender, -800, 200]].map(([lbl, val, setter, min, max]) =>
              e('div', { key: lbl, style: { display: 'flex', flexDirection: 'column', gap: '5px' } },
                e('label', { style: { fontFamily: FONT_MONO, fontSize: '8px', color: 'var(--muted)', letterSpacing: '1px' } }, lbl),
                e('input', { type: 'number', value: val, min, max, onChange: ev => setter(Number(ev.target.value)), style: { ...inputStyle, fontSize: '12px', padding: '8px 10px' }, onFocus: ev => ev.target.style.borderColor = ACCENT, onBlur: ev => ev.target.style.borderColor = 'var(--border)' })
              )
            )
          ),
          e('p', { style: { fontFamily: FONT_MONO, fontSize: '9px', color: 'var(--muted2)', lineHeight: '1.6', margin: 0 } }, `Grid ${gridSize}×${gridSize}px · ${S} unidades/px · Baseline fila ${getBaselineRow(gridSize)}.`)
        )
      ),
      e('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
        e('label', { style: { fontFamily: FONT_MONO, fontSize: '8px', letterSpacing: '2px', color: 'var(--muted)' } }, 'FORMATO'),
        e('div', { style: { display: 'flex', gap: '8px' } },
          ['otf', 'ttf', 'woff'].map(f => e('button', { key: f, onClick: () => setFormat(f), style: { flex: 1, padding: '10px', borderRadius: R_BTN, cursor: 'pointer', fontFamily: FONT_MONO, fontWeight: '700', fontSize: '11px', letterSpacing: '1px', textTransform: 'uppercase', transition: 'all .13s', background: format === f ? ACCENT : 'var(--surface2)', color: format === f ? '#fff' : 'var(--muted)', border: format === f ? 'none' : '1px solid var(--border)' } }, f))
        )
      ),
      e('div', { style: { display: 'flex', gap: '10px', paddingTop: '4px' } },
        e('button', { onClick: onClose, style: { flex: 1, padding: '12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: R_BTN, color: 'var(--muted)', fontSize: '11px', fontFamily: FONT_MONO, cursor: 'pointer' } }, 'CANCELAR'),
        e('button', { onClick: () => onExport(filename, format, { fontName, author, letterSpacing, wordSpacing, unitsPerEm, ascender, descender }), style: { flex: 2, padding: '12px', background: ACCENT, borderRadius: R_BTN, color: '#fff', fontWeight: '700', fontSize: '11px', fontFamily: FONT_MONO, border: 'none', cursor: 'pointer' } }, '⬇ EXPORTAR FUENTE')
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
        e(PixelPreview, { text: previewText, fontData, gridSize, pixelSize: 4, color: ACCENT, showSpaceMarker })
      ),
      e('div', { style: { display: 'flex', gap: '10px' } },
        e('button', { onClick: onClose, style: { flex: 1, padding: '12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: R_BTN, color: 'var(--muted)', fontSize: '11px', fontFamily: FONT_MONO, cursor: 'pointer' } }, 'CANCELAR'),
        e('button', { onClick: () => onPublish(previewText), disabled: isPublishing, style: { flex: 2, padding: '12px', background: ACCENT, borderRadius: R_BTN, color: '#fff', fontWeight: '700', fontSize: '11px', fontFamily: FONT_MONO, border: 'none', cursor: 'pointer', opacity: isPublishing ? .6 : 1 } }, isPublishing ? 'PUBLICANDO...' : '🌐 PUBLICAR EN GALERÍA')
      )
    )
  );
};

// ─────────────────────────────────────────────
//  PREFERENCES MODAL
// ─────────────────────────────────────────────
const PreferencesModal = ({ onClose, showSpaceMarker, setShowSpaceMarker, showCenterGuide, setShowCenterGuide, showHGuides, setShowHGuides, centerGuideCol, setCenterGuideCol, capGuideRow, setCapGuideRow, xHeightGuideRow, setXHeightGuideRow, baselineGuideRow, setBaselineGuideRow, descGuideRow, setDescGuideRow, gridSize }) => {
  const [menu, setMenu] = useState('guides');

  const MenuBtn = ({ id, label }) => e('button', { onClick: () => setMenu(id), style: { width: '100%', textAlign: 'left', padding: '9px 12px', background: menu === id ? `${ACCENT}12` : 'transparent', border: menu === id ? `1px solid ${ACCENT}30` : '1px solid transparent', borderRadius: R_BTN, color: menu === id ? 'var(--text)' : 'var(--muted)', fontFamily: FONT_MONO, fontSize: '10px', letterSpacing: '1px', cursor: 'pointer', transition: 'all .13s' } }, label);

  const ToggleCard = ({ title, desc, val, setVal }) => e('button', { onClick: () => setVal(v => !v), style: { width: '100%', textAlign: 'left', background: val ? `${ACCENT}08` : 'var(--surface2)', border: val ? `1px solid ${ACCENT}30` : '1px solid var(--border)', borderRadius: R_BTN, padding: '12px 14px', cursor: 'pointer', transition: 'all .15s' } },
    e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' } },
      e('span', { style: { fontFamily: FONT_MONO, fontSize: '11px', color: 'var(--text)' } }, title),
      e('span', { style: { fontFamily: FONT_MONO, fontSize: '9px', letterSpacing: '1px', color: val ? ACCENT : 'var(--muted2)', background: val ? `${ACCENT}10` : 'var(--surface3)', padding: '2px 7px', borderRadius: '4px', border: val ? `1px solid ${ACCENT}30` : '1px solid transparent' } }, val ? 'ON' : 'OFF')
    ),
    e('div', { style: { fontFamily: FONT_MONO, fontSize: '9px', color: 'var(--muted2)', lineHeight: 1.5 } }, desc)
  );

  const SliderInput = ({ label, value, onChange, min, max }) => e('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
    e('div', { style: { display: 'flex', justifyContent: 'space-between' } },
      e('span', { style: { fontFamily: FONT_MONO, fontSize: '10px', color: 'var(--muted)' } }, label),
      e('span', { style: { fontFamily: FONT_MONO, fontSize: '10px', color: ACCENT } }, value)
    ),
    e('input', { type: 'range', min, max, value, onChange, style: { width: '100%', accentColor: ACCENT, cursor: 'pointer' } })
  );

  const previewSize = 16;
  const GuidePreview = () => {
    const pct = (row) => `${(row / Math.max(1, gridSize)) * 100}%`;
    return e('div', { style: { width: '160px', height: '160px', alignSelf: 'center', position: 'relative', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden', background: 'var(--surface2)' } },
      e('div', { style: { position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: `repeat(${previewSize}, 1fr)`, gridTemplateRows: `repeat(${previewSize}, 1fr)`, gap: '1px', background: 'var(--grid-line)' } }, Array(previewSize * previewSize).fill(0).map((_, i) => e('div', { key: i, style: { background: 'var(--empty)' } }))),
      showHGuides && e('div', { style: { position: 'absolute', left: 0, right: 0, top: pct(capGuideRow), height: '1px', background: 'rgba(191,69,69,.45)' } }),
      showHGuides && e('div', { style: { position: 'absolute', left: 0, right: 0, top: pct(xHeightGuideRow), height: '1px', background: 'rgba(191,69,69,.40)', borderTop: '1px dashed rgba(191,69,69,.4)' } }),
      showHGuides && e('div', { style: { position: 'absolute', left: 0, right: 0, top: pct(baselineGuideRow), height: '2px', background: 'rgba(191,69,69,.90)' } }),
      showHGuides && e('div', { style: { position: 'absolute', left: 0, right: 0, top: pct(descGuideRow), height: '1px', background: 'rgba(191,69,69,.35)', borderTop: '1px dashed rgba(191,69,69,.35)' } }),
      showCenterGuide && e('div', { style: { position: 'absolute', top: 0, bottom: 0, left: `${(centerGuideCol / Math.max(1, gridSize)) * 100}%`, width: '2px', background: 'rgba(191,69,69,.8)' } })
    );
  };

  const SHORTCUTS = [
    ['P', 'Herramienta Lápiz'], ['F', 'Herramienta Relleno'], ['H', 'Espejo horizontal'], ['V', 'Espejo vertical'],
    ['Ctrl+S', 'Guardar proyecto'], ['Ctrl+Z', 'Deshacer'], ['Ctrl+Y / Ctrl+Shift+Z', 'Rehacer'], ['Ctrl+I', 'Invertir glifo'],
    ['← → ↑ ↓', 'Desplazar glifo'],
    ['Delete', 'Limpiar glifo'], ['Escape', 'Cerrar modal'],
  ];

  return e(Overlay, { onClose },
    e(Modal, { style: { maxWidth: '700px', width: '700px', gap: '16px' } },
      e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        e('h3', { style: { margin: 0, fontFamily: FONT_PIXEL, fontSize: '10px', color: ACCENT, letterSpacing: '2px' } }, 'PREFERENCIAS'),
        e('button', { onClick: onClose, style: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '20px', lineHeight: 1, padding: '0 4px' } }, '×')
      ),
      e('div', { style: { display: 'grid', gridTemplateColumns: '160px 1fr', gap: '12px', minHeight: '320px' } },
        e('aside', { style: { border: '1px solid var(--border)', borderRadius: R_BTN, background: 'var(--surface2)', padding: '8px', display: 'flex', flexDirection: 'column', gap: '4px' } },
          e('div', { style: { fontFamily: FONT_MONO, fontSize: '8px', color: 'var(--muted2)', letterSpacing: '2px', padding: '4px 6px 8px' } }, 'SECCIÓN'),
          e(MenuBtn, { id: 'guides', label: 'Guías' }),
          e(MenuBtn, { id: 'view', label: 'Vista' }),
          e(MenuBtn, { id: 'shortcuts', label: 'Atajos' })
        ),
        e('section', { style: { border: '1px solid var(--border)', borderRadius: R_BTN, background: 'var(--surface)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto' } },
          menu === 'guides' && e(React.Fragment, null,
            e('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
              e(ToggleCard, { title: 'Guías horizontales', desc: 'Muestra las líneas CAP, X-Height, Baseline y Descender sobre el canvas.', val: showHGuides, setVal: setShowHGuides }),
              e(ToggleCard, { title: 'Guía vertical editable', desc: 'Muestra una línea vertical configurable para marcar el ancho del glifo.', val: showCenterGuide, setVal: setShowCenterGuide })
            ),
            e('div', { style: { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: R_BTN, padding: '14px', display: 'flex', flexDirection: 'column', gap: '14px', opacity: showHGuides ? 1 : 0.4, pointerEvents: showHGuides ? 'auto' : 'none' } },
              e('div', { style: { fontFamily: FONT_MONO, fontSize: '8px', color: 'var(--muted2)', letterSpacing: '2px', marginBottom: '2px' } }, 'LÍNEAS HORIZONTALES'),
              e(SliderInput, { label: `CAP (fila ${capGuideRow})`, value: capGuideRow, onChange: ev => setCapGuideRow(Number(ev.target.value)), min: 0, max: Math.max(0, gridSize - 1) }),
              e(SliderInput, { label: `X-Height (fila ${xHeightGuideRow})`, value: xHeightGuideRow, onChange: ev => setXHeightGuideRow(Number(ev.target.value)), min: 0, max: Math.max(0, gridSize - 1) }),
              e(SliderInput, { label: `Baseline (fila ${baselineGuideRow})`, value: baselineGuideRow, onChange: ev => setBaselineGuideRow(Number(ev.target.value)), min: 0, max: Math.max(0, gridSize - 1) }),
              e(SliderInput, { label: `Descender (fila ${descGuideRow})`, value: descGuideRow, onChange: ev => setDescGuideRow(Number(ev.target.value)), min: 0, max: Math.max(0, gridSize - 1) }),
              e('div', { style: { fontFamily: FONT_MONO, fontSize: '8px', color: 'var(--muted2)', letterSpacing: '2px', marginTop: '4px', opacity: showCenterGuide ? 1 : 0.5 } }, 'LÍNEA VERTICAL'),
              e('div', { style: { opacity: showCenterGuide ? 1 : 0.4, pointerEvents: showCenterGuide ? 'auto' : 'none' } },
                e(SliderInput, { label: `Guía vertical (col ${centerGuideCol})`, value: centerGuideCol, onChange: ev => setCenterGuideCol(Number(ev.target.value)), min: 0, max: Math.max(0, gridSize - 1) })
              )
            ),
            e(GuidePreview)
          ),
          menu === 'view' && e(React.Fragment, null,
            e('p', { style: { margin: 0, fontFamily: FONT_MONO, fontSize: '10px', color: 'var(--muted)', lineHeight: '1.6' } }, 'Ajustes visuales del editor.'),
            e(ToggleCard, { title: 'Marcador del espacio', desc: 'Muestra una referencia visual en el carácter espacio para diferenciarlo de celdas vacías.', val: showSpaceMarker, setVal: setShowSpaceMarker }),
            e(GuidePreview)
          ),
          menu === 'shortcuts' && e(React.Fragment, null,
            e('p', { style: { margin: 0, fontFamily: FONT_MONO, fontSize: '10px', color: 'var(--muted)', lineHeight: '1.6' } }, 'Atajos de teclado disponibles en el editor.'),
            e('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
              SHORTCUTS.map(([key, desc]) => e('div', { key, style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', borderRadius: R_BTN, background: 'var(--surface2)', border: '1px solid var(--border)' } },
                e('kbd', { style: { fontFamily: FONT_MONO, fontSize: '9px', color: ACCENT, background: `${ACCENT}10`, border: `1px solid ${ACCENT}25`, borderRadius: '4px', padding: '2px 6px' } }, key),
                e('span', { style: { fontFamily: FONT_MONO, fontSize: '10px', color: 'var(--muted)' } }, desc)
              ))
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
//  EDITOR PAGE  (componente principal)
// ─────────────────────────────────────────────
export function EditorPage({
  user, isDark, toggleTheme, gridSize, currentChar, fontData, grid, isSaving,
  tool, setTool, previewText, setPreviewText, onPixelDown, onPixelEnter, onMouseUp,
  onSwitchChar, onClearCanvas, onInvert, onShift, onSave, onUndo, onRedo,
  onBack, onPublish, projectName, isPublishing, publishedOk, onResetPublish
}) {
  const [showExport,      setShowExport]      = useState(false);
  const [showPublish,     setShowPublish]     = useState(false);
  const [showPrefs,       setShowPrefs]       = useState(false);
  const [openFileMenu,    setOpenFileMenu]    = useState(false);
  const [openUserMenu,    setOpenUserMenu]    = useState(false);
  const [avatarColor,     setAvatarColor]     = useState(ACCENT);
  const [charFilter,      setCharFilter]      = useState('all');
  const [charSearch,      setCharSearch]      = useState('');
  const [showSpaceMarker, setShowSpaceMarker] = useState(() => localStorage.getItem('cs-show-space-marker') !== '0');
  const [showCenterGuide, setShowCenterGuide] = useState(() => localStorage.getItem('cs-show-center-guide') !== '0');
  const [showHGuides,     setShowHGuides]     = useState(() => localStorage.getItem('cs-show-h-guides') !== '0');
  const [centerGuideCol,  setCenterGuideCol]  = useState(() => Number(localStorage.getItem('cs-center-guide-col') ?? 2));
  const [capGuideRow,     setCapGuideRow]     = useState(() => readNumberSetting(EDITOR_STORAGE_KEYS.capGuideRow, 1));
  const [xHeightGuideRow, setXHeightGuideRow] = useState(() => readNumberSetting(EDITOR_STORAGE_KEYS.xHeightGuideRow, Math.round(gridSize * 0.33)));
  const [baselineGuideRow,setBaselineGuideRow]= useState(() => readNumberSetting(EDITOR_STORAGE_KEYS.baselineGuideRow, Math.round(gridSize * 0.75)));
  const [descGuideRow,    setDescGuideRow]    = useState(() => readNumberSetting(EDITOR_STORAGE_KEYS.descGuideRow, gridSize - 1));

  const avatarInit = (user?.displayName || user?.email || '?')[0].toUpperCase();
  const CANVAS_BASE = 460;
  const canvasSize = CANVAS_BASE;

  const totalGlyphs = TECLADO.length;
  const doneGlyphs  = TECLADO.filter(c => fontData?.[c]?.some(Boolean)).length;
  const progress    = Math.round((doneGlyphs / totalGlyphs) * 100);

  // Avatar color desde Firestore
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

  // Cerrar menús
  useEffect(() => {
    const close = () => { setOpenFileMenu(false); setOpenUserMenu(false); };
    if (openFileMenu || openUserMenu) window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [openFileMenu, openUserMenu]);

  // Persistir ajustes
  useEffect(() => { writeSetting(EDITOR_STORAGE_KEYS.showSpaceMarker, showSpaceMarker ? '1' : '0'); }, [showSpaceMarker]);
  useEffect(() => { localStorage.setItem('cs-show-center-guide', showCenterGuide ? '1' : '0'); }, [showCenterGuide]);
  useEffect(() => { localStorage.setItem('cs-show-h-guides', showHGuides ? '1' : '0'); }, [showHGuides]);
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
  useEffect(() => {
    const handler = (ev) => {
      if (['INPUT', 'TEXTAREA'].includes(ev.target.tagName)) return;
      const ctrl = ev.ctrlKey || ev.metaKey;
      if (ctrl && ev.key === 's') { ev.preventDefault(); onSave(); return; }
      if (ctrl && ev.key === 'z' && !ev.shiftKey) { ev.preventDefault(); onUndo(); return; }
      if (ctrl && (ev.key === 'y' || (ev.key === 'z' && ev.shiftKey))) { ev.preventDefault(); onRedo(); return; }
      if (ctrl && ev.key === 'i') { ev.preventDefault(); onInvert(); return; }
      if (!ctrl) {
        if (ev.key === 'p') { setTool('pencil'); return; }
        if (ev.key === 'f') { setTool('fill'); return; }
        if (ev.key === 'h') { setTool('mirror-h'); return; }
        if (ev.key === 'v') { setTool('mirror-v'); return; }
        if (ev.key === 'ArrowUp')    { ev.preventDefault(); onShift('up'); return; }
        if (ev.key === 'ArrowDown')  { ev.preventDefault(); onShift('down'); return; }
        if (ev.key === 'ArrowLeft')  { ev.preventDefault(); onShift('left'); return; }
        if (ev.key === 'ArrowRight') { ev.preventDefault(); onShift('right'); return; }
        if (ev.key === 'Delete' || ev.key === 'Backspace') { onClearCanvas(); return; }
      }
      if (ev.key === 'Escape') {
        setShowExport(false); setShowPublish(false); setShowPrefs(false);
        setOpenFileMenu(false); setOpenUserMenu(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onSave, onUndo, onRedo, onInvert, onShift, onClearCanvas, setTool]);

  // Filtrado de caracteres
  const filteredChars = useMemo(() => {
    let chars = TECLADO;
    if (charSearch) { const q = charSearch.toLowerCase(); chars = chars.filter(c => c.toLowerCase().includes(q)); }
    if (charFilter === 'done')  chars = chars.filter(c => fontData?.[c]?.some(Boolean));
    if (charFilter === 'empty') chars = chars.filter(c => !fontData?.[c]?.some(Boolean));
    return chars;
  }, [charSearch, charFilter, fontData]);

  const modeTools = [
    { id: 'pencil',   iconName: 'pencil',   label: 'LÁPIZ',  tooltip: 'Lápiz (P)' },
    { id: 'fill',     iconName: 'fill',     label: 'FILL',   tooltip: 'Relleno (F)' },
    { id: 'mirror-h', iconName: 'mirror-h', label: 'ESP. H', tooltip: 'Espejo H (H)' },
    { id: 'mirror-v', iconName: 'mirror-v', label: 'ESP. V', tooltip: 'Espejo V (V)' },
  ];
  const actionTools = [
    { iconName: 'arrow-left',  tooltip: 'Deshacer (Ctrl+Z)', fn: onUndo },
    { iconName: 'arrow-right', tooltip: 'Rehacer (Ctrl+Y)', fn: onRedo },
    { iconName: 'invert',      tooltip: 'Invertir (Ctrl+I)', fn: onInvert },
    { iconName: 'arrow-up',    tooltip: 'Subir (↑)', fn: () => onShift('up') },
    { iconName: 'arrow-down',  tooltip: 'Bajar (↓)', fn: () => onShift('down') },
    { iconName: 'mirror-h',    tooltip: 'Izquierda (←)', fn: () => onShift('left') },
    { iconName: 'mirror-v',    tooltip: 'Derecha (→)', fn: () => onShift('right') },
  ];
  const toolbarBase = { padding: '7px', borderRadius: R_BTN, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px', minWidth: '34px', fontFamily: FONT_MONO, border: 'none', transition: 'all .13s' };

  // ─────────────────────────────────────────────
  //  RENDER
  // ─────────────────────────────────────────────
  return e('div', { style: { display: 'flex', flexDirection: 'column', minHeight: '100vh' } },

    // ── NAVBAR ──────────────────────────────────
    e('nav', { style: { height: '52px', padding: '0 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', background: 'var(--nav-bg)', backdropFilter: 'blur(16px)', position: 'sticky', top: 0, zIndex: 200 } },
      e('div', { style: { display: 'flex', alignItems: 'center', gap: '4px' } },
        e('span', { onClick: onBack, style: { fontFamily: FONT_PIXEL, fontSize: '11px', color: ACCENT, letterSpacing: '2px', cursor: 'pointer', padding: '6px 10px', borderRadius: R_BTN, transition: 'opacity .15s' } }, 'CODESHELF'),

        // Menú Archivo
        e('div', { style: { position: 'relative' } },
          e('button', { onClick: ev => { ev.stopPropagation(); setOpenFileMenu(v => !v); }, style: { fontFamily: FONT_MONO, fontSize: '9px', letterSpacing: '2px', color: openFileMenu ? 'var(--text)' : 'var(--muted)', padding: '6px 12px', borderRadius: R_BTN, background: openFileMenu ? 'var(--surface2)' : 'none', border: openFileMenu ? '1px solid var(--border)' : '1px solid transparent', cursor: 'pointer', transition: 'all .15s' } }, 'ARCHIVO'),
          openFileMenu && e('div', { onClick: ev => ev.stopPropagation(), style: { position: 'absolute', top: 'calc(100% + 8px)', left: 0, background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: '12px', minWidth: '230px', zIndex: 300, boxShadow: '0 20px 60px rgba(0,0,0,0.22)', overflow: 'hidden', padding: '6px' } },
            [
              { icon: 'fonts',   label: 'Mis proyectos',     kbd: '',       fn: onBack },
              { icon: 'save',    label: 'Guardar',           kbd: 'Ctrl+S', fn: onSave },
              { icon: 'theme',   label: 'Preferencias',      kbd: '',       fn: () => { setShowPrefs(true); setOpenFileMenu(false); } },
              { icon: 'export',  label: 'Exportar fuente',   kbd: '',       fn: () => { setShowExport(true); setOpenFileMenu(false); } },
              { icon: 'publish', label: 'Publicar en galería', kbd: '',     fn: () => { setShowPublish(true); setOpenFileMenu(false); } },
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

      // Derecha del navbar
      e('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
        // Estado de guardado
        isSaving && e('div', { style: { fontFamily: FONT_MONO, fontSize: '9px', letterSpacing: '1px', color: ACCENT, display: 'flex', alignItems: 'center', gap: '5px' } }, '◐ GUARDANDO'),

        // Progreso
        e(Tooltip, { label: `${doneGlyphs}/${totalGlyphs} glifos (${progress}%)`, placement: 'bottom' },
          e('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: R_BTN, padding: '5px 10px', cursor: 'default' } },
            e('div', { style: { width: '48px', height: '4px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' } },
              e('div', { style: { width: `${progress}%`, height: '100%', background: ACCENT, borderRadius: '2px', transition: 'width .3s ease' } })
            ),
            e('span', { style: { fontFamily: FONT_MONO, fontSize: '9px', color: 'var(--muted)', letterSpacing: '1px' } }, `${progress}%`)
          )
        ),

        // Espacio marcador
        e(Tooltip, { label: showSpaceMarker ? 'Ocultar marcador' : 'Marcador de espacio', placement: 'bottom' },
          e('button', { onClick: () => setShowSpaceMarker(v => !v), style: { height: '32px', padding: '0 10px', borderRadius: R_BTN, background: showSpaceMarker ? ACCENT : 'var(--surface2)', border: showSpaceMarker ? 'none' : '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: FONT_MONO, fontSize: '8px', letterSpacing: '1px', color: showSpaceMarker ? '#fff' : 'var(--muted)', transition: 'all .15s' } },
            e('span', { style: { fontSize: '12px', lineHeight: 1 } }, '␠'), 'ESPACIO'
          )
        ),

        // Tema
        e(Tooltip, { label: isDark ? 'Modo claro' : 'Modo oscuro', placement: 'bottom' },
          e('button', { onClick: toggleTheme, style: { width: '32px', height: '32px', borderRadius: '50%', background: 'var(--surface2)', border: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .15s' } },
            e('img', { src: './src/icons/theme.svg', style: { width: '14px', height: '14px', filter: 'var(--icon-filter)' } })
          )
        ),

        // Avatar + menú usuario
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

      // ── PANEL IZQUIERDO ──────────────────────
      e('aside', { style: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', position: 'sticky', top: '68px', boxShadow: 'var(--shadow-card)', display: 'flex', flexDirection: 'column', gap: '12px' } },
        e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
          e('span', { style: { fontFamily: FONT_MONO, fontSize: '8px', letterSpacing: '3px', color: 'var(--muted)' } }, 'PREVIEW'),
          e('input', { value: previewText, onChange: ev => setPreviewText(ev.target.value), placeholder: 'texto...', style: { background: 'none', border: 'none', outline: 'none', color: 'var(--muted2)', fontSize: '10px', fontFamily: FONT_MONO, textAlign: 'right', width: '100px' } })
        ),
        e('div', { style: { background: 'var(--canvas-bg)', borderRadius: '8px', padding: '6px 8px', minHeight: '40px', overflowX: 'auto', overflowY: 'hidden', border: '1px solid var(--border)' } },
          e(PixelPreview, { text: previewText || ' ', fontData, gridSize, pixelSize: 2, color: ACCENT })
        ),
        e('div', { style: { height: '1px', background: 'var(--border)' } }),
        // Stats
        e('div', { style: { display: 'flex', gap: '6px' } },
          [{ val: doneGlyphs, lbl: 'GLIFOS' }, { val: gridSize, lbl: 'GRID' }, { val: grid.filter(Boolean).length, lbl: 'PX' }].map(({ val, lbl }) =>
            e('div', { key: lbl, style: { flex: 1, textAlign: 'center', padding: '8px 4px', background: 'var(--surface2)', borderRadius: R_BTN, border: '1px solid var(--border)' } },
              e('div', { style: { fontSize: '16px', fontWeight: '700', color: ACCENT, fontFamily: FONT_MONO } }, val),
              e('div', { style: { fontSize: '7px', color: 'var(--muted)', letterSpacing: '2px', fontFamily: FONT_MONO, marginTop: '2px' } }, lbl)
            )
          )
        ),


      ),

      // ── CANVAS CENTRAL ───────────────────────
      e('section', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', background: 'var(--surface)', borderRadius: R_CARD, border: '1px solid var(--border)', padding: '20px', boxShadow: 'var(--shadow-card)' } },
        // Carácter activo
        e('div', { style: { display: 'flex', alignItems: 'center', gap: '16px', width: '100%' } },
          e('div', { style: { fontFamily: FONT_PIXEL, fontSize: '36px', lineHeight: 1, color: ACCENT, minWidth: '52px', textAlign: 'center', textShadow: `0 0 20px ${ACCENT}40` } }, currentChar === ' ' ? '·' : currentChar),
          e('div', { style: { flex: 1 } },
            e('div', { style: { fontFamily: FONT_MONO, fontSize: '9px', color: 'var(--muted)', letterSpacing: '2px', marginBottom: '4px' } }, 'EDITANDO CARÁCTER'),
            e('div', { style: { fontFamily: FONT_MONO, fontSize: '11px', color: 'var(--text)', letterSpacing: '1px' } }, `U+${(currentChar.codePointAt(0) || 0).toString(16).toUpperCase().padStart(4,'0')} · Grid ${gridSize}×${gridSize}`),
            (currentChar === ' ' && showSpaceMarker) && e('div', { style: { fontFamily: FONT_MONO, fontSize: '9px', color: 'var(--muted2)', letterSpacing: '1px', marginTop: '3px' } }, 'Marcador de espacio activo')
          ),
        ),

        // Toolbar
        e('div', { style: { display: 'flex', gap: '1px', alignItems: 'center', flexWrap: 'wrap', padding: '6px', background: 'var(--surface2)', borderRadius: R_CARD, border: '1px solid var(--border)', width: '100%' } },
          ...modeTools.map(t =>
            e(Tooltip, { key: t.id, label: t.tooltip, placement: 'bottom' },
              e('button', { onClick: () => setTool(t.id), style: { ...toolbarBase, background: tool === t.id ? ACCENT : 'transparent', color: tool === t.id ? '#fff' : 'var(--muted)', boxShadow: tool === t.id ? `0 2px 8px ${ACCENT}40` : 'none' } },
                e('img', { src: `./src/icons/${t.iconName}.svg`, style: { width: '16px', height: '16px', filter: tool === t.id ? 'invert(1)' : 'var(--icon-filter)', opacity: tool === t.id ? 1 : .65 } }),
                e('span', { style: { fontSize: '7px', letterSpacing: '0.5px' } }, t.label)
              )
            )
          ),
          e('div', { style: { width: '1px', height: '40px', background: 'var(--border)', margin: '0 3px' } }),
          ...actionTools.map((t, i) =>
            e(Tooltip, { key: i, label: t.tooltip, placement: 'bottom' },
              e('button', { onClick: t.fn, style: { ...toolbarBase, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }, onMouseEnter: ev => { ev.currentTarget.style.background = 'var(--surface3)'; ev.currentTarget.style.borderColor = 'var(--border2)'; }, onMouseLeave: ev => { ev.currentTarget.style.background = 'var(--surface)'; ev.currentTarget.style.borderColor = 'var(--border)'; } },
                e('img', { src: `./src/icons/${t.iconName}.svg`, style: { width: '16px', height: '16px', filter: 'var(--icon-filter)', opacity: .65 } })
              )
            )
          ),
          e('div', { style: { width: '1px', height: '40px', background: 'var(--border)', margin: '0 3px' } }),
          e(Tooltip, { label: 'Limpiar glifo (Delete)', placement: 'bottom' },
            e('button', { onClick: onClearCanvas, style: { ...toolbarBase, background: 'rgba(191,69,69,0.07)', border: '1px solid rgba(191,69,69,0.2)', color: ACCENT }, onMouseEnter: ev => { ev.currentTarget.style.background = 'rgba(191,69,69,0.14)'; }, onMouseLeave: ev => { ev.currentTarget.style.background = 'rgba(191,69,69,0.07)'; } },
              e('img', { src: './src/icons/delete.svg', style: { width: '16px', height: '16px', opacity: .7 } })
            )
          )
        ),

        // Canvas de píxeles
        e('div', { style: { position: 'relative', width: `${canvasSize}px`, height: `${canvasSize}px` } },
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
          e(GuideOverlay, { gridSize, capGuideRow, xHeightGuideRow, baselineGuideRow, descGuideRow, centerGuideCol, showCenterGuide, showHGuides })
        )
      ),

      // ── PANEL DERECHO: Caracteres ─────────────
      e('aside', { style: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: R_CARD, padding: '16px', position: 'sticky', top: '68px', boxShadow: 'var(--shadow-card)', display: 'flex', flexDirection: 'column', gap: '12px' } },
        e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
          e('span', { style: { fontFamily: FONT_MONO, fontSize: '8px', letterSpacing: '3px', color: 'var(--muted)' } }, 'CARACTERES'),
          e('span', { style: { fontFamily: FONT_MONO, fontSize: '10px', color: 'var(--muted2)' } }, `${doneGlyphs}/${totalGlyphs}`)
        ),

        // Búsqueda
        e('div', { style: { position: 'relative' } },
          e('input', { value: charSearch, onChange: ev => setCharSearch(ev.target.value), placeholder: 'Buscar carácter...', style: { width: '100%', padding: '8px 10px 8px 30px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: R_BTN, fontFamily: FONT_MONO, fontSize: '10px', color: 'var(--text)', outline: 'none', transition: 'border-color .15s' }, onFocus: ev => ev.target.style.borderColor = ACCENT, onBlur: ev => ev.target.style.borderColor = 'var(--border)' }),
          e('span', { style: { position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontFamily: FONT_MONO, fontSize: '11px', color: 'var(--muted2)', pointerEvents: 'none' } }, '⌕')
        ),

        // Filtros
        e('div', { style: { display: 'flex', gap: '4px' } },
          [{ id: 'all', label: 'Todos' }, { id: 'done', label: 'Listos' }, { id: 'empty', label: 'Vacíos' }].map(({ id, label }) =>
            e('button', { key: id, onClick: () => setCharFilter(id), style: { flex: 1, padding: '5px 6px', borderRadius: R_BTN, cursor: 'pointer', fontFamily: FONT_MONO, fontSize: '8px', background: charFilter === id ? ACCENT : 'var(--surface2)', color: charFilter === id ? '#fff' : 'var(--muted)', border: charFilter === id ? 'none' : '1px solid var(--border)', transition: 'all .13s' } }, label)
          )
        ),

        // Grilla de caracteres
        filteredChars.length === 0
          ? e('div', { style: { padding: '24px', textAlign: 'center', fontFamily: FONT_MONO, fontSize: '10px', color: 'var(--muted2)' } }, 'Sin resultados')
          : e('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '4px', maxHeight: '52vh', overflowY: 'auto', paddingRight: '2px', scrollbarWidth: 'thin' } },
              filteredChars.map(t => {
                const configured = fontData?.[t]?.some(Boolean);
                const isActive   = currentChar === t;
                return e('button', { key: t, onClick: () => onSwitchChar(t), title: t === ' ' ? 'Espacio' : t, style: { height: '44px', borderRadius: R_BTN, cursor: 'pointer', border: isActive ? 'none' : `1px solid ${configured ? `${ACCENT}30` : 'var(--border)'}`, background: isActive ? ACCENT : configured ? `${ACCENT}08` : 'var(--surface2)', color: isActive ? '#fff' : configured ? ACCENT : 'var(--muted)', fontWeight: '700', fontSize: '13px', fontFamily: FONT_MONO, position: 'relative', boxShadow: isActive ? `0 3px 10px ${ACCENT}40` : 'none', transition: 'all .1s' } },
                  t === ' ' ? '·' : t,
                  (showSpaceMarker && t === ' ') && e('div', { style: { position: 'absolute', top: '8px', bottom: '8px', left: '50%', width: '1px', transform: 'translateX(-50%)', background: isActive ? 'rgba(255,255,255,0.9)' : 'var(--border-accent)', opacity: .8 } }),
                  configured && !isActive && e('div', { style: { position: 'absolute', top: '4px', right: '4px', width: '4px', height: '4px', borderRadius: '50%', background: ACCENT } })
                );
              })
            )
      )
    ),

    // ── MODALES ────────────────────────────────
    showExport && e(ExportModal, {
      projectName, fontData, gridSize, previewText,
      onClose: () => setShowExport(false),
      onExport: (filename, format, meta) => {
        try {
          const safe = (filename || projectName || 'mi-fuente').trim() || 'mi-fuente';
          buildAndDownload(fontData, gridSize, safe, format, meta);
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
      showHGuides, setShowHGuides,
      centerGuideCol, setCenterGuideCol,
      capGuideRow, setCapGuideRow,
      xHeightGuideRow, setXHeightGuideRow,
      baselineGuideRow, setBaselineGuideRow,
      descGuideRow, setDescGuideRow,
      gridSize
    })
  );
}
