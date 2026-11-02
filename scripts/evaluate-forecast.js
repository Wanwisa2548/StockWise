#!/usr/bin/env node
// scripts/evaluate-forecast.js — ประเมินความแม่นยำของวิธีพยากรณ์ย้อนหลัง "ทั้งชุดข้อมูล" (หน้าเว็บดูแค่ HIST_DAYS วัน)
// ใช้ Calc.forecast / Calc.errorMetrics ตัวเดียวกับหน้าเว็บ จึงได้ MAE / MAPE / RMSE ตามนิยามเดียวกัน
// ผลลัพธ์ใช้เป็นหลักฐาน "ความแม่นยำของโมเดล" ในรายงาน และทำซ้ำได้ทุกครั้ง
//
// วิธีใช้
//   node scripts/evaluate-forecast.js                                 อ่านยอดขายรายวันจากฐานข้อมูล (วิว daily_sales)
//   node scripts/evaluate-forecast.js --csv "data/Bakery sales.csv"   อ่านจากไฟล์ CSV ตรงๆ ไม่ต้องต่อฐานข้อมูล
// ตัวเลือก
//   --start N    นับความคลาดเคลื่อนตั้งแต่วันที่ N ของอนุกรมให้ "ทุกวิธีเท่ากัน" (ค่าเริ่มต้น 28 เพื่อให้ MA n=28 เทียบได้)
//                --start 0 = แต่ละวิธีนับตั้งแต่วันแรกที่พยากรณ์ได้
//   --calendar   นับวันที่ร้านไม่มียอดขายเลยเป็น 0 ด้วย (ค่าเริ่มต้นข้ามวันเหล่านั้น เพราะวันปิดร้านไม่ใช่ความต้องการ 0)
//   --detail     แสดง MAPE รายสินค้า

const fs = require('fs');
const Calc = require('../public/js/calc.js');

const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf('--' + name); if (i < 0) return null; const v = args[i + 1]; return v !== undefined && !v.startsWith('--') ? v : true; };
const START = opt('start') === null ? 28 : Number(opt('start'));
const CALENDAR = opt('calendar') !== null;
const DETAIL = opt('detail') !== null;
const CSV = opt('csv');

// สินค้า 10 ตัวของชุด French Bakery (ชื่อตรงกับคอลัมน์ article ในไฟล์ CSV) — ใช้เฉพาะโหมด --csv
const CSV_ARTICLES = ['TRADITIONAL BAGUETTE', 'CROISSANT', 'PAIN AU CHOCOLAT', 'BANETTE', 'BAGUETTE',
  'CEREAL BAGUETTE', 'SPECIAL BREAD', 'TARTELETTE', 'BOULE 400G', 'COOKIE'];

/* ---------------- โหลดข้อมูล → { names, days, series: { name: [ยอดรายวัน] } } ---------------- */

// อ่านบรรทัด CSV ที่มีช่องในเครื่องหมายคำพูด เช่น "0,90 €"
function parseCsvLine(line) {
  const out = []; let cur = '', quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

// perDay: Map(วันที่ → Map(ชื่อสินค้า → จำนวน)) → อนุกรมรายวัน (ข้ามวันที่ไม่มียอดขายเลย ยกเว้นใช้ --calendar)
function buildSeries(names, perDay) {
  let days = [...perDay.keys()].filter(d => [...perDay.get(d).values()].some(q => q > 0)).sort();
  if (CALENDAR && days.length) {
    const all = [], end = Date.parse(days[days.length - 1]);
    for (let t = Date.parse(days[0]); t <= end; t += 864e5) all.push(new Date(t).toISOString().slice(0, 10));
    days = all;
  }
  const series = {};
  names.forEach(n => { series[n] = days.map(d => (perDay.get(d) && perDay.get(d).get(n)) || 0); });
  return { names, days, series };
}

function loadCsv(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const head = parseCsvLine(lines[0]);
  const iDate = head.indexOf('date'), iArt = head.indexOf('article'), iQty = head.indexOf('Quantity'), iPrice = head.indexOf('unit_price');
  if ([iDate, iArt, iQty, iPrice].some(i => i < 0)) throw new Error('ไม่พบคอลัมน์ date, article, Quantity, unit_price ในไฟล์ CSV');
  const wanted = new Set(CSV_ARTICLES), perDay = new Map();
  let used = 0;
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const f = parseCsvLine(lines[i]);
    const qty = Number(f[iQty]), price = parseFloat(String(f[iPrice]).replace('€', '').replace(',', '.'));
    if (!wanted.has(f[iArt]) || !(qty > 0) || !(price > 0)) continue;       // ตัดแถวคืนสินค้า/ราคาผิดปกติ เหมือนตอน import
    if (!perDay.has(f[iDate])) perDay.set(f[iDate], new Map());
    const m = perDay.get(f[iDate]); m.set(f[iArt], (m.get(f[iArt]) || 0) + qty);
    used++;
  }
  console.log(`อ่านจาก CSV: ${used.toLocaleString('en-US')} แถว (หลังตัดแถวจำนวน/ราคา ≤ 0)`);
  return buildSeries(CSV_ARTICLES, perDay);
}

async function loadDb() {
  const { poolPromise } = require('../db');
  const pool = await poolPromise;
  const products = (await pool.request().query('SELECT id, name FROM products ORDER BY id')).recordset;
  const rows = (await pool.request().query(
    'SELECT product_id, CONVERT(varchar(10), sale_date, 23) AS d, qty FROM daily_sales')).recordset;
  await pool.close();
  const nameOf = Object.fromEntries(products.map(p => [p.id, p.name])), perDay = new Map();
  rows.forEach(r => {
    if (!nameOf[r.product_id]) return;
    if (!perDay.has(r.d)) perDay.set(r.d, new Map());
    perDay.get(r.d).set(nameOf[r.product_id], r.qty);
  });
  console.log(`อ่านจากฐานข้อมูล: ${rows.length.toLocaleString('en-US')} แถวของ daily_sales`);
  return buildSeries(products.map(p => p.name), perDay);
}

/* ---------------- วิธีที่เทียบ ---------------- */

// baseline: ใช้ยอดเมื่อ lag วันก่อนหน้าในอนุกรม (lag 7 ≈ วันเดียวกันของสัปดาห์ก่อน ถ้าร้านเปิดทุกวัน) — ไม่ใช่โมเดลของระบบ ใช้เทียบเท่านั้น
function lagForecast(s, lag) { return { fitted: s.map((_, t) => t >= lag ? s[t - lag] : null) }; }

const METHODS = [
  { label: 'Naive (ยอดวันก่อนหน้า)', run: s => Calc.forecast(s, 'ma', 1) },
  { label: 'Moving Average n=3', run: s => Calc.forecast(s, 'ma', 3) },
  { label: 'Moving Average n=7 (ค่าเริ่มต้นของระบบ)', run: s => Calc.forecast(s, 'ma', 7) },
  { label: 'Moving Average n=14', run: s => Calc.forecast(s, 'ma', 14) },
  { label: 'Moving Average n=28', run: s => Calc.forecast(s, 'ma', 28) },
  { label: 'Exponential Smoothing α=0.1', run: s => Calc.forecast(s, 'es', 0.1) },
  { label: 'Exponential Smoothing α=0.2', run: s => Calc.forecast(s, 'es', 0.2) },
  { label: 'Exponential Smoothing α=0.3', run: s => Calc.forecast(s, 'es', 0.3) },
  { label: 'Exponential Smoothing α=0.5', run: s => Calc.forecast(s, 'es', 0.5) },
  { label: 'Baseline: ยอด 7 วันก่อน', run: s => lagForecast(s, 7) }
];

// ความคลาดเคลื่อนของวิธีหนึ่งบนอนุกรมหนึ่ง นับตั้งแต่วันที่ START (และต้องมีค่าพยากรณ์)
function score(fc, s) {
  const rows = [];
  s.forEach((a, t) => { if (t >= START && fc.fitted[t] !== null) rows.push({ a, f: fc.fitted[t] }); });
  return Calc.errorMetrics(rows);
}

/* ---------------- รัน ---------------- */

(async () => {
  const { names, days, series } = CSV ? loadCsv(CSV) : await loadDb();
  if (!days.length) throw new Error('ไม่พบข้อมูลยอดขาย');
  console.log(`อนุกรม: ${days.length} วัน (${days[0]} ถึง ${days[days.length - 1]}) · ${names.length} สินค้า · ${CALENDAR ? 'นับทุกวันตามปฏิทิน' : 'เฉพาะวันที่มียอดขาย'} · เริ่มนับความคลาดเคลื่อนที่วันที่ ${START + 1}\n`);

  const res = METHODS.map(m => ({ label: m.label, per: names.map(n => score(m.run(series[n]), series[n])) }));
  res.forEach(r => { r.mape = r.per.reduce((s, x) => s + x.mape, 0) / names.length; r.wins = 0; });
  names.forEach((_, i) => { const best = Math.min(...res.map(r => r.per[i].mape)); res.forEach(r => { if (r.per[i].mape === best) r.wins++; }); });
  const bestAvg = Math.min(...res.map(r => r.mape));

  console.log('| วิธีพยากรณ์ | MAPE เฉลี่ยทุกสินค้า (%) | ชนะ (จำนวนสินค้า) |\n|---|---:|---:|');
  res.forEach(r => console.log(`| ${r.label} | ${r.mape.toFixed(1)}${r.mape === bestAvg ? ' ★' : ''} | ${r.wins} / ${names.length} |`));
  console.log('\n★ = MAPE เฉลี่ยต่ำสุด · MAPE ข้ามวันที่ยอดขายจริงเป็น 0 (หารไม่ได้) ตามนิยามของ Calc.errorMetrics');

  if (DETAIL) {
    console.log('\nMAPE รายสินค้า (%)\n\n| สินค้า | ' + res.map(r => r.label.replace(' (ค่าเริ่มต้นของระบบ)', '')).join(' | ') + ' |\n|---|' + res.map(() => '---:').join('|') + '|');
    names.forEach((n, i) => console.log(`| ${n} | ${res.map(r => r.per[i].mape.toFixed(1)).join(' | ')} |`));
  }
})().catch(e => { console.error('ผิดพลาด:', e.message); process.exit(1); });
