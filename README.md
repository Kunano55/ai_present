# NNSVS · Interactive Presentation Deck

สไลด์นำเสนอแบบเว็บ (ไม่ใช่ PDF) พร้อมอนิเมชั่นอธิบายการทำงานของโมเดล
**NNSVS: A Neural Network-Based Singing Voice Synthesis Toolkit**
(Yamamoto, Yoneyama, Toda — ICASSP 2023, [arXiv:2210.15987v2](https://arxiv.org/abs/2210.15987))

## รันสไลด์

เป็นเว็บ static ล้วน ๆ ไม่ต้อง build ไม่ต้องลง dependency

```bash
python3 -m http.server 8080 --bind 0.0.0.0
# เปิด http://localhost:8080
```

> ต้องเสิร์ฟผ่าน HTTP (ไม่ใช่เปิด `index.html` ตรง ๆ) เพราะสไลด์ที่ 3 โหลด `untitled.mid`
> ด้วย `fetch()` — ถ้าโหลดไม่ได้ โค้ดจะ fallback ไปใช้โน้ตที่ parse ไว้ล่วงหน้าให้อัตโนมัติ

## สไลด์

| # | หัวข้อ | สิ่งที่เคลื่อนไหว |
|---|--------|--------------------|
| 1 | เปิด · NNSVS | คลื่นพื้นหลัง (canvas) + ตัวเลขนับขึ้น |
| 2 | Score-to-Sing คืออะไร | **piano roll จาก `untitled.mid` จริง** จับคู่ 1 โน้ต : 1 พยางค์ + กดเล่นได้ (formant synth ในเบราว์เซอร์) |
| 3 | ปัญหาที่เจอ | การ์ด pain point 8 ใบ ไล่ขึ้นทีละใบ |
| 4 | โมเดลนี้ทำงานยังไง | แผนภาพ SVG 4 โมดูล (time-lag → duration → acoustic → vocoder) พร้อมแพ็กเก็ตข้อมูลไหลทีละขั้น |
| 5 | หัวใจของโมเดล | multi-stream vs single-stream + กราฟ F0 ที่วาดตัวเอง (ขั้นบันได vs AR log-F0 ที่มี time-lag/portamento/vibrato) |
| 6 | แก้ปัญหาเก่าได้ยังไง | จับคู่ ปัญหาเดิม → วิธีแก้ 8 คู่ |
| 7 | Dataset | donut แบ่ง 100/5/5 + คีย์บอร์ดช่วง pitch (train / test / `untitled.mid`) |
| 8 | ผลลัพธ์ | กราฟแท่ง MOS ทั้ง 17 ระบบจาก Table 1 พร้อม 95% CI |
| 9 | สรุป | บทเรียน + งานต่อยอด + อ้างอิง |

## ปุ่มลัด

`←` `→` `Space` `PgUp/PgDn` `Home/End` เปลี่ยนสไลด์ · `O` รายการสไลด์ · `F` เต็มจอ ·
`S` ร้อง (เมื่ออยู่สไลด์ 2) · `1`–`9` กระโดดไปสไลด์ · swipe / scroll wheel ก็ใช้ได้

## สไลด์ 2: `untitled.mid` + เนื้อร้อง

ไฟล์ MIDI ใน repo ถูก parse ในเบราว์เซอร์ (format 1, 3 tracks, 96 ticks/qn, 138 BPM, 4/4)
ได้โน้ต 13 ตัว ช่วง D#3–D#4 ยาว 3.47 วินาที ซึ่งจับคู่ 1:1 กับเนื้อร้อง 13 พยางค์:

```
D#3  F3  F#3  G#3  A#3  D#4  C#4  A#3  D#3  A#3  G#3  F#3  F3
 な   が   れ    て    ぐ    と    き    の   な    が    で    で   も
```

ช่อง "เนื้อร้อง" แก้ไขได้ — ข้อความจะถูกตัดเป็น mora อัตโนมัติ (รวมตัวเล็ก ゃゅょ)
แล้วจับคู่กับโน้ตใหม่ทันที (ถ้าพยางค์น้อยกว่าโน้ตจะวนซ้ำ ให้มากกว่าจะตัด)
เสียงที่ได้สังเคราะห์ด้วย Web Audio API: sawtooth → formant filter ตามสระของแต่ละพยางค์
+ vibrato + portamento เป็นภาพย่อของสิ่งที่ acoustic model + vocoder ทำจริง

## โครงสร้างไฟล์

```
index.html          โครงสไลด์ทั้งหมด
untitled.mid        ไฟล์ MIDI ต้นทาง (ใช้จริงในสไลด์ 3)
assets/css/deck.css ธีม minimal (light/dark) + layout + อนิเมชั่น
assets/js/theme.js  อ่าน palette จาก CSS variables + สลับธีม
assets/js/midi.js   parser ไฟล์ Standard MIDI
assets/js/jp.js     ตัด mora / romaji / สระ / phoneme
assets/js/synth.js  formant singing synth (Web Audio)
assets/js/demo.js   สไลด์ Score-to-Sing
assets/js/pipeline.js  แผนภาพ SVG การทำงานของโมเดล
assets/js/charts.js    กราฟ F0 · donut · คีย์บอร์ด · MOS · การ์ด
assets/js/deck.js   นำทางสไลด์
assets/js/main.js   ประกอบทั้งหมด
```
