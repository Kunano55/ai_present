/* ═══════════════════════════════════════════════════════════
   main.js — ประกอบทุกส่วนของเด็ค
   ═══════════════════════════════════════════════════════════ */

import { Deck } from './deck.js';
import { SvsDemo } from './demo.js';
import { Pipeline } from './pipeline.js';
import {
  buildSingleStream, buildMultiStream, buildF0Chart, buildDonut,
  buildKeyboard, buildMosChart, buildFixList, buildFindings, animateCounters,
} from './charts.js';

/* ── คลื่นพื้นหลัง (canvas) ── */
function backgroundWave(canvas) {
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return;                     // canvas ใช้ไม่ได้ → ข้ามพื้นหลังเคลื่อนไหว
  let w = 0, h = 0, dpr = 1, raf = 0, t = 0;

  const resize = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = Math.max(1, w * dpr);
    canvas.height = Math.max(1, h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const waves = [
    { a: 0.20, f: 0.0042, sp: 0.34, y: 0.78, c: '69,224,200', lw: 1.4 },
    { a: 0.15, f: 0.0061, sp: -0.26, y: 0.83, c: '122,167,255', lw: 1.2 },
    { a: 0.11, f: 0.0088, sp: 0.46, y: 0.88, c: '255,122,184', lw: 1.1 },
  ];

  const draw = () => {
    ctx.clearRect(0, 0, w, h);
    waves.forEach((v, k) => {
      ctx.beginPath();
      const base = h * v.y;
      for (let x = 0; x <= w; x += 4) {
        const env = Math.sin((x / w) * Math.PI) ** 1.2;
        const y = base
          + Math.sin(x * v.f + t * v.sp) * h * v.a * 0.5 * env
          + Math.sin(x * v.f * 2.3 + t * v.sp * 1.7 + k) * h * v.a * 0.18 * env;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(${v.c},.42)`;
      ctx.lineWidth = v.lw;
      ctx.shadowBlur = 14;
      ctx.shadowColor = `rgba(${v.c},.35)`;
      ctx.stroke();
      ctx.shadowBlur = 0;
    });
    t += 0.016;
    raf = requestAnimationFrame(draw);
  };

  resize();
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelAnimationFrame(raf);
    else { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); }
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

  buildSingleStream(document.getElementById('vizSingle'));
  buildMultiStream(document.getElementById('vizMulti'));
  const f0 = buildF0Chart(document.getElementById('f0Host'));
  const donut = buildDonut(document.getElementById('donutHost'));
  const kb = buildKeyboard(document.getElementById('kbHost'));
  const mos = buildMosChart(document.getElementById('mosChart'));
  buildFixList(document.getElementById('fixList'));
  buildFindings(document.getElementById('findings'));

  await demo.init();
  if (!demo.fromRepo) toast('อ่าน untitled.mid ตรง ๆ ไม่ได้ (CORS) → ใช้โน้ตที่ parse ไว้ล่วงหน้าแทน');

  const deck = new Deck({
    onActivate: (slide) => {
      slide.classList.add('is-shown');
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

  // ปุ่มลัดสำหรับคนดู
  window.addEventListener('keydown', e => {
    if (e.target.matches('input, textarea')) return;
    if (e.key === 's' || e.key === 'ห') {          // s = sing
      if (deck.slides[deck.i].id === 's-svs') demo.play();
    }
  });

  window.deck = deck;   // เผื่อ debug
}

boot().catch(err => {
  console.error(err);
  toast('เกิดข้อผิดพลาด: ' + (err?.message || err));
});
