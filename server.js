require('dotenv').config();
const express = require('express');

const app = express();
app.use(express.json());
app.use(express.static('public'));   // เปิดไฟล์ในโฟลเดอร์ public เป็นหน้าเว็บ

// --demo is an explicit, read-only synthetic dataset. It never imports db.js.
if (process.argv.includes('--demo')) {
  const data = require('./demo-data')();
  app.get('/api/data', (req, res) => res.json(data));
  app.use('/api', (req, res) => res.status(403).json({ error: 'โหมด Demo ใช้ข้อมูลจำลองและไม่บันทึกฐานข้อมูล กรุณาเปิด npm start เพื่อใช้ฐานข้อมูลจริง' }));
} else {
// API ทั้งหมดแยกตามหัวข้อไว้ในโฟลเดอร์ routes/
app.use('/api', require('./routes/data'));      // GET /api/data (ข้อมูลรวมทุกหน้า)
app.use('/api', require('./routes/products'));  // สินค้า
app.use('/api', require('./routes/lots'));      // ล็อตสินค้า
app.use('/api', require('./routes/sales'));     // ยอดขาย
app.use('/api', require('./routes/records'));   // บันทึกใบสั่งซื้อ โปรโมชั่น ผลพยากรณ์ ผลจัดกลุ่ม
}

const port = process.env.PORT === undefined ? 3000 : Number(process.env.PORT);
const server = app.listen(port, () => console.log(`เปิดเว็บที่ http://localhost:${server.address().port}${process.argv.includes('--demo') ? ' (DEMO: synthetic, read-only)' : ''}`));
