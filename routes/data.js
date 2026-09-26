// GET /api/data — ส่งข้อมูลทั้งหมดที่หน้าเว็บต้องใช้ในครั้งเดียว
const express = require('express');
const { sql, poolPromise } = require('../db');
const { SIM_TODAY, HIST_DAYS } = require('../config');

const router = express.Router();

// สร้างรายการวันที่ย้อนหลัง HIST_DAYS วัน (เก่า → ใหม่) เป็นสตริง yyyy-mm-dd
// ใช้ UTC ล้วนๆ เพื่อไม่ให้เขตเวลาของเครื่องทำให้วันเลื่อน
function buildDates() {
  const [y, m, d] = SIM_TODAY.split('-').map(Number);
  const out = [];
  for (let i = HIST_DAYS; i >= 1; i--) {
    out.push(new Date(Date.UTC(y, m - 1, d - i)).toISOString().slice(0, 10));
  }
  return out;
}

router.get('/data', async (req, res) => {
  try {
    const pool = await poolPromise;

    // สินค้า (ไม่รวมสต็อก — สต็อกคำนวณจากล็อตฝั่งหน้าเว็บ)
    const products = (await pool.request().query(`
      SELECT id, sku, name, unit,
             CAST(cost AS float) AS cost, CAST(price AS float) AS price,
             CAST(order_cost AS float) AS order_cost, lead_time_days, shelf_life_days
      FROM products ORDER BY id`)).recordset;

    // ยอดขายรายวัน: ใช้ view daily_sales แล้วเติม 0 ให้วันที่ไม่มียอด
    const dates = buildDates();
    const dailyRows = (await pool.request().query(`
      SELECT product_id, CONVERT(varchar(10), sale_date, 23) AS d, qty
      FROM daily_sales`)).recordset;
    const dateIdx = Object.fromEntries(dates.map((d, i) => [d, i]));
    const dailySales = {};
    products.forEach(p => { dailySales[p.id] = new Array(dates.length).fill(0); });
    dailyRows.forEach(r => {
      if (dailySales[r.product_id] && r.d in dateIdx) dailySales[r.product_id][dateIdx[r.d]] = r.qty;
    });

    // ล็อตสินค้า พร้อมจำนวนวันก่อนหมดอายุ (นับจากวันจำลอง)
    const lots = (await pool.request()
      .input('today', sql.Date, SIM_TODAY)
      .query(`
        SELECT id, product_id, qty_received, qty_remaining,
               CONVERT(varchar(10), received_date, 23) AS received_date,
               CONVERT(varchar(10), expiry_date, 23) AS expiry_date,
               DATEDIFF(DAY, @today, expiry_date) AS days_left
        FROM inventory_lots ORDER BY expiry_date, id`)).recordset;

    // รายการขายรายชิ้น (timestamp เป็นสตริงเวลาท้องถิ่น yyyy-mm-dd hh:mi:ss)
    const transactions = (await pool.request().query(`
      SELECT receipt_no, CONVERT(varchar(19), sold_at, 120) AS sold_at,
             product_id, qty, CAST(unit_price AS float) AS unit_price
      FROM sales_transactions ORDER BY sold_at, id`)).recordset;

    res.json({ today: SIM_TODAY, dates, products, dailySales, lots, transactions });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
