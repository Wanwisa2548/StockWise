// Bakery dashboard: all metrics, comparisons and recommendations use the selected sales window.
Pages.overview = {
  period: 28,
  workedOpen: false,
  calculationOpen: false,

  render(root) {
    const d = App.data, settings = App.settings;
    const fcs = Calc.forecastAll(d, settings);
    const plans = d.products.map(p => ({ p, pl: Calc.planFor(d, p, fcs[p.id], settings) }));
    const lotAnalysis = Calc.analyzeLots(d, fcs);
    const risky = lotAnalysis.filter(r => r.atRisk && !r.expired && !App.promoOfLot(r.lot.id));
    const expired = lotAnalysis.filter(r => r.expired);
    const orderToday = plans.filter(x => x.pl.dueToday || x.pl.review);
    const icon = App.icon.bind(App), esc = App.esc.bind(App), fmt = App.fmt.bind(App), money = App.money.bind(App);
    const count = this.period;
    const dates = d.dates.slice(-count);
    const previousDates = d.dates.slice(-count * 2, -count);
    const daySet = new Set(dates), previousSet = new Set(previousDates);
    const rows = d.transactions.filter(t => daySet.has(t.sold_at.slice(0, 10)));
    const previousRows = d.transactions.filter(t => previousSet.has(t.sold_at.slice(0, 10)));
    const sum = (items, value) => items.reduce((s, t) => s + value(t), 0);
    const revenue = sum(rows, t => t.qty * t.unit_price);
    const previousRevenue = sum(previousRows, t => t.qty * t.unit_price);
    const pieces = sum(rows, t => t.qty);
    const previousPieces = sum(previousRows, t => t.qty);
    const receipts = items => new Set(items.map(t => t.sold_at.slice(0, 10) + '|' + t.receipt_no)).size;
    const nextDay = sum(d.products, p => fcs[p.id].d);
    const hh = h => String(h).padStart(2, '0') + ':00';
    const hours = Calc.hourlyTotals(rows);
    const peak = Calc.peakHour(hours);
    const topForecast = plans.slice().sort((a, b) => b.pl.d - a.pl.d)[0];
    const riskPieces = sum(risky, r => r.unsold);
    const productTotals = d.products.map(p => {
      const sales = rows.filter(t => t.product_id === p.id);
      return { p, revenue: sum(sales, t => t.qty * t.unit_price), qty: sum(sales, t => t.qty) };
    }).sort((a, b) => b.revenue - a.revenue);
    const daily = selectedDates => selectedDates.map(date => sum(d.transactions.filter(t => t.sold_at.startsWith(date)), t => t.qty * t.unit_price));
    const currentValues = daily(dates), previousValues = daily(previousDates);
    const change = (current, previous) => {
      if (!previous) return '<span class="delta">—</span><span>ไม่มีข้อมูลเปรียบเทียบ</span>';
      const pct = (current - previous) / Math.abs(previous) * 100;
      return `<span class="delta ${pct < 0 ? 'negative' : ''}">${pct < 0 ? '↘' : '↗'} ${pct > 0 ? '+' : ''}${fmt(pct, 1)}%</span><span>เทียบ ${count} วันก่อนหน้า</span>`;
    };
    const shortName = p => p.name.replace(/\s*\([^)]*\)\s*/g, '').trim();
    const englishName = p => (p.name.match(/\(([^)]+)\)/) || [null, p.name])[1];
    const fullRange = `${App.shortDate(dates[0])} – ${App.thaiDate(dates[dates.length - 1])}`;
    const confidenceLevel = settings.confidenceLevel || 0.95;
    const confidenceLabel = fmt(confidenceLevel * 100) + '%';
    const selectedPlan = plans.find(x => x.p.id === App.selProduct) || topForecast;
    const selectedProduct = selectedPlan.p, selected = selectedPlan.pl;
    App.selProduct = selectedProduct.id;
    const confidence = Calc.forecastConfidence(d.dailySales[selectedProduct.id], fcs[selectedProduct.id], confidenceLevel);
    const totalConfidence = Calc.totalForecast(d, settings).confidence;
    const rangeText = ci => ci.available ? `${fmt(Math.floor(ci.lo))}–${fmt(Math.ceil(ci.hi))}` : '—';
    const marker = confidence.available && confidence.hi > confidence.lo ? Math.max(0, Math.min(100, (selected.d - confidence.lo) / (confidence.hi - confidence.lo) * 100)) : 50;
    const coverage = confidence.backtest;

    root.innerHTML = `
      <div class="page-heading bakery-hero">
        <div class="bakery-hero-copy"><h2>ภาพรวมร้าน</h2><p>ยอดขายและรายการที่ควรจัดการวันนี้</p>
          <div class="heading-actions"><div class="date-range">${icon('calendar')}<span>${fullRange}</span></div><button type="button" class="btn" id="export-sales">${icon('download')}ส่งออกยอดขาย CSV</button></div>
        </div>
        <div class="bakery-hero-photo"><img src="assets/bakery-editorial.jpg" alt="" width="1536" height="1024" fetchpriority="high"></div>
      </div>

      <div class="grid cols-4 dashboard-metrics">
        <div class="kpi primary-metric"><div class="metric-head"><span class="label">ยอดขายรวม</span><span class="metric-icon">${icon('revenue')}</span></div><div class="metric-value-row"><div class="value">${money(revenue)}</div>${BakeryVisuals.sparkline(currentValues)}</div><div class="metric-foot">${change(revenue, previousRevenue)}</div></div>
        <div class="kpi"><div class="metric-head"><span class="label">จำนวนสินค้าที่ขาย</span><span class="metric-icon">${icon('bag')}</span></div><div class="metric-value-row"><div class="value">${fmt(pieces)}<span class="metric-unit">ชิ้น</span></div>${BakeryVisuals.sparkline(dates.map(date => sum(rows.filter(t => t.sold_at.startsWith(date)), t => t.qty)))}</div><div class="metric-foot">${change(pieces, previousPieces)}</div></div>
        <div class="kpi"><div class="metric-head"><span class="label">จำนวนบิล</span><span class="metric-icon">${icon('receipt')}</span></div><div class="metric-value-row"><div class="value">${fmt(receipts(rows))}<span class="metric-unit">บิล</span></div>${BakeryVisuals.sparkline(dates.map(date => receipts(rows.filter(t => t.sold_at.startsWith(date)))))}</div><div class="metric-foot">${change(receipts(rows), receipts(previousRows))}</div></div>
        <div class="kpi"><div class="metric-head"><span class="label">พยากรณ์วันถัดไป</span><span class="metric-icon">${icon('oven')}</span></div><div class="metric-value-row"><div class="value">${fmt(nextDay, nextDay > 0 && nextDay < 1 ? 2 : 0)}<span class="metric-unit">หน่วยขาย</span></div><span class="forecast-motif">${icon('wheat')}</span></div><div class="metric-foot"><span class="delta">ช่วง ${confidenceLabel}</span><span>${rangeText(totalConfidence)} หน่วยขาย</span></div></div>
      </div>

      <details class="planning-section dashboard-details" ${this.calculationOpen ? 'open' : ''}><summary>ตรวจผลคำนวณรายสินค้า</summary>
        <div class="planning-section-head"><div><h3 id="planning-heading">พยากรณ์และจำนวนสั่งซื้อ</h3><p class="section-caption">${d.dates.length} วัน · วางแผน ${App.thaiDate(d.today)}</p></div><button type="button" class="btn secondary" id="export-planning">${icon('download')}ส่งออกผลคำนวณ CSV</button></div>
        <div class="planning-controls"><label>สินค้า<select id="dashboard-product">${App.productOptions(selectedProduct.id)}</select></label><span>ช่วงคาดการณ์ ${confidenceLabel}</span><button type="button" class="text-button" data-go="forecast">ตั้งค่าพยากรณ์ ${icon('arrow')}</button></div>
        <div class="planning-grid">
          <section class="card confidence-card" aria-labelledby="confidence-heading"><div class="section-head"><div><h3 id="confidence-heading">ช่วงคาดการณ์วันถัดไป</h3><p class="section-caption">${esc(englishName(selectedProduct))} · Confidence ${confidenceLabel}</p></div><span class="planning-icon">${icon('shield')}</span></div>
            <div class="interval-value" id="dashboard-interval">${rangeText(confidence)} <small>${esc(selectedProduct.unit)}</small></div>
            <div class="confidence-range" aria-hidden="true"><span style="left:${marker}%"></span></div>
            <div class="confidence-range-labels"><span>ขอบล่าง</span><b>พยากรณ์ ${fmt(selected.d, 1)} ${esc(selectedProduct.unit)}</b><span>ขอบบน</span></div>
            <div class="coverage-row"><div><span>ครอบคลุมจริงย้อนหลัง</span><b id="dashboard-coverage">${coverage.coverage === null ? '—' : fmt(coverage.coverage * 100, 1) + '%'}</b></div><small>${coverage.hits}/${coverage.tested} วันทดสอบ<br>RMSE ${fmt(confidence.rmse, 2)} · ${confidence.samples} จุดย้อนหลัง</small></div>
            <button type="button" class="text-button" data-calculation="confidence">${icon('receipt')}ดูวิธีคำนวณช่วงคาดการณ์ ${icon('arrow')}</button>
          </section>
          <section class="card eoq-card" aria-labelledby="eoq-heading"><div class="section-head"><div><h3 id="eoq-heading">EOQ และจำนวนแนะนำ</h3><p class="section-caption">${esc(englishName(selectedProduct))}</p></div><span class="planning-icon wheat">${icon('order')}</span></div>
            <div class="eoq-values"><div><span>EOQ ตามสูตร</span><strong id="dashboard-eoq">${fmt(selected.eoq, 1)}</strong><small>${esc(selectedProduct.unit)} / ครั้ง</small></div><div><span>จำนวนแนะนำหลังหักล็อตเดิม</span><strong id="dashboard-order-qty">${fmt(selected.qty)}</strong><small>${esc(selectedProduct.unit)} / ครั้ง ${selected.limited ? '<span class="badge orange">จำกัดขายทัน</span>' : ''}</small></div></div><p id="dashboard-order-status" class="dss-note">${esc(Calc.orderLabel(selected))}</p>
            <dl class="eoq-inputs"><div><dt>D · ความต้องการ / ปี</dt><dd>${fmt(selected.D, 1)} ${esc(selectedProduct.unit)}</dd></div><div><dt>S · ค่าสั่งซื้อ / ครั้ง</dt><dd>${money(selectedProduct.order_cost)}</dd></div><div><dt>H · ค่าเก็บ / หน่วย / ปี</dt><dd>${money(selected.H, 4)}</dd></div><div><dt>อายุสินค้า / Lead time</dt><dd>${selectedProduct.shelf_life_days} / ${selectedProduct.lead_time_days} วัน</dd></div><div><dt>ล็อตเดิมคาดเหลือวันรับ</dt><dd>${fmt(selected.window.arrivalStock, 2)}</dd></div><div><dt>เพดานขายทันล็อตใหม่</dt><dd>${fmt(selected.cap, 2)}</dd></div></dl>
            <button type="button" class="text-button" data-go="order">ดูแผนสั่งซื้อ ${icon('arrow')}</button>
            <button type="button" class="text-button" data-calculation="eoq">${icon('receipt')}ดูวิธีคำนวณ EOQ ${icon('arrow')}</button>
          </section>
        </div>
        <details id="calculation-workbook" class="calculation-workbook" ${this.workedOpen ? 'open' : ''}><summary><span>${icon('receipt')}แสดงวิธีคำนวณทีละขั้น</span><small>สูตร · ค่าที่แทน · ตารางตรวจย้อนหลัง · สำหรับนำเสนอ</small></summary><div class="worked-toolbar"><span>เลือกสินค้าเพื่อดูการแทนค่าและส่งออกใบคำนวณ</span><button type="button" class="btn secondary" id="export-worked-calculation">${icon('download')}บันทึกใบคำนวณออฟไลน์</button></div><div id="calculation-detail-root"></div></details>
        <details class="planning-method"><summary>ที่มาข้อมูลและสมมติฐานการคำนวณ</summary><p>ใช้ยอดขายที่นำเข้าในฐานข้อมูลช่วง ${App.thaiDate(d.dates[0])} – ${App.thaiDate(d.dates.at(-1))} จำนวน ${fmt(d.transactions.length)} รายการ และต้นทุน ค่าสั่งซื้อ อายุสินค้า จากข้อมูลสินค้าปัจจุบัน อัตราเก็บรักษา ${fmt(settings.holdRate * 100)}%/ปีเป็นค่าที่ตั้งในแผนจัดซื้อ</p><p>Confidence ${confidenceLabel} เป็นระดับเป้าหมายของช่วงคาดการณ์แบบสองด้านโดยประมาณ ภายใต้สมมติฐานความคลาดเคลื่อนใกล้การแจกแจงปกติ ส่วน Coverage เป็นผลทดสอบจริงตามลำดับเวลา โดยเริ่มทดสอบเมื่อมีความคลาดเคลื่อนก่อนหน้าอย่างน้อย 14 จุด</p><p>จำนวนแนะนำจำกัดด้วยยอดที่ล็อตใหม่คาดว่าขายทัน หลังจำลองล็อตเดิมและใบสั่งรอรับแบบ FEFO ด้วยยอดขาย d คงที่ และปัดเพดานลงก่อนเลือกจำนวนเต็ม ระดับบริการ ${fmt(settings.serviceLevel * 100)}% ใช้คำนวณ Safety Stock/ROP แยกจากระดับ Confidence</p></details>
      </details>

      <div class="dashboard-upper">
        <section class="card sales-chart-card" aria-labelledby="sales-heading">
          <div class="section-head"><div><h3 id="sales-heading">แนวโน้มยอดขาย</h3><p class="section-caption">ภาพรวมรายได้รายวันของร้าน</p></div><div class="period-switch" role="group" aria-label="ช่วงเวลาวิเคราะห์">${[7, 14, 28].map(n => `<button type="button" data-period="${n}" aria-pressed="${count === n}" class="${count === n ? 'active' : ''}">${n} วัน</button>`).join('')}</div></div>
          <div class="chart-key"><span><i></i>ช่วงที่เลือก</span><span><i class="previous"></i>ช่วงก่อนหน้า</span></div>
          <div id="overview-sales-chart"></div><div class="chart-meta"><span>รายได้ (ยูโร)</span><span>${count} วัน · ${fullRange}</span></div>
        </section>
        <section class="card decision-card" aria-labelledby="decision-heading">
          <div><h3 id="decision-heading">สิ่งที่ควรจัดการวันนี้</h3><p class="decision-description">${App.thaiDate(d.today)}</p></div>
          <div class="decision-illustration" aria-hidden="true">${BakeryVisuals.product({name:'baguette'}, 'decision-baguette')}${BakeryVisuals.product({name:'croissant'}, 'decision-croissant')}</div>
          <div class="decision-stats"><div><strong>${orderToday.length.toString().padStart(2, '0')}</strong><small>สินค้าที่ควรสั่งหรือทบทวน</small></div><div><strong>${(risky.length + expired.length).toString().padStart(2, '0')}</strong><small>ล็อตที่ควรดูแลก่อน</small></div></div>
          <button type="button" class="decision-button" data-go="${orderToday.length ? 'order' : risky.length + expired.length ? 'expiry' : 'forecast'}">ดูคำแนะนำการวางแผน ${icon('arrow')}</button>
        </section>
      </div>

      <div class="dashboard-lower">
        <section class="card" aria-labelledby="bestseller-heading">
          <div class="section-head"><div><h3 id="bestseller-heading">สินค้าขายดี</h3><p class="section-caption">5 อันดับตามรายได้ · ${count} วันล่าสุด</p></div><button class="text-button" type="button" data-go="sales">ดูยอดขายทั้งหมด ${icon('arrow')}</button></div>
          <div class="best-sellers">${productTotals.slice(0, 5).map(({ p, revenue: amount, qty }, i) => `<div class="best-row"><span class="best-rank ${i === 0 ? 'rank-first' : ''}">${i === 0 ? icon('wheat') : String(i + 1).padStart(2, '0')}</span><span class="product-thumbnail">${BakeryVisuals.product(p)}</span><div class="product-info"><b title="${esc(p.name)}">${esc(p.name)}</b><small>${fmt(qty)} ${esc(p.unit)}</small></div><div class="product-revenue">${money(amount)}<small>${revenue ? fmt(amount / revenue * 100, 1) : '0'}% ของรายได้</small></div></div>`).join('')}</div>
        </section>
        <section class="card" aria-labelledby="insight-heading">
          <div class="section-head"><div><h3 id="insight-heading">ข้อสังเกตจากข้อมูล</h3></div>${icon('sparkle', 'insight-header-icon')}</div>
          <div class="recommend-list">
            <div class="recommendation"><span class="recommend-icon">${icon('expiry')}</span><div><h4>${hours.some(v => v > 0) ? "เตรียมพร้อมก่อน " + hh(peak) : "ยังไม่พบยอดขาย"}</h4><p>${hours.some(v => v > 0) ? `ช่วง ${hh(peak)}–${hh((peak + 1) % 24)} ขายดีที่สุดใน ${count} วันที่เลือก` : "ตรวจข้อมูลยอดขายก่อนวางแผนช่วงเวลาขาย"}</p></div></div>
            <div class="recommendation"><span class="recommend-icon">${icon('forecast')}</span><div><h4>${topForecast.pl.d > 0 ? esc(shortName(topForecast.p)) + " มีความต้องการสูง" : "ยังไม่มีความต้องการที่พยากรณ์"}</h4><p>คาดว่าจะขายได้ ${fmt(topForecast.pl.d, 1)} ${esc(topForecast.p.unit)}/วัน ตรวจสอบสต็อกก่อนเริ่มวันใหม่</p></div></div>
            <div class="recommendation"><span class="recommend-icon">${icon('leaf')}</span><div><h4>${expired.length ? `นำสินค้าหมดอายุ ${expired.length} ล็อตออกก่อน` : risky.length ? `ดูแลของสด ${risky.length} ล็อตก่อน` : 'สต็อกสดใหม่ อยู่ในเกณฑ์ดี'}</h4><p>${expired.length ? 'ตรวจสอบล็อตที่หมดอายุในหน้าจัดการของใกล้หมดอายุ ก่อนจัดสินค้ารอบใหม่' : risky.length ? `คาดว่ามี ${fmt(riskPieces)} ชิ้นที่ขายไม่ทัน ลองใช้ส่วนลดตามคำแนะนำเพื่อลดของเสีย` : 'ทุกล็อตคาดว่าจะขายทันก่อนหมดอายุ ติดตามยอดขายเพื่อรักษาระดับสต็อกให้เหมาะสม'}</p></div></div>
          </div>

        </section>
      </div>

      <section class="card stock-card" aria-labelledby="stock-heading"><div class="section-head"><div><h3 id="stock-heading" class="status-title">สถานะสต็อก <small>${d.products.length} รายการ</small></h3><p class="section-caption">วางแผนสำหรับ ${App.thaiDate(d.today)} · ระดับบริการ ${fmt(settings.serviceLevel * 100)}%</p></div><button type="button" class="text-button" data-go="manage">จัดการสินค้า ${icon('arrow')}</button></div>
        <div class="table-wrap"><table><thead><tr><th>สินค้า</th><th>สต็อกใช้ได้</th><th>คาดขาย/วัน</th><th>พอขายได้</th><th>คำแนะนำ</th></tr></thead><tbody>
        ${plans.map(({ p, pl }) => {
          const cover = pl.d > 0 ? pl.stock / pl.d : null;
          return `<tr><td><span class="product-cell"><span class="table-product-art">${BakeryVisuals.product(p)}</span>${esc(englishName(p))}</span></td><td>${fmt(pl.stock)} <span class="muted">${esc(p.unit)}</span></td><td>${fmt(pl.d, 1)}</td><td>${cover === null ? '—' : fmt(cover, 1) + ' วัน'}</td><td>${App.pendingOrder(p.id) ? '<span class="badge blue">รอรับสินค้า</span>' : `<span class="badge ${pl.status}">${esc(Calc.orderLabel(pl))}</span>`}</td></tr>`;
        }).join('')}</tbody></table></div>
      </section>`;

    const chart = root.querySelector('#overview-sales-chart');
    chart.innerHTML = Charts.line({
      ...Charts.fit(chart, .36, 210, 290), labels: dates.map(date => App.shortDate(date)),
      series: [
        { name: 'ช่วงก่อนหน้า', color: 'var(--chart-actual)', values: previousValues, dash: '4 5', width: 1.5 },
        { name: 'ช่วงที่เลือก', color: '#527354', values: currentValues, width: 2.3, area: true }
      ], fmt: value => fmt(value), hideLegend: true
    });
    root.querySelectorAll('[data-go]').forEach(button => button.onclick = () => App.show(button.dataset.go));
    CalculationDetails.mount(root, Calc.calculationDetails(d, selectedProduct, settings));
    root.querySelector('.dashboard-details').addEventListener('toggle', event => { this.calculationOpen = event.target.open; });
    root.querySelector('#calculation-workbook').addEventListener('toggle', event => { this.workedOpen = event.target.open; });
    root.querySelectorAll('[data-period]').forEach(button => button.onclick = () => {
      this.period = Number(button.dataset.period); this.render(root);
    });
    root.querySelector('#dashboard-product').onchange = event => { App.selProduct = Number(event.target.value); this.render(root); };
    root.querySelector('#export-planning').onclick = () => {
      const round = value => Number.isFinite(value) ? Number(value.toFixed(6)) : '';
      const csv = [['product_id', 'product', 'unit', 'history_start', 'history_end', 'planning_date', 'method', 'parameter', 'forecast_per_day', 'confidence_level', 'prediction_lower_next_day', 'prediction_upper_next_day', 'rmse', 'backtest_samples', 'coverage_hits', 'coverage_tested', 'coverage_rate', 'annual_demand', 'unit_cost_eur', 'order_cost_eur', 'holding_rate', 'holding_cost_eur_per_unit_year', 'eoq', 'shelf_life_days', 'lead_time_days', 'recommended_quantity', 'service_level', 'safety_stock', 'reorder_point', 'stock', 'shelf_window_demand', 'projected_stock_at_arrival', 'existing_lot_sales_in_window', 'sellable_cap', 'integer_cap', 'planned_arrival', 'decision_reason', 'requires_review', 'can_order', 'projection_mode']];
      plans.forEach(({ p, pl }) => {
        const ci = Calc.forecastConfidence(d.dailySales[p.id], fcs[p.id], confidenceLevel);
        csv.push([p.id, p.name, p.unit, d.dates[0], d.dates.at(-1), d.today, fcs[p.id].method, fcs[p.id].param, round(pl.d), confidenceLevel, round(ci.lo), round(ci.hi), round(ci.rmse), ci.samples, ci.backtest.hits, ci.backtest.tested, round(ci.backtest.coverage), round(pl.D), p.cost, p.order_cost, settings.holdRate, round(pl.H), round(pl.eoq), p.shelf_life_days, p.lead_time_days, pl.qty, settings.serviceLevel, round(pl.safety), round(pl.rop), pl.stock, round(pl.window.shelfDemand), round(pl.window.arrivalStock), round(pl.window.competingSales), round(pl.cap), pl.integerCap, pl.arrivalDate, pl.reason, pl.review, pl.canOrder, pl.projectionMode]);
      });
      App.downloadCSV(`stockwise-confidence-eoq-${d.today}.csv`, csv);
      App.toast('ส่งออก Confidence และ EOQ จากข้อมูลปัจจุบันแล้ว');
    };
    root.querySelector('#export-sales').onclick = () => {
      const lines = [['date', 'revenue_eur', 'quantity', 'receipts'].join(',')];
      dates.forEach((date, i) => {
        const dayRows = rows.filter(t => t.sold_at.startsWith(date));
        lines.push([date, currentValues[i].toFixed(2), sum(dayRows, t => t.qty), receipts(dayRows)].join(','));
      });
      const url = URL.createObjectURL(new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url; link.download = `stockwise-sales-${dates[0]}-${dates[dates.length - 1]}.csv`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      App.toast('ส่งออกรายงานยอดขาย CSV แล้ว');
    };
  }
};
