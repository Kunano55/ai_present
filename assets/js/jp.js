/* ═══════════════════════════════════════════════════════════
   jp.js — ตัดข้อความญี่ปุ่นเป็น mora (拍) + แปลงเป็น romaji
   ใช้จับคู่ "1 mora : 1 โน้ต" ในสไลด์ Score-to-Sing
   ═══════════════════════════════════════════════════════════ */

const SMALL = new Set(['ゃ', 'ゅ', 'ょ', 'ャ', 'ュ', 'ョ', 'ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ', 'ァ', 'ィ', 'ゥ', 'ェ', 'ォ']);

const KANA_ROMAJI = {
  'あ':'a','い':'i','う':'u','え':'e','お':'o',
  'か':'ka','き':'ki','く':'ku','け':'ke','こ':'ko',
  'さ':'sa','し':'shi','す':'su','せ':'se','そ':'so',
  'た':'ta','ち':'chi','つ':'tsu','て':'te','と':'to',
  'な':'na','に':'ni','ぬ':'nu','ね':'ne','の':'no',
  'は':'ha','ひ':'hi','ふ':'fu','へ':'he','ほ':'ho',
  'ま':'ma','み':'mi','む':'mu','め':'me','も':'mo',
  'や':'ya','ゆ':'yu','よ':'yo',
  'ら':'ra','り':'ri','る':'ru','れ':'re','ろ':'ro',
  'わ':'wa','ゐ':'wi','ゑ':'we','を':'wo','ん':'n',
  'が':'ga','ぎ':'gi','ぐ':'gu','げ':'ge','ご':'go',
  'ざ':'za','じ':'ji','ず':'zu','ぜ':'ze','ぞ':'zo',
  'だ':'da','ぢ':'ji','づ':'zu','で':'de','ど':'do',
  'ば':'ba','び':'bi','ぶ':'bu','べ':'be','ぼ':'bo',
  'ぱ':'pa','ぴ':'pi','ぷ':'pu','ぺ':'pe','ぽ':'po',
  'きゃ':'kya','きゅ':'kyu','きょ':'kyo',
  'しゃ':'sha','しゅ':'shu','しょ':'sho',
  'ちゃ':'cha','ちゅ':'chu','ちょ':'cho',
  'にゃ':'nya','にゅ':'nyu','にょ':'nyo',
  'ひゃ':'hya','ひゅ':'hyu','ひょ':'hyo',
  'みゃ':'mya','みゅ':'myu','みょ':'myo',
  'りゃ':'rya','りゅ':'ryu','りょ':'ryo',
  'ぎゃ':'gya','ぎゅ':'gyu','ぎょ':'gyo',
  'じゃ':'ja','じゅ':'ju','じょ':'jo',
  'びゃ':'bya','びゅ':'byu','びょ':'byo',
  'ぴゃ':'pya','ぴゅ':'pyu','ぴょ':'pyo',
  'ふぁ':'fa','ふぃ':'fi','ふぇ':'fe','ふぉ':'fo',
  'てぃ':'ti','でぃ':'di','うぃ':'wi','うぇ':'we','うぉ':'wo',
  'ヴ':'vu','っ':'っ','ッ':'っ','ー':'ー','・':'','　':'',
};

// katakana → hiragana (เพื่อให้ map เดียวใช้ได้ทั้งสองแบบ)
function toHiragana(s) {
  return s.replace(/[\u30A1-\u30F6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

/**
 * ตัดสตริงเป็น mora: ตัวอักษรเล็ก (ゃゅょ…) จะเกาะกับพยางค์ก่อนหน้า
 * @param {string} text
 * @returns {string[]}
 */
export function splitMora(text) {
  const src = toHiragana(String(text || '')).replace(/[\s\u3000]/g, '');
  const out = [];
  for (const ch of src) {
    if (out.length && (SMALL.has(ch) || ch === 'ゅ' || ch === 'ょ')) {
      out[out.length - 1] += ch;
    } else {
      out.push(ch);
    }
  }
  return out;
}

/** mora → romaji (fallback: ตัวอักษรนั้นตรง ๆ) */
export function moraToRomaji(mora) {
  const h = toHiragana(mora);
  if (KANA_ROMAJI[h]) return KANA_ROMAJI[h];
  if (h.length === 2 && KANA_ROMAJI[h[0]] && SMALL.has(h[1])) return KANA_ROMAJI[h[0]] + h[1];
  return h;
}

/** mora → สระ (a/i/u/e/o) สำหรับสังเคราะห์ formant */
export function moraToVowel(mora) {
  const h = toHiragana(mora);
  if (h === 'ん') return 'n';
  if (h === 'っ' || h === 'ー') return null;         // พยัญชนะหยุด / ลากเสียง
  const r = moraToRomaji(mora);
  const last = r[r.length - 1];
  if ('aiueo'.includes(last)) return last;
  if (r === 'shi' || r === 'chi' || r === 'ji') return 'i';
  if (r === 'tsu') return 'u';
  if (r === 'n') return 'n';
  return 'a';
}

/** mora → phoneme อย่างหยาบ (consonant + vowel) เพื่อโชว์ขั้น phone-level */
export function moraToPhones(mora) {
  const r = moraToRomaji(mora);
  const v = moraToVowel(mora);
  if (v === null) return [{ p: 'cl', t: 'c' }];
  if (r === 'n') return [{ p: 'n', t: 'c' }, { p: 'N', t: 'v' }];
  const cons = r.slice(0, r.length - 1);
  const out = [];
  if (cons) out.push({ p: cons, t: 'c' });
  out.push({ p: v, t: 'v' });
  return out;
}
