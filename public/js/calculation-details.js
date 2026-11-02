// Presentation-ready worked calculations, rendered from the selected database values.
const CalculationDetails = {
  esc(value) { return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  num(value, precision = 6) { return value === null || !Number.isFinite(value) ? '—' : Number(value).toLocaleString('en-US', { maximumFractionDigits: precision }); },

  html(trace, sourceNote = 'ข้อมูลยอดขายและค่าต้นทุนจากฐานข้อมูลที่โหลดบนหน้านี้') {
    const t = trace, p = t.product, s = t.settings, fc = t.forecast, ci = t.confidence, pl = t.plan;
    const e = this.esc, n = this.num;
    const formula = (label, substitution, result) => `<div class="worked-equation"><span>${e(label)}</span><code>${e(substitution)}</code><strong>${e(result)}</strong></div>`;
    const miniTable = (headers, rows) => `<div class="table-wrap"><table><thead><tr>${headers.map(h => `<th>${e(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(value => `<td>${e(value)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    const level = n(ci.level * 100, 0);
    const forecastSteps = s.method === 'ma'
      ? `${miniTable(['วันที่', `ยอดขาย (${p.unit})`], t.recentRows.map(r => [r.date, n(r.actual)]))}
          ${formula('Moving Average: d = ผลรวมยอดขาย n วัน ÷ n', `d = (${t.recentRows.map(r => n(r.actual)).join(' + ')}) ÷ ${s.n}`, `${n(t.recentSum)} ÷ ${s.n} = ${n(fc.d)} ${p.unit}/วัน`)}
          <p class="worked-note">ใช้ยอดรายวัน ${s.n} วันล่าสุดจากช่วงข้อมูลที่โหลด ไม่ใช้รายการขายรายบิลมาเฉลี่ยโดยตรง</p>`
      : `${formula('Exponential Smoothing: Lₜ = αyₜ + (1 − α)Lₜ₋₁', `ค่าเริ่มต้น L₀ = ยอดวันแรก = ${n(t.rows[0]?.actual)}; α = ${n(s.alpha)}`, `ค่าระดับสุดท้าย d = ${n(fc.d)} ${p.unit}/วัน`)}
          <details class="worked-table"><summary>ดูการปรับระดับทุกวัน (${t.smoothing.length} ขั้น)</summary>${miniTable(['วันที่', 'ยอดจริง yₜ', 'ระดับก่อนหน้า', 'α × ยอดจริง', '(1−α) × ระดับเดิม', 'ระดับใหม่'], t.smoothing.map(r => [r.date, n(r.actual), n(r.previousLevel), n(r.actualPart), n(r.previousPart), n(r.nextLevel)]))}</details>
          ${t.smoothing.length ? formula('แทนค่าขั้นสุดท้าย', `${n(s.alpha)} × ${n(t.smoothing.at(-1).actual)} + ${n(1 - s.alpha)} × ${n(t.smoothing.at(-1).previousLevel)}`, `${n(t.smoothing.at(-1).actualPart)} + ${n(t.smoothing.at(-1).previousPart)} = ${n(fc.d)} ${p.unit}/วัน`) : ''}`;
    const coverageExample = ci.backtest.checks[0];
    return `<article class="worked-calculations">
      <header class="worked-heading"><div><span class="module-eyebrow">SHOW YOUR WORK</span><h3>วิธีคำนวณ: ${e(p.name)}</h3><p>${e(sourceNote)}</p><p>ช่วงข้อมูล ${e(t.dates[0])} ถึง ${e(t.dates.at(-1))} · วันวางแผน ${e(t.today)} · ${s.method === 'ma' ? 'Moving Average ' + s.n + ' วัน' : 'Exponential Smoothing α = ' + n(s.alpha)}</p></div></header>
      <p class="worked-note">ตัวเลขที่แทนค่าแสดงไม่เกิน 6 ตำแหน่งทศนิยม ระบบเก็บความละเอียดเต็มระหว่างคำนวณ ใช้ ≈ เมื่อตรวจด้วยเครื่องคิดเลขจากตัวเลขที่แสดง</p>
      <section class="worked-step" id="worked-inputs"><h4><span>01</span>ค่าตั้งต้นและที่มาของข้อมูล</h4>
        ${miniTable(['ตัวแปร', 'ความหมาย', 'ค่าที่ใช้', 'ที่มา'], [
          ['ยอดรายวัน', 'รวม Quantity แยกสินค้าและวัน', t.dates.length + ' วัน', 'ชุดยอดขายรายวันที่ใช้คำนวณ (ดูที่มาด้านบน)'],
          ['C', 'ต้นทุนต่อหน่วย', '€' + n(p.cost) + '/' + p.unit, 'ข้อมูลสินค้า: cost'],
          ['S', 'ค่าสั่งซื้อหนึ่งครั้ง', '€' + n(p.order_cost) + '/ครั้ง', 'ข้อมูลสินค้า: order_cost'],
          ['i', 'อัตราเก็บรักษาต่อปี', n(s.holdRate) + ' = ' + n(s.holdRate * 100) + '%', 'สมมติฐานที่เลือกในแผนจัดซื้อ'],
          ['อายุสินค้า', 'ใช้จำกัดจำนวนที่คาดว่าขายทัน', n(p.shelf_life_days) + ' วัน', 'ข้อมูลสินค้า: shelf_life_days'],
          ['365', 'จำนวนวันที่ใช้แปลงเป็นความต้องการรายปี', '365 วัน/ปี', 'สมมติฐานของแบบจำลอง'],
          ['Confidence', 'ระดับเป้าหมายของช่วงคาดการณ์', level + '%', 'ค่าที่ผู้ใช้เลือก'],
          ['z', 'ตัวคูณปกติมาตรฐานแบบสองด้าน', n(ci.z), 'ตาราง z: 90%=1.644854; 95%=1.959964; 99%=2.575829']
        ])}
        <p class="worked-note">ต้นทุน ค่าสั่งซื้อ และอายุสินค้าเป็นค่าจากข้อมูลสินค้าของร้าน ส่วนอัตราเก็บรักษาเป็นสมมติฐาน ข้อมูลยอดขาย CSV เพียงอย่างเดียวไม่มีค่าทั้งหมดที่ใช้คำนวณ EOQ</p>
      </section>
      <section class="worked-step" id="worked-demand"><h4><span>02</span>หาความต้องการต่อวัน (d)</h4>${forecastSteps}
        <details class="worked-table"><summary>ตรวจยอดขายรายวันทั้งหมด ${t.rows.length} วัน</summary>${miniTable(['วันที่', `ยอดจริง (${p.unit})`], t.rows.map(r => [r.date, n(r.actual)]))}</details>
      </section>
      <section class="worked-step" id="worked-eoq"><h4><span>03</span>แทนค่า EOQ ทีละขั้น</h4>
        ${formula('D = d × 365', `D = ${n(fc.d)} × 365`, `≈ ${n(pl.D)} ${p.unit}/ปี`)}
        ${formula('H = C × i', `H = ${n(p.cost)} × ${n(s.holdRate)}`, `= €${n(pl.H)}/${p.unit}/ปี`)}
        ${formula('EOQ = √(2 × D × S ÷ H)', `EOQ = √(2 × ${n(pl.D)} × ${n(p.order_cost)} ÷ ${n(pl.H)})`, `≈ √(${n(t.numerator)} ÷ ${n(pl.H)}) = √${n(t.radicand)} ≈ ${n(pl.eoq)} ${p.unit}/ครั้ง`)}
        ${formula('ตรวจข้อจำกัดอายุสินค้า', `จำนวนที่คาดว่าขายทัน = d × อายุสินค้า = ${n(fc.d)} × ${n(p.shelf_life_days)}`, `≈ ${n(pl.cap)} ${p.unit}`)}
        ${formula('จำนวนแนะนำสั่งจริง', pl.limited ? `EOQ ${n(pl.eoq)} > จำนวนที่ขายทัน ${n(pl.cap)} → ปัดจำนวนที่ขายทันลง` : `EOQ ${n(pl.eoq)} ≤ จำนวนที่ขายทัน ${n(pl.cap)} → ปัด EOQ เป็นจำนวนเต็ม`, `${n(pl.qty, 0)} ${p.unit}/ครั้ง`)}
        <p class="worked-answer"><b>อธิบายตอนนำเสนอ:</b> “EOQ หาจำนวนสั่งที่สมดุลระหว่างต้นทุนสั่งซื้อกับต้นทุนเก็บรักษา จากนั้นระบบจำกัดจำนวนตามอายุสินค้า จึงแสดงทั้ง EOQ ตามสูตรและจำนวนแนะนำสั่งจริง”</p>
      </section>
      <section class="worked-step" id="worked-confidence"><h4><span>04</span>คำนวณ Confidence จากความคลาดเคลื่อนย้อนหลัง</h4>
        <p>แต่ละวันทดสอบใช้ค่าพยากรณ์ที่คำนวณจากวันก่อนหน้า แล้วหา eₜ = ยอดจริง − ค่าพยากรณ์ และยกกำลังสอง</p>
        <details class="worked-table"><summary>เปิดตารางให้ตรวจ e และ e² ได้ครบ ${t.errors.length} จุด</summary>${miniTable(['วันที่', 'ยอดจริง yₜ', 'ค่าพยากรณ์ ŷₜ', 'e = yₜ − ŷₜ', 'e²'], t.errors.map(r => [r.date, n(r.actual), n(r.predicted), n(r.error), n(r.squaredError)]))}<p class="worked-total">ผลรวม e² = <b>${n(t.squaredErrorSum)}</b> · จำนวนจุดทดสอบ = <b>${t.errors.length}</b></p></details>
        ${t.errors.length ? formula('RMSE = √(Σe² ÷ จำนวนจุดทดสอบ)', `RMSE = √(${n(t.squaredErrorSum)} ÷ ${t.errors.length})`, `= √${n(t.meanSquaredError)} ≈ ${n(ci.rmse)} ${p.unit}`) : '<p class="worked-note">ยังไม่มีจุดทดสอบย้อนหลังที่คำนวณค่าคลาดเคลื่อนได้</p>'}
        ${ci.available ? `${formula(`เลือกช่วงคาดการณ์ ${level}% แล้วใช้ z แบบสองด้าน`, `ส่วนเผื่อความคลาดเคลื่อน = z × RMSE = ${n(ci.z)} × ${n(ci.rmse)}`, `≈ ${n(t.margin)} ${p.unit}`)}
          ${formula('ขอบล่าง = max(0, d − z × RMSE)', `max(0, ${n(fc.d)} − ${n(t.margin)}) = max(0, ${n(t.rawLower)})`, `≈ ${n(ci.lo)} ${p.unit}`)}
          ${formula('ขอบบน = max(0, d + z × RMSE)', `max(0, ${n(fc.d)} + ${n(t.margin)})`, `≈ ${n(ci.hi)} ${p.unit}`)}
          <div class="worked-result">ช่วงคาดการณ์วันถัดไป ${level}%: <b>${n(ci.lo)}–${n(ci.hi)} ${e(p.unit)}</b><small>ปัดขอบออกเป็นจำนวนเต็มสำหรับแสดงบนแดชบอร์ด: ${n(Math.floor(ci.lo), 0)}–${n(Math.ceil(ci.hi), 0)} ${e(p.unit)}</small></div>` : '<p class="worked-note">ข้อมูลย้อนหลังไม่พอสำหรับประมาณช่วงคาดการณ์ ต้องมีอย่างน้อย 2 จุดที่คำนวณความคลาดเคลื่อนได้</p>'}
        ${ci.available && ci.level === .95 ? `<p class="worked-note">เมื่อตรวจด้วยตาราง z ที่ปัดเป็น 1.96 จะได้ส่วนเผื่อ ≈ ${n(1.96 * ci.rmse, 4)} และช่วง ≈ ${n(Math.max(0, fc.d - 1.96 * ci.rmse), 4)}–${n(Math.max(0, fc.d + 1.96 * ci.rmse), 4)} ${e(p.unit)} ความต่างเล็กน้อยเกิดจากการปัดค่า z</p>` : ''}
        <p class="worked-answer"><b>อธิบายตอนนำเสนอ:</b> “${level}% คือระดับเป้าหมายของช่วงคาดการณ์แบบประมาณ ภายใต้สมมติฐานความคลาดเคลื่อนใกล้การแจกแจงปกติ ผลที่ทดสอบได้จริงดูที่ Coverage ส่วนความคลาดเคลื่อนดูที่ RMSE และ MAPE”</p>
      </section>
      <section class="worked-step" id="worked-coverage"><h4><span>05</span>ตรวจ Coverage ด้วยยอดขายจริง</h4>
        ${formula('Coverage = จำนวนวันที่ยอดจริงอยู่ในช่วง ÷ จำนวนวันทดสอบ × 100', ci.backtest.tested ? `${ci.backtest.hits} ÷ ${ci.backtest.tested} × 100` : 'ยังไม่มีวันทดสอบที่มีข้อมูลก่อนหน้าเพียงพอ', ci.backtest.coverage === null ? 'ข้อมูลยังไม่พอทดสอบ' : `≈ ${n(ci.backtest.coverage * 100, 4)}%`)}
        <p class="worked-note">เริ่มตรวจเมื่อมีความคลาดเคลื่อนก่อนหน้าอย่างน้อย 14 จุด แต่ละวันใช้ RMSE จากข้อมูลก่อนวันนั้นเท่านั้น จึงมีจำนวนวันทดสอบ Coverage น้อยกว่าจำนวนจุดที่ใช้หา RMSE สุดท้าย</p>
        ${coverageExample ? formula('ตัวอย่างวันทดสอบแรก: ' + t.dates[coverageExample.index], `RMSE ก่อนวันทดสอบ = √(${n(coverageExample.priorSquaredErrors)} ÷ ${coverageExample.priorSamples}) ≈ ${n(coverageExample.priorRmse)}; ช่วง = ${n(coverageExample.predicted)} ± ${n(ci.z)} × ${n(coverageExample.priorRmse)}`, `ขอบที่ใช้จริง ${n(coverageExample.lo)}–${n(coverageExample.hi)}; ยอดจริง ${n(coverageExample.actual)} → ${coverageExample.covered ? 'อยู่ในช่วง' : 'อยู่นอกช่วง'}`) : ''}
        <details class="worked-table"><summary>ตรวจทีละวัน ${ci.backtest.tested} วัน</summary>${miniTable(['วันที่', 'จุดก่อนวันทดสอบ', 'RMSE ก่อนวันทดสอบ', 'ขอบล่าง', 'ยอดจริง', 'ขอบบน', 'ผล'], ci.backtest.checks.map(r => [t.dates[r.index], r.priorSamples, n(r.priorRmse), n(r.lo), n(r.actual), n(r.hi), r.covered ? 'อยู่ในช่วง' : 'นอกช่วง']))}</details>
      </section>
      <aside class="worked-answer"><b>คำตอบสั้นเมื่ออาจารย์ถามเรื่องข้อมูล:</b> “ยอดรายวันมาจากข้อมูลขายที่นำเข้าในฐานข้อมูล ส่วนต้นทุน ค่าสั่งซื้อ และอายุสินค้ามาจากตารางสินค้า อัตราเก็บรักษาเป็นสมมติฐานที่ปรับได้ ตัวเลขทุกส่วนคำนวณใหม่ตามสินค้าและวิธีพยากรณ์ที่เลือก”</aside>
      <p class="worked-note">อ้างอิงหลักการ: <a href="https://otexts.com/fpp2/prediction-intervals.html" target="_blank" rel="noopener">Forecasting: Principles and Practice — Prediction intervals</a> · <a href="https://ctl.mit.edu/sites/ctl.mit.edu/files/attachments/S2%20-%20Aug%204%20-%20W2%20-%20Slides.pdf" target="_blank" rel="noopener">MIT CTL — Inventory Management</a></p>
    </article>`;
  },

  mount(root, trace) {
    const details = root.querySelector('#calculation-workbook');
    const target = root.querySelector('#calculation-detail-root');
    const render = () => { if (!target.childElementCount) target.innerHTML = this.html(trace); };
    details.addEventListener('toggle', () => { if (details.open) render(); });
    if (details.open) render();
    root.querySelectorAll('[data-calculation]').forEach(button => button.onclick = () => {
      details.open = true; render();
      const focus = target.querySelector('#worked-' + button.dataset.calculation);
      focus.setAttribute('tabindex', '-1'); focus.focus({ preventScroll: true }); focus.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    });
    root.querySelector('#export-worked-calculation').onclick = () => this.download(trace);
  },

  document(trace, sourceNote) {
    return '<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>StockWise — วิธีคำนวณ EOQ และ Confidence</title><style>' + this.standaloneCSS + '</style><main><div class="sheet-toolbar"><b>StockWise · Calculation worksheet</b><button type="button" onclick="window.print()">พิมพ์ / บันทึกเป็น PDF</button></div>' + this.html(trace, sourceNote || 'สำเนาค่าที่แสดงบนเว็บ ณ เวลาที่ดาวน์โหลด · ใช้อธิบายและตรวจด้วยเครื่องคิดเลขได้แบบออฟไลน์') + '</main><script>let detailState=[];addEventListener("beforeprint",()=>{detailState=[...document.querySelectorAll("details")].map(el=>({el,open:el.open}));detailState.forEach(s=>s.el.open=true)});addEventListener("afterprint",()=>detailState.forEach(s=>s.el.open=s.open));</script></html>';
  },

  download(trace) {
    const url = URL.createObjectURL(new Blob([this.document(trace)], { type: 'text/html;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = `stockwise-worked-calculation-${trace.product.id}-${trace.today}.html`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  standaloneCSS: 'body{margin:0;background:#f4f5f0;color:#304334;font:15px/1.8 system-ui,sans-serif}main{max-width:1040px;margin:30px auto;padding:0 24px}.sheet-toolbar{display:flex;gap:20px;justify-content:space-between;align-items:center;margin-bottom:20px}.sheet-toolbar button{padding:10px 16px;background:#3d5e44;color:white;border:0;border-radius:6px;cursor:pointer}h3{font-size:24px;margin:0 0 8px}h4{font-size:18px;display:flex;align-items:center;gap:12px;margin:0 0 18px}h4>span{font-size:13px;background:#e8eee0;padding:5px 9px;border-radius:6px}.module-eyebrow{font-size:10px;letter-spacing:2px;color:#9a8b6e}.worked-heading p{font-size:12px;color:#7b8872;margin:3px 0}.worked-step{background:white;border:1px solid #e2e7d8;border-radius:10px;padding:24px;margin-top:20px}.worked-equation{padding:12px 0;border-bottom:1px solid #edf0e7}.worked-equation>*{display:block}.worked-equation>span{font-size:12px;color:#829073}.worked-equation code{white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.9 ui-monospace,monospace;margin:4px 0}.worked-equation strong{color:#49693e;font-size:15px;font-weight:600;overflow-wrap:anywhere}.worked-note{font-size:12px;color:#849175}.worked-table{margin:16px 0}.worked-table summary{cursor:pointer;color:#6e835d;font-size:13px}.table-wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:12px;margin:12px 0}th,td{text-align:right;padding:9px 10px;border-bottom:1px solid #e7ebdf;white-space:nowrap}th:first-child,td:first-child{text-align:left}th{font-weight:500;background:#f6f8f1;color:#7f8c70}.worked-answer{padding:16px;border-radius:7px;background:#edf2e5;color:#6a805c;font-size:13px;margin-top:18px}.worked-result{padding:18px;background:#eff4e8;border-left:3px solid #8da477;margin-top:14px}.worked-result small{display:block;font-size:12px;color:#8a967d;margin-top:5px}.worked-total{font-size:12px}a{color:#688255}@media print{body{background:#fff;color:#111;font-size:11px}main{max-width:none;margin:0;padding:0}.sheet-toolbar{display:none}details{display:block}.worked-step{padding:14px;border-color:#ccc;break-inside:auto}.worked-equation,.worked-result,.worked-answer,h4{break-inside:avoid}table{font-size:9px}th,td{padding:5px 6px;white-space:normal}.worked-table>summary{display:none}details:not([open])>div,details:not([open])>p{display:block!important}.table-wrap{overflow:visible}a{color:inherit}h4{break-after:avoid}}'
};
