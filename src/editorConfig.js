// ─────────────────────────────────────────────
//  editorConfig.js
//  Configuración centralizada del editor
// ─────────────────────────────────────────────

export const EDITOR_STORAGE_KEYS = {
  showSpaceMarker: 'cs-show-space-marker',
  showCenterGuide: 'cs-show-center-guide',
  centerGuideCol: 'cs-center-guide-col',
  capGuideRow: 'cs-cap-guide-row',
  xHeightGuideRow: 'cs-xheight-guide-row',
  baselineGuideRow: 'cs-baseline-guide-row',
  descGuideRow: 'cs-desc-guide-row',
};

const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

export const readBoolSetting = (key, fallback = false) => {
  const raw = localStorage.getItem(key);
  if (raw == null) return fallback;
  return raw === '1';
};

export const readNumberSetting = (key, fallback) => {
  const raw = localStorage.getItem(key);
  if (raw == null) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const writeSetting = (key, value) => {
  localStorage.setItem(key, String(value));
};

export const defaultGuideRows = (gridSize) => ({
  cap: 1,
  xHeight: Math.round(gridSize * 0.33),
  baseline: Math.round(gridSize * 0.75),
  descender: gridSize - 1,
});

export const clampGuideRows = (rows, gridSize) => {
  const max = Math.max(0, gridSize - 1);
  return {
    cap: clamp(rows.cap, 0, max),
    xHeight: clamp(rows.xHeight, 0, max),
    baseline: clamp(rows.baseline, 0, max),
    descender: clamp(rows.descender, 0, max),
  };
};
