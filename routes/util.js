// ตัวช่วยตรวจค่าที่รับจากผู้ใช้ และจัดการ error ของ route
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// ตรวจว่าเป็นตัวเลข (และเป็นจำนวนเต็มถ้า int) อยู่ในช่วง min..max
function num(value, label, { min = 0, max = 1e9, int = false } = {}) {
  const n = typeof value === 'string' && value.trim() === '' ? NaN : Number(value);
  if (!Number.isFinite(n)) throw new HttpError(400, `${label} ต้องเป็นตัวเลข`);
  if (int && !Number.isInteger(n)) throw new HttpError(400, `${label} ต้องเป็นจำนวนเต็ม`);
  if (n < min || n > max) throw new HttpError(400, `${label} ต้องอยู่ระหว่าง ${min} ถึง ${max}`);
  return n;
}

// ตรวจวันที่รูปแบบ yyyy-mm-dd ที่มีอยู่จริง
function dateStr(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new HttpError(400, `${label} ต้องเป็นวันที่รูปแบบ yyyy-mm-dd`);
  const d = new Date(value + 'T00:00:00Z');
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) throw new HttpError(400, `${label} ไม่ใช่วันที่ที่ถูกต้อง`);
  return value;
}

// ครอบ route แบบ async ให้ส่ง JSON error กลับเสมอ
const handle = fn => async (req, res) => {
  try { await fn(req, res); }
  catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err.number === 547) return res.status(409).json({ error: 'ลบ/แก้ไม่ได้ เพราะมีข้อมูลอื่นอ้างอิงอยู่ (เช่น โปรโมชั่นหรือรายการขาย)' });
    res.status(500).json({ error: err.message });
  }
};

module.exports = { HttpError, num, dateStr, handle };
