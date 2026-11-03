// import-bakery.js — สร้างข้อมูล StockWise ในฐานใหม่จาก Bakery sales.csv + database/bakery-config.json
// ใช้กรณีต้องตั้งฐานข้อมูลใหม่ เช่น เครื่องที่เป็นเซิร์ฟเวอร์ใช้ไม่ได้ในวันนำเสนอ
//
// ขั้นตอน
//   1. รัน database/schema.sql ใน SSMS บนเครื่องใหม่ (สร้างฐาน/ตารางเปล่า)
//   2. ตั้ง .env ให้ชี้ไปฐานใหม่
//   3. node scripts/import-bakery.js --csv "C:\path\Bakery sales.csv"            (ตรวจอย่างเดียว ไม่เขียนฐาน)
//   4. node scripts/import-bakery.js --csv "C:\path\Bakery sales.csv" --write    (เขียนลงฐาน)
//
// ความปลอดภัย: --write จะยกเลิกถ้าตาราง products มีข้อมูลอยู่แล้ว ไม่ลบหรือแก้ข้อมูลเดิม
const fs = require('fs');
const path = require('path');
const { parseBakeryCsv } = require('./bakery-csv.cjs');

const root = path.resolve(__dirname, '..');
const arg = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const csvPath = arg('--csv');
const configPath = arg('--config') || path.join(root, 'database', 'bakery-config.json');
const write = process.argv.includes('--write');

function fail(msg) { console.error(msg); process.exit(1); }

if (!csvPath) fail('ระบุไฟล์ CSV ด้วย --csv "<path>\\Bakery sales.csv"');
if (!fs.existsSync(csvPath)) fail(`ไม่พบไฟล์ CSV: ${csvPath}`);
if (!fs.existsSync(configPath)) fail(`ไม่พบ ${configPath} — รัน node scripts/export-bakery-config.js บนฐานเดิมก่อน หรือระบุ --config`);

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const products = config.products || [];
const lots = config.lots || [];
if (!products.length) fail('bakery-config.json ไม่มีรายการสินค้า');
const bySku = Object.fromEntries(products.map(p => [p.sku, p]));
const badLot = lots.find(l => !bySku[l.sku]);
if (badLot) fail(`ล็อตอ้างถึง SKU ที่ไม่มีในรายการสินค้า: ${badLot.sku}`);

const { rows, stats } = parseBakeryCsv(fs.readFileSync(csvPath, 'utf8'), products.map(p => p.name));
const found = new Set(rows.map(r => r.article));
const missing = products.filter(p => !found.has(p.name)).map(p => p.name);

console.log(`CSV: ${stats.allRows.toLocaleString('en-US')} แถว · ${stats.distinctArticles} ชื่อสินค้า · ${stats.minDate} ถึง ${stats.maxDate}`);
console.log(`สินค้าที่เลือก ${products.length} รายการ: ${stats.selectedRows.toLocaleString('en-US')} แถว · ตัด Quantity ≤ 0 ออก ${stats.nonPositive} แถว · อ่านไม่ได้ ${stats.badRows} แถว`);
console.log(`จะนำเข้า: สินค้า ${products.length} · ล็อต ${lots.length} · รายการขาย ${rows.length.toLocaleString('en-US')}`);
if (missing.length) console.log(`คำเตือน: ไม่พบยอดขายของ ${missing.join(', ')} ในไฟล์ CSV (ชื่อต้องตรงกับคอลัมน์ article)`);
if (config.sales_in_database && config.sales_in_database.rows !== rows.length) {
  console.log(`คำเตือน: ฐานเดิมมีรายการขาย ${config.sales_in_database.rows} แต่ CSV ให้ ${rows.length} — ตรวจว่าเป็นไฟล์เดียวกันหรือไม่`);
}
if (!write) { console.log('\nโหมดตรวจอย่างเดียว ยังไม่เขียนฐาน · เพิ่ม --write เมื่อพร้อม'); process.exit(0); }

(async () => {
  const { sql, poolPromise } = require('../db');
  const pool = await poolPromise;
  const existing = (await pool.request().query('SELECT COUNT(*) AS n FROM products')).recordset[0].n;
  if (existing > 0) fail(`ยกเลิก: ตาราง products มีข้อมูลอยู่แล้ว ${existing} แถว สคริปต์นี้ใช้กับฐานเปล่าเท่านั้น และไม่ลบข้อมูลเดิม`);

  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const ids = {};
    for (const p of products) {
      const r = await new sql.Request(tx)
        .input('sku', sql.VarChar(20), p.sku).input('name', sql.NVarChar(100), p.name).input('unit', sql.NVarChar(20), p.unit)
        .input('cost', sql.Decimal(10, 2), p.cost).input('price', sql.Decimal(10, 2), p.price).input('order_cost', sql.Decimal(10, 2), p.order_cost)
        .input('lead', sql.Int, p.lead_time_days).input('life', sql.Int, p.shelf_life_days)
        .query(`INSERT INTO products (sku, name, unit, cost, price, order_cost, lead_time_days, shelf_life_days)
                OUTPUT INSERTED.id VALUES (@sku, @name, @unit, @cost, @price, @order_cost, @lead, @life)`);
      ids[p.sku] = r.recordset[0].id;
    }
    for (const l of lots) {
      await new sql.Request(tx)
        .input('pid', sql.Int, ids[l.sku]).input('rec', sql.Int, l.qty_received).input('rem', sql.Int, l.qty_remaining)
        .input('rd', sql.Date, l.received_date).input('ed', sql.Date, l.expiry_date)
        .query(`INSERT INTO inventory_lots (product_id, qty_received, qty_remaining, received_date, expiry_date)
                VALUES (@pid, @rec, @rem, @rd, @ed)`);
    }
    const idByName = Object.fromEntries(products.map(p => [p.name, ids[p.sku]]));
    const table = new sql.Table('sales_transactions');
    table.create = false;
    table.columns.add('receipt_no', sql.VarChar(20), { nullable: false });
    table.columns.add('sold_at', sql.DateTime2(0), { nullable: false });
    table.columns.add('product_id', sql.Int, { nullable: false });
    table.columns.add('lot_id', sql.Int, { nullable: true });
    table.columns.add('qty', sql.Int, { nullable: false });
    table.columns.add('unit_price', sql.Decimal(10, 2), { nullable: false });
    // sold_at เป็นเวลาท้องถิ่นของร้าน (db.js ตั้ง useUTC: false)
    rows.forEach(r => {
      const [d, t] = r.sold_at.split(' '); const [y, m, day] = d.split('-').map(Number); const [hh, mi, ss] = t.split(':').map(Number);
      table.rows.add(r.receipt_no, new Date(y, m - 1, day, hh, mi, ss), idByName[r.article], null, r.qty, r.unit_price);
    });
    await new sql.Request(tx).bulk(table);
    await tx.commit();
    console.log(`นำเข้าแล้ว: สินค้า ${products.length} · ล็อต ${lots.length} · รายการขาย ${rows.length.toLocaleString('en-US')}`);
    process.exit(0);
  } catch (err) {
    await tx.rollback().catch(() => {});
    fail(`นำเข้าไม่สำเร็จ ยกเลิกทั้งหมดแล้ว: ${err.message}`);
  }
})().catch(err => fail(`เชื่อมฐานข้อมูลไม่สำเร็จ: ${err.message}`));
