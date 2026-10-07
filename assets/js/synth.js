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

// formant F1..F5 = [freq, gain(dB), Q] ต่อสระ — ต่อเป็น cascade ของ peaking filter
// (ใช้ peaking แทน bandpass parallel เพราะ bandpass Q แคบทำให้พลังงานหายเกือบหมด
//  เสียงสระเลยเบากว่า noise ของพยัญชนะ ~9 เท่า — วัดด้วย /tmp/smoke/levels.mjs)
export const VOWELS = {
  a: [[850, 15, 2.2], [1300, 9, 3.5], [2900, 5, 5], [3700, 3, 6], [5000, 2, 7]],
  i: [[320, 15, 1.8], [2350, 10, 3], [3100, 6, 6], [3800, 3, 7], [5000, 2, 8]],
  u: [[340, 15, 1.8], [900, 9, 4], [2400, 5, 6], [3400, 3, 7], [4600, 2, 8]],
  e: [[480, 15, 1.8], [2150, 9, 3.5], [2750, 6, 5], [3600, 3, 7], [4700, 2, 8]],
  o: [[520, 15, 1.8], [950, 10, 4], [2600, 5, 5], [3500, 3, 7], [4700, 2, 8]],
  n: [[520, 11, 2], [1600, 6, 4], [2600, 3, 5], [3600, 2, 7], [4700, 1, 8]],
};

/** ตารางพยัญชนะ: t=ประเภท, dur=ความยาวช่วงพยัญชนะ, amp=ความดังเป้าหมาย (สัดส่วนของสระ)
 *  gain ของ noise คำนวณอัตโนมัติจากแบนด์วิธของฟิลเตอร์ → ดังเท่ากันทุกตัว ไม่แสบหู */
export const CONS = {
  k:  { t: 'stop', burst: 1900, q: 1.6, dur: .070, amp: .75 },
  g:  { t: 'stop', burst: 1500, q: 1.6, dur: .070, amp: .68, bar: .50 },
  t:  { t: 'stop', burst: 3600, q: 1.2, dur: .065, amp: .72 },
  d:  { t: 'stop', burst: 3000, q: 1.2, dur: .065, amp: .65, bar: .50 },
  p:  { t: 'stop', burst: 850,  q: 1.8, dur: .070, amp: .70 },
  b:  { t: 'stop', burst: 750,  q: 1.8, dur: .070, amp: .62, bar: .50 },
  ch: { t: 'aff',  fric: 2700,  q: 2.0, dur: .085, amp: .70 },
  ts: { t: 'aff',  fric: 4800,  q: 1.6, dur: .085, amp: .62 },
  j:  { t: 'aff',  fric: 2500,  q: 2.0, dur: .080, amp: .62, bar: .45 },
  s:  { t: 'fric', fric: 4800,  q: 1.0, dur: .095, amp: .55, hp: true },
  sh: { t: 'fric', fric: 2900,  q: 1.6, dur: .095, amp: .58 },
  z:  { t: 'fric', fric: 5200,  q: 1.3, dur: .080, amp: .50, bar: .45 },
  h:  { t: 'fric', fric: 1500,  q: 0.7, dur: .060, amp: .34 },
  f:  { t: 'fric', fric: 1300,  q: 1.0, dur: .080, amp: .40 },
  n:  { t: 'nasal', dur: .055, f2: 1150 },
  m:  { t: 'nasal', dur: .055, f2: 750 },
  r:  { t: 'flap',  dur: .035 },
  y:  { t: 'glide', from: 'i', dur: .050 },
  w:  { t: 'glide', from: 'u', dur: .050 },
};

export const PEAK = 0.9;      // ระดับ envelope ของสระ (src เบาแล้วจึงต้องคูณกลับ)
export const SRC_GAINS = [0.055, 0.030, 0.032];  // saw, saw(detune), sub-sine
export const LP_HZ = 4600;    // ตัดเสียงแหลมจัดของเส้นเสียง
export const WET = 0.12;      // ระดับ reverb
const VIB_DEPTH = 18;         // cents
const VIB_RATE = 5.4;         // Hz
const FORMANT_GLIDE = .05;    // เวลา formant ลื่นจากพยัญชนะเข้าสระ
const RMS_PER_PEAK = 0.102;   // RMS ของสระต่อ PEAK 1.0 (วัดด้วย /tmp/smoke/verify.mjs)
const AMP_BY_TYPE = { stop: 1, aff: .94, fric: .80 };
export const CONS_BAND = [140, 6500];  // บัสพยัญชนะ: highpass/lowpass (กันเสียงซ่าเกิน 6.5 kHz)

/** gain ของ noise ที่ทำให้พยัญชนะดัง = amp × สระ
 *  คำนวณจากแบนด์วิธจริงที่เหลือหลังผ่านทั้งฟิลเตอร์พยัญชนะและบัส → ดังเท่ากันทุกตัว */
export function consNoiseGain(cons, peak, sampleRate = 48000) {
  const amp = (cons.amp ?? .6) * (AMP_BY_TYPE[cons.t] ?? 1);
  const target = amp * RMS_PER_PEAK * peak;
  const nyq = sampleRate / 2;
  const f = cons.fric || cons.burst || 2000;
  // แบนด์ที่ฟิลเตอร์ปล่อยผ่าน (RBJ): bandpass ≈ (π/2)·f/Q · highpass ≈ f..nyq
  const half = cons.hp ? nyq - f : Math.min(nyq, (Math.PI / 2) * f / (cons.q || 1)) / 2;
  const lo = Math.max(CONS_BAND[0], cons.hp ? f : f - half);
  const hi = Math.min(CONS_BAND[1], cons.hp ? nyq : f + half);
  const enbw = Math.max(nyq * 0.02, hi - lo);
  const filtRms = Math.sqrt((1 / 3) * (enbw / nyq));   // white noise variance = 1/3
  return Math.min(2, target / Math.max(1e-4, filtRms));
}

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
    this.comp.threshold.value = -12;
    this.comp.knee.value = 24;
    this.comp.ratio.value = 3.5;
    this.comp.attack.value = 0.006;
    this.comp.release.value = 0.25;

    // reverb อย่างง่าย (สร้าง impulse response เอง ไม่ต้องโหลดไฟล์นอก)
    this.conv = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 1.5);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      let lpv = 0, energy = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        lpv += 0.25 * ((Math.random() * 2 - 1) * Math.pow(1 - t, 2.6) - lpv);  // หางเสียงทึบ ไม่ฟู่
        d[i] = lpv;
        energy += lpv * lpv;
      }
      // normalize ให้ Σh² = 1 → convolution ไม่ขยายเสียง (ของเดิมขยาย 58× = noise กลบเสียงร้อง)
      const k = energy > 0 ? 1 / Math.sqrt(energy) : 0;
      for (let i = 0; i < len; i++) d[i] *= k;
    }
    this.conv.buffer = ir;
    this.wet = ctx.createGain();
    this.wet.gain.value = WET;

    // บัสพยัญชนะ: จำกัดแบนด์ 140 Hz – 6.5 kHz เสมอ (white noise ดิบถึง 24 kHz = แสบหู)
    this.consIn = ctx.createGain();
    this.consIn.gain.value = 1;
    this.consIn.name = 'consIn';
    const consLP = ctx.createBiquadFilter();
    consLP.type = 'lowpass'; consLP.frequency.value = CONS_BAND[1]; consLP.Q.value = .7;
    consLP.name = 'consLP';
    const consHP = ctx.createBiquadFilter();
    consHP.type = 'highpass'; consHP.frequency.value = CONS_BAND[0]; consHP.Q.value = .7;
    this.consIn.connect(consLP); consLP.connect(consHP); consHP.connect(this.master);
    this.nodes = this.nodes || [];

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

    // บัสพยัญชนะ: แยกจาก vowelEnv (ซึ่งปิดอยู่ช่วงพยัญชนะเสียงไม่ก้อง) → this.consIn → lp/hp → master
    const consBus = ctx.createGain();
    consBus.gain.value = consLevel;
    consBus.name = 'consBus';
    consBus.connect(this.consIn);
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
    const [g1, g2, g3] = SRC_GAINS;
    const o1 = mk('sawtooth', f, g1, 0);
    const o2 = mk('sawtooth', f, g2, 6);
    const o3 = mk('sine', f / 2, g3, 0);
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

    /* ── formant bank: cascade ของ peaking filter (รักษาพลังงานของเส้นเสียง) ── */
    const bus = ctx.createGain();
    bus.gain.value = 1;
    src.connect(bus);
    this.nodes.push(bus);
    const sum = ctx.createGain();
    sum.gain.value = 1;
    this.nodes.push(sum);

    let tail = bus;
    const bank = vow.map(([freq, gain, q], idx) => {
      const bp = ctx.createBiquadFilter();
      bp.type = 'peaking';
      bp.Q.value = q;
      bp.frequency.value = freq;
      bp.gain.value = gain;          // หน่วย dB
      tail.connect(bp);
      tail = bp;
      this.nodes.push(bp);
      return { bp, gp: bp.gain, target: [freq, gain, q], idx };  // gp = AudioParam (dB) ของ peaking
    });
    tail.connect(sum);

    // ตั้งตำแหน่ง formant เริ่มต้นตามพยัญชนะ แล้วลื่นเข้าสระ
    // (สุ่ม ±1.5% ต่อโน้ตให้ไม่แข็งทื่อ — ต้องคูณค่าเป้าหมาย ห้ามอ่าน .value)
    // ระวัง: bp.gain ของ peaking เป็น AudioParam (หน่วย dB) ไม่ใช่ GainNode
    const jit = 1 + (Math.random() * 0.03 - 0.015);
    const setBank = (vals, when, glideTo = null, glideEnd = 0) => {
      bank.forEach((b, i) => {
        const v = vals[i] || b.target;
        b.bp.frequency.setValueAtTime(Math.min(v[0] * jit, ctx.sampleRate / 2.2), when);
        b.gp.setValueAtTime(v[1], when);
        if (glideTo) {
          b.bp.frequency.linearRampToValueAtTime(Math.min(glideTo[i][0] * jit, ctx.sampleRate / 2.2), glideEnd);
          b.gp.linearRampToValueAtTime(glideTo[i][1], glideEnd);
        }
      });
    };
    if (cons?.t === 'nasal') {
      setBank([[280, 14, 2], [cons.f2, 8, 4], [2200, 2, 6], [3200, 1, 7], [4500, 0, 8]], st, vow, vStart + FORMANT_GLIDE);
    } else if (cons?.t === 'glide') {
      setBank(VOWELS[cons.from], st, vow, vStart + FORMANT_GLIDE);
    } else if (cons?.t === 'flap') {
      setBank(vow.map((v, i) => (i === 2 ? [1500, v[1] + 3, 8] : v)), st, vow, vStart + 0.04);
    } else {
      setBank(vow, st);
    }
    /* ── tone control ── */
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 75;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = LP_HZ; lp.Q.value = .3;
    sum.connect(hp); hp.connect(lp); lp.connect(out);
    this.nodes.push(hp, lp);

    /* ── breath noise ระหว่างสระ ── */
    const peak = PEAK * (vowKey === 'n' ? 0.72 : 1);
    const nz = this._noise(st, st + du + 0.15);
    const nzBp = ctx.createBiquadFilter();
    nzBp.type = 'bandpass'; nzBp.frequency.value = 1700; nzBp.Q.value = 0.9;
    const nzLp = ctx.createBiquadFilter();
    nzLp.type = 'lowpass'; nzLp.frequency.value = 2600; nzLp.Q.value = .5;
    const nzG = ctx.createGain();
    const breath = 0.05 * peak;      // ~5% ของสระ — แค่พอมีลม ไม่ซ่า
    nzG.gain.setValueAtTime(0, st);
    nzG.gain.linearRampToValueAtTime(breath, voiceOn + 0.05);
    nzG.gain.linearRampToValueAtTime(0.0001, st + du + 0.1);
    nz.connect(nzBp); nzBp.connect(nzLp); nzLp.connect(nzG); nzG.connect(sum);
    this.nodes.push(nzBp, nzLp, nzG);

    /* ── พยัญชนะ ── */
    if (cons) this._consonant(cons, st, vStart, f, consBus, peak);

    /* ── envelope หลัก ── */
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
  _consonant(cons, st, vStart, f, consBus, peak = PEAK) {
    const ctx = this.ctx;
    const lvl = consNoiseGain(cons, peak, ctx.sampleRate);

    // voicing bar (เสียงเส้นเสียงรั่วระหว่างปิดปาก สำหรับพยัญชนะก้อง)
    if (cons.bar) {
      const bar = ctx.createOscillator();
      bar.type = 'sawtooth';
      bar.frequency.setValueAtTime(f, st);
      const blp = ctx.createBiquadFilter();
      blp.type = 'lowpass'; blp.frequency.value = 420; blp.Q.value = .7;   // เสียงเส้นเสียงรั่วช่วงปิดปาก
      const bg = ctx.createGain();
      bg.gain.setValueAtTime(0, st);
      bg.gain.linearRampToValueAtTime(cons.bar * peak * 0.06, st + 0.015);
      bg.gain.setValueAtTime(cons.bar * peak * 0.06, Math.max(st + 0.015, vStart - 0.01));
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
