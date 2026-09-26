// API ล็อตสินค้า: ดู, เพิ่ม, แก้, ลบ
const express = require('express');
const { sql, poolPromise } = require('../db');
const { SIM_TODAY } = require('../config');
const { HttpError, num, dateStr, handle } = require('./util');

const router = express.Router();

// ตรวจและรวมค่าของล็อตจาก request body
function parseLot(b) {
  const received = num(b.qty_received, 'จำนวนที่รับเข้า', { int: true, min: 1, max: 1e7 });
  const remaining = b.qty_remaining === undefined || b.qty_remaining === ''
    ? received : num(b.qty_remaining, 'จำนวนคงเหลือ', { int: true, min: 0, max: 1e7 });
  if (remaining > received) throw new HttpError(400, 'จำนวนคงเหลือต้องไม่เกินจำนวนที่รับเข้า');
  const receivedDate = dateStr(b.received_date, 'วันที่รับเข้า');
  const expiryDate = dateStr(b.expiry_date, 'วันหมดอายุ');
  if (expiryDate < receivedDate) throw new HttpError(400, 'วันหมดอายุต้องไม่ก่อนวันที่รับเข้า');
  return { received, remaining, receivedDate, expiryDate };
}

// ดึงล็อตพร้อมจำนวนวันก่อนหมดอายุ
router.get('/lots', handle(async (req, res) => {
  const pool = await poolPromise;
  const r = await pool.request()
    .input('today', sql.Date, SIM_TODAY)
    .query(`
      SELECT l.id, p.name, l.qty_remaining,
             CONVERT(varchar(10), l.expiry_date, 23) AS expiry_date,
             DATEDIFF(DAY, @today, l.expiry_date) AS days_left
      FROM inventory_lots l JOIN products p ON p.id = l.product_id
      ORDER BY l.expiry_date`);
  res.json(r.recordset);
}));

// เพิ่มล็อตใหม่
router.post('/lots', handle(async (req, res) => {
  const b = req.body || {};
  const productId = num(b.product_id, 'สินค้า', { int: true, min: 1 });
  const v = parseLot(b);
  const pool = await poolPromise;
  const r = await pool.request()
    .input('pid', sql.Int, productId)
    .input('received', sql.Int, v.received)
    .input('remaining', sql.Int, v.remaining)
    .input('rdate', sql.Date, v.receivedDate)
    .input('edate', sql.Date, v.expiryDate)
    .query(`INSERT INTO inventory_lots (product_id, qty_received, qty_remaining, received_date, expiry_date)
            OUTPUT INSERTED.id
            VALUES (@pid, @received, @remaining, @rdate, @edate)`);
  res.status(201).json({ ok: true, id: r.recordset[0].id });
}));

// แก้ล็อต
router.put('/lots/:id', handle(async (req, res) => {
  const id = num(req.params.id, 'รหัสล็อต', { int: true, min: 1 });
  const v = parseLot(req.body || {});
  const pool = await poolPromise;
  const r = await pool.request()
    .input('id', sql.Int, id)
    .input('received', sql.Int, v.received)
    .input('remaining', sql.Int, v.remaining)
    .input('rdate', sql.Date, v.receivedDate)
    .input('edate', sql.Date, v.expiryDate)
    .query(`UPDATE inventory_lots SET qty_received = @received, qty_remaining = @remaining,
                   received_date = @rdate, expiry_date = @edate WHERE id = @id`);
  if (!r.rowsAffected[0]) throw new HttpError(404, 'ไม่พบล็อต');
  res.json({ ok: true });
}));

// ลบล็อต (ถ้ามีโปรโมชั่น/รายการขายอ้างอิงอยู่ ฐานข้อมูลจะไม่ยอมให้ลบ → ตอบ 409)
router.delete('/lots/:id', handle(async (req, res) => {
  const pool = await poolPromise;
  const r = await pool.request()
    .input('id', sql.Int, num(req.params.id, 'รหัสล็อต', { int: true, min: 1 }))
    .query('DELETE FROM inventory_lots WHERE id = @id');
  if (!r.rowsAffected[0]) throw new HttpError(404, 'ไม่พบล็อต');
  res.json({ ok: true });
}));

module.exports = router;
