// ─────────────────────────────────────────────
//  CANVAS ALGORITHMS — src/canvas.js
// ─────────────────────────────────────────────

/** Flood fill 4-conectado */
export function floodFill(grid, size, startIdx, fillVal) {
  const target = grid[startIdx];
  if (target === fillVal) return grid;
  const next  = [...grid];
  const stack = [startIdx];
  while (stack.length) {
    const i = stack.pop();
    if (i < 0 || i >= size * size || next[i] !== target) continue;
    next[i] = fillVal;
    const r = Math.floor(i / size), c = i % size;
    if (c > 0)        stack.push(i - 1);
    if (c < size - 1) stack.push(i + 1);
    if (r > 0)        stack.push(i - size);
    if (r < size - 1) stack.push(i + size);
  }
  return next;
}

/** Desplazar píxeles con wrap-around */
export function shiftGrid(grid, size, dir) {
  const next = Array(size * size).fill(false);
  grid.forEach((v, i) => {
    if (!v) return;
    let r = Math.floor(i / size), c = i % size;
    if (dir === 'up')    r = (r - 1 + size) % size;
    if (dir === 'down')  r = (r + 1) % size;
    if (dir === 'left')  c = (c - 1 + size) % size;
    if (dir === 'right') c = (c + 1) % size;
    next[r * size + c] = true;
  });
  return next;
}

/**
 * Exportar font data → opentype.Font y descargar
 * @param {Object} meta - { fontName, author, letterSpacing, wordSpacing, unitsPerEm, ascender, descender }
 */
export function buildAndDownload(fontData, gridSize, filename, format, meta = {}) {
  const ot = window.__opentype__;
  if (!ot) {
    throw new Error('La librería de fuentes no está lista. Recarga la página.');
  }

  const hasGlyphs = Object.values(fontData).some(g => Array.isArray(g) && g.some(Boolean));
  if (!hasGlyphs) {
    throw new Error('Dibuja al menos un carácter antes de exportar.');
  }

  const {
    fontName      = filename,
    author        = '',
    letterSpacing = 0,
    wordSpacing   = 10,
    unitsPerEm    = 1000,
    ascender      = 800,
    descender     = -200,
  } = meta;

  const S = 100;
  const pxSpacing = Math.round(letterSpacing * 10);

  const getGlyphBounds = (glyph = []) => {
    let minCol = gridSize, maxCol = -1;
    glyph.forEach((on, i) => {
      if (!on) return;
      const col = i % gridSize;
      if (col < minCol) minCol = col;
      if (col > maxCol) maxCol = col;
    });
    if (maxCol < 0) return null;
    return { minCol, maxCol, widthCols: (maxCol - minCol + 1) };
  };

  const glyphs = [
    new ot.Glyph({ name: '.notdef', unicode: 0, advanceWidth: gridSize * S, path: new ot.Path() })
  ];

  Object.keys(fontData).forEach(char => {
    const glyphGrid = fontData[char] || [];
    const bounds = getGlyphBounds(glyphGrid);
    const path = new ot.Path();
    glyphGrid.forEach((on, i) => {
      if (!on) return;
      const col = i % gridSize;
      const x = ((bounds ? (col - bounds.minCol) : col)) * S;
      const y = (gridSize - 1 - Math.floor(i / gridSize)) * S;
      path.moveTo(x, y); path.lineTo(x+S, y);
      path.lineTo(x+S, y+S); path.lineTo(x, y+S);
      path.close();
    });

    const glyphWidth = bounds ? (bounds.widthCols * S) : S;
    const onePixelPadding = S;
    const minAdvance = S;
    const advance = char === ' '
      ? Math.max(minAdvance, onePixelPadding + Math.round(wordSpacing * 10))
      : Math.max(minAdvance, glyphWidth + onePixelPadding + pxSpacing);

    glyphs.push(new ot.Glyph({
      name: char === ' ' ? 'space' : char,
      unicode: char.codePointAt(0),
      advanceWidth: advance,
      path
    }));
  });

  const font = new ot.Font({
    familyName:  fontName || filename,
    styleName:   'Regular',
    designer:    author,
    unitsPerEm,
    ascender,
    descender,
    glyphs
  });

  font.download(`${filename}.${format}`);
}
