require('dotenv').config();
const express = require('express');

const app = express();
app.use(express.json());
app.use(express.static('public'));   // เปิดไฟล์ในโฟลเดอร์ public เป็นหน้าเว็บ

// API ทั้งหมดแยกตามหัวข้อไว้ในโฟลเดอร์ routes/
app.use('/api', require('./routes/data'));      // GET /api/data (ข้อมูลรวมทุกหน้า)
app.use('/api', require('./routes/products'));  // สินค้า
app.use('/api', require('./routes/lots'));      // ล็อตสินค้า
app.use('/api', require('./routes/sales'));     // ยอดขาย

app.listen(process.env.PORT, () =>
  console.log(`เปิดเว็บที่ http://localhost:${process.env.PORT}`));
