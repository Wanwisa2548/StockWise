// หน้า 7: ข้อมูลสินค้า — แก้สินค้าและจัดการล็อต แล้วบันทึกลงฐานข้อมูลจริง
Pages.manage = {
  msg: null,            // ข้อความผลการบันทึกล่าสุด { ok, text }
  lotProduct: 0,        // ตัวกรองล็อตตามสินค้า (0 = ทุกสินค้า)

  render(root) {
    const d = App.data;
    const self = this;
    const M = this.msg; this.msg = null;

    root.innerHTML = `
      <h2>ข้อมูลสินค้า</h2>
      <p class="sub">แก้ไขแล้วกด “บันทึก” ระบบจะอัปเดตฐานข้อมูลจริง และคำนวณทุกหน้าใหม่ทันที</p>
      <div id="m-msg">${M ? `<div class="${M.ok ? 'card' : 'error'}" style="${M.ok ? 'background:var(--green-soft);color:var(--green)' : ''}">${App.esc(M.text)}</div>` : ''}</div>
      <div class="card"><h3>สินค้า</h3><div class="table-wrap"><table>
        <thead><tr><th>สินค้า</th><th>ราคาทุน (บาท)</th><th>ราคาขาย (บาท)</th><th>ค่าสั่งซื้อ/ครั้ง (บาท)</th><th>Lead Time (วัน)</th><th>อายุสินค้า (วัน)</th><th></th></tr></thead>
        <tbody>${d.products.map(p => `<tr data-pid="${p.id}">
          <td>${App.esc(p.name)}</td>
          ${['cost', 'price', 'order_cost'].map(f => `<td><input type="number" step="0.01" min="0.01" data-f="${f}" value="${p[f]}" style="width:90px"></td>`).join('')}
          ${['lead_time_days', 'shelf_life_days'].map(f => `<td><input type="number" step="1" min="1" data-f="${f}" value="${p[f]}" style="width:80px"></td>`).join('')}
          <td><button class="btn" data-save-product>บันทึก</button></td></tr>`).join('')}
        </tbody></table></div></div>

      <div class="card"><h3>ล็อตสินค้า</h3>
        <div class="controls"><label>แสดงสินค้า <select id="m-filter"><option value="0">ทุกสินค้า</option>${App.productOptions(this.lotProduct)}</select></label></div>
        <div class="table-wrap"><table>
          <thead><tr><th>สินค้า</th><th>ล็อต</th><th>รับเข้า</th><th>คงเหลือ</th><th>วันที่รับเข้า</th><th>วันหมดอายุ</th><th>เหลือ (วัน)</th><th></th></tr></thead>
          <tbody id="m-lots"></tbody></table></div>
      </div>

      <div class="card"><h3>เพิ่มล็อตใหม่</h3>
        <div class="controls" id="m-add">
          <label>สินค้า <select data-f="product_id">${App.productOptions(d.products[0].id)}</select></label>
          <label>จำนวนรับเข้า <input type="number" min="1" step="1" data-f="qty_received" style="width:100px"></label>
          <label>วันที่รับเข้า <input type="date" data-f="received_date" value="${d.today}"></label>
          <label>วันหมดอายุ <input type="date" data-f="expiry_date"></label>
          <button class="btn" id="m-add-btn">เพิ่มล็อต</button>
        </div>
        <p class="muted" style="margin:0">จำนวนคงเหลือของล็อตใหม่ = จำนวนรับเข้า (แก้ภายหลังได้ในตารางด้านบน)</p>
      </div>`;

    // อ่านค่าจากช่อง input ทั้งหมดใน element เป็นอ็อบเจ็กต์ { ชื่อฟิลด์: ค่า }
    const read = el => Object.fromEntries([...el.querySelectorAll('[data-f]')].map(i => [i.dataset.f, i.value]));

    // เรียก API แล้วรีโหลดข้อมูลทุกหน้า; ถ้าผิดพลาดแสดงข้อความที่ด้านบน (ไม่ปิดฟอร์ม)
    const run = async (btn, okText, call) => {
      btn.disabled = true;
      try {
        await call();
        await App.loadData();
        self.msg = { ok: true, text: okText };
        App.refresh();
      } catch (err) {
        btn.disabled = false;
        root.querySelector('#m-msg').innerHTML = `<div class="error">${App.esc(err.message)}</div>`;
        window.scrollTo(0, 0);
      }
    };

    root.querySelectorAll('[data-save-product]').forEach(btn => btn.onclick = () => {
      const tr = btn.closest('tr'), id = tr.dataset.pid;
      run(btn, `บันทึกข้อมูล ${App.product(Number(id)).name} แล้ว`, () => App.api('PUT', `/api/products/${id}`, read(tr)));
    });

    const drawLots = () => {
      const lots = d.lots.filter(l => !self.lotProduct || l.product_id === self.lotProduct)
        .sort((a, b) => a.product_id - b.product_id || a.expiry_date.localeCompare(b.expiry_date));
      root.querySelector('#m-lots').innerHTML = lots.map(l => `<tr data-lid="${l.id}">
        <td>${App.esc(App.product(l.product_id).name)}</td><td>#${l.id}</td>
        <td><input type="number" min="1" step="1" data-f="qty_received" value="${l.qty_received}" style="width:80px"></td>
        <td><input type="number" min="0" step="1" data-f="qty_remaining" value="${l.qty_remaining}" style="width:80px"></td>
        <td><input type="date" data-f="received_date" value="${l.received_date}"></td>
        <td><input type="date" data-f="expiry_date" value="${l.expiry_date}"></td>
        <td>${l.days_left}</td>
        <td style="white-space:nowrap"><button class="btn" data-save-lot>บันทึก</button> <button class="btn danger" data-del-lot>ลบ</button></td></tr>`).join('')
        || '<tr><td colspan="8" class="muted">ไม่มีล็อต</td></tr>';
      root.querySelectorAll('[data-save-lot]').forEach(btn => btn.onclick = () => {
        const tr = btn.closest('tr'), id = tr.dataset.lid;
        run(btn, `บันทึกล็อต #${id} แล้ว`, () => App.api('PUT', `/api/lots/${id}`, read(tr)));
      });
      root.querySelectorAll('[data-del-lot]').forEach(btn => btn.onclick = () => {
        const tr = btn.closest('tr'), id = tr.dataset.lid;
        if (!confirm(`ลบล็อต #${id} ออกจากฐานข้อมูล? การลบย้อนกลับไม่ได้`)) return;
        run(btn, `ลบล็อต #${id} แล้ว`, () => App.api('DELETE', `/api/lots/${id}`));
      });
    };
    root.querySelector('#m-filter').onchange = e => { self.lotProduct = Number(e.target.value); drawLots(); };
    root.querySelector('#m-add-btn').onclick = e => {
      const body = read(root.querySelector('#m-add'));
      run(e.target, 'เพิ่มล็อตใหม่แล้ว', () => App.api('POST', '/api/lots', body));
    };
    drawLots();
  }
};
