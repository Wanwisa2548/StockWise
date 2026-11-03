const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');

(async () => {
  const server = spawn(process.execPath, ['server.js', '--demo'], { cwd: root, env: { ...process.env, PORT: '0' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let browser;
  try {
    const port = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('Demo server startup timeout')), 15000);
      server.once('error', err => { clearTimeout(timer); reject(err); });
      server.once('exit', code => { clearTimeout(timer); reject(new Error(`Demo exited: ${code}`)); });
      server.stdout.on('data', data => { output += data; const match = output.match(/localhost:(\d+)/); if (match) { clearTimeout(timer); resolve(Number(match[1])); } });
    });
    const base = `http://127.0.0.1:${port}`;
    const channel = process.env.PLAYWRIGHT_CHANNEL;
    browser = await chromium.launch({ headless: true, ...(channel ? { channel } : {}) });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    // Tests don't depend on a third-party font service.
    await page.route('https://fonts.googleapis.com/**', route => route.abort());
    await page.route('https://fonts.gstatic.com/**', route => route.abort());
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const out = path.join(root, 'outputs', 'verification');
    await fs.mkdir(out, { recursive: true });
    await page.goto(base);
    await page.locator('#dashboard-eoq').waitFor({ state: 'attached' });
    assert.equal(await page.locator('#tab-summary').count(), 0);
    assert.equal(await page.locator('.dashboard-details').getAttribute('open'), null);
    await page.screenshot({ path: path.join(out, 'overview.png'), fullPage: true });
    assert.match(await page.locator('#data-source-banner').innerText(), /ข้อมูลจำลอง/);
    const write = await page.request.post(`${base}/api/purchase-orders`, { data: { product_id: 1, qty: 10 } });
    assert.equal(write.status(), 403);
    const tabs = ['overview', 'sales', 'forecast', 'order', 'expiry', 'cluster', 'manage', 'evaluation', 'presentation'];
    for (const tab of tabs) {
      await page.locator(`#tab-${tab}`).click();
      assert(await page.locator('#page').innerText(), `Empty page: ${tab}`);
      assert.equal(await page.locator('#page svg').evaluateAll(nodes => nodes.some(el => /NaN|Infinity/.test(el.outerHTML))), false, `Invalid SVG: ${tab}`);
    }
    await page.locator('#tab-forecast').click();
    assert.equal(await page.locator('#f-comparison tbody tr').count(), 9);
    await page.locator('#f-use-model').click();
    const chosen = await page.evaluate(() => App.settings.modelChoices[App.selProduct]);
    assert(chosen && chosen.method);
    assert.equal(await page.locator('#f-use-model').isDisabled(), true);
    assert.equal(await page.locator('#f-save').isDisabled(), true);
    const other = await page.evaluate(() => { const p = App.data.products.find(p => p.id !== App.selProduct); return { id: p.id, forecast: Calc.forecastAll(App.data, App.settings)[p.id].d }; });
    await page.getByText('ปรับโมเดลของสินค้านี้เอง', { exact: true }).click();
    await page.locator('#f-method [data-m=es]').click();
    await page.locator('#f-p').evaluate(input => { input.value = '0.5'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.equal(await page.evaluate(() => App.settings.modelChoices[App.selProduct].param), .5);
    assert.equal(await page.evaluate(id => Calc.forecastAll(App.data, App.settings)[id].d, other.id), other.forecast, 'Manual edits must affect only the selected product');
    await page.locator('#f-use-model').click();
    assert.equal(await page.locator('#f-p').isDisabled(), true, 'Seasonal model must not appear adjustable with an MA slider');
    await page.getByText('ปรับโมเดลของสินค้านี้เอง', { exact: true }).click();
    const modelDownload = page.waitForEvent('download');
    await page.locator('#f-export-models').click();
    const models = await modelDownload; await models.saveAs(path.join(out, 'demo-models.csv'));
    assert.match(await fs.readFile(path.join(out, 'demo-models.csv'), 'utf8'), /validation_rmse/);
    await page.screenshot({ path: path.join(out, 'forecast.png'), fullPage: true });
    await page.locator('#tab-order').click();
    assert.equal(await page.locator('#o-table th').count(), 6);
    assert.equal(await page.locator('#o-chart').count(), 0);
    await page.locator('.dss-reason').first().locator('summary').click();
    assert.match(await page.locator('.dss-reason').first().innerText(), /ROP|ความต้องการ/);
    assert.equal(await page.evaluate(() => Calc.forecastAll(App.data, App.settings)[App.selProduct].method), chosen.method);
    await page.locator('#tab-overview').click();
    await page.locator('.dashboard-details > summary').click();
    await page.locator('[data-calculation=eoq]').click();
    await page.locator('#worked-eoq').waitFor();
    const trace = await page.evaluate(() => {
      const p = App.product(App.selProduct); const t = Calc.calculationDetails(App.data, p, App.settings);
      return { method: t.forecast.method, html: CalculationDetails.document(t) };
    });
    assert.equal(trace.method, chosen.method); assert(!trace.html.includes('undefined')); assert.match(trace.html, /DEMO/);
    await page.locator('#tab-evaluation').click();
    const liveSettings = await page.evaluate(() => JSON.stringify(App.settings));
    await page.locator('[name=interval]').fill('2');
    await page.locator('[name=initialStock]').fill('30');
    await page.locator('[name=serviceLevel]').selectOption('0.99');
    await page.locator('[name=holdRate]').fill('50');
    await page.getByRole('button', { name: 'คำนวณใหม่', exact: true }).click();
    assert.equal(await page.locator('[name=interval]').inputValue(), '2');
    assert.equal(await page.evaluate(() => JSON.stringify(App.settings)), liveSettings, 'Experiment controls must not change live settings');
    const policyDownload = page.waitForEvent('download'); await page.locator('#v-export').click();
    await (await policyDownload).saveAs(path.join(out, 'demo-policy.csv'));
    assert.match(await fs.readFile(path.join(out, 'demo-policy.csv'), 'utf8'), /total_simulated_cost/);
    await page.screenshot({ path: path.join(out, 'evaluation.png'), fullPage: true });
    await page.locator('#tab-cluster').click();
    for (const k of [2, 3, 4, 5]) await page.locator(`[data-k="${k}"]`).click();
    assert.match(await page.locator('#c-elbow').innerText(), /Silhouette/);
    await page.locator('#tab-presentation').click();
    assert.equal(await page.locator('.dss-slide').count(), 9);
    assert.match(await page.locator('.dss-slide').nth(7).innerText(), /Service 99%/);
    const slideDownload = page.waitForEvent('download'); await page.locator('#s-save').click();
    const slidePath = path.join(out, 'demo-slides.html'); await (await slideDownload).saveAs(slidePath);
    assert.match(await fs.readFile(slidePath, 'utf8'), /DEMO \/ SYNTHETIC/);
    await page.emulateMedia({ media: 'print' });
    await page.screenshot({ path: path.join(out, 'slides-print.png'), fullPage: true });
    await page.emulateMedia({ media: 'screen' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => { const toast = document.getElementById('toast'); if (toast) toast.hidden = true; });
    await page.locator('#tab-evaluation').click();
    await page.screenshot({ path: path.join(out, 'evaluation-mobile.png'), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, 'Mobile page overflows');
    // A zero-demand shop exercises missing MAPE, log(0), and no-order decisions in the UI.
    const zeroData = require('../demo-data')();
    zeroData.products.forEach(p => { zeroData.dailySales[p.id] = new Array(56).fill(0); });
    zeroData.transactions = [];
    await page.route('**/api/data', route => route.fulfill({ json: zeroData }));
    await page.goto(base + '/?fixture=zero-demand#forecast');
    await page.locator('#f-comparison').waitFor();
    await page.locator('#f-use-model').click();
    await page.getByText('ความคลาดเคลื่อนย้อนหลังทั้งช่วง', { exact: true }).click();
    assert.match(await page.locator('#f-kpi').innerText(), /—/);
    for (const tab of ['overview', 'order', 'expiry', 'cluster', 'evaluation', 'presentation']) {
      await page.locator(`#tab-${tab}`).click();
      assert.equal(await page.locator('#page svg').evaluateAll(nodes => nodes.some(el => /NaN|Infinity/.test(el.outerHTML))), false, `Zero-demand SVG: ${tab}`);
    }
    assert.deepEqual(errors, [], 'Browser runtime errors');
    console.log('UI PASS: 9 pages, per-product model controls, isolated experiments, calculation details, CSV/HTML exports, print and mobile. Artifacts: outputs/verification');
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
})().catch(err => { console.error(err); process.exitCode = 1; });
