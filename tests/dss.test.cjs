const { test } = require('node:test');
const assert = require('node:assert/strict');
const Calc = require('../public/js/calc');
const product = { id: 1, name: 'Test bread', unit: 'ชิ้น', cost: 2, price: 5, order_cost: 4, shelf_life_days: 2, lead_time_days: 1 };
const settings = { method: 'ma', n: 7, alpha: .3, serviceLevel: .95, holdRate: .25, confidenceLevel: .95 };
const seasonal = Array.from({ length: 56 }, (_, i) => [10, 25, 12, 40, 14, 90, 5][i % 7]);

test('comparison uses identical validation/test observations and recognizes weekly demand', () => {
  const r = Calc.compareModels(seasonal);
  assert.equal(r.validationStart, 28); assert.equal(r.testStart, 42);
  assert.equal(r.selected.method, 'seasonal');
  assert.equal(r.selected.validation.rmse, 0); assert.equal(r.selected.test.rmse, 0);
  r.rows.forEach(row => { assert.equal(row.validation.samples, 14); assert.equal(row.test.samples, 14); });
});

test('changing the entire holdout cannot change model selection or validation scores', () => {
  const a = Calc.compareModels(seasonal);
  const changed = seasonal.map((v, i) => i < a.testStart ? v : 10000 + i);
  const b = Calc.compareModels(changed);
  assert.equal(a.selected.id, b.selected.id);
  assert.deepEqual(a.rows.map(r => r.validation), b.rows.map(r => r.validation));
  const original = Calc.forecast(seasonal, 'es', .3);
  const future = Calc.forecast(changed, 'es', .3);
  assert.deepEqual(original.fitted.slice(0, 43), future.fitted.slice(0, 43));
});

test('short histories cannot claim a model evaluation; zero demand cannot claim MAPE 0%', () => {
  assert.equal(Calc.compareModels(seasonal.slice(0, 41)).available, false);
  assert.equal(Calc.compareModels(seasonal.slice(0, 42)).block, 7);
  const metrics = Calc.errorMetrics([{ a: 0, f: 10 }, { a: 0, f: 20 }]);
  assert.equal(metrics.mape, null); assert.equal(metrics.mapeSamples, 0); assert.equal(metrics.mae, 15);
  assert.equal(Calc.forecast([10, 20], 'ma', 7).d, 15);
});

test('explicit model choice flows through forecasts, aggregate intervals, and worked EOQ', () => {
  const data = { today: '2022-10-01', dates: seasonal.map((_, i) => Calc.addDays('2022-08-06', i)), products: [product, { ...product, id: 2 }], dailySales: { 1: seasonal, 2: seasonal }, lots: [] };
  const choice = { ...settings, modelChoices: { 1: { method: 'seasonal', param: 7 } } };
  const forecasts = Calc.forecastAll(data, choice);
  const total = Calc.totalForecast(data, choice);
  assert.equal(forecasts[1].method, 'seasonal');
  assert.equal(total.forecast.d, forecasts[1].d + forecasts[2].d);
  assert.equal(Calc.calculationDetails(data, product, choice).forecast.d, forecasts[1].d);
  assert.equal(total.forecast.fitted[40], forecasts[1].fitted[40] + forecasts[2].fitted[40]);
});

test('usable stock excludes expired and future receipts while FEFO prioritizes earliest expiry', () => {
  const data = { today: '2022-10-01', products: [product], transactions: [], lots: [
    { id: 1, product_id: 1, qty_remaining: 100, expiry_date: '2022-10-01', days_left: 0 },
    { id: 2, product_id: 1, qty_remaining: 40, expiry_date: '2022-10-05', days_left: 4 },
    { id: 3, product_id: 1, qty_remaining: 15, expiry_date: '2022-10-02', days_left: 1 },
    { id: 4, product_id: 1, qty_remaining: 999, received_date: '2022-10-02', expiry_date: '2022-10-04', days_left: 3 }
  ] };
  assert.equal(Calc.stockByProduct(data)[1], 55);
  const lots = Calc.analyzeLots(data, { 1: { d: 10 } });
  assert.equal(lots.length, 3);
  assert.equal(lots.find(r => r.lot.id === 3).sellable, 10);
  assert.equal(lots.find(r => r.lot.id === 2).sellable, 30);
  assert.equal(lots.find(r => r.lot.id === 1).sellable, 0);
});

test('policy experiment conserves units and reconciles every cost component', () => {
  const result = Calc.evaluatePolicies(product, seasonal, settings, { initialStock: 20, fixedQty: 80, interval: 3, shortagePenalty: 3 });
  for (const r of [result.fixed, result.dss]) {
    assert.equal(r.initialStock + r.received, r.sold + r.waste + r.closing);
    assert.equal(r.orderedUnits, r.received + r.pipeline);
    assert.equal(r.demand, r.sold + r.shortage);
    assert.equal(r.totalCost, r.orderCost + r.holdingCost + r.wasteCost + r.shortageCost);
    assert(r.fillRate >= 0 && r.fillRate <= 1);
    assert(r.rows.every(day => day.closing >= 0 && day.shortage >= 0));
  }
});

test('one-day goods expire before selling on the following day and receipts honor lead time', () => {
  const r = Calc.evaluatePolicies({ ...product, shelf_life_days: 1, lead_time_days: 2 }, new Array(56).fill(10), settings, { initialStock: 25, interval: 3, fixedQty: 30 });
  assert.equal(r.fixed.rows[0].closing, 15);
  assert.equal(r.fixed.rows[1].waste, 15);
  assert.equal(r.fixed.rows[0].received, 0); assert.equal(r.fixed.rows[1].received, 0);
  assert.equal(r.fixed.rows[2].received, 30);
});

test('policy decisions never see the actual sale or future days at order time', () => {
  const a = Calc.evaluatePolicies(product, seasonal, settings);
  const modified = seasonal.slice(); modified[45] = 100000;
  const b = Calc.evaluatePolicies(product, modified, settings);
  assert.equal(a.selected.id, b.selected.id);
  assert.deepEqual(a.assumptions, b.assumptions);
  assert.deepEqual(a.dss.rows.slice(0, 3), b.dss.rows.slice(0, 3));
  assert.equal(a.dss.rows[3].forecast, b.dss.rows[3].forecast);
  assert.equal(a.dss.rows[3].ordered, b.dss.rows[3].ordered);
});

test('zero-demand simulation has no orders, no fabricated fill rate, and finite costs', () => {
  const r = Calc.evaluatePolicies(product, new Array(56).fill(0), settings);
  assert.equal(r.dss.orders, 0); assert.equal(r.dss.totalCost, 0); assert.equal(r.dss.fillRate, null);
  assert.throws(() => Calc.evaluatePolicies(product, seasonal, settings, { interval: 0 }), /assumptions/);
});

test('silhouette agrees with hand-calculated Euclidean separation and handles undefined cases', () => {
  const pts = [[0, 0], [0, 1], [10, 0], [10, 1]];
  const expected = 1 - 1 / ((10 + Math.sqrt(101)) / 2);
  assert(Math.abs(Calc.silhouette(pts, [0, 0, 1, 1]) - expected) < 1e-12);
  assert.equal(Calc.silhouette(pts, [0, 0, 0, 0]), null);
  assert.equal(Calc.silhouette(pts, [0, 1, 2, 3]), null);
});

test('clustering zero-demand products keeps coordinates finite with a small catalogue', () => {
  const r = Calc.clusterProducts({ products: [product, { ...product, id: 2 }] }, { 1: { d: 0 }, 2: { d: 1 } }, 5);
  assert(r.pts.flat().every(Number.isFinite)); assert.equal(r.sseByK.length, 2);
  assert.equal(r.silhouette, null);
});

test('cluster names are unique and relative to this product set, not fixed minimart thresholds', () => {
  const lives = [1, 2, 3, 1, 2, 3, 1, 2, 3, 7], demand = [166, 50, 42, 32, 28, 8, 7, 6, 7, 6];
  const products = lives.map((life, i) => ({ ...product, id: i + 1, shelf_life_days: life }));
  const fcs = Object.fromEntries(demand.map((d, i) => [i + 1, { d }]));
  for (const k of [2, 3, 4, 5]) {
    const r = Calc.clusterProducts({ products }, fcs, k);
    const names = r.groups.map(g => g.name);
    assert.equal(new Set(names).size, names.length, `k=${k}: ${names.join(' | ')}`);
    r.groups.forEach(g => { assert.ok(g.policy, `policy for ${g.name}`); assert.doesNotMatch(g.name, /ของสดอายุสั้นมาก/); });
  }
  const r2 = Calc.clusterProducts({ products }, fcs, 2);
  assert.match(r2.groups.find(g => g.members.some(p => p.id === 1)).name, /^ขายดี/);
});
