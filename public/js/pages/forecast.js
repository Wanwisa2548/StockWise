// หน้า 2: พยากรณ์ยอดขาย
Pages.forecast = {
  render(root) {
    const d = App.data, S = App.settings;
    if (App.selProduct === null) App.selProduct = d.products[0].id;
    const manual = { method: S.method, n: S.n, alpha: S.alpha };

    root.innerHTML = `
      ${BakeryVisuals.heading('forecast', 'พยากรณ์ยอดขาย', `เลือกโมเดลสำหรับสินค้าแต่ละรายการจากยอดขายย้อนหลัง ${d.dates.length} วัน`)}
      <div class="card">
        <div class="controls">
          <label>สินค้า <select id="f-prod">${App.productOptions(App.selProduct)}</select></label>
          <label>ระดับช่วงคาดการณ์
            <select id="f-confidence-level">${[0.90, 0.95, 0.99].map(v => `<option value="${v}" ${S.confidenceLevel === v ? 'selected' : ''}>${v * 100}%</option>`).join('')}</select>
          </label>
        </div>
        <div id="f-confidence" class="forecast-confidence-strip"></div>
        <details class="inline-details"><summary>ปรับโมเดลของสินค้านี้เอง</summary><div class="controls">
          <label>วิธีพยากรณ์
            <span class="seg" id="f-method">
              <button data-m="ma" class="${S.method === 'ma' ? 'active' : ''}">Moving Average</button>
              <button data-m="es" class="${S.method === 'es' ? 'active' : ''}">Exponential Smoothing</button>
            </span>
          </label>
          <label id="f-param-wrap"></label>
        </div><p class="dss-note" id="f-manual-note"></p></details>
        <details class="inline-details"><summary>ความคลาดเคลื่อนย้อนหลังทั้งช่วง</summary><div id="f-kpi" class="grid cols-4"></div><p class="dss-note">เป็นผลย้อนหลังทั้งหมดของโมเดลที่ใช้งาน ส่วนผลทดสอบช่วงท้ายดูได้ในตารางเปรียบเทียบโมเดล</p></details>
      </div>
      <section class="card"><div class="bar-actions"><h3>เปรียบเทียบและเลือกโมเดลรายสินค้า</h3><button class="btn secondary" id="f-export-models" type="button">ส่งออกผลประเมิน CSV</button></div><div id="f-comparison"></div></section>
      <div class="card"><h3>ยอดขายจริงเทียบค่าพยากรณ์ และพยากรณ์ 14 วันข้างหน้า</h3><div id="f-chart"></div></div>
      <details class="card"><summary>ดูตัวเลขพยากรณ์ 14 วัน</summary><div class="table-wrap" id="f-table"></div></details>
      <details class="card"><summary>ผลพยากรณ์ที่บันทึกไว้</summary>
        <div class="bar-actions"><button type="button" class="btn" id="f-save">บันทึกผลทุกสินค้า</button></div>
        <p class="muted" id="f-saved-note"></p>
        <div class="table-wrap" id="f-saved"></div>
      </details>`;

    // ผลพยากรณ์ชุดล่าสุดที่บันทึกไว้ในฐานข้อมูล (ตาราง forecasts)
    const drawSaved = () => {
      const rows = d.forecasts;
      if (!rows.length) { $('#f-saved-note').textContent = 'ยังไม่เคยบันทึก — กดปุ่มด้านบนเพื่อเก็บผลพยากรณ์ของสินค้าทุกชิ้นตามวิธีและค่าที่เลือกอยู่'; $('#f-saved').innerHTML = ''; return; }
      const f = rows[0];
      $('#f-saved-note').textContent = `ผลล่าสุดของแต่ละสินค้า · วันที่บันทึกล่าสุด ${App.thaiDate(f.run_date)} · ${rows.length} สินค้า · ค่าคลาดเคลื่อนจาก rolling backtest ทั้งช่วง`;
      $('#f-saved').innerHTML = `<table><thead><tr><th>สินค้า</th><th>วันบันทึก</th><th>โมเดล</th><th>พยากรณ์/วัน</th><th>MAE</th><th>MAPE</th><th>RMSE</th></tr></thead><tbody>
        ${rows.slice().sort((a, b) => a.product_id - b.product_id).map(r => `<tr><td>${App.esc(App.product(r.product_id).name)}</td><td>${r.run_date}</td><td>${App.esc(Calc.modelLabel(r.method, r.param))}</td><td>${App.fmt(r.daily_forecast, 1)}</td><td>${App.fmt(r.mae, 2)}</td><td>${r.mape === null ? '—' : App.fmt(r.mape, 1) + '%'}</td><td>${App.fmt(r.rmse, 1)}</td></tr>`).join('')}</tbody></table>`;
    };
    root.onclick = e => {
      if (e.target.closest('#f-use-model')) {
        const result = Calc.compareModels(d.dailySales[App.selProduct]);
        if (!result.available) return;
        S.modelChoices ||= {};
        S.modelChoices[App.selProduct] = { method: result.selected.method, param: result.selected.param };
        syncManual(); update(); App.updateBadges(); App.toast('ใช้โมเดลที่แนะนำแล้ว'); return;
      }
      if (e.target.closest('#f-clear-model')) {
        delete (S.modelChoices || {})[App.selProduct]; syncManual(); update(); App.updateBadges(); return;
      }
      if (e.target.closest('#f-export-models')) {
        const r = Calc.compareModels(d.dailySales[App.selProduct]);
        if (!r.available) return;
        App.downloadCSV(`stockwise-models-${App.selProduct}-${d.today}.csv`, [
          ['product', 'model', 'selected_by_validation', 'validation_start', 'validation_end', 'test_start', 'test_end', 'validation_n', 'validation_rmse', 'test_n', 'test_mae', 'test_rmse', 'test_mape_pct', 'mape_nonzero_n'],
          ...r.rows.map(row => [App.product(App.selProduct).name, row.label, row.id === r.selected.id, d.dates[r.validationStart], d.dates[r.testStart - 1], d.dates[r.testStart], d.dates.at(-1), row.validation.samples, row.validation.rmse, row.test.samples, row.test.mae, row.test.rmse, row.test.mape, row.test.mapeSamples])
        ]); return;
      }
      const b = e.target.closest('#f-save'); if (!b) return;
      const fcs = Calc.forecastAll(d, S);
      const items = d.products.map(p => ({ product_id: p.id, daily_forecast: fcs[p.id].d, mae: fcs[p.id].metrics.mae, mape: fcs[p.id].metrics.mape, rmse: fcs[p.id].metrics.rmse }));
      App.act(b, () => App.api('POST', '/api/forecasts', { method: S.method, param: S.method === 'es' ? S.alpha : S.n, items, models: d.products.map(p => ({ product_id: p.id, method: fcs[p.id].method, param: fcs[p.id].param })) }), 'บันทึกผลพยากรณ์ลงฐานข้อมูลแล้ว');
    };

    const $ = id => root.querySelector(id);
    $('#f-prod').onchange = e => { App.selProduct = Number(e.target.value); syncManual(); update(); };
    $('#f-confidence-level').onchange = e => { S.confidenceLevel = Number(e.target.value); update(); };
    $('#f-method').onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      manual.method = b.dataset.m;
      setManual();
      drawParam(); update(); drawSaved();
    };

    function setManual() {
      S.modelChoices ||= {};
      S.modelChoices[App.selProduct] = { method: manual.method, param: manual.method === 'es' ? manual.alpha : manual.n };
      App.updateBadges();
    }

    function syncManual() {
      const fc = Calc.forecastFor(d.dailySales[App.selProduct], S, App.selProduct);
      manual.method = ['ma', 'es'].includes(fc.method) ? fc.method : S.method;
      manual.n = fc.method === 'ma' ? fc.param : S.n;
      manual.alpha = fc.method === 'es' ? fc.param : S.alpha;
      drawParam();
    }

    function drawParam() {
      const wrap = $('#f-param-wrap');
      const current = Calc.forecastFor(d.dailySales[App.selProduct], S, App.selProduct);
      root.querySelectorAll('#f-method button').forEach(x => x.classList.toggle('active', x.dataset.m === current.method));
      if (manual.method === 'ma') {
        wrap.innerHTML = `<span>เฉลี่ย <b id="f-pv">${manual.n}</b> วัน</span><input id="f-p" type="range" min="3" max="28" step="1" value="${manual.n}">`;
        $('#f-p').oninput = e => { manual.n = Number(e.target.value); $('#f-pv').textContent = manual.n; setManual(); update(); };
      } else {
        wrap.innerHTML = `<span>น้ำหนักยอดล่าสุด (α) = <b id="f-pv">${manual.alpha.toFixed(2)}</b></span><input id="f-p" type="range" min="0.05" max="0.90" step="0.05" value="${manual.alpha}">`;
        $('#f-p').oninput = e => { manual.alpha = Number(e.target.value); $('#f-pv').textContent = manual.alpha.toFixed(2); setManual(); update(); };
      }
      $('#f-p').disabled = !['ma', 'es'].includes(current.method);
    }

    function update() {
      const p = App.product(App.selProduct);
      const series = d.dailySales[p.id];
      const fc = Calc.forecastFor(series, S, p.id);
      const m = fc.metrics;
      $('#f-manual-note').textContent = ['ma', 'es'].includes(fc.method) ? 'ปรับค่าแล้วใช้กับสินค้านี้ทันที' : `กำลังใช้ ${Calc.modelLabel(fc.method, fc.param)} เลือก MA หรือ ES ด้านบนเพื่อเปลี่ยนวิธี`;
      const comparison = Calc.compareModels(series);
      $('#f-export-models').disabled = !comparison.available;
      const metric = (value, pct = false) => value === null ? '—' : App.fmt(value, 2) + (pct ? '%' : '');
      $('#f-comparison').innerHTML = comparison.available ? `
        <div class="dss-callout"><b>แนะนำ ${App.esc(comparison.selected.label)}</b><p>คลาดเคลื่อนต่ำสุดในช่วงเลือกโมเดล (RMSE ${metric(comparison.selected.validation.rmse)})</p><p>กำลังใช้: ${App.esc(Calc.modelLabel(fc.method, fc.param))}</p>
          <div class="row-actions"><button type="button" class="btn" id="f-use-model" ${fc.method === comparison.selected.method && fc.param === comparison.selected.param ? 'disabled' : ''}>${fc.method === comparison.selected.method && fc.param === comparison.selected.param ? 'ใช้โมเดลที่แนะนำอยู่' : 'ใช้โมเดลที่แนะนำ'}</button>${S.modelChoices?.[p.id] ? '<button type="button" class="btn secondary" id="f-clear-model">คืนค่าเริ่มต้น</button>' : ''}</div></div>
        <details><summary>ดูผลเปรียบเทียบและวิธีทดสอบ</summary><p class="dss-note">ฝึกเริ่มต้น ${comparison.validationStart} วัน · เลือกโมเดล (Validation) ${d.dates[comparison.validationStart]}–${d.dates[comparison.testStart - 1]} · ทดสอบ (Test) ${d.dates[comparison.testStart]}–${d.dates.at(-1)} · ${comparison.block} วันเท่ากันทุกวิธี</p>
        <div class="table-wrap"><table><thead><tr><th>วิธี</th><th>Validation RMSE</th><th>Test MAE</th><th>Test RMSE</th><th>Test MAPE</th><th>วัน MAPE / วันทดสอบ</th></tr></thead><tbody>${comparison.rows.map(row => `<tr><td>${App.esc(row.label)} ${row.id === comparison.selected.id ? '<span class="badge green">แนะนำ</span>' : ''}</td><td>${metric(row.validation.rmse)}</td><td>${metric(row.test.mae)}</td><td>${metric(row.test.rmse)}</td><td>${metric(row.test.mape, true)}</td><td>${row.test.mapeSamples}/${row.test.samples}</td></tr>`).join('')}</tbody></table></div>
        <p class="dss-note">ไม่ใช้ผล Test เลือกโมเดล · ค่าคลาดเคลื่อนยิ่งต่ำยิ่งดี · MAPE ข้ามวันที่ยอดจริงเป็น 0 และแสดง — ถ้าคำนวณไม่ได้ · ใช้เฉพาะข้อมูลก่อนวันพยากรณ์</p></details><p class="dss-note">การเลือกโมเดลมีผลเฉพาะสินค้านี้ และคืนค่าเมื่อโหลดเว็บใหม่</p>` : `<p class="muted">${comparison.reason}</p>`;
      const confidence = Calc.forecastConfidence(series, fc, S.confidenceLevel);
      const levelText = App.fmt(confidence.level * 100) + '%';
      const intervalText = confidence.available ? `${App.fmt(Math.floor(confidence.lo))}–${App.fmt(Math.ceil(confidence.hi))} ${App.esc(p.unit)}` : 'ข้อมูลยังไม่เพียงพอ';
      const bt = confidence.backtest;
      $('#f-confidence').innerHTML = `<span class="confidence-strip-icon">${App.icon('shield')}</span><div><b>คาดขายวันถัดไป ${App.fmt(fc.d, 1)} ${App.esc(p.unit)}</b><p>ช่วงคาดการณ์ ${levelText}: ${intervalText}</p></div><div class="confidence-coverage"><b>${bt.coverage === null ? '—' : App.fmt(bt.coverage * 100, 1) + '%'}</b><span>อยู่ในช่วงย้อนหลัง ${bt.hits}/${bt.tested} วัน</span></div>`;

      $('#f-kpi').innerHTML = [
        ['blue', 'พยากรณ์ยอดขาย/วัน (d)', App.fmt(fc.d, 1), p.unit],
        ['', 'MAE', metric(m.mae), 'ค่าคลาดเคลื่อนเฉลี่ย (' + p.unit + ')'],
        ['', 'MAPE', metric(m.mape, true), `คลาดเคลื่อนเป็นร้อยละ (${m.mapeSamples}/${m.samples} วัน)`],
        ['', 'RMSE (σ)', metric(m.rmse), 'ใช้คำนวณ Safety Stock']
      ].map(([c, l, v, n]) => `<div class="kpi ${c}"><div class="label">${l}</div><div class="value">${v}</div><div class="note">${n}</div></div>`).join('');

      // กราฟ: ยอดจริง + ค่าพยากรณ์ย้อนหลัง + พยากรณ์ล่วงหน้า 14 วัน
      const futureDates = fc.future.map((_, i) => App.addDays(d.today, i));
      const labels = d.dates.concat(futureDates).map(App.shortDate.bind(App));
      const pad = new Array(fc.future.length).fill(null);
      $('#f-chart').innerHTML = Charts.line({
        ...Charts.fit($('#f-chart'), 0.36, 260, 460),
        labels, splitAt: d.dates.length,
        band: confidence.available ? { from: d.dates.length, to: d.dates.length, lo: confidence.lo, hi: confidence.hi, name: `ช่วงคาดการณ์ ${levelText} เฉพาะวันถัดไป` } : null,
        series: [
          { name: 'ยอดขายจริง', color: 'var(--chart-actual)', values: series.concat(pad), width: 1.8 },
          { name: 'ค่าพยากรณ์ย้อนหลัง (backtest)', color: 'var(--accent)', values: fc.fitted.concat(pad), width: 2.5 },
          { name: 'พยากรณ์ 14 วันข้างหน้า', color: 'var(--accent)', dash: '6 5', width: 2.5,
            values: new Array(series.length - 1).fill(null).concat([series[series.length - 1]], fc.future) }
        ]
      });

      $('#f-table').innerHTML = `<table><thead><tr><th>วันที่</th>${futureDates.map(x => `<th>${App.shortDate(x)}</th>`).join('')}</tr></thead>
        <tbody><tr><td>พยากรณ์ (${App.esc(p.unit)})</td>${fc.future.map(v => `<td>${App.fmt(v, 1)}</td>`).join('')}</tr></tbody></table>`;

    }

    syncManual(); update(); drawSaved();
  }
};
