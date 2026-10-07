/* ═══════════════════════════════════════════════════════════
   demo.js — สไลด์ "Score-to-Sing คืออะไร"
   โหลด untitled.mid จาก repo → parse → วาด piano roll
   → จับคู่ 1 โน้ต : 1 mora → ร้องด้วย formant synth
   ═══════════════════════════════════════════════════════════ */

import { loadMidi, noteName, midiToHz } from './midi.js?v=3';
import { splitMora, moraToRomaji, moraToVowel, moraToPhones } from './jp.js?v=3';
import { SingSynth } from './synth.js?v=3';

const FRAME_SHIFT = 0.005;      // 5 ms ตามในเปเปอร์
const SHARP = new Set([1, 3, 6, 8, 10]);

// สำรองกรณี fetch ไฟล์ใน repo ไม่ได้ (เช่น เปิดจาก file://)
const FALLBACK = {
  bpm: 138.2, division: 96, format: 1, nTracks: 3, timeSig: '4/4',
  notes: [
    [51, 0, 48], [53, 48, 48], [54, 96, 48], [56, 144, 48], [58, 192, 96],
    [63, 288, 48], [61, 336, 48], [58, 384, 96], [51, 480, 96], [58, 576, 48],
    [56, 624, 48], [54, 672, 48], [53, 720, 47],
  ].map(([midi, startTick, durTick]) => ({ midi, startTick, durTick, vel: 100 })),
};

const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };

export class SvsDemo {
  constructor(root = document) {
    this.root = root;
    this.roll = $('#roll', root);
    this.strip = $('#lyricStrip', root);
    this.btnSing = $('#btnSing', root);
    this.btnStop = $('#btnStop', root);
    this.input = $('#lyricInput', root);
    this.mini = $('#miniStats', root);
    this.steps = [...root.querySelectorAll('.step-item')];
    this.synth = new SingSynth();
    this.rate = 1;
    this.midi = null;
    this.moras = [];
    this.playing = false;
    this.raf = 0;
    this.idleTimer = 0;
    this.loaded = false;
  }

  async init() {
    try {
      const m = await loadMidi('untitled.mid');
      if (!m.notes.length) throw new Error('ไม่พบโน้ตในไฟล์');
      this.midi = m;
      this.fromRepo = true;
    } catch (err) {
      console.warn('[demo] fallback:', err);
      const tickSec = 500000 / 1e6 / FALLBACK.division;
      this.midi = {
        ...FALLBACK,
        notes: FALLBACK.notes.map(n => ({
          ...n,
          name: noteName(n.midi),
          hz: midiToHz(n.midi),
          startSec: n.startTick * tickSec,
          durSec: n.durTick * tickSec,
        })),
        durationSec: Math.max(...FALLBACK.notes.map(n => (n.startTick + n.durTick))) * tickSec,
        totalTicks: Math.max(...FALLBACK.notes.map(n => n.startTick + n.durTick)),
        tickSec,
        trackNames: ['MIDI Out'],
      };
      this.fromRepo = false;
    }

    this.setLyric(this.input.value);
    this.renderRoll();
    this.bind();
    this.loaded = true;
  }

  /* ── เนื้อร้อง → mora → จับคู่กับโน้ต ── */
  setLyric(text) {
    this.moras = splitMora(text);
    const n = this.midi.notes.length;
    // ยืด/หด mora ให้พอดีจำนวนโน้ต (ถ้าไม่พอ → วนซ้ำ, ถ้าเกิน → ตัด)
    this.assign = [];
    for (let i = 0; i < n; i++) {
      const m = this.moras.length ? this.moras[i % this.moras.length] : 'あ';
      this.assign.push({
        mora: m,
        romaji: moraToRomaji(m),
        vowel: moraToVowel(m),
        phones: moraToPhones(m),
        wrapped: this.moras.length > 0 && i >= this.moras.length,
        trimmed: this.moras.length > n && i >= n,
      });
    }
    this.renderStrip();
    this.renderRollNotes();
    this.renderMini();
  }


  renderMini() {
    const frames = Math.round(this.midi.durationSec / FRAME_SHIFT);
    const phones = this.assign.reduce((s, a) => s + a.phones.length, 0);
    const items = [
      [this.midi.notes.length, 'โน้ตในสกอร์'],
      [this.moras.length, 'mora ในเนื้อร้อง'],
      [phones, 'phoneme ที่ต้องจัดเวลา'],
      [frames.toLocaleString(), `เฟรม @ ${FRAME_SHIFT * 1000} ms`],
    ];
    this.mini.innerHTML = '';
    items.forEach(([v, k]) => {
      const d = el('div', 'mini-stat');
      d.appendChild(el('b', null, String(v)));
      d.appendChild(el('span', null, k));
      this.mini.appendChild(d);
    });
  }

  /* ── piano roll ── */
  renderRoll() {
    const m = this.midi;
    const pitches = m.notes.map(n => n.midi);
    this.lo = Math.min(...pitches) - 1;
    this.hi = Math.max(...pitches) + 1;
    this.rows = this.hi - this.lo + 1;
    this.totalTicks = Math.max(...m.notes.map(n => n.startTick + n.durTick));

    this.roll.innerHTML = '';
    const rows = el('div', 'roll__rows');
    for (let p = this.hi; p >= this.lo; p--) {
      const r = el('div', 'roll__row' + (SHARP.has(p % 12) ? ' is-sharp' : ''));
      const top = ((this.hi - p) / this.rows) * 100;
      r.style.top = `${top}%`;
      r.style.height = `${100 / this.rows}%`;
      const lab = el('span', 'roll__pitch', noteName(p));
      lab.style.top = '50%';
      r.appendChild(lab);
      rows.appendChild(r);
    }
    this.roll.appendChild(rows);
    this.playhead = el('div', 'roll__head');
    this.roll.appendChild(this.playhead);
    this.noteLayer = el('div', 'roll__notes');
    this.noteLayer.style.cssText = 'position:absolute;inset:0';
    this.roll.appendChild(this.noteLayer);
    this.renderRollNotes();
  }

  renderRollNotes() {
    if (!this.noteLayer) return;
    this.noteLayer.innerHTML = '';
    this.noteEls = [];
    const usable = 93;     // ความกว้างที่ใช้วางโน้ต (%)
    const left0 = 4.8;     // เผื่อ gutter สำหรับป้าย pitch
    this.midi.notes.forEach((n, i) => {
      const a = this.assign[i] || { mora: '', romaji: '' };
      const b = el('div', 'roll__note');
      const rowH = 100 / this.rows;                       // ความสูง 1 แถว (%)
      const top = ((this.hi - n.midi) / this.rows) * 100;
      // NOTE: ห้ามใช้ calc(% - %) เพราะจะติดลบแล้วถูกหนีบเป็น 0 → แถบหาย
      b.style.top = `${(top + rowH * 0.14).toFixed(3)}%`;
      b.style.height = `${(rowH * 0.72).toFixed(3)}%`;
      b.style.left = `${(left0 + (n.startTick / this.totalTicks) * usable).toFixed(3)}%`;
      b.style.width = `calc(${((n.durTick / this.totalTicks) * usable).toFixed(3)}% - 3px)`;
      b.title = `${n.name} · ${n.durTick} ticks · ${a.mora} (${a.romaji})`;
      b.appendChild(document.createTextNode(a.mora));
      b.addEventListener('click', () => this.previewNote(i));
      this.noteLayer.appendChild(b);
      this.noteEls.push(b);
    });
  }

  renderStrip() {
    this.strip.innerHTML = '';
    this.moraEls = [];
    this.midi.notes.forEach((n, i) => {
      const a = this.assign[i] || { mora: '', romaji: '' };
      const d = el('div', 'mora');
      d.appendChild(el('i', 'mora__i', String(i + 1)));
      d.appendChild(el('span', 'mora__k', a.mora));
      d.appendChild(el('span', 'mora__r', a.romaji));
      this.strip.appendChild(d);
      this.moraEls.push(d);
    });
  }

  bind() {
    this.btnSing.addEventListener('click', () => this.play());
    this.btnStop.addEventListener('click', () => this.stop(true));
    this.root.querySelectorAll('.speed button').forEach(b => {
      b.addEventListener('click', () => {
        this.root.querySelectorAll('.speed button').forEach(x => x.classList.remove('is-on'));
        b.classList.add('is-on');
        this.rate = parseFloat(b.dataset.speed);
        if (this.playing) this.play();
      });
    });
    let t;
    this.input.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => { this.setLyric(this.input.value); this.paint(-1); }, 220);
    });
  }

  /* ── เล่น ── */
  async play(onlyIndex) {
    try {
      await this.synth.ready();
    } catch (err) {
      console.warn('[demo] เสียงไม่พร้อม:', err);
      return;
    }
    this.synth.stop();
    cancelAnimationFrame(this.raf);

    const notes = onlyIndex != null ? [this.midi.notes[onlyIndex]] : this.midi.notes;
    const base = onlyIndex != null ? onlyIndex : 0;
    const items = notes.map((n, k) => {
      const a = this.assign[base + k];
      const start = onlyIndex != null ? 0 : n.startSec;
      const dur = onlyIndex != null ? Math.max(0.42, n.durSec) : n.durSec;
      return { hz: n.hz || midiToHz(n.midi), startSec: start, durSec: dur, vowel: a.vowel };
    });

    const totalSec = this.midi.durationSec;
    const { t0, sched, end } = this.synth.sing(items, { rate: this.rate });
    this.playing = true;
    this.btnSing.classList.add('is-playing');
    this.btnSing.querySelector('span:last-child').textContent = 'กำลังร้อง…';
    clearInterval(this.idleTimer);

    const tick = () => {
      const now = this.synth.now();
      if (now > end) { this.finish(); return; }
      const rel = (now - t0) * this.rate;
      let cur = -1;
      for (const s of sched) if (now >= s.start && now < s.end) { cur = s.index + base; break; }
      this.paint(cur, onlyIndex == null ? Math.max(0, Math.min(1, rel / totalSec)) : null);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  previewNote(i) { this.play(i); }

  paint(cur, frac) {
    this.noteEls?.forEach((n, i) => {
      n.classList.toggle('is-live', i === cur);
      n.classList.toggle('is-done', cur >= 0 && i < cur);
    });
    this.moraEls?.forEach((m, i) => {
      m.classList.toggle('is-live', i === cur);
      m.classList.toggle('is-done', cur >= 0 && i < cur);
    });
    if (this.playhead) {
      const on = frac != null && frac >= 0;
      this.playhead.classList.toggle('is-on', on);
      if (on) this.playhead.style.left = `${4.8 + frac * 93}%`;
    }
    // step list: ไล่ 1→4 ตามความคืบหน้า
    if (cur < 0) return;
    const p = frac == null ? 1 : frac;
    const stage = p < 0.06 ? 0 : p < 0.25 ? 1 : p < 0.6 ? 2 : 3;
    this.setStep(stage);
  }

  setStep(k) {
    this.steps.forEach((s, i) => s.classList.toggle('is-on', i === k));
  }

  finish() {
    cancelAnimationFrame(this.raf);
    this.playing = false;
    this.synth.stop();
    this.btnSing.classList.remove('is-playing');
    this.btnSing.querySelector('span:last-child').textContent = 'ร้องให้ฟัง';
    this.paint(-1, null);
    this.startIdle();
  }

  stop(manual) {
    cancelAnimationFrame(this.raf);
    this.synth.stop();
    this.playing = false;
    this.btnSing.classList.remove('is-playing');
    this.btnSing.querySelector('span:last-child').textContent = 'ร้องให้ฟัง';
    this.paint(-1, null);
    if (manual) this.startIdle();
  }

  /** วน step list เบา ๆ ตอนไม่ได้เล่น เพื่อให้สไลด์ไม่แข็ง */
  startIdle() {
    clearInterval(this.idleTimer);
    let k = 0;
    this.setStep(0);
    this.idleTimer = setInterval(() => {
      if (this.playing) return;
      k = (k + 1) % 4;
      this.setStep(k);
    }, 1500);
  }

  activate() {
    if (!this.loaded) return;
    this.startIdle();
  }

  deactivate() {
    clearInterval(this.idleTimer);
    this.stop(false);
  }
}
