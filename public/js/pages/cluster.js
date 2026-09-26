// หน้า 6: จัดกลุ่มสินค้าด้วย K-means
Pages.cluster = {
  COLORS: ['var(--k1)', 'var(--k2)', 'var(--k3)', 'var(--k4)', 'var(--k5)'],

  render(root) {
    const d = App.data, S = App.settings;
    if (!S.k) S.k = 3;
    root.innerHTML = `
      <h2>จัดกลุ่มสินค้า (K-means)</h2>
      <p class="sub">จัดสินค้าที่มีลักษณะคล้ายกัน (ยอดขายต่อวัน และอายุสินค้า) ไว้กลุ่มเดียวกัน เพื่อกำหนดนโยบายสต็อกร่วมกัน</p>
      <div class="card">
        <div class="controls"><label>จำนวนกลุ่ม (k)
          <span class="seg" id="c-k">${[2, 3, 4, 5].map(k => `<button data-k="${k}">${k}</button>`).join('')}</span></label>
          <span id="c-elbow" class="muted"></span></div>
        <div class="grid cols-2">
          <div><h3>กราฟกระจาย: ยอดขายต่อวัน × อายุสินค้า</h3><div id="c-scatter"></div></div>
          <div><h3>กราฟ Elbow (SSE ที่แต่ละ k)</h3><div id="c-elbow-chart"></div></div>
        </div>
      </div>
      <div id="c-cards" class="grid cols-3"></div>
      <div class="card formula">
        ตัวแปร: log10(ยอดขายพยากรณ์ต่อวัน) และ log10(อายุสินค้า) ปรับเป็น z-score · k-means++ รัน 20 รอบ เลือกรอบที่ SSE ต่ำสุด<br>
        Elbow = k ที่ผลต่างอันดับสองของ SSE มากที่สุด · ตั้งชื่อกลุ่มจากค่าเฉลี่ยเรขาคณิต (geometric mean) ของอายุและยอดขาย
      </div>`;

    const $ = id => root.querySelector(id);
    $('#c-k').onclick = e => { const b = e.target.closest('button'); if (b) { S.k = Number(b.dataset.k); update(); } };

    const update = () => {
      root.querySelectorAll('#c-k button').forEach(b => b.classList.toggle('active', Number(b.dataset.k) === S.k));
      const fcs = Calc.forecastAll(d, S);
      const r = Calc.clusterProducts(d, fcs, S.k);
      const C = this.COLORS;
      const short = n => n.length > 14 ? n.slice(0, 13) + '…' : n;

      $('#c-elbow').innerHTML = `Elbow แนะนำ k = <b>${r.elbow}</b>`;
      $('#c-scatter').innerHTML = Charts.scatterLog({
        xLabel: 'ยอดขาย/วัน', yLabel: 'อายุสินค้า (วัน)', ...Charts.fit($('#c-scatter'), 0.75, 320, 520),
        points: d.products.map((p, i) => ({ x: r.sales[i], y: r.life[i], label: short(p.name), color: C[r.assign[i]] })),
        centers: r.groups.map(g => ({ x: g.gmSales, y: g.gmLife, color: C[g.id] }))
      }) + `<div class="legend">${r.groups.map(g => `<span><i class="lg-box" style="background:${C[g.id]}"></i>${g.name}</span>`).join('')}<span>◇ จุดศูนย์กลางกลุ่ม</span></div>`;

      $('#c-elbow-chart').innerHTML = Charts.line({
        labels: r.sseByK.map((_, i) => 'k=' + (i + 1)), fmt: v => App.fmt(v, 1), ...Charts.fit($('#c-elbow-chart'), 0.75, 320, 520),
        series: [{ name: 'SSE', color: 'var(--ink)', values: r.sseByK, width: 2.4 }]
      }) + `<p class="muted">SSE k=1…6: ${r.sseByK.map(v => App.fmt(v, 2)).join(', ')}</p>`;

      $('#c-cards').innerHTML = r.groups.map(g => `
        <div class="card" style="border-top:4px solid ${C[g.id]};margin:0">
          <h3>${g.name}</h3>
          <p>${g.members.map(p => `<span class="badge gray">${App.esc(p.name)}</span>`).join(' ')}</p>
          <p class="muted">ยอดขายเฉลี่ย (geo mean) ${App.fmt(g.gmSales, 1)} ชิ้น/วัน · อายุเฉลี่ย ${App.fmt(g.gmLife, 1)} วัน</p>
          <p><b>นโยบายที่แนะนำ:</b> ${g.policy}</p>
        </div>`).join('');
    };
    update();
  }
};
