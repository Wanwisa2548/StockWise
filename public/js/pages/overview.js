// Bakery dashboard: all metrics, comparisons and recommendations use the selected sales window.
Pages.overview = {
  period: 28,

  render(root) {
    const d = App.data, settings = App.settings;
    const fcs = Calc.forecastAll(d, settings);
    const stock = Calc.stockByProduct(d);
    const opts = { serviceLevel: settings.serviceLevel, holdRate: settings.holdRate, today: d.today };
    const plans = d.products.map(p => ({ p, pl: Calc.plan(p, fcs[p.id], stock[p.id], opts) }));
    const lotAnalysis = Calc.analyzeLots(d, fcs);
    const risky = lotAnalysis.filter(r => r.atRisk && !r.expired && !App.promoOfLot(r.lot.id));
    const expired = lotAnalysis.filter(r => r.expired);
    const orderToday = plans.filter(x => x.pl.days <= 0 && !App.pendingOrder(x.p.id));
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
    const forecastLabel = settings.method === 'ma' ? `Moving Average · ${settings.n} วัน` : `Exponential Smoothing · α ${fmt(settings.alpha, 2)}`;

    root.innerHTML = `
      <div class="page-heading">
        <div><span class="eyebrow">A FRESH PERSPECTIVE, EVERY DAY</span><h2>ภาพรวมร้านเบเกอรี่</h2><p>เข้าใจยอดขาย วางแผนให้พอดี และลดของเสียในทุกวัน</p></div>
        <div class="heading-actions"><div class="date-range">${icon('calendar')}<span>${fullRange}</span></div><button type="button" class="btn" id="export-sales">${icon('download')}ส่งออกรายงาน</button></div>
      </div>

      <div class="grid cols-4 dashboard-metrics">
        <div class="kpi primary-metric"><div class="metric-head"><span class="label">ยอดขายรวม</span><span class="metric-icon">${icon('revenue')}</span></div><div class="value">${money(revenue)}</div><div class="metric-foot">${change(revenue, previousRevenue)}</div></div>
        <div class="kpi"><div class="metric-head"><span class="label">จำนวนสินค้าที่ขาย</span><span class="metric-icon">${icon('bread')}</span></div><div class="value">${fmt(pieces)}<span class="metric-unit">ชิ้น</span></div><div class="metric-foot">${change(pieces, previousPieces)}</div></div>
        <div class="kpi"><div class="metric-head"><span class="label">จำนวนบิล</span><span class="metric-icon">${icon('receipt')}</span></div><div class="value">${fmt(receipts(rows))}<span class="metric-unit">บิล</span></div><div class="metric-foot">${change(receipts(rows), receipts(previousRows))}</div></div>
        <div class="kpi"><div class="metric-head"><span class="label">พยากรณ์วันถัดไป</span><span class="metric-icon">${icon('forecast')}</span></div><div class="value">${fmt(nextDay)}<span class="metric-unit">ชิ้น</span></div><div class="metric-foot"><span class="delta">${App.shortDate(d.today)}</span><span>· ${forecastLabel}</span></div></div>
      </div>

      <div class="dashboard-upper">
        <section class="card sales-chart-card" aria-labelledby="sales-heading">
          <div class="section-head"><div><h3 id="sales-heading">แนวโน้มยอดขาย</h3><p class="section-caption">ภาพรวมรายได้รายวันของร้าน</p></div><div class="period-switch" role="group" aria-label="ช่วงเวลาวิเคราะห์">${[7, 14, 28].map(n => `<button type="button" data-period="${n}" aria-pressed="${count === n}" class="${count === n ? 'active' : ''}">${n} วัน</button>`).join('')}</div></div>
          <div class="chart-key"><span><i></i>ช่วงที่เลือก</span><span><i class="previous"></i>ช่วงก่อนหน้า</span></div>
          <div id="overview-sales-chart"></div><div class="chart-meta"><span>รายได้ (ยูโร)</span><span>${count} วัน · ${fullRange}</span></div>
        </section>
        <section class="card decision-card" aria-labelledby="decision-heading">
          <div><div class="decision-top">${icon('sparkle')}<span>DECISION SUPPORT</span></div><h3 id="decision-heading">อบให้พอดี<br>กับความต้องการของลูกค้า</h3><p class="decision-description">คำแนะนำสำหรับ ${App.thaiDate(d.today)}<br>จากยอดขายและสต็อกปัจจุบันของร้าน</p></div>
          <div class="decision-stats"><div><strong>${orderToday.length.toString().padStart(2, '0')}</strong><small>สินค้าที่ควรสั่งวันนี้</small></div><div><strong>${(risky.length + expired.length).toString().padStart(2, '0')}</strong><small>ล็อตที่ควรดูแลก่อน</small></div></div>
          <button type="button" class="decision-button" data-go="${orderToday.length ? 'order' : risky.length + expired.length ? 'expiry' : 'forecast'}">ดูคำแนะนำการวางแผน ${icon('arrow')}</button>
        </section>
      </div>

      <div class="dashboard-lower">
        <section class="card" aria-labelledby="bestseller-heading">
          <div class="section-head"><div><h3 id="bestseller-heading">สินค้าขายดี</h3><p class="section-caption">5 อันดับตามรายได้ · ${count} วันล่าสุด</p></div><button class="text-button" type="button" data-go="sales">ดูยอดขายทั้งหมด ${icon('arrow')}</button></div>
          <div class="best-sellers">${productTotals.slice(0, 5).map(({ p, revenue: amount, qty }, i) => `<div class="best-row"><span class="best-rank">${String(i + 1).padStart(2, '0')}</span><span class="product-thumbnail">${icon('bread')}</span><div class="product-info"><b title="${esc(p.name)}">${esc(englishName(p))}</b><small>${esc(shortName(p))} · ${fmt(qty)} ${esc(p.unit)}</small></div><div class="product-revenue">${money(amount)}<small>${revenue ? fmt(amount / revenue * 100, 1) : '0'}% ของรายได้</small></div></div>`).join('')}</div>
        </section>
        <section class="card" aria-labelledby="insight-heading">
          <div class="section-head"><div><h3 id="insight-heading">ข้อมูลเล็ก ๆ เพื่อการตัดสินใจที่ดีขึ้น</h3><p class="section-caption">สิ่งที่ข้อมูลกำลังบอกคุณ</p></div>${icon('sparkle', 'insight-header-icon')}</div>
          <div class="recommend-list">
            <div class="recommendation"><span class="recommend-icon">${icon('expiry')}</span><div><h4>เตรียมพร้อมก่อน ${hh(peak)}</h4><p>ช่วง ${hh(peak)}–${hh((peak + 1) % 24)} ขายดีที่สุดใน ${count} วันที่เลือก เตรียมสินค้าและทีมให้พร้อมก่อนช่วงนี้</p></div></div>
            <div class="recommendation"><span class="recommend-icon">${icon('forecast')}</span><div><h4>${esc(shortName(topForecast.p))} มีความต้องการสูง</h4><p>คาดว่าจะขายได้ ${fmt(topForecast.pl.d)} ${esc(topForecast.p.unit)}/วัน ตรวจสอบสต็อกก่อนเริ่มวันใหม่</p></div></div>
            <div class="recommendation"><span class="recommend-icon">${icon('leaf')}</span><div><h4>${expired.length ? `นำสินค้าหมดอายุ ${expired.length} ล็อตออกก่อน` : risky.length ? `ดูแลของสด ${risky.length} ล็อตก่อน` : 'สต็อกสดใหม่ อยู่ในเกณฑ์ดี'}</h4><p>${expired.length ? 'ตรวจสอบล็อตที่หมดอายุในหน้าจัดการของใกล้หมดอายุ ก่อนจัดสินค้ารอบใหม่' : risky.length ? `คาดว่ามี ${fmt(riskPieces)} ชิ้นที่ขายไม่ทัน ลองใช้ส่วนลดตามคำแนะนำเพื่อลดของเสีย` : 'ทุกล็อตคาดว่าจะขายทันก่อนหมดอายุ ติดตามยอดขายเพื่อรักษาระดับสต็อกให้เหมาะสม'}</p></div></div>
          </div>
          <div class="model-note"><i></i>วิเคราะห์จากข้อมูลจริง · ${forecastLabel}</div>
        </section>
      </div>

      <section class="card stock-card" aria-labelledby="stock-heading"><div class="section-head"><div><h3 id="stock-heading" class="status-title">สถานะสต็อก <small>${d.products.length} รายการ</small></h3><p class="section-caption">วางแผนสำหรับ ${App.thaiDate(d.today)} · ระดับบริการ ${fmt(settings.serviceLevel * 100)}%</p></div><button type="button" class="text-button" data-go="manage">จัดการสินค้า ${icon('arrow')}</button></div>
        <div class="table-wrap"><table><thead><tr><th>สินค้า</th><th>สต็อกปัจจุบัน</th><th>ความต้องการ / วัน</th><th>สต็อกเทียบจุดสั่งซื้อ</th><th>พอขายได้</th><th>คำแนะนำ</th></tr></thead><tbody>
        ${plans.map(({ p, pl }) => {
          const cover = pl.d > 0 ? pl.stock / pl.d : null;
          const pct = pl.rop > 0 ? Math.min(100, Math.max(0, pl.stock / (pl.rop * 3) * 100)) : 100;
          const color = { red: 'var(--crit)', orange: 'var(--warn)', green: '#96a982' }[pl.status];
          return `<tr><td>${esc(englishName(p))}</td><td>${fmt(pl.stock)} <span class="muted">${esc(p.unit)}</span></td><td>${fmt(pl.d, 1)}</td><td><div class="compact-stock" title="สต็อก ${fmt(pl.stock)} · จุดสั่งซื้อ ${fmt(pl.rop, 1)}"><span style="width:${pct}%;background:${color}"></span></div></td><td>${cover === null ? '—' : fmt(cover, 1) + ' วัน'}</td><td>${App.pendingOrder(p.id) ? '<span class="badge blue">รอรับสินค้า</span>' : `<span class="badge ${pl.status}">${pl.days <= 0 ? 'ควรสั่งวันนี้' : `สั่งใน ${pl.days} วัน`}</span>`}</td></tr>`;
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
    root.querySelectorAll('[data-period]').forEach(button => button.onclick = () => {
      this.period = Number(button.dataset.period); this.render(root);
    });
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
