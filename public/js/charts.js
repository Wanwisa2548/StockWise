// charts.js — ฟังก์ชันวาดกราฟเป็น SVG (ไม่ใช้ไลบรารีภายนอก) คืนค่าเป็นสตริง HTML
// สีทั้งหมดใช้ตัวแปร CSS (var(--...)) ผ่านแอตทริบิวต์ style เพื่อให้เปลี่ยนตามธีม/dark mode
const Charts = {};

// ขนาดกราฟจากความกว้างจริงของกล่องที่จะใส่ (ratio = สูง/กว้าง)
Charts.fit = function (el, ratio, min, max) {
  const width = Math.max(300, Math.round(el.clientWidth || 700));
  return { width, height: Math.round(Math.min(max, Math.max(min, width * ratio))) };
};

Charts.esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// หาช่วงแกนที่ตัวเลขสวย เช่น 0, 10, 20, 30
Charts.niceScale = function (min, max, ticks = 5) {
  if (max === min) { max = min + 1; }
  const raw = (max - min) / ticks;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw);
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const vals = [];
  for (let v = lo; v <= hi + step / 2; v += step) vals.push(+v.toFixed(10));
  return { lo, hi, vals };
};

// กราฟเส้น
//   labels  = ป้ายแกน x, series = [{ name, color, values, dash?, width? }] (null = ไม่วาด)
//   splitAt = ดัชนีที่เริ่มช่วง "พยากรณ์อนาคต" (ระบายพื้นหลังจางๆ)
//   band    = { from, lo, hi } แถบความคลาดเคลื่อนตั้งแต่ดัชนี from เป็นต้นไป
Charts.line = function ({ labels, series, height = 300, width = 760, splitAt = null, band = null, fmt = v => v, yMin = 0 }) {
  const W = width, H = height, m = { l: 46, r: 12, t: 12, b: 28 };
  const all = series.flatMap(s => s.values).filter(v => v !== null && v !== undefined);
  if (band) all.push(band.hi);
  const sc = Charts.niceScale(Math.min(yMin, ...all), Math.max(...all));
  const n = labels.length;
  const x = i => m.l + (n === 1 ? 0 : i * (W - m.l - m.r) / (n - 1));
  const y = v => m.t + (1 - (v - sc.lo) / (sc.hi - sc.lo)) * (H - m.t - m.b);

  let g = '';
  sc.vals.forEach(v => {
    g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" style="stroke:var(--line)"/>` +
         `<text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`;
  });
  const every = Math.ceil(n / 8);
  labels.forEach((l, i) => {
    if (i % every === 0) g += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${Charts.esc(l)}</text>`;
  });
  if (splitAt !== null) {
    g += `<rect x="${x(splitAt) - 0.5}" y="${m.t}" width="${W - m.r - x(splitAt) + 0.5}" height="${H - m.t - m.b}" style="fill:var(--surface-2)"/>`;
  }
  if (band) {
    const a = x(band.from), b = x(n - 1);
    g += `<polygon points="${a},${y(Math.max(0, band.lo))} ${b},${y(Math.max(0, band.lo))} ${b},${y(band.hi)} ${a},${y(band.hi)}" style="fill:var(--band)"/>`;
  }
  series.forEach(s => {
    let d = '', pen = false;
    s.values.forEach((v, i) => {
      if (v === null || v === undefined) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true;
    });
    g += `<path d="${d}" style="fill:none;stroke:${s.color};stroke-width:${s.width || 2}${s.dash ? `;stroke-dasharray:${s.dash}` : ''};stroke-linejoin:round"/>`;
  });
  // พื้นที่โปร่งใสสำหรับ tooltip (hover ดูค่าแต่ละวัน)
  const bw = (W - m.l - m.r) / Math.max(n - 1, 1);
  labels.forEach((l, i) => {
    const tip = [l].concat(series.filter(s => s.values[i] !== null && s.values[i] !== undefined)
      .map(s => `${s.name}: ${fmt(+s.values[i].toFixed(1))}`)).join('\n');
    g += `<rect x="${x(i) - bw / 2}" y="${m.t}" width="${bw}" height="${H - m.t - m.b}" style="fill:transparent"><title>${Charts.esc(tip)}</title></rect>`;
  });
  const legendItems = series.map(s => ({ name: s.name, color: s.color, dash: s.dash }));
  if (band) legendItems.push({ name: band.name || 'ช่วงความคลาดเคลื่อน', color: 'var(--band)', box: true });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">${g}</svg>` + Charts.legend(legendItems);
};

// กราฟแท่งแนวตั้ง — highlight = { ดัชนี: สี } เพื่อเน้นแท่งพิเศษ
Charts.bars = function ({ labels, values, color = 'var(--accent)', highlight = {}, height = 260, width = 760, fmt = v => v }) {
  const W = width, H = height, m = { l: 40, r: 8, t: 20, b: 26 };
  const sc = Charts.niceScale(0, Math.max(...values));
  const n = labels.length, slot = (W - m.l - m.r) / n, bw = slot * 0.7;
  const y = v => m.t + (1 - (v - sc.lo) / (sc.hi - sc.lo)) * (H - m.t - m.b);
  let g = '';
  sc.vals.forEach(v => {
    g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" style="stroke:var(--line)"/>` +
         `<text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`;
  });
  values.forEach((v, i) => {
    const x = m.l + i * slot + (slot - bw) / 2;
    g += `<rect x="${x}" y="${y(v)}" width="${bw}" height="${Math.max(0, y(0) - y(v))}" rx="2" style="fill:${highlight[i] || color}"><title>${Charts.esc(labels[i])}: ${fmt(+v.toFixed(2))}</title></rect>` +
         `<text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${Charts.esc(labels[i])}</text>`;
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">${g}</svg>`;
};

// Heatmap: matrix[แถว][คอลัมน์], ยิ่งค่าสูงยิ่งเข้ม (ผสมสี accent กับพื้นการ์ด)
Charts.heatmap = function ({ rowLabels, colLabels, matrix, width = 760, fmt = v => v.toFixed(1) }) {
  const W = width, m = { l: 34, t: 22, r: 4, b: 4 };
  const cw = (W - m.l - m.r) / colLabels.length, ch = Math.max(30, Math.min(46, Math.round(W / 34))), H = m.t + ch * rowLabels.length + m.b;
  const max = Math.max(...matrix.flat()) || 1;
  let g = '';
  colLabels.forEach((c, j) => { g += `<text x="${m.l + j * cw + cw / 2}" y="14" text-anchor="middle">${Charts.esc(c)}</text>`; });
  rowLabels.forEach((r, i) => {
    g += `<text x="${m.l - 6}" y="${m.t + i * ch + ch / 2 + 4}" text-anchor="end" style="fill:var(--ink-2)">${Charts.esc(r)}</text>`;
    matrix[i].forEach((v, j) => {
      const a = v / max;                                  // ความเข้ม 0–1
      const pct = Math.round(8 + a * 92);
      g += `<rect x="${m.l + j * cw + 1}" y="${m.t + i * ch + 1}" width="${cw - 2}" height="${ch - 2}" rx="4" style="fill:color-mix(in srgb, var(--accent) ${pct}%, var(--surface))"><title>${Charts.esc(rowLabels[i] + ' ' + colLabels[j])}: ${fmt(v)}</title></rect>` +
           `<text x="${m.l + j * cw + cw / 2}" y="${m.t + i * ch + ch / 2 + 4}" text-anchor="middle" style="fill:${a > 0.55 ? 'var(--accent-ink)' : 'var(--ink)'};font-size:10px">${Math.round(v)}</text>`;
    });
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">${g}</svg>`;
};

// กราฟกระจาย (แกนเป็น log) — points = [{ x, y, label, color }], centers = [{ x, y, color }]
Charts.scatterLog = function ({ points, centers = [], xLabel, yLabel, height = 340, width = 760 }) {
  const W = width, H = height, m = { l: 52, r: 16, t: 14, b: 40 };
  const lg = Math.log10;
  const xs = points.map(p => lg(p.x)), ys = points.map(p => lg(p.y));
  const ext = (v, pad) => [Math.min(...v) - pad, Math.max(...v) + pad];
  const [x0, x1n] = ext(xs, 0.25), [y0, y1] = ext(ys, 0.25), x1 = x1n + 0.3;
  const px = v => m.l + (lg(v) - x0) / (x1 - x0) * (W - m.l - m.r);
  const py = v => m.t + (1 - (lg(v) - y0) / (y1 - y0)) * (H - m.t - m.b);
  const ticks = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
  let g = '';
  ticks.filter(t => lg(t) >= x0 && lg(t) <= x1).forEach(t => {
    g += `<line x1="${px(t)}" x2="${px(t)}" y1="${m.t}" y2="${H - m.b}" style="stroke:var(--line)"/><text x="${px(t)}" y="${H - m.b + 14}" text-anchor="middle">${t}</text>`;
  });
  ticks.filter(t => lg(t) >= y0 && lg(t) <= y1).forEach(t => {
    g += `<line x1="${m.l}" x2="${W - m.r}" y1="${py(t)}" y2="${py(t)}" style="stroke:var(--line)"/><text x="${m.l - 6}" y="${py(t) + 4}" text-anchor="end">${t}</text>`;
  });
  g += `<text x="${(m.l + W - m.r) / 2}" y="${H - 6}" text-anchor="middle">${Charts.esc(xLabel)} (สเกล log)</text>` +
       `<text transform="translate(12 ${(m.t + H - m.b) / 2}) rotate(-90)" text-anchor="middle">${Charts.esc(yLabel)} (สเกล log)</text>`;
  centers.forEach(c => {
    g += `<path d="M${px(c.x)},${py(c.y) - 9} l9,9 l-9,9 l-9,-9 z" style="fill:none;stroke:${c.color};stroke-width:2"><title>จุดศูนย์กลางกลุ่ม</title></path>`;
  });
  points.forEach(p => {
    g += `<circle cx="${px(p.x)}" cy="${py(p.y)}" r="6" style="fill:${p.color};stroke:var(--surface);stroke-width:1.5"><title>${Charts.esc(p.label)} — ${Charts.esc(xLabel)} ${p.x.toFixed(1)}, ${Charts.esc(yLabel)} ${p.y}</title></circle>` +
         `<text x="${px(p.x) + 9}" y="${py(p.y) + 4}" style="fill:var(--ink)">${Charts.esc(p.label)}</text>`;
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">${g}</svg>`;
};

// คำอธิบายสีของกราฟ: เส้น (ทึบ/ประ) หรือกล่องสี (box)
Charts.legend = series =>
  `<div class="legend">${series.map(s => s.box
    ? `<span><i class="lg-box" style="background:${s.color}"></i>${Charts.esc(s.name)}</span>`
    : `<span><i class="lg-line" style="border-color:${s.color};border-top-style:${s.dash ? 'dashed' : 'solid'}"></i>${Charts.esc(s.name)}</span>`).join('')}</div>`;
