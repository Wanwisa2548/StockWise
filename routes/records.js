// API บันทึกผลลัพธ์ลงตาราง: purchase_orders, promotions, forecasts, cluster_results
const express = require('express');
const { sql, poolPromise } = require('../db');
const { SIM_TODAY } = require('../config');
const { HttpError, num, handle } = require('./util');

const router = express.Router();

// รันหลายคำสั่งใน transaction เดียว (ผิดพลาดแล้ว rollback ทั้งหมด)
async function inTransaction(fn) {
  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const result = await fn(() => new sql.Request(tx));
    await tx.commit();
    return result;
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  }
}

/* ---------------- ใบสั่งซื้อ (purchase_orders) ---------------- */

// สั่งซื้อ: วันที่สั่ง = วันจำลอง, วันที่ของถึง = วันสั่ง + Lead Time ของสินค้า
router.post('/purchase-orders', handle(async (req, res) => {
  const productId = num(req.body.product_id, 'สินค้า', { int: true, min: 1 });
  const qty = num(req.body.qty, 'จำนวนที่สั่ง', { int: true, min: 1, max: 1e7 });
  const id = await inTransaction(async req0 => {
    const dup = await req0().input('pid', sql.Int, productId)
      .query(`SELECT COUNT(*) AS n FROM purchase_orders WHERE product_id = @pid AND status = 'ordered'`);
    if (dup.recordset[0].n > 0) throw new HttpError(409, 'สินค้านี้มีใบสั่งซื้อที่รอของอยู่แล้ว');
    const r = await req0()
      .input('pid', sql.Int, productId).input('qty', sql.Int, qty).input('today', sql.Date, SIM_TODAY)
      .query(`INSERT INTO purchase_orders (product_id, order_date, qty, expected_date, status)
              OUTPUT INSERTED.id
              SELECT id, @today, @qty, DATEADD(DAY, lead_time_days, @today), 'ordered'
              FROM products WHERE id = @pid`);
    if (!r.recordset.length) throw new HttpError(404, 'ไม่พบสินค้า');
    return r.recordset[0].id;
  });
  res.status(201).json({ ok: true, id });
}));

// เปลี่ยนสถานะ: received (ของมาถึง → เพิ่มล็อตเข้าสต็อกให้อัตโนมัติ) หรือ cancelled
router.put('/purchase-orders/:id/status', handle(async (req, res) => {
  const id = num(req.params.id, 'รหัสใบสั่งซื้อ', { int: true, min: 1 });
  const status = req.body.status;
  if (status !== 'received' && status !== 'cancelled') throw new HttpError(400, 'สถานะต้องเป็น received หรือ cancelled');
  await inTransaction(async req0 => {
    const u = await req0().input('id', sql.Int, id).input('st', sql.VarChar(10), status)
      .query(`UPDATE purchase_orders SET status = @st WHERE id = @id AND status = 'ordered'`);
    if (!u.rowsAffected[0]) throw new HttpError(409, 'ไม่พบใบสั่งซื้อที่รอของ (อาจถูกเปลี่ยนสถานะไปแล้ว)');
    if (status === 'received') {
      // ล็อตใหม่: รับเข้าวันจำลอง หมดอายุ = วันรับ + อายุสินค้า
      await req0().input('id', sql.Int, id).input('today', sql.Date, SIM_TODAY)
        .query(`INSERT INTO inventory_lots (product_id, qty_received, qty_remaining, received_date, expiry_date)
                SELECT po.product_id, po.qty, po.qty, @today, DATEADD(DAY, p.shelf_life_days, @today)
                FROM purchase_orders po JOIN products p ON p.id = po.product_id WHERE po.id = @id`);
    }
  });
  res.json({ ok: true });
}));

// ลบใบสั่งซื้อที่ยกเลิกแล้ว (ใบที่รับของแล้วลบไม่ได้ เพราะสต็อกอ้างอิงอยู่)
router.delete('/purchase-orders/:id', handle(async (req, res) => {
  const pool = await poolPromise;
  const r = await pool.request().input('id', sql.Int, num(req.params.id, 'รหัสใบสั่งซื้อ', { int: true, min: 1 }))
    .query(`DELETE FROM purchase_orders WHERE id = @id AND status = 'cancelled'`);
  if (!r.rowsAffected[0]) throw new HttpError(409, 'ลบได้เฉพาะใบสั่งซื้อที่ยกเลิกแล้ว');
  res.json({ ok: true });
}));

/* ---------------- โปรโมชั่น (promotions) ---------------- */

// ตั้งโปร: เริ่ม = วันจำลอง + ชั่วโมงที่เลือก, สิ้นสุด = 00:00 ของวันหมดอายุล็อต
router.post('/promotions', handle(async (req, res) => {
  const lotId = num(req.body.lot_id, 'ล็อต', { int: true, min: 1 });
  const pct = num(req.body.discount_pct, 'ส่วนลด (%)', { int: true, min: 1, max: 90 });
  const price = num(req.body.promo_price, 'ราคาโปร', { min: 0.01, max: 99999999 });
  const hour = num(req.body.start_hour, 'ชั่วโมงเริ่มโปร', { int: true, min: 0, max: 23 });
  const startText = `${SIM_TODAY} ${String(hour).padStart(2, '0')}:00:00`;
  const id = await inTransaction(async req0 => {
    const lot = await req0().input('id', sql.Int, lotId).input('today', sql.Date, SIM_TODAY)
      .query('SELECT DATEDIFF(DAY, @today, expiry_date) AS days_left FROM inventory_lots WHERE id = @id');
    if (!lot.recordset.length) throw new HttpError(404, 'ไม่พบล็อต');
    if (lot.recordset[0].days_left <= 0) throw new HttpError(400, 'ล็อตนี้หมดอายุแล้ว ตั้งโปรไม่ได้');
    const dup = await req0().input('id', sql.Int, lotId).query('SELECT COUNT(*) AS n FROM promotions WHERE lot_id = @id');
    if (dup.recordset[0].n > 0) throw new HttpError(409, 'ล็อตนี้ตั้งโปรโมชั่นไว้แล้ว');
    const r = await req0()
      .input('lot', sql.Int, lotId).input('pct', sql.Int, pct).input('price', sql.Decimal(10, 2), price)
      .input('start', sql.VarChar(19), startText)
      .query(`INSERT INTO promotions (lot_id, discount_pct, promo_price, start_at, end_at)
              OUTPUT INSERTED.id
              SELECT id, @pct, @price, CONVERT(datetime2(0), @start, 120), CAST(expiry_date AS datetime2(0))
              FROM inventory_lots WHERE id = @lot`);
    return r.recordset[0].id;
  });
  res.status(201).json({ ok: true, id });
}));

router.delete('/promotions/:id', handle(async (req, res) => {
  const pool = await poolPromise;
  const r = await pool.request().input('id', sql.Int, num(req.params.id, 'รหัสโปรโมชั่น', { int: true, min: 1 }))
    .query('DELETE FROM promotions WHERE id = @id');
  if (!r.rowsAffected[0]) throw new HttpError(404, 'ไม่พบโปรโมชั่น');
  res.json({ ok: true });
}));

/* ---------------- ผลพยากรณ์ (forecasts) ---------------- */

// บันทึกผลพยากรณ์ของสินค้าทุกชิ้นตามวิธี/พารามิเตอร์ที่เลือก (บันทึกซ้ำวิธีเดิมในวันเดียวกัน = แทนที่ของเดิม)
router.post('/forecasts', handle(async (req, res) => {
  const method = req.body.method;
  if (method !== 'ma' && method !== 'es') throw new HttpError(400, 'วิธีพยากรณ์ต้องเป็น ma หรือ es');
  const param = num(req.body.param, 'พารามิเตอร์', { min: 0.01, max: 28 });
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (!items.length || items.length > 200) throw new HttpError(400, 'ไม่มีผลพยากรณ์ให้บันทึก');
  const rows = items.map(it => ({
    pid: num(it.product_id, 'สินค้า', { int: true, min: 1 }),
    d: num(it.daily_forecast, 'ค่าพยากรณ์', { min: 0, max: 1e7 }),
    mae: num(it.mae, 'MAE', { min: 0, max: 1e7 }),
    mape: num(it.mape, 'MAPE', { min: 0, max: 9999 }),
    rmse: num(it.rmse, 'RMSE', { min: 0, max: 1e7 })
  }));
  await inTransaction(async req0 => {
    await req0().input('day', sql.Date, SIM_TODAY).input('m', sql.VarChar(10), method).input('p', sql.Decimal(5, 2), param)
      .query('DELETE FROM forecasts WHERE run_date = @day AND method = @m AND param = @p');
    for (const r of rows) {
      await req0()
        .input('pid', sql.Int, r.pid).input('day', sql.Date, SIM_TODAY).input('m', sql.VarChar(10), method)
        .input('p', sql.Decimal(5, 2), param).input('d', sql.Decimal(10, 2), r.d)
        .input('mae', sql.Decimal(10, 2), r.mae).input('mape', sql.Decimal(6, 2), r.mape).input('rmse', sql.Decimal(10, 2), r.rmse)
        .query(`INSERT INTO forecasts (product_id, run_date, method, param, daily_forecast, mae, mape, rmse)
                VALUES (@pid, @day, @m, @p, @d, @mae, @mape, @rmse)`);
    }
  });
  res.status(201).json({ ok: true, saved: rows.length });
}));

/* ---------------- ผลจัดกลุ่ม (cluster_results) ---------------- */

// บันทึกผลจัดกลุ่มของ k ที่เลือก (บันทึกซ้ำ k เดิมในวันเดียวกัน = แทนที่ของเดิม)
router.post('/cluster-results', handle(async (req, res) => {
  const k = num(req.body.k, 'จำนวนกลุ่ม (k)', { int: true, min: 2, max: 5 });
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (!items.length || items.length > 200) throw new HttpError(400, 'ไม่มีผลจัดกลุ่มให้บันทึก');
  const rows = items.map(it => {
    const label = String(it.cluster_label || '').trim();
    if (!label || label.length > 50) throw new HttpError(400, 'ชื่อกลุ่มต้องยาว 1–50 ตัวอักษร');
    return { pid: num(it.product_id, 'สินค้า', { int: true, min: 1 }), label };
  });
  await inTransaction(async req0 => {
    await req0().input('day', sql.Date, SIM_TODAY).input('k', sql.Int, k)
      .query('DELETE FROM cluster_results WHERE run_date = @day AND k = @k');
    for (const r of rows) {
      await req0().input('day', sql.Date, SIM_TODAY).input('k', sql.Int, k).input('pid', sql.Int, r.pid)
        .input('label', sql.NVarChar(50), r.label)
        .query('INSERT INTO cluster_results (run_date, k, product_id, cluster_label) VALUES (@day, @k, @pid, @label)');
    }
  });
  res.status(201).json({ ok: true, saved: rows.length });
}));

module.exports = router;
