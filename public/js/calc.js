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

/* ============================================================
 * 3) สินค้าใกล้หมดอายุ (FIFO + ส่วนลด + เวลาเริ่มโปร)
 * ============================================================ */

// กฎส่วนลดตามจำนวนวันที่เหลือ → { pct, label }
Calc.discountRule = function (daysLeft) {
  if (daysLeft <= 0) return { pct: 0, label: 'นำออก' };
  if (daysLeft <= 2) return { pct: 50, label: 'ลด 50%' };
  if (daysLeft <= 4) return { pct: 30, label: 'ลด 30%' };
  if (daysLeft <= 7) return { pct: 20, label: 'ลด 20%' };
  return { pct: 0, label: 'เฝ้าระวัง' };
};

// ยอดขายรวมรายชั่วโมง (0–23) ของสินค้า (ไม่ระบุ productId = ทุกสินค้า)
Calc.hourlyTotals = function (transactions, productId) {
  const h = new Array(24).fill(0);
  transactions.forEach(t => {
    if (productId && t.product_id !== productId) return;
    h[Number(t.sold_at.slice(11, 13))] += t.qty;
  });
  return h;
};

// ชั่วโมงเริ่มโปร = ชั่วโมงสุดท้ายที่ยอดขายตั้งแต่ชั่วโมงนั้นจนปิดร้านยังเหลือ ≥ 40% ของยอดทั้งวัน
// (นับรวมชั่วโมง 22:xx เพราะร้านยังมีขายถึง 22:59)
Calc.promoStartHour = function (hours) {
  const total = hours.reduce((a, b) => a + b, 0);
  let start = null;
  for (let h = 0; h < 24; h++) {
    let rest = 0;
    for (let k = h; k < 24; k++) rest += hours[k];
    if (total > 0 && rest / total >= 0.4) start = h;
  }
  return start;
};

// ชั่วโมงที่ขายดีที่สุด
Calc.peakHour = function (hours) { return hours.indexOf(Math.max(...hours)); };

// ตรวจทุกล็อตแบบ FIFO ว่าขายทันก่อนหมดอายุหรือไม่
//   fcs = ผลพยากรณ์รายสินค้า (ใช้ d), คืนรายการล็อตพร้อมผลวิเคราะห์ (เรียงตามวันหมดอายุ)
//   ล็อตเรียงตามวันหมดอายุ: ล็อตก่อนหน้าจะใช้ยอดขายไปก่อน ล็อตถัดไปได้ส่วนที่เหลือ
//   ขายได้ทัน = min(จำนวนในล็อต, d × วันที่เหลือ − ที่ล็อตก่อนหน้าใช้ไป)
Calc.analyzeLots = function (data, fcs) {
  const out = [];
  data.products.forEach(p => {
    const d = fcs[p.id].d;
    const hours = Calc.hourlyTotals(data.transactions, p.id);
    const startHour = Calc.promoStartHour(hours);
    const lots = data.lots.filter(l => l.product_id === p.id && l.qty_remaining > 0)
      .sort((a, b) => a.expiry_date.localeCompare(b.expiry_date) || a.id - b.id);
    let used = 0;                                   // ยอดขายที่ล็อตก่อนหน้าใช้ไปแล้ว
    lots.forEach(l => {
      const expired = l.days_left <= 0;
      const capacity = expired ? 0 : Math.max(0, d * l.days_left - used);
      const soldRaw = Math.min(l.qty_remaining, capacity);
      const sellable = Math.round(soldRaw);
      const unsold = expired ? l.qty_remaining : l.qty_remaining - sellable;
      if (!expired) used += soldRaw;
      const rule = Calc.discountRule(l.days_left);
      const atRisk = unsold > 0;                    // ขายไม่ทัน → ต้องจัดโปร (หรือนำออกถ้าหมดอายุ)
      out.push({
        lot: l, product: p, d, expired, sellable, unsold, atRisk,
        action: expired ? 'นำออก' : atRisk ? rule.label : 'ขายทัน',
        discountPct: expired || !atRisk ? 0 : rule.pct,
        promoPrice: expired || !atRisk || !rule.pct ? null : Math.round(p.price * (100 - rule.pct) / 100),
        riskValue: unsold * p.cost,                 // มูลค่าเสี่ยงเสีย = ชิ้นที่ขายไม่ทัน × ราคาทุน
        startHour
      });
    });
  });
  return out.sort((a, b) => a.lot.days_left - b.lot.days_left || a.lot.id - b.lot.id);
};

if (typeof module !== 'undefined') module.exports = Calc;
