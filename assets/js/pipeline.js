/* ═══════════════════════════════════════════════════════════
   pipeline.js — แผนภาพการทำงานของ NNSVS (Fig.1 ในเปเปอร์)
   สร้างเป็น SVG แล้วปล่อย "แพ็กเก็ตข้อมูล" ไหลไปตามลูกศรทีละขั้น
   ═══════════════════════════════════════════════════════════ */

import { readColors } from './theme.js?v=3';

const NS = 'http://www.w3.org/2000/svg';
const VW = 1400, VH = 500;
const CW = 200, GAP = 24, X0 = 40;
const colX = i => X0 + i * (CW + GAP);
const colC = i => colX(i) + CW / 2;

/* ── โหนด ── */
const NODES = [
  // (a) phonetic timing prediction
  { id: 'score',  col: 0, y: 105, h: 84, kind: 'score', t: 'สกอร์ดนตรี + เนื้อร้อง', s: ['MusicXML / UST', '+ lyrics'] },
  { id: 'hts',    col: 1, y: 105, h: 84, kind: 'score', t: 'HTS full-context labels', s: ['timings', 'phonetic + musical ctx'] },
  { id: 'notef',  col: 2, y: 42,  h: 72, kind: 'feat',  t: 'Note-level features', s: ['pitch · duration', 'position in phrase'] },
  { id: 'phonef', col: 2, y: 170, h: 72, kind: 'feat',  t: 'Phone-level features', s: ['phone identity', 'รวม 82 มิติ'] },
  { id: 'tlag',   col: 3, y: 42,  h: 72, kind: 'model', t: 'Time-lag model', s: ['MDN', 'note-onset deviation'] },
  { id: 'dur',    col: 3, y: 170, h: 72, kind: 'model', t: 'Duration model', s: ['MDN', 'phone durations'] },
  { id: 'post',   col: 4, y: 105, h: 84, kind: 'model', t: 'Post-process', s: ['normalize durations', 'phone → frame'] },
  { id: 'framef', col: 5, y: 105, h: 84, kind: 'feat',  t: 'Frame-level features', s: ['frame shift 5 ms', '+ positional 4 มิติ'] },
  // (b) waveform synthesis
  { id: 'ac',     col: 0, y: 350, h: 92, kind: 'model', t: 'Acoustic model', s: ['multi-stream', 'AR (duration-informed)'] },
  { id: 'acf',    col: 1, y: 350, h: 92, kind: 'voice', t: 'Acoustic features', s: ['MGC · LF0', 'VUV · BAP'] },
  { id: 'gv',     col: 2, y: 350, h: 92, kind: 'voice', t: 'GV post-filter', s: ['global variance', 'แก้ over-smoothing'] },
  { id: 'voc',    col: 3, y: 350, h: 92, kind: 'out',   t: 'hn-uSFGAN vocoder', s: ['source-filter GAN', 'harmonic + noise'] },
  { id: 'wave',   col: 4, y: 350, h: 92, kind: 'out',   t: 'เสียงร้อง (waveform)', s: ['24 kHz', '♪ ready to listen'] },
];

/* ── เส้นเชื่อม ── */
const E = (from, to, d) => ({ from, to, d });
const EDGES = [
  E('score', 'hts',    `M${colX(0) + CW} 147 H${colX(1)}`),
  E('hts', 'notef',    `M${colX(1) + CW} 147 H${colC(2) - 40} V78 H${colX(2)}`),
  E('hts', 'phonef',   `M${colX(1) + CW} 147 H${colC(2) - 40} V206 H${colX(2)}`),
  E('notef', 'tlag',   `M${colX(2) + CW} 78 H${colX(3)}`),
  E('phonef', 'dur',   `M${colX(2) + CW} 206 H${colX(3)}`),
  E('tlag', 'post',    `M${colX(3) + CW} 78 H${colC(4) - 40} V147 H${colX(4)}`),
  E('dur', 'post',     `M${colX(3) + CW} 206 H${colC(4) - 40} V147 H${colX(4)}`),
  E('post', 'framef',  `M${colX(4) + CW} 147 H${colX(5)}`),
  E('framef', 'ac',    `M${colC(5)} 189 V292 H${colC(0)} V350`),
  E('ac', 'acf',       `M${colX(0) + CW} 396 H${colX(1)}`),
  E('acf', 'gv',       `M${colX(1) + CW} 396 H${colX(2)}`),
  E('gv', 'voc',       `M${colX(2) + CW} 396 H${colX(3)}`),
  E('voc', 'wave',     `M${colX(3) + CW} 396 H${colX(4)}`),
];

const STEPS = [
  {
    nodes: ['score', 'hts'], edges: [['score', 'hts']],
    cap: '<b>Input:</b> ไฟล์สกอร์ (MusicXML/UST) + เนื้อร้อง ถูกแปลงเป็น <b>HTS full-context label</b> — เก็บทั้งเวลาเริ่ม–จบของแต่ละ phoneme และ context ทางภาษา/ดนตรี (โน้ตก่อนหน้า-ถัดไป, ตำแหน่งในท่อน, จังหวะ)',
  },
  {
    nodes: ['notef', 'phonef'], edges: [['hts', 'notef'], ['hts', 'phonef']],
    cap: 'จาก label จะถูกแตกเป็น feature 2 ระดับ — <b>note-level</b> (pitch, duration, ตำแหน่ง) สำหรับโมเดลเวลา และ <b>phone-level</b> (เอกลักษณ์ phoneme + context) รวม <b>82 มิติ</b>',
  },
  {
    nodes: ['tlag', 'dur'], edges: [['notef', 'tlag'], ['phonef', 'dur']],
    cap: '<b>Time-lag model</b> ทายว่านักร้องจริงเริ่มเสียงเร็ว/ช้ากว่าหัวโน้ตแค่ไหน ส่วน <b>Duration model</b> ทายความยาวของแต่ละ phoneme ภายในโน้ต (เช่น พยัญชนะ vs สระ) — ทั้งคู่เป็น <b>MDN</b> ที่ให้ความน่าจะเป็น ไม่ใช่ค่าเดียว',
  },
  {
    nodes: ['post', 'framef'], edges: [['tlag', 'post'], ['dur', 'post'], ['post', 'framef']],
    cap: '<b>Post-process</b> ปรับให้ผลรวม phone duration เท่ากับ note duration พอดี (ไม่ให้เพี้ยนจังหวะ) แล้วขยาย feature จาก phone-level เป็น <b>frame-level</b> ที่ frame shift <b>5 ms</b> — พร้อมป้อน neural network',
  },
  {
    nodes: ['ac'], edges: [['framef', 'ac']],
    cap: '<b>Acoustic model</b> รับ frame-level score feature แล้วทำนาย acoustic feature แบบ <b>multi-stream</b> — แยกเน็ตต่อ feature และใช้สถาปัตยกรรม <b>autoregressive (Tacotron ที่รู้ duration)</b> กับ stream สำคัญ',
  },
  {
    nodes: ['acf'], edges: [['ac', 'acf']],
    cap: 'ผลลัพธ์คือพารามิเตอร์เสียง: <b>MGC</b> 60 มิติ (spectral envelope), <b>LF0</b> (log-F0 ต่อเนื่อง), <b>VUV</b> (voiced/unvoiced), <b>BAP</b> 3 มิติ (band-aperiodicity) — รวม 65 มิติของ WORLD',
  },
  {
    nodes: ['gv', 'voc', 'wave'], edges: [['acf', 'gv'], ['gv', 'voc'], ['voc', 'wave']],
    cap: '<b>GV post-filter</b> กู้รายละเอียดที่หายจาก over-smoothing แล้ว <b>hn-uSFGAN</b> (source-filter GAN แบบ harmonic+noise) สังเคราะห์เป็นคลื่นเสียง <b>24 kHz</b> ที่ pitch มั่นคงและคุณภาพสูง',
  },
];

function svg(tag, attrs = {}, parent) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
}

export class Pipeline {
  constructor(host, ctl = {}) {
    this.host = host;
    this.caption = ctl.caption;
    this.dotsHost = ctl.dots;
    this.btnPrev = ctl.prev;
    this.btnNext = ctl.next;
    this.btnPlay = ctl.play;
    this.playLabel = ctl.playLabel;
    this.step = 0;
    this.auto = true;
    this.raf = 0;
    this.t = 0;
    this.packets = [];
    this.built = false;
  }

  build() {
    if (this.built) return;
    const s = svg('svg', { viewBox: `0 0 ${VW} ${VH}`, preserveAspectRatio: 'xMidYMid meet' });
    this.svg = s;

    const c = (this.c = readColors());

    // defs: หัวลูกศร 2 สถานะ (สีมาจาก CSS class → เปลี่ยนธีมได้อัตโนมัติ)
    const defs = svg('defs', {}, s);
    ['dim', 'on'].forEach(k => {
      const m = svg('marker', {
        id: `arr-${k}`, viewBox: '0 0 10 10', refX: '8.5', refY: '5',
        markerWidth: '6.5', markerHeight: '6.5', orient: 'auto-start-reverse',
      }, defs);
      svg('path', { d: 'M0,0 L10,5 L0,10 z', class: k === 'on' ? 'p-arrow-on' : 'p-arrow-dim' }, m);
    });

    // lane labels + separators
    svg('text', { x: X0, y: 26, class: 'p-lane' }, s).textContent = '(a)  PHONETIC TIMING PREDICTION';
    svg('text', { x: X0, y: 332, class: 'p-lane' }, s).textContent = '(b)  WAVEFORM SYNTHESIS';
    svg('line', { x1: X0, y1: 300, x2: VW - X0, y2: 300, class: 'p-lane-line' }, s);

    // edges (ใต้โหนด)
    this.edgeEls = new Map();
    const eg = svg('g', {}, s);
    EDGES.forEach(e => {
      const p = svg('path', { d: e.d, class: 'p-edge', 'marker-end': 'url(#arr-dim)' }, eg);
      this.edgeEls.set(`${e.from}>${e.to}`, { el: p, edge: e });
    });

    // nodes
    this.nodeEls = new Map();
    const ng = svg('g', {}, s);
    NODES.forEach(n => {
      const x = colX(n.col), y = n.y, w = CW, h = n.h;
      const g = svg('g', { class: 'p-node', 'data-id': n.id }, ng);
      const kc = c[n.kind] || c.feat;
      svg('rect', {
        x, y, width: w, height: h, rx: 5, class: 'p-bg',
        fill: c.surface, stroke: kc, 'stroke-opacity': '.4',
      }, g);
      svg('rect', { x, y, width: 3, height: h, rx: 1.5, fill: kc, 'fill-opacity': '.85' }, g);
      const cx = x + w / 2;
      const lines = n.s.length;
      const ty = y + h / 2 - (lines * 13) / 2 + 2;
      const t = svg('text', { x: cx, y: ty, 'text-anchor': 'middle', class: 'p-t' }, g);
      // ย่อชื่อที่ยาวเกินกล่อง
      t.textContent = n.t.length > 24 ? n.t.replace(' (waveform)', '') : n.t;
      n.s.forEach((line, i) => {
        svg('text', { x: cx, y: ty + 20 + i * 14, 'text-anchor': 'middle', class: 'p-s' }, g).textContent = line;
      });
      g.style.cursor = 'pointer';
      g.addEventListener('click', () => {
        const si = STEPS.findIndex(st => st.nodes.includes(n.id));
        if (si >= 0) { this.setStep(si); this.pause(); }
      });
      this.nodeEls.set(n.id, g);
    });

    // mini output visual (คอลัมน์สุดท้ายของ lane b)
    const outX = colX(5), outY = 350, outH = 92;
    svg('rect', {
      x: outX, y: outY, width: CW, height: outH, rx: 5,
      fill: c.surface2, stroke: c.line, 'stroke-dasharray': '4 5',
    }, s);
    this.outBars = [];
    const nb = 26, bw = (CW - 30) / nb;
    for (let i = 0; i < nb; i++) {
      const bh = 6 + Math.abs(Math.sin(i * 0.7) * 34) + Math.random() * 12;
      const b = svg('rect', {
        x: outX + 15 + i * bw, y: outY + outH / 2 - bh / 2, width: Math.max(1.6, bw - 2.4), height: bh, rx: 1.4,
        fill: i % 3 === 0 ? c.out : c.voice, opacity: '.3',
      }, s);
      this.outBars.push({ el: b, base: bh, y: outY + outH / 2 });
    }
    svg('text', { x: outX + CW / 2, y: outY + outH + 20, 'text-anchor': 'middle', class: 'p-s' }, s)
      .textContent = 'output preview';

    // packet layer
    this.pLayer = svg('g', {}, s);

    this.host.innerHTML = '';
    this.host.appendChild(s);

    // dots + buttons
    if (this.dotsHost) {
      this.dotsHost.innerHTML = '';
      STEPS.forEach((_, i) => {
        const b = document.createElement('button');
        b.title = `ขั้น ${i + 1}`;
        b.addEventListener('click', () => { this.setStep(i); this.pause(); });
        this.dotsHost.appendChild(b);
      });
      this.dots = [...this.dotsHost.children];
    }
    this.btnPrev?.addEventListener('click', () => { this.setStep(this.step - 1); this.pause(); });
    this.btnNext?.addEventListener('click', () => { this.setStep(this.step + 1); this.pause(); });
    this.btnPlay?.addEventListener('click', () => (this.auto ? this.pause() : this.resume()));

    this.built = true;
    this.setStep(0, true);
  }

  setStep(i, silent) {
    this.step = (i + STEPS.length) % STEPS.length;
    const st = STEPS[this.step];

    this.nodeEls.forEach((g, id) => g.classList.toggle('is-on', st.nodes.includes(id)));
    this.edgeEls.forEach((rec, key) => {
      const on = st.edges.some(([a, b]) => `${a}>${b}` === key);
      rec.el.classList.toggle('is-on', on);
      rec.el.setAttribute('marker-end', on ? 'url(#arr-on)' : 'url(#arr-dim)');
    });

    // สร้างแพ็กเก็ตใหม่สำหรับขั้นนี้
    this.pLayer.innerHTML = '';
    this.packets = [];
    st.edges.forEach(([a, b], k) => {
      const rec = this.edgeEls.get(`${a}>${b}`);
      if (!rec) return;
      const path = rec.el;
      const len = path.getTotalLength();
      const pal = this.c || (this.c = readColors());
      const color = pal[NODES.find(n => n.id === b)?.kind] || pal.feat;
      for (let j = 0; j < 2; j++) {
        const dot = svg('circle', { r: 3.2, fill: color, class: 'p-packet', opacity: '0' }, this.pLayer);
        this.packets.push({ el: dot, path, len, off: j * 0.42 + k * 0.09 });
      }
    });

    if (this.caption) {
      this.caption.innerHTML =
        `<span class="pipe-caption__n">STEP ${String(this.step + 1).padStart(2, '0')}/${STEPS.length}</span><span>${st.cap}</span>`;
    }
    this.dots?.forEach((d, k) => d.classList.toggle('is-on', k === this.step));
    this.t = performance.now();
    if (!silent) this.lastAdvance = performance.now();
    else this.lastAdvance = performance.now();
  }

  frame(now) {
    const st = STEPS[this.step];
    const dt = (now - this.t) / 1000;
    this.packets.forEach(p => {
      const prog = ((dt * 0.55) + p.off) % 1.25;
      const clamped = Math.min(1, prog);
      const pt = p.path.getPointAtLength(clamped * p.len);
      p.el.setAttribute('cx', pt.x);
      p.el.setAttribute('cy', pt.y);
      p.el.setAttribute('opacity', prog > 1 ? 0 : Math.min(1, prog * 6) * (1 - Math.max(0, (clamped - .82) / .18)).toFixed(2));
    });

    // แถบ output เต้นตอนถึงขั้นสุดท้าย
    const last = this.step === STEPS.length - 1;
    this.outBars.forEach((b, i) => {
      if (last) {
        const s = 0.45 + Math.abs(Math.sin(now / 210 + i * 0.55)) * 0.85;
        const h = b.base * s;
        b.el.setAttribute('height', h);
        b.el.setAttribute('y', b.y - h / 2);
        b.el.setAttribute('opacity', '.85');
      } else {
        b.el.setAttribute('height', b.base);
        b.el.setAttribute('y', b.y - b.base / 2);
        b.el.setAttribute('opacity', '.22');
      }
    });

    if (this.auto && now - this.lastAdvance > 4200) this.setStep(this.step + 1);
    this.raf = requestAnimationFrame(this.frame.bind(this));
  }

  resume() {
    this.auto = true;
    this.lastAdvance = performance.now();
    this.playLabel && (this.playLabel.textContent = 'หยุดอัตโนมัติ');
    this.btnPlay?.classList.add('is-playing');
  }
  pause() {
    this.auto = false;
    this.playLabel && (this.playLabel.textContent = 'เล่นอัตโนมัติ');
    this.btnPlay?.classList.remove('is-playing');
  }

  rebuild() {
    this.built = false;
    this.host.innerHTML = '';
    this.build();
    this.setStep(this.step, true);
  }

  activate() {
    this.build();
    cancelAnimationFrame(this.raf);
    this.t = performance.now();
    this.lastAdvance = performance.now();
    this.raf = requestAnimationFrame(this.frame.bind(this));
    this.resume();
  }
  deactivate() { cancelAnimationFrame(this.raf); this.raf = 0; }
}
