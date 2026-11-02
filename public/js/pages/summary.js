// หน้า "สรุปผล" — รวมผลจากทุกหน้าไว้หน้าเดียว (อ่านอย่างเดียว ไม่มีปุ่มบันทึกข้อมูล)
// ใช้เฉพาะสูตรใน calc.js และกราฟใน charts.js ที่มีอยู่แล้ว ไม่มีสูตรใหม่ โค้ดส่วนแสดงผลคัดมาจากหน้าเดิม:
//   พยากรณ์ยอดขาย (กราฟ + Confidence ช่วงคาดการณ์ด้วย Calc.forecastConfidence / Calc.totalForecast) · วางแผนจัดซื้อ
//   จัดการของใกล้หมดอายุ · วิเคราะห์ยอดขาย (รายชั่วโมง, heatmap) · จัดกลุ่มสินค้า (K-means, Elbow)
// ค่าตั้งต้นใช้ร่วมกับหน้าอื่นผ่าน App.settings (วิธีพยากรณ์ปรับที่หน้าพยากรณ์ยอดขาย)
Pages.summary = {
  COLORS: ['var(--k1)', 'var(--k2)', 'var(--k3)', 'var(--k4)', 'var(--k5)'],

  render(root) {
    const d = App.data, S = App.settings;
    if (App.selProduct === null) App.selProduct = d.products[0].id;
    if (!S.k) S.k = 3;
    const money = App.money.bind(App);
    const hh = h => String(h).padStart(2, '0') + ':00';
    const nDays = d.dates.length;
    const dowNames = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
    const hourRange = Array.from({ length: 17 }, (_, i) => i + 6);           // 06:00–22:00 (เหมือนหน้าวิเคราะห์ยอดขาย)
    const methodName = S.method === 'ma' ? `Moving Average n=${S.n}` : `Exponential Smoothing α=${S.alpha.toFixed(2)}`;

    root.innerHTML = `
      <div class="module-heading"><div class="module-heading-copy"><span class="module-eyebrow">${App.icon('sparkle')}DECISION SUMMARY</span><h2>สรุปผลการวิเคราะห์</h2>
        <p>ผลวิเคราะห์ทั้งระบบ ณ ${App.thaiDate(d.today)} ไว้หน้าเดียว · พยากรณ์ด้วย ${App.esc(methodName)} (เปลี่ยนวิธีได้ที่หน้าพยากรณ์ยอดขาย) · ข้อมูลยอดขายย้อนหลัง ${nDays} วัน</p></div>
        <div class="module-illustration">${BakeryVisuals.scene('forecast')}</div></div>
      <div class="card">
        <div class="controls">
          <label>Confidence (ช่วงคาดการณ์)
            <select id="sm-cl">${[0.90, 0.95, 0.99].map(v => `<option value="${v}" ${S.confidenceLevel === v ? 'selected' : ''}>${v * 100}%</option>`).join('')}</select></label>
          <label>ระดับการให้บริการ (Service Level) — ใช้กับ Safety Stock
            <span class="seg" id="sm-sl">${[0.90, 0.95, 0.99].map(v => `<button type="button" data-v="${v}">${Math.round(v * 100)}% (z=${Calc.Z[v]})</button>`).join('')}</span></label>
          <label>จำนวนกลุ่ม (k)
            <span class="seg" id="sm-k">${[2, 3, 4, 5].map(k => `<button type="button" data-k="${k}">${k}</button>`).join('')}</span></label>
          <label>สินค้าในกราฟพยากรณ์ <select id="sm-prod">${App.productOptions(App.selProduct)}</select></label>
        </div>
      </div>

      <div id="sm-warn"></div>
      <div id="sm-body">
      <div id="sm-kpi"></div>

      <div class="card">
        <div class="bar-actions"><h3>1. พยากรณ์ยอดขายพร้อม Confidence</h3>
          <button type="button" class="btn secondary go" data-go="forecast">ดูหน้าพยากรณ์</button></div>
        <div id="sm-fc-kpi" class="grid cols-4" style="margin-bottom:0"></div>
        <div id="sm-confidence" class="forecast-confidence-strip"></div>
        <div id="sm-fc-chart"></div>
        <div class="table-wrap" id="sm-fc-table"></div>
      </div>

      <div class="card">
        <div class="bar-actions"><h3>2. วางแผนจัดซื้อ</h3>
          <button type="button" class="btn secondary go" data-go="order">ดูหน้าวางแผนจัดซื้อ</button></div>
        <div class="table-wrap" id="sm-order"></div>
      </div>

      <div class="card">
        <div class="bar-actions"><h3>3. สินค้าใกล้หมดอายุ</h3>
          <button type="button" class="btn secondary go" data-go="expiry">ดูหน้าจัดการของใกล้หมดอายุ</button></div>
        <div id="sm-expiry"></div>
      </div>

      <div class="card">
        <div class="bar-actions"><h3>4. ยอดขายเฉลี่ยรายชั่วโมง (ทุกสินค้า)</h3>
          <button type="button" class="btn secondary go" data-go="sales">ดูหน้าวิเคราะห์ยอดขาย</button></div>
        <div id="sm-hour-kpi" class="grid cols-4" style="margin-bottom:0"></div>
        <div id="sm-bars"></div>
        <h3>Heatmap ยอดขายเฉลี่ย วัน × ชั่วโมง (ชิ้น)</h3>
        <div id="sm-heat"></div>
      </div>

      <div class="card">
        <div class="bar-actions"><h3>5. จัดกลุ่มสินค้า (K-means)</h3>
          <button type="button" class="btn secondary go" data-go="cluster">ดูหน้าจัดกลุ่มสินค้า</button></div>
        <span id="sm-elbow" class="muted"></span>
        <div class="grid cols-2" style="margin-bottom:0">
          <div><h3>กราฟกระจาย: ยอดขายต่อวัน × อายุสินค้า</h3><div id="sm-scatter"></div></div>
          <div><h3>กราฟ Elbow (SSE ที่แต่ละ k)</h3><div id="sm-elbow-chart"></div></div>
        </div>
        <div id="sm-groups" class="grid cols-3" style="margin-bottom:0"></div>
      </div>
      </div>`;

    const $ = sel => root.querySelector(sel);

    root.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.go) App.show(b.dataset.go);
      else if (b.dataset.v) { S.serviceLevel = Number(b.dataset.v); update(); }
      else if (b.dataset.k) { S.k = Number(b.dataset.k); update(); }
    };
    $('#sm-prod').onchange = e => { App.selProduct = Number(e.target.value); update(); };
    $('#sm-cl').onchange = e => { S.confidenceLevel = Number(e.target.value); update(); };

    const update = () => {
      root.querySelectorAll('#sm-sl button').forEach(b => b.classList.toggle('active', Number(b.dataset.v) === S.serviceLevel));
      root.querySelectorAll('#sm-k button').forEach(b => b.classList.toggle('active', Number(b.dataset.k) === S.k));

      // ไม่มียอดขายเลยในช่วงวันที่ที่ระบบดึง (มักเกิดเมื่อ SIM_TODAY ไม่ตรงกับวันที่ในตาราง sales_transactions)
      const noSales = !d.products.some(q => d.dailySales[q.id].some(v => v > 0));
      $('#sm-warn').innerHTML = noSales
        ? `<div class="error">ไม่พบยอดขายในช่วง ${App.thaiDate(d.dates[0])} – ${App.thaiDate(d.dates[nDays - 1])} จึงสรุปผลไม่ได้ — ระบบดึงยอดขายย้อนหลัง ${nDays} วันก่อนวันจำลอง (SIM_TODAY = ${App.thaiDate(d.today)}) ให้ตรวจว่าค่า SIM_TODAY ใน .env ตรงกับวันที่ในตาราง sales_transactions</div>` : '';
      $('#sm-body').hidden = noSales;
      if (noSales) return;

      // ---------- คำนวณ (สูตรเดิมทั้งหมด) ----------
      const fcs = Calc.forecastAll(d, S);
      const stock = Calc.stockByProduct(d);
      const opts = { serviceLevel: S.serviceLevel, holdRate: S.holdRate, today: d.today };
      const plans = d.products.map(p => ({ p, pl: Calc.plan(p, fcs[p.id], stock[p.id], opts) }));
      const lots = Calc.analyzeLots(d, fcs);
      const risky = lots.filter(r => r.atRisk && !r.expired && !App.promoOfLot(r.lot.id));   // ยังไม่ได้ตั้งโปร (นิยามเดียวกับหน้าภาพรวม)
      const orderToday = plans.filter(x => x.pl.days <= 0 && !App.pendingOrder(x.p.id));    // ยังไม่ได้สั่ง
      const stockValue = d.lots.reduce((s, l) => s + l.qty_remaining * App.product(l.product_id).cost, 0);
      const riskValue = risky.reduce((s, r) => s + r.riskValue, 0);
      const riskPieces = risky.reduce((s, r) => s + r.unsold, 0);
      // K-means ใช้ log10 ของยอดขายพยากรณ์ ถ้ามีสินค้าที่พยากรณ์เป็น 0 จะคำนวณไม่ได้ (ฟังก์ชันเดิม)
      const km = d.products.every(q => fcs[q.id].d > 0) ? Calc.clusterProducts(d, fcs, S.k) : null;
      const avgMape = d.products.reduce((s, p) => s + fcs[p.id].metrics.mape, 0) / d.products.length;
      const tf = Calc.totalForecast(d, S);                        // พยากรณ์ยอดขายรวมทั้งร้าน + Confidence (ฟังก์ชันเดิม)
      const levelText = App.fmt(S.confidenceLevel * 100) + '%';
      const range = c => c.available ? `${App.fmt(Math.floor(c.lo))}–${App.fmt(Math.ceil(c.hi))}` : null;

      // ---------- KPI ----------
      const kpi = (c, l, v, n) => `<div class="kpi ${c}"><div class="label">${l}</div><div class="value">${v}</div><div class="note">${n}</div></div>`;
      const tbt = tf.confidence.backtest, tcov = tbt.coverage === null ? null : tbt.coverage * 100;
      const covDiff = tcov === null ? 0 : tcov - S.confidenceLevel * 100;
      $('#sm-kpi').innerHTML = `
        <div class="grid cols-4">
          ${kpi(orderToday.length ? 'red' : 'green', 'ต้องสั่งวันนี้', orderToday.length, 'รายการสินค้า')}
          ${kpi(risky.length ? 'orange' : 'green', 'ควรจัดโปร', risky.length, `ล็อต · ${App.fmt(riskPieces)} ชิ้น`)}
          ${kpi('blue', 'มูลค่าสต็อก', money(stockValue), 'คิดที่ราคาทุน')}
          ${kpi(riskValue ? 'red' : 'green', 'มูลค่าเสี่ยงเสีย', money(riskValue), 'ของที่คาดว่าขายไม่ทันก่อนหมดอายุ')}
        </div>
        <div class="grid cols-4">
          ${kpi('blue', 'พยากรณ์ยอดขายรวม/วัน', App.fmt(tf.forecast.d, 1), range(tf.confidence) ? `ช่วงคาดการณ์ ${levelText} วันถัดไป: ${range(tf.confidence)} ชิ้น` : 'ข้อมูลยังไม่เพียงพอ')}
          ${kpi(tcov === null ? '' : covDiff >= -5 ? 'green' : covDiff >= -15 ? 'orange' : 'red', 'ครอบคลุมจริงย้อนหลัง', tcov === null ? '—' : App.fmt(tcov, 1) + '%', `ยอดรวมทั้งร้าน ${tbt.hits}/${tbt.tested} วัน (เป้าหมาย ≈ ${levelText})`)}
          ${kpi('', 'MAPE เฉลี่ยทุกสินค้า', App.fmt(avgMape, 1) + '%', `ย้อนหลัง ${nDays} วัน ค่าเฉลี่ยของ MAPE รายสินค้า`)}
          ${kpi('', 'จัดกลุ่มสินค้า (K-means)', `k = ${S.k}`, km ? `Elbow แนะนำ k = ${km.elbow} · ${km.groups.length} กลุ่ม` : 'จัดกลุ่มไม่ได้')}
        </div>`;

      // ---------- 1) พยากรณ์ + Confidence (คัดจากหน้าพยากรณ์ยอดขาย) ----------
      const p = App.product(App.selProduct), series = d.dailySales[p.id], fc = fcs[p.id], m = fc.metrics;
      const confidence = Calc.forecastConfidence(series, fc, S.confidenceLevel), bt = confidence.backtest;
      $('#sm-fc-kpi').innerHTML = [
        ['blue', 'พยากรณ์ยอดขาย/วัน (d)', App.fmt(fc.d, 1), p.unit],
        ['', 'MAE', App.fmt(m.mae, 2), 'ค่าคลาดเคลื่อนเฉลี่ย (' + p.unit + ')'],
        ['', 'MAPE', App.fmt(m.mape, 1) + '%', 'คลาดเคลื่อนเป็นร้อยละ'],
        ['', 'RMSE (σ)', App.fmt(m.rmse, 1), 'ใช้คำนวณ Safety Stock']
      ].map(([c, l, v, n]) => kpi(c, l, v, n)).join('');
      $('#sm-confidence').innerHTML = `<span class="confidence-strip-icon">${App.icon('shield')}</span><div><b>Confidence ${levelText} · ช่วงคาดการณ์วันถัดไป</b><p>${range(confidence) ? range(confidence) + ' ' + App.esc(p.unit) : 'ข้อมูลยังไม่เพียงพอ'} · ประมาณจาก RMSE ย้อนหลัง ${confidence.samples} จุด</p></div><div class="confidence-coverage"><b>${bt.coverage === null ? '—' : App.fmt(bt.coverage * 100, 1) + '%'}</b><span>ครอบคลุมจริงย้อนหลัง ${bt.hits}/${bt.tested} วัน</span></div>`;

      const futureDates = fc.future.map((_, i) => App.addDays(d.today, i));
      const labels = d.dates.concat(futureDates).map(App.shortDate.bind(App));
      const pad = new Array(fc.future.length).fill(null);
      $('#sm-fc-chart').innerHTML = Charts.line({
        ...Charts.fit($('#sm-fc-chart'), 0.36, 260, 460),
        labels, splitAt: d.dates.length,
        band: confidence.available ? { from: d.dates.length, to: d.dates.length, lo: confidence.lo, hi: confidence.hi, name: `ช่วงคาดการณ์ ${levelText} เฉพาะวันถัดไป` } : null,
        series: [
          { name: 'ยอดขายจริง', color: 'var(--chart-actual)', values: series.concat(pad), width: 1.8 },
          { name: 'ค่าพยากรณ์ย้อนหลัง (backtest)', color: 'var(--accent)', values: fc.fitted.concat(pad), width: 2.5 },
          { name: 'พยากรณ์ 14 วันข้างหน้า', color: 'var(--accent)', dash: '6 5', width: 2.5,
            values: new Array(series.length - 1).fill(null).concat([series[series.length - 1]], fc.future) }
        ]
      });

      $('#sm-fc-table').innerHTML = `<table><thead><tr><th>สินค้า</th><th>พยากรณ์/วัน (d)</th><th>ช่วงคาดการณ์วันถัดไป ${levelText}</th><th>ครอบคลุมจริงย้อนหลัง</th><th>MAE</th><th>MAPE</th><th>RMSE</th></tr></thead><tbody>
        ${d.products.map(q => { const f = fcs[q.id], c = Calc.forecastConfidence(d.dailySales[q.id], f, S.confidenceLevel);
          return `<tr><td>${BakeryVisuals.productCell(q)}</td><td>${App.fmt(f.d, 1)} ${App.esc(q.unit)}</td>
            <td>${range(c) || '—'}</td><td>${c.backtest.coverage === null ? '—' : App.fmt(c.backtest.coverage * 100, 1) + '%'}</td>
            <td>${App.fmt(f.metrics.mae, 2)}</td><td>${App.fmt(f.metrics.mape, 1)}%</td><td>${App.fmt(f.metrics.rmse, 1)}</td></tr>`; }).join('')}
        </tbody></table>`;

      // ---------- 2) วางแผนจัดซื้อ (คัดจากหน้าวางแผนจัดซื้อ ไม่มีปุ่มสั่งซื้อ) ----------
      const label = { red: 'สั่งวันนี้', orange: 'ใกล้ต้องสั่ง', green: 'ปกติ' };
      $('#sm-order').innerHTML = `<table><thead><tr>
        <th>สินค้า</th><th>ขาย/วัน (d)</th><th>EOQ</th><th>จำนวนสั่ง</th><th>Safety Stock</th><th>ROP</th><th>สต็อก</th><th>ควรสั่งเมื่อ</th><th>สถานะ</th></tr></thead><tbody>
        ${plans.slice().sort((a, b) => a.pl.days - b.pl.days).map(({ p: q, pl }) => { const po = App.pendingOrder(q.id);
          return `<tr class="${pl.status === 'red' && !po ? 'row-red' : ''}">
            <td>${BakeryVisuals.productCell(q)}</td><td>${App.fmt(pl.d, 1)}</td><td>${App.fmt(pl.eoq)}</td>
            <td><b>${App.fmt(pl.qty)}</b> ${App.esc(q.unit)}${pl.limited ? ' <span class="badge blue">จำกัดอายุ</span>' : ''}</td>
            <td>${App.fmt(pl.safety, 1)}</td><td>${App.fmt(pl.rop, 1)}</td><td>${App.fmt(pl.stock)}</td>
            <td>${pl.days <= 0 ? 'วันนี้' : `อีก ${pl.days} วัน (${App.shortDate(pl.orderDate)})`}</td>
            <td>${po ? `<span class="badge blue">สั่งแล้ว · ถึง ${App.shortDate(po.expected_date)}</span>` : `<span class="badge ${pl.status}">${label[pl.status]}</span>`}</td></tr>`; }).join('')}
        </tbody></table>`;

      // ---------- 3) ใกล้หมดอายุ (คัดจากหน้าจัดการของใกล้หมดอายุ ไม่มีปุ่มตั้งโปร) ----------
      const riskyAll = lots.filter(r => r.atRisk && !r.expired);
      const expired = lots.filter(r => r.expired);
      $('#sm-expiry').innerHTML = `
        <div class="grid cols-4" style="margin-bottom:12px">
          ${kpi('orange', 'ล็อตที่ควรจัดโปร', riskyAll.length, 'ล็อตที่ขายไม่ทัน')}
          ${kpi('orange', 'จำนวนที่ขายไม่ทัน', App.fmt(riskyAll.reduce((s, r) => s + r.unsold, 0)), 'ชิ้น')}
          ${kpi('red', 'มูลค่าเสี่ยงเสีย', money(riskyAll.reduce((s, r) => s + r.riskValue, 0)), 'คิดที่ราคาทุน')}
          ${kpi(expired.length ? 'red' : 'green', 'หมดอายุแล้ว (ต้องนำออก)', expired.length, 'ล็อต')}
        </div>
        ${riskyAll.length ? `<ul class="todo">${riskyAll.map(r => `
          <li><span class="dot ${r.discountPct >= 50 ? 'red' : 'orange'}"></span><div>
            <b>${App.esc(r.product.name)}</b> ล็อต #${r.lot.id} (เหลือ ${r.lot.days_left} วัน, ${App.fmt(r.lot.qty_remaining)} ${App.esc(r.product.unit)})<br>
            ขายทัน ${App.fmt(r.sellable)} · <b>ขายไม่ทัน ${App.fmt(r.unsold)}</b> →
            ${r.promoPrice !== null
              ? `<b>${r.action}</b> เหลือ ${money(r.promoPrice)} (จาก ${money(r.product.price)}) เริ่มโปรตั้งแต่ <b>${hh(r.startHour)}</b>`
              : 'เฝ้าระวัง (ยังไม่ถึงเกณฑ์ลดราคา)'}
          </div>${App.promoOfLot(r.lot.id) ? '<span class="badge blue" style="margin-left:auto">ตั้งโปรแล้ว</span>' : ''}</li>`).join('')}</ul>` : '<p class="muted">ทุกล็อตขายทันก่อนหมดอายุ</p>'}`;

      // ---------- 4) ยอดขายรายชั่วโมง + heatmap (คัดจากหน้าวิเคราะห์ยอดขาย เลือก "ทุกสินค้า") ----------
      const hours = Calc.hourlyTotals(d.transactions, 0);
      const totalHours = hours.reduce((a, b) => a + b, 0);
      if (!totalHours) {
        $('#sm-hour-kpi').innerHTML = ''; $('#sm-heat').innerHTML = '';
        $('#sm-bars').innerHTML = '<p class="muted">ยังไม่มีรายการขายให้วิเคราะห์รายชั่วโมง</p>';
      } else {
        const peak = Calc.peakHour(hours), start = Calc.promoStartHour(hours);
        $('#sm-hour-kpi').innerHTML = `
          <div class="kpi blue"><div class="label">ชั่วโมงขายดีที่สุด</div><div class="value">${hh(peak)}</div><div class="note">เฉลี่ย ${App.fmt(hours[peak] / nDays, 1)} ชิ้น/วัน</div></div>
          <div class="kpi orange"><div class="label">เวลาเริ่มโปรที่เหมาะสม</div><div class="value">${start === null ? '-' : hh(start)}</div><div class="note">หลังจากนี้ยังเหลือยอดขาย ≥ 40% ของวัน</div></div>
          <div class="kpi"><div class="label">ยอดขายเฉลี่ยต่อวัน</div><div class="value">${App.fmt(totalHours / nDays, 1)}</div><div class="note">ชิ้น</div></div>`;
        const hl = { [peak - 6]: 'var(--accent)' }; if (start !== null) hl[start - 6] = 'var(--warn)';
        $('#sm-bars').innerHTML = Charts.bars({
          ...Charts.fit($('#sm-bars'), 0.28, 220, 380),
          labels: hourRange.map(h => String(h)), values: hourRange.map(h => hours[h] / nDays),
          color: 'color-mix(in srgb, var(--accent) 55%, var(--surface))', highlight: hl, fmt: v => App.fmt(v, v < 10 ? 1 : 0)
        }) + `<div class="legend"><span><i class="lg-box" style="background:var(--accent)"></i>ชั่วโมงขายดีที่สุด</span><span><i class="lg-box" style="background:var(--warn)"></i>เวลาเริ่มโปร</span></div>`;
        const mat = Calc.hourlyByWeekday(d, 0).map(row => hourRange.map(h => row[h]));
        $('#sm-heat').innerHTML = Charts.heatmap({ width: Charts.fit($('#sm-heat'), 1, 300, 300).width, rowLabels: dowNames, colLabels: hourRange.map(String), matrix: mat });
      }

      // ---------- 5) K-means (คัดจากหน้าจัดกลุ่มสินค้า ไม่มีปุ่มบันทึก) ----------
      if (!km) {
        $('#sm-elbow').innerHTML = '';
        $('#sm-scatter').innerHTML = '<p class="muted">จัดกลุ่มไม่ได้ เพราะมีสินค้าที่พยากรณ์ยอดขายเป็น 0 — ตรวจยอดขายของสินค้านั้นในช่วงวันที่ที่ระบบดึง</p>';
        $('#sm-elbow-chart').innerHTML = ''; $('#sm-groups').innerHTML = '';
        return;
      }
      const C = this.COLORS, short = n => n.length > 14 ? n.slice(0, 13) + '…' : n;
      $('#sm-elbow').innerHTML = `Elbow แนะนำ k = <b>${km.elbow}</b> · ตอนนี้เลือก k = <b>${S.k}</b>`;
      $('#sm-scatter').innerHTML = Charts.scatterLog({
        xLabel: 'ยอดขาย/วัน', yLabel: 'อายุสินค้า (วัน)', ...Charts.fit($('#sm-scatter'), 0.75, 320, 520),
        points: d.products.map((q, i) => ({ x: km.sales[i], y: km.life[i], label: short(q.name), color: C[km.assign[i]] })),
        centers: km.groups.map(g => ({ x: g.gmSales, y: g.gmLife, color: C[g.id] }))
      }) + `<div class="legend">${km.groups.map(g => `<span><i class="lg-box" style="background:${C[g.id]}"></i>${g.name}</span>`).join('')}<span>◇ จุดศูนย์กลางกลุ่ม</span></div>`;
      $('#sm-elbow-chart').innerHTML = Charts.line({
        labels: km.sseByK.map((_, i) => 'k=' + (i + 1)), fmt: v => App.fmt(v, 1), ...Charts.fit($('#sm-elbow-chart'), 0.75, 320, 520),
        series: [{ name: 'SSE', color: 'var(--ink)', values: km.sseByK, width: 2.4 }]
      }) + `<p class="muted">SSE k=1…6: ${km.sseByK.map(v => App.fmt(v, 2)).join(', ')}</p>`;
      $('#sm-groups').innerHTML = km.groups.map(g => `
        <div class="card" style="border-top:4px solid ${C[g.id]};margin:0">
          <div class="cluster-family-art">${g.members.slice(0, 3).map(q => BakeryVisuals.product(q)).join('')}</div><h3>${g.name}</h3>
          <p>${g.members.map(q => `<span class="badge gray">${App.esc(q.name)}</span>`).join(' ')}</p>
          <p class="muted">ยอดขายเฉลี่ย (geo mean) ${App.fmt(g.gmSales, 1)} ชิ้น/วัน · อายุเฉลี่ย ${App.fmt(g.gmLife, 1)} วัน</p>
          <p><b>นโยบายที่แนะนำ:</b> ${g.policy}</p>
        </div>`).join('');
    };
    update();
  }
};
