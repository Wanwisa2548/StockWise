// หน้า 2: พยากรณ์ยอดขาย
Pages.forecast = {
  render(root) {
    const d = App.data, S = App.settings;
    if (App.selProduct === null) App.selProduct = d.products[0].id;

    root.innerHTML = `
      <h2>พยากรณ์ยอดขาย</h2>
      <p class="sub">เลือกสินค้าและวิธีพยากรณ์ ระบบทดสอบย้อนหลังแบบ one-step-ahead กับยอดขายจริง 56 วัน</p>
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
        </div>
        <div id="f-kpi" class="grid cols-4"></div>
      </div>
      <div class="card"><h3>ยอดขายจริงเทียบค่าพยากรณ์ และพยากรณ์ 14 วันข้างหน้า</h3><div id="f-chart"></div></div>
      <div class="card"><h3>ค่าพยากรณ์ 14 วันข้างหน้า</h3><div class="table-wrap" id="f-table"></div></div>
      <div class="card">
        <div class="bar-actions"><h3>บันทึกผลพยากรณ์</h3>
          <button type="button" class="btn" id="f-save">บันทึกผลพยากรณ์ทุกสินค้า</button></div>
        <p class="muted" id="f-saved-note"></p>
        <div class="table-wrap" id="f-saved"></div>
      </div>
      <div class="card formula" id="f-formula"></div>`;

    // ผลพยากรณ์ชุดล่าสุดที่บันทึกไว้ในฐานข้อมูล (ตาราง forecasts)
    const drawSaved = () => {
      const rows = d.forecasts;
      if (!rows.length) { $('#f-saved-note').textContent = 'ยังไม่เคยบันทึก — กดปุ่มด้านบนเพื่อเก็บผลพยากรณ์ของสินค้าทุกชิ้นตามวิธีและค่าที่เลือกอยู่'; $('#f-saved').innerHTML = ''; return; }
      const f = rows[0];
      $('#f-saved-note').textContent = `บันทึกล่าสุด: ${App.thaiDate(f.run_date)} · ${f.method === 'ma' ? 'Moving Average n=' + f.param : 'Exponential Smoothing α=' + f.param.toFixed(2)} · ${rows.length} สินค้า`;
      $('#f-saved').innerHTML = `<table><thead><tr><th>สินค้า</th><th>พยากรณ์/วัน</th><th>MAE</th><th>MAPE</th><th>RMSE</th></tr></thead><tbody>
        ${rows.slice().sort((a, b) => a.product_id - b.product_id).map(r => `<tr><td>${App.esc(App.product(r.product_id).name)}</td><td>${App.fmt(r.daily_forecast, 1)}</td><td>${App.fmt(r.mae, 2)}</td><td>${App.fmt(r.mape, 1)}%</td><td>${App.fmt(r.rmse, 1)}</td></tr>`).join('')}</tbody></table>`;
    };
    root.onclick = e => {
      const b = e.target.closest('#f-save'); if (!b) return;
      const fcs = Calc.forecastAll(d, S);
      const items = d.products.map(p => ({ product_id: p.id, daily_forecast: fcs[p.id].d, mae: fcs[p.id].metrics.mae, mape: fcs[p.id].metrics.mape, rmse: fcs[p.id].metrics.rmse }));
      const param = S.method === 'es' ? S.alpha : S.n;
      App.act(b, () => App.api('POST', '/api/forecasts', { method: S.method, param, items }), 'บันทึกผลพยากรณ์ลงฐานข้อมูลแล้ว');
    };

    const $ = id => root.querySelector(id);
    $('#f-prod').onchange = e => { App.selProduct = Number(e.target.value); update(); };
    $('#f-method').onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      S.method = b.dataset.m; root.querySelectorAll('#f-method button').forEach(x => x.classList.toggle('active', x === b));
      drawParam(); update(); drawSaved();
    };

    function drawParam() {
      const wrap = $('#f-param-wrap');
      if (S.method === 'ma') {
        wrap.innerHTML = `<span>จำนวนวันเฉลี่ย n = <b id="f-pv">${S.n}</b></span><input id="f-p" type="range" min="3" max="28" step="1" value="${S.n}">`;
        $('#f-p').oninput = e => { S.n = Number(e.target.value); $('#f-pv').textContent = S.n; update(); };
      } else {
        wrap.innerHTML = `<span>ค่า α = <b id="f-pv">${S.alpha.toFixed(2)}</b></span><input id="f-p" type="range" min="0.05" max="0.90" step="0.05" value="${S.alpha}">`;
        $('#f-p').oninput = e => { S.alpha = Number(e.target.value); $('#f-pv').textContent = S.alpha.toFixed(2); update(); };
      }
    }

    function update() {
      const p = App.product(App.selProduct);
      const series = d.dailySales[p.id];
      const fc = Calc.forecast(series, S.method, S.method === 'es' ? S.alpha : S.n);
      const m = fc.metrics;

      $('#f-kpi').innerHTML = [
        ['blue', 'พยากรณ์ยอดขาย/วัน (d)', App.fmt(fc.d, 1), p.unit],
        ['', 'MAE', App.fmt(m.mae, 2), 'ค่าคลาดเคลื่อนเฉลี่ย (' + p.unit + ')'],
        ['', 'MAPE', App.fmt(m.mape, 1) + '%', 'คลาดเคลื่อนเป็นร้อยละ'],
        ['', 'RMSE (σ)', App.fmt(m.rmse, 1), 'ใช้คำนวณ Safety Stock']
      ].map(([c, l, v, n]) => `<div class="kpi ${c}"><div class="label">${l}</div><div class="value">${v}</div><div class="note">${n}</div></div>`).join('');

      // กราฟ: ยอดจริง + ค่าพยากรณ์ย้อนหลัง + พยากรณ์ล่วงหน้า 14 วัน
      const futureDates = fc.future.map((_, i) => App.addDays(d.today, i));
      const labels = d.dates.concat(futureDates).map(App.shortDate.bind(App));
      const pad = new Array(fc.future.length).fill(null);
      $('#f-chart').innerHTML = Charts.line({
        ...Charts.fit($('#f-chart'), 0.36, 260, 460),
        labels, splitAt: d.dates.length,
        band: { from: d.dates.length, lo: fc.d - Calc.Z[S.serviceLevel] * m.rmse, hi: fc.d + Calc.Z[S.serviceLevel] * m.rmse },
        series: [
          { name: 'ยอดขายจริง', color: 'var(--chart-actual)', values: series.concat(pad), width: 1.8 },
          { name: 'ค่าพยากรณ์ย้อนหลัง (backtest)', color: 'var(--accent)', values: fc.fitted.concat(pad), width: 2.5 },
          { name: 'พยากรณ์ 14 วันข้างหน้า', color: 'var(--accent)', dash: '6 5', width: 2.5,
            values: new Array(series.length - 1).fill(null).concat([series[series.length - 1]], fc.future) }
        ]
      });

      $('#f-table').innerHTML = `<table><thead><tr><th>วันที่</th>${futureDates.map(x => `<th>${App.shortDate(x)}</th>`).join('')}</tr></thead>
        <tbody><tr><td>พยากรณ์ (${p.unit})</td>${fc.future.map(v => `<td>${App.fmt(v, 1)}</td>`).join('')}</tr></tbody></table>`;

      $('#f-formula').innerHTML = S.method === 'ma'
        ? `Moving Average: ค่าพยากรณ์ของวันถัดไป = ค่าเฉลี่ยยอดขาย ${S.n} วันล่าสุด (ตัวอย่าง: ${series.slice(-S.n).slice(-7).join(', ')}${S.n > 7 ? ' …' : ''} → d = ${App.fmt(fc.d, 1)})`
        : `Exponential Smoothing: ระดับใหม่ = α × ยอดจริง + (1 − α) × ระดับเดิม, α = ${S.alpha.toFixed(2)} ยิ่ง α สูงยิ่งตามยอดล่าสุดเร็ว`;
    }

    drawParam(); update();
  }
};
