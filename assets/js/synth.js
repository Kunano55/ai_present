/* ═══════════════════════════════════════════════════════════
   synth.js — formant singing synth (Web Audio API, ไม่ใช้ไฟล์เสียงนอก)
   โครงสร้างต่อ 1 พยางค์ (mora):
     [พยัญชนะ] → [สระ]
   - พยัญชนะสังเคราะห์ตามประเภทจริง:
       stop     = ช่วงปิด (เงียบ/voicing bar) + noise burst ตอนปล่อย
       affricate= ปิด + เสียดทานสั้น + burst
       fricative= noise ผ่าน bandpass/highpass (s/sh/h/f/z)
       nasal    = เสียงขึ้นจมูก (F1≈280 + F2 ต่ำ) แล้วเปิดเข้าสระ
       flap     = เสียง /r/ ญี่ปุ่น: amplitude จุ่ม + F3 ต่ำช่วงสั้น
       glide    = /y/ /w/: formant ลื่นจากตำแหน่ง glide เข้าสระ
   - สระ = แหล่งกำเนิด sawtooth (เส้นเสียง) → formant bank 5 แถบ
     + vibrato + portamento + breath noise
   นี่คือภาพย่อของสิ่งที่ acoustic model + vocoder ของ NNSVS ทำจริง
   ═══════════════════════════════════════════════════════════ */

// formant F1..F5 [freq, gain, Q] ต่อสระ
const VOWELS = {
  a: [[850, 1.00, 8], [1300, .50, 10], [2900, .26, 12], [3700, .14, 13], [5000, .08, 14]],
  i: [[320, 1.00, 9], [2350, .34, 13], [3100, .20, 14], [3800, .11, 15], [5000, .06, 15]],
  u: [[340, 1.00, 9], [900, .42, 11], [2400, .20, 13], [3400, .11, 14], [4600, .06, 15]],
  e: [[480, 1.00, 9], [2150, .38, 12], [2750, .22, 13], [3600, .12, 14], [4700, .07, 15]],
  o: [[520, 1.00, 9], [950, .46, 11], [2600, .22, 12], [3500, .12, 14], [4700, .07, 15]],
  n: [[520, .80, 7], [1600, .30, 10], [2600, .16, 12], [3600, .09, 14], [4700, .05, 15]],
};

/** ตารางพยัญชนะ: t=ประเภท, dur=ความยาวช่วงพยัญชนะ, level=ระดับเสียง noise */
const CONS = {
  k:  { t: 'stop', burst: 1900, q: 1.6, dur: .070, level: .60 },
  g:  { t: 'stop', burst: 1500, q: 1.6, dur: .070, level: .48, bar: .16 },
  t:  { t: 'stop', burst: 3600, q: 1.2, dur: .065, level: .60 },
  d:  { t: 'stop', burst: 3000, q: 1.2, dur: .065, level: .48, bar: .16 },
  p:  { t: 'stop', burst: 850,  q: 1.8, dur: .070, level: .55 },
  b:  { t: 'stop', burst: 750,  q: 1.8, dur: .070, level: .48, bar: .16 },
  ch: { t: 'aff',  fric: 2700,  q: 2.0, dur: .085, level: .55 },
  ts: { t: 'aff',  fric: 4800,  q: 1.6, dur: .085, level: .55 },
  j:  { t: 'aff',  fric: 2500,  q: 2.0, dur: .080, level: .50, bar: .14 },
  s:  { t: 'fric', fric: 4800,  q: 1.0, dur: .095, level: .50, hp: true },
  sh: { t: 'fric', fric: 2900,  q: 1.6, dur: .095, level: .55 },
  z:  { t: 'fric', fric: 5200,  q: 1.3, dur: .080, level: .45, bar: .14 },
  h:  { t: 'fric', fric: 1500,  q: 0.7, dur: .060, level: .30 },
  f:  { t: 'fric', fric: 1300,  q: 1.0, dur: .080, level: .35 },
  n:  { t: 'nasal', dur: .055, f2: 1150 },
  m:  { t: 'nasal', dur: .055, f2: 750 },
  r:  { t: 'flap',  dur: .035 },
  y:  { t: 'glide', from: 'i', dur: .050 },
  w:  { t: 'glide', from: 'u', dur: .050 },
};

const PEAK = 0.17;          // ระดับเสียงสระต่อโน้ต
const VIB_DEPTH = 18;       // cents
const VIB_RATE = 5.4;       // Hz
const FORMANT_GLIDE = .05;  // เวลา formant ลื่นจากพยัญชนะเข้าสระ

export class SingSynth {
  constructor() {
    this.ctx = null;
    this.nodes = [];
    this.srcs = [];          // [{node, startAt}] เพื่อ stop() อย่างปลอดภัย
    this.playing = false;
  }

  async ready() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error('เบราว์เซอร์นี้ไม่รองรับ Web Audio API');
      this.ctx = new AC();
      this._buildBus();
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    return this.ctx;
  }

  _buildBus() {
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.95;

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.knee.value = 22;
    this.comp.ratio.value = 5;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.22;

    // reverb อย่างง่าย (สร้าง impulse response เอง ไม่ต้องโหลดไฟล์นอก)
    this.conv = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 1.5);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.1) * 0.5;
      }
    }
    this.conv.buffer = ir;
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.18;

    this.master.connect(this.comp);
    this.master.connect(this.conv);
    this.conv.connect(this.wet);
    this.wet.connect(this.comp);
    this.comp.connect(ctx.destination);

    const nLen = Math.floor(ctx.sampleRate * 1.2);
    this.noiseBuf = ctx.createBuffer(1, nLen, ctx.sampleRate);
    const nd = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < nLen; i++) nd[i] = Math.random() * 2 - 1;
  }

  now() { return this.ctx ? this.ctx.currentTime : 0; }

  /**
   * ร้องโน้ตทั้งหมด
   * @param {{midi?:number,hz:number,startSec:number,durSec:number,vowel:string|null,consonant?:string|null}[]} items
   * @param {{rate?:number, consLevel?:number}} opts consLevel = ตัวคูณระดับเสียงพยัญชนะ (1 = ปกติ)
   */
  sing(items, opts = {}) {
    if (!this.ctx) throw new Error('ต้องเรียก ready() ก่อน');
    const ctx = this.ctx;
    const rate = opts.rate || 1;
    const consLevel = Math.max(0, Math.min(2.5, opts.consLevel ?? 1));
    const t0 = ctx.currentTime + (opts.lead ?? 0.16);
    const sched = [];
    let prevHz = null;

    items.forEach((it, i) => {
      const st = t0 + it.startSec / rate;
      const du = Math.max(0.09, it.durSec / rate);
      const en = st + du;
      sched.push({ index: i, start: st, end: en });
      prevHz = this._voice(it, st, du, prevHz, consLevel);
    });

    this.playing = true;
    return { t0, sched, end: sched.length ? sched[sched.length - 1].end + 0.35 : t0 };
  }

  /* ─────────── เสียง 1 พยางค์ ─────────── */
  _voice(it, st, du, prevHz, consLevel = 1) {
    const ctx = this.ctx;
    const f = it.hz;
    const cons = CONS[it.consonant] || null;
    const cDur = cons ? Math.min(cons.dur, du * 0.45) : 0;
    const vStart = st + cDur;
    const vowKey = VOWELS[it.vowel] ? it.vowel : 'a';
    const vow = VOWELS[vowKey];
    const voicedFirst = cons && (cons.t === 'nasal' || cons.t === 'flap' || cons.t === 'glide');
    const voiceOn = voicedFirst ? st : vStart;

    const out = ctx.createGain();          // envelope ของส่วนสระ/เสียงก้อง
    out.gain.value = 0;
    out.name = 'vowelEnv';
    out.connect(this.master);
    this.nodes.push(out);

    const consBus = ctx.createGain();       // พยัญชนะตรงเข้า master ไม่ผ่าน vowelEnv
    consBus.gain.value = consLevel;
    consBus.name = 'consBus';
    consBus.connect(this.master);
    this.nodes.push(consBus);

    /* ── แหล่งกำเนิดเสียง (เส้นเสียง) ── */
    const src = ctx.createGain();
    src.gain.value = 1;
    this.nodes.push(src);
    const mk = (type, hz, gainVal, detune) => {
      const o = ctx.createOscillator();
      o.type = type;
      const g = ctx.createGain();
      g.gain.value = gainVal;
      o.connect(g); g.connect(src);
      o.frequency.setValueAtTime(hz, st);
      if (detune) o.detune.setValueAtTime(detune, st);
      o.start(st);
      o.stop(st + du + 0.3);
      this.srcs.push({ node: o, startAt: st });
      return o;
    };
    const o1 = mk('sawtooth', f, .5, 0);
    const o2 = mk('sawtooth', f, .26, 6);
    const o3 = mk('sine', f / 2, .24, 0);
    const oscs = [o1, o2, o3];

    // portamento จากโน้ตก่อนหน้า
    if (prevHz && Math.abs(prevHz - f) > 1) {
      const from = Math.max(40, prevHz);
      [[o1, from, f], [o2, from, f], [o3, from / 2, f / 2]].forEach(([o, a, b]) => {
        o.frequency.cancelScheduledValues(st);
        o.frequency.setValueAtTime(a, st);
        o.frequency.exponentialRampToValueAtTime(b, st + 0.055);
      });
    }

    // vibrato ค่อย ๆ เข้า
    const lfo = ctx.createOscillator();
    lfo.type = 'sine'; lfo.frequency.value = VIB_RATE;
    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(0, st);
    lfoGain.gain.linearRampToValueAtTime(0, st + Math.min(0.18, du * 0.3));
    lfoGain.gain.linearRampToValueAtTime(VIB_DEPTH, st + Math.min(0.5, du * 0.8));
    lfo.connect(lfoGain);
    oscs.forEach(o => lfoGain.connect(o.detune));
    lfo.start(st); lfo.stop(st + du + 0.3);
    this.srcs.push({ node: lfo, startAt: st });
    this.nodes.push(lfo, lfoGain);

    /* ── formant bank (parallel bandpass) ── */
    const bus = ctx.createGain();
    bus.gain.value = 1;
    src.connect(bus);
    this.nodes.push(bus);
    const sum = ctx.createGain();
    sum.gain.value = 1;
    this.nodes.push(sum);

    const bank = vow.map(([freq, gain, q], idx) => {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = gain;
      bus.connect(bp); bp.connect(g); g.connect(sum);
      this.nodes.push(bp, g);
      return { bp, g, target: [freq, gain, q], idx };
    });

    // ตั้งตำแหน่ง formant เริ่มต้นตามพยัญชนะ แล้วลื่นเข้าสระ
    // (สุ่ม ±1.5% ต่อโน้ตให้ไม่แข็งทื่อ — ต้องคูณค่าเป้าหมาย ห้ามอ่าน .value)
    const jit = 1 + (Math.random() * 0.03 - 0.015);
    const setBank = (vals, when, glideTo = null, glideEnd = 0) => {
      bank.forEach((b, i) => {
        const v = vals[i] || b.target;
        b.bp.frequency.setValueAtTime(Math.min(v[0] * jit, ctx.sampleRate / 2.2), when);
        b.g.gain.setValueAtTime(v[1], when);
        if (glideTo) {
          b.bp.frequency.linearRampToValueAtTime(Math.min(glideTo[i][0] * jit, ctx.sampleRate / 2.2), glideEnd);
          b.g.gain.linearRampToValueAtTime(glideTo[i][1], glideEnd);
        }
      });
    };
    if (cons?.t === 'nasal') {
      setBank([[280, .9, 7], [cons.f2, .45, 9], [2200, .10, 12], [3200, .05, 14], [4500, .03, 15]], st, vow, vStart + FORMANT_GLIDE);
    } else if (cons?.t === 'glide') {
      setBank(VOWELS[cons.from], st, vow, vStart + FORMANT_GLIDE);
    } else if (cons?.t === 'flap') {
      setBank(vow.map((v, i) => (i === 2 ? [1500, v[1] * 1.25, 10] : v)), st, vow, vStart + 0.04);
    } else {
      setBank(vow, st);
    }
    /* ── tone control ── */
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 75;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200; lp.Q.value = .3;
    sum.connect(hp); hp.connect(lp); lp.connect(out);
    this.nodes.push(hp, lp);

    /* ── breath noise ระหว่างสระ ── */
    const nz = this._noise(st, st + du + 0.15);
    const nzBp = ctx.createBiquadFilter();
    nzBp.type = 'bandpass'; nzBp.frequency.value = 1900; nzBp.Q.value = 0.8;
    const nzG = ctx.createGain();
    nzG.gain.setValueAtTime(0, st);
    nzG.gain.linearRampToValueAtTime(0.012, voiceOn + 0.05);
    nzG.gain.linearRampToValueAtTime(0.0001, st + du + 0.1);
    nz.connect(nzBp); nzBp.connect(nzG); nzG.connect(sum);
    this.nodes.push(nzBp, nzG);

    /* ── พยัญชนะ ── */
    if (cons) this._consonant(cons, st, vStart, f, consBus);

    /* ── envelope หลัก ── */
    const peak = PEAK * (vowKey === 'n' ? 0.72 : 1);
    const g = out.gain;
    g.setValueAtTime(0, st);
    if (voicedFirst) {
      const l0 = cons.t === 'nasal' ? 0.40 : cons.t === 'flap' ? 0.55 : 0.8;
      g.linearRampToValueAtTime(peak * l0, st + 0.025);
      if (l0 < 1) g.linearRampToValueAtTime(peak, vStart + 0.04);
    } else {
      g.setValueAtTime(0, Math.max(st, vStart - 0.006));
      g.linearRampToValueAtTime(peak, vStart + 0.032);
    }
    const tSustain = Math.max(vStart + 0.05, Math.min(st + du - 0.06, vStart + Math.max(0.09, du * 0.4)));
    const tHold = Math.max(tSustain + 0.012, st + du - 0.045);
    g.linearRampToValueAtTime(peak * 0.88, tSustain);
    g.setValueAtTime(peak * 0.88, tHold);
    g.linearRampToValueAtTime(0.0001, st + du + 0.05);

    return f;
  }

  /** noise source กลาง */
  _noise(from, to) {
    const nz = this.ctx.createBufferSource();
    nz.buffer = this.noiseBuf; nz.loop = true;
    nz.start(from); nz.stop(to);
    this.srcs.push({ node: nz, startAt: from });
    this.nodes.push(nz);
    return nz;
  }

  /** สังเคราะห์ช่วงพยัญชนะ (ต่อกับ consBus — ห้ามต่อกับ vowelEnv) */
  _consonant(cons, st, vStart, f, consBus) {
    const ctx = this.ctx;
    const lvl = cons.level || 0;

    // voicing bar (เสียงเส้นเสียงรั่วระหว่างปิดปาก สำหรับพยัญชนะก้อง)
    if (cons.bar) {
      const bar = ctx.createOscillator();
      bar.type = 'sawtooth';
      bar.frequency.setValueAtTime(f, st);
      const blp = ctx.createBiquadFilter();
      blp.type = 'lowpass'; blp.frequency.value = 420; blp.Q.value = .7;
      const bg = ctx.createGain();
      bg.gain.setValueAtTime(0, st);
      bg.gain.linearRampToValueAtTime(cons.bar * PEAK, st + 0.015);
      bg.gain.setValueAtTime(cons.bar * PEAK, Math.max(st + 0.015, vStart - 0.01));
      bg.gain.linearRampToValueAtTime(0.0001, vStart + 0.012);
      bar.connect(blp); blp.connect(bg); bg.name = 'consGain'; bg.connect(consBus);
      bar.start(st); bar.stop(vStart + 0.03);
      this.srcs.push({ node: bar, startAt: st });
      this.nodes.push(bar, blp, bg);
    }

    if (cons.t === 'stop') {
      // ปิดปาก = เงียบ (หรือ bar) แล้วปล่อย burst สั้น ๆ
      const n = this._noise(Math.max(0, vStart - 0.013), vStart + 0.035);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = cons.burst; bp.Q.value = cons.q;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0, Math.max(0, vStart - 0.013));
      ng.gain.linearRampToValueAtTime(lvl, vStart - 0.006);
      ng.gain.exponentialRampToValueAtTime(0.001, vStart + 0.032);
      n.connect(bp); bp.connect(ng); ng.name = 'consGain'; ng.connect(consBus);
      this.nodes.push(bp, ng);
    } else if (cons.t === 'aff') {
      // ปิด → เสียดทานสั้น → ปล่อยเข้าสระ
      const cStart = Math.max(0, vStart - cons.dur * 0.55);
      const n = this._noise(cStart, vStart + 0.03);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = cons.fric; bp.Q.value = cons.q;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0, cStart);
      ng.gain.linearRampToValueAtTime(lvl * 0.9, cStart + 0.012);
      ng.gain.setValueAtTime(lvl * 0.9, vStart - 0.008);
      ng.gain.exponentialRampToValueAtTime(0.001, vStart + 0.028);
      n.connect(bp); bp.connect(ng); ng.name = 'consGain'; ng.connect(consBus);
      this.nodes.push(bp, ng);
    } else if (cons.t === 'fric') {
      // เสียดทานต่อเนื่อง (s sh h f z)
      const cStart = st + 0.004;
      const n = this._noise(cStart, vStart + 0.02);
      const flt = ctx.createBiquadFilter();
      if (cons.hp) { flt.type = 'highpass'; flt.frequency.value = cons.fric; }
      else { flt.type = 'bandpass'; flt.frequency.value = cons.fric; }
      flt.Q.value = cons.q;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0, cStart);
      ng.gain.linearRampToValueAtTime(lvl, cStart + 0.018);
      ng.gain.setValueAtTime(lvl, Math.max(cStart + 0.018, vStart - 0.02));
      ng.gain.linearRampToValueAtTime(0.0001, vStart + 0.02);
      n.connect(flt); flt.connect(ng); ng.name = 'consGain'; ng.connect(consBus);
      this.nodes.push(flt, ng);
    }
    // nasal / flap / glide จัดการผ่าน formant bank + envelope ของสระแล้ว
  }

  stop() {
    this.playing = false;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.nodes.forEach(n => {
      const gp = n.gain;
      if (!gp) return;
      try {
        gp.cancelScheduledValues(t);
        gp.setValueAtTime(typeof gp.value === 'number' ? gp.value : 0, t);
        gp.linearRampToValueAtTime(0.0001, t + 0.06);
      } catch { /* node สิ้นสุดไปแล้ว */ }
    });
    this.srcs.forEach(({ node, startAt }) => {
      try { node.stop(Math.max(t + 0.07, startAt + 0.005)); } catch { /* ok */ }
    });
    const old = this.nodes;
    this.nodes = [];
    this.srcs = [];
    setTimeout(() => old.forEach(n => { try { n.disconnect(); } catch { /* ok */ } }), 420);
  }

  dispose() {
    this.stop();
    if (this.ctx) { this.ctx.close().catch(() => {}); this.ctx = null; }
  }
}
