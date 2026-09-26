// API สินค้า: ดูรายการ, แก้ราคาทุน, แก้ข้อมูลสินค้า
const express = require('express');
const { sql, poolPromise } = require('../db');
const { HttpError, num, handle } = require('./util');

const router = express.Router();

// ดึงสินค้าพร้อมสต็อกคงเหลือ
router.get('/products', handle(async (req, res) => {
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
}));

// แก้ราคาทุนของสินค้า
router.put('/products/:id/cost', handle(async (req, res) => {
  const pool = await poolPromise;
  const r = await pool.request()
    .input('id', sql.Int, num(req.params.id, 'รหัสสินค้า', { int: true, min: 1 }))
    .input('cost', sql.Decimal(10, 2), num(req.body.cost, 'ราคาทุน', { min: 0.01, max: 99999999 }))
    .query('UPDATE products SET cost = @cost WHERE id = @id');
  if (!r.rowsAffected[0]) throw new HttpError(404, 'ไม่พบสินค้า');
  res.json({ ok: true });
}));

// แก้ข้อมูลสินค้า: ราคาทุน ราคาขาย ค่าสั่งซื้อต่อครั้ง Lead Time อายุสินค้า
router.put('/products/:id', handle(async (req, res) => {
  const b = req.body || {};
  const id = num(req.params.id, 'รหัสสินค้า', { int: true, min: 1 });
  const cost = num(b.cost, 'ราคาทุน', { min: 0.01, max: 99999999 });
  const price = num(b.price, 'ราคาขาย', { min: 0.01, max: 99999999 });
  const orderCost = num(b.order_cost, 'ค่าสั่งซื้อต่อครั้ง', { min: 0.01, max: 99999999 });
  const lead = num(b.lead_time_days, 'Lead Time', { int: true, min: 1, max: 365 });
  const shelf = num(b.shelf_life_days, 'อายุสินค้า', { int: true, min: 1, max: 3650 });
  const pool = await poolPromise;
  const r = await pool.request()
    .input('id', sql.Int, id)
    .input('cost', sql.Decimal(10, 2), cost)
    .input('price', sql.Decimal(10, 2), price)
    .input('order_cost', sql.Decimal(10, 2), orderCost)
    .input('lead', sql.Int, lead)
    .input('shelf', sql.Int, shelf)
    .query(`UPDATE products SET cost = @cost, price = @price, order_cost = @order_cost,
                   lead_time_days = @lead, shelf_life_days = @shelf WHERE id = @id`);
  if (!r.rowsAffected[0]) throw new HttpError(404, 'ไม่พบสินค้า');
  res.json({ ok: true });
}));

module.exports = router;
