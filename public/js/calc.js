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

if (typeof module !== 'undefined') module.exports = Calc;
