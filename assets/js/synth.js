/* ═══════════════════════════════════════════════════════════
   synth.js — "formant singing synth" ด้วย Web Audio API
   จำลองเสียงร้องอย่างหยาบ: แหล่งกำเนิดแบบ sawtooth (เส้นเสียง)
   → ฟิลเตอร์ formant ตามสระของแต่ละพยางค์ → vibrato/portamento
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

const PEAK = 0.17;          // ระดับเสียงต่อโน้ต
const VIB_DEPTH = 22;       // cents
const VIB_RATE = 5.4;       // Hz

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
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.1) * 0.55;
      }
    }
    this.conv.buffer = ir;
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.2;

    this.master.connect(this.comp);
    this.master.connect(this.conv);
    this.conv.connect(this.wet);
    this.wet.connect(this.comp);
    this.comp.connect(ctx.destination);

    // noise buffer กลางไว้ทำลมหายใจ
    const nLen = Math.floor(ctx.sampleRate * 1.2);
    this.noiseBuf = ctx.createBuffer(1, nLen, ctx.sampleRate);
    const nd = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < nLen; i++) nd[i] = Math.random() * 2 - 1;
  }

  now() { return this.ctx ? this.ctx.currentTime : 0; }

  /**
   * ร้องโน้ตทั้งหมด
   * @param {{midi:number,hz:number,startSec:number,durSec:number,vowel:string|null}[]} items
   * @param {{rate?:number, lead?:number}} opts
   * @returns {{t0:number, sched:{index:number,start:number,end:number}[]}}
   */
  sing(items, opts = {}) {
    if (!this.ctx) throw new Error('ต้องเรียก ready() ก่อน');
    const ctx = this.ctx;
    const rate = opts.rate || 1;
    const t0 = ctx.currentTime + (opts.lead ?? 0.16);
    const sched = [];
    let prevHz = null;

    items.forEach((it, i) => {
      const st = t0 + it.startSec / rate;
      const du = Math.max(0.08, it.durSec / rate);
      const en = st + du;
      sched.push({ index: i, start: st, end: en });
      prevHz = this._voice(it, st, du, prevHz);
    });

    this.playing = true;
    return { t0, sched, end: sched.length ? sched[sched.length - 1].end + 0.35 : t0 };
  }

  /** สร้างเสียง 1 พยางค์; คืนค่า freq สุดท้ายเพื่อใช้ portamento ต่อ */
  _voice(it, st, du, prevHz) {
    const ctx = this.ctx;
    const f = it.hz;
    const vow = VOWELS[it.vowel] ? it.vowel : 'a';
    const formants = VOWELS[vow];
    const ampScale = it.vowel === 'n' ? 0.72 : 1;

    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(this.master);

    // ── แหล่งกำเนิด: saw 2 ตัว detune + sine Sub ──
    const src = ctx.createGain();
    src.gain.value = 1;
    const mk = (type, hz, gainVal, detune) => {
      const o = ctx.createOscillator();
      this.srcs.push({ node: o, startAt: st });
      o.type = type;
      const g = ctx.createGain();
      g.gain.value = gainVal;
      o.connect(g); g.connect(src);
      o.frequency.setValueAtTime(hz, st);
      if (detune) o.detune.setValueAtTime(detune, st);
      o.start(st);
      o.stop(st + du + 0.3);
      return o;
    };

    const o1 = mk('sawtooth', f, .5, 0);
    const o2 = mk('sawtooth', f, .3, 7);
    const o3 = mk('sine', f / 2, .22, 0);
    const oscs = [o1, o2, o3];

    // portamento: ลื่นจากโน้ตก่อนหน้า (สิ่งที่สกอร์ไม่ได้บอก แต่โมเดลเรียนรู้)
    if (prevHz && Math.abs(prevHz - f) > 1) {
      const from = Math.max(40, prevHz);
      [[o1, from, f], [o2, from, f], [o3, from / 2, f / 2]].forEach(([o, a, b]) => {
        o.frequency.cancelScheduledValues(st);
        o.frequency.setValueAtTime(a, st);
        o.frequency.exponentialRampToValueAtTime(b, st + 0.055);
      });
    }

    // ── vibrato: LFO ค่อย ๆ เพิ่ม depth หลังเริ่มโน้ต ──
    const lfo = ctx.createOscillator();
    lfo.type = 'sine'; lfo.frequency.value = VIB_RATE;
    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(0, st);
    lfoGain.gain.linearRampToValueAtTime(0, st + Math.min(0.18, du * 0.3));
    lfoGain.gain.linearRampToValueAtTime(VIB_DEPTH, st + Math.min(0.5, du * 0.8));
    lfo.connect(lfoGain);
    oscs.forEach(o => lfoGain.connect(o.detune));
    this.srcs.push({ node: lfo, startAt: st });
    lfo.start(st); lfo.stop(st + du + 0.3);

    // ── formant filter bank (parallel bandpass) ──
    const bus = ctx.createGain();
    bus.gain.value = 1;
    src.connect(bus);
    const sum = ctx.createGain();
    sum.gain.value = 1;
    formants.forEach(([freq, gain, q]) => {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = Math.min(freq, ctx.sampleRate / 2.2);
      bp.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = gain;
      bus.connect(bp); bp.connect(g); g.connect(sum);
      this.nodes.push(bp, g);
    });

    // ลมหายใจ (breathiness)
    const nz = ctx.createBufferSource();
    nz.buffer = this.noiseBuf; nz.loop = true;
    const nzBp = ctx.createBiquadFilter();
    nzBp.type = 'bandpass'; nzBp.frequency.value = 1800; nzBp.Q.value = 0.8;
    const nzG = ctx.createGain();
    nzG.gain.value = 0.012;
    nz.connect(nzBp); nzBp.connect(nzG); nzG.connect(sum);
    this.srcs.push({ node: nz, startAt: st });
    nz.start(st); nz.stop(st + du + 0.2);

    // tone control
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 75;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7200; lp.Q.value = .4;
    sum.connect(hp); hp.connect(lp); lp.connect(out);

    // ── envelope ──
    const peak = PEAK * ampScale;
    out.gain.setValueAtTime(0, st);
    out.gain.linearRampToValueAtTime(peak, st + 0.038);
    out.gain.linearRampToValueAtTime(peak * 0.86, st + Math.min(0.16, du * 0.4));
    out.gain.setValueAtTime(peak * 0.86, Math.max(st + 0.04, st + du - 0.07));
    out.gain.linearRampToValueAtTime(0.0001, st + du + 0.09);

    this.nodes.push(out, src, oscs[0], oscs[1], oscs[2], lfo, lfoGain, bus, sum, nz, nzBp, nzG, hp, lp);
    return f;
  }

  stop() {
    this.playing = false;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // 1) ปิดเสียงทันที: ramp gain ของทุก node ลง 0
    this.nodes.forEach(n => {
      const g = n.gain;
      if (!g) return;
      try {
        g.cancelScheduledValues(t);
        g.setValueAtTime(typeof g.value === 'number' ? g.value : 0, t);
        g.linearRampToValueAtTime(0.0001, t + 0.06);
      } catch { /* node สิ้นสุดไปแล้ว */ }
    });
    // 2) หยุด source — ห้าม stop ก่อนเวลา start ของมันเอง
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
