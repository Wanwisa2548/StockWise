// calc.js — สูตรคำนวณทั้งหมดของ StockWise (ไม่แตะ DOM จึงทดสอบด้วย Node ได้)
const Calc = {};

/* ============================================================
 * 1) พยากรณ์ยอดขาย
 * ============================================================ */

// วัดความคลาดเคลื่อนของการพยากรณ์ (backtest แบบ one-step-ahead)
// rows = [{ a: ยอดจริง, f: ค่าที่พยากรณ์ไว้ล่วงหน้า 1 วัน }]
Calc.errorMetrics = function (rows) {
  const n = rows.length;
  if (!n) return { mae: null, mape: null, rmse: null, samples: 0, mapeSamples: 0 };
  // MAE  = ค่าเฉลี่ยของ |จริง − พยากรณ์|
  const mae = rows.reduce((s, r) => s + Math.abs(r.a - r.f), 0) / n;
  // MAPE = ค่าเฉลี่ยของ |จริง − พยากรณ์| ÷ จริง (ข้ามวันที่ยอดจริงเป็น 0 เพราะหารไม่ได้)
  const nz = rows.filter(r => r.a > 0);
  const mape = nz.length ? nz.reduce((s, r) => s + Math.abs(r.a - r.f) / r.a, 0) / nz.length * 100 : null;
  // RMSE = รากที่สองของค่าเฉลี่ย (จริง − พยากรณ์)²  → ใช้เป็น σ ในการคำนวณ Safety Stock
  const rmse = Math.sqrt(rows.reduce((s, r) => s + (r.a - r.f) ** 2, 0) / n);
  return { mae, mape, rmse, samples: n, mapeSamples: nz.length };
};

// พยากรณ์ด้วย Moving Average / Exponential Smoothing
//   series = ยอดขายรายวัน (เก่า → ใหม่), method = 'ma' | 'es'
//   param  = n (จำนวนวันเฉลี่ย) สำหรับ MA หรือ α สำหรับ ES
// คืนค่า { d, fitted, metrics, future }
//   d      = ค่าพยากรณ์ยอดขายต่อวัน (ใช้ต่อในแผนสั่งซื้อ)
//   fitted = ค่าพยากรณ์ย้อนหลังแต่ละวัน (null = ยังไม่มีข้อมูลพอ)
//   future = พยากรณ์ 14 วันข้างหน้า
Calc.forecast = function (series, method, param) {
  if (!Array.isArray(series) || !series.length || series.some(v => !Number.isFinite(v) || v < 0)) throw new RangeError('ยอดขายต้องเป็นจำนวนไม่ติดลบและมีอย่างน้อย 1 วัน');
  if (!['ma', 'es', 'naive', 'seasonal'].includes(method)) throw new RangeError('Unsupported forecast method');
  if (method === 'ma' && (!Number.isInteger(param) || param < 1)) throw new RangeError('Invalid moving average window');
  if (method === 'es' && !(param > 0 && param <= 1)) throw new RangeError('Invalid smoothing alpha');
  const fitted = new Array(series.length).fill(null);
  let d;
  if (method === 'naive' || method === 'seasonal') {
    const lag = method === 'seasonal' ? 7 : 1;
    for (let t = lag; t < series.length; t++) fitted[t] = series[t - lag];
    d = series[Math.max(0, series.length - lag)];
  } else if (method === 'es') {
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
    const recent = series.slice(-n);
    d = recent.reduce((a, b) => a + b, 0) / recent.length;
  }
  const rows = [];
  series.forEach((a, t) => { if (fitted[t] !== null) rows.push({ a, f: fitted[t] }); });
  const future = Array.from({ length: 14 }, (_, i) => method === 'seasonal' && series.length >= 7 ? series[series.length - 7 + i % 7] : d);
  return { d, method, param, fitted, metrics: Calc.errorMetrics(rows), residuals: rows.map(r => r.a - r.f), future };
};

Calc.modelLabel = (method, param) => ({ ma: `MA(${param})`, es: `ES(α=${param})`, naive: 'Naïve (ยอดเมื่อวาน)', seasonal: 'Seasonal naïve (รอบ 7 วัน)' })[method] || method;

// All candidates share the same validation/test dates. The holdout never selects the winner.
Calc.compareModels = function (series) {
  const block = Math.min(14, Math.floor((series.length - 28) / 2));
  if (block < 7) return { available: false, reason: 'ต้องมีข้อมูลอย่างน้อย 42 วัน (ฝึก 28 วัน + validation 7 + test 7)' };
  const testStart = series.length - block, validationStart = testStart - block;
  const candidates = [
    { method: 'naive', param: 1 }, { method: 'seasonal', param: 7 },
    ...[7, 14, 28].map(param => ({ method: 'ma', param })),
    ...[.15, .30, .50, .80].map(param => ({ method: 'es', param }))
  ];
  const rows = candidates.map(candidate => {
    const fc = Calc.forecast(series, candidate.method, candidate.param);
    const score = (start, end) => Calc.errorMetrics(series.slice(start, end).map((a, i) => ({ a, f: fc.fitted[start + i] })));
    return { ...candidate, id: `${candidate.method}-${candidate.param}`, label: Calc.modelLabel(candidate.method, candidate.param),
      validation: score(validationStart, testStart), test: score(testStart, series.length) };
  });
  const selected = rows.slice().sort((a, b) => a.validation.rmse - b.validation.rmse || a.validation.mae - b.validation.mae)[0];
  return { available: true, validationStart, testStart, block, rows, selected };
};

// Overrides are explicit user choices per product; all downstream screens use the same model.
Calc.forecastFor = function (series, settings, productId) {
  const choice = settings.modelChoices?.[productId];
  return Calc.forecast(series, choice?.method || settings.method, choice?.param ?? (settings.method === 'es' ? settings.alpha : settings.n));
};

// Two-sided normal quantiles for prediction intervals, separate from one-sided ROP service levels.
Calc.PREDICTION_Z = { 0.90: 1.6448536269514722, 0.95: 1.959963984540054, 0.99: 2.5758293035489004 };

// Approximate NEXT-DAY prediction interval: forecast +/- z * one-step backtest RMSE.
// Coverage is evaluated chronologically using only errors preceding each tested day.
Calc.forecastConfidence = function (series, fc, level = 0.95) {
  const z = Calc.PREDICTION_Z[level];
  if (!z) throw new RangeError('Unsupported prediction interval level');
  const samples = fc.fitted.filter(v => v !== null && Number.isFinite(v)).length;
  const available = samples >= 2 && Number.isFinite(fc.d) && Number.isFinite(fc.metrics.rmse);
  const radius = available ? z * fc.metrics.rmse : null;
  let squaredErrors = 0, previousErrors = 0, hits = 0;
  const checks = [];
  series.forEach((actual, index) => {
    const predicted = fc.fitted[index];
    if (predicted === null || !Number.isFinite(predicted) || !Number.isFinite(actual)) return;
    if (previousErrors >= 14) {
      const priorRmse = Math.sqrt(squaredErrors / previousErrors);
      const margin = z * priorRmse;
      const lo = Math.max(0, predicted - margin), hi = Math.max(0, predicted + margin);
      const covered = actual >= lo && actual <= hi;
      if (covered) hits++;
      checks.push({ index, predicted, priorSamples: previousErrors, priorSquaredErrors: squaredErrors, priorRmse, margin, lo, hi, actual, covered });
    }
    squaredErrors += (actual - predicted) ** 2;
    previousErrors++;
  });
  return {
    level, z, available, samples, rmse: fc.metrics.rmse,
    lo: available ? Math.max(0, fc.d - radius) : null,
    hi: available ? Math.max(0, fc.d + radius) : null,
    backtest: { hits, tested: checks.length, coverage: checks.length ? hits / checks.length : null, checks }
  };
};

// Forecast the combined daily demand directly, preserving correlations between products.
Calc.totalForecast = function (data, settings) {
  const series = data.dates.map((_, index) => data.products.reduce((sum, product) => sum + data.dailySales[product.id][index], 0));
  const forecasts = Object.values(Calc.forecastAll(data, settings));
  const fitted = series.map((_, index) => forecasts.every(fc => fc.fitted[index] !== null) ? forecasts.reduce((sum, fc) => sum + fc.fitted[index], 0) : null);
  const rows = series.flatMap((a, i) => fitted[i] === null ? [] : [{ a, f: fitted[i] }]);
  const forecast = { d: forecasts.reduce((sum, fc) => sum + fc.d, 0), fitted, metrics: Calc.errorMetrics(rows), future: Array.from({ length: 14 }, (_, i) => forecasts.reduce((sum, fc) => sum + fc.future[i], 0)) };
  return { series, forecast, confidence: Calc.forecastConfidence(series, forecast, settings.confidenceLevel || 0.95) };
};

// พยากรณ์ของสินค้าทุกชิ้นด้วยค่าที่ผู้ใช้ตั้ง (ใช้ในหลายหน้า)
Calc.forecastAll = function (data, settings) {
  const out = {};
  data.products.forEach(p => { out[p.id] = Calc.forecastFor(data.dailySales[p.id], settings, p.id); });
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
  data.lots.forEach(l => {
    const usable = l.expiry_date ? (!data.today || l.expiry_date > data.today) : !(l.days_left <= 0);
    if (usable && (!l.received_date || !data.today || l.received_date <= data.today)) out[l.product_id] = (out[l.product_id] || 0) + l.qty_remaining;
  });
  return out;
};

// Project existing lots with constant forecast demand and FEFO. Expiry is exclusive.
// During the new lot's selling window, earlier/equal-expiry lots consume demand first.
Calc.orderWindow = function (inventory, d, rop, lead, life, trace = false) {
  let lots = inventory.map(l => ({ ...l }));
  const rows = [];
  let day = 0, days = null, arrival = null, arrivalStock = 0, competingSales = 0;
  const total = () => lots.filter(l => l.arrivesIn <= day).reduce((sum, l) => sum + l.qty, 0);
  // Bound review horizon to 10 years; never silently guess beyond it.
  while (day <= 3650 + lead + life) {
    const expired = lots.filter(l => l.expiresIn <= day).reduce((sum, l) => sum + l.qty, 0);
    lots = lots.filter(l => l.expiresIn > day && l.qty > 0);
    const opening = total();
    if (days === null && opening <= rop) { days = day; arrival = day + lead; }
    if (days === null && day >= 3650) return { available: false, rows };
    if (arrival !== null && day >= arrival + life) break;
    if (day === arrival) arrivalStock = opening;
    let remaining = d;
    lots.sort((a, b) => a.expiresIn - b.expiresIn);
    lots.forEach(l => {
      if (l.arrivesIn > day || (arrival !== null && day >= arrival && l.expiresIn > arrival + life)) return;
      const sold = Math.min(remaining, l.qty); l.qty -= sold; remaining -= sold;
    });
    if (arrival !== null && day >= arrival) competingSales += d - remaining;
    if (trace) rows.push({ day, opening, expired, soldExisting: d - remaining, availableForNew: arrival !== null && day >= arrival ? remaining : null, closingExisting: total() });
    day++;
  }
  const shelfDemand = d * life;
  const rawCap = Math.max(0, shelfDemand - competingSales);
  // Correct floating-point cancellation near an exact whole unit, not a business round-up.
  const cap = Math.round(rawCap) > 0 && Math.abs(rawCap - Math.round(rawCap)) < 1e-9 ? Math.round(rawCap) : rawCap;
  return { available: true, days, arrivalOffset: arrival, arrivalStock, competingSales, shelfDemand, cap, rows };
};

// Shared entry point for UI/worked calculations: actual lots and confirmed pending orders.
Calc.planFor = function (data, product, fc, settings, trace = false) {
  const offset = date => Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(data.today + 'T00:00:00Z')) / 86400000);
  const inventory = data.lots.filter(l => l.product_id === product.id && l.qty_remaining > 0 && l.expiry_date > data.today && (!l.received_date || l.received_date <= data.today))
    .map(l => ({ qty: l.qty_remaining, arrivesIn: 0, expiresIn: offset(l.expiry_date) }));
  const orders = (data.orders || []).filter(o => o.product_id === product.id && o.status === 'ordered');
  orders.filter(o => o.expected_date >= data.today).forEach(o => {
    const arrivesIn = offset(o.expected_date);
    inventory.push({ qty: o.qty, arrivesIn, expiresIn: arrivesIn + product.shelf_life_days });
  });
  return Calc.plan(product, fc, Calc.stockByProduct(data)[product.id], { ...settings, today: data.today, inventory, pending: orders.length > 0, trace });
};

// คำนวณแผนสั่งซื้อของสินค้า 1 ชนิด
//   fc = ผลจาก Calc.forecast (ใช้ d และ σ = RMSE)
//   opts = { serviceLevel, holdRate, today }
Calc.plan = function (p, fc, stock, opts) {
  const d = fc.d;                                   // ยอดขายต่อวันที่พยากรณ์
  const valid = Number.isFinite(d) && d >= 0 && Number.isFinite(stock) && stock >= 0
    && Number.isFinite(p.cost) && p.cost > 0 && Number.isFinite(p.order_cost) && p.order_cost > 0
    && Number.isFinite(opts.holdRate) && opts.holdRate > 0 && opts.holdRate <= 1 && Calc.Z[opts.serviceLevel]
    && Number.isInteger(p.lead_time_days) && p.lead_time_days >= 1 && p.lead_time_days <= 365
    && Number.isInteger(p.shelf_life_days) && p.shelf_life_days >= 1 && p.shelf_life_days <= 3650;
  if (!valid) return { d, stock, D: null, H: null, eoq: null, cap: 0, integerCap: 0, roundedEOQ: 0, qty: 0, limited: false,
    sigma: null, z: null, safety: null, rop: null, days: 999, orderDate: null, arrivalDate: null, status: 'orange',
    window: { available: false, rows: [], shelfDemand: null, arrivalStock: null, competingSales: null },
    reason: 'invalid_inputs', review: true, canOrder: false, dueToday: false, riskAvailable: false, projectionMode: opts.inventory ? 'lots' : 'aggregate' };
  const riskAvailable = Number.isFinite(fc.metrics.rmse) && fc.metrics.rmse >= 0 && (fc.metrics.samples === undefined || fc.metrics.samples >= 2);
  const sigma = riskAvailable ? fc.metrics.rmse : null;
  const z = Calc.Z[opts.serviceLevel];
  const D = d * 365;                                // ความต้องการต่อปี
  const H = p.cost * opts.holdRate;                 // ต้นทุนเก็บรักษาต่อชิ้นต่อปี
  const eoq = Math.sqrt(2 * D * p.order_cost / H);  // EOQ = √(2DS ÷ H)

  const safety = riskAvailable ? z * sigma * Math.sqrt(p.lead_time_days) : null;
  const rop = riskAvailable ? d * p.lead_time_days + safety : null;
  let window = { available: true, days: 999, arrivalOffset: null, arrivalStock: stock, competingSales: 0, shelfDemand: 0, cap: 0, rows: [] };
  if (d > 0 && opts.inventory) {
    window = Calc.orderWindow(opts.inventory, d, opts.pending || !riskAvailable ? Infinity : rop, p.lead_time_days, p.shelf_life_days, opts.trace);
  } else if (d > 0) {
    // Aggregate fallback has no expiry evidence: conservatively reserve residual stock.
    const days = riskAvailable ? Math.max(0, Math.ceil((stock - rop) / d)) : 0;
    const arrivalOffset = days + p.lead_time_days;
    const arrivalStock = Math.max(0, stock - d * arrivalOffset);
    const shelfDemand = d * p.shelf_life_days;
    window = { available: true, days, arrivalOffset, arrivalStock, shelfDemand, competingSales: Math.min(shelfDemand, arrivalStock), cap: Math.max(0, shelfDemand - arrivalStock), rows: [] };
  }
  const { cap = 0, days = 999 } = window;
  const roundedEOQ = Math.max(0, Math.round(eoq));
  const integerCap = Math.max(0, Math.floor(cap));
  const qty = Math.min(roundedEOQ, integerCap);
  const limited = qty < roundedEOQ;
  const reason = opts.pending ? 'pending' : d <= 0 ? 'no_demand' : !riskAvailable ? 'insufficient_errors' : !window.available ? 'projection_horizon'
    : cap <= 0 ? 'stock_covers_window' : integerCap < 1 ? 'below_unit_cap' : roundedEOQ < 1 ? 'below_unit_eoq' : 'ready';
  const review = ['below_unit_cap', 'below_unit_eoq', 'insufficient_errors', 'projection_horizon'].includes(reason);
  const canOrder = reason === 'ready' && qty > 0 && days === 0;
  const dueToday = canOrder;
  const status = review || reason === 'stock_covers_window' ? 'orange' : dueToday ? 'red' : days <= 3 && reason === 'ready' ? 'orange' : 'green';
  const orderDate = opts.today && d > 0 && window.available ? Calc.addDays(opts.today, days) : null;
  const arrivalDate = opts.today && window.arrivalOffset !== null && window.available ? Calc.addDays(opts.today, window.arrivalOffset) : null;
  return { d, sigma, z, D, H, eoq, cap, integerCap, roundedEOQ, limited, qty, safety, rop, stock, days, status, orderDate, arrivalDate,
    window, riskAvailable, reason, review, canOrder, dueToday, projectionMode: opts.inventory ? 'lots' : 'aggregate' };
};

Calc.orderLabel = function (plan) {
  const reasons = { pending: 'รอรับสินค้า', no_demand: 'ไม่มีความต้องการที่พยากรณ์', insufficient_errors: 'ข้อมูลคลาดเคลื่อนยังไม่พอ', projection_horizon: 'ควรทบทวนระยะวางแผน',
    stock_covers_window: 'สต็อกเดิมครอบคลุมช่วงขาย', below_unit_cap: 'เพดานขายทันต่ำกว่า 1 ชิ้น', below_unit_eoq: 'EOQ ปัดได้ต่ำกว่า 1 ชิ้น', invalid_inputs: 'ตรวจข้อมูลต้นทุนหรือแผนสั่งซื้อ' };
  return reasons[plan.reason] || (plan.dueToday ? 'ควรสั่งวันนี้' : `สั่งใน ${plan.days} วัน`);
};

// Auditable calculation steps use exactly the same forecast, interval and EOQ as the dashboard.
Calc.calculationDetails = function (data, product, settings) {
  const choice = settings.modelChoices?.[product.id];
  if (choice) settings = { ...settings, method: choice.method, n: choice.param, alpha: choice.param };
  const series = data.dailySales[product.id];
  const parameter = settings.method === 'es' ? settings.alpha : settings.n;
  const forecast = Calc.forecast(series, settings.method, parameter);
  const confidence = Calc.forecastConfidence(series, forecast, settings.confidenceLevel || .95);
  const plan = Calc.planFor(data, product, forecast, settings, true);
  const rows = series.map((actual, index) => {
    const predicted = forecast.fitted[index];
    const error = predicted === null ? null : actual - predicted;
    return { index, date: data.dates[index], actual, predicted, error, squaredError: error === null ? null : error ** 2 };
  });
  const errors = rows.filter(row => row.error !== null);
  const squaredErrorSum = errors.reduce((sum, row) => sum + row.squaredError, 0);
  const recentRows = rows.slice(-settings.n);
  const smoothing = settings.method === 'es' ? rows.slice(1).map(row => ({
    ...row, previousLevel: row.predicted,
    actualPart: parameter * row.actual, previousPart: (1 - parameter) * row.predicted,
    nextLevel: parameter * row.actual + (1 - parameter) * row.predicted
  })) : [];
  return {
    product, settings: { ...settings }, source: data.source || null, today: data.today, dates: [...data.dates], forecast, confidence, plan,
    rows, errors, squaredErrorSum, meanSquaredError: errors.length ? squaredErrorSum / errors.length : null,
    recentRows, recentSum: recentRows.reduce((sum, row) => sum + row.actual, 0), smoothing,
    numerator: 2 * plan.D * product.order_cost,
    radicand: plan.H > 0 ? 2 * plan.D * product.order_cost / plan.H : null,
    margin: confidence.available ? confidence.z * confidence.rmse : null,
    rawLower: confidence.available ? forecast.d - confidence.z * confidence.rmse : null,
    rawUpper: confidence.available ? forecast.d + confidence.z * confidence.rmse : null
  };
};

// บวก/ลบวันของสตริง yyyy-mm-dd
Calc.addDays = function (s, n) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

/* ============================================================
 * 3) สินค้าใกล้หมดอายุ (FEFO + ส่วนลด + เวลาเริ่มโปร)
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

// ตรวจทุกล็อตแบบ FEFO (First Expired, First Out) ว่าขายทันก่อนหมดอายุหรือไม่
//   fcs = ผลพยากรณ์รายสินค้า (ใช้ d), คืนรายการล็อตพร้อมผลวิเคราะห์ (เรียงตามวันหมดอายุ)
//   ล็อตเรียงตามวันหมดอายุ: ล็อตก่อนหน้าจะใช้ยอดขายไปก่อน ล็อตถัดไปได้ส่วนที่เหลือ
//   ขายได้ทัน = min(จำนวนในล็อต, d × วันที่เหลือ − ที่ล็อตก่อนหน้าใช้ไป)
Calc.analyzeLots = function (data, fcs) {
  const out = [];
  data.products.forEach(p => {
    const d = fcs[p.id].d;
    const hours = Calc.hourlyTotals(data.transactions, p.id);
    const startHour = Calc.promoStartHour(hours);
    const lots = data.lots.filter(l => l.product_id === p.id && l.qty_remaining > 0 && (!l.received_date || !data.today || l.received_date <= data.today))
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
        promoPrice: expired || !atRisk || !rule.pct ? null : Math.round(p.price * (100 - rule.pct)) / 100,
        riskValue: unsold * p.cost,                 // มูลค่าเสี่ยงเสีย = ชิ้นที่ขายไม่ทัน × ราคาทุน
        startHour
      });
    });
  });
  return out.sort((a, b) => a.lot.days_left - b.lot.days_left || a.lot.id - b.lot.id);
};

/* ============================================================
 * 4) วิเคราะห์รายการขาย (Timestamp)
 * ============================================================ */

// วันในสัปดาห์ของสตริง yyyy-mm-dd (0 = อาทิตย์ … 6 = เสาร์)
Calc.dayOfWeek = function (s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

// ตารางยอดขายเฉลี่ย วัน(0–6) × ชั่วโมง(0–23) = ยอดขายรวมของวันนั้น ÷ จำนวนวันชนิดนั้นในช่วงข้อมูล
Calc.hourlyByWeekday = function (data, productId) {
  const sum = Array.from({ length: 7 }, () => new Array(24).fill(0));
  const days = new Array(7).fill(0);
  data.dates.forEach(s => { days[Calc.dayOfWeek(s)]++; });
  data.transactions.forEach(t => {
    if (productId && t.product_id !== productId) return;
    sum[Calc.dayOfWeek(t.sold_at.slice(0, 10))][Number(t.sold_at.slice(11, 13))] += t.qty;
  });
  return sum.map((row, dow) => row.map(v => days[dow] ? v / days[dow] : 0));
};

/* ============================================================
 * 5) จัดกลุ่มสินค้าด้วย K-means
 * ============================================================ */

// ตัวสุ่มแบบกำหนด seed ได้ (mulberry32) ทำให้ผลจัดกลุ่มเหมือนเดิมทุกครั้งที่รัน
Calc.rng = function (seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = (t + Math.imul(t ^ t >>> 7, 61 | t)) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
};

// ปรับค่าเป็น z-score: (x − ค่าเฉลี่ย) ÷ ส่วนเบี่ยงเบนมาตรฐานประชากร
Calc.zscore = function (v) {
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  const s = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length) || 1;
  return v.map(x => (x - m) / s);
};

// K-means 1 รอบ (เริ่มจุดศูนย์กลางด้วย k-means++) คืน { sse, assign, centers }
Calc.kmeansOnce = function (pts, k, seed) {
  const n = pts.length, rand = Calc.rng(seed);
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
  // k-means++: จุดแรกสุ่ม จุดต่อไปสุ่มโดยให้น้ำหนักตามระยะห่างกำลังสองจากศูนย์กลางที่มีอยู่
  const centers = [pts[Math.floor(rand() * n)].slice()];
  while (centers.length < k) {
    const dist = pts.map(p => Math.min(...centers.map(c => d2(p, c))));
    let u = rand() * dist.reduce((a, b) => a + b, 0), i = 0;
    while (i < n - 1 && u > dist[i]) { u -= dist[i]; i++; }
    centers.push(pts[i].slice());
  }
  const assign = new Array(n).fill(-1);
  for (let iter = 0; iter < 100; iter++) {
    let changed = false;
    pts.forEach((p, i) => {                      // จัดแต่ละจุดเข้ากลุ่มที่ใกล้ที่สุด
      let best = 0;
      centers.forEach((c, j) => { if (d2(p, c) < d2(p, centers[best])) best = j; });
      if (assign[i] !== best) { assign[i] = best; changed = true; }
    });
    if (!changed) break;
    for (let j = 0; j < k; j++) {                // ย้ายศูนย์กลางไปที่ค่าเฉลี่ยของกลุ่ม
      const m = pts.filter((_, i) => assign[i] === j);
      if (m.length) centers[j] = [m.reduce((s, q) => s + q[0], 0) / m.length, m.reduce((s, q) => s + q[1], 0) / m.length];
    }
  }
  const sse = pts.reduce((s, p, i) => s + d2(p, centers[assign[i]]), 0);   // SSE = ผลรวมระยะกำลังสองในกลุ่ม
  return { sse, assign, centers };
};

// รัน 20 รอบแล้วเลือกรอบที่ SSE ต่ำสุด
Calc.kmeans = function (pts, k) {
  let best = null;
  for (let r = 0; r < 20; r++) {
    const res = Calc.kmeansOnce(pts, k, 1000 + r);
    if (!best || res.sse < best.sse - 1e-12) best = res;
  }
  return best;
};

// ค่าเฉลี่ยเรขาคณิต
Calc.geoMean = v => Math.pow(10, v.reduce((s, x) => s + Math.log10(x), 0) / v.length);

// ตั้งชื่อกลุ่มจาก geometric mean ของอายุสินค้า (วัน) และยอดขายต่อวัน
Calc.clusterName = function (gmLife, gmSales) {
  if (gmLife <= 5) return 'ของสดอายุสั้นมาก';
  if (gmLife <= 30) return 'ของสดและแช่เย็น';
  if (gmSales >= 15) return 'ของแห้งขายเร็ว';
  return 'ขายช้า มูลค่าต่อชิ้นสูง';
};

// นโยบายการสต็อกที่แนะนำของแต่ละกลุ่ม
Calc.clusterPolicy = {
  'ของสดอายุสั้นมาก': 'สั่งบ่อย ครั้งละน้อย ตรวจอายุทุกวัน จัดโปรตั้งแต่ช่วงบ่าย',
  'ของสดและแช่เย็น': 'สั่งตาม EOQ แต่จำกัดไม่เกินที่ขายทันในอายุสินค้า ใช้ FEFO และตรวจล็อตใกล้หมดอายุทุกวัน',
  'ของแห้งขายเร็ว': 'สั่งครั้งละมากเพื่อลดค่าสั่งซื้อ ตั้ง ROP และ Safety Stock ให้แม่น ห้ามของขาด',
  'ขายช้า มูลค่าต่อชิ้นสูง': 'เก็บสต็อกน้อย สั่งตามจริง ลดเงินจมในสินค้า'
};

// จัดกลุ่มสินค้าทั้งหมดด้วย k กลุ่ม
//   ตัวแปร: log10(ยอดขายพยากรณ์ต่อวัน d) และ log10(อายุสินค้า) ปรับเป็น z-score
//   คืน { pts, sseByK (k=1..6), elbow, groups[] }
Calc.clusterProducts = function (data, fcs, k) {
  const P = data.products;
  const sales = P.map(p => fcs[p.id].d), life = P.map(p => p.shelf_life_days);
  if (!P.length) return { pts: [], sales, life, assign: [], sseByK: [], elbow: null, silhouette: null, groups: [] };
  const x = Calc.zscore(sales.map(v => Math.log10(Math.max(v, .001)))), y = Calc.zscore(life.map(v => Math.log10(Math.max(v, .001))));
  const pts = x.map((v, i) => [v, y[i]]);

  const sseByK = [];
  for (let kk = 1; kk <= Math.min(6, P.length); kk++) sseByK.push(Calc.kmeans(pts, kk).sse);
  // elbow = k ที่ผลต่างอันดับสอง (SSE[k−1] − 2·SSE[k] + SSE[k+1]) มากที่สุด
  let elbow = Math.min(2, P.length), bestDiff = -Infinity;
  for (let kk = 2; kk < sseByK.length; kk++) {
    const diff = sseByK[kk - 2] - 2 * sseByK[kk - 1] + sseByK[kk];
    if (diff > bestDiff) { bestDiff = diff; elbow = kk; }
  }

  const res = Calc.kmeans(pts, Math.max(1, Math.min(k, P.length)));
  const silhouette = Calc.silhouette(pts, res.assign);
  const groups = [];
  for (let j = 0; j < k; j++) {
    const idx = res.assign.map((a, i) => a === j ? i : -1).filter(i => i >= 0);
    if (!idx.length) continue;
    const gmSales = Calc.geoMean(idx.map(i => sales[i])), gmLife = Calc.geoMean(idx.map(i => life[i]));
    const name = Calc.clusterName(gmLife, gmSales);
    groups.push({ name, members: idx.map(i => P[i]), idx, gmSales, gmLife, policy: Calc.clusterPolicy[name] });
  }
  groups.sort((a, b) => a.gmLife - b.gmLife);     // เรียงจากอายุสั้นไปยาว
  groups.forEach((g, i) => { g.id = i; g.idx.forEach(i2 => { res.assign[i2] = i; }); });
  return { pts, sales, life, assign: res.assign, sseByK, elbow, silhouette, groups };
};

// Mean Euclidean silhouette; singletons score 0, a single group is undefined.
Calc.silhouette = function (pts, assign) {
  const labels = [...new Set(assign)];
  if (labels.length < 2 || labels.length >= pts.length) return null;
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  return pts.reduce((sum, p, i) => {
    const own = pts.filter((_, j) => i !== j && assign[j] === assign[i]);
    if (!own.length) return sum;
    const a = own.reduce((s, q) => s + distance(p, q), 0) / own.length;
    const b = Math.min(...labels.filter(label => label !== assign[i]).map(label => {
      const group = pts.filter((_, j) => assign[j] === label);
      return group.reduce((s, q) => s + distance(p, q), 0) / group.length;
    }));
    return sum + (Math.max(a, b) ? (b - a) / Math.max(a, b) : 0);
  }, 0) / pts.length;
};

// Retrospective policy experiment. Demand is observed sales, not censored/unmet demand.
// Models are selected before the holdout. At day t, only observations < t are visible.
Calc.evaluatePolicies = function (product, series, settings, options = {}) {
  const comparison = Calc.compareModels(series);
  if (!comparison.available) return comparison;
  const { testStart, selected } = comparison;
  const training = series.slice(0, testStart);
  const average = training.slice(-7).reduce((s, v) => s + v, 0) / Math.min(7, training.length);
  const interval = options.interval ?? 3;
  const fixedQty = options.fixedQty ?? Math.ceil(average * interval);
  const initialStock = options.initialStock ?? Math.ceil(average * Math.min(product.shelf_life_days, product.lead_time_days + 1));
  const shortagePenalty = options.shortagePenalty ?? Math.max(0, product.price - product.cost);
  if (!Number.isInteger(interval) || interval < 1 || interval > 30 || !Number.isInteger(fixedQty) || fixedQty < 0 || !Number.isInteger(initialStock) || initialStock < 0 || !Number.isFinite(shortagePenalty) || shortagePenalty < 0) throw new RangeError('Invalid policy assumptions');
  const run = policy => {
    let lots = initialStock ? [{ qty: initialStock, expiry: testStart + product.shelf_life_days }] : [];
    let pending = [];
    const result = { policy, initialStock, demand: 0, sold: 0, shortage: 0, waste: 0, received: 0, orders: 0, orderedUnits: 0, orderCost: 0, holdingCost: 0, rows: [] };
    for (let t = testStart; t < series.length; t++) {
      const waste = lots.filter(l => l.expiry <= t).reduce((s, l) => s + l.qty, 0);
      lots = lots.filter(l => l.expiry > t);
      const arrivals = pending.filter(o => o.arrive === t);
      arrivals.forEach(o => lots.push({ qty: o.qty, expiry: t + product.shelf_life_days }));
      pending = pending.filter(o => o.arrive > t);
      const received = arrivals.reduce((s, o) => s + o.qty, 0);
      const stock = lots.reduce((s, l) => s + l.qty, 0);
      const fc = Calc.forecast(series.slice(0, t), selected.method, selected.param);
      const inventory = [
        ...lots.map(l => ({ qty: l.qty, arrivesIn: 0, expiresIn: l.expiry - t })),
        ...pending.map(o => ({ qty: o.qty, arrivesIn: o.arrive - t, expiresIn: o.arrive + product.shelf_life_days - t }))
      ];
      const plan = Calc.plan(product, fc, stock, { ...settings, inventory, pending: pending.length > 0 });
      const qty = policy === 'fixed'
        ? ((t - testStart) % interval === 0 ? fixedQty : 0)
        : (plan.dueToday ? plan.qty : 0);
      if (qty > 0) {
        pending.push({ arrive: t + product.lead_time_days, qty });
        result.orders++; result.orderedUnits += qty; result.orderCost += product.order_cost;
      }
      let remaining = series[t];
      lots.sort((a, b) => a.expiry - b.expiry);
      lots.forEach(l => { const sold = Math.min(remaining, l.qty); remaining -= sold; l.qty -= sold; });
      const closing = lots.reduce((s, l) => s + l.qty, 0);
      const sold = series[t] - remaining;
      result.demand += series[t]; result.sold += sold; result.shortage += remaining;
      result.waste += waste; result.received += received;
      result.holdingCost += closing * product.cost * settings.holdRate / 365;
      result.rows.push({ index: t, forecast: fc.d, rop: plan.rop, opening: stock, received, ordered: qty, actual: series[t], sold, shortage: remaining, waste, closing });
    }
    result.closing = lots.reduce((s, l) => s + l.qty, 0);
    result.pipeline = pending.reduce((s, o) => s + o.qty, 0);
    result.averageStock = result.rows.reduce((s, r) => s + r.closing, 0) / result.rows.length;
    result.wasteCost = result.waste * product.cost;
    result.shortageCost = result.shortage * shortagePenalty;
    result.totalCost = result.orderCost + result.holdingCost + result.wasteCost + result.shortageCost;
    result.fillRate = result.demand > 0 ? result.sold / result.demand : null;
    return result;
  };
  return { available: true, testStart, selected, assumptions: { interval, fixedQty, initialStock, shortagePenalty }, fixed: run('fixed'), dss: run('dss') };
};

Calc.orderExplanation = function (p, fc, plan, pending) {
  const n = v => Number.isFinite(v) ? Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—';
  const timing = pending ? `มีใบสั่งรอรับ ${pending.qty} หน่วย ถึง ${pending.expected_date} จึงไม่สั่งซ้ำ` : Calc.orderLabel(plan);
  const review = plan.review ? ' · ควรทบทวนหน่วยขาย/ความถี่สั่งหรือข้อมูลก่อนเลือกจำนวนเอง ไม่ปัดขึ้นเป็น 1 ชิ้นอัตโนมัติ' : '';
  return `${timing}${review} · จุดสั่งซื้อ (ROP) ${n(plan.rop)} · สต็อกสำรอง (Safety Stock) ${n(plan.safety)} · ${Calc.modelLabel(fc.method, fc.param)} ใช้ d=${n(fc.d)} ${p.unit}/วันคงที่ในแผน · RMSE ${n(fc.metrics.rmse)} · EOQ ตามสูตร ${n(plan.eoq)} · วันรับที่ใช้คำนวณ ${plan.arrivalDate || '—'} ล็อตเดิมคาดเหลือ ${n(plan.window.arrivalStock)} · ยอดช่วงอายุ ${n(plan.window.shelfDemand)} หักยอดที่ล็อตเดิมใช้ก่อน ${n(plan.window.competingSales)} → เพดาน ${n(plan.cap)} (ปัดลง ${plan.integerCap}) · จำนวนแนะนำ min(round(EOQ), floor(เพดาน)) = ${plan.qty} ${p.unit}/ครั้ง · ${plan.projectionMode === 'lots' ? 'จำลองล็อตและใบสั่งยืนยันแบบ FEFO' : 'ไม่มีรายละเอียดล็อต สมมติสต็อกเดิมยังใช้ได้และขายก่อน'} · เป็นค่าประมาณ ไม่รับประกันขายหมด`;
};

if (typeof module !== 'undefined') module.exports = Calc;
