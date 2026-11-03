const { test } = require('node:test');
const assert = require('node:assert/strict');
const Calc = require('../public/js/calc');
const product = { id: 1, name: 'Bread', unit: 'ชิ้น', cost: 2, price: 4, order_cost: 5, lead_time_days: 1, shelf_life_days: 2 };
const settings = { serviceLevel: .95, holdRate: .25, today: '2022-10-01' };
const forecast = (d, rmse = 8) => ({ d, method: 'ma', param: 7, metrics: { rmse } });
const lot = (qty, expiry, received = '2022-09-30') => ({ product_id: 1, qty_remaining: qty, expiry_date: expiry, received_date: received });
const data = (lots, orders = []) => ({ today: settings.today, products: [product], lots, orders });
const close = (a, b) => assert(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('rounding EOQ cannot cross a fractional shelf-life cap with valid database prices', () => {
  const p = { ...product, cost: 2.8, order_cost: .02 };
  const plan = Calc.plan(p, forecast(5.4, 1), 0, settings);
  close(plan.eoq, Math.sqrt(2 * 5.4 * 365 * .02 / .7));
  close(plan.cap, 10.8);
  assert.equal(plan.roundedEOQ, 11); assert.equal(plan.integerCap, 10);
  assert.equal(plan.qty, 10); assert.equal(plan.limited, true);
});

test('positive sub-unit demand requires review instead of claiming no order is needed', () => {
  const plan = Calc.plan({ ...product, shelf_life_days: 1 }, forecast(.4, 1), 0, settings);
  assert.equal(plan.qty, 0); assert.equal(plan.reason, 'below_unit_cap');
  assert.equal(plan.review, true); assert.equal(plan.canOrder, false); assert.equal(plan.dueToday, false);
  assert.match(Calc.orderLabel(plan), /ต่ำกว่า 1/);
  const noDemand = Calc.plan(product, forecast(0, 0), 0, settings);
  assert.equal(noDemand.reason, 'no_demand'); assert.equal(noDemand.review, false);
  const tiny = Calc.plan({ ...product, shelf_life_days: 1 }, forecast(1e-10, 1), 0, { ...settings, inventory: [] });
  assert.equal(tiny.reason, 'below_unit_cap', 'tiny positive demand must not be normalized to no demand');
});

test('an EOQ rounded below one unit is not automatically increased or called no demand', () => {
  const plan = Calc.plan({ ...product, cost: 99999999, order_cost: .01 }, forecast(1, 0), 0, settings);
  assert.equal(plan.reason, 'below_unit_eoq'); assert.equal(plan.qty, 0); assert.equal(plan.review, true);
});

test('old stock that survives receipt and sells first reduces the new order by its actual usage', () => {
  const plan = Calc.planFor(data([lot(20, '2022-10-03')]), product, forecast(10), settings, true);
  assert.equal(plan.days, 0); assert.equal(plan.arrivalDate, '2022-10-02');
  close(plan.window.arrivalStock, 10); close(plan.window.competingSales, 10);
  close(plan.window.shelfDemand, 20); close(plan.cap, 10); assert.equal(plan.qty, 10);
  close(plan.window.rows.reduce((s, r) => s + (r.availableForNew || 0), 0), plan.cap);
});

test('stock expiring exactly on receipt is discarded before calculating headroom', () => {
  const plan = Calc.planFor(data([lot(20, '2022-10-02')]), product, forecast(10), settings, true);
  close(plan.window.arrivalStock, 0); close(plan.window.competingSales, 0);
  assert.equal(plan.qty, 20); assert.equal(plan.window.rows[1].expired, 10);
});

test('FEFO sells the new batch before longer-lived old stock but after same-expiry stock', () => {
  const longer = Calc.planFor(data([lot(20, '2022-10-10')]), product, forecast(10), settings);
  close(longer.window.arrivalStock, 10); close(longer.window.competingSales, 0); assert.equal(longer.qty, 20);
  const same = Calc.planFor(data([lot(20, '2022-10-04')]), product, forecast(10), settings);
  close(same.window.competingSales, 10); assert.equal(same.qty, 10);
});

test('expiry advances the reorder day and future-dated inventory is not counted as current stock', () => {
  const plan = Calc.planFor(data([lot(50, '2022-10-02'), lot(999, '2022-10-08', '2022-10-03')]), product, forecast(10, 0), settings);
  assert.equal(plan.stock, 50); assert.equal(plan.days, 1); assert.equal(plan.orderDate, '2022-10-02');
  assert.equal(plan.arrivalDate, '2022-10-03'); close(plan.window.arrivalStock, 0);
  assert.equal(plan.canOrder, false, 'future-date quantity must not be executed today');
});

test('stock covering the entire new-batch window blocks a wasteful additional order', () => {
  const plan = Calc.planFor(data([lot(100, '2022-10-04')]), product, forecast(10, 100), settings);
  assert.equal(plan.cap, 0); assert.equal(plan.qty, 0); assert.equal(plan.reason, 'stock_covers_window');
  assert.equal(plan.canOrder, false); assert.equal(plan.review, false);
});

test('confirmed pending receipts enter the projection and prevent duplicate orders, including overdue ones', () => {
  const pending = { product_id: 1, qty: 50, status: 'ordered', expected_date: '2022-10-02' };
  const plan = Calc.planFor(data([], [pending]), product, forecast(10), settings);
  assert.equal(plan.reason, 'pending'); assert.equal(plan.canOrder, false);
  assert.equal(plan.window.arrivalStock, 50); assert.equal(plan.cap, 0);
  const overdue = Calc.planFor(data([], [{ ...pending, expected_date: '2022-09-30' }]), product, forecast(10), settings);
  assert.equal(overdue.reason, 'pending'); assert.equal(overdue.canOrder, false);
  assert.equal(overdue.window.arrivalStock, 0, 'an overdue order is not assumed to have been received');
});

test('missing residuals and invalid EOQ inputs produce explicit review states, not executable suggestions', () => {
  const insufficient = Calc.planFor(data([]), product, forecast(10, null), settings);
  assert.equal(insufficient.safety, null); assert.equal(insufficient.rop, null);
  assert.equal(insufficient.reason, 'insufficient_errors'); assert.equal(insufficient.canOrder, false);
  for (const p of [{ ...product, cost: 0 }, { ...product, order_cost: 0 }, { ...product, shelf_life_days: 0 }]) {
    const result = Calc.plan(p, forecast(10), 0, settings);
    assert.equal(result.reason, 'invalid_inputs'); assert.equal(result.eoq, null); assert.equal(result.canOrder, false);
  }
  assert.equal(Calc.plan(product, forecast(10), 0, { ...settings, holdRate: 0 }).reason, 'invalid_inputs');
});

test('recommended units respect integer caps across high/low demand, prices, lead times and shelf lives', () => {
  for (const d of [0, .01, .4, 1, 5.4, 10.99, 1000]) for (const cost of [.01, 2.8, 1000]) for (const life of [1, 2, 7, 365]) {
    const p = { ...product, cost, shelf_life_days: life };
    const result = Calc.plan(p, forecast(d, 1), 50, settings);
    assert(Number.isInteger(result.qty) && result.qty >= 0);
    assert(result.qty <= Math.floor(result.cap)); assert(result.qty <= result.roundedEOQ);
  }
});

test('fractional daily consumption does not lose a whole unit through floating-point cancellation', () => {
  const p = { ...product, shelf_life_days: 29 };
  const source = data([lot(2, '2022-10-31')]);
  const snapshot = JSON.stringify(source);
  const plan = Calc.planFor(source, p, forecast(.1, 2), settings, true);
  // New window: 29 × .1 = 2.9; old stock uses 2 − .1 = 1.9, leaving exactly 1 unit.
  close(plan.window.competingSales, 1.9); assert.equal(plan.cap, 1); assert.equal(plan.qty, 1);
  assert.equal(JSON.stringify(source), snapshot, 'projection must not consume the actual lots');
});
