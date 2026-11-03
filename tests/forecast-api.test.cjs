const { test } = require('node:test');
const assert = require('node:assert/strict');

test('forecast API validates per-product methods and writes nullable MAPE atomically without SQL access', async () => {
  const statements = [];
  class Transaction {
    async begin() {} async commit() {} async rollback() {}
  }
  class Request {
    constructor() { this.values = {}; }
    input(name, type, value) { this.values[name] = value; return this; }
    async query(query) { statements.push({ query, values: this.values }); return { recordset: [], rowsAffected: [1] }; }
  }
  const dbPath = require.resolve('../db');
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { sql: { Transaction, Request, Int: 'int', Date: 'date', VarChar: () => 'text', Decimal: () => 'decimal' }, poolPromise: Promise.resolve({}) } };
  const router = require('../routes/records');
  const body = { method: 'ma', param: 7, models: [{ product_id: 1, method: 'seasonal', param: 7 }], items: [{ product_id: 1, daily_forecast: 10, mae: 1, rmse: 2, mape: null }] };
  const post = value => new Promise((resolve, reject) => router.handle(
    { method: 'POST', url: '/forecasts', body: value },
    { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { resolve({ status: this.statusCode, body }); } },
    err => reject(err || new Error('Route did not respond'))
  ));
    const success = await post(body); assert.equal(success.status, 201);
    const insert = statements.find(s => s.query.includes('INSERT'));
    assert.equal(insert.values.m, 'seasonal'); assert.equal(insert.values.p, 7); assert.equal(insert.values.mape, null);
    const invalid = await post({ ...body, models: [{ product_id: 1, method: 'es', param: 7 }] });
    assert.equal(invalid.status, 400);
    const duplicate = await post({ ...body, items: [body.items[0], body.items[0]] });
    assert.equal(duplicate.status, 400);
    assert.equal(statements.length, 2, 'invalid input must not start SQL writes');
});
