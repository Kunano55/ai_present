/* ═══════════════════════════════════════════════════════════
   charts.js — แผนภาพ/อนิเมชั่นทั้งหมดในเด็ค (สร้างเป็น SVG/HTML)
   ═══════════════════════════════════════════════════════════ */

const NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}, parent) {
  const n = document.createElementNS(NS, tag);
  const styleBits = [];
  for (const [k, v] of Object.entries(attrs)) {
    n.setAttribute(k, v);
    // presentation attribute แพ้ CSS class → ยก fill/ขนาดฟอนต์ของ <text> ขึ้นเป็น inline style
    if (tag === 'text' && (k === 'fill' || k === 'font-size' || k === 'font-weight')) {
      styleBits.push(`${k}:${v}`);
    }
  }
  if (styleBits.length) n.setAttribute('style', styleBits.join(';'));
  if (parent) parent.appendChild(n);
  return n;
}
function html(tag, cls, txt, parent) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  if (parent) parent.appendChild(n);
  return n;
}

/* เมโลดี้จริงจาก untitled.mid (ใช้วาดกราฟ F0 ให้ต่อเนื่องกับสไลด์เดโม) */
export const MELODY = [
  [51, 48], [53, 48], [54, 48], [56, 48], [58, 96], [63, 48], [61, 48],
  [58, 96], [51, 96], [58, 48], [56, 48], [54, 48], [53, 47],
];
const TICK_SEC = 500000 / 1e6 / 96;

/* ═══════════════ 1. stream visualisation ═══════════════ */

/** single-stream (แบบเก่า) */
export function buildSingleStream(host) {
  const s = svg('svg', { viewBox: '0 0 360 168', preserveAspectRatio: 'xMidYMid meet' });
  const defs = svg('defs', {}, s);
  const flow = (id, color) => {
    const g = svg('linearGradient', { id, x1: '0', x2: '1' }, defs);
    svg('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': '.05' }, g);
    svg('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': '.5' }, g);
  };
  flow('ss-in', '#45e0c8');

  box(s, 6, 62, 72, 44, 'frame-level', 'score features', '#45e0c8');
  arrow(s, 80, 84, 112, 84, '#ffffff', 'dash');
  box(s, 114, 44, 92, 80, 'DNN เดียว', 'joint prediction', '#ff6b6b');
  arrow(s, 208, 84, 240, 84, '#ffffff', 'dash');

  // output stack — เห็นชัดว่า LF0 บางเฉียบ
  const outs = [
    ['MGC · 60d', 12, 58, '#7aa7ff', .85],
    ['LF0 · 1d', 74, 9, '#ff6b6b', 1],
    ['BAP · 3d', 87, 20, '#7aa7ff', .5],
    ['VUV · 1d', 111, 9, '#7aa7ff', .35],
  ];
  outs.forEach(([lab, y, h, col, op]) => {
    const r = svg('rect', { x: 244, y, width: 60, height: h, rx: 3, fill: col, opacity: op * .55 }, s);
    svg('text', { x: 312, y: y + h / 2 + 4, class: 'svg-lbl svg-lbl--sm' }, s).textContent = lab;
    if (lab.startsWith('LF0')) {
      r.setAttribute('class', 'pulse-bad');
      svg('text', { x: 274, y: 148, 'text-anchor': 'middle', class: 'svg-lbl svg-lbl--sm', fill: '#ff6b6b' }, s)
        .textContent = '← มิติเดียว แพ้สเปกตรัม';
    }
  });
  svg('text', { x: 160, y: 140, 'text-anchor': 'middle', class: 'svg-lbl svg-lbl--sm' }, s)
    .textContent = 'loss ถูกขับด้วย feature มิติสูง';
  host.innerHTML = '';
  host.appendChild(s);
  injectAnimCss();
}

/** multi-stream (NNSVS) */
export function buildMultiStream(host) {
  const s = svg('svg', { viewBox: '0 0 360 168', preserveAspectRatio: 'xMidYMid meet' });
  box(s, 6, 62, 66, 44, 'frame-level', 'score features', '#45e0c8');

  const streams = [
    { id: 'lf0', lab: 'LF0', sub: 'AR · residual', y: 10, h: 30, c: '#ff7ab8' },
    { id: 'mgc', lab: 'MGC', sub: 'AR · 60d', y: 50, h: 30, c: '#7aa7ff' },
    { id: 'bap', lab: 'BAP', sub: 'AR · 3d', y: 90, h: 26, c: '#7aa7ff' },
    { id: 'vuv', lab: 'VUV', sub: 'non-AR', y: 124, h: 26, c: '#b48bff' },
  ];

  streams.forEach(st => {
    arrow(s, 74, 84, 108, st.y + st.h / 2, '#ffffff', 'dash');
  });

  streams.forEach(st => {
    box(s, 110, st.y, 108, st.h, st.lab, st.sub, st.c, true);
    svg('rect', { x: 226, y: st.y + 4, width: 34, height: st.h - 8, rx: 3, fill: st.c, opacity: .28 }, s);
    svg('rect', { x: 226, y: st.y + 4, width: 34, height: st.h - 8, rx: 3, fill: 'none', stroke: st.c, 'stroke-opacity': .6 }, s);
  });

  // เส้น condition: LF0 → stream อื่น
  const cond = svg('path', {
    d: 'M264 25 C 300 25, 300 60, 268 62 M264 25 C 316 30, 316 100, 268 101 M264 25 C 336 40, 336 134, 268 135',
    fill: 'none', stroke: '#ff7ab8', 'stroke-width': '1.5', 'stroke-dasharray': '4 5', class: 'flow-dash',
  }, s);
  svg('text', { x: 300, y: 152, class: 'svg-lbl svg-lbl--sm', fill: '#ff7ab8' }, s)
    .textContent = 'condition log-F0 → สเปกตรัม/VUV';
  svg('text', { x: 118, y: 160, class: 'svg-lbl svg-lbl--sm' }, s)
    .textContent = 'v4: AR ทั้ง MGC · LF0 · BAP';
  void cond;
  host.innerHTML = '';
  host.appendChild(s);
  injectAnimCss();
}

function box(s, x, y, w, h, t1, t2, color, small) {
  svg('rect', { x, y, width: w, height: h, rx: 8, fill: color, 'fill-opacity': '.12', stroke: color, 'stroke-opacity': '.5' }, s);
  const fs = small ? 12 : 11;
  svg('text', { x: x + w / 2, y: y + h / 2 - (t2 ? 3 : -4), 'text-anchor': 'middle', class: 'svg-lbl', 'font-size': fs, fill: '#fff' }, s).textContent = t1;
  if (t2) svg('text', { x: x + w / 2, y: y + h / 2 + 11, 'text-anchor': 'middle', class: 'svg-lbl svg-lbl--sm', 'font-size': 9 }, s).textContent = t2;
}

function arrow(s, x1, y1, x2, y2, color, style) {
  const p = svg('path', {
    d: x1 === x2 || y1 === y2 ? `M${x1} ${y1} L${x2} ${y2}` : `M${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`,
    fill: 'none', stroke: color, 'stroke-opacity': '.35', 'stroke-width': '1.4',
  }, s);
  if (style === 'dash') { p.setAttribute('stroke-dasharray', '4 5'); p.setAttribute('class', 'flow-dash'); }
  svg('circle', { cx: x2, cy: y2, r: 2.2, fill: color, 'fill-opacity': '.55' }, s);
}

let cssInjected = false;
function injectAnimCss() {
  if (cssInjected) return;
  cssInjected = true;
  const st = document.createElement('style');
  st.textContent = `
    @keyframes dashmove{to{stroke-dashoffset:-40}}
    .flow-dash{animation:dashmove 2.4s linear infinite}
    @keyframes pulsebad{0%,100%{opacity:.35}50%{opacity:1;filter:drop-shadow(0 0 6px #ff6b6b)}}
    .pulse-bad{animation:pulsebad 1.5s ease-in-out infinite}
    @keyframes drawin{to{stroke-dashoffset:0}}
    @keyframes groww{from{transform:scaleX(0)}to{transform:scaleX(1)}}
  `;
  document.head.appendChild(st);
}

/* ═══════════════ 2. F0 contour chart ═══════════════ */

export function buildF0Chart(host) {
  const W = 1200, H = 210, padL = 46, padR = 18, padT = 16, padB = 30;
  const totalTicks = MELODY.reduce((a, [, d]) => a + d, 0);
  const lo = Math.min(...MELODY.map(n => n[0])) - 2.5;
  const hi = Math.max(...MELODY.map(n => n[0])) + 2.5;
  const X = tick => padL + (tick / totalTicks) * (W - padL - padR);
  const Y = st => padT + (1 - (st - lo) / (hi - lo)) * (H - padT - padB);

  const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid meet' });
  s.style.overflow = 'visible';

  // gridlines
  for (let p = Math.ceil(lo); p <= Math.floor(hi); p++) {
    const y = Y(p);
    svg('line', { x1: padL, y1: y, x2: W - padR, y2: y, stroke: 'rgba(255,255,255,.07)', 'stroke-width': 1 }, s);
    if (![1, 3, 6, 8, 10].includes(((p % 12) + 12) % 12)) {
      svg('text', { x: padL - 8, y: y + 3.5, 'text-anchor': 'end', class: 'svg-lbl svg-lbl--sm', 'font-size': 9 }, s)
        .textContent = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][((p % 12) + 12) % 12] + (Math.floor(p / 12) - 1);
    }
  }

  // (1) step contour จากสกอร์
  let step = '', t = 0;
  MELODY.forEach(([p, d], i) => {
    const x1 = X(t), x2 = X(t + d), y = Y(p);
    step += (i === 0 ? `M${x1} ${y}` : ` L${x1} ${y}`) + ` L${x2} ${y}`;
    t += d;
  });
  svg('path', { d: step, fill: 'none', stroke: 'rgba(255,255,255,.42)', 'stroke-width': 1.6, 'stroke-dasharray': '5 4' }, s);

  // (2) single-stream: over-smoothed F0 (เกือบแบน ค่อย ๆ ลู่เข้าค่าเฉลี่ย)
  let flat = '';
  const mean = MELODY.reduce((a, [p, d]) => a + p * d, 0) / totalTicks;
  t = 0;
  MELODY.forEach(([p, d], i) => {
    const steps = 8;
    for (let k = 0; k <= steps; k++) {
      const tt = t + (d * k) / steps;
      const blend = Math.min(1, tt / (totalTicks * 0.55)) * 0.55;
      const st = p * (1 - blend) + mean * blend;
      flat += (i === 0 && k === 0 ? 'M' : ' L') + X(tt).toFixed(1) + ' ' + Y(st).toFixed(1);
    }
    t += d;
  });
  svg('path', { d: flat, fill: 'none', stroke: '#ff6b6b', 'stroke-width': 1.7, opacity: '.9' }, s);

  // (3) NNSVS AR F0: time-lag + portamento + overshoot + vibrato
  const LAG = 0.045;                        // วินาที (time-lag ที่โมเดลทำนาย)
  const lagTicks = LAG / TICK_SEC;
  let nat = '';
  t = 0;
  let prev = null;
  MELODY.forEach(([p, d], i) => {
    const steps = 26;
    for (let k = 0; k <= steps; k++) {
      const frac = k / steps;
      const tt = t + d * frac;
      const x = X(Math.min(totalTicks, tt + lagTicks));
      // portamento: ลื่นจากโน้ตก่อนในช่วง 14% แรก
      const glide = prev == null ? p : prev + (p - prev) * Math.min(1, frac / 0.14);
      // overshoot ตอนเริ่มโน้ต
      const over = prev == null ? 0 : 0.32 * Math.exp(-frac * 16) * Math.sign(p - prev);
      // vibrato: ค่อย ๆ เข้าหลัง ~0.18 s
      const secs = tt * TICK_SEC;
      const amp = 0.5 * (1 - Math.exp(-Math.max(0, secs - 0.16) / 0.22));
      const vib = amp * Math.sin(2 * Math.PI * 5.4 * secs);
      // ปลายโน้ตหุบเล็กน้อย
      const tail = frac > 0.9 ? -0.18 * (frac - 0.9) / 0.1 : 0;
      const st = glide + over + vib + tail;
      nat += (i === 0 && k === 0 ? 'M' : ' L') + x.toFixed(1) + ' ' + Y(st).toFixed(2);
    }
    prev = p; t += d;
  });
  const natPath = svg('path', { d: nat, fill: 'none', stroke: '#ff7ab8', 'stroke-width': 2.3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, s);
  natPath.style.filter = 'drop-shadow(0 0 8px rgba(255,122,184,.6))';

  // หัวโน้ต (marker)
  t = 0;
  MELODY.forEach(([p, d]) => {
    svg('circle', { cx: X(t + lagTicks), cy: Y(p), r: 2.6, fill: '#0b1020', stroke: '#ff7ab8', 'stroke-width': 1.4 }, s);
    t += d;
  });

  // legend
  const leg = [
    ['สกอร์ (pitch ขั้นบันได)', 'rgba(255,255,255,.55)', '5 4'],
    ['single-stream · over-smoothed', '#ff6b6b', ''],
    ['NNSVS · AR log-F0 (+time-lag, vibrato)', '#ff7ab8', ''],
  ];
  leg.forEach(([lab, col, dash], i) => {
    const y = H - 16;
    const x = padL + i * 392;
    svg('line', { x1: x, y1: y, x2: x + 26, y2: y, stroke: col, 'stroke-width': 2.4, 'stroke-dasharray': dash }, s);
    svg('text', { x: x + 32, y: y + 3.5, class: 'svg-lbl svg-lbl--sm', 'font-size': 10 }, s).textContent = lab;
  });

  host.innerHTML = '';
  host.appendChild(s);
  injectAnimCss();

  // draw-in animation
  const len = natPath.getTotalLength();
  natPath.style.strokeDasharray = len;
  natPath.style.strokeDashoffset = len;
  return {
    play() {
      natPath.style.transition = 'none';
      natPath.style.strokeDashoffset = len;
      requestAnimationFrame(() => {
        natPath.style.transition = 'stroke-dashoffset 2.6s cubic-bezier(.3,.8,.3,1)';
        natPath.style.strokeDashoffset = '0';
      });
    },
  };
}

/* ═══════════════ 3. donut: dataset split ═══════════════ */

export function buildDonut(host) {
  const s = svg('svg', { viewBox: '0 0 120 120' });
  const R = 46, CIRC = 2 * Math.PI * R;
  svg('circle', { cx: 60, cy: 60, r: R, fill: 'none', stroke: 'rgba(255,255,255,.08)', 'stroke-width': 15 }, s);
  const segs = [
    { v: 100 / 110, c: 'var(--c-score)' },
    { v: 5 / 110, c: 'var(--c-model)' },
    { v: 5 / 110, c: 'var(--c-voice)' },
  ];
  let acc = 0;
  const arcs = segs.map(sg => {
    const c = svg('circle', {
      cx: 60, cy: 60, r: R, fill: 'none', stroke: sg.c, 'stroke-width': 15,
      'stroke-dasharray': `0 ${CIRC}`, 'stroke-dashoffset': -acc * CIRC,
    }, s);
    acc += sg.v;
    return { el: c, len: sg.v * CIRC, gap: CIRC - sg.v * CIRC };
  });
  host.innerHTML = '';
  host.appendChild(s);
  const c = html('div', 'donut-c');
  c.innerHTML = '<b>110</b><span>เพลง</span>';
  host.appendChild(c);
  return {
    play() {
      arcs.forEach((a, i) => {
        a.el.style.transition = 'none';
        a.el.setAttribute('stroke-dasharray', `0 ${CIRC}`);
        setTimeout(() => {
          a.el.style.transition = 'stroke-dasharray 1s cubic-bezier(.2,.9,.3,1)';
          a.el.setAttribute('stroke-dasharray', `${a.len} ${a.gap}`);
        }, 120 + i * 190);
      });
    },
  };
}

/* ═══════════════ 4. keyboard: pitch coverage ═══════════════ */

export function buildKeyboard(host) {
  const W = 760, H = 146;
  const LO = 48, HI = 96;                       // C3 → C6
  const naturals = [];
  for (let p = LO; p <= HI; p++) if (![1, 3, 6, 8, 10].includes(p % 12)) naturals.push(p);
  const ww = (W - 20) / naturals.length;
  const whiteIndex = new Map();
  naturals.forEach((p, i) => whiteIndex.set(p, i));
  const xOf = p => {
    if (whiteIndex.has(p)) return 10 + whiteIndex.get(p) * ww;
    return 10 + whiteIndex.get(p - 1) * ww + ww * 0.62;
  };
  const wOf = p => (whiteIndex.has(p) ? ww : ww * 0.62);

  const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid meet' });
  const keyTop = 60, keyH = 56;

  // คีย์ขาว
  naturals.forEach(p => {
    svg('rect', {
      x: xOf(p) + 0.6, y: keyTop, width: ww - 1.2, height: keyH, rx: 2,
      fill: 'rgba(255,255,255,.86)', stroke: 'rgba(0,0,0,.5)', 'stroke-width': .6,
    }, s);
  });
  // คีย์ดำ
  for (let p = LO; p <= HI; p++) {
    if ([1, 3, 6, 8, 10].includes(p % 12)) {
      svg('rect', {
        x: xOf(p), y: keyTop, width: wOf(p), height: keyH * 0.62, rx: 2,
        fill: '#141a2c', stroke: 'rgba(255,255,255,.22)', 'stroke-width': .6,
      }, s);
    }
  }
  // ป้าย C3/C4/C5/C6
  [48, 60, 72, 84, 96].forEach(p => {
    svg('text', {
      x: xOf(p) + ww / 2, y: keyTop + keyH + 15, 'text-anchor': 'middle',
      class: 'svg-lbl svg-lbl--sm', 'font-size': 10, fill: 'rgba(255,255,255,.5)',
    }, s).textContent = `C${p / 12 - 1}`;
  });

  const bands = [
    { lo: 51, hi: 95, c: 'var(--c-score)', lab: 'train · D#3 – B5 (146.8 – 987.8 Hz)', y: 4 },
    { lo: 63, hi: 81, c: 'var(--c-voice)', lab: 'test · D#4 – A5 (155.6 – 880 Hz)', y: 22 },
    { lo: 51, hi: 63, c: 'var(--c-out)',   lab: 'untitled.mid · D#3 – D#4', y: 40 },
  ];
  const rects = bands.map(b => {
    const x = xOf(b.lo), w = xOf(b.hi) + wOf(b.hi) - x;
    const bh = 14;
    const g = svg('g', {}, s);
    const r = svg('rect', { x, y: b.y, width: 0, height: bh, rx: 4, fill: b.c, opacity: .88 }, g);
    const tx = svg('text', {
      x: x + 7, y: b.y + 10.5, class: 'svg-lbl', 'font-size': 9.5,
      fill: 'rgba(8,12,22,.92)', 'font-weight': '600', opacity: '0',
    }, g);
    tx.textContent = b.lab;
    return { el: r, tx, w };
  });

  host.innerHTML = '';
  host.appendChild(s);
  return {
    play() {
      rects.forEach((r, i) => {
        r.el.style.transition = 'none';
        r.tx.style.transition = 'none';
        r.el.setAttribute('width', 0);
        r.tx.setAttribute('opacity', 0);
        setTimeout(() => {
          r.el.style.transition = 'width .95s cubic-bezier(.2,.9,.3,1)';
          r.tx.style.transition = 'opacity .5s ease .45s';
          r.el.setAttribute('width', r.w);
          r.tx.setAttribute('opacity', 1);
        }, 150 + i * 220);
      });
    },
  };
}

/* ═══════════════ 5. MOS bar chart ═══════════════ */

const MOS = [
  ['Muskits RNN', 2.22, .11, 'base'],
  ['Sinsy (reproduction)', 2.64, .12, 'base'],
  ['NNSVS-Mel v3', 2.58, .11, 'nn'],
  ['Sinsy + pitch correction', 2.84, .11, 'base'],
  ['DiffSinger', 2.90, .11, 'base'],
  ['Sinsy + vibrato modeling', 2.99, .11, 'base'],
  ['NNSVS-WORLD v1 (multi-stream)', 3.21, .12, 'nn'],
  ['NNSVS-WORLD v0 (รุ่นเก่า 2021)', 3.28, .10, 'nn'],
  ['NNSVS-WORLD v2 (+AR LF0)', 3.35, .11, 'nn'],
  ['NNSVS-Mel v1', 3.51, .11, 'nn'],
  ['NNSVS-Mel v2 (+AR LF0)', 3.58, .11, 'nn'],
  ['NNSVS-WORLD v3 (+AR MGC·LF0)', 3.60, .11, 'nn'],
  ['NNSVS-WORLD v4 (AR MGC·LF0·BAP)', 3.86, .10, 'best'],
  ['hn-HiFi-GAN (A/S)', 3.72, .11, 'ceil'],
  ['hn-uSFGAN-Mel (A/S)', 4.19, .09, 'ceil'],
  ['hn-uSFGAN-WORLD (A/S)', 4.19, .09, 'ceil'],
  ['Recordings (เสียงจริง)', 4.39, .08, 'ceil'],
];

const GRAD = {
  base: 'linear-gradient(90deg,#4b5672,#77839f)',
  nn: 'linear-gradient(90deg,#2b8f86,#45e0c8)',
  best: 'linear-gradient(90deg,#2fa66a,#6ef2a2)',
  ceil: 'linear-gradient(90deg,#a97b2c,#ffc65c)',
};

export function buildMosChart(host) {
  host.innerHTML = '';
  MOS.forEach(([name, mos, ci, kind], i) => {
    const row = html('div', 'mrow' + (kind === 'best' ? ' mrow--best' : '') + (kind === 'ceil' ? ' mrow--ceil' : ''));
    html('span', 'mrow__n', name, row);
    const bar = html('div', 'mrow__bar', null, row);
    const fill = html('i', null, null, bar);
    fill.style.background = GRAD[kind];
    fill.style.setProperty('--w', `${(mos / 5) * 100}%`);
    fill.style.setProperty('--d', i);
    const ciEl = html('span', 'mrow__ci', null, bar);
    const lo = ((mos - ci) / 5) * 100, hi = ((mos + ci) / 5) * 100;
    ciEl.style.left = `${lo}%`;
    ciEl.style.width = `${hi - lo}%`;
    html('span', 'mrow__v', `${mos.toFixed(2)} ± ${ci.toFixed(2)}`, row);
    host.appendChild(row);
  });
  return {
    play() {
      host.classList.remove('is-shown');
      requestAnimationFrame(() => requestAnimationFrame(() => host.classList.add('is-shown')));
    },
  };
}

/* ═══════════════ 6. fix list ═══════════════ */

const FIXES = [
  ['Sinsy เปิดโค้ดแค่ HMM-based · DNN ที่เสียงดีไม่ได้เผยแพร่',
   'เปิดโค้ด<b>ครบทั้ง 4 โมดูล</b> พร้อม implementation ที่เลียนแบบ Sinsy เป็น baseline → เทียบและทำซ้ำผลได้ตรง ๆ'],
  ['Muskits มีแต่ end-to-end · ไม่มี parametric ที่ pitch มั่นคง',
   'จับคู่ <b>parametric WORLD (MGC/BAP แยกกัน)</b> กับ <b>neural vocoder uSFGAN</b> → ได้ทั้งคุณภาพและความเสถียรของ pitch'],
  ['เน็ตเดียวทายทุก feature → F0 มิติเดียวถูกละเลย ร้องเพี้ยน',
   '<b>Multi-stream</b> แยกเน็ตต่อ stream แล้ว <b>condition log-F0</b> เข้าโมเดลสเปกตรัม/VUV → pitch เป็นตัวนำ'],
  ['ต้องโมเดล vibrato แบบ explicit (flag · amplitude · speed)',
   '<b>AR F0 model</b> เรียนรู้ dynamic ของ F0 เอง → MOS 3.21 → 3.35 เมื่อเปิด AR ที่ LF0 และ → 3.86 เมื่อ AR ทุก stream หลัก'],
  ['mel-spectrogram entangled (มีทั้ง F0 + envelope) → ไม่เสถียรในเสียงต่ำ/สูง',
   'ใช้ WORLD ที่ <b>disentangled</b> เป็นหลัก · Mel v3 ที่ AR เต็มรูปเจอ <b>exposure bias</b> คะแนนตกเหลือ 2.58 ยืนยันข้อนี้'],
  ['ทาย log-F0 สัมบูรณ์เสี่ยงหลุดคีย์ ต้องพึ่ง pitch correction',
   '<b>Residual log-F0</b>: ทายส่วนต่างจาก note pitch → NNSVS <b>ไม่ต้องใช้ pitch correction เลย</b>ก็ยังตรงคีย์'],
  ['over-smoothing ทำให้เสียงทื่อ ขาดรายละเอียด',
   '<b>Global-variance post-filter</b> บน MGC และ mel ก่อนเข้า vocoder'],
  ['ขยายไปภาษา/สไตล์ร้องอื่นต้องแก้ทั้งระบบ',
   'Core modules เป็น <b>language-independent</b> · ทำเฉพาะ pre-processing ต่อภาษา และเพิ่ม custom context (falsetto · emotion · strength) ได้'],
];

export function buildFixList(host) {
  host.innerHTML = '';
  FIXES.forEach(([p, s], i) => {
    const d = html('div', 'fix');
    d.setAttribute('data-anim', '');
    d.style.setProperty('--i', i);
    const left = html('div', 'fix__p', null, d);
    html('span', 'fix__k', 'ปัญหาเดิม', left);
    const t = html('span', 'fix__t', null, left);
    t.innerHTML = p;
    html('div', 'fix__a', '→', d);
    const right = html('div', 'fix__s', null, d);
    html('span', 'fix__k', 'วิธีแก้ของ NNSVS', right);
    const t2 = html('span', 'fix__t', null, right);
    t2.innerHTML = s;
    host.appendChild(d);
  });
}

/* ═══════════════ 7. findings ═══════════════ */

const FINDINGS = [
  'Sinsy แบบมี explicit vibrato ได้คะแนนดีที่สุดใน 3 ตัวแปรของ Sinsy → ยืนยันว่า<b>การโมเดล dynamic ของ F0 สำคัญมาก</b>',
  'NNSVS <b>ทุกเวอร์ชันยกเว้น Mel v3</b> ชนะ baseline ทั้งหมด (Sinsy, Muskits, DiffSinger)',
  'Vocoder แบบ <b>source-filter (hn-uSFGAN)</b> ดีกว่า hn-HiFi-GAN อย่างมีนัยสำคัญ (4.19 vs 3.72 เมื่อใช้ features จริง)',
  '<b>Autoregressive + multi-stream</b> บน WORLD feature เพิ่มความเป็นธรรมชาติต่อเนื่อง → v4 ดีที่สุดในทุกระบบที่ 3.86',
  'เทียบกับ NNSVS-WORLD v0 (รุ่น พ.ย. 2021) ที่ 3.28 → <b>ดีขึ้นชัดเจน +0.58 MOS</b>',
  'DiffSinger ให้ fidelity สูง แต่สร้าง <b>F0 ขาดช่วงและ vibrato ไม่เสถียร</b> ในท่อนที่มีการเคลื่อนไหวมาก',
];

export function buildFindings(host) {
  host.innerHTML = '';
  FINDINGS.forEach(f => {
    const li = html('li');
    li.innerHTML = f;
    host.appendChild(li);
  });
}

/* ═══════════════ 8. count-up numbers ═══════════════ */

export function animateCounters(scope = document) {
  scope.querySelectorAll('[data-count]').forEach(node => {
    if (node.dataset.done === '1') return;
    node.dataset.done = '1';
    const target = parseFloat(node.dataset.count);
    const dec = parseInt(node.dataset.dec || '0', 10);
    const dur = 1250;
    const t0 = performance.now();
    const tick = now => {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      node.textContent = (target * e).toFixed(dec);
      if (p < 1) requestAnimationFrame(tick);
      else node.textContent = target.toFixed(dec);
    };
    requestAnimationFrame(tick);
  });
}
