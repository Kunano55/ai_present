/* ═══════════════════════════════════════════════════════════
   midi.js — Standard MIDI File parser ขนาดเล็ก (format 0/1)
   อ่าน untitled.mid จาก repo ตรง ๆ ในเบราว์เซอร์
   ═══════════════════════════════════════════════════════════ */

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function noteName(midi) {
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

export function midiToHz(midi, a4 = 440) {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

/** อ่าน variable-length quantity */
function readVLQ(dv, pos) {
  let value = 0, b, guard = 0;
  do {
    b = dv.getUint8(pos++);
    value = (value << 7) | (b & 0x7f);
    if (++guard > 4) break;
  } while (b & 0x80);
  return { value, pos };
}

/**
 * @param {ArrayBuffer} buf
 * @returns {object} parsed MIDI
 */
export function parseMidi(buf) {
  const dv = new DataView(buf);
  if (dv.getUint32(0) !== 0x4d546864) throw new Error('ไม่ใช่ไฟล์ MIDI (ไม่มี MThd)');

  const format = dv.getUint16(8);
  const nTracks = dv.getUint16(10);
  const division = dv.getUint16(12);           // ticks ต่อ quarter note
  if (division & 0x8000) throw new Error('ไม่รองรับ SMPTE timecode');

  const tempoMap = [];       // [{tick, uspq}]
  const timeSigs = [];
  const trackNames = [];
  const notes = [];
  let pos = 14;

  for (let t = 0; t < nTracks; t++) {
    if (dv.getUint32(pos) !== 0x4d54726b) throw new Error('track header ผิดตำแหน่ง');
    const len = dv.getUint32(pos + 4);
    const end = pos + 8 + len;
    let p = pos + 8;
    let tick = 0;
    let running = null;
    const pending = new Map();     // noteNumber -> {startTick, vel}

    while (p < end) {
      const { value: delta, pos: np } = readVLQ(dv, p);
      p = np; tick += delta;
      let status = dv.getUint8(p);

      if (status < 0x80) {
        status = running;
      } else {
        p += 1; running = status;
      }
      const type = status & 0xf0;

      if (type === 0x90 || type === 0x80 || type === 0xa0) {
        const n1 = dv.getUint8(p), n2 = dv.getUint8(p + 1); p += 2;
        if (type === 0x90 && n2 > 0) {
          pending.set(n1, { startTick: tick, vel: n2 });
        } else if (type === 0x80 || (type === 0x90 && n2 === 0)) {
          const on = pending.get(n1);
          if (on) {
            pending.delete(n1);
            notes.push({
              midi: n1, name: noteName(n1), vel: on.vel,
              startTick: on.startTick, endTick: tick, durTick: tick - on.startTick,
              track: t,
            });
          }
        }
      } else if (type === 0xb0 || type === 0xe0) {
        p += 2;
      } else if (type === 0xc0 || type === 0xd0) {
        p += 1;
      } else if (status === 0xff) {
        const metaType = dv.getUint8(p); p += 1;
        const { value: ml, pos: np2 } = readVLQ(dv, p); p = np2;
        const data = new Uint8Array(buf, p, ml);
        if (metaType === 0x51 && ml === 3) {
          tempoMap.push({ tick, uspq: (data[0] << 16) | (data[1] << 8) | data[2] });
        } else if (metaType === 0x58 && ml >= 2) {
          timeSigs.push({ tick, num: data[0], den: Math.pow(2, data[1]) });
        } else if (metaType === 0x03 || metaType === 0x01) {
          trackNames.push(new TextDecoder('utf-8').decode(data));
        }
        p += ml;
      } else if (status === 0xf0 || status === 0xf7) {
        const { value: ml, pos: np2 } = readVLQ(dv, p); p = np2;
        p += ml;
      } else {
        p += 1;   // ไม่รู้จัก → ข้าม 1 byte
      }
    }
    // โน้ตที่ค้าง (ไม่มี note off)
    for (const [n1, on] of pending) {
      notes.push({
        midi: n1, name: noteName(n1), vel: on.vel,
        startTick: on.startTick, endTick: tick, durTick: tick - on.startTick, track: t,
      });
    }
    pos = end;
  }

  notes.sort((a, b) => a.startTick - b.startTick || a.midi - b.midi);

  if (!tempoMap.length) tempoMap.push({ tick: 0, uspq: 500000 });
  tempoMap.sort((a, b) => a.tick - b.tick);

  const lastTick = notes.length ? Math.max(...notes.map(n => n.endTick)) : 0;

  // tick → วินาที (รองรับ tempo เปลี่ยนหลายช่วง)
  const evs = [...tempoMap].sort((a, b) => a.tick - b.tick);
  if (evs[0].tick !== 0) evs.unshift({ tick: 0, uspq: evs[0].uspq });
  const tickToSec = (tick) => {
    let sec = 0, prev = 0, uspq = evs[0].uspq;
    for (const e of evs) {
      if (e.tick > tick) break;
      sec += ((e.tick - prev) / division) * (uspq / 1e6);
      prev = e.tick;
      uspq = e.uspq;
    }
    return sec + ((tick - prev) / division) * (uspq / 1e6);
  };

  notes.forEach(n => {
    n.startSec = tickToSec(n.startTick);
    n.durSec = Math.max(0.02, tickToSec(n.endTick) - n.startSec);
    n.hz = midiToHz(n.midi);
  });

  const durationSec = notes.length ? Math.max(...notes.map(n => n.startSec + n.durSec)) : 0;
  const baseUspq = tempoMap[0].uspq;

  return {
    format, nTracks, division,
    bpm: 60e6 / baseUspq,
    uspq: baseUspq,
    timeSig: timeSigs[0] ? `${timeSigs[0].num}/${timeSigs[0].den}` : '4/4',
    trackNames,
    notes,
    totalTicks: lastTick,
    durationSec,
    beatSec: baseUspq / 1e6,
    tickSec: baseUspq / 1e6 / division,
  };
}

/** โหลด + parse จาก URL (มี timeout กันการค้าง → fallback ทำงานต่อได้) */
export async function loadMidi(url, timeoutMs = 6000) {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
  try {
    const res = await fetch(url, { cache: 'no-store', signal: ctl ? ctl.signal : undefined });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseMidi(await res.arrayBuffer());
  } finally {
    if (timer) clearTimeout(timer);
  }
}
