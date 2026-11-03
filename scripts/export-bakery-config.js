// export-bakery-config.js — อ่านค่าสินค้าและล็อตจากฐานข้อมูลที่ใช้อยู่ (อ่านอย่างเดียว ไม่แก้ฐาน)
// แล้วเขียน 2 ไฟล์:
//   database/bakery-config.json  ใช้กับ scripts/import-bakery.js เพื่อสร้างฐานใหม่ให้ได้ค่าเดิม
//   docs/product-params.md       ตารางค่าที่ใช้คำนวณ สำหรับรายงาน
// ใช้:  node scripts/export-bakery-config.js      (ต้องมี .env ที่เชื่อม SQL Server ได้)
const fs = require('fs');
const path = require('path');
const { SIM_TODAY } = require('../config');

const root = path.resolve(__dirname, '..');
const money = v => Number(v).toFixed(2);

(async () => {
  const { poolPromise } = require('../db');
  const pool = await poolPromise;
  const products = (await pool.request().query(`
    SELECT sku, name, unit, CAST(cost AS float) AS cost, CAST(price AS float) AS price,
           CAST(order_cost AS float) AS order_cost, lead_time_days, shelf_life_days
    FROM products ORDER BY id`)).recordset;
  const lots = (await pool.request().query(`
    SELECT p.sku, l.qty_received, l.qty_remaining,
           CONVERT(varchar(10), l.received_date, 23) AS received_date,
           CONVERT(varchar(10), l.expiry_date, 23) AS expiry_date
    FROM inventory_lots l JOIN products p ON p.id = l.product_id
    ORDER BY l.id`)).recordset;
  const sales = (await pool.request().query(`
    SELECT COUNT(*) AS rows, CONVERT(varchar(10), MIN(sold_at), 23) AS first_day,
           CONVERT(varchar(10), MAX(sold_at), 23) AS last_day
    FROM sales_transactions`)).recordset[0];

  const config = {
    note: 'ค่าสินค้าและล็อตที่ export จากฐาน StockWise; ยอดขายนำเข้าจาก Bakery sales.csv แยกต่างหาก',
    exported_at: new Date().toISOString().slice(0, 10),
    sim_today: SIM_TODAY,
    sales_in_database: sales,
    products,
    lots
  };
  fs.writeFileSync(path.join(root, 'database', 'bakery-config.json'), JSON.stringify(config, null, 2) + '\n');

  const lotCount = sku => lots.filter(l => l.sku === sku).length;
  const md = [
    '# ค่าสินค้าที่ใช้คำนวณ (export จากฐานข้อมูล)',
    '',
    `Export เมื่อ ${config.exported_at} · วันวางแผน ${SIM_TODAY} · ยอดขายในฐาน ${sales.rows.toLocaleString('en-US')} รายการ (${sales.first_day} ถึง ${sales.last_day})`,
    '',
    'ยอดขายมาจาก Bakery sales.csv ส่วนต้นทุน ค่าสั่งซื้อ อายุสินค้า Lead Time และล็อต **ไม่มีในไฟล์ CSV** เป็นค่าที่กลุ่มกำหนด ราคาขายในตารางนี้คือค่าในตาราง products ส่วนรายได้ในแอปคิดจาก unit_price ของแต่ละรายการขาย',
    '',
    '| SKU | สินค้า | ต้นทุน (€) | ราคาขาย (€) | ค่าสั่งซื้อ/ครั้ง (€) | Lead Time (วัน) | อายุสินค้า (วัน) | จำนวนล็อต |',
    '|---|---|---:|---:|---:|---:|---:|---:|',
    ...products.map(p => `| ${p.sku} | ${p.name} | ${money(p.cost)} | ${money(p.price)} | ${money(p.order_cost)} | ${p.lead_time_days} | ${p.shelf_life_days} | ${lotCount(p.sku)} |`),
    '',
    '## ล็อตในสต็อก',
    '',
    '| SKU | รับเข้า | คงเหลือ | วันรับ | วันหมดอายุ |',
    '|---|---:|---:|---|---|',
    ...lots.map(l => `| ${l.sku} | ${l.qty_received} | ${l.qty_remaining} | ${l.received_date} | ${l.expiry_date} |`),
    '',
    'สร้างไฟล์นี้ใหม่ด้วย `node scripts/export-bakery-config.js`',
    ''
  ].join('\n');
  fs.writeFileSync(path.join(root, 'docs', 'product-params.md'), md);

  console.log(`export แล้ว: สินค้า ${products.length} รายการ · ล็อต ${lots.length} ล็อต · ยอดขายในฐาน ${sales.rows} รายการ`);
  console.log('เขียนไฟล์ database/bakery-config.json และ docs/product-params.md');
  process.exit(0);
})().catch(err => { console.error('export ไม่สำเร็จ:', err.message); process.exit(1); });
