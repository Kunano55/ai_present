/* ═══════════════════════════════════════════════════════════
   main.js — ประกอบทุกส่วนของเด็ค
   ลำดับสำคัญ: ผูกปุ่ม/นำทางให้พร้อมใช้ก่อน แล้วค่อยโหลด MIDI ทีหลัง
   ═══════════════════════════════════════════════════════════ */

import { Deck } from './deck.js?v=3';
import { SvsDemo } from './demo.js?v=3';
import { Pipeline } from './pipeline.js?v=3';
import { initTheme, getTheme, toggleTheme, readColors } from './theme.js?v=3';
import {
  buildSingleStream, buildMultiStream, buildF0Chart, buildDonut,
  buildKeyboard, buildMosChart, buildFixList, buildFindings, animateCounters,
} from './charts.js?v=3';

/* ── เส้นคลื่นเดียว จาง ๆ เป็นพื้นหลังสไลด์เปิด ──
   หมายเหตุ: อ่าน palette ครั้งเดียว/เมื่อธีมเปลี่ยน ห้ามเรียก getComputedStyle ในลูป 60fps ── */
function backgroundWave(canvas, getColors) {
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return { refresh() {} };
  let w = 0, h = 0, dpr = 1, raf = 0, t = 0, stroke = '#8b9099';

  const resize = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = Math.max(1, w * dpr);
    canvas.height = Math.max(1, h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const refresh = () => { stroke = getColors().txt3; };

  const draw = () => {
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
    ctx.strokeStyle = stroke;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.globalAlpha = 1;
    t += 0.014;
    raf = requestAnimationFrame(draw);
  };

  resize(); refresh();
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => {
    cancelAnimationFrame(raf);
    if (!document.hidden) raf = requestAnimationFrame(draw);
  });
  draw();
  return { refresh };
}

/* ── toast ── */
let toastTimer = 0;
function toast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

/* ── ประกอบ ── */
async function boot() {
  initTheme();
  const wave = backgroundWave(document.getElementById('bgWave'), readColors);

  const demo = new SvsDemo(document.getElementById('s-svs'));
  const pipeline = new Pipeline(document.getElementById('pipeHost'), {
    caption: document.getElementById('pipeCaption'),
    dots: document.getElementById('pipeDots'),
    prev: document.getElementById('pipePrev'),
    next: document.getElementById('pipeNext'),
    play: document.getElementById('pipePlay'),
    playLabel: document.getElementById('pipePlayLabel'),
  });

  // แผนภาพทั้งหมด (เก็บ handle ไว้ให้ theme toggle เรียกอนิเมชั่นซ้ำได้)
  let f0, donut, kb, mos;
  const buildDiagrams = () => {
    buildSingleStream(document.getElementById('vizSingle'));
    buildMultiStream(document.getElementById('vizMulti'));
    f0 = buildF0Chart(document.getElementById('f0Host'));
    donut = buildDonut(document.getElementById('donutHost'));
    kb = buildKeyboard(document.getElementById('kbHost'));
    mos = buildMosChart(document.getElementById('mosChart'));
  };
  const safe = (label, fn) => { try { fn(); } catch (err) { console.error(`[${label}]`, err); } };

  safe('diagrams', buildDiagrams);
  safe('fixlist', () => buildFixList(document.getElementById('fixList')));
  safe('findings', () => buildFindings(document.getElementById('findings')));

  const deck = new Deck({
    onActivate: (slide) => {
      slide.classList.add('is-shown');
      document.body.classList.toggle('on-title', slide.id === 's-title');
      switch (slide.id) {
        case 's-title': animateCounters(slide); break;
        case 's-svs': demo.activate(); break;
        case 's-pipeline': pipeline.activate(); break;
        case 's-acoustic': f0?.play(); break;
        case 's-dataset': donut?.play(); kb?.play(); animateCounters(slide); break;
        case 's-results': mos?.play(); animateCounters(slide); break;
      }
    },
    onDeactivate: (slide) => {
      if (!slide) return;
      if (slide.id === 's-svs') demo.deactivate();
      if (slide.id === 's-pipeline') pipeline.deactivate();
    },
  });
  deck.init();

  /* ── สลับธีม: สลับ attribute ก่อนเสมอ แล้วค่อย rebuild แผนภาพ ── */
  const retheme = () => {
    const name = toggleTheme();                 // 1) เปลี่ยนธีมทันที (CSS variables)
    wave.refresh();                             // 2) สีเส้นพื้นหลัง
    safe('rebuild-diagrams', buildDiagrams);    // 3) แผนภาพ SVG ใช้ palette ใหม่
    safe('rebuild-pipeline', () => pipeline.rebuild());
    const cur = deck.slides[deck.i];            // 4) เล่นอนิเมชั่นของสไลด์ปัจจุบันซ้ำ
    deck.hooks.onDeactivate?.(cur, deck.i);
    deck.hooks.onActivate?.(cur, deck.i);
    toast(name === 'dark' ? 'ธีมมืด' : 'ธีมสว่าง');
  };

  // ผูกปุ่ม/คีย์ลัดให้ครบ "ก่อน" งาน async ใด ๆ
  document.getElementById('btnTheme')?.addEventListener('click', retheme);
  window.addEventListener('keydown', e => {
    if (e.target.matches('input, textarea')) return;
    if (e.key === 't' || e.key === 'T' || e.key === 'ๆ') retheme();
    if ((e.key === 's' || e.key === 'ห') && deck.slides[deck.i].id === 's-svs') demo.play();
  });
  window.__modulesReady = true;   // บอก inline fallback ว่าไม่ต้องจัดการธีมเองแล้ว
  window.deck = deck;
  window.retheme = retheme;

  // โหลด MIDI ทีหลังสุด — ถ้าช้า/ล้มเหลว ก็ไม่กระทบการนำทางและปุ่มธีม
  try {
    await demo.init();
    if (!demo.fromRepo) toast('อ่าน untitled.mid ตรง ๆ ไม่ได้ → ใช้โน้ตที่ parse ไว้ล่วงหน้า');
  } catch (err) {
    console.error('[demo]', err);
    toast('เดโม MIDI ไม่พร้อม: ' + (err?.message || err));
  }
}

boot().catch(err => {
  console.error(err);
  toast('เกิดข้อผิดพลาด: ' + (err?.message || err));
});
