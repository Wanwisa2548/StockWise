// API ยอดขาย
const express = require('express');
const { sql, poolPromise } = require('../db');
const { num, handle } = require('./util');

const router = express.Router();

// ยอดขายรายวันของสินค้า (ใช้พยากรณ์)
router.get('/daily-sales/:productId', handle(async (req, res) => {
  const pool = await poolPromise;
  const r = await pool.request()
    .input('pid', sql.Int, num(req.params.productId, 'รหัสสินค้า', { int: true, min: 1 }))
    .query('SELECT CONVERT(varchar(10), sale_date, 23) AS sale_date, qty FROM daily_sales WHERE product_id = @pid ORDER BY sale_date');
  res.json(r.recordset);
}));

module.exports = router;
