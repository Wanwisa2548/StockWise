// Explicit synthetic, read-only demonstration. Never used as a database fallback.
const Calc = require('./public/js/calc');
module.exports = function demoData() {
  const today = '2022-10-01';
  const dates = Array.from({ length: 56 }, (_, i) => Calc.addDays(today, i - 56));
  const names = ['TRADITIONAL BAGUETTE', 'CROISSANT', 'PAIN AU CHOCOLAT', 'BANETTE', 'BAGUETTE', 'CEREAL BAGUETTE', 'SPECIAL BREAD', 'TARTELETTE', 'BOULE 400G', 'COOKIE'];
  const products = names.map((name, i) => ({ id: i + 1, sku: `demo-${i + 1}`, name, unit: 'ชิ้น', cost: .4 + i * .15, price: 1 + i * .3, order_cost: 5, lead_time_days: 1 + i % 2, shelf_life_days: i === 9 ? 7 : 1 + i % 3 }));
  const dailySales = {}, transactions = [], lots = [];
  const random = Calc.rng(20261103);
  products.forEach((p, i) => {
    const base = 15 + (9 - i) * 8;
    dailySales[p.id] = dates.map((date, t) => Math.max(0, Math.round(base * [0.6, 1.1, .9, 1, 1.2, 1.5, .8][t % 7] + (random() - .5) * 14)));
    dates.forEach((date, t) => {
      const total = dailySales[p.id][t], morning = Math.floor(total * .6);
      [[9, morning], [17, total - morning]].forEach(([hour, qty]) => transactions.push({ receipt_no: `DEMO-${i}-${t}-${hour}`, sold_at: `${date} ${hour}:00:00`, product_id: p.id, qty, unit_price: p.price }));
    });
    [0, 1].forEach(offset => {
      const days = offset ? p.shelf_life_days : (i === 0 ? 0 : 1);
      lots.push({ id: lots.length + 1, product_id: p.id, qty_received: base * 2, qty_remaining: base * 2, received_date: Calc.addDays(today, -1), expiry_date: Calc.addDays(today, days), days_left: days });
    });
  });
  return { today, dates, products, dailySales, transactions, lots, orders: [], promotions: [], forecasts: [], clusters: [], source: { mode: 'demo', label: 'DEMO · ข้อมูลจำลอง ไม่ใช่ Bakery sales.csv', readOnly: true } };
};
