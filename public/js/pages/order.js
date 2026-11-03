// หน้า 3: แผนการสั่งซื้อ (EOQ, Safety Stock, ROP)
Pages.order = {
  render(root) {
    const d = App.data, S = App.settings;
    if (App.selProduct === null) App.selProduct = d.products[0].id;

    root.innerHTML = `
      ${BakeryVisuals.heading('order', 'แผนสั่งซื้อ', 'ตรวจจำนวนและวันที่แนะนำ ก่อนสร้างใบสั่งซื้อ')}
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
        <div class="bar-actions"><h3>ใบสั่งซื้อ</h3></div>
        <div class="table-wrap" id="o-po"></div>
      </div>
      <details class="card formula"><summary>สูตรและข้อจำกัดของแผนสั่งซื้อ</summary>
        d = ค่าพยากรณ์ยอดขายต่อวัน, σ = RMSE, D = d × 365, H = ราคาทุน × อัตราเก็บรักษา<br>
        EOQ = √(2DS ÷ H) โดย S = ค่าสั่งซื้อต่อครั้ง · จำนวนแนะนำ = min(round(EOQ), floor(เพดานขายทันหลังหักล็อตเดิม))<br>
        Safety Stock = z × σ × √L · ROP = d × L + Safety Stock · ประเมินวันสั่งจากสต็อกรายวันหลังตัดหมดอายุและรับใบสั่งที่ยืนยันแล้ว<br>
        ใช้ยอดพยากรณ์ d คงที่ระหว่างจำลอง วันหมดอายุเริ่มนับจากวันรับสินค้าใหม่ · ล็อตหมดอายุก่อนหรือวันเดียวกันใช้ยอดขายก่อน · ไม่รับประกันขายหมดหรือระดับบริการจริง
      </details>`;

    const $ = id => root.querySelector(id);
    $('#o-sl').onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      S.serviceLevel = Number(b.dataset.v);
      root.querySelectorAll('#o-sl button').forEach(x => x.classList.toggle('active', x === b));
      update(); App.updateBadges();
    };
    $('#o-h').oninput = e => { S.holdRate = Number(e.target.value) / 100; $('#o-hv').textContent = e.target.value + '%'; update(); App.updateBadges(); };

    function update() {
      const fcs = Calc.forecastAll(d, S);
      const plans = d.products.map(p => ({ p, pl: Calc.planFor(d, p, fcs[p.id], S) }));

      // เรียงตามความเร่งด่วน (จำนวนวันก่อนต้องสั่งน้อยสุดขึ้นก่อน)
      const rows = plans.slice().sort((a, b) => a.pl.days - b.pl.days).map(({ p, pl }) => `
        <tr data-plan-product="${p.id}" class="${pl.status === 'red' ? 'row-red' : ''}">
          <td>${BakeryVisuals.productCell(p)}<details class="dss-reason"><summary>เหตุผลและโมเดล</summary><p>${App.esc(Calc.orderExplanation(p, fcs[p.id], pl, App.pendingOrder(p.id)))}</p></details></td>
          <td>${App.fmt(pl.d, 1)}</td>
          <td data-eoq title="EOQ ตามสูตร ${App.fmt(pl.eoq, 6)} ${App.esc(p.unit)}/ครั้ง">${App.fmt(pl.eoq)}</td>
          <td><b>${App.fmt(pl.qty)}</b> ${App.esc(p.unit)}${pl.limited ? ' <span class="badge blue">จำกัดขายทัน</span>' : ''}</td>
          <td data-safety-stock>${App.fmt(pl.safety, 1)}</td><td data-rop>${App.fmt(pl.rop, 1)}</td><td>${App.fmt(pl.stock)}</td>
          <td data-order-when>${App.esc(pl.reason === 'ready'
            ? pl.dueToday ? 'วันนี้' : `อีก ${pl.days} วัน (${App.shortDate(pl.orderDate)})`
            : Calc.orderLabel(pl))}</td>
          <td data-order-status><span class="badge ${pl.reason === 'pending' ? 'blue' : pl.status}">${App.esc(pl.reason === 'ready' ? pl.dueToday ? 'สั่งวันนี้' : pl.days <= 3 ? 'ใกล้ต้องสั่ง' : 'ปกติ' : Calc.orderLabel(pl))}</span></td>
          <td>${(() => { const po = App.pendingOrder(p.id);
            return po ? `<span class="badge blue">สั่งแล้ว · ถึง ${App.shortDate(po.expected_date)}</span>`
                      : pl.reason === 'ready' && !pl.canOrder ? `<button type="button" class="btn go secondary" disabled title="ถึงวันสั่งจึงคำนวณและเปิดให้สั่งซื้อ">สั่งซื้อ ${App.fmt(pl.qty)}</button>`
                      : !pl.canOrder ? `<span class="muted">${pl.review ? 'ควรทบทวนก่อนสั่ง' : '—'}</span>` : `<button type="button" class="btn go" data-po="${p.id}" data-qty="${pl.qty}">สั่งซื้อ ${App.fmt(pl.qty)}</button>`; })()}</td>
        </tr>`).join('');
      $('#o-table').innerHTML = `<table><thead><tr>
        <th>สินค้า</th><th>ขาย/วัน (d)</th><th title="จำนวนตามสูตร EOQ ก่อนปรับล็อตเดิมและอายุสินค้า">EOQ</th><th>จำนวนสั่ง</th><th>Safety Stock</th><th>ROP</th><th>สต็อก</th><th>ควรสั่งเมื่อ</th><th>สถานะ</th><th aria-label="ดำเนินการ"></th>
        </tr></thead><tbody>${rows}</tbody></table>`;

      // ใบสั่งซื้อที่บันทึกไว้
      const stLabel = { ordered: ['รอของ', 'blue'], received: ['รับของแล้ว', 'green'], cancelled: ['ยกเลิก', 'gray'] };
      $('#o-po').innerHTML = d.orders.length ? `<table><thead><tr><th>เลขที่</th><th>สินค้า</th><th>วันที่สั่ง</th><th>จำนวน</th><th>ของถึง</th><th>สถานะ</th><th></th></tr></thead><tbody>
        ${d.orders.map(o => { const pr = App.product(o.product_id); const [t, c] = stLabel[o.status] || [o.status, 'gray'];
          return `<tr data-oid="${o.id}"><td>PO-${o.id}</td><td>${App.esc(pr.name)}</td><td>${App.shortDate(o.order_date)}</td><td>${App.fmt(o.qty)} ${App.esc(pr.unit)}</td>
            <td>${App.shortDate(o.expected_date)}</td><td><span class="badge ${c}">${t}</span></td>
            <td>${o.status === 'ordered' ? `<div class="row-actions"><button type="button" class="btn go" data-recv="${o.id}">รับของแล้ว</button><button type="button" class="btn go danger" data-cancel="${o.id}">ยกเลิก</button></div>`
              : o.status === 'cancelled' ? `<button type="button" class="btn go danger" data-del-po="${o.id}">ลบ</button>` : ''}</td></tr>`; }).join('')}</tbody></table>`
        : '<p class="muted">ยังไม่มีใบสั่งซื้อ</p>';
      App.lockWrites(root);

    }
    update();

    // ปุ่มสั่งซื้อ / รับของ / ยกเลิก / ลบ
    root.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.po) {
        const p = App.product(Number(b.dataset.po)), qty = Number(b.dataset.qty);
        if (!confirm(`สั่งซื้อ ${p.name} ${App.fmt(qty)} ${p.unit}?
ของจะถึงใน ${p.lead_time_days} วัน`)) return;
        App.act(b, () => App.api('POST', '/api/purchase-orders', { product_id: p.id, qty }), `บันทึกใบสั่งซื้อ ${p.name} แล้ว`);
      } else if (b.dataset.recv) {
        if (!confirm('รับของแล้ว? ระบบจะเพิ่มล็อตใหม่เข้าสต็อก (หมดอายุ = วันนี้ + อายุสินค้า)')) return;
        App.act(b, () => App.api('PUT', `/api/purchase-orders/${b.dataset.recv}/status`, { status: 'received' }), 'รับของแล้ว เพิ่มล็อตเข้าสต็อกเรียบร้อย');
      } else if (b.dataset.cancel) {
        if (!confirm('ยกเลิกใบสั่งซื้อนี้?')) return;
        App.act(b, () => App.api('PUT', `/api/purchase-orders/${b.dataset.cancel}/status`, { status: 'cancelled' }), 'ยกเลิกใบสั่งซื้อแล้ว');
      } else if (b.dataset.delPo) {
        if (!confirm('ลบใบสั่งซื้อที่ยกเลิกแล้วออกจากฐานข้อมูล?')) return;
        App.act(b, () => App.api('DELETE', `/api/purchase-orders/${b.dataset.delPo}`), 'ลบใบสั่งซื้อแล้ว');
      }
    };
  }
};
