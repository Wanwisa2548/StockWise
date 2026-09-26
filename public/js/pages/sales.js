// หน้า 5: รายการขาย (Timestamp) — ยอดรายชั่วโมง, heatmap, การรวมเป็นยอดรายวัน, รายการล่าสุด
Pages.sales = {
  render(root) {
    const d = App.data;
    const dowNames = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
    const hourRange = Array.from({ length: 17 }, (_, i) => i + 6);           // 06:00–22:00
    const hh = h => String(h).padStart(2, '0') + ':00';
    const nDays = d.dates.length;
    const state = { pid: 0, samplePid: d.products[0].id, sampleDate: d.dates[d.dates.length - 1] };

    root.innerHTML = `
      <h2>รายการขาย (Timestamp)</h2>
      <p class="sub">รายการขายทุกชิ้นบันทึกเวลาที่ขายจริง ${App.fmt(d.transactions.length)} รายการ ${App.fmt(new Set(d.transactions.map(t => t.receipt_no)).size)} บิล ใช้หาช่วงเวลาขายดีและเวลาเริ่มโปรโมชั่น</p>
      <div class="card">
        <div class="controls"><label>สินค้า <select id="s-prod"><option value="0">ทุกสินค้า</option>${App.productOptions(0)}</select></label></div>
        <div id="s-kpi" class="grid cols-4" style="margin-bottom:12px"></div>
        <h3>ยอดขายเฉลี่ยรายชั่วโมง (ชิ้นต่อวัน)</h3><div id="s-bars"></div>
      </div>
      <div class="card"><h3>Heatmap ยอดขายเฉลี่ย วัน × ชั่วโมง (ชิ้น)</h3><div id="s-heat"></div></div>
      <div class="card">
        <h3>ตัวอย่างการรวมรายการขายเป็นยอดรายวัน</h3>
        <div class="controls">
          <label>สินค้า <select id="a-prod">${App.productOptions(state.samplePid)}</select></label>
          <label>วันที่ <select id="a-date">${d.dates.slice().reverse().map(x => `<option value="${x}">${App.thaiDate(x)}</option>`).join('')}</select></label>
        </div>
        <div id="s-agg"></div>
      </div>
      <div class="card"><h3>รายการขายล่าสุด</h3><div class="table-wrap" id="s-recent"></div></div>`;

    const $ = id => root.querySelector(id);

    // --- ยอดรายชั่วโมง + heatmap ---
    function drawHours() {
      const hours = Calc.hourlyTotals(d.transactions, state.pid);
      const peak = Calc.peakHour(hours), start = Calc.promoStartHour(hours);
      const avg = hourRange.map(h => hours[h] / nDays);
      $('#s-kpi').innerHTML = `
        <div class="kpi blue"><div class="label">ชั่วโมงขายดีที่สุด</div><div class="value">${hh(peak)}</div><div class="note">เฉลี่ย ${App.fmt(hours[peak] / nDays, 1)} ชิ้น/วัน</div></div>
        <div class="kpi orange"><div class="label">เวลาเริ่มโปรที่เหมาะสม</div><div class="value">${hh(start)}</div><div class="note">หลังจากนี้ยังเหลือยอดขาย ≥ 40% ของวัน</div></div>
        <div class="kpi"><div class="label">ยอดขายเฉลี่ยต่อวัน</div><div class="value">${App.fmt(hours.reduce((a, b) => a + b, 0) / nDays, 1)}</div><div class="note">ชิ้น</div></div>`;
      $('#s-bars').innerHTML = Charts.bars({
        ...Charts.fit($('#s-bars'), 0.28, 220, 380),
        labels: hourRange.map(h => String(h)), values: avg,
        color: 'color-mix(in srgb, var(--accent) 55%, var(--surface))', highlight: { [peak - 6]: 'var(--accent)', [start - 6]: 'var(--warn)' }, fmt: v => App.fmt(v, v < 10 ? 1 : 0)
      }) + `<div class="legend"><span><i class="lg-box" style="background:var(--accent)"></i>ชั่วโมงขายดีที่สุด</span><span><i class="lg-box" style="background:var(--warn)"></i>เวลาเริ่มโปร</span></div>`;
      const mat = Calc.hourlyByWeekday(d, state.pid).map(row => hourRange.map(h => row[h]));
      $('#s-heat').innerHTML = Charts.heatmap({ width: Charts.fit($('#s-heat'), 1, 300, 300).width, rowLabels: dowNames, colLabels: hourRange.map(String), matrix: mat });
    }

    // --- ตัวอย่างรวมเป็นยอดรายวัน ---
    function drawAgg() {
      const p = App.product(state.samplePid);
      const rows = d.transactions.filter(t => t.product_id === p.id && t.sold_at.startsWith(state.sampleDate));
      const total = rows.reduce((s, t) => s + t.qty, 0);
      const fromView = d.dailySales[p.id][d.dates.indexOf(state.sampleDate)];
      const shown = rows.slice(0, 8);
      $('#s-agg').innerHTML = `<div class="grid cols-2"><div class="table-wrap"><table>
        <thead><tr><th>เลขที่บิล</th><th>เวลา</th><th>จำนวน</th></tr></thead><tbody>
        ${shown.map(t => `<tr><td>${App.esc(t.receipt_no)}</td><td>${t.sold_at.slice(11, 19)}</td><td>${t.qty}</td></tr>`).join('')}
        ${rows.length > shown.length ? `<tr><td class="muted" colspan="3">… อีก ${rows.length - shown.length} รายการ</td></tr>` : ''}
        <tr><td colspan="2"><b>รวม ${rows.length} รายการ</b></td><td><b>${App.fmt(total)}</b></td></tr></tbody></table></div>
        <div><div class="kpi blue"><div class="label">ยอดขายรายวันของ ${App.esc(p.name)} (${App.thaiDate(state.sampleDate)})</div>
          <div class="value">${App.fmt(fromView)} ${App.esc(p.unit)}</div>
          <div class="note">${fromView === total ? 'ตรงกับผลรวมจากรายการขาย' : 'ไม่ตรงกับผลรวม!'}</div></div>
          <p class="formula" style="margin-top:12px">ยอดรายวันที่ใช้พยากรณ์ได้จากการรวมรายการขายด้วย SQL:<br>
          <code>SELECT product_id, CAST(sold_at AS DATE), SUM(qty)<br>FROM sales_transactions GROUP BY product_id, CAST(sold_at AS DATE)</code></p></div></div>`;
    }

    // --- รายการขายล่าสุด ---
    const recent = d.transactions.slice(-20).reverse();
    $('#s-recent').innerHTML = `<table><thead><tr><th>เวลา</th><th>เลขที่บิล</th><th class="left">สินค้า</th><th>จำนวน</th><th>ราคา/หน่วย</th><th>รวม</th></tr></thead><tbody>
      ${recent.map(t => `<tr><td>${App.shortDate(t.sold_at.slice(0, 10))} ${t.sold_at.slice(11, 16)}</td><td>${App.esc(t.receipt_no)}</td>
        <td class="left">${App.esc(App.product(t.product_id).name)}</td><td>${t.qty}</td><td>${App.fmt(t.unit_price)}</td><td>${App.fmt(t.qty * t.unit_price)}</td></tr>`).join('')}
      </tbody></table>`;

    $('#s-prod').onchange = e => { state.pid = Number(e.target.value); drawHours(); };
    $('#a-prod').onchange = e => { state.samplePid = Number(e.target.value); drawAgg(); };
    $('#a-date').onchange = e => { state.sampleDate = e.target.value; drawAgg(); };
    drawHours(); drawAgg();
  }
};
