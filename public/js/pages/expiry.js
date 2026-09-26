// หน้า 4: สินค้าใกล้หมดอายุ (FIFO + ส่วนลด + เวลาเริ่มโปร)
Pages.expiry = {
  // ผลวิเคราะห์ล็อตทั้งหมด (หน้าภาพรวมเรียกใช้ต่อ)
  analyze() { return Calc.analyzeLots(App.data, Calc.forecastAll(App.data, App.settings)); },

  render(root) {
    const rows = this.analyze();
    const risky = rows.filter(r => r.atRisk && !r.expired);
    const expired = rows.filter(r => r.expired);
    const hh = h => String(h).padStart(2, '0') + ':00';

    root.innerHTML = `
      <h2>สินค้าใกล้หมดอายุ</h2>
      <p class="sub">ตรวจทุกล็อตแบบ FIFO (ขายล็อตที่หมดอายุก่อนก่อน) ว่าขายทันก่อนหมดอายุไหม โดยใช้ยอดขายพยากรณ์ต่อวันจากหน้าพยากรณ์</p>
      <div class="grid cols-4" style="margin-bottom:16px">
        <div class="kpi orange"><div class="label">ล็อตที่ควรจัดโปร</div><div class="value">${risky.length}</div><div class="note">ล็อตที่ขายไม่ทัน</div></div>
        <div class="kpi orange"><div class="label">จำนวนที่ขายไม่ทัน</div><div class="value">${App.fmt(risky.reduce((s, r) => s + r.unsold, 0))}</div><div class="note">ชิ้น</div></div>
        <div class="kpi red"><div class="label">มูลค่าเสี่ยงเสีย</div><div class="value">฿${App.fmt(risky.reduce((s, r) => s + r.riskValue, 0))}</div><div class="note">คิดที่ราคาทุน</div></div>
        <div class="kpi ${expired.length ? 'red' : 'green'}"><div class="label">หมดอายุแล้ว (ต้องนำออก)</div><div class="value">${expired.length}</div><div class="note">ล็อต</div></div>
      </div>

      <div class="card">
        <h3>คำแนะนำการจัดโปรโมชั่น</h3>
        ${risky.length ? `<ul class="todo">${risky.map(r => `
          <li><span class="dot ${r.discountPct >= 50 ? 'red' : 'orange'}"></span><div>
            <b>${App.esc(r.product.name)}</b> ล็อต #${r.lot.id} (เหลือ ${r.lot.days_left} วัน, ${App.fmt(r.lot.qty_remaining)} ${App.esc(r.product.unit)})<br>
            ขายทัน ${App.fmt(r.sellable)} · <b>ขายไม่ทัน ${App.fmt(r.unsold)}</b> →
            ${r.promoPrice !== null
              ? `<b>${r.action}</b> เหลือ ${App.fmt(r.promoPrice)} บาท (จาก ${App.fmt(r.product.price)}) เริ่มโปรตั้งแต่ <b>${hh(r.startHour)}</b>`
              : 'เฝ้าระวัง (ยังไม่ถึงเกณฑ์ลดราคา)'}
          </div></li>`).join('')}</ul>` : '<p class="muted">ทุกล็อตขายทันก่อนหมดอายุ</p>'}
      </div>

      <div class="card">
        <div class="controls"><label><span><input type="checkbox" id="e-only"> แสดงเฉพาะล็อตที่ขายไม่ทัน</span></label></div>
        <div class="table-wrap" id="e-table"></div>
      </div>
      <div class="card formula">
        FIFO: ขายได้ทัน = min(จำนวนในล็อต, d × วันที่เหลือ − ที่ล็อตก่อนหน้าใช้ไป)<br>
        ส่วนลด: หมดอายุแล้ว = นำออก · เหลือ ≤2 วัน ลด 50% · 3–4 วัน ลด 30% · 5–7 วัน ลด 20% · มากกว่า 7 วัน เฝ้าระวัง<br>
        เวลาเริ่มโปร = ชั่วโมงสุดท้ายที่ยอดขายจากชั่วโมงนั้นจนปิดร้านยังเหลือ ≥ 40% ของยอดทั้งวัน (คำนวณจากรายการขายของสินค้านั้น)
      </div>`;

    const draw = () => {
      const only = root.querySelector('#e-only').checked;
      const list = only ? rows.filter(r => r.atRisk) : rows;
      root.querySelector('#e-table').innerHTML = `<table><thead><tr>
        <th>สินค้า</th><th>ล็อต</th><th>หมดอายุ</th><th>เหลือ (วัน)</th><th>จำนวน</th><th>ขายทัน</th><th>ขายไม่ทัน</th>
        <th>การดำเนินการ</th><th>ราคาโปร</th><th>เริ่มโปร</th><th>มูลค่าเสี่ยง</th></tr></thead><tbody>
        ${list.map(r => `<tr class="${r.expired ? 'row-red' : r.atRisk ? 'row-orange' : ''}">
          <td>${App.esc(r.product.name)}</td><td>#${r.lot.id}</td><td>${App.shortDate(r.lot.expiry_date)}</td>
          <td>${r.lot.days_left}</td><td>${App.fmt(r.lot.qty_remaining)}</td><td>${App.fmt(r.sellable)}</td>
          <td>${r.unsold ? `<b>${App.fmt(r.unsold)}</b>` : '0'}</td>
          <td><span class="badge ${r.expired ? 'red' : r.atRisk ? (r.discountPct ? 'orange' : 'gray') : 'green'}">${r.action}</span></td>
          <td>${r.promoPrice !== null ? App.fmt(r.promoPrice) + ' บาท' : '-'}</td>
          <td>${r.promoPrice !== null ? hh(r.startHour) : '-'}</td>
          <td>${r.riskValue ? '฿' + App.fmt(r.riskValue) : '-'}</td></tr>`).join('')}
        </tbody></table>`;
    };
    root.querySelector('#e-only').onchange = draw;
    draw();
  }
};
