// หน้า 3: แผนการสั่งซื้อ (EOQ, Safety Stock, ROP)
Pages.order = {
  render(root) {
    const d = App.data, S = App.settings;
    if (App.selProduct === null) App.selProduct = d.products[0].id;
    const methodName = S.method === 'ma' ? `Moving Average n=${S.n}` : `Exponential Smoothing α=${S.alpha.toFixed(2)}`;

    root.innerHTML = `
      <h2>แผนการสั่งซื้อ</h2>
      <p class="sub">ใช้ค่าพยากรณ์ (d) และ RMSE (σ) จากหน้าพยากรณ์ — วิธีที่ใช้อยู่: <b>${methodName}</b></p>
      <div class="card">
        <div class="controls">
          <label>ระดับการให้บริการ (Service Level)
            <span class="seg" id="o-sl">${[0.90, 0.95, 0.99].map(v =>
              `<button data-v="${v}" class="${S.serviceLevel === v ? 'active' : ''}">${v * 100}% (z=${Calc.Z[v]})</button>`).join('')}</span>
          </label>
          <label><span>อัตราต้นทุนเก็บรักษา = <b id="o-hv">${Math.round(S.holdRate * 100)}%</b></span>
            <input id="o-h" type="range" min="10" max="50" step="5" value="${Math.round(S.holdRate * 100)}"></label>
        </div>
        <div class="table-wrap" id="o-table"></div>
      </div>
      <div class="card">
        <div class="controls"><label>จำลองสต็อก 30 วันของสินค้า <select id="o-prod">${App.productOptions(App.selProduct)}</select></label></div>
        <div id="o-chart"></div><div id="o-orders" class="muted"></div>
      </div>
      <div class="card formula">
        d = ค่าพยากรณ์ยอดขายต่อวัน, σ = RMSE, D = d × 365, H = ราคาทุน × อัตราเก็บรักษา<br>
        EOQ = √(2DS ÷ H) โดย S = ค่าสั่งซื้อต่อครั้ง · ถ้า EOQ &gt; d × อายุสินค้า จะจำกัดจำนวนสั่งที่ d × อายุสินค้า (ปัดลง)<br>
        Safety Stock = z × σ × √L · ROP = d × L + Safety Stock · วันก่อนต้องสั่ง = floor((สต็อก − ROP) ÷ d)
      </div>`;

    const $ = id => root.querySelector(id);
    $('#o-sl').onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      S.serviceLevel = Number(b.dataset.v);
      root.querySelectorAll('#o-sl button').forEach(x => x.classList.toggle('active', x === b));
      update();
    };
    $('#o-h').oninput = e => { S.holdRate = Number(e.target.value) / 100; $('#o-hv').textContent = e.target.value + '%'; update(); };
    $('#o-prod').onchange = e => { App.selProduct = Number(e.target.value); update(); };

    function update() {
      const stock = Calc.stockByProduct(d), fcs = Calc.forecastAll(d, S);
      const opts = { serviceLevel: S.serviceLevel, holdRate: S.holdRate, today: d.today };
      const plans = d.products.map(p => ({ p, pl: Calc.plan(p, fcs[p.id], stock[p.id], opts) }));
      const label = { red: 'สั่งวันนี้', orange: 'ใกล้ต้องสั่ง', green: 'ปกติ' };

      // เรียงตามความเร่งด่วน (จำนวนวันก่อนต้องสั่งน้อยสุดขึ้นก่อน)
      const rows = plans.slice().sort((a, b) => a.pl.days - b.pl.days).map(({ p, pl }) => `
        <tr class="${pl.status === 'red' ? 'row-red' : ''}">
          <td>${App.esc(p.name)}</td>
          <td>${App.fmt(pl.d, 1)}</td><td>${App.fmt(pl.eoq)}</td>
          <td><b>${App.fmt(pl.qty)}</b> ${App.esc(p.unit)}${pl.limited ? ' <span class="badge blue">จำกัดอายุ</span>' : ''}</td>
          <td>${App.fmt(pl.safety, 1)}</td><td>${App.fmt(pl.rop, 1)}</td><td>${App.fmt(pl.stock)}</td>
          <td>${pl.days <= 0 ? 'วันนี้' : `อีก ${pl.days} วัน (${App.shortDate(pl.orderDate)})`}</td>
          <td><span class="badge ${pl.status}">${label[pl.status]}</span></td>
        </tr>`).join('');
      $('#o-table').innerHTML = `<table><thead><tr>
        <th>สินค้า</th><th>ขาย/วัน (d)</th><th>EOQ</th><th>จำนวนสั่ง</th><th>Safety Stock</th><th>ROP</th><th>สต็อก</th><th>ควรสั่งเมื่อ</th><th>สถานะ</th>
        </tr></thead><tbody>${rows}</tbody></table>`;

      // กราฟจำลองสต็อก 30 วันของสินค้าที่เลือก
      const cur = plans.find(x => x.p.id === App.selProduct), pl = cur.pl;
      const sim = Calc.simulateStock(pl, cur.p.lead_time_days, 30);
      const labels = sim.level.map((_, i) => App.shortDate(App.addDays(d.today, i)));
      const flat = v => sim.level.map(() => v);
      $('#o-chart').innerHTML = Charts.line({
        ...Charts.fit($('#o-chart'), 0.32, 240, 420),
        labels, fmt: v => App.fmt(v),
        series: [
          { name: 'สต็อกคงเหลือ', color: 'var(--accent)', values: sim.level, width: 2.2 },
          { name: `ROP (${App.fmt(pl.rop, 1)})`, color: 'var(--warn)', dash: '6 4', values: flat(pl.rop) },
          { name: `Safety Stock (${App.fmt(pl.safety, 1)})`, color: 'var(--crit)', dash: '2 3', values: flat(pl.safety) }
        ]
      });
      $('#o-orders').innerHTML = sim.orders.length
        ? 'จังหวะสั่งซื้อในช่วง 30 วัน: ' + sim.orders.map(o =>
            `สั่ง ${App.fmt(o.qty)} ${App.esc(cur.p.unit)} วันที่ ${App.shortDate(App.addDays(d.today, o.day))} (ถึง ${App.shortDate(App.addDays(d.today, o.arrive))})`).join(' · ')
        : 'ไม่ต้องสั่งซื้อภายใน 30 วัน';
    }
    update();
  }
};
