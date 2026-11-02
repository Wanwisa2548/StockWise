// ค่าคงที่ของระบบ StockWise
module.exports = {
  SIM_TODAY: process.env.SIM_TODAY || '2026-09-26', // ตั้งให้ตรงกับชุดข้อมูลที่ใช้งานผ่าน .env
  HIST_DAYS: 56            // จำนวนวันของยอดขายย้อนหลัง
};
