// หน้า 2: พยากรณ์ยอดขาย
Pages.forecast = {
  render(root) {
    const d = App.data, S = App.settings;
    if (App.selProduct === null) App.selProduct = d.products[0].id;

    root.innerHTML = `
      ${BakeryVisuals.heading('forecast', 'พยากรณ์ยอดขาย', 'มองความต้องการล่วงหน้า เพื่อเตรียมขนมอบรอบถัดไปได้พอดี · วิเคราะห์จากยอดขายจริง 56 วัน')}
      <div class="card">
        <div class="controls">
          <label>สินค้า <select id="f-prod">${App.productOptions(App.selProduct)}</select></label>
          <label>วิธีพยากรณ์
            <span class="seg" id="f-method">
              <button data-m="ma" class="${S.method === 'ma' ? 'active' : ''}">Moving Average</button>
              <button data-m="es" class="${S.method === 'es' ? 'active' : ''}">Exponential Smoothing</button>
            </span>
          </label>
          <label id="f-param-wrap"></label>
          <label>Confidence (ช่วงคาดการณ์)
            <select id="f-confidence-level">${[0.90, 0.95, 0.99].map(v => `<option value="${v}" ${S.confidenceLevel === v ? 'selected' : ''}>${v * 100}%</option>`).join('')}</select>
          </label>
        </div>
        <div id="f-kpi" class="grid cols-4"></div>
        <div id="f-confidence" class="forecast-confidence-strip"></div>
      </div>
      <section class="card"><div class="bar-actions"><h3>เปรียบเทียบและเลือกโมเดลรายสินค้า</h3><button class="btn secondary" id="f-export-models" type="button">ส่งออกผลประเมิน CSV</button></div><div id="f-comparison"></div></section>
      <div class="card"><h3>ยอดขายจริงเทียบค่าพยากรณ์ และพยากรณ์ 14 วันข้างหน้า</h3><div id="f-chart"></div></div>
      <div class="card"><h3>ค่าพยากรณ์ 14 วันข้างหน้า</h3><div class="table-wrap" id="f-table"></div></div>
      <div class="card">
        <div class="bar-actions"><h3>บันทึกผลพยากรณ์</h3>
          <button type="button" class="btn" id="f-save">บันทึกผลพยากรณ์ทุกสินค้า</button></div>
        <p class="muted" id="f-saved-note"></p>
        <div class="table-wrap" id="f-saved"></div>
      </div>`;

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
        update(); App.updateBadges(); App.toast('ใช้โมเดลที่แนะนำกับสินค้านี้ในทุกหน้าแล้ว'); return;
      }
      if (e.target.closest('#f-clear-model')) {
        delete (S.modelChoices || {})[App.selProduct]; update(); App.updateBadges(); return;
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
    $('#f-prod').onchange = e => { App.selProduct = Number(e.target.value); update(); };
    $('#f-confidence-level').onchange = e => { S.confidenceLevel = Number(e.target.value); update(); };
    $('#f-method').onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      delete (S.modelChoices || {})[App.selProduct];
      S.method = b.dataset.m; root.querySelectorAll('#f-method button').forEach(x => x.classList.toggle('active', x === b));
      drawParam(); update(); drawSaved();
    };

    function drawParam() {
      const wrap = $('#f-param-wrap');
      if (S.method === 'ma') {
        wrap.innerHTML = `<span>จำนวนวันเฉลี่ย n = <b id="f-pv">${S.n}</b></span><input id="f-p" type="range" min="3" max="28" step="1" value="${S.n}">`;
        $('#f-p').oninput = e => { delete (S.modelChoices || {})[App.selProduct]; S.n = Number(e.target.value); $('#f-pv').textContent = S.n; update(); };
      } else {
        wrap.innerHTML = `<span>ค่า α = <b id="f-pv">${S.alpha.toFixed(2)}</b></span><input id="f-p" type="range" min="0.05" max="0.90" step="0.05" value="${S.alpha}">`;
        $('#f-p').oninput = e => { delete (S.modelChoices || {})[App.selProduct]; S.alpha = Number(e.target.value); $('#f-pv').textContent = S.alpha.toFixed(2); update(); };
      }
    }

    function update() {
      const p = App.product(App.selProduct);
      const series = d.dailySales[p.id];
      const fc = Calc.forecastFor(series, S, p.id);
      const m = fc.metrics;
      const comparison = Calc.compareModels(series);
      $('#f-export-models').disabled = !comparison.available;
      const metric = (value, pct = false) => value === null ? '—' : App.fmt(value, 2) + (pct ? '%' : '');
      $('#f-comparison').innerHTML = comparison.available ? `
        <p class="dss-note">ฝึกเริ่มต้น ${comparison.validationStart} วัน · เลือกด้วย validation ${d.dates[comparison.validationStart]}–${d.dates[comparison.testStart - 1]} · ทดสอบสุดท้าย ${d.dates[comparison.testStart]}–${d.dates.at(-1)} (${comparison.block} วันเท่ากันทุกวิธี) ทุกวันใช้เฉพาะยอดก่อนหน้า</p>
        <div class="dss-callout"><b>แนะนำ ${App.esc(comparison.selected.label)}</b> เพราะ RMSE บน validation ต่ำสุด ${metric(comparison.selected.validation.rmse)} · ใช้งานขณะนี้: ${App.esc(Calc.modelLabel(fc.method, fc.param))}
          <div class="row-actions"><button type="button" class="btn" id="f-use-model">ใช้โมเดลที่แนะนำกับสินค้านี้</button><button type="button" class="btn secondary" id="f-clear-model">ใช้ค่าที่ปรับเองด้านบน</button></div></div>
        <div class="table-wrap"><table><thead><tr><th>วิธี</th><th>Validation RMSE</th><th>Test MAE</th><th>Test RMSE</th><th>Test MAPE</th><th>วัน MAPE / วันทดสอบ</th></tr></thead><tbody>${comparison.rows.map(row => `<tr><td>${App.esc(row.label)} ${row.id === comparison.selected.id ? '<span class="badge green">แนะนำ</span>' : ''}</td><td>${metric(row.validation.rmse)}</td><td>${metric(row.test.mae)}</td><td>${metric(row.test.rmse)}</td><td>${metric(row.test.mape, true)}</td><td>${row.test.mapeSamples}/${row.test.samples}</td></tr>`).join('')}</tbody></table></div>
        <p class="dss-note">ไม่ใช้ผล Test เลือกผู้ชนะ · MAPE ข้ามวันที่ยอดจริงเป็น 0 และแสดง — เมื่อไม่มีวันให้คำนวณ · ค่าด้านล่างเป็น rolling backtest ทั้งช่วงของโมเดลที่ใช้งาน จึงอาจต่างจาก Test ในตารางนี้ · การเลือกโมเดลคงอยู่ระหว่างเปลี่ยนหน้าในรอบการเปิดเว็บนี้</p>` : `<p class="muted">${comparison.reason}</p>`;
      const confidence = Calc.forecastConfidence(series, fc, S.confidenceLevel);
      const levelText = App.fmt(confidence.level * 100) + '%';
      const intervalText = confidence.available ? `${App.fmt(Math.floor(confidence.lo))}–${App.fmt(Math.ceil(confidence.hi))} ${App.esc(p.unit)}` : 'ข้อมูลยังไม่เพียงพอ';
      const bt = confidence.backtest;
      $('#f-confidence').innerHTML = `<span class="confidence-strip-icon">${App.icon('shield')}</span><div><b>Confidence ${levelText} · ช่วงคาดการณ์วันถัดไป</b><p>${intervalText} · ประมาณจาก RMSE ย้อนหลัง ${confidence.samples} จุด</p></div><div class="confidence-coverage"><b>${bt.coverage === null ? '—' : App.fmt(bt.coverage * 100, 1) + '%'}</b><span>ครอบคลุมจริงย้อนหลัง ${bt.hits}/${bt.tested} วัน</span></div>`;

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
        <tbody><tr><td>พยากรณ์ (${App.esc(p.unit)})</td>${fc.future.map(v => `<td>${App.fmt(v, 1)}</td>`).join('')}</tr><tr><td>ช่วงคาดการณ์ ${levelText}</td>${futureDates.map((_, i) => `<td>${i === 0 && confidence.available ? App.fmt(Math.floor(confidence.lo)) + '–' + App.fmt(Math.ceil(confidence.hi)) : '—'}</td>`).join('')}</tr></tbody></table><p class="muted interval-disclaimer">ช่วงคาดการณ์เป็นค่าประมาณสำหรับวันถัดไป ภายใต้สมมติฐานความคลาดเคลื่อนใกล้การแจกแจงปกติ</p>`;

    }

    drawParam(); update(); drawSaved();
  }
};
