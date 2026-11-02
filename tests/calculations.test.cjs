const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/calc.js'), 'utf8') + ';globalThis.Calc = Calc;', context);
const Calc = context.Calc;
const close = (actual, expected) => assert(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const settings = { method: 'ma', n: 7, confidenceLevel: 0.95, serviceLevel: 0.95, holdRate: 0.2 };
const product = { cost: 10, order_cost: 40, shelf_life_days: 10, lead_time_days: 2 };
const history = Array.from({ length: 56 }, (_, i) => 20 + i % 7 * 3);

test('EOQ uses annual demand and annual holding cost in the same units', () => {
  const plan = Calc.plan(product, { d: 10000 / 365, metrics: { rmse: 2 } }, 100, settings);
  close(plan.D, 10000);
  close(plan.H, 2);
  close(plan.eoq, Math.sqrt(2 * 10000 * 40 / 2));
  assert.equal(plan.limited, true);
  assert.equal(plan.qty, Math.floor(10000 / 365 * 10));
});

test('EOQ without a binding shelf-life cap uses rounded economic quantity', () => {
  const plan = Calc.plan({ ...product, shelf_life_days: 365 }, { d: 10000 / 365, metrics: { rmse: 2 } }, 100, settings);
  assert.equal(plan.limited, false);
  assert.equal(plan.qty, Math.round(plan.eoq));
});

test('95% prediction interval uses two-sided 1.96, separate from service-level z', () => {
  const fc = Calc.forecast(history, 'ma', 7);
  const ci = Calc.forecastConfidence(history, fc, 0.95);
  close(ci.z, 1.959963984540054);
  close(ci.lo, Math.max(0, fc.d - ci.z * fc.metrics.rmse));
  close(ci.hi, fc.d + ci.z * fc.metrics.rmse);
  assert.notEqual(ci.z, Calc.Z[0.95]);
  assert.equal(ci.samples, 49);
});

test('higher confidence widens intervals without changing point forecasts or EOQ', () => {
  const fc = Calc.forecast(history, 'es', 0.3);
  const c90 = Calc.forecastConfidence(history, fc, 0.90);
  const c95 = Calc.forecastConfidence(history, fc, 0.95);
  const c99 = Calc.forecastConfidence(history, fc, 0.99);
  assert(c90.hi < c95.hi && c95.hi < c99.hi);
  assert(c90.lo > c95.lo && c95.lo > c99.lo);
  const a = Calc.plan(product, fc, 100, { ...settings, confidenceLevel: .9 });
  const b = Calc.plan(product, fc, 100, { ...settings, confidenceLevel: .99 });
  close(a.eoq, b.eoq);
  close(a.rop, b.rop);
});

test('rolling coverage excludes the day being tested and all future errors', () => {
  const series = new Array(25).fill(20);
  series[14] = 1000;
  const makeForecast = values => ({ d: 10, fitted: new Array(values.length).fill(10), metrics: Calc.errorMetrics(values.map(a => ({ a, f: 10 }))) });
  const result = Calc.forecastConfidence(series, makeForecast(series), .95);
  const first = result.backtest.checks[0];
  assert.equal(first.index, 14);
  close(first.hi, 10 + Calc.PREDICTION_Z[.95] * 10);
  assert.equal(first.covered, false);
  const changed = series.slice(); changed[24] = 1000000;
  const future = Calc.forecastConfidence(changed, makeForecast(changed), .95);
  close(future.backtest.checks[0].hi, first.hi);
  assert.equal(result.backtest.tested, 11);
});

test('aggregate confidence retains correlated product errors', () => {
  const data = { dates: history.map((_, i) => String(i)), products: [{ id: 1 }, { id: 2 }], dailySales: { 1: history, 2: history } };
  const total = Calc.totalForecast(data, settings);
  const single = Calc.forecast(history, 'ma', 7);
  close(total.forecast.d, single.d * 2);
  close(total.forecast.metrics.rmse, single.metrics.rmse * 2);
  close(total.confidence.hi, Calc.forecastConfidence(history, single).hi * 2);
});

test('insufficient backtest observations return no interval or coverage', () => {
  const series = [10, 12, 14, 11, 13, 9, 8];
  const result = Calc.forecastConfidence(series, Calc.forecast(series, 'ma', 7));
  assert.equal(result.available, false);
  assert.equal(result.lo, null);
  assert.equal(result.hi, null);
  assert.equal(result.backtest.coverage, null);
});

test('zero demand remains finite and requires no stock order', () => {
  const series = new Array(56).fill(0);
  const fc = Calc.forecast(series, 'ma', 7);
  const ci = Calc.forecastConfidence(series, fc);
  close(ci.lo, 0); close(ci.hi, 0);
  close(ci.backtest.coverage, 1);
  const plan = Calc.plan(product, fc, 0, settings);
  close(plan.eoq, 0); close(plan.qty, 0);
});

test('negative lower prediction bounds are clipped at zero', () => {
  const fc = { d: 1, fitted: [1, 1], metrics: { rmse: 10 } };
  const ci = Calc.forecastConfidence([10, 20], fc);
  assert.equal(ci.lo, 0);
  assert(ci.hi > 20);
});

test('unsupported confidence levels cannot silently produce NaN', () => {
  assert.throws(() => Calc.forecastConfidence(history, Calc.forecast(history, 'ma', 7), .5), /Unsupported/);
});

test('worked MA and RMSE tables reconcile to the displayed model', () => {
  const p = { ...product, id: 1 };
  const data = { today: '2022-10-01', dates: history.map((_, i) => Calc.addDays('2022-08-06', i)), products: [p], dailySales: { 1: history }, lots: [] };
  const detail = Calc.calculationDetails(data, p, settings);
  close(detail.recentSum / 7, detail.forecast.d);
  close(detail.errors.reduce((s, r) => s + r.squaredError, 0), detail.squaredErrorSum);
  close(Math.sqrt(detail.squaredErrorSum / detail.errors.length), detail.confidence.rmse);
  close(Math.sqrt(detail.radicand), detail.plan.eoq);
  close(detail.margin, detail.confidence.z * detail.confidence.rmse);
  assert.equal(detail.errors.length, 49);
});

test('worked ES stages lead exactly to the final forecast', () => {
  const p = { ...product, id: 1 };
  const data = { today: '2022-10-01', dates: history.map((_, i) => String(i)), products: [p], dailySales: { 1: history }, lots: [] };
  const detail = Calc.calculationDetails(data, p, { ...settings, method: 'es', alpha: .3 });
  close(detail.smoothing.at(-1).nextLevel, detail.forecast.d);
  detail.smoothing.forEach(row => close(row.actualPart + row.previousPart, row.nextLevel));
  assert.equal(detail.errors.length, 55);
});

test('coverage worked example exposes the prior-only RMSE calculation', () => {
  const fc = Calc.forecast(history, 'ma', 7);
  const example = Calc.forecastConfidence(history, fc).backtest.checks[0];
  assert.equal(example.priorSamples, 14);
  const previousErrors = history.slice(7, example.index).map((a, i) => a - fc.fitted[i + 7]);
  close(example.priorSquaredErrors, previousErrors.reduce((s, v) => s + v * v, 0));
  close(example.priorRmse, Math.sqrt(example.priorSquaredErrors / example.priorSamples));
});

test('worked HTML escapes source values and supports offline presentation', () => {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/calculation-details.js'), 'utf8') + ';globalThis.Details = CalculationDetails;', context);
  const p = { ...product, id: 1, name: '<script>unsafe</script>', unit: 'ชิ้น' };
  const data = { today: '2022-10-01', dates: history.map((_, i) => String(i)), products: [p], dailySales: { 1: history }, lots: [] };
  const trace = Calc.calculationDetails(data, p, settings);
  const html = context.Details.document(trace);
  assert(!html.includes('<script>unsafe'));
  assert(html.includes('&lt;script&gt;unsafe&lt;/script&gt;'));
  assert(html.includes('window.print()'));
  assert(html.includes('49'));
  assert(html.includes('EOQ = √(2 × D × S ÷ H)'));
});
