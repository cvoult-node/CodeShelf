// pixelRenderer.pro.js

// ─────────────────────────────────────────────
// CACHE INTERNO (mejora rendimiento)
// ─────────────────────────────────────────────
const glyphCache = new WeakMap();

function getCachedBounds(glyph, gridSize) {
  if (!glyph) return null;

  let cache = glyphCache.get(glyph);
  if (cache) return cache;

  let minCol = gridSize, maxCol = -1;

  for (let i = 0; i < glyph.length; i++) {
    if (!glyph[i]) continue;
    const col = i % gridSize;
    if (col < minCol) minCol = col;
    if (col > maxCol) maxCol = col;
  }

  if (maxCol < 0) return null;

  cache = { minCol, maxCol, width: maxCol - minCol + 1 };
  glyphCache.set(glyph, cache);

  return cache;
}

// ─────────────────────────────────────────────
// MÉTRICAS
// ─────────────────────────────────────────────
export function getGlyphAdvance(char, glyph, gridSize, wordSpacing = 3) {
  if (char === ' ') return Math.max(1, wordSpacing);

  const bounds = getCachedBounds(glyph, gridSize);
  if (!bounds) return gridSize;

  return bounds.width;
}

export function measureTextAdvanced(text, font, gridSize, options = {}) {
  const {
    pixelSize = 1,
    letterSpacing = 1,
    wordSpacing = 3
  } = options;

  let width = 0;
  const chars = (text || '').toUpperCase().split('');

  chars.forEach((char, i) => {
    const glyph = font[char];
    width += getGlyphAdvance(char, glyph, gridSize, wordSpacing) * pixelSize;

    if (i < chars.length - 1) width += letterSpacing;
  });

  return width;
}

// ─────────────────────────────────────────────
// RENDER PRINCIPAL (PRO)
// ─────────────────────────────────────────────
export function renderText(ctx, text, font, gridSize, options = {}) {
  const {
    x = 0,
    y = 0,
    pixelSize = 4,
    color = '#e62222',
    letterSpacing = 1,
    wordSpacing = 3,
    align = 'left', // left | center | right
    lineHeight = 1.2
  } = options;

  const lines = (text || '').toUpperCase().split('\n');
  const lineHeightPx = gridSize * pixelSize * lineHeight;

  lines.forEach((line, lineIndex) => {
    let cursorX = x;

    const lineWidth = measureTextAdvanced(line, font, gridSize, {
      pixelSize,
      letterSpacing,
      wordSpacing
    });

    // 🎯 Alineación pro
    if (align === 'center') cursorX -= lineWidth / 2;
    if (align === 'right') cursorX -= lineWidth;

    for (const char of line) {
      const glyph = font[char];
      const bounds = getCachedBounds(glyph, gridSize);
      const advance = getGlyphAdvance(char, glyph, gridSize, wordSpacing);

      if (!glyph || !bounds) {
        cursorX += advance * pixelSize + letterSpacing;
        continue;
      }

      for (let row = 0; row < gridSize; row++) {
        for (let col = bounds.minCol; col <= bounds.maxCol; col++) {
          if (!glyph[row * gridSize + col]) continue;

          ctx.fillStyle = color;
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
// CANVAS FACTORY (MEJORADO)
// ─────────────────────────────────────────────
export function createTextCanvas(text, font, gridSize, options = {}) {
  const {
    pixelSize = 4,
    color = '#e62222',
    bgColor = null,
    padding = 10,
    align = 'left'
  } = options;

  const lines = (text || '').split('\n');

  const widths = lines.map(line =>
    measureTextAdvanced(line, font, gridSize, options)
  );

  const maxWidth = Math.max(...widths);
  const height = lines.length * gridSize * pixelSize;

  const canvas = document.createElement('canvas');
  canvas.width = maxWidth + padding * 2;
  canvas.height = height + padding * 2;

  const ctx = canvas.getContext('2d');

  if (bgColor) {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  renderText(ctx, text, font, gridSize, {
    ...options,
    x: padding + (align === 'center' ? maxWidth / 2 : align === 'right' ? maxWidth : 0),
    y: padding
  });

  return canvas;
}

// ─────────────────────────────────────────────
// DEBUG / DEV TOOLS
// ─────────────────────────────────────────────
export function debugDrawBounds(ctx, x, y, width, height) {
  ctx.strokeStyle = 'rgba(0,255,0,0.3)';
  ctx.strokeRect(x, y, width, height);
}

// ─────────────────────────────────────────────
// UTILIDADES
// ─────────────────────────────────────────────
export function getAvailableChars(font) {
  return Object.keys(font || {}).filter(k => font[k]?.some(Boolean));
}

export function countGlyphs(font) {
  return getAvailableChars(font).length;
}

export const availableChars = getAvailableChars;
