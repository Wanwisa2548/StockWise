// หน้า 4: สินค้าใกล้หมดอายุ (FEFO + ส่วนลด + เวลาเริ่มโปร)
Pages.expiry = {
  onlyRisk: true,
  // ผลวิเคราะห์ล็อตทั้งหมด (หน้าภาพรวมเรียกใช้ต่อ)
  analyze() { return Calc.analyzeLots(App.data, Calc.forecastAll(App.data, App.settings)); },

  render(root) {
    const d0 = App.data;
    const rows = this.analyze();
    const risky = rows.filter(r => r.atRisk && !r.expired);
    const expired = rows.filter(r => r.expired);
    const hh = h => String(h).padStart(2, '0') + ':00';
    // ปุ่ม/ป้ายสถานะโปรโมชั่นของล็อต
    const promoCell = r => {
      const pr = App.promoOfLot(r.lot.id);
      if (pr) return `<span class="badge blue">ตั้งโปรแล้ว</span>`;
      if (r.expired || !r.atRisk || r.promoPrice === null || r.startHour === null) return '-';
      return `<button type="button" class="btn go" data-promo-lot="${r.lot.id}" data-pct="${r.discountPct}" data-price="${r.promoPrice}" data-hour="${r.startHour}">ตั้งโปรนี้</button>`;
    };

    root.innerHTML = `
      ${BakeryVisuals.heading('expiry', 'สินค้าใกล้หมดอายุ', 'ตรวจล็อตที่เสี่ยงขายไม่ทัน แล้วเลือกตั้งโปรโมชั่นหรือนำสินค้าหมดอายุออก')}
      <div class="grid cols-4" style="margin-bottom:16px">
        <div class="kpi orange"><div class="label">ล็อตเสี่ยงขายไม่ทัน</div><div class="value">${risky.length}</div><div class="note">ล็อต</div></div>
        <div class="kpi orange"><div class="label">จำนวนที่ขายไม่ทัน</div><div class="value">${App.fmt(risky.reduce((s, r) => s + r.unsold, 0))}</div><div class="note">ชิ้น</div></div>
        <div class="kpi red"><div class="label">มูลค่าเสี่ยงเสีย</div><div class="value">${App.money(risky.reduce((s, r) => s + r.riskValue, 0))}</div><div class="note">คิดที่ราคาทุน</div></div>
        <div class="kpi ${expired.length ? 'red' : 'green'}"><div class="label">หมดอายุแล้ว (ต้องนำออก)</div><div class="value">${expired.length}</div><div class="note">ล็อต</div></div>
      </div>

      <details class="card"><summary>โปรโมชั่นที่ตั้งไว้ (${d0.promotions.length})</summary>
        ${d0.promotions.length ? `<div class="table-wrap"><table><thead><tr><th>สินค้า</th><th>ล็อต</th><th>ส่วนลด</th><th>ราคาโปร</th><th>เริ่ม</th><th>สิ้นสุด</th><th></th></tr></thead><tbody>
          ${d0.promotions.map(p => { const lot = d0.lots.find(l => l.id === p.lot_id); const pr = lot ? App.product(lot.product_id) : null;
            return `<tr><td>${pr ? App.esc(pr.name) : '-'}</td><td>#${p.lot_id}</td><td>${p.discount_pct}%</td><td>${App.money(p.promo_price)}</td>
              <td>${p.start_at}</td><td>${p.end_at}</td><td><button type="button" class="btn go danger" data-del-promo="${p.id}">ยกเลิกโปร</button></td></tr>`; }).join('')}
          </tbody></table></div>` : BakeryVisuals.empty('tag', 'พร้อมสำหรับโปรโมชั่นรอบใหม่', 'เลือกส่วนลดที่ระบบแนะนำ เพื่อช่วยให้ขนมทุกชิ้นขายได้ทันเวลา')}
      </details>

      <div class="card">
        <div class="controls"><label><span><input type="checkbox" id="e-only" ${this.onlyRisk ? 'checked' : ''}> เฉพาะล็อตที่ต้องจัดการ</span></label></div>
        <div class="table-wrap" id="e-table"></div>
      </div>
      <details class="card formula"><summary>วิธีประเมินล็อตและกฎส่วนลด</summary>
        FEFO (First Expired, First Out): เรียงล็อตที่หมดอายุก่อน · ขายได้ทัน = min(จำนวนในล็อต, max(0, d × วันที่เหลือ − ที่ล็อตก่อนหน้าใช้ไป))<br>
        ส่วนลด: หมดอายุแล้ว = นำออก · เหลือ ≤2 วัน ลด 50% · 3–4 วัน ลด 30% · 5–7 วัน ลด 20% · มากกว่า 7 วัน เฝ้าระวัง<br>
        เวลาเริ่มโปร = ชั่วโมงสุดท้ายที่ยอดขายจากชั่วโมงนั้นจนปิดร้านยังเหลือ ≥ 40% ของยอดทั้งวัน (คำนวณจากรายการขายของสินค้านั้น)<br>
        ส่วนลดเป็นข้อเสนอแนะตามกฎ ไม่ได้เรียนรู้ผลของราคาต่อยอดขาย ยังไม่ยืนยันว่าจะเพิ่มยอดขายหรือลดของเสียเท่าไร · ควรตรวจราคาขายเทียบต้นทุนก่อนตั้งโปร
      </details>`;

    const draw = () => {
      const only = root.querySelector('#e-only').checked;
      const list = only ? rows.filter(r => r.atRisk) : rows;
      root.querySelector('#e-table').innerHTML = `<table><thead><tr>
        <th>สินค้า / ล็อต</th><th>หมดอายุ</th><th>คงเหลือ</th><th>เสี่ยงขายไม่ทัน</th>
        <th>การดำเนินการ</th><th>ราคาโปร</th><th>เริ่มโปร</th><th>มูลค่าเสี่ยง</th><th>โปรโมชั่น</th></tr></thead><tbody>
        ${list.map(r => `<tr class="${r.expired ? 'row-red' : r.atRisk ? 'row-orange' : ''}">
          <td>${BakeryVisuals.productCell(r.product, 'ล็อต #' + r.lot.id)}</td><td>${App.shortDate(r.lot.expiry_date)}<small class="cell-note">${r.expired ? 'หมดอายุแล้ว' : 'อีก ' + r.lot.days_left + ' วัน'}</small></td>
          <td>${App.fmt(r.lot.qty_remaining)}</td>
          <td>${r.unsold ? `<b>${App.fmt(r.unsold)}</b>` : '0'}</td>
          <td><span class="badge ${r.expired ? 'red' : r.atRisk ? (r.discountPct ? 'orange' : 'gray') : 'green'}">${r.action}</span></td>
          <td>${r.promoPrice !== null ? App.money(r.promoPrice) : '-'}</td>
          <td>${r.promoPrice !== null ? r.startHour === null ? 'ข้อมูลเวลาไม่พอ' : hh(r.startHour) : '-'}</td>
          <td>${r.riskValue ? App.money(r.riskValue) : '-'}</td><td>${promoCell(r)}</td></tr>`).join('') || '<tr><td colspan="9">ไม่มีล็อตที่ต้องจัดการ</td></tr>'}
        </tbody></table>`;
      App.lockWrites(root);
    };
    root.querySelector('#e-only').onchange = e => { this.onlyRisk = e.target.checked; draw(); };
    draw();

    root.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.promoLot) {
        const lot = d0.lots.find(l => l.id === Number(b.dataset.promoLot)), pr = App.product(lot.product_id);
        const pct = Number(b.dataset.pct), price = Number(b.dataset.price), hour = Number(b.dataset.hour);
        if (!confirm(`ตั้งโปร ${pr.name} ล็อต #${lot.id}
ลด ${pct}% เหลือ ${App.money(price)} เริ่ม ${hh(hour)} จนถึงวันหมดอายุ?`)) return;
        App.act(b, () => App.api('POST', '/api/promotions', { lot_id: lot.id, discount_pct: pct, promo_price: price, start_hour: hour }), `ตั้งโปร ${pr.name} ล็อต #${lot.id} แล้ว`);
      } else if (b.dataset.delPromo) {
        if (!confirm('ยกเลิกโปรโมชั่นนี้ (ลบออกจากฐานข้อมูล)?')) return;
        App.act(b, () => App.api('DELETE', `/api/promotions/${b.dataset.delPromo}`), 'ยกเลิกโปรโมชั่นแล้ว');
      }
    };
  }
};
