// charts.js — ฟังก์ชันวาดกราฟเป็น SVG (ไม่ใช้ไลบรารีภายนอก) คืนค่าเป็นสตริง HTML
const Charts = {};

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
Charts.line = function ({ labels, series, height = 300, splitAt = null, fmt = v => v, yMin = 0 }) {
  const W = 760, H = height, m = { l: 46, r: 12, t: 12, b: 28 };
  const all = series.flatMap(s => s.values).filter(v => v !== null && v !== undefined);
  const sc = Charts.niceScale(Math.min(yMin, ...all), Math.max(...all));
  const n = labels.length;
  const x = i => m.l + (n === 1 ? 0 : i * (W - m.l - m.r) / (n - 1));
  const y = v => m.t + (1 - (v - sc.lo) / (sc.hi - sc.lo)) * (H - m.t - m.b);

  let g = '';
  sc.vals.forEach(v => {
    g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="#e1e6eb"/>` +
         `<text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`;
  });
  const every = Math.ceil(n / 8);
  labels.forEach((l, i) => {
    if (i % every === 0) g += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${Charts.esc(l)}</text>`;
  });
  if (splitAt !== null) {
    g += `<rect x="${x(splitAt) - 0.5}" y="${m.t}" width="${W - m.r - x(splitAt) + 0.5}" height="${H - m.t - m.b}" fill="#0f766e" opacity=".06"/>`;
  }
  series.forEach(s => {
    let d = '', pen = false;
    s.values.forEach((v, i) => {
      if (v === null || v === undefined) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true;
    });
    g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2}" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''} stroke-linejoin="round"/>`;
  });
  // พื้นที่โปร่งใสสำหรับ tooltip (hover ดูค่าแต่ละวัน)
  const bw = (W - m.l - m.r) / Math.max(n - 1, 1);
  labels.forEach((l, i) => {
    const tip = [l].concat(series.filter(s => s.values[i] !== null && s.values[i] !== undefined)
      .map(s => `${s.name}: ${fmt(+s.values[i].toFixed(1))}`)).join('\n');
    g += `<rect x="${x(i) - bw / 2}" y="${m.t}" width="${bw}" height="${H - m.t - m.b}" fill="transparent"><title>${Charts.esc(tip)}</title></rect>`;
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">${g}</svg>` + Charts.legend(series);
};

Charts.legend = series =>
  `<div class="legend">${series.map(s =>
    `<span><i style="background:${s.color}"></i>${Charts.esc(s.name)}</span>`).join('')}</div>`;
