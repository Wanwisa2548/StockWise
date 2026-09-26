// calc.js — สูตรคำนวณทั้งหมดของ StockWise (ไม่แตะ DOM จึงทดสอบด้วย Node ได้)
const Calc = {};

/* ============================================================
 * 1) พยากรณ์ยอดขาย
 * ============================================================ */

// วัดความคลาดเคลื่อนของการพยากรณ์ (backtest แบบ one-step-ahead)
// rows = [{ a: ยอดจริง, f: ค่าที่พยากรณ์ไว้ล่วงหน้า 1 วัน }]
Calc.errorMetrics = function (rows) {
  const n = rows.length;
  if (!n) return { mae: 0, mape: 0, rmse: 0 };
  // MAE  = ค่าเฉลี่ยของ |จริง − พยากรณ์|
  const mae = rows.reduce((s, r) => s + Math.abs(r.a - r.f), 0) / n;
  // MAPE = ค่าเฉลี่ยของ |จริง − พยากรณ์| ÷ จริง (ข้ามวันที่ยอดจริงเป็น 0 เพราะหารไม่ได้)
  const nz = rows.filter(r => r.a > 0);
  const mape = nz.length ? nz.reduce((s, r) => s + Math.abs(r.a - r.f) / r.a, 0) / nz.length * 100 : 0;
  // RMSE = รากที่สองของค่าเฉลี่ย (จริง − พยากรณ์)²  → ใช้เป็น σ ในการคำนวณ Safety Stock
  const rmse = Math.sqrt(rows.reduce((s, r) => s + (r.a - r.f) ** 2, 0) / n);
  return { mae, mape, rmse };
};

// พยากรณ์ด้วย Moving Average / Exponential Smoothing
//   series = ยอดขายรายวัน (เก่า → ใหม่), method = 'ma' | 'es'
//   param  = n (จำนวนวันเฉลี่ย) สำหรับ MA หรือ α สำหรับ ES
// คืนค่า { d, fitted, metrics, future }
//   d      = ค่าพยากรณ์ยอดขายต่อวัน (ใช้ต่อในแผนสั่งซื้อ)
//   fitted = ค่าพยากรณ์ย้อนหลังแต่ละวัน (null = ยังไม่มีข้อมูลพอ)
//   future = พยากรณ์ 14 วันข้างหน้า
Calc.forecast = function (series, method, param) {
  const fitted = new Array(series.length).fill(null);
  let d;
  if (method === 'es') {
    const alpha = param;
    let level = series[0];                       // ค่าเริ่มต้น = ยอดวันแรก
    for (let t = 1; t < series.length; t++) {
      fitted[t] = level;                         // พยากรณ์วัน t ด้วยระดับ ณ สิ้นวัน t−1
      level = alpha * series[t] + (1 - alpha) * level;
    }
    d = level;
  } else {
    const n = param;
    for (let t = n; t < series.length; t++) {    // พยากรณ์วัน t = ค่าเฉลี่ย n วันก่อนหน้า
      let s = 0;
      for (let k = t - n; k < t; k++) s += series[k];
      fitted[t] = s / n;
    }
    d = series.slice(-n).reduce((a, b) => a + b, 0) / n;
  }
  const rows = [];
  series.forEach((a, t) => { if (fitted[t] !== null) rows.push({ a, f: fitted[t] }); });
  return { d, fitted, metrics: Calc.errorMetrics(rows), future: new Array(14).fill(d) };
};

// พยากรณ์ของสินค้าทุกชิ้นด้วยค่าที่ผู้ใช้ตั้ง (ใช้ในหลายหน้า)
Calc.forecastAll = function (data, settings) {
  const param = settings.method === 'es' ? settings.alpha : settings.n;
  const out = {};
  data.products.forEach(p => { out[p.id] = Calc.forecast(data.dailySales[p.id], settings.method, param); });
  return out;
};

/* ============================================================
 * 2) แผนการสั่งซื้อ (EOQ, Safety Stock, ROP)
 * ============================================================ */

// ค่า z ของระดับการให้บริการ (Service Level)
Calc.Z = { 0.90: 1.28, 0.95: 1.65, 0.99: 2.33 };

// สต็อกคงเหลือรวมของแต่ละสินค้า = ผลรวม qty_remaining ของทุกล็อต → { productId: จำนวน }
Calc.stockByProduct = function (data) {
  const out = {};
  data.products.forEach(p => { out[p.id] = 0; });
  data.lots.forEach(l => { out[l.product_id] = (out[l.product_id] || 0) + l.qty_remaining; });
  return out;
};

// คำนวณแผนสั่งซื้อของสินค้า 1 ชนิด
//   fc = ผลจาก Calc.forecast (ใช้ d และ σ = RMSE)
//   opts = { serviceLevel, holdRate, today }
Calc.plan = function (p, fc, stock, opts) {
  const d = fc.d;                                   // ยอดขายต่อวันที่พยากรณ์
  const sigma = fc.metrics.rmse;                    // σ = RMSE
  const z = Calc.Z[opts.serviceLevel];
  const D = d * 365;                                // ความต้องการต่อปี
  const H = p.cost * opts.holdRate;                 // ต้นทุนเก็บรักษาต่อชิ้นต่อปี
  const eoq = Math.sqrt(2 * D * p.order_cost / H);  // EOQ = √(2DS ÷ H)

  // ถ้า EOQ มากกว่าที่ขายได้ทันในอายุสินค้า ให้จำกัดที่ d × shelf_life (ปัดลง)
  const cap = d * p.shelf_life_days;
  const limited = eoq > cap;
  const qty = limited ? Math.floor(cap) : Math.round(eoq);

  const safety = z * sigma * Math.sqrt(p.lead_time_days);   // Safety Stock = z × σ × √L
  const rop = d * p.lead_time_days + safety;                // ROP = d × L + Safety Stock

  // จำนวนวันก่อนต้องสั่ง = floor((สต็อก − ROP) ÷ d)
  const days = d > 0 ? Math.floor((stock - rop) / d) : 999;
  const status = days <= 0 ? 'red' : days <= 3 ? 'orange' : 'green';
  const orderDate = opts.today ? Calc.addDays(opts.today, Math.max(days, 0)) : null;
  return { d, sigma, z, D, H, eoq, cap, limited, qty, safety, rop, stock, days, status, orderDate };
};

// บวก/ลบวันของสตริง yyyy-mm-dd
Calc.addDays = function (s, n) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

// จำลองสต็อก 30 วัน: ขายวันละ d ชิ้น พอสต็อกลงถึง ROP ก็สั่งครั้งละ qty ชิ้น ของมาถึงหลัง L วัน
// (ไม่คิดการหมดอายุ ใช้ดูจังหวะการสั่งเท่านั้น)
Calc.simulateStock = function (plan, leadTime, days = 30) {
  const level = [plan.stock];
  const orders = [];                   // { day: วันที่สั่ง, arrive: วันที่ของถึง, qty }
  let pending = null;
  for (let t = 0; t < days; t++) {
    if (!pending && level[t] <= plan.rop && plan.qty > 0) {   // ถึงจุดสั่งซื้อ
      pending = { day: t, arrive: t + leadTime, qty: plan.qty };
      orders.push(pending);
    }
    let next = Math.max(0, level[t] - plan.d);
    if (pending && pending.arrive === t + 1) { next += pending.qty; pending = null; }
    level.push(next);
  }
  return { level, orders };
};

if (typeof module !== 'undefined') module.exports = Calc;
