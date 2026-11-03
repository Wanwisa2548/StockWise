// A repeatable, read-only experiment on the final historical holdout.
Pages.evaluation = {
  options: {},
  settingsFor(productId, base) {
    const options = this.options[productId] || {};
    return { ...base, serviceLevel: options.serviceLevel ?? base.serviceLevel, holdRate: options.holdRate ?? base.holdRate };
  },
  render(root) {
    const d = App.data, S = App.settings;
    if (App.selProduct === null) App.selProduct = d.products[0].id;
    const p = App.product(App.selProduct), series = d.dailySales[p.id];
    const trial = this.settingsFor(p.id, S);
    const result = Calc.evaluatePolicies(p, series, trial, this.options[p.id]);
    root.innerHTML = `${BakeryVisuals.heading('evaluation', 'เปรียบเทียบแผนสต็อก', 'ทดลองแผนสั่งคงที่เทียบกับแผน DSS โดยไม่เปลี่ยนค่าของแผนสั่งซื้อ')}
      <div class="card"><div class="controls"><label>สินค้า<select id="v-product">${App.productOptions(p.id)}</select></label></div></div>`;
    root.querySelector('#v-product').onchange = e => { App.selProduct = Number(e.target.value); this.render(root); };
    if (!result.available) { root.insertAdjacentHTML('beforeend', `<div class="card">${App.esc(result.reason)}</div>`); return; }
    const a = result.assumptions;
    root.insertAdjacentHTML('beforeend', `
      <form class="card" id="v-form"><h3>ตั้งค่าการทดลอง</h3><p class="dss-note">${d.dates[result.testStart]}–${d.dates.at(-1)} · ใช้ ${App.esc(result.selected.label)} ที่เลือกจากช่วง Validation ก่อนวันทดสอบ</p>
        <div class="controls dss-inputs">
          <label>แผนคงที่: สั่งทุกกี่วัน<input name="interval" type="number" min="1" max="30" step="1" required value="${a.interval}"></label>
          <label>แผนคงที่: จำนวนต่อครั้ง<input name="fixedQty" type="number" min="0" max="10000000" step="1" required value="${a.fixedQty}"></label>
          <label>สต็อกเริ่มต้นทั้งสองแผน<input name="initialStock" type="number" min="0" max="10000000" step="1" required value="${a.initialStock}"></label>
          <label>ต้นทุนขาดขายสมมติ €/หน่วย<input name="shortagePenalty" type="number" min="0" max="10000000" step="0.01" required value="${a.shortagePenalty.toFixed(2)}"></label>
          <label>เป้าหมายมีสินค้าพร้อมขาย<select name="serviceLevel">${[.9, .95, .99].map(v => `<option value="${v}" ${v === trial.serviceLevel ? 'selected' : ''}>${v * 100}%</option>`).join('')}</select></label>
          <label>อัตราเก็บรักษา %/ปี<input name="holdRate" type="number" min="10" max="50" step="5" required value="${trial.holdRate * 100}"></label>
          <button class="btn" type="submit">คำนวณใหม่</button><button class="btn secondary" type="button" id="v-reset">คืนค่าเริ่มต้นของสินค้า</button>
        </div>
        <p class="dss-note">ต้นทุน ${App.money(p.cost)} · ค่าสั่ง ${App.money(p.order_cost)}/ครั้ง · รอสินค้า ${p.lead_time_days} วัน · อายุ ${p.shelf_life_days} วัน</p>
      </form>
      <section class="card"><div class="bar-actions"><h3>ผลจำลอง</h3><button class="btn secondary" type="button" id="v-export">ส่งออกผล CSV</button></div>
        ${this.summary(result)}
        <p class="dss-callout">ต้นทุนรวมจำลองของ DSS ${result.dss.totalCost <= result.fixed.totalCost ? 'ต่ำกว่า' : 'สูงกว่า'} แผนคงที่ ${App.money(Math.abs(result.fixed.totalCost - result.dss.totalCost))} ภายใต้สมมติฐานนี้ ผลอาจดีขึ้นหรือแย่ลงเมื่อเปลี่ยนสินค้าและค่าตั้งต้น</p>
      </section>
      <section class="card"><h3>สต็อกปลายวันในช่วงทดสอบ</h3><div id="v-chart"></div><details><summary>ตรวจเหตุการณ์รายวัน</summary>${this.dailyTable(result, d)}</details></section>
      <details class="card formula"><summary>สมมติฐานและข้อจำกัด</summary>
        <p>ใช้ยอดขายที่สังเกตได้แทนความต้องการ จึงอาจประเมินการขาดขายต่ำกว่าจริงหากร้านเคยมีของหมด · ทั้งสองแผนเริ่มด้วยสต็อกจำลองเท่ากันและอายุเต็ม ณ วันแรก ไม่ใช้ล็อตปัจจุบันย้อนเวลา · ไม่มีใบสั่งรอรับเริ่มต้น</p>
        <p>ต้นวัน: ตัดล็อตหมดอายุ → รับสินค้า → ตัดสินใจสั่ง → ขายแบบ FEFO → คิดค่าเก็บปลายวัน · DSS สั่งเมื่อสต็อกรวมของรอรับ ≤ ROP และไม่มีใบสั่งค้าง · แผนคงที่สั่งทุก N วันตั้งแต่วันแรก</p>
        <p>ต้นทุนรวม = ค่าสั่ง + ค่าเก็บปลายวัน (สต็อก × ต้นทุน × อัตราต่อปี ÷ 365) + มูลค่าของหมดอายุ + จำนวนขาดขาย × ต้นทุนขาดขายสมมติ · ค่าเริ่มต้นต้นทุนขาดขาย = max(ราคาขาย − ราคาทุน, 0)</p>
        <p>ไม่รวมต้นทุนซื้อสินค้าที่ขายได้ ค่าแรง ค่าอบ และผลตอบสนองต่อโปรโมชั่น · สต็อกปลายช่วงและของรอรับแสดงแยก ไม่ถือว่าเป็นของเสีย · ไม่รับประกัน Service Level ที่เลือก และไม่ใช่กำไรสุทธิ · เปลี่ยนสมมติฐานหลังดู Test ถือเป็นการสำรวจ ต้องมีข้อมูลใหม่เพื่อยืนยันผล</p>
      </details>`);
    const chart = root.querySelector('#v-chart');
    chart.innerHTML = Charts.line({ ...Charts.fit(chart, .35, 240, 420), labels: d.dates.slice(result.testStart).map(date => App.shortDate(date)), series: [
      { name: 'แผนคงที่', color: 'var(--chart-actual)', values: result.fixed.rows.map(r => r.closing) },
      { name: 'DSS', color: 'var(--accent)', values: result.dss.rows.map(r => r.closing) }
    ] });
    root.querySelector('#v-form').onsubmit = e => {
      e.preventDefault();
      const values = Object.fromEntries(new FormData(e.currentTarget));
      this.options[p.id] = { ...Object.fromEntries(['interval', 'fixedQty', 'initialStock', 'shortagePenalty', 'serviceLevel'].map(key => [key, Number(values[key])])), holdRate: Number(values.holdRate) / 100 };
      this.render(root);
    };
    root.querySelector('#v-reset').onclick = () => { delete this.options[p.id]; this.render(root); };
    root.querySelector('#v-export').onclick = () => {
      const rows = [['product', 'policy', 'model', 'test_start', 'test_end', 'interval', 'fixed_qty', 'initial_stock', 'shortage_penalty_eur', 'unit_cost', 'order_cost', 'lead_days', 'shelf_days', 'service_level', 'holding_rate', 'demand_proxy', 'sold', 'shortage', 'waste', 'closing', 'pipeline', 'average_closing_stock', 'order_count', 'ordering_cost', 'holding_cost', 'waste_cost', 'shortage_cost', 'total_simulated_cost']];
      [result.fixed, result.dss].forEach(r => rows.push([p.name, r.policy, result.selected.label, d.dates[result.testStart], d.dates.at(-1), a.interval, a.fixedQty, a.initialStock, a.shortagePenalty, p.cost, p.order_cost, p.lead_time_days, p.shelf_life_days, trial.serviceLevel, trial.holdRate, r.demand, r.sold, r.shortage, r.waste, r.closing, r.pipeline, r.averageStock, r.orders, r.orderCost, r.holdingCost, r.wasteCost, r.shortageCost, r.totalCost]));
      rows.push([], ['policy', 'date', 'forecast', 'rop', 'opening_after_receipt', 'received', 'ordered', 'observed_sales', 'sold', 'shortage', 'expired', 'closing']);
      [result.fixed, result.dss].forEach(r => r.rows.forEach(day => rows.push([r.policy, d.dates[day.index], day.forecast, day.rop, day.opening, day.received, day.ordered, day.actual, day.sold, day.shortage, day.waste, day.closing])));
      App.downloadCSV(`stockwise-policy-${p.id}-${d.today}.csv`, rows);
    };
  },
  summary(result) {
    const fields = [
      ['ยอดขายที่ใช้แทนความต้องการ', 'demand'], ['ขายได้ตามยอดที่ทดสอบ', 'sold'], ['ยอดที่สต็อกรองรับไม่ได้', 'shortage'], ['ของหมดอายุ', 'waste'],
      ['สต็อกปลายวันเฉลี่ย', 'averageStock'], ['สต็อกปลายช่วง', 'closing'], ['ของรอรับปลายช่วง', 'pipeline'], ['จำนวนครั้งที่สั่ง', 'orders'],
      ['สัดส่วนยอดที่รองรับได้', 'fillRate', 'percent'], ['ค่าสั่ง', 'orderCost', 'money'], ['ค่าเก็บ', 'holdingCost', 'money'], ['มูลค่าของหมดอายุ', 'wasteCost', 'money'],
      ['ต้นทุนขาดขายสมมติ', 'shortageCost', 'money'], ['ต้นทุนรวมจำลอง', 'totalCost', 'money']
    ];
    const format = (v, type) => v === null ? '—' : type === 'money' ? App.money(v) : type === 'percent' ? App.fmt(v * 100, 1) + '%' : App.fmt(v, 2);
    const primary = ['shortage', 'waste', 'averageStock', 'fillRate', 'totalCost'];
    const table = items => `<div class="table-wrap dss-summary"><table><thead><tr><th>ตัวชี้วัด</th><th>แผนคงที่</th><th>DSS</th></tr></thead><tbody>${items.map(([label, key, type]) => `<tr><td>${label}</td><td>${format(result.fixed[key], type)}</td><td>${format(result.dss[key], type)}</td></tr>`).join('')}</tbody></table></div>`;
    return table(fields.filter(([, key]) => primary.includes(key))) + `<details class="inline-details"><summary>ดูจำนวนสินค้าและต้นทุนแยกส่วน</summary>${table(fields.filter(([, key]) => !primary.includes(key)))}</details>`;
  },
  dailyTable(result, data) {
    return `<div class="table-wrap"><table><thead><tr><th>นโยบาย</th><th>วัน</th><th>พยากรณ์</th><th>ROP</th><th>รับเข้า</th><th>สั่ง</th><th>ยอดจริง</th><th>ขายได้</th><th>ขาด</th><th>หมดอายุ</th><th>คงเหลือ</th></tr></thead><tbody>${[result.fixed, result.dss].flatMap(r => r.rows.map(day => `<tr><td>${r.policy === 'fixed' ? 'คงที่' : 'DSS'}</td><td>${data.dates[day.index]}</td>${['forecast', 'rop', 'received', 'ordered', 'actual', 'sold', 'shortage', 'waste', 'closing'].map(key => `<td>${App.fmt(day[key], 2)}</td>`).join('')}</tr>`)).join('')}</tbody></table></div>`;
  }
};
