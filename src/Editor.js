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

// Inject pixel font for char preview in AddChar menu
if (!document.getElementById('cs-pixel-font-style')) {
  const s = document.createElement('style');
  s.id = 'cs-pixel-font-style';
  s.textContent = `@font-face { font-family: 'monospace-pixel'; src: url('./src/font/monospace.ttf') format('truetype'); }`;
  document.head.appendChild(s);
}

// ─────────────────────────────────────────────
//  PIXEL PREVIEW
// ─────────────────────────────────────────────
const PixelPreview = ({ text, fontData, gridSize, pixelSize = 3, color = ACCENT, showSpaceMarker = false, letterSpacing = 0, wordSpacing = 10, baselineRow }) => {
  const chars = text.split('');
  const sz = Math.min(gridSize, 32);
  // baseline row: use prop if provided, otherwise fall back to 75% of grid
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

  // Compute reference size from the largest drawn glyph
  const allBounds = Object.values(fontData).map(g => getBounds(g)).filter(Boolean);
  const refCols = allBounds.length > 0 ? Math.max(...allBounds.map(b => b.maxCol - b.minCol + 1)) : sz;
  // reference height = rows from top of grid to baseline (what drawn glyphs occupy above baseline)
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

      // drawn glyph: use full grid height for pixel grid (preserves baseline alignment)
      // empty glyph: use refCols × refRows (above-baseline portion only)
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
          // align drawn glyphs and empty placeholders both to baseline bottom
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
const GuideOverlay = ({ gridSize, capGuideRow, xHeightGuideRow, baselineGuideRow, descGuideRow, centerGuideCol, showCenterGuide, showCapGuide = true, showXHGuide = true, showBaseGuide = true, showDescGuide = true }) => {
  const lines = [];
  const cap      = clamp(capGuideRow      ?? 7,  0, gridSize - 1);
  const xHeight  = clamp(xHeightGuideRow  ?? 9,  0, gridSize - 1);
  const baseline = clamp(baselineGuideRow ?? 13, 0, gridSize - 1);
  const desc     = clamp(descGuideRow     ?? 15, 0, gridSize - 1);
  const rowPct = (row) => (row / gridSize * 100).toFixed(4);

  // Descendente zone background (si baseline visible)
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
//  EXPORT MODAL
// ─────────────────────────────────────────────
const ExportModal = ({ projectName, fontData, gridSize, previewText: extText, onClose, onExport, userBaselineRow }) => {
  const [filename,      setFilename]      = useState(projectName || 'mi-fuente');
  const [fontName,      setFontName]      = useState(projectName || 'mi-fuente');
  const [author,        setAuthor]        = useState('');
  const [format,        setFormat]        = useState('otf');
  const [letterSpacing, setLetterSpacing] = useState(0);
  const [wordSpacing,   setWordSpacing]   = useState(6);
  const [showAdvanced,  setShowAdvanced]  = useState(false);
  const [unitsPerEm,    setUnitsPerEm]    = useState(1000);
  const [lineGap,       setLineGap]       = useState(0);
  const [license,       setLicense]       = useState('');

  // Usa la baseline configurada por el usuario (o el default del grid)
  const baselineRow = userBaselineRow != null ? userBaselineRow : getBaselineRow(gridSize);

  // S = unitsPerEm / gridSize → 1 píxel = S unidades
  const S = Math.round(unitsPerEm / gridSize);
  // ascender: filas desde arriba hasta baseline × S
  const defaultAscender  =  Math.round(baselineRow * S);
  // descender: filas debajo de baseline (negativo)
  const defaultDescender = -Math.round((gridSize - baselineRow) * S);

  const [ascender,  setAscender]  = useState(defaultAscender);
  const [descender, setDescender] = useState(defaultDescender);

  const inputStyle = { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: R_BTN, padding: '9px 12px', color: 'var(--text)', fontSize: '12px', outline: 'none', fontFamily: FONT_MONO, width: '100%', transition: 'border-color .15s', boxSizing: 'border-box' };
  const sliderStyle = { width: '100%', accentColor: ACCENT, cursor: 'pointer' };
  const Field = ({ label, hint, children }) => e('div', { style: { display: 'flex', flexDirection: 'column', gap: '5px' } },
    e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } },
      e('label', { style: { fontFamily: FONT_MONO, fontSize: '8px', letterSpacing: '2px', color: 'var(--muted)' } }, label),
      hint && e('span', { style: { fontFamily: FONT_MONO, fontSize: '8px', color: 'var(--muted2)' } }, hint)
    ),
    children
  );

  return e(Overlay, { onClose },
    e('div', { style: { background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: R_CARD, padding: '26px', width: '560px', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 32px 80px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', gap: '16px' } },

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

      // Nombres
      e('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' } },
        e(Field, { label: 'NOMBRE DEL ARCHIVO' }, e('input', { value: filename, onChange: ev => setFilename(ev.target.value), style: inputStyle, onFocus: ev => ev.target.style.borderColor = ACCENT, onBlur: ev => ev.target.style.borderColor = 'var(--border)' })),
        e(Field, { label: 'FAMILIA DE LA FUENTE' }, e('input', { value: fontName, onChange: ev => setFontName(ev.target.value), style: inputStyle, onFocus: ev => ev.target.style.borderColor = ACCENT, onBlur: ev => ev.target.style.borderColor = 'var(--border)' }))
      ),
      e(Field, { label: 'AUTOR / DISEÑADOR' }, e('input', { value: author, placeholder: 'Nombre o seudónimo', onChange: ev => setAuthor(ev.target.value), style: inputStyle, onFocus: ev => ev.target.style.borderColor = ACCENT, onBlur: ev => ev.target.style.borderColor = 'var(--border)' })),
      e(Field, { label: 'LICENCIA', hint: 'Opcional' }, e('input', { value: license, placeholder: 'MIT, OFL, Propietaria...', onChange: ev => setLicense(ev.target.value), style: inputStyle, onFocus: ev => ev.target.style.borderColor = ACCENT, onBlur: ev => ev.target.style.borderColor = 'var(--border)' })),

      // Espaciado
      e('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' } },
        e(Field, { label: 'LETTER SPACING', hint: `${letterSpacing} px` },
          e('input', { type: 'range', min: -5, max: 20, value: letterSpacing, onChange: ev => setLetterSpacing(Number(ev.target.value)), style: sliderStyle })
        ),
        e(Field, { label: 'WORD SPACING', hint: `${wordSpacing}` },
          e('input', { type: 'range', min: 1, max: 30, value: wordSpacing, onChange: ev => setWordSpacing(Number(ev.target.value)), style: sliderStyle })
        )
      ),

      // Formato
      e('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
        e('label', { style: { fontFamily: FONT_MONO, fontSize: '8px', letterSpacing: '2px', color: 'var(--muted)' } }, 'FORMATO'),
        e('div', { style: { display: 'flex', gap: '8px' } },
          [
            { f: 'otf', desc: 'PostScript, máx. calidad' },
            { f: 'ttf', desc: 'TrueType, compatible' },
            { f: 'woff', desc: 'Web optimizado' }
          ].map(({ f, desc }) =>
            e('button', { key: f, onClick: () => setFormat(f), style: { flex: 1, padding: '10px 6px', borderRadius: R_BTN, cursor: 'pointer', fontFamily: FONT_MONO, fontWeight: '700', fontSize: '11px', letterSpacing: '1px', textTransform: 'uppercase', transition: 'all .13s', background: format === f ? ACCENT : 'var(--surface3)', color: format === f ? '#fff' : 'var(--muted)', border: format === f ? `1px solid ${ACCENT}` : '1px solid var(--border)', boxShadow: format === f ? `0 2px 8px ${ACCENT}40` : 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' } },
              e('span', null, f),
              e('span', { style: { fontSize: '7px', fontWeight: '400', opacity: .7, letterSpacing: '0' } }, desc)
            )
          )
        )
      ),

      // Opciones avanzadas
      e('div', null,
        e('button', { onClick: () => setShowAdvanced(v => !v), style: { display: 'flex', alignItems: 'center', gap: '7px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT_MONO, fontSize: '9px', letterSpacing: '2px', color: 'var(--muted)', padding: '4px 0' } },
          e('span', { style: { transition: 'transform .2s', transform: showAdvanced ? 'rotate(90deg)' : 'none', display: 'inline-block', fontSize: '8px' } }, '▶'),
          'PARÁMETROS AVANZADOS'
        ),
        showAdvanced && e('div', { style: { marginTop: '10px', padding: '14px', background: 'var(--surface2)', borderRadius: R_BTN, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '12px' } },
          e('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px' } },
            [
              ['UNITS PER EM', unitsPerEm, setUnitsPerEm, 500, 4000],
              ['ASCENDER',     ascender,   setAscender,  -200, 2000],
              ['DESCENDER',    descender,  setDescender, -800,  200],
              ['LINE GAP',     lineGap,    setLineGap,      0,  500]
            ].map(([lbl, val, setter, min, max]) =>
              e('div', { key: lbl, style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
                e('label', { style: { fontFamily: FONT_MONO, fontSize: '7px', color: 'var(--muted)', letterSpacing: '1px' } }, lbl),
                e('input', { type: 'number', value: val, min, max, onChange: ev => setter(Number(ev.target.value)), style: { ...inputStyle, fontSize: '11px', padding: '6px 8px' }, onFocus: ev => ev.target.style.borderColor = ACCENT, onBlur: ev => ev.target.style.borderColor = 'var(--border)' })
              )
            )
          ),
          e('p', { style: { fontFamily: FONT_MONO, fontSize: '9px', color: 'var(--muted2)', lineHeight: '1.6', margin: 0 } },
            `Baseline en fila ${baselineRow} → ascender ${defaultAscender} u, descender ${defaultDescender} u. Modificar sólo si sabes lo que haces.`)
        )
      ),

      // Botones acción
      e('div', { style: { display: 'flex', gap: '10px', paddingTop: '4px' } },
        e('button', { onClick: onClose, style: { flex: 1, padding: '12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: R_BTN, color: 'var(--muted)', fontSize: '11px', fontFamily: FONT_MONO, cursor: 'pointer' } }, 'CANCELAR'),
        e('button', { onClick: () => onExport(filename, format, { fontName, author, license, letterSpacing, wordSpacing, lineGap, unitsPerEm, ascender, descender }), style: { flex: 2, padding: '12px', background: ACCENT, borderRadius: R_BTN, color: '#fff', fontWeight: '700', fontSize: '11px', fontFamily: FONT_MONO, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' } },
          e('svg', { width: '13', height: '13', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2.5', strokeLinecap: 'round', strokeLinejoin: 'round' },
            e('path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }),
            e('polyline', { points: '7 10 12 15 17 10' }),
            e('line', { x1: '12', y1: '15', x2: '12', y2: '3' })
          ),
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

// ─────────────────────────────────────────────
//  PREFERENCES MODAL
// ─────────────────────────────────────────────
const PreferencesModal = ({ onClose, showSpaceMarker, setShowSpaceMarker, showCenterGuide, setShowCenterGuide, showCapGuide, setShowCapGuide, showXHGuide, setShowXHGuide, showBaseGuide, setShowBaseGuide, showDescGuide, setShowDescGuide, centerGuideCol, setCenterGuideCol, capGuideRow, setCapGuideRow, xHeightGuideRow, setXHeightGuideRow, baselineGuideRow, setBaselineGuideRow, descGuideRow, setDescGuideRow, gridSize, autosaveEnabled, setAutosaveEnabled, autosaveMinutes, setAutosaveMinutes }) => {
  const [menu, setMenu] = useState('guides');

  const MenuBtn = ({ id, label }) => e('button', { onClick: () => setMenu(id), style: { width: '100%', textAlign: 'left', padding: '9px 12px', background: menu === id ? `${ACCENT}12` : 'transparent', border: menu === id ? `1px solid ${ACCENT}30` : '1px solid transparent', borderRadius: R_BTN, color: menu === id ? 'var(--text)' : 'var(--muted)', fontFamily: FONT_MONO, fontSize: '10px', letterSpacing: '1px', cursor: 'pointer', transition: 'all .13s' } }, label);

  const ToggleCard = ({ title, desc, val, setVal }) => e('button', { onClick: () => setVal(v => !v), style: { width: '100%', textAlign: 'left', background: val ? `${ACCENT}08` : 'var(--surface2)', border: val ? `1px solid ${ACCENT}30` : '1px solid var(--border)', borderRadius: R_BTN, padding: '12px 14px', cursor: 'pointer', transition: 'all .15s' } },
    e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' } },
      e('span', { style: { fontFamily: FONT_MONO, fontSize: '11px', color: 'var(--text)' } }, title),
      e('span', { style: { fontFamily: FONT_MONO, fontSize: '9px', letterSpacing: '1px', color: val ? ACCENT : 'var(--muted2)', background: val ? `${ACCENT}10` : 'var(--surface3)', padding: '2px 7px', borderRadius: '4px', border: val ? `1px solid ${ACCENT}30` : '1px solid transparent' } }, val ? 'ON' : 'OFF')
    ),
    e('div', { style: { fontFamily: FONT_MONO, fontSize: '9px', color: 'var(--muted2)', lineHeight: 1.5 } }, desc)
  );

  // Pequeño toggle inline ON/OFF al lado de un slider
  const MiniToggle = ({ val, setVal }) => e('button', {
    onClick: ev => { ev.preventDefault(); ev.stopPropagation(); setVal(v => !v); },
    style: { flexShrink: 0, padding: '2px 8px', borderRadius: '4px', border: val ? `1px solid ${ACCENT}40` : '1px solid var(--border)', background: val ? `${ACCENT}15` : 'var(--surface3)', color: val ? ACCENT : 'var(--muted2)', fontFamily: FONT_MONO, fontSize: '8px', letterSpacing: '1px', cursor: 'pointer', transition: 'all .13s', lineHeight: '16px' }
  }, val ? 'ON' : 'OFF');

  const GuideRow = ({ label, value, onChange, min, max, showVal, setShowVal }) =>
    e('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
      e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' } },
        e('span', { style: { fontFamily: FONT_MONO, fontSize: '10px', color: showVal ? 'var(--text)' : 'var(--muted2)', flex: 1, transition: 'color .15s' } }, label),
        e('span', { style: { fontFamily: FONT_MONO, fontSize: '10px', color: showVal ? ACCENT : 'var(--muted2)', minWidth: '16px', textAlign: 'right' } }, value),
        e(MiniToggle, { val: showVal, setVal: setShowVal })
      ),
      e('input', { type: 'range', min, max, value, onChange, style: { width: '100%', accentColor: ACCENT, cursor: 'pointer', opacity: showVal ? 1 : 0.35, transition: 'opacity .15s' } })
    );

  const previewSize = 16;
  const GuidePreview = () => {
    const pct = (row) => `${(row / Math.max(1, gridSize)) * 100}%`;
    return e('div', { style: { width: '160px', height: '160px', alignSelf: 'center', position: 'relative', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden', background: 'var(--surface2)' } },
      e('div', { style: { position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: `repeat(${previewSize}, 1fr)`, gridTemplateRows: `repeat(${previewSize}, 1fr)`, gap: '1px', background: 'var(--grid-line)' } }, Array(previewSize * previewSize).fill(0).map((_, i) => e('div', { key: i, style: { background: 'var(--empty)' } }))),
      showCapGuide  && e('div', { style: { position: 'absolute', left: 0, right: 0, top: pct(capGuideRow),      height: '1px', background: 'rgba(191,69,69,.45)' } }),
      showXHGuide   && e('div', { style: { position: 'absolute', left: 0, right: 0, top: pct(xHeightGuideRow), height: '1px', background: 'rgba(191,69,69,.40)', borderTop: '1px dashed rgba(191,69,69,.4)' } }),
      showBaseGuide && e('div', { style: { position: 'absolute', left: 0, right: 0, top: pct(baselineGuideRow),height: '2px', background: 'rgba(191,69,69,.90)' } }),
      showDescGuide && e('div', { style: { position: 'absolute', left: 0, right: 0, top: pct(descGuideRow),    height: '1px', background: 'rgba(191,69,69,.35)', borderTop: '1px dashed rgba(191,69,69,.35)' } }),
      showCenterGuide && e('div', { style: { position: 'absolute', top: 0, bottom: 0, left: `${(centerGuideCol / Math.max(1, gridSize)) * 100}%`, width: '2px', background: 'rgba(191,69,69,.8)' } })
    );
  };

  const SliderInput = ({ label, value, onChange, min, max }) => e('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
    e('div', { style: { display: 'flex', justifyContent: 'space-between' } },
      e('span', { style: { fontFamily: FONT_MONO, fontSize: '10px', color: 'var(--muted)' } }, label),
      e('span', { style: { fontFamily: FONT_MONO, fontSize: '10px', color: ACCENT } }, value)
    ),
    e('input', { type: 'range', min, max, value, onChange, style: { width: '100%', accentColor: ACCENT, cursor: 'pointer' } })
  );

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
          e(MenuBtn, { id: 'guardado', label: 'Guardado' }),
          e(MenuBtn, { id: 'shortcuts', label: 'Atajos' })
        ),
        e('section', { style: { border: '1px solid var(--border)', borderRadius: R_BTN, background: 'var(--surface)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto' } },
          menu === 'guides' && e(React.Fragment, null,
            e('div', { style: { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: R_BTN, padding: '14px', display: 'flex', flexDirection: 'column', gap: '14px' } },
              e('div', { style: { fontFamily: FONT_MONO, fontSize: '8px', color: 'var(--muted2)', letterSpacing: '2px', marginBottom: '2px' } }, 'LÍNEAS HORIZONTALES'),
              e(GuideRow, { label: `CAP (fila ${capGuideRow})`,       value: capGuideRow,      onChange: ev => setCapGuideRow(Number(ev.target.value)),      min: 0, max: Math.max(0, gridSize - 1), showVal: showCapGuide,  setShowVal: setShowCapGuide }),
              e(GuideRow, { label: `X-Height (fila ${xHeightGuideRow})`, value: xHeightGuideRow, onChange: ev => setXHeightGuideRow(Number(ev.target.value)), min: 0, max: Math.max(0, gridSize - 1), showVal: showXHGuide,   setShowVal: setShowXHGuide }),
              e(GuideRow, { label: `Baseline (fila ${baselineGuideRow})`, value: baselineGuideRow, onChange: ev => setBaselineGuideRow(Number(ev.target.value)), min: 0, max: Math.max(0, gridSize - 1), showVal: showBaseGuide, setShowVal: setShowBaseGuide }),
              e(GuideRow, { label: `Descender (fila ${descGuideRow})`, value: descGuideRow,    onChange: ev => setDescGuideRow(Number(ev.target.value)),    min: 0, max: Math.max(0, gridSize - 1), showVal: showDescGuide, setShowVal: setShowDescGuide }),
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
                e('button', { onClick: () => setAutosaveEnabled(v => !v), style: { flexShrink: 0, padding: '3px 10px', borderRadius: '4px', border: autosaveEnabled ? `1px solid ${ACCENT}40` : '1px solid var(--border)', background: autosaveEnabled ? ACCENT : 'var(--surface3)', color: autosaveEnabled ? '#fff' : 'var(--muted2)', fontFamily: FONT_MONO, fontSize: '8px', letterSpacing: '1px', cursor: 'pointer', transition: 'all .13s' } }, autosaveEnabled ? 'ON' : 'OFF')
              ),
              autosaveEnabled && e('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
                e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                  e('span', { style: { fontFamily: FONT_MONO, fontSize: '10px', color: 'var(--muted)' } }, 'Intervalo'),
                  e('span', { style: { fontFamily: FONT_MONO, fontSize: '12px', color: ACCENT, fontWeight: '700' } }, `${autosaveMinutes} min`)
                ),
                e('input', { type: 'range', min: 1, max: 30, value: autosaveMinutes, onChange: ev => setAutosaveMinutes(Number(ev.target.value)), style: { width: '100%', accentColor: ACCENT, cursor: 'pointer' } }),
                e('div', { style: { display: 'flex', gap: '4px' } },
                  [1, 2, 5, 10, 15, 30].map(n =>
                    e('button', { key: n, onClick: () => setAutosaveMinutes(n), style: { flex: 1, padding: '5px 0', borderRadius: '4px', border: autosaveMinutes === n ? `1px solid ${ACCENT}` : '1px solid var(--border)', background: autosaveMinutes === n ? ACCENT : 'var(--surface3)', color: autosaveMinutes === n ? '#fff' : 'var(--muted)', fontFamily: FONT_MONO, fontSize: '9px', cursor: 'pointer', transition: 'all .12s' } }, n)
                  )
                )
              )
            ),
            e('div', { style: { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: R_BTN, padding: '12px 14px' } },
              e('div', { style: { fontFamily: FONT_MONO, fontSize: '10px', color: 'var(--text)', marginBottom: '4px' } }, 'Guardado manual'),
              e('div', { style: { fontFamily: FONT_MONO, fontSize: '9px', color: 'var(--muted2)', lineHeight: 1.5 } }, 'Usa Ctrl+S en cualquier momento para guardar el proyecto en Firebase inmediatamente. El guardado sólo ocurre al usar este atajo o al activar el guardado automático — no se guarda al dibujar.')
            )
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
  onBack, onPublish, projectName, isPublishing, publishedOk, onResetPublish,
  onSaveExtraChars, initialExtraChars
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
  useEffect(() => { localStorage.setItem('cs-show-cap-guide',  showCapGuide  ? '1' : '0'); }, [showCapGuide]);
  useEffect(() => { localStorage.setItem('cs-show-xh-guide',   showXHGuide   ? '1' : '0'); }, [showXHGuide]);
  useEffect(() => { localStorage.setItem('cs-show-base-guide', showBaseGuide ? '1' : '0'); }, [showBaseGuide]);
  useEffect(() => { localStorage.setItem('cs-show-desc-guide', showDescGuide ? '1' : '0'); }, [showDescGuide]);
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

  // Persist autosave UI prefs in localStorage (are editor preferences, not project data)
  useEffect(() => { localStorage.setItem('cs-autosave-enabled', autosaveEnabled ? '1' : '0'); }, [autosaveEnabled]);
  useEffect(() => { localStorage.setItem('cs-autosave-minutes', String(autosaveMinutes)); }, [autosaveMinutes]);

  // Persist extra chars — guardado en Firebase mediante onSaveExtraChars prop
  useEffect(() => {
    if (!autosaveEnabled) return;
    const id = setInterval(() => { onSave(); }, autosaveMinutes * 60 * 1000);
    return () => clearInterval(id);
  }, [autosaveEnabled, autosaveMinutes, onSave]);

  // All chars for panel = TECLADO + extraChars (must be before filteredChars)
  const allChars = useMemo(() => [...TECLADO, ...extraChars.filter(c => !TECLADO.includes(c))], [extraChars]);

  // Filtrado de caracteres
  const filteredChars = useMemo(() => {
    let chars = allChars;
    if (charSearch) { const q = charSearch.toLowerCase(); chars = chars.filter(c => c.toLowerCase().includes(q)); }
    if (charFilter === 'done')  chars = chars.filter(c => fontData?.[c]?.some(Boolean));
    if (charFilter === 'empty') chars = chars.filter(c => !fontData?.[c]?.some(Boolean));
    return chars;
  }, [charSearch, charFilter, fontData, allChars]);

  // Reset page when filter/search changes
  useEffect(() => { setCharPage(0); }, [charSearch, charFilter]);

  // Close addChar menu on outside click
  useEffect(() => {
    if (!showAddChar) return;
    const close = (ev) => { if (addCharRef.current && !addCharRef.current.contains(ev.target)) setShowAddChar(false); };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [showAddChar]);

  // Helper: parse char from code (e.g. U+0041, &#65;, 0x41, or direct char)
  const parseCharCode = (raw) => {
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
  };

  const addToList = () => {
    const ch = parseCharCode(addCharInput);
    if (!ch) return;
    if (addCharList.find(item => item.char === ch)) return;
    setAddCharList(prev => [...prev, { char: ch, code: addCharInput.trim() }]);
    setAddCharInput('');
  };

  const removeFromList = (ch) => setAddCharList(prev => prev.filter(item => item.char !== ch));

  const addAllChars = () => {
    const toAdd = addCharList.map(item => item.char).filter(ch => !extraChars.includes(ch));
    if (toAdd.length === 0) return;
    const next = [...extraChars, ...toAdd];
    setExtraChars(next);
    onSaveExtraChars?.(next);   // persiste en Firebase a través del padre
    setAddCharList([]);
    setShowAddChar(false);
    if (toAdd[0]) onSwitchChar(toAdd[0]);
  };

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
  const toolbarBase = { padding: '7px', borderRadius: R_BTN, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px', minWidth: '34px', fontFamily: FONT_MONO, border: '1px solid var(--border)', transition: 'all .13s' };

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
          e(PixelPreview, { text: previewText || ' ', fontData, gridSize, pixelSize: 2, color: ACCENT, letterSpacing: 1, baselineRow: baselineGuideRow })
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
              e('button', { onClick: () => setTool(t.id), style: { ...toolbarBase, background: tool === t.id ? ACCENT : 'var(--surface)', color: tool === t.id ? '#fff' : 'var(--muted)', boxShadow: tool === t.id ? `0 2px 8px ${ACCENT}40` : 'none', borderColor: tool === t.id ? ACCENT : 'var(--border)' } },
                e('img', { src: `./src/icons/${t.iconName}.svg`, style: { width: '16px', height: '16px', filter: tool === t.id ? 'invert(1)' : 'var(--icon-filter)', opacity: tool === t.id ? 1 : .65 } })
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
          e(GuideOverlay, { gridSize, capGuideRow, xHeightGuideRow, baselineGuideRow, descGuideRow, centerGuideCol, showCenterGuide, showCapGuide, showXHGuide, showBaseGuide, showDescGuide })
        )
      ),

      // ── PANEL DERECHO: Caracteres + Exportar (columna derecha) ──
      e('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', position: 'sticky', top: '68px' } },
      e('aside', { style: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: R_CARD, padding: '16px', boxShadow: 'var(--shadow-card)', display: 'flex', flexDirection: 'column', gap: '12px' } },

        // Header con botón AddChar (3 puntos → menú flotante)
        e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
          e('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
            e('span', { style: { fontFamily: FONT_MONO, fontSize: '8px', letterSpacing: '3px', color: 'var(--muted)' } }, 'CARACTERES'),
            e('span', { style: { fontFamily: FONT_MONO, fontSize: '10px', color: 'var(--muted2)' } }, `${doneGlyphs}/${allChars.length}`)
          ),
          e('div', { ref: addCharRef, style: { position: 'relative' } },
            e('button', {
              onClick: ev => { ev.stopPropagation(); setShowAddChar(v => !v); },
              title: 'Agregar carácter especial',
              style: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', padding: '0', background: showAddChar ? `${ACCENT}15` : 'var(--surface2)', border: showAddChar ? `1px solid ${ACCENT}40` : '1px solid var(--border)', borderRadius: R_BTN, cursor: 'pointer', color: showAddChar ? ACCENT : 'var(--muted)', transition: 'all .13s' }
            },
              e('svg', { width: '14', height: '14', viewBox: '0 0 24 24', fill: 'currentColor' },
                e('circle', { cx: '12', cy: '5', r: '1.8' }),
                e('circle', { cx: '12', cy: '12', r: '1.8' }),
                e('circle', { cx: '12', cy: '19', r: '1.8' })
              )
            ),

            // ── Menú flotante de agregar caracteres ──
            showAddChar && e('div', {
              onClick: ev => ev.stopPropagation(),
              style: { position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: '280px', background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: '12px', boxShadow: '0 20px 60px rgba(0,0,0,0.32)', zIndex: 400, padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }
            },
              e('div', { style: { fontFamily: FONT_MONO, fontSize: '8px', color: 'var(--muted2)', letterSpacing: '2px' } }, 'AGREGAR CARÁCTER ESPECIAL'),
              e('div', { style: { fontFamily: FONT_MONO, fontSize: '9px', color: 'var(--muted)', lineHeight: '1.5' } }, 'Ingresa el código (U+0041, &#65;, 0x41) o el carácter directamente.'),

              // Input + botón +
              e('div', { style: { display: 'flex', gap: '6px' } },
                e('input', {
                  value: addCharInput,
                  onChange: ev => setAddCharInput(ev.target.value),
                  onKeyDown: ev => { if (ev.key === 'Enter') addToList(); },
                  placeholder: 'U+00E1, &#233;, á...',
                  style: { flex: 1, padding: '8px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: R_BTN, fontFamily: FONT_MONO, fontSize: '10px', color: 'var(--text)', outline: 'none', transition: 'border-color .15s' },
                  onFocus: ev => ev.target.style.borderColor = ACCENT,
                  onBlur: ev => ev.target.style.borderColor = 'var(--border)'
                }),
                e('button', {
                  onClick: addToList,
                  style: { width: '34px', height: '34px', borderRadius: R_BTN, background: ACCENT, border: 'none', color: '#fff', fontSize: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, flexShrink: 0 }
                }, '+')
              ),

              // Lista de caracteres por agregar
              addCharList.length > 0 && e('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '180px', overflowY: 'auto', scrollbarWidth: 'thin' } },
                addCharList.map(({ char, code }) =>
                  e('div', { key: char, style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: R_BTN } },
                    // Demo con fuente monospace pixel
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

        // Búsqueda
        e('div', { style: { position: 'relative' } },
          e('input', { value: charSearch, onChange: ev => setCharSearch(ev.target.value), placeholder: 'Buscar carácter...', style: { width: '100%', padding: '8px 10px 8px 30px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: R_BTN, fontFamily: FONT_MONO, fontSize: '10px', color: 'var(--text)', outline: 'none', transition: 'border-color .15s' }, onFocus: ev => ev.target.style.borderColor = ACCENT, onBlur: ev => ev.target.style.borderColor = 'var(--border)' }),
          e('span', { style: { position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontFamily: FONT_MONO, fontSize: '11px', color: 'var(--muted2)', pointerEvents: 'none' } }, '⌕')
        ),

        // Filtros
        e('div', { style: { display: 'flex', gap: '4px' } },
          [{ id: 'all', label: 'Todos' }, { id: 'done', label: 'Listos' }, { id: 'empty', label: 'Vacíos' }].map(({ id, label }) =>
            e('button', { key: id, onClick: () => { setCharFilter(id); setCharPage(0); }, style: { flex: 1, padding: '5px 6px', borderRadius: R_BTN, cursor: 'pointer', fontFamily: FONT_MONO, fontSize: '8px', background: charFilter === id ? ACCENT : 'var(--surface2)', color: charFilter === id ? '#fff' : 'var(--muted)', border: charFilter === id ? 'none' : '1px solid var(--border)', transition: 'all .13s' } }, label)
          )
        ),

        // Grilla de caracteres paginada (6×5 = 30 por página)
        (() => {
          const PAGE_SIZE = 30;
          const totalPages = Math.ceil(filteredChars.length / PAGE_SIZE);
          const pageChars = filteredChars.slice(charPage * PAGE_SIZE, (charPage + 1) * PAGE_SIZE);
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

      // Botón Exportar — FUERA del aside, abajo de los caracteres y paginación
      e('button', {
        onClick: () => setShowExport(true),
        style: { width: '100%', padding: '10px 12px', background: 'var(--surface2)', border: `1px solid ${ACCENT}50`, borderRadius: R_BTN, color: ACCENT, fontFamily: FONT_MONO, fontWeight: '700', fontSize: '9px', letterSpacing: '2px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', transition: 'all .15s' },
        onMouseEnter: ev => { ev.currentTarget.style.background = ACCENT; ev.currentTarget.style.color = '#fff'; ev.currentTarget.style.borderColor = ACCENT; },
        onMouseLeave: ev => { ev.currentTarget.style.background = 'var(--surface2)'; ev.currentTarget.style.color = ACCENT; ev.currentTarget.style.borderColor = `${ACCENT}50`; }
      },
        e('svg', { width: '12', height: '12', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2.5', strokeLinecap: 'round', strokeLinejoin: 'round' },
          e('path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }),
          e('polyline', { points: '7 10 12 15 17 10' }),
          e('line', { x1: '12', y1: '15', x2: '12', y2: '3' })
        ),
        'EXPORTAR FUENTE'
      )
      ) // cierre wrapper columna derecha
    ),

    // ── MODALES ────────────────────────────────
    showExport && e(ExportModal, {
      projectName, fontData, gridSize, previewText,
      userBaselineRow: baselineGuideRow,
      onClose: () => setShowExport(false),
      onExport: (filename, format, meta) => {
        try {
          const safe = (filename || projectName || 'mi-fuente').trim() || 'mi-fuente';
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
