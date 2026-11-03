// ค่าคงที่ของระบบ StockWise
module.exports = {
  SIM_TODAY: process.env.SIM_TODAY || '2022-10-01', // ชุดเบเกอรี่สิ้นสุด 2022-09-30; .env มีสิทธิ์แทนค่า
  HIST_DAYS: 56            // จำนวนวันของยอดขายย้อนหลัง
};
