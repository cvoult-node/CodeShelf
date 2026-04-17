// ─────────────────────────────────────────────
// pixelRenderer.js (PRO + COMPATIBLE)
// ─────────────────────────────────────────────

const glyphCache = new WeakMap();

/**
 * Obtiene los límites reales del glifo (columnas usadas)
 */
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

/**
 * Calcula cuánto avanza un carácter
 */
export function glyphAdvanceCols(char, glyph, gridSize, wordSpacingCols = 3) {
  if (char === ' ') return Math.max(1, wordSpacingCols);

  const bounds = getGlyphBounds(glyph, gridSize);
  if (!bounds) return gridSize;

  return Math.max(1, bounds.width);
}

/**
 * Renderiza texto en canvas
 */
export function renderTextOnCanvas(
  ctx,
  text,
  font,
  gridSize,
  pixelSize,
  x,
  y,
  color = '#e62222',
  letterSpacing = 1,
  wordSpacingCols = 3,
  align = 'left',
  lineHeight = 1.2
) {
  const lines = (text || '').toUpperCase().split('\n');
  const lineHeightPx = gridSize * pixelSize * lineHeight;

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

    if (align === 'center') cursorX -= lineWidth / 2;
    if (align === 'right') cursorX -= lineWidth;

    for (const char of line) {
      const glyph = font[char];
      const bounds = getGlyphBounds(glyph, gridSize);
      const advance = glyphAdvanceCols(char, glyph, gridSize, wordSpacingCols);

      if (!glyph || !bounds) {
        cursorX += advance * pixelSize + letterSpacing;
        continue;
      }

      for (let row = 0; row < gridSize; row++) {
        for (let col = bounds.minCol; col <= bounds.maxCol; col++) {
          if (glyph[row * gridSize + col]) {
            ctx.fillStyle = color;
            ctx.fillRect(
              cursorX + (col - bounds.minCol) * pixelSize,
              y + lineIndex * lineHeightPx + row * pixelSize,
              pixelSize - 0.5,
              pixelSize - 0.5
            );
          }
        }
      }

      cursorX += advance * pixelSize + letterSpacing;
    }
  });
}

/**
 * Medición simple (legacy)
 */
export function measureText(text, gridSize, pixelSize, letterSpacing = 1) {
  return text.length * (gridSize * pixelSize + letterSpacing);
}

/**
 * Medición real basada en glifos
 */
export function measureTextByGlyphs(
  text,
  font,
  gridSize,
  pixelSize,
  letterSpacing = 1,
  wordSpacingCols = 3
) {
  let total = 0;
  const chars = (text || '').toUpperCase().split('');

  chars.forEach((char, idx) => {
    const advance = glyphAdvanceCols(char, font?.[char], gridSize, wordSpacingCols);
    total += advance * pixelSize;

    if (idx < chars.length - 1) total += letterSpacing;
  });

  return total;
}

/**
 * Crea canvas con texto
 */
export function createTextCanvas(
  text,
  font,
  gridSize,
  {
    pixelSize = 3,
    color = '#e62222',
    bgColor = 'transparent',
    letterSpacing = 2,
    paddingX = 12,
    paddingY = 10,
    align = 'left'
  } = {}
) {
  const lines = (text || '').split('\n');

  const widths = lines.map(line =>
    measureTextByGlyphs(line, font, gridSize, pixelSize, letterSpacing)
  );

  const maxWidth = Math.max(...widths);
  const height = lines.length * gridSize * pixelSize;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(maxWidth + paddingX * 2, 10);
  canvas.height = Math.max(height + paddingY * 2, 10);

  const ctx = canvas.getContext('2d');

  if (bgColor !== 'transparent') {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  renderTextOnCanvas(
    ctx,
    text,
    font,
    gridSize,
    pixelSize,
    paddingX + (align === 'center' ? maxWidth / 2 : align === 'right' ? maxWidth : 0),
    paddingY,
    color,
    letterSpacing,
    3,
    align
  );

  return canvas;
}

/**
 * Grid visual para preview de glifos
 */
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
        (glyph && glyph[i]) ? color : 'rgba(255,255,255,0.04)'
      };
    `;

    wrap.appendChild(px);
  }

  return wrap;
}

/**
 * Cuenta glifos activos
 */
export function countGlyphs(font) {
  return Object.values(font || {}).filter(g => Array.isArray(g) && g.some(Boolean)).length;
}

/**
 * Nombre nuevo (pro)
 */
export function getAvailableChars(font) {
  return Object.keys(font || {}).filter(k => font[k]?.some(Boolean));
}


export const availableChars = getAvailableChars;
