/* ═══════════════════════════════════════════════════════════
   main.js — ประกอบทุกส่วนของเด็ค
   ═══════════════════════════════════════════════════════════ */

import { Deck } from './deck.js';
import { SvsDemo } from './demo.js';
import { Pipeline } from './pipeline.js';
import { initTheme, toggleTheme, readColors } from './theme.js';
import {
  buildSingleStream, buildMultiStream, buildF0Chart, buildDonut,
  buildKeyboard, buildMosChart, buildFixList, buildFindings, animateCounters,
} from './charts.js';

/* ── เส้นคลื่นเดียว จาง ๆ เป็นพื้นหลังสไลด์เปิด ── */
function backgroundWave(canvas) {
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return;
  let w = 0, h = 0, dpr = 1, raf = 0, t = 0;

  const resize = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = Math.max(1, w * dpr);
    canvas.height = Math.max(1, h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const draw = () => {
    const c = readColors();
    ctx.clearRect(0, 0, w, h);
    ctx.beginPath();
    const base = h * 0.84;
    for (let x = 0; x <= w; x += 3) {
      const env = Math.sin((x / w) * Math.PI) ** 1.6;
      const y = base
        + Math.sin(x * 0.006 + t * 0.5) * h * 0.045 * env
        + Math.sin(x * 0.017 - t * 0.32) * h * 0.014 * env;
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = c.txt3;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.globalAlpha = 1;
    t += 0.014;
    raf = requestAnimationFrame(draw);
  };

  resize();
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => {
    cancelAnimationFrame(raf);
    if (!document.hidden) raf = requestAnimationFrame(draw);
  });
  draw();
}

/* ── toast ── */
let toastTimer = 0;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
}

/* ── ประกอบ ── */
async function boot() {
  initTheme();
  backgroundWave(document.getElementById('bgWave'));

  const demo = new SvsDemo(document.getElementById('s-svs'));
  const pipeline = new Pipeline(document.getElementById('pipeHost'), {
    caption: document.getElementById('pipeCaption'),
    dots: document.getElementById('pipeDots'),
    prev: document.getElementById('pipePrev'),
    next: document.getElementById('pipeNext'),
    play: document.getElementById('pipePlay'),
    playLabel: document.getElementById('pipePlayLabel'),
  });

  // แผนภาพทั้งหมด — เก็บตัวควบคุมไว้เพื่อให้ theme toggle เรียกเล่นอนิเมชั่นซ้ำได้
  let f0, donut, kb, mos;
  const buildDiagrams = () => {
    buildSingleStream(document.getElementById('vizSingle'));
    buildMultiStream(document.getElementById('vizMulti'));
    f0 = buildF0Chart(document.getElementById('f0Host'));
    donut = buildDonut(document.getElementById('donutHost'));
    kb = buildKeyboard(document.getElementById('kbHost'));
    mos = buildMosChart(document.getElementById('mosChart'));
  };
  buildDiagrams();
  buildFixList(document.getElementById('fixList'));
  buildFindings(document.getElementById('findings'));

  await demo.init();
  if (!demo.fromRepo) toast('อ่าน untitled.mid ตรง ๆ ไม่ได้ (CORS) → ใช้โน้ตที่ parse ไว้ล่วงหน้าแทน');

  const deck = new Deck({
    onActivate: (slide) => {
      slide.classList.add('is-shown');
      document.body.classList.toggle('on-title', slide.id === 's-title');
      switch (slide.id) {
        case 's-title': animateCounters(slide); break;
        case 's-svs': demo.activate(); break;
        case 's-pipeline': pipeline.activate(); break;
        case 's-acoustic': f0.play(); break;
        case 's-dataset': donut.play(); kb.play(); animateCounters(slide); break;
        case 's-results': mos.play(); animateCounters(slide); break;
      }
    },
    onDeactivate: (slide) => {
      if (!slide) return;
      if (slide.id === 's-svs') demo.deactivate();
      if (slide.id === 's-pipeline') pipeline.deactivate();
    },
  });
  deck.init();

  // ── สลับธีม: สร้างแผนภาพใหม่ด้วย palette ใหม่ แล้วเล่นอนิเมชั่นของสไลด์ปัจจุบันซ้ำ ──
  const retheme = () => {
    const name = toggleTheme();
    buildDiagrams();
    pipeline.rebuild();
    demo.retheme?.();
    const cur = deck.slides[deck.i];
    deck.hooks.onDeactivate?.(cur, deck.i);
    deck.hooks.onActivate?.(cur, deck.i);
    toast(name === 'dark' ? 'ธีมมืด (minimal)' : 'ธีมสว่าง (minimal)');
  };
  document.getElementById('btnTheme').addEventListener('click', retheme);

  window.addEventListener('keydown', e => {
    if (e.target.matches('input, textarea')) return;
    if (e.key === 't' || e.key === 'T' || e.key === 'ๆ') retheme();
    if ((e.key === 's' || e.key === 'ห') && deck.slides[deck.i].id === 's-svs') demo.play();
  });

  window.deck = deck;   // เผื่อ debug
  window.retheme = retheme;
}

boot().catch(err => {
  console.error(err);
  toast('เกิดข้อผิดพลาด: ' + (err?.message || err));
});
