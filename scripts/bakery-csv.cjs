// อ่านไฟล์ Bakery sales.csv (Kaggle: French bakery daily sales) แบบไม่ใช้ไลบรารีเพิ่ม
// คอลัมน์: (index), date, time, ticket_number, article, Quantity, unit_price
// unit_price เป็นข้อความแบบยุโรป เช่น "0,90 €" → 0.9
// กรองตามขอบเขตเดียวกับ docs/csv-audit.md: เฉพาะสินค้าที่เลือก และ Quantity > 0

// แยกหนึ่งบรรทัด CSV โดยรองรับฟิลด์ในเครื่องหมายคำพูดที่มีจุลภาคอยู่ข้างใน
function splitCsvLine(line) {
  const out = [];
  let cur = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

// "1,20 €" → 1.2 ; คืน NaN ถ้าอ่านไม่ได้
function parseEuro(text) {
  return Number(String(text).replace(/[€\s]/g, '').replace(',', '.'));
}

// คืน { rows, stats } — rows = รายการขายที่ผ่านตัวกรอง พร้อม sold_at แบบ 'yyyy-mm-dd hh:mi:ss'
function parseBakeryCsv(text, articles) {
  const wanted = new Set(articles);
  const lines = text.split(/\r?\n/);
  const header = splitCsvLine(lines[0]).map(h => h.trim());
  const col = name => header.indexOf(name);
  const iDate = col('date'), iTime = col('time'), iTicket = col('ticket_number'),
        iArticle = col('article'), iQty = col('Quantity'), iPrice = col('unit_price');
  if ([iDate, iTime, iTicket, iArticle, iQty, iPrice].some(i => i < 0)) {
    throw new Error(`หัวคอลัมน์ไม่ตรงกับ Bakery sales.csv: ${header.join(', ')}`);
  }
  const stats = { allRows: 0, selectedRows: 0, nonPositive: 0, badRows: 0, minDate: null, maxDate: null, articles: new Set() };
  const rows = [];
  for (let n = 1; n < lines.length; n++) {
    if (!lines[n].trim()) continue;
    const f = splitCsvLine(lines[n]);
    stats.allRows++;
    stats.articles.add(f[iArticle]);
    if (!wanted.has(f[iArticle])) continue;
    stats.selectedRows++;
    const qty = Number(f[iQty]), price = parseEuro(f[iPrice]);
    const date = f[iDate], time = f[iTime].length === 5 ? `${f[iTime]}:00` : f[iTime];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}:\d{2}$/.test(time) || !Number.isFinite(qty) || !Number.isFinite(price)) { stats.badRows++; continue; }
    if (qty <= 0) { stats.nonPositive++; continue; }
    if (!stats.minDate || date < stats.minDate) stats.minDate = date;
    if (!stats.maxDate || date > stats.maxDate) stats.maxDate = date;
    // receipt_no ในตารางยาวได้ 20 ตัว เลขบิลในไฟล์เป็นตัวเลขทศนิยมเช่น 150040.0
    rows.push({ receipt_no: String(f[iTicket]).replace(/\.0$/, '').slice(0, 20), sold_at: `${date} ${time}`, article: f[iArticle], qty, unit_price: price });
  }
  stats.distinctArticles = stats.articles.size;
  delete stats.articles;
  return { rows, stats };
}

module.exports = { splitCsvLine, parseEuro, parseBakeryCsv };
