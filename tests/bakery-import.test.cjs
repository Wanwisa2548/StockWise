const { test } = require('node:test');
const assert = require('node:assert/strict');
const { splitCsvLine, parseEuro, parseBakeryCsv } = require('../scripts/bakery-csv.cjs');

const sample = [
  ',date,time,ticket_number,article,Quantity,unit_price',
  '0,2021-01-02,08:38,150040.0,BAGUETTE,1.0,"0,90 €"',
  '1,2021-01-02,08:38,150040.0,PAIN AU CHOCOLAT,3.0,"1,20 €"',
  '2,2021-01-02,09:14,150041.0,TRADITIONAL BAGUETTE,-1.0,"1,20 €"',
  '3,2021-01-03,09:15,150042.0,TARTE FRAISE 4PER,1.0,"14,00 €"',
  ''
].join('\r\n');

test('CSV reader handles quoted euro prices and the audit filters', () => {
  assert.deepEqual(splitCsvLine('a,"1,20 €",b'), ['a', '1,20 €', 'b']);
  assert.equal(parseEuro('0,90 €'), 0.9);
  const { rows, stats } = parseBakeryCsv(sample, ['BAGUETTE', 'PAIN AU CHOCOLAT', 'TRADITIONAL BAGUETTE']);
  assert.equal(stats.allRows, 4);
  assert.equal(stats.distinctArticles, 4);
  assert.equal(stats.selectedRows, 3);
  assert.equal(stats.nonPositive, 1);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[1], { receipt_no: '150040', sold_at: '2021-01-02 08:38:00', article: 'PAIN AU CHOCOLAT', qty: 3, unit_price: 1.2 });
});

test('CSV reader refuses a file with different columns', () => {
  assert.throws(() => parseBakeryCsv('a,b,c\n1,2,3', ['X']), /หัวคอลัมน์/);
});
