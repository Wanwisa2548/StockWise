// seed.js — สร้างรายการขายจำลอง 56 วัน (ชุดเดียวกับ live demo) แล้วใส่ลงตาราง sales_transactions
const { sql, poolPromise } = require('./db');

const TODAY = new Date(2026, 8, 26); // วันที่จำลอง 26 ก.ย. 2569 (เดือนเริ่มนับจาก 0)
const HIST = 56;
// ลำดับสินค้าต้องเป็นแบบนี้ เพื่อให้ได้ตัวเลขตรงกับ live demo และคู่มือ
const PRODUCTS = [
  { sku: 'milk',   price: 14,  base: 40, trend: 0.08,  shape: 'morning' },
  { sku: 'bread',  price: 39,  base: 18, trend: 0.04,  shape: 'morning' },
  { sku: 'yog',    price: 17,  base: 22, trend: -0.06, shape: 'mixed' },
  { sku: 'egg',    price: 50,  base: 12, trend: 0.03,  shape: 'evening' },
  { sku: 'fruit',  price: 35,  base: 15, trend: 0,     shape: 'lunch' },
  { sku: 'bun',    price: 15,  base: 30, trend: 0.05,  shape: 'morning' },
  { sku: 'water',  price: 7,   base: 65, trend: 0.10,  shape: 'allday' },
  { sku: 'noodle', price: 7,   base: 48, trend: 0.02,  shape: 'late' },
  { sku: 'coffee', price: 17,  base: 26, trend: 0.06,  shape: 'mixed' },
  { sku: 'rice',   price: 215, base: 3,  trend: 0,     shape: 'evening' }
];
const WEEKDAY = [1.15, 0.93, 0.92, 0.95, 1.0, 1.08, 1.22]; // อาทิตย์..เสาร์
const SHAPES = { // น้ำหนักยอดขายแต่ละชั่วโมง 06:00..22:00
  morning: [5,9,10,7,4,4,5,4,3,3,4,6,7,5,3,2,1],
  lunch:   [1,2,3,4,6,10,11,7,4,3,4,5,5,4,3,2,1],
  evening: [1,2,2,2,3,4,4,3,3,4,6,9,10,8,6,3,2],
  allday:  [2,4,5,5,6,8,8,6,5,5,6,7,7,6,5,4,3],
  late:    [1,2,3,3,3,5,5,4,3,3,4,6,7,8,8,7,6],
  mixed:   [3,6,6,5,5,7,6,5,5,6,6,6,5,4,3,2,1]
};

// ตัวสุ่มแบบกำหนด seed ได้ (รันกี่ครั้งก็ได้ข้อมูลเดิม)
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
const pad = n => String(n).padStart(2, '0');
const dayOf = i => { const d = new Date(TODAY); d.setDate(d.getDate() - HIST + i); return d; };

// 1) ยอดขายรายวันของแต่ละสินค้า
PRODUCTS.forEach(p => {
  const r = rng(hash(p.sku)); p.daily = [];
  for (let i = 0; i < HIST; i++) {
    const g = (r() + r() + r() - 1.5) / 1.5;
    const v = p.base * (1 + p.trend * (i - HIST / 2) / HIST) * WEEKDAY[dayOf(i).getDay()] * (1 + 0.22 * g);
    p.daily.push(Math.max(0, Math.round(v)));
  }
});

// 2) แตกยอดรายวันเป็นรายการขายรายบิลพร้อม timestamp
function hourWeights(p, dow) {
  const w = SHAPES[p.shape].slice();
  if (dow === 0 || dow === 6) { w[0] *= .5; w[1] *= .6; w[2] *= .8; w[3] *= 1.3; w[4] *= 1.4; w[5] *= 1.2; } // เสาร์-อาทิตย์คนออกสาย
  return w;
}
const tx = []; const r = rng(20260926);
for (let i = 0; i < HIST; i++) {
  const day = dayOf(i), lines = [];
  PRODUCTS.forEach(p => {
    const w = hourWeights(p, day.getDay()), tot = w.reduce((a, b) => a + b, 0);
    let left = p.daily[i];
    while (left > 0) {
      const q = p.sku === 'rice' ? 1 : Math.min(left, r() < 0.62 ? 1 : (r() < 0.7 ? 2 : 3)); left -= q;
      let u = r() * tot, h = 0; while (h < w.length - 1 && u > w[h]) { u -= w[h]; h++; }
      lines.push({ m: (6 + h) * 60 + Math.floor(r() * 60), sku: p.sku, qty: q, price: p.price });
    }
  });
  lines.sort((a, b) => a.m - b.m);
  const ymd = `${String(day.getFullYear()).slice(2)}${pad(day.getMonth() + 1)}${pad(day.getDate())}`;
  let rc = 0, cur = null;
  lines.forEach(l => {
    if (cur && l.m - cur.m <= 2 && cur.n < 4 && r() < 0.55) { cur.n++; l.m = cur.m; }
    else { rc++; cur = { m: l.m, n: 1, sec: Math.floor(r() * 60), id: `R${ymd}-${String(rc).padStart(4, '0')}`, items: {} }; }
    if (cur.items[l.sku]) { cur.items[l.sku].qty += l.qty; return; }
    const t = new Date(day); t.setHours(Math.floor(l.m / 60), l.m % 60, cur.sec, 0);
    const row = { rid: cur.id, t, sku: l.sku, qty: l.qty, price: l.price };
    cur.items[l.sku] = row; tx.push(row);
  });
}

// 3) บันทึกลงฐานข้อมูล
(async () => {
  const pool = await poolPromise;
  if (!pool) process.exit(1);
  const ids = {};
  (await pool.request().query('SELECT id, sku FROM products')).recordset.forEach(x => { ids[x.sku] = x.id; });

  await pool.request().query('DELETE FROM sales_transactions');
  const table = new sql.Table('sales_transactions');
  table.create = false;
  table.columns.add('receipt_no', sql.VarChar(20), { nullable: false });
  table.columns.add('sold_at', sql.DateTime2(0), { nullable: false });
  table.columns.add('product_id', sql.Int, { nullable: false });
  table.columns.add('lot_id', sql.Int, { nullable: true });
  table.columns.add('qty', sql.Int, { nullable: false });
  table.columns.add('unit_price', sql.Decimal(10, 2), { nullable: false });
  tx.forEach(x => table.rows.add(x.rid, x.t, ids[x.sku], null, x.qty, x.price));
  await pool.request().bulk(table);

  console.log(`เพิ่มรายการขาย ${tx.length} รายการ (${new Set(tx.map(x => x.rid)).size} บิล) เรียบร้อย`);
  process.exit(0);
})();