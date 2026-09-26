// หน้า 1: ภาพรวมวันนี้ — สรุป KPI, สิ่งที่ต้องทำ, สถานะสต็อก และ Key Insights จากข้อมูลจริง
Pages.overview = {
  render(root) {
    const d = App.data, S = App.settings;
    const fcs = Calc.forecastAll(d, S);
    const stock = Calc.stockByProduct(d);
    const opts = { serviceLevel: S.serviceLevel, holdRate: S.holdRate, today: d.today };
    const plans = d.products.map(p => ({ p, pl: Calc.plan(p, fcs[p.id], stock[p.id], opts) }));
    const lots = Calc.analyzeLots(d, fcs);
    const risky = lots.filter(r => r.atRisk && !r.expired);
    const expired = lots.filter(r => r.expired);
    const orderToday = plans.filter(x => x.pl.days <= 0);
    const hh = h => String(h).padStart(2, '0') + ':00';

    const stockValue = d.lots.reduce((s, l) => s + l.qty_remaining * App.product(l.product_id).cost, 0);
    const riskValue = risky.reduce((s, r) => s + r.riskValue, 0);
    const riskPieces = risky.reduce((s, r) => s + r.unsold, 0);

    // ---- รายการสิ่งที่ต้องทำ เรียงตามความเร่งด่วน (sev น้อย = เร่งด่วนกว่า) ----
    const todo = [];
    expired.forEach(r => todo.push({ sev: 0, color: 'red', tag: 'นำออกจากชั้น', go: 'expiry',
      title: `นำ ${r.product.name} ล็อต #${r.lot.id} ออกจากชั้น`, detail: `หมดอายุแล้ว ${App.fmt(r.lot.qty_remaining)} ${r.product.unit}` }));
    orderToday.sort((a, b) => a.pl.days - b.pl.days).forEach(({ p, pl }) => todo.push({ sev: 1, color: 'red', tag: 'สั่งวันนี้', go: 'order',
      title: `สั่งซื้อ ${p.name} วันนี้ ${App.fmt(pl.qty)} ${p.unit}`,
      detail: `สต็อก ${App.fmt(pl.stock)} ต่ำกว่าจุดสั่งซื้อ (ROP ${App.fmt(pl.rop, 1)}) · ของถึงใน ${p.lead_time_days} วัน` }));
    risky.forEach(r => todo.push({ sev: r.discountPct >= 50 ? 1 : 2, color: r.discountPct >= 50 ? 'red' : 'orange', tag: r.action, go: 'expiry',
      title: `จัดโปร ${r.product.name} ล็อต #${r.lot.id}${r.promoPrice !== null ? ` ${r.action} เหลือ ${App.fmt(r.promoPrice)} บาท` : ''}`,
      detail: `ขายไม่ทัน ${App.fmt(r.unsold)} จาก ${App.fmt(r.lot.qty_remaining)} ${r.product.unit} (เหลือ ${r.lot.days_left} วัน)${r.promoPrice !== null ? ` · เริ่มโปร ${hh(r.startHour)}` : ''}` }));
    plans.filter(x => x.pl.days >= 1 && x.pl.days <= 3).sort((a, b) => a.pl.days - b.pl.days).forEach(({ p, pl }) => todo.push({ sev: 2, color: 'orange', tag: 'เตรียมสั่ง', go: 'order',
      title: `เตรียมสั่ง ${p.name} ภายใน ${pl.days} วัน (${App.shortDate(pl.orderDate)})`,
      detail: `สต็อก ${App.fmt(pl.stock)} · ROP ${App.fmt(pl.rop, 1)} · จำนวนที่ควรสั่ง ${App.fmt(pl.qty)} ${p.unit}` }));
    todo.sort((a, b) => a.sev - b.sev);

    // ---- Key Insights (คำนวณจากข้อมูลจริง) ----
    const insights = this.insights(d, fcs, plans, risky, stockValue, riskValue);

    root.innerHTML = `
      <h2>ภาพรวมวันนี้</h2>
      <p class="sub">สรุปสิ่งที่ต้องทำในร้านวันนี้ (${App.thaiDate(d.today)}) — คำนวณจากพยากรณ์ ${S.method === 'ma' ? 'Moving Average n=' + S.n : 'Exponential Smoothing α=' + S.alpha.toFixed(2)}, Service Level ${S.serviceLevel * 100}%</p>
      <div class="grid cols-4" style="margin-bottom:16px">
        <div class="kpi ${orderToday.length ? 'red' : 'green'}"><div class="label">ต้องสั่งวันนี้</div><div class="value">${orderToday.length}</div><div class="note">รายการสินค้า</div></div>
        <div class="kpi ${risky.length ? 'orange' : 'green'}"><div class="label">ควรจัดโปร</div><div class="value">${risky.length}</div><div class="note">ล็อต · ${App.fmt(riskPieces)} ชิ้น</div></div>
        <div class="kpi blue"><div class="label">มูลค่าสต็อก</div><div class="value">฿${App.fmt(stockValue)}</div><div class="note">คิดที่ราคาทุน</div></div>
        <div class="kpi ${riskValue ? 'red' : 'green'}"><div class="label">มูลค่าเสี่ยงเสีย</div><div class="value">฿${App.fmt(riskValue)}</div><div class="note">ของที่คาดว่าขายไม่ทันก่อนหมดอายุ</div></div>
      </div>
      <div class="grid cols-2">
        <div class="card"><h3>สิ่งที่ต้องทำ (เรียงตามความเร่งด่วน)</h3>
          ${todo.length ? todo.map(t => `<div class="task"><span class="badge ${t.color}">${App.esc(t.tag)}</span><div><div class="t">${App.esc(t.title)}</div><div class="d">${App.esc(t.detail)}</div></div><button type="button" class="btn secondary go" data-go="${t.go}">ดูรายละเอียด</button></div>`).join('') : '<p class="muted">วันนี้ไม่มีงานเร่งด่วน</p>'}
        </div>
        <div class="col">
        <div class="card"><h3>Key Insights</h3>
          <ul class="insights">${insights.map((i, n) => `<li><span class="ic">${n + 1}</span><div>${i}</div></li>`).join('')}</ul>
        </div>
      <div class="card"><h3>สถานะสต็อกรายสินค้า</h3><div class="table-wrap">
        <table><thead><tr><th>สินค้า</th><th>สต็อก</th><th>ROP</th><th>พอขาย (วัน)</th><th style="min-width:90px">เทียบ ROP</th><th>ควรสั่งเมื่อ</th></tr></thead><tbody>
        ${plans.map(({ p, pl }) => {
          const cover = pl.d > 0 ? pl.stock / pl.d : 0;
          const pct = Math.min(100, pl.stock / (pl.rop * 3) * 100), mark = 100 / 3;
          const col = { red: 'var(--crit)', orange: 'var(--warn)', green: 'var(--ok)' }[pl.status];
          return `<tr><td>${App.esc(p.name)}</td><td>${App.fmt(pl.stock)} ${App.esc(p.unit)}</td><td>${App.fmt(pl.rop, 1)}</td><td>${App.fmt(cover, 1)}</td>
            <td><div style="position:relative;height:10px;background:var(--line);border-radius:5px"><div style="height:10px;width:${pct}%;background:${col};border-radius:5px"></div>
              <div title="ROP" style="position:absolute;left:${mark}%;top:-3px;width:2px;height:16px;background:var(--ink)"></div></div></td>
            <td><span class="badge ${pl.status}">${pl.days <= 0 ? 'สั่งวันนี้' : `อีก ${pl.days} วัน`}</span></td></tr>`;
        }).join('')}
        </tbody></table></div>
        <p class="muted" style="margin:8px 0 0">แถบสีคือสต็อกปัจจุบัน เส้นดำคือจุดสั่งซื้อ (ROP) — ถ้าแถบสั้นกว่าเส้นดำ ต้องสั่งซื้อทันที</p>
      </div>
        </div>
      </div>`;

    root.querySelectorAll('[data-go]').forEach(a => a.onclick = () => App.show(a.dataset.go));
  },

  // สร้างข้อความ Key Insights จากข้อมูล (แต่ละข้อคำนวณจริง ไม่ใช่ข้อความตายตัว)
  insights(d, fcs, plans, risky, stockValue, riskValue) {
    const out = [];
    const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
    const hh = h => String(h).padStart(2, '0') + ':00';

    // 1) ช่วงเวลาขายดีและเวลาเริ่มโปรของทั้งร้าน
    const hours = Calc.hourlyTotals(d.transactions);
    out.push(`ร้านขายดีที่สุดช่วง <b>${hh(Calc.peakHour(hours))}</b> และควรเริ่มโปรโมชั่นตั้งแต่ <b>${hh(Calc.promoStartHour(hours))}</b> เพราะหลังจากนั้นยังเหลือยอดขาย ≥ 40% ของวัน`);

    // 2) วันในสัปดาห์ที่ขายดีที่สุด
    const dowName = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
    const tot = new Array(7).fill(0), cnt = new Array(7).fill(0);
    d.dates.forEach((s, i) => { const w = Calc.dayOfWeek(s); tot[w] += d.products.reduce((a, p) => a + d.dailySales[p.id][i], 0); cnt[w]++; });
    const avgDow = tot.map((t, i) => t / cnt[i]), best = avgDow.indexOf(Math.max(...avgDow)), worst = avgDow.indexOf(Math.min(...avgDow));
    out.push(`วัน<b>${dowName[best]}</b>ขายดีที่สุด (เฉลี่ย ${App.fmt(avgDow[best])} ชิ้น) ส่วนวัน${dowName[worst]}ขายน้อยที่สุด (${App.fmt(avgDow[worst])} ชิ้น) ควรเผื่อสต็อกก่อนวันขายดี`);

    // 3) สินค้าที่แนวโน้มยอดขายขึ้น/ลงมากที่สุด (เทียบ 28 วันหลังกับ 28 วันแรก)
    const growth = d.products.map(p => {
      const s = d.dailySales[p.id], h = Math.floor(s.length / 2);
      return { p, g: (mean(s.slice(h)) / mean(s.slice(0, h)) - 1) * 100 };
    }).sort((a, b) => b.g - a.g);
    const up = growth[0], down = growth[growth.length - 1];
    out.push(`แนวโน้มยอดขายโตสุดคือ <b>${App.esc(up.p.name)}</b> (${up.g >= 0 ? '+' : ''}${App.fmt(up.g, 1)}%) ส่วน <b>${App.esc(down.p.name)}</b> ${down.g < 0 ? 'ลดลง ' : 'โตน้อยสุด '}(${down.g >= 0 ? '+' : ''}${App.fmt(down.g, 1)}%) เทียบครึ่งหลังกับครึ่งแรกของ 56 วัน`);

    // 4) ของเสียที่เสี่ยง
    if (risky.length) {
      const worstRisk = risky.slice().sort((a, b) => b.riskValue - a.riskValue)[0];
      out.push(`มูลค่าเสี่ยงเสีย <b>฿${App.fmt(riskValue)}</b> (${App.fmt(riskValue / stockValue * 100, 1)}% ของมูลค่าสต็อก) มากที่สุดคือ ${App.esc(worstRisk.product.name)} ล็อต #${worstRisk.lot.id} (฿${App.fmt(worstRisk.riskValue)}) — จัดโปรตามเวลาที่แนะนำจะช่วยลดของเสีย`);
    } else out.push('ทุกล็อตขายทันก่อนหมดอายุ ไม่มีมูลค่าเสี่ยงเสีย');

    // 5) สินค้าที่ EOQ ถูกจำกัดด้วยอายุสินค้า
    const limited = plans.filter(x => x.pl.limited);
    if (limited.length) out.push(`สินค้า ${limited.length} จาก ${plans.length} รายการมี EOQ สูงกว่าที่ขายทันในอายุสินค้า จึงจำกัดจำนวนสั่ง (เช่น ${App.esc(limited[0].p.name)} สั่งครั้งละ ${App.fmt(limited[0].pl.qty)} แทน ${App.fmt(limited[0].pl.eoq)}) — ควรสั่งถี่ขึ้นครั้งละน้อยลง`);

    // 6) สินค้าที่พยากรณ์แม่นที่สุด / คลาดเคลื่อนมากที่สุด
    const byMape = plans.slice().sort((a, b) => fcs[a.p.id].metrics.mape - fcs[b.p.id].metrics.mape);
    out.push(`พยากรณ์แม่นที่สุดคือ ${App.esc(byMape[0].p.name)} (MAPE ${App.fmt(fcs[byMape[0].p.id].metrics.mape, 1)}%) และคลาดเคลื่อนสุดคือ ${App.esc(byMape[byMape.length - 1].p.name)} (${App.fmt(fcs[byMape[byMape.length - 1].p.id].metrics.mape, 1)}%) — สินค้าที่พยากรณ์ยากต้องเผื่อ Safety Stock มากกว่า`);
    return out;
  }
};
