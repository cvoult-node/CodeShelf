// ─────────────────────────────────────────────
//  CANVAS ALGORITHMS — src/canvas.js  (v2.2)
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
 * Calcula la fila de baseline para un gridSize dado.
 * Para 12×12: baseline en fila 8 (deja 3 filas para descenders).
 * Para otros tamaños: ~67% del alto.
 */
export function getBaselineRow(gridSize) {
  // Para 16×16: baseline en fila 12 (deja 4 filas para descenders = 25%)
  // Para otros tamaños: ~75% del alto
  return Math.round(gridSize * 0.75);
}

/**
 * Exportar font data → opentype.Font y descargar
 * @param {Object} meta - { fontName, author, letterSpacing, wordSpacing, extraSpace, unitsPerEm, ascender, descender }
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
    extraSpace    = 1,
    unitsPerEm    = 1000,
    ascender      = 800,
    descender     = -250,
  } = meta;

  // Escala: cada píxel del canvas → S unidades opentype
  // S = 1.0 → el gridSize llena exactamente el em completo
  const S = Math.round((unitsPerEm * 1.0) / gridSize);
  const pxSpacing = Math.round(letterSpacing * S);

  // Fila de baseline (0-indexed desde arriba del grid)
  // Para 12×12: fila 8, dejando filas 9-11 para descenders
  const baselineRow = getBaselineRow(gridSize);

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

    if (!bounds && char !== ' ') return;

    const path = new ot.Path();
    if (bounds) {
      glyphGrid.forEach((on, i) => {
        if (!on) return;
        const row = Math.floor(i / gridSize);
        const col = i % gridSize;

        // X: desplazar para que empiece en 0 (sin margen izquierdo vacío)
        const x = (col - bounds.minCol) * S;

        // Y: positivo = sobre la baseline, negativo = descender
        // row=0 (arriba del grid) → y más alto sobre baseline
        // row=baselineRow → y=0 (baseline)
        // row > baselineRow → y negativo (descender)
        // Cada píxel debe "apoyar" su borde inferior en baseline cuando row === baselineRow.
        // Con esto evitamos que toda la fuente quede ~1px (S unidades) más arriba.
        const y = (baselineRow - row - 1) * S;

        // Dibujar cuadrado de píxel (orientación opentype: y crece hacia arriba)
        path.moveTo(x,     y);
        path.lineTo(x + S, y);
        path.lineTo(x + S, y + S);
        path.lineTo(x,     y + S);
        path.close();
      });
    }

    const glyphWidth  = bounds ? (bounds.widthCols * S) : 0;
    const minAdvance  = S;

    const advance = char === ' '
      ? Math.max(minAdvance, Math.round(wordSpacing * S))
      : Math.max(minAdvance, glyphWidth + pxSpacing);

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
