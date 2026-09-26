require('dotenv').config();
const express = require('express');
const { sql, poolPromise } = require('./db');

const app = express();
app.use(express.json());
app.use(express.static('public'));   // เปิดไฟล์ในโฟลเดอร์ public เป็นหน้าเว็บ

// ดึงสินค้าพร้อมสต็อกคงเหลือ
app.get('/api/products', async (req, res) => {
  try {
    const pool = await poolPromise;
    const r = await pool.request().query(`
      SELECT p.id, p.sku, p.name, p.unit, p.cost, p.price,
             p.order_cost, p.lead_time_days, p.shelf_life_days,
             ISNULL(SUM(l.qty_remaining), 0) AS stock
      FROM products p
      LEFT JOIN inventory_lots l ON l.product_id = p.id
      GROUP BY p.id, p.sku, p.name, p.unit, p.cost, p.price,
               p.order_cost, p.lead_time_days, p.shelf_life_days
      ORDER BY p.id`);
    res.json(r.recordset);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ดึงล็อตพร้อมจำนวนวันก่อนหมดอายุ
app.get('/api/lots', async (req, res) => {
  try {
    const pool = await poolPromise;
    const r = await pool.request()
      .input('today', sql.Date, '2026-09-26')
      .query(`
        SELECT l.id, p.name, l.qty_remaining,
               l.expiry_date, DATEDIFF(DAY, @today, l.expiry_date) AS days_left
        FROM inventory_lots l JOIN products p ON p.id = l.product_id
        ORDER BY l.expiry_date`);
    res.json(r.recordset);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ยอดขายรายวันของสินค้า (ใช้พยากรณ์)
app.get('/api/daily-sales/:productId', async (req, res) => {
  try {
    const pool = await poolPromise;
    const r = await pool.request()
      .input('pid', sql.Int, Number(req.params.productId))
      .query('SELECT sale_date, qty FROM daily_sales WHERE product_id = @pid ORDER BY sale_date');
    res.json(r.recordset);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// แก้ราคาทุนของสินค้า
app.put('/api/products/:id/cost', async (req, res) => {
  try {
    const pool = await poolPromise;
    await pool.request()
      .input('id', sql.Int, Number(req.params.id))
      .input('cost', sql.Decimal(10, 2), Number(req.body.cost))
      .query('UPDATE products SET cost = @cost WHERE id = @id');
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(process.env.PORT, () =>
  console.log(`เปิดเว็บที่ http://localhost:${process.env.PORT}`));