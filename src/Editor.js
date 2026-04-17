// ─────────────────────────────────────────────
//  EDITOR — src/Editor.js
// ─────────────────────────────────────────────
import React, { useState, useRef, useCallback, useEffect } from 'https://esm.sh/react@18.2.0';
import { auth, signOut } from './firebase.js';
import { ACCENT, TECLADO, R_CARD, R_BTN, FONT_MONO, FONT_PIXEL } from './constants.js';
import { Btn, Icon, Overlay, Modal, Label } from './ui.js';
import { buildAndDownload, getBaselineRow } from './canvas.js';

// ── Pixel preview helper ──────────────────────
const PixelPreview = ({
  text,
  fontData,
  gridSize,
  pixelSize = 3,
  color = ACCENT,
  showSpaceMarker = false,
  letterSpacing = 0,
  wordSpacing = 10,
  extraSpace = 1
}) => {
  const chars = text.split('');
  const sz = Math.min(gridSize, 32);
  const getBounds = (glyph) => {
    if (!Array.isArray(glyph)) return null;
    let minCol = sz, maxCol = -1;
    glyph.forEach((on, i) => {
      if (!on) return;
      const col = i % sz;
      if (col < minCol) minCol = col;
      if (col > maxCol) maxCol = col;
    });
    return maxCol < 0 ? null : { minCol, maxCol };
  };

  return React.createElement('div', {
    style: {
      display: 'flex',
      gap: '0px',
      flexWrap: 'nowrap',
      overflowX: 'auto',
      overflowY: 'hidden',
      whiteSpace: 'nowrap',
      padding: '8px',
      minHeight: '28px',
      alignItems: 'flex-end',
      scrollbarWidth: 'thin'
    }
  },
    chars.map((ch, ci) => {
      const glyph = fontData[ch];
      const bounds = getBounds(glyph);
      const isSpace = ch === ' ';
      const spacingPx = isSpace ? wordSpacing * 0.22 : letterSpacing * pixelSize;
      const minSpaceWidth = Math.max(pixelSize * 2, 1);
      const computedSpaceWidth = Math.max(minSpaceWidth, pixelSize * 3 + wordSpacing * 0.2);
      const glyphCols = bounds ? (bounds.maxCol - bounds.minCol + 1) : sz;
      const glyphRows = sz;

      return React.createElement('div', {
        key: ci,
        style: {
          display: 'grid',
          gridTemplateColumns: `repeat(${glyphCols},${pixelSize}px)`,
          gridTemplateRows: `repeat(${glyphRows},${pixelSize}px)`,
          position: 'relative',
          width: isSpace ? `${computedSpaceWidth}px` : undefined,
          minWidth: isSpace ? `${minSpaceWidth}px` : undefined,
          marginRight: `${spacingPx}px`,
          border: (isSpace && showSpaceMarker) ? '1px dashed var(--border)' : 'none',
          borderRadius: '4px',
          padding: (isSpace && showSpaceMarker) ? '2px' : 0,
          flexShrink: 0,
          alignSelf: 'flex-end'
        }
      },
        Array(glyphCols * glyphRows).fill(0).map((_, pi) => {
          const row = Math.floor(pi / glyphCols);
          const col = pi % glyphCols;
          const sourceRow = row;
          const sourceCol = bounds ? col + bounds.minCol : col;
          const sourceIdx = sourceRow * sz + sourceCol;
          return (
          React.createElement('div', {
            key: pi,
            style: {
              width: `${pixelSize}px`,
              height: `${pixelSize}px`,
              background: glyph?.[sourceIdx] ? color : 'transparent'
            }
          })
        )}),
        (isSpace && showSpaceMarker) && React.createElement('div', {
          style: {
            position: 'absolute', top: '2px', bottom: '2px', left: '50%',
            width: '1px', transform: 'translateX(-50%)',
            background: 'var(--border-accent)', opacity: .65, pointerEvents: 'none'
          }
        })
      );
    })
  );
};

// ── Export modal ──────────────────────────────
const ExportModal = ({ projectName, fontData, gridSize, previewText: externalPreviewText, onClose, onExport }) => {
  const [filename,      setFilename]      = useState(projectName || 'mi-fuente');
  const [fontName,      setFontName]      = useState(projectName || 'mi-fuente');
  const [author,        setAuthor]        = useState('');
  const [format,        setFormat]        = useState('otf');
  const [letterSpacing, setLetterSpacing] = useState(1);
  const [wordSpacing,   setWordSpacing]   = useState(10);
  const [showAdvanced,  setShowAdvanced]  = useState(false);
  const [unitsPerEm,    setUnitsPerEm]    = useState(1000);
  // Para 12×12: baseline en fila 8 → ascender cubre 8 filas (8/12 * 1000 ≈ 667)
  // Usamos 800 para dar espacio generoso sobre caps.
  // Descender cubre 3 filas (3/12 * 1000 = 250) → -250
  const [ascender,      setAscender]      = useState(800);
  const [descender,     setDescender]     = useState(-250);

  const PREVIEW_TEXT = externalPreviewText || 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.';

  const inputStyle = {
    background: 'var(--surface2)', border: '1px solid var(--border)',
    borderRadius: R_BTN, padding: '10px 13px', color: 'var(--text)',
    fontSize: '13px', outline: 'none', fontFamily: FONT_MONO, width: '100%',
    transition: 'border-color .15s'
  };

  const sliderStyle = { width: '100%', accentColor: ACCENT, cursor: 'pointer' };

  const fieldGroup = (label, children) =>
    React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
      React.createElement(Label, null, label),
      children
    );

  return React.createElement(Overlay, { onClose },
    React.createElement('div', {
      style: {
        background: 'var(--surface)', border: '1px solid var(--border2)',
        borderRadius: R_CARD, padding: '24px', width: '520px', minWidth: '520px', maxWidth: '520px',
        maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 32px 80px rgba(0,0,0,0.25)',
        display: 'flex', flexDirection: 'column', gap: '20px'
      }
    },
      React.createElement('h3', {
        style: { fontFamily: FONT_PIXEL, fontSize: '10px', color: ACCENT, letterSpacing: '2px', margin: 0 }
      }, 'EXPORTAR FUENTE'),

      // Preview
      React.createElement('div', {
        style: {
          background: 'var(--surface2)', border: '1px solid var(--border2)',
          borderRadius: R_BTN, padding: '14px', minHeight: '96px'
        }
      },
        React.createElement('div', {
          style: { fontFamily: FONT_MONO, fontSize: '9px', color: 'var(--muted2)', letterSpacing: '2px', marginBottom: '10px' }
        }, 'PREVIEW'),
        React.createElement(PixelPreview, {
          text: PREVIEW_TEXT, fontData, gridSize,
          pixelSize: 4, color: ACCENT, showSpaceMarker: false,
          letterSpacing, wordSpacing, extraSpace: 0
        })
      ),

      fieldGroup('NOMBRE DEL ARCHIVO',
        React.createElement('input', {
          value: filename, onChange: e => setFilename(e.target.value), style: inputStyle,
          onFocus: e => e.target.style.borderColor = ACCENT,
          onBlur:  e => e.target.style.borderColor = 'var(--border)'
        })
      ),

      fieldGroup('NOMBRE DE LA FUENTE (familia)',
        React.createElement('input', {
          value: fontName, onChange: e => setFontName(e.target.value), style: inputStyle,
          onFocus: e => e.target.style.borderColor = ACCENT,
          onBlur:  e => e.target.style.borderColor = 'var(--border)'
        })
      ),

      fieldGroup('AUTOR',
        React.createElement('input', {
          value: author, placeholder: 'Tu nombre o seudónimo',
          onChange: e => setAuthor(e.target.value), style: { ...inputStyle },
          onFocus: e => e.target.style.borderColor = ACCENT,
          onBlur:  e => e.target.style.borderColor = 'var(--border)'
        })
      ),


      fieldGroup('LETTER SPACING (píxeles del canvas)',
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
          React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
            React.createElement('span', { style: { fontFamily: FONT_MONO, fontSize: '10px', color: 'var(--muted)' } }, '1px canvas ≈ 10 unidades de métrica'),
            React.createElement('span', { style: { fontFamily: FONT_MONO, fontSize: '12px', color: ACCENT, minWidth: '48px', textAlign: 'right' } }, letterSpacing + ' px')
          ),
          React.createElement('input', {
            type: 'range', min: -5, max: 20, value: letterSpacing,
            onChange: e => setLetterSpacing(Number(e.target.value)), style: sliderStyle
          })
        )
      ),

      fieldGroup('ESPACIADO DE PALABRAS (word spacing)',
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
          React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
            React.createElement('span', { style: { fontFamily: FONT_MONO, fontSize: '10px', color: 'var(--muted)' } }, 'Ancho del espacio entre palabras'),
            React.createElement('span', { style: { fontFamily: FONT_MONO, fontSize: '12px', color: ACCENT, minWidth: '32px', textAlign: 'right' } }, wordSpacing)
          ),
          React.createElement('input', {
            type: 'range', min: -30, max: 80, value: wordSpacing,
            onChange: e => setWordSpacing(Number(e.target.value)), style: sliderStyle
          })
        )
      ),

      // Opciones avanzadas
      React.createElement('div', null,
        React.createElement('button', {
          onClick: () => setShowAdvanced(v => !v),
          style: {
            display: 'flex', alignItems: 'center', gap: '8px', background: 'none',
            border: 'none', cursor: 'pointer', fontFamily: FONT_MONO,
            fontSize: '9px', letterSpacing: '2px', color: 'var(--muted)', padding: '4px 0'
          }
        },
          React.createElement('span', { style: { transition: 'transform .2s', transform: showAdvanced ? 'rotate(90deg)' : 'none' } }, '▶'),
          'OPCIONES AVANZADAS'
        ),
        showAdvanced && React.createElement('div', {
          style: {
            marginTop: '14px', padding: '16px',
            background: 'var(--surface2)', borderRadius: R_BTN,
            border: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column', gap: '14px'
          }
        },
          React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' } },
            ...[
              ['UNITS PER EM', unitsPerEm, setUnitsPerEm, 500, 4000],
              ['ASCENDENTE',   ascender,   setAscender,  -200, 2000],
              ['DESCENDENTE',  descender,  setDescender, -800, 200]
            ].map(([lbl, val, setter, min, max]) =>
              React.createElement('div', { key: lbl, style: { display: 'flex', flexDirection: 'column', gap: '5px' } },
                React.createElement('label', { style: { fontFamily: FONT_MONO, fontSize: '8px', color: 'var(--muted)', letterSpacing: '1px' } }, lbl),
                React.createElement('input', {
                  type: 'number', value: val, min, max,
                  onChange: e => setter(Number(e.target.value)),
                  style: { ...inputStyle, fontSize: '12px', padding: '8px 10px' },
                  onFocus: e => e.target.style.borderColor = ACCENT,
                  onBlur:  e => e.target.style.borderColor = 'var(--border)'
                })
              )
            )
          ),
          React.createElement('p', {
            style: { fontFamily: FONT_MONO, fontSize: '9px', color: 'var(--muted2)', lineHeight: '1.6', margin: 0 }
          }, `Métrica vertical de la fuente. Para ${gridSize}×${gridSize}px: baseline en fila ${getBaselineRow(gridSize)}, ${gridSize - getBaselineRow(gridSize)} filas de descender. Ajusta solo si sabes lo que haces.`)
        )
      ),

      // Formato
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
        React.createElement(Label, null, 'FORMATO DE EXPORTACIÓN'),
        React.createElement('div', { style: { display: 'flex', gap: '8px' } },
          ['otf', 'ttf', 'woff'].map(f =>
            React.createElement('button', {
              key: f, onClick: () => setFormat(f),
              style: {
                flex: 1, padding: '10px', borderRadius: R_BTN, cursor: 'pointer',
                fontFamily: FONT_MONO, fontWeight: '700', fontSize: '11px',
                letterSpacing: '1px', textTransform: 'uppercase', transition: 'all .13s',
                background: format === f ? ACCENT : 'var(--surface2)',
                color: format === f ? '#fff' : 'var(--muted)',
                border: format === f ? 'none' : '1px solid var(--border)'
              }
            }, f)
          )
        )
      ),

      // Botones
      React.createElement('div', { style: { display: 'flex', gap: '10px', paddingTop: '4px' } },
        React.createElement('button', {
          onClick: onClose,
          style: {
            flex: 1, padding: '12px', background: 'var(--surface2)',
            border: '1px solid var(--border)', borderRadius: R_BTN,
            color: 'var(--muted)', fontSize: '11px', fontFamily: FONT_MONO, cursor: 'pointer'
          }
        }, 'CANCELAR'),
        React.createElement('button', {
          onClick: () => onExport(filename, format, {
            fontName, author, letterSpacing, wordSpacing,
            unitsPerEm, ascender, descender
          }),
          style: {
            flex: 2, padding: '12px', background: ACCENT, borderRadius: R_BTN,
            color: '#fff', fontWeight: '700', fontSize: '11px',
            fontFamily: FONT_MONO, border: 'none', cursor: 'pointer',
            transition: 'background .15s'
          }
        }, '⬇ EXPORTAR FUENTE')
      )
    )
  );
};

// ── Publish modal ─────────────────────────────
const PublishModal = ({ projectName, fontData, gridSize, onClose, onPublish, isPublishing, published, showSpaceMarker }) => {
  const [previewText, setPreviewText] = useState('HELLO WORLD');

  if (published) {
    return React.createElement(Overlay, { onClose },
      React.createElement('div', {
        style: {
          background: 'var(--surface)', border: '1px solid var(--border2)',
          borderRadius: R_CARD, padding: '36px 32px', width: '100%', maxWidth: '400px',
          boxShadow: '0 32px 80px rgba(0,0,0,0.25)', textAlign: 'center',
          display: 'flex', flexDirection: 'column', gap: '18px', alignItems: 'center'
        }
      },
        React.createElement('div', { style: { fontSize: '32px' } }, '🎉'),
        React.createElement('h3', { style: { fontFamily: FONT_PIXEL, fontSize: '10px', color: ACCENT, letterSpacing: '2px', margin: 0 } }, '¡PUBLICADO!'),
        React.createElement('p', { style: { fontFamily: FONT_MONO, fontSize: '11px', color: 'var(--muted)', lineHeight: '1.7', margin: 0 } },
          `"${projectName}" ya está visible en la galería pública de CodeShelf.`
        ),
        React.createElement('button', {
          onClick: onClose,
          style: {
            padding: '12px 28px', background: ACCENT, border: 'none', borderRadius: R_BTN,
            color: '#fff', fontFamily: FONT_MONO, fontWeight: '700', fontSize: '11px',
            letterSpacing: '2px', cursor: 'pointer'
          }
        }, 'CERRAR')
      )
    );
  }

  return React.createElement(Overlay, { onClose },
    React.createElement('div', {
      style: {
        background: 'var(--surface)', border: '1px solid var(--border2)',
        borderRadius: R_CARD, padding: '28px', width: '100%', maxWidth: '440px',
        boxShadow: '0 32px 80px rgba(0,0,0,0.25)',
        display: 'flex', flexDirection: 'column', gap: '18px'
      }
    },
      React.createElement('h3', {
        style: { fontFamily: FONT_PIXEL, fontSize: '10px', color: ACCENT, letterSpacing: '2px', margin: 0 }
      }, 'PUBLICAR FUENTE'),
      React.createElement('p', {
        style: { fontFamily: FONT_MONO, fontSize: '11px', color: 'var(--muted)', lineHeight: '1.7', margin: 0 }
      }, `Esto publicará "${projectName}" en la galería pública para que otros usuarios puedan verla y descargarla.`),

      React.createElement('div', {
        style: {
          background: 'var(--canvas-bg)', border: '1px solid var(--border)',
          borderRadius: R_BTN, padding: '14px'
        }
      },
        React.createElement('div', {
          style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }
        },
          React.createElement('span', { style: { fontFamily: FONT_MONO, fontSize: '8px', color: 'var(--muted)', letterSpacing: '2px' } }, 'TEXTO DE PREVIEW'),
          React.createElement('input', {
            value: previewText,
            onChange: e => setPreviewText(e.target.value),
            style: {
              background: 'none', border: 'none', outline: 'none',
              color: 'var(--text)', fontSize: '11px', fontFamily: FONT_MONO,
              textAlign: 'right', maxWidth: '160px'
            }
          })
        ),
        React.createElement(PixelPreview, { text: previewText, fontData, gridSize, pixelSize: 4, color: ACCENT, showSpaceMarker })
      ),

      React.createElement('div', { style: { display: 'flex', gap: '10px' } },
        React.createElement('button', {
          onClick: onClose,
          style: {
            flex: 1, padding: '12px', background: 'var(--surface2)',
            border: '1px solid var(--border)', borderRadius: R_BTN,
            color: 'var(--muted)', fontSize: '11px', fontFamily: FONT_MONO, cursor: 'pointer'
          }
        }, 'CANCELAR'),
        React.createElement('button', {
          onClick: () => onPublish(previewText),
          disabled: isPublishing,
          style: {
            flex: 2, padding: '12px', background: ACCENT, borderRadius: R_BTN,
            color: '#fff', fontWeight: '700', fontSize: '11px',
            fontFamily: FONT_MONO, border: 'none', cursor: 'pointer',
            opacity: isPublishing ? .6 : 1, transition: 'background .15s'
          }
        }, isPublishing ? 'PUBLICANDO...' : '🌐 PUBLICAR EN GALERÍA')
      )
    )
  );
};

// ── Preferences modal ─────────────────────────
const PreferencesModal = ({
  onClose,
  showSpaceMarker, setShowSpaceMarker,
  showCenterGuide, setShowCenterGuide,
  centerGuideCol, setCenterGuideCol,
  xHeightGuideRow, setXHeightGuideRow,
  gridSize
}) => {
  const [menu, setMenu] = useState('guides');
  const previewSize = 16;

  const menuButton = (id, label) => React.createElement('button', {
    key: id,
    onClick: () => setMenu(id),
    style: {
      width: '100%',
      textAlign: 'left',
      background: menu === id ? 'var(--accent3)' : 'transparent',
      border: menu === id ? '1px solid var(--border-accent)' : '1px solid transparent',
      borderRadius: R_BTN,
      color: menu === id ? 'var(--text)' : 'var(--muted)',
      fontFamily: FONT_MONO,
      fontSize: '10px',
      letterSpacing: '1px',
      padding: '9px 10px',
      cursor: 'pointer'
    }
  }, label);

  const toggleCard = (title, desc, val, setVal) =>
    React.createElement('button', {
      onClick: () => setVal(v => !v),
      style: {
        width: '100%', textAlign: 'left',
        background: val ? 'var(--accent3)' : 'var(--surface2)',
        border: val ? '1px solid var(--border-accent)' : '1px solid var(--border)',
        borderRadius: R_BTN, padding: '11px 12px', cursor: 'pointer'
      }
    },
      React.createElement('div', {
        style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }
      },
        React.createElement('span', { style: { fontFamily: FONT_MONO, fontSize: '11px', color: 'var(--text)' } }, title),
        React.createElement('span', {
          style: { fontFamily: FONT_MONO, fontSize: '10px', color: val ? ACCENT : 'var(--muted)' }
        }, val ? 'ACTIVO' : 'INACTIVO')
      ),
      React.createElement('div', {
        style: { fontFamily: FONT_MONO, fontSize: '9px', color: 'var(--muted2)', lineHeight: 1.5 }
      }, desc)
    );

  const guidePreview = React.createElement('div', {
    style: {
      width: '180px', height: '180px', alignSelf: 'center',
      position: 'relative', border: '1px solid var(--border)',
      borderRadius: '10px', overflow: 'hidden',
      background: 'var(--surface2)'
    }
  },
    React.createElement('div', {
      style: {
        position: 'absolute', inset: 0,
        display: 'grid',
        gridTemplateColumns: `repeat(${previewSize}, 1fr)`,
        gridTemplateRows: `repeat(${previewSize}, 1fr)`,
        gap: '1px', background: 'var(--grid-line)'
      }
    },
      Array(previewSize * previewSize).fill(0).map((_, i) =>
        React.createElement('div', { key: i, style: { background: 'var(--empty)' } })
      )
    ),
    React.createElement('div', {
      style: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: `${(xHeightGuideRow / Math.max(1, gridSize)) * 100}%`,
        height: '2px',
        background: 'rgba(191,69,69,.65)'
      }
    }),
    showCenterGuide && React.createElement('div', {
      style: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: `${(centerGuideCol / Math.max(1, gridSize)) * 100}%`,
        width: '2px',
        background: 'rgba(191,69,69,.8)'
      }
    })
  );

  return React.createElement(Overlay, { onClose },
    React.createElement(Modal, { style: { maxWidth: '760px', width: '760px', gap: '16px' } },
      React.createElement('h3', {
        style: { margin: 0, fontFamily: FONT_PIXEL, fontSize: '10px', color: ACCENT, letterSpacing: '2px' }
      }, 'PREFERENCIAS DEL EDITOR'),
      React.createElement('div', {
        style: { display: 'grid', gridTemplateColumns: '180px 1fr', gap: '14px', minHeight: '350px' }
      },
        React.createElement('aside', {
          style: {
            border: '1px solid var(--border)',
            borderRadius: R_BTN,
            background: 'var(--surface2)',
            padding: '10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }
        },
          React.createElement('div', { style: { fontFamily: FONT_MONO, fontSize: '8px', color: 'var(--muted)', letterSpacing: '2px' } }, 'MENÚ'),
          menuButton('guides', 'Guías'),
          menuButton('view', 'Vista')
        ),
        React.createElement('section', {
          style: {
            border: '1px solid var(--border)',
            borderRadius: R_BTN,
            background: 'var(--surface)',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }
        },
          menu === 'guides' && React.createElement(React.Fragment, null,
            React.createElement('p', {
              style: { margin: 0, fontFamily: FONT_MONO, fontSize: '10px', color: 'var(--muted)', lineHeight: '1.6' }
            }, 'Ajusta líneas guía y su posición. Usa la mini preview para ver dónde quedarán.'),
            toggleCard(
              'Guía vertical editable',
              'Muestra/oculta la línea vertical y permite mover su columna.',
              showCenterGuide,
              setShowCenterGuide
            ),
            React.createElement('div', {
              style: {
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                borderRadius: R_BTN,
                padding: '10px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }
            },
              React.createElement('div', { style: { fontFamily: FONT_MONO, fontSize: '10px', color: 'var(--muted)' } }, `Fila X-Height (${xHeightGuideRow})`),
              React.createElement('input', {
                type: 'range',
                min: 0,
                max: Math.max(0, gridSize - 1),
                value: xHeightGuideRow,
                onChange: e => setXHeightGuideRow(Number(e.target.value)),
                style: { width: '100%', accentColor: ACCENT, cursor: 'pointer' }
              }),
              React.createElement('div', { style: { fontFamily: FONT_MONO, fontSize: '10px', color: 'var(--muted)' } }, `Columna guía vertical (${centerGuideCol})`),
              React.createElement('input', {
                type: 'range',
                min: 0,
                max: Math.max(0, gridSize - 1),
                value: centerGuideCol,
                onChange: e => setCenterGuideCol(Number(e.target.value)),
                style: { width: '100%', accentColor: ACCENT, cursor: 'pointer' }
              })
            ),
            guidePreview
          ),
          menu === 'view' && React.createElement(React.Fragment, null,
            React.createElement('p', {
              style: { margin: 0, fontFamily: FONT_MONO, fontSize: '10px', color: 'var(--muted)', lineHeight: '1.6' }
            }, 'Ajustes visuales del editor para caracteres especiales.'),
            toggleCard(
              'Marcador del carácter espacio',
              'Activa una referencia visual para editar el espacio sin confundirlo con celdas vacías.',
              showSpaceMarker,
              setShowSpaceMarker
            ),
            guidePreview
          )
        )
      ),
      React.createElement(Btn, { onClick: onClose, style: { alignSelf: 'flex-end' } }, 'Listo')
    )
  );
};

// ── Guide overlay SVG ─────────────────────────
// Guías estilo foto de referencia: líneas rojas en posiciones de filas/columnas clave
const GuideOverlay = ({ gridSize, xHeightGuideRow, centerGuideCol, showCenterGuide }) => {
  const lines = [];

  const capRow       = 1;
  const xHeightRow   = Math.min(gridSize - 1, Math.max(0, xHeightGuideRow ?? Math.round(gridSize * 0.33)));
  const baselineRow  = getBaselineRow(gridSize);
  const descenderRow = gridSize - 1;

  const rowPct = (row) => (row / gridSize * 100).toFixed(4);

  // Zona de descender sombreada
  lines.push(
    React.createElement('rect', {
      key: 'desc-zone',
      x: '0', y: `${rowPct(baselineRow)}%`, width: '100%',
      height: `${(100 - Number(rowPct(baselineRow))).toFixed(4)}%`,
      fill: 'rgba(191,69,69,0.04)'
    })
  );

  // Línea vertical roja (a 2 columnas del borde, como la foto)
  if (showCenterGuide) {
    const centerColPct = (centerGuideCol / gridSize * 100).toFixed(4);
    lines.push(
      React.createElement('line', {
        key: 'vl', x1: `${centerColPct}%`, y1: '0', x2: `${centerColPct}%`, y2: '100%',
        stroke: 'rgba(191,69,69,0.70)', strokeWidth: '1.5'
      })
    );
  }

  // Helper: línea horizontal nombrada
  const guide = (key, row, label, opacity, strokeW, dash) => {
    const pct = rowPct(row);
    return [
      React.createElement('line', {
        key: `${key}-l`, x1: '0', y1: `${pct}%`, x2: '100%', y2: `${pct}%`,
        stroke: `rgba(191,69,69,${opacity})`, strokeWidth: strokeW || '1.4',
        ...(dash ? { strokeDasharray: dash } : {})
      }),
      React.createElement('text', {
        key: `${key}-t`, x: '99%', y: `${Math.max(2.5, Number(pct) - 0.6)}%`,
        fill: `rgba(191,69,69,${opacity * 0.8})`,
        fontSize: '6', textAnchor: 'end', fontFamily: 'monospace', fontWeight: '600'
      }, label)
    ];
  };

  lines.push(
    ...guide('cap',  capRow,       'CAP',   0.45, '1.3'),
    ...guide('xh',   xHeightRow,   'X-H',   0.40, '1.1', '3 3'),
    ...guide('base', baselineRow,  'BASE',  0.90, '1.8'),
    ...guide('desc', descenderRow, 'DESC',  0.35, '1.0', '2 2')
  );

  return React.createElement('svg', {
    style: {
      position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
      pointerEvents: 'none', zIndex: 5
    },
    xmlns: 'http://www.w3.org/2000/svg'
  }, ...lines);
};

// ── Toolbar icon (auto-sized) ─────────────────
const ToolIcon = ({ name, size = 16, active = false, style = {} }) =>
  React.createElement('img', {
    src: `./src/icons/${name}.svg`,
    style: {
      width: `${size}px`, height: `${size}px`, display: 'block',
      filter: active ? 'invert(1)' : 'var(--icon-filter)',
      opacity: active ? 1 : .65, flexShrink: 0, ...style
    }
  });

// ── Editor page ───────────────────────────────
export function EditorPage({
  user, isDark, toggleTheme,
  gridSize, currentChar, fontData, grid, isSaving,
  tool, setTool, previewText, setPreviewText,
  onPixelDown, onPixelEnter, onMouseUp,
  onSwitchChar, onClearCanvas, onInvert, onShift, onSave,
  onUndo, onRedo,
  onBack, onPublish, projectName,
  isPublishing, publishedOk, onResetPublish
}) {
  const [showExport,      setShowExport]      = useState(false);
  const [showPublish,     setShowPublish]     = useState(false);
  const [showPrefs,       setShowPrefs]       = useState(false);
  const [openFileMenu,    setOpenFileMenu]    = useState(false);
  const [openUserMenu,    setOpenUserMenu]    = useState(false);
  const [avatarColor,     setAvatarColor]     = useState(ACCENT);
  const [showGuides,      setShowGuides]      = useState(true);
  const [showSpaceMarker, setShowSpaceMarker] = useState(() => localStorage.getItem('cs-show-space-marker') !== '0');
  const [showCenterGuide, setShowCenterGuide] = useState(() => localStorage.getItem('cs-show-center-guide') !== '0');
  const [centerGuideCol,  setCenterGuideCol]  = useState(() => Number(localStorage.getItem('cs-center-guide-col') ?? 2));
  const [xHeightGuideRow, setXHeightGuideRow] = useState(() => Number(localStorage.getItem('cs-xheight-guide-row') ?? Math.round(gridSize * 0.33)));

  const avatarInit = (user?.displayName || user?.email || '?')[0].toUpperCase();

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

  useEffect(() => {
    const close = () => { setOpenFileMenu(false); setOpenUserMenu(false); };
    if (openFileMenu || openUserMenu) window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [openFileMenu, openUserMenu]);

  useEffect(() => {
    localStorage.setItem('cs-show-space-marker', showSpaceMarker ? '1' : '0');
  }, [showSpaceMarker]);
  useEffect(() => {
    localStorage.setItem('cs-show-center-guide', showCenterGuide ? '1' : '0');
  }, [showCenterGuide]);
  useEffect(() => {
    const clamped = Math.max(0, Math.min(gridSize - 1, centerGuideCol || 0));
    if (clamped !== centerGuideCol) setCenterGuideCol(clamped);
    localStorage.setItem('cs-center-guide-col', String(clamped));
  }, [centerGuideCol, gridSize]);
  useEffect(() => {
    const clamped = Math.max(0, Math.min(gridSize - 1, xHeightGuideRow || 0));
    if (clamped !== xHeightGuideRow) setXHeightGuideRow(clamped);
    localStorage.setItem('cs-xheight-guide-row', String(clamped));
  }, [xHeightGuideRow, gridSize]);

  const modeTools = [
    { id: 'pencil',   iconName: 'pencil',   label: 'LIBRE'   },
    { id: 'fill',     iconName: 'fill',     label: 'RELLENO' },
    { id: 'mirror-h', iconName: 'mirror-h', label: 'ESP. H'  },
    { id: 'mirror-v', iconName: 'mirror-v', label: 'ESP. V'  },
  ];

  const actionTools = [
    { iconName: 'arrow-left',  label: 'UNDO',   fn: onUndo,              title: 'Deshacer (Ctrl+Z)' },
    { iconName: 'arrow-right', label: 'REDO',   fn: onRedo,              title: 'Rehacer (Ctrl+Y)'  },
    { iconName: 'invert',      label: 'INV',    fn: onInvert },
    { iconName: 'arrow-up',    label: 'ARRIBA', fn: () => onShift('up')    },
    { iconName: 'arrow-down',  label: 'ABAJO',  fn: () => onShift('down')  },
    { iconName: 'mirror-h',    label: 'IZQ',    fn: () => onShift('left')  },
    { iconName: 'mirror-v',    label: 'DER',    fn: () => onShift('right') },
  ];

  const toolbarBase = {
    padding: '4px 5px', borderRadius: R_BTN, cursor: 'pointer',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', minWidth: '52px',
    fontFamily: FONT_MONO, border: 'none', transition: 'all .13s'
  };

  return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', minHeight: '100vh' } },

    /* ── NAVBAR ──────────────────────────── */
    React.createElement('nav', {
      style: {
        height: '52px', padding: '0 20px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: '1px solid var(--border)', background: 'var(--nav-bg)',
        backdropFilter: 'blur(16px)', position: 'sticky', top: 0, zIndex: 200
      }
    },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '4px' } },
        React.createElement('span', {
          onClick: onBack,
          style: {
            fontFamily: FONT_PIXEL, fontSize: '11px', color: ACCENT,
            letterSpacing: '2px', cursor: 'pointer', padding: '6px 10px',
            borderRadius: R_BTN, transition: 'opacity .15s'
          }
        }, 'CODESHELF'),

        // File dropdown
        React.createElement('div', { style: { position: 'relative' } },
          React.createElement('button', {
            onClick: e => { e.stopPropagation(); setOpenFileMenu(v => !v); },
            style: {
              fontFamily: FONT_MONO, fontSize: '9px', letterSpacing: '2px',
              color: 'var(--muted)', padding: '6px 12px', borderRadius: R_BTN,
              background: 'none', border: 'none', cursor: 'pointer',
              transition: 'color .15s, background .15s'
            }
          }, 'ARCHIVO'),
          openFileMenu && React.createElement('div', {
            onClick: e => e.stopPropagation(),
            style: {
              position: 'absolute', top: 'calc(100% + 8px)', left: 0,
              background: 'var(--surface)', border: '1px solid var(--border2)',
              borderRadius: '10px', minWidth: '210px', zIndex: 300,
              boxShadow: 'var(--shadow-card)', overflow: 'hidden', padding: '6px'
            }
          },
            [
              { icon: 'fonts',   label: 'Mis proyectos',               fn: onBack },
              { icon: 'save',    label: 'Guardar proyecto (Ctrl+S)',    fn: onSave },
              { icon: 'theme',   label: 'Preferencias del editor',     fn: () => { setShowPrefs(true); setOpenFileMenu(false); } },
              { icon: 'export',  label: 'Exportar fuente',             fn: () => { setShowExport(true); setOpenFileMenu(false); } },
              { icon: 'publish', label: 'Publicar en galería',         fn: () => { setShowPublish(true); setOpenFileMenu(false); } },
            ].map(({ icon, label, fn }) =>
              React.createElement('button', {
                key: label, onClick: () => { fn(); setOpenFileMenu(false); },
                style: {
                  display: 'flex', alignItems: 'center', gap: '10px',
                  width: '100%', padding: '10px 12px', background: 'none', border: '1px solid transparent', borderRadius: '8px',
                  cursor: 'pointer', fontFamily: FONT_MONO, fontSize: '11px',
                  color: 'var(--muted)', textAlign: 'left', transition: 'background .12s, color .12s'
                },
                onMouseEnter: e => { e.currentTarget.style.background = 'var(--surface2)'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text)'; },
                onMouseLeave: e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.color = 'var(--muted)'; }
              },
                React.createElement(ToolIcon, { name: icon, size: 14, style: { opacity: .5, filter: 'var(--icon-filter)' } }),
                label
              )
            )
          )
        ),

        React.createElement('span', {
          style: {
            fontFamily: FONT_MONO, fontSize: '9px', letterSpacing: '2px',
            color: 'var(--muted2)', paddingLeft: '8px'
          }
        }, projectName || '')
      ),

      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
        // Indicador de guardado (solo visible al guardar explícitamente)
        isSaving && React.createElement('span', {
          style: { fontFamily: FONT_MONO, fontSize: '9px', color: 'var(--muted2)', letterSpacing: '2px' }
        }, 'GUARDANDO...'),

        React.createElement('button', {
          onClick: () => setShowSpaceMarker(v => !v),
          title: showSpaceMarker ? 'Ocultar marcador de espacio' : 'Mostrar marcador de espacio',
          style: {
            height: '32px', padding: '0 10px', borderRadius: R_BTN,
            background: showSpaceMarker ? ACCENT : 'var(--surface2)',
            border: showSpaceMarker ? 'none' : '1px solid var(--border)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
            fontFamily: FONT_MONO, fontSize: '8px', letterSpacing: '1px',
            color: showSpaceMarker ? '#fff' : 'var(--muted)', transition: 'all .15s'
          }
        },
          React.createElement('span', { style: { fontSize: '11px', lineHeight: 1 } }, '␠'),
          'ESPACIO'
        ),

        React.createElement('button', {
          onClick: toggleTheme, title: isDark ? 'Tema claro' : 'Tema oscuro',
          style: {
            width: '32px', height: '32px', borderRadius: '50%',
            background: 'var(--surface2)', border: '1px solid var(--border)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background .15s'
          }
        },
          React.createElement(ToolIcon, { name: 'theme', size: 14 })
        ),

        // Avatar + menú usuario
        React.createElement('div', { style: { position: 'relative' } },
          React.createElement('div', {
            onClick: e => { e.stopPropagation(); setOpenUserMenu(v => !v); },
            style: {
              width: '32px', height: '32px', borderRadius: '50%',
              border: `1.5px solid ${avatarColor}`, background: avatarColor + '20',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: FONT_PIXEL, fontSize: '9px', color: avatarColor,
              cursor: 'pointer', userSelect: 'none', transition: 'background .15s'
            }
          }, avatarInit),

          openUserMenu && React.createElement('div', {
            onClick: e => e.stopPropagation(),
            style: {
              position: 'absolute', top: 'calc(100% + 10px)', right: 0,
              background: 'var(--surface)', border: '1px solid var(--border2)',
              borderRadius: '12px', minWidth: '210px', zIndex: 300,
              boxShadow: '0 20px 56px rgba(0,0,0,0.18)', overflow: 'hidden', padding: '5px 0'
            }
          },
            React.createElement('div', {
              style: { padding: '12px 16px', borderBottom: '1px solid var(--border)', fontFamily: FONT_MONO, fontSize: '10px', color: 'var(--muted)' }
            }, user?.email || ''),
            [
              { icon: 'explore', label: 'Explorar fuentes', fn: () => window.location.href = 'social.html' },
              { icon: 'fonts',   label: 'Mis proyectos',    fn: onBack },
              { icon: 'user',    label: 'Mi perfil',        fn: () => window.location.href = 'profile.html' },
            ].map(({ icon, label, fn }) =>
              React.createElement('button', {
                key: label, onClick: () => { fn(); setOpenUserMenu(false); },
                style: {
                  display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '9px 16px',
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontFamily: FONT_MONO, fontSize: '11px', color: 'var(--muted)', textAlign: 'left',
                  transition: 'background .12s, color .12s'
                },
                onMouseEnter: e => { e.currentTarget.style.background = 'var(--surface2)'; e.currentTarget.style.color = 'var(--text)'; },
                onMouseLeave: e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--muted)'; }
              },
                React.createElement(ToolIcon, { name: icon, size: 14, style: { opacity: .5, filter: 'var(--icon-filter)' } }),
                label
              )
            ),
            React.createElement('div', { style: { borderTop: '1px solid var(--border)', marginTop: '4px', paddingTop: '4px' } },
              React.createElement('button', {
                onClick: () => signOut(auth).then(() => window.location.replace('index.html')),
                style: {
                  display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '9px 16px',
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontFamily: FONT_MONO, fontSize: '11px', color: ACCENT, textAlign: 'left'
                }
              },
                React.createElement(ToolIcon, { name: 'logout', size: 14, style: { opacity: .65 } }),
                'Cerrar sesión'
              )
            )
          )
        )
      )
    ),

    /* ── MAIN LAYOUT ─────────────────────── */
    React.createElement('main', {
      style: {
        padding: '20px', maxWidth: '1200px', margin: '0 auto', width: '100%',
        display: 'grid', gridTemplateColumns: '220px 1fr 380px', gap: '18px', alignItems: 'start'
      }
    },

      /* ── Left Preview Panel ── */
      React.createElement('aside', {
        style: {
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '12px', padding: '14px', position: 'sticky', top: '68px',
          boxShadow: 'var(--shadow-card)', display: 'flex', flexDirection: 'column', gap: '10px'
        }
      },
        React.createElement('div', {
          style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
        },
          React.createElement('span', { style: { fontFamily: FONT_MONO, fontSize: '8px', letterSpacing: '3px', color: 'var(--muted)' } }, 'PREVIEW'),
          React.createElement('input', {
            value: previewText, onChange: e => setPreviewText(e.target.value),
            placeholder: 'texto...',
            style: {
              background: 'none', border: 'none', outline: 'none',
              color: 'var(--muted2)', fontSize: '10px', fontFamily: FONT_MONO,
              textAlign: 'right', width: '90px'
            }
          })
        ),
        React.createElement('div', {
          style: {
            background: 'var(--canvas-bg)', borderRadius: '6px', padding: '6px',
            height: '50px', overflowX: 'auto', overflowY: 'hidden',
            display: 'flex', alignItems: 'center', whiteSpace: 'nowrap',
            scrollbarWidth: 'thin'
          }
        },
          React.createElement('div', {
            style: { display: 'flex', gap: '0px', alignItems: 'center', flexShrink: 0 }
          },
            previewText.split('').map((ch, ci) => {
              const glyph = fontData[ch];
              const sz = Math.min(gridSize, 14), px = 2;
              const isSpace = ch === ' ';
              return React.createElement('div', {
                key: ci,
                style: {
                  display: 'grid', gridTemplateColumns: `repeat(${sz},${px}px)`,
                  marginRight: '1px', flexShrink: 0,
                  border: (isSpace && showSpaceMarker) ? '1px dashed var(--border)' : 'none',
                  borderRadius: '2px',
                  minWidth: isSpace ? `${sz * px}px` : undefined
                }
              },
                isSpace ? null : Array(sz * sz).fill(0).map((_, pi) =>
                  React.createElement('div', {
                    key: pi,
                    style: { width: `${px}px`, height: `${px}px`, background: glyph?.[pi] ? ACCENT : 'transparent' }
                  })
                )
              );
            })
          )
        )
      ),

      /* Canvas section */
      React.createElement('section', {
        style: {
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px',
          background: 'var(--surface)', borderRadius: R_CARD,
          border: '1px solid var(--border)', padding: '24px',
          boxShadow: 'var(--shadow-card)'
        }
      },
        /* Char header */
        React.createElement('div', {
          style: { display: 'flex', alignItems: 'center', gap: '16px', width: '100%' }
        },
          React.createElement('div', {
            style: { fontFamily: FONT_PIXEL, fontSize: '40px', lineHeight: 1, color: ACCENT, minWidth: '52px', textAlign: 'center' }
          }, currentChar === ' ' ? '·' : currentChar),
          React.createElement('div', { style: { flex: 1 } },
            React.createElement('div', {
              style: { fontFamily: FONT_MONO, fontSize: '9px', color: 'var(--muted)', letterSpacing: '2px', marginBottom: '4px' }
            }, 'EDITANDO CARÁCTER'),
            React.createElement('div', {
              style: { fontFamily: FONT_MONO, fontSize: '11px', color: 'var(--text)', letterSpacing: '1px' }
            }, `U+${(currentChar.codePointAt(0) || 0).toString(16).toUpperCase().padStart(4,'0')} · Grid ${gridSize}×${gridSize}`),
            (currentChar === ' ' && showSpaceMarker) && React.createElement('div', {
              style: { fontFamily: FONT_MONO, fontSize: '9px', color: 'var(--muted2)', letterSpacing: '1px', marginTop: '4px' }
            }, 'Marcador de espacio activo')
          )
        ),

        /* Toolbar */
        React.createElement('div', {
          style: {
            display: 'flex', gap: '1px', alignItems: 'center', flexWrap: 'wrap',
            padding: '8px', background: 'var(--surface2)', borderRadius: R_CARD,
            border: '1px solid var(--border)', width: '100%'
          }
        },
          ...modeTools.map(t =>
            React.createElement('button', {
              key: t.id, onClick: () => setTool(t.id), title: t.label,
              style: {
                ...toolbarBase,
                background: tool === t.id ? ACCENT : 'transparent',
                color: tool === t.id ? '#fff' : 'var(--muted)',
              }
            },
              React.createElement(ToolIcon, { name: t.iconName, size: 16, active: tool === t.id }),
              React.createElement('span', { style: { fontSize: '8px', letterSpacing: '1px' } }, t.label)
            )
          ),
          React.createElement('div', { style: { width: '1px', height: '44px', background: 'var(--border)', margin: '0 2px' } }),
          ...actionTools.map((t, i) =>
            React.createElement('button', {
              key: i, onClick: t.fn, title: t.label,
              style: {
                ...toolbarBase,
                background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)'
              },
              onMouseEnter: e => { e.currentTarget.style.background = 'var(--surface3)'; e.currentTarget.style.borderColor = 'var(--border2)'; },
              onMouseLeave: e => { e.currentTarget.style.background = 'var(--surface)'; e.currentTarget.style.borderColor = 'var(--border)'; }
            },
              React.createElement(ToolIcon, { name: t.iconName, size: 16 }),
              React.createElement('span', { style: { fontSize: '8px', letterSpacing: '1px' } }, t.label)
            )
          )
        ),

        /* Pixel canvas */
        React.createElement('div', {
          style: { position: 'relative', width: 'min(78vw, 460px)', height: 'min(78vw, 460px)' }
        },
          React.createElement('div', {
            style: {
              display: 'grid',
              gridTemplateColumns: `repeat(${gridSize}, 1fr)`,
              width: '100%', height: '100%',
              gap: '1px', background: 'var(--grid-line)',
              borderRadius: R_CARD, overflow: 'hidden',
              border: `2px solid var(--border-accent)`,
              cursor: 'crosshair', userSelect: 'none',
              boxShadow: 'var(--shadow-card)'
            },
            onMouseUp: onMouseUp, onMouseLeave: onMouseUp
          },
            grid.map((active, i) =>
              React.createElement('div', {
                key: i,
                onMouseDown: e => { e.preventDefault(); onPixelDown(i, active, e.button === 2); },
                onMouseEnter: () => onPixelEnter(i),
                onContextMenu: e => e.preventDefault(),
                style: {
                  width: '100%', height: '100%', transition: 'background .03s',
                  background: active ? ACCENT : 'var(--empty)',
                }
              })
            )
          ),
          (showSpaceMarker && currentChar === ' ') && React.createElement('div', {
            style: { position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 4 }
          },
            React.createElement('div', {
              style: {
                position: 'absolute', top: '2px', bottom: '2px', left: '50%',
                width: '1px', transform: 'translateX(-50%)',
                background: 'var(--border-accent)', opacity: .8
              }
            })
          ),
          React.createElement(GuideOverlay, {
            gridSize,
            xHeightGuideRow,
            centerGuideCol,
            showCenterGuide
          })
        ),

        // preview moved to left sidebar below
      ),

      /* ── Characters panel ── */
      React.createElement('aside', {
        style: {
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: R_CARD, padding: '18px', position: 'sticky', top: '68px',
          boxShadow: 'var(--shadow-card)'
        }
      },
        React.createElement('div', {
          style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }
        },
          React.createElement(Label, { style: { fontSize: '8px', letterSpacing: '3px', color: 'var(--muted)' } }, 'CARACTERES'),
          React.createElement('button', {
            onClick: onClearCanvas,
            style: {
              background: 'rgba(191,69,69,0.07)', border: '1px solid rgba(191,69,69,0.18)',
              borderRadius: R_BTN, padding: '5px 10px', color: ACCENT, fontSize: '9px',
              fontFamily: FONT_MONO, cursor: 'pointer', letterSpacing: '1px'
            }
          }, 'LIMPIAR')
        ),

        React.createElement('div', {
          style: {
            display: 'flex', gap: '8px', marginBottom: '14px',
            padding: '10px', background: 'var(--surface2)', borderRadius: R_BTN,
            border: '1px solid var(--border)'
          }
        },
          [
            { val: Object.values(fontData).filter(g => g?.some(Boolean)).length, lbl: 'GLIFOS'  },
            { val: gridSize,                                                      lbl: 'GRID PX' },
            { val: grid.filter(Boolean).length,                                  lbl: 'PÍXELES' }
          ].map(({ val, lbl }) =>
            React.createElement('div', { key: lbl, style: { flex: 1, textAlign: 'center' } },
              React.createElement('div', { style: { fontSize: '17px', fontWeight: '700', color: ACCENT, fontFamily: FONT_MONO } }, val),
              React.createElement('div', { style: { fontSize: '7px', color: 'var(--muted)', letterSpacing: '2px', fontFamily: FONT_MONO, marginTop: '2px' } }, lbl)
            )
          )
        ),

        React.createElement('div', {
          style: {
            display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: '4px',
            maxHeight: '58vh', overflowY: 'auto', paddingRight: '2px'
          }
        },
          TECLADO.map(t => {
            const configured = fontData?.[t]?.some(Boolean);
            const isActive   = currentChar === t;
            return React.createElement('button', {
              key: t, onClick: () => onSwitchChar(t), title: t,
              style: {
                height: '46px', borderRadius: R_BTN,
                border: isActive ? 'none' : `1px solid ${configured ? 'rgba(191,69,69,0.22)' : 'var(--border)'}`,
                background: isActive ? ACCENT : configured ? 'rgba(191,69,69,0.07)' : 'var(--surface2)',
                color: isActive ? '#fff' : configured ? ACCENT : 'var(--muted)',
                fontWeight: '700', fontSize: '13px', fontFamily: FONT_MONO, cursor: 'pointer',
                position: 'relative',
                boxShadow: isActive ? `0 3px 10px ${ACCENT}40` : 'none', transition: 'all .1s'
              }
            },
              t === ' ' ? '·' : t,
              (showSpaceMarker && t === ' ') && React.createElement('div', {
                style: {
                  position: 'absolute', top: '8px', bottom: '8px', left: '50%',
                  width: '1px', transform: 'translateX(-50%)',
                  background: isActive ? 'rgba(255,255,255,0.9)' : 'var(--border-accent)',
                  opacity: .8
                }
              }),
              configured && !isActive && React.createElement('div', {
                style: {
                  position: 'absolute', top: '4px', right: '4px',
                  width: '4px', height: '4px', borderRadius: '50%', background: ACCENT
                }
              })
            );
          })
        )
      )
    ),

    // Modals
    showExport && React.createElement(ExportModal, {
      projectName, fontData, gridSize,
      previewText,
      onClose: () => setShowExport(false),
      onExport: (filename, format, meta) => {
        try {
          const safeFilename = (filename || projectName || 'mi-fuente').trim() || 'mi-fuente';
          buildAndDownload(fontData, gridSize, safeFilename, format, meta);
          setShowExport(false);
        } catch (err) {
          alert(err?.message || 'No se pudo exportar la fuente.');
        }
      }
    }),

    showPublish && React.createElement(PublishModal, {
      projectName, fontData, gridSize,
      showSpaceMarker,
      isPublishing, published: publishedOk,
      onClose: () => { setShowPublish(false); onResetPublish && onResetPublish(); },
      onPublish: (prevText) => onPublish && onPublish(prevText)
    }),

    showPrefs && React.createElement(PreferencesModal, {
      onClose: () => setShowPrefs(false),
      showSpaceMarker,
      setShowSpaceMarker,
      showCenterGuide,
      setShowCenterGuide,
      centerGuideCol,
      setCenterGuideCol,
      xHeightGuideRow,
      setXHeightGuideRow,
      gridSize
    })
  );
}
