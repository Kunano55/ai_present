/* ═══════════════════════════════════════════════════════════
   theme.js — อ่านค่าสีจาก CSS variables (single source of truth)
   เพื่อให้แผนภาพ SVG ที่สร้างด้วย JS เปลี่ยนธีมตามได้
   ═══════════════════════════════════════════════════════════ */

const MAP = {
  surface:   '--surface',
  surface2:  '--surface-2',
  line:      '--line',
  lineSoft:  '--line-soft',
  txt:       '--txt',
  txt2:      '--txt-2',
  txt3:      '--txt-3',
  accent:    '--accent',
  score:     '--c-score',
  feat:      '--c-feat',
  model:     '--c-model',
  voice:     '--c-voice',
  out:       '--c-out',
  ok:        '--c-ok',
  bad:       '--c-bad',
  track:     '--c-track',
  barBase:   '--c-bar-base',
  barNN:     '--c-bar-nn',
  barBest:   '--c-bar-best',
  barCeil:   '--c-bar-ceil',
  onBand:    '--c-on-band',
  keyWhite:  '--key-white',
  keyBlack:  '--key-black',
};

/** อ่านค่าสีปัจจุบันจาก CSS (เรียกซ้ำได้หลังเปลี่ยนธีม) */
export function readColors() {
  const cs = getComputedStyle(document.documentElement);
  const out = {};
  for (const [key, v] of Object.entries(MAP)) {
    const val = cs.getPropertyValue(v).trim();
    out[key] = val || '#888888';
  }
  return out;
}

export function getTheme() {
  return document.documentElement.dataset.theme || 'light';
}

export function setTheme(name) {
  document.documentElement.dataset.theme = name;
  try { localStorage.setItem('nnsvs-theme', name); } catch { /* ignore */ }
}

export function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem('nnsvs-theme'); } catch { /* ignore */ }
  // ดีฟอลต์ = สว่าง (minimal) เว้นแต่ผู้ใช้เคยสลับไว้
  setTheme(saved === 'dark' || saved === 'light' ? saved : 'light');
  return getTheme();
}

export function toggleTheme() {
  const next = getTheme() === 'light' ? 'dark' : 'light';
  setTheme(next);
  return next;
}
