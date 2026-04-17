// ─────────────────────────────────────────────
// pixelRenderer.js (ULTRA PRO + SAFE)
// ─────────────────────────────────────────────

// 🔥 Cache de bounds
const glyphCache = new WeakMap();

// 🎯 Defaults centralizados
const DEFAULTS = {
  pixelSize: 3,
  color: '#e62222',
  letterSpacing: 1,
  wordSpacingCols: 3,
  align: 'left',
  lineHeight: 1.2
};

// ─────────────────────────────────────────────
// 🧠 CORE
// ─────────────────────────────────────────────

export function getGlyphBounds(glyph, gridSize) {
  if (!Array.isArray(glyph)) return null;

  let cached = glyphCache.get(glyph);
  if (cached) return cached;

  let minCol = gridSize;
  let maxCol = -1;

  for (let i = 0; i < glyph.length; i++) {
    if (!glyph[i]) continue;

    const col = i % gridSize;
    if (col < minCol) minCol = col;
    if (col > maxCol) maxCol = col;
  }

  if (maxCol < 0) return null;

  const result = {
    minCol,
    maxCol,
    width: maxCol - minCol + 1
  };

  glyphCache.set(glyph, result);
  return result;
}

export function glyphAdvanceCols(char, glyph, gridSize, wordSpacingCols = DEFAULTS.wordSpacingCols) {
  if (char === ' ') return Math.max(1, wordSpacingCols);

  const bounds = getGlyphBounds(glyph, gridSize);
  return bounds ? bounds.width : gridSize;
}

// ─────────────────────────────────────────────
// 📏 MÉTRICAS
// ─────────────────────────────────────────────

export function measureText(text, gridSize, pixelSize, letterSpacing = 1) {
  return text.length * (gridSize * pixelSize + letterSpacing);
}

export function measureTextByGlyphs(
  text,
  font,
  gridSize,
  pixelSize,
  letterSpacing = DEFAULTS.letterSpacing,
  wordSpacingCols = DEFAULTS.wordSpacingCols
) {
  let total = 0;
  const chars = (text || '').toUpperCase();

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    const advance = glyphAdvanceCols(char, font?.[char], gridSize, wordSpacingCols);

    total += advance * pixelSize;
    if (i < chars.length - 1) total += letterSpacing;
  }

  return total;
}

// ─────────────────────────────────────────────
// 🎨 RENDER
// ─────────────────────────────────────────────

export function renderTextOnCanvas(
  ctx,
  text,
  font,
  gridSize,
  pixelSize,
  x,
  y,
  color = DEFAULTS.color,
  letterSpacing = DEFAULTS.letterSpacing,
  wordSpacingCols = DEFAULTS.wordSpacingCols,
  align = DEFAULTS.align,
  lineHeight = DEFAULTS.lineHeight
) {
  if (!ctx || !font) return;

  const lines = (text || '').toUpperCase().split('\n');
  const lineHeightPx = gridSize * pixelSize * lineHeight;

  ctx.fillStyle = color; // 🔥 set una sola vez

  lines.forEach((line, lineIndex) => {
    let cursorX = x;

    const lineWidth = measureTextByGlyphs(
      line,
      font,
      gridSize,
      pixelSize,
      letterSpacing,
      wordSpacingCols
    );

    // 🎯 alineación
    if (align === 'center') cursorX -= lineWidth / 2;
    else if (align === 'right') cursorX -= lineWidth;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const glyph = font[char];
      const bounds = getGlyphBounds(glyph, gridSize);
      const advance = glyphAdvanceCols(char, glyph, gridSize, wordSpacingCols);

      if (!glyph || !bounds) {
        cursorX += advance * pixelSize + letterSpacing;
        continue;
      }

      for (let row = 0; row < gridSize; row++) {
        const rowOffset = row * gridSize;

        for (let col = bounds.minCol; col <= bounds.maxCol; col++) {
          if (!glyph[rowOffset + col]) continue;

          ctx.fillRect(
            cursorX + (col - bounds.minCol) * pixelSize,
            y + lineIndex * lineHeightPx + row * pixelSize,
            pixelSize,
            pixelSize
          );
        }
      }

      cursorX += advance * pixelSize + letterSpacing;
    }
  });
}

// ─────────────────────────────────────────────
// 🧾 CANVAS FACTORY
// ─────────────────────────────────────────────

export function createTextCanvas(
  text,
  font,
  gridSize,
  options = {}
) {
  const opts = { ...DEFAULTS, ...options };

  const lines = (text || '').split('\n');

  const widths = lines.map(line =>
    measureTextByGlyphs(line, font, gridSize, opts.pixelSize, opts.letterSpacing)
  );

  const maxWidth = Math.max(...widths, 10);
  const height = lines.length * gridSize * opts.pixelSize;

  const canvas = document.createElement('canvas');
  canvas.width = maxWidth + (opts.paddingX || 12) * 2;
  canvas.height = height + (opts.paddingY || 10) * 2;

  const ctx = canvas.getContext('2d');

  if (opts.bgColor && opts.bgColor !== 'transparent') {
    ctx.fillStyle = opts.bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  renderTextOnCanvas(
    ctx,
    text,
    font,
    gridSize,
    opts.pixelSize,
    (opts.paddingX || 12) + (opts.align === 'center' ? maxWidth / 2 : opts.align === 'right' ? maxWidth : 0),
    (opts.paddingY || 10),
    opts.color,
    opts.letterSpacing,
    opts.wordSpacingCols,
    opts.align,
    opts.lineHeight
  );

  return canvas;
}

// ─────────────────────────────────────────────
// 🔍 DEBUG / UI
// ─────────────────────────────────────────────

export function createGlyphGrid(glyph, gridSize, pixelSize = 3, color = '#e62222') {
  const wrap = document.createElement('div');

  wrap.style.cssText = `
    display:grid;
    grid-template-columns:repeat(${gridSize},${pixelSize}px);
    gap:0;
  `;

  const total = gridSize * gridSize;

  for (let i = 0; i < total; i++) {
    const px = document.createElement('div');

    px.style.cssText = `
      width:${pixelSize}px;
      height:${pixelSize}px;
      background:${
        (glyph && glyph[i]) ? color : 'rgba(255,255,255,0.05)'
      };
    `;

    wrap.appendChild(px);
  }

  return wrap;
}

// ─────────────────────────────────────────────
// 🧰 UTILIDADES
// ─────────────────────────────────────────────

export function countGlyphs(font) {
  return Object.values(font || {}).filter(g => Array.isArray(g) && g.some(Boolean)).length;
}

export function getAvailableChars(font) {
  return Object.keys(font || {}).filter(k => font[k]?.some(Boolean));
}

// 🔥 compatibilidad total
export const availableChars = getAvailableChars;
