// ─────────────────────────────────────────────
//  pixelRenderer.js
//  Utilidad compartida para renderizar fuentes
//  pixel en un <canvas> o en mini-grids DOM.
// ─────────────────────────────────────────────

/**
 * Dibuja texto usando una fuente pixel en un canvas.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text - Texto a renderizar
 * @param {Object} font - { 'A': [bool...], ... }
 * @param {number} gridSize - Tamaño de la cuadrícula
 * @param {number} pixelSize - Tamaño de cada píxel en pantalla
 * @param {number} x - Posición X inicial
 * @param {number} y - Posición Y inicial
 * @param {string} color - Color de los píxeles activos
 * @param {number} letterSpacing - Espacio extra entre letras
 */
export function getGlyphBounds(glyph, gridSize) {
  if (!Array.isArray(glyph)) return null;
  let minCol = gridSize, maxCol = -1;
  for (let i = 0; i < glyph.length; i++) {
    if (!glyph[i]) continue;
    const col = i % gridSize;
    if (col < minCol) minCol = col;
    if (col > maxCol) maxCol = col;
  }
  if (maxCol < 0) return null;
  return { minCol, maxCol };
}

export function glyphAdvanceCols(char, glyph, gridSize, wordSpacingCols = 3) {
  if (char === ' ') return Math.max(1, wordSpacingCols);
  const bounds = getGlyphBounds(glyph, gridSize);
  if (!bounds) return gridSize;
  return Math.max(1, bounds.maxCol - bounds.minCol + 1);
}

export function renderTextOnCanvas(ctx, text, font, gridSize, pixelSize, x, y, color = '#e62222', letterSpacing = 1, wordSpacingCols = 3) {
  let cursorX = x;

  for (const char of text.toUpperCase()) {
    const glyph = font[char];
    const bounds = getGlyphBounds(glyph, gridSize);
    const advanceCols = glyphAdvanceCols(char, glyph, gridSize, wordSpacingCols);
    if (!glyph || !bounds) {
      cursorX += advanceCols * pixelSize + letterSpacing;
      continue;
    }

    for (let row = 0; row < gridSize; row++) {
      for (let col = bounds.minCol; col <= bounds.maxCol; col++) {
        if (glyph[row * gridSize + col]) {
          ctx.fillStyle = color;
          ctx.fillRect(
            cursorX + (col - bounds.minCol) * pixelSize,
            y + row * pixelSize,
            pixelSize - 0.5,
            pixelSize - 0.5
          );
        }
      }
    }
    cursorX += advanceCols * pixelSize + letterSpacing;
  }
}

/**
 * Calcula el ancho total que ocupará un texto renderizado.
 */
export function measureText(text, gridSize, pixelSize, letterSpacing = 1) {
  return text.length * (gridSize * pixelSize + letterSpacing);
}

/**
 * Ancho real del texto según píxeles dibujados por glifo (sin contar columnas vacías laterales).
 */
export function measureTextByGlyphs(text, font, gridSize, pixelSize, letterSpacing = 1, wordSpacingCols = 3) {
  let total = 0;
  const chars = (text || '').toUpperCase().split('');
  chars.forEach((char, idx) => {
    const advanceCols = glyphAdvanceCols(char, font?.[char], gridSize, wordSpacingCols);
    total += advanceCols * pixelSize;
    if (idx < chars.length - 1) total += letterSpacing;
  });
  return total;
}

/**
 * Crea un <canvas> con el texto renderizado.
 * Devuelve el elemento canvas listo para insertar en el DOM.
 */
export function createTextCanvas(text, font, gridSize, {
  pixelSize    = 3,
  color        = '#e62222',
  bgColor      = 'transparent',
  letterSpacing = 2,
  paddingX     = 12,
  paddingY     = 10,
} = {}) {
  const canvas = document.createElement('canvas');
  const w = measureText(text, gridSize, pixelSize, letterSpacing) + paddingX * 2;
  const h = gridSize * pixelSize + paddingY * 2;
  canvas.width  = Math.max(w, 10);
  canvas.height = Math.max(h, 10);

  const ctx = canvas.getContext('2d');
  if (bgColor !== 'transparent') {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  renderTextOnCanvas(ctx, text, font, gridSize, pixelSize, paddingX, paddingY, color, letterSpacing);
  return canvas;
}

/**
 * Crea una mini-grid DOM (3×3px por píxel) para previsualizar un glifo.
 * Más liviana que canvas para listas largas.
 */
export function createGlyphGrid(glyph, gridSize, pixelSize = 3, color = '#e62222') {
  const wrap = document.createElement('div');
  wrap.style.cssText = `display:grid;grid-template-columns:repeat(${gridSize},${pixelSize}px);gap:0;`;
  const total = gridSize * gridSize;
  for (let i = 0; i < total; i++) {
    const px = document.createElement('div');
    px.style.cssText = `width:${pixelSize}px;height:${pixelSize}px;background:${
      (glyph && glyph[i]) ? color : 'rgba(255,255,255,0.04)'
    };`;
    wrap.appendChild(px);
  }
  return wrap;
}

/**
 * Cuenta glifos con al menos un píxel pintado.
 */
export function countGlyphs(font) {
  return Object.values(font || {}).filter(g => Array.isArray(g) && g.some(Boolean)).length;
}

/**
 * Devuelve las letras que tienen glifo definido.
 */
export function availableChars(font) {
  return Object.keys(font || {}).filter(k => font[k]?.some(Boolean));
}
